import * as vscode from 'vscode';

/**
 * webitcache (https://webitcache.analogbrain.com) client.
 *
 * The service stores one small JSON value per account (≤255 chars) plus the
 * last 10 entries with UTC timestamps. We use it to share the FIRST balance
 * observed in the current UTC day (the day-start), so every computer computes
 * its daily spend from the same baseline — a machine that wakes up later only
 * reads the stored day-start instead of publishing its own balance.
 *
 * Endpoints (all POST, Bearer token):
 *   /webitcache/save    { data: "<string ≤255>" }
 *   /webitcache/read    {} → { data, timestamp } | { detail: "no entries" }
 *   /webitcache/history {} → [ { data, timestamp }, ... ] newest first
 */

export interface RemoteProviderState {
	/** Day-start balance (USD) — the first observation of the current UTC day. */
	s: number;
	/** Epoch ms of that first observation. */
	a: number;
	/** Lowest balance observed so far that UTC day (USD). */
	l?: number;
	/** Epoch ms of the lowest observation. */
	t?: number;
}

export interface RemoteSnapshot {
	v: 2;
	/** UTC date key (day boundary = 00:00 UTC), e.g. "2026-11-14". */
	d: string;
	/** Per-provider state of the current UTC day. */
	p: Record<string, RemoteProviderState>;
}

interface CacheEntry {
	data?: string;
	timestamp?: string;
}

/** Built-in webitcache endpoint and token — never exposed in the Settings UI. */
export const WEBITCACHE_DEFAULT_URL = 'https://webitcache.analogbrain.com';
export const WEBITCACHE_DEFAULT_TOKEN = 'w-_TFrOQBwU_7mVJOOC7cvKWxAl_4raI6YEBW2Tsx7U';

/** SecretStorage key for the optional user-provided (masked) token override. */
export const WEBITCACHE_TOKEN_SECRET = 'aiBalance.webitcacheToken';

interface CacheConfig {
	url: string;
	token: string;
}

/**
 * Resolves endpoint + token. Precedence:
 *   1. SecretStorage override (entered through a masked prompt — never displayed),
 *   2. legacy plain-text `aiBalance.dailyCosts.remoteToken` from settings.json
 *      (no longer contributed to the Settings UI, kept for compatibility),
 *   3. the built-in token.
 * Leaving `aiBalance.dailyCosts.remoteUrl` empty disables remote sync.
 */
function resolveConfig(tokenOverride: string): CacheConfig | null {
	const config = vscode.workspace.getConfiguration('aiBalance');
	const url = config
		.get<string>('dailyCosts.remoteUrl', WEBITCACHE_DEFAULT_URL)
		.trim()
		.replace(/\/+$/, '');
	if (!url) {
		return null;
	}
	const legacy = config.get<string>('dailyCosts.remoteToken', '').trim();
	const token = tokenOverride.trim() || legacy || WEBITCACHE_DEFAULT_TOKEN;
	return { url, token };
}

async function post(path: string, body: unknown, tokenOverride: string): Promise<any | null> {
	const cfg = resolveConfig(tokenOverride);
	if (!cfg) {
		return null;
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 6000);
	try {
		const response = await fetch(`${cfg.url}/webitcache${path}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfg.token}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify(body),
			signal: controller.signal
		});
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export class WebitcacheClient {
	/** @param tokenOverride returns the SecretStorage token ('' = use built-in). */
	constructor(private readonly tokenOverride: () => string = () => '') {}

	/**
	 * Reads the newest 10 entries and merges today's (UTC) state:
	 * the EARLIEST day-start wins (a computer that starts later never replaces
	 * it) and the lowest balance wins for the day-end estimate.
	 * Falls back to `/read` when history is unavailable/empty.
	 */
	async pull(today: string): Promise<{ ok: boolean; snapshot: RemoteSnapshot | null }> {
		let entries: CacheEntry[] = [];

		const history = await post('/history', {}, this.tokenOverride());
		if (history === null) {
			// Service unreachable or token rejected — the caller should not push either
			return { ok: false, snapshot: null };
		}
		if (Array.isArray(history)) {
			entries = history;
		} else if (history && Array.isArray(history.entries)) {
			entries = history.entries;
		}

		if (entries.length === 0) {
			const latest = await post('/read', {}, this.tokenOverride());
			if (latest && typeof latest.data === 'string') {
				entries = [latest];
			}
		}

		const merged: RemoteSnapshot = { v: 2, d: today, p: {} };

		for (const entry of entries) {
			if (!entry || typeof entry.data !== 'string') {
				continue;
			}

			let snapshot: RemoteSnapshot;
			try {
				snapshot = JSON.parse(entry.data) as RemoteSnapshot;
			} catch {
				continue;
			}

			if (!snapshot || snapshot.v !== 2 || snapshot.d !== today || !snapshot.p) {
				continue; // v1 entries used the lowest-balance-only format
			}

			for (const [provider, state] of Object.entries(snapshot.p)) {
				if (!state || !Number.isFinite(state.s) || !Number.isFinite(state.a)) {
					continue;
				}
				const current = merged.p[provider];
				if (!current) {
					merged.p[provider] = { ...state };
					continue;
				}
				// Day-start: the earliest observation of the UTC day always wins
				if (state.a < current.a) {
					current.s = state.s;
					current.a = state.a;
				}
				// Day-end: the lowest balance wins, ties → newer observation
				if (
					state.l !== undefined &&
					(current.l === undefined ||
						state.l < current.l ||
						(state.l === current.l && (state.t ?? 0) > (current.t ?? 0)))
				) {
					current.l = state.l;
					current.t = state.t;
				}
			}
		}

		return { ok: true, snapshot: Object.keys(merged.p).length > 0 ? merged : null };
	}

	/** Publishes the merged UTC-day state (ignored when over the 255-char limit). */
	async push(snapshot: RemoteSnapshot): Promise<void> {
		const data = JSON.stringify(snapshot);
		if (data.length <= 255) {
			await post('/save', { data }, this.tokenOverride());
		}
	}
}
