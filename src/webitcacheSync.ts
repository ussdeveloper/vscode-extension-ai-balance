import * as vscode from 'vscode';

/**
 * webitcache (https://webitcache.analogbrain.com) client.
 *
 * The service stores one small JSON value per account (≤255 chars) plus the
 * last 10 entries with UTC timestamps. We use it to share the LOWEST balance
 * observed during the day across all computers using the same token.
 *
 * Endpoints (all POST, Bearer token):
 *   /webitcache/save    { data: "<string ≤255>" }
 *   /webitcache/read    {} → { data, timestamp } | { detail: "no entries" }
 *   /webitcache/history {} → [ { data, timestamp }, ... ] newest first
 */

export interface RemoteProviderState {
	/** Lowest balance observed today (USD). */
	m: number;
	/** Epoch ms when that lowest balance was observed. */
	t: number;
}

export interface RemoteSnapshot {
	v: 1;
	/** Local date key, e.g. "2026-11-14". */
	date: string;
	/** Per-provider lowest balance of the day. */
	p: Record<string, RemoteProviderState>;
}

interface CacheEntry {
	data?: string;
	timestamp?: string;
}

function settings(): { url: string; token: string } | null {
	const config = vscode.workspace.getConfiguration('aiBalance');
	const url = config.get<string>('dailyCosts.remoteUrl', '').trim().replace(/\/+$/, '');
	const token = config.get<string>('dailyCosts.remoteToken', '').trim();
	if (!url || !token) {
		return null;
	}
	return { url, token };
}

async function post(path: string, body: unknown): Promise<any | null> {
	const cfg = settings();
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
	/**
	 * Reads the newest 10 entries and merges today's state:
	 * the lowest balance wins; on equal values the newer timestamp wins.
	 * Falls back to `/read` when history is unavailable/empty.
	 */
	async pull(today: string): Promise<{ ok: boolean; snapshot: RemoteSnapshot | null }> {
		let entries: CacheEntry[] = [];

		const history = await post('/history', {});
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
			const latest = await post('/read', {});
			if (latest && typeof latest.data === 'string') {
				entries = [latest];
			}
		}

		const merged: RemoteSnapshot = { v: 1, date: today, p: {} };

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

			if (!snapshot || snapshot.v !== 1 || snapshot.date !== today || !snapshot.p) {
				continue;
			}

			for (const [provider, state] of Object.entries(snapshot.p)) {
				if (!state || !Number.isFinite(state.m) || !Number.isFinite(state.t)) {
					continue;
				}
				const current = merged.p[provider];
				if (!current || state.m < current.m || (state.m === current.m && state.t > current.t)) {
					merged.p[provider] = { m: state.m, t: state.t };
				}
			}
		}

		return { ok: true, snapshot: Object.keys(merged.p).length > 0 ? merged : null };
	}

	/** Pushes today's lowest-balance snapshot (ignored when over the 255-char limit). */
	async push(snapshot: RemoteSnapshot): Promise<void> {
		const data = JSON.stringify(snapshot);
		if (data.length <= 255) {
			await post('/save', { data });
		}
	}
}
