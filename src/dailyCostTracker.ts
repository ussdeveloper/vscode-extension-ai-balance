import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { RemoteProviderState, RemoteSnapshot, WebitcacheClient } from './webitcacheSync.js';

/**
 * Daily cost tracking based on balance snapshots.
 *
 * Day boundaries are ALWAYS UTC (00:00 UTC) — never the machine's local
 * midnight — so every computer agrees on which day a reading belongs to.
 *
 * The API only exposes the CURRENT balance, so each UTC day we persist:
 *   - the first observed metric (startMetric/startAt) = the day-start balance,
 *   - the latest observed metric (lastMetric/lastAt),
 *   - the lowest observed balance (dayMinBalance/dayMinAt).
 * Money spent that day = day-start − lowest, or for cumulative usage counters:
 * usage(end) − usage(start). Top-ups can skew balance-based values, which is
 * why cumulative `usage` is preferred when a provider has it.
 *
 * Cross-computer sync (webitcache and/or `aiBalance.dailyCosts.sharedFilePath`):
 *   - the computer that reads first in the UTC day publishes its balance as
 *     the day-start,
 *   - a computer that starts later finds that entry, does NOT publish its own
 *     balance, adopts the stored day-start and only adds its own observations.
 * The earliest day-start wins, the lowest balance wins — so all machines show
 * the same daily spend. Conflict copies created by cloud clients (e.g.
 * `daily-costs (1).json`, `daily-costs-<PC>.json`) are merged as well.
 */

export type MetricKind = 'usage' | 'balance';

export interface DailyCostRecord {
	/** UTC date key (00:00 UTC boundary), e.g. "2026-11-14". */
	date: string;
	/** Earliest observed metric value of the day. */
	startMetric: number;
	/** Epoch ms of the earliest observation. */
	startAt: number;
	/** Latest observed metric value of the day. */
	lastMetric: number;
	/** Epoch ms of the latest observation. */
	lastAt: number;
	/** How the metric is interpreted (usage grows, balance shrinks). */
	metricKind: MetricKind;
	/** Balance (USD) at the earliest observation of the day. */
	startBalance?: number;
	/** Balance (USD) at the latest observation of the day. */
	lastBalance?: number;
	/** Manually entered day-start balance (USD) — overrides the automatic baseline. */
	manualStartBalance?: number;
	/** Epoch ms when the manual override was set. */
	manualStartAt?: number;
	/** Lowest balance (USD) observed during the day. */
	dayMinBalance?: number;
	/** Epoch ms when the lowest balance was observed. */
	dayMinAt?: number;
}

export interface DailyCostDay {
	date: string;
	label: string;
	total: number;
	byProvider: Record<string, number>;
}

interface ProviderCosts {
	records: Record<string, DailyCostRecord>;
}

interface StoredCosts {
	version: 2;
	providers: Record<string, ProviderCosts>;
}

const STORAGE_KEY = 'aiBalance.dailyCosts.v2';
const RETENTION_DAYS = 180;

function emptyStore(): StoredCosts {
	return { version: 2, providers: {} };
}

function pad2(value: number): string {
	return value.toString().padStart(2, '0');
}

/** UTC date key — the day boundary is 00:00 UTC on every machine. */
function utcDateKey(date: Date): string {
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Stable string used to detect whether the shared state actually changed. */
function snapshotSignature(snapshot: RemoteSnapshot): string {
	return Object.keys(snapshot.p)
		.sort()
		.map((key) => {
			const state = snapshot.p[key];
			return `${key}:${state.s}/${state.a}/${state.l ?? ''}/${state.t ?? ''}`;
		})
		.join('|');
}

/** Money spent during the day according to a single record. */
export function spentUsd(record: DailyCostRecord): number {
	if (record.metricKind === 'usage') {
		return Math.max(record.lastMetric - record.startMetric, 0);
	}
	// Lowest balance of the day (shared across computers) is the day's end value
	const start = record.manualStartBalance ?? record.startBalance ?? record.startMetric;
	const end = record.dayMinBalance ?? record.lastBalance ?? record.lastMetric;
	return Math.max(start - end, 0);
}

/**
 * Merges two observations of the same day: earliest start wins,
 * latest end wins. Records with different metric kinds are not mixed.
 */
function mergeRecords(a: DailyCostRecord, b: DailyCostRecord): DailyCostRecord {
	if (a.metricKind !== b.metricKind) {
		const chosen = { ...(a.startAt <= b.startAt ? a : b) };
		const other = a.startAt <= b.startAt ? b : a;
		if (
			other.dayMinBalance !== undefined &&
			(chosen.dayMinBalance === undefined || other.dayMinBalance < chosen.dayMinBalance)
		) {
			chosen.dayMinBalance = other.dayMinBalance;
			chosen.dayMinAt = other.dayMinAt;
		}
		return chosen;
	}

	const start = a.startAt <= b.startAt ? a : b;
	const last = a.lastAt >= b.lastAt ? a : b;
	const manual = [a, b]
		.filter((r) => r.manualStartBalance !== undefined)
		.sort((x, y) => (y.manualStartAt ?? 0) - (x.manualStartAt ?? 0))[0];

	let dayMinBalance: number | undefined;
	let dayMinAt: number | undefined;
	for (const record of [a, b]) {
		if (record.dayMinBalance === undefined) {
			continue;
		}
		const at = record.dayMinAt ?? 0;
		if (
			dayMinBalance === undefined ||
			record.dayMinBalance < dayMinBalance ||
			(record.dayMinBalance === dayMinBalance && at > (dayMinAt ?? 0))
		) {
			dayMinBalance = record.dayMinBalance;
			dayMinAt = at;
		}
	}

	return {
		date: start.date,
		metricKind: start.metricKind,
		startMetric: start.startMetric,
		startAt: start.startAt,
		lastMetric: last.lastMetric,
		lastAt: last.lastAt,
		startBalance: start.startBalance ?? (start.metricKind === 'balance' ? start.startMetric : undefined),
		lastBalance: last.lastBalance ?? (last.metricKind === 'balance' ? last.lastMetric : undefined),
		dayMinBalance,
		dayMinAt,
		manualStartBalance: manual?.manualStartBalance,
		manualStartAt: manual?.manualStartAt
	};
}

function mergeStores(a: StoredCosts, b: StoredCosts): StoredCosts {
	const out = emptyStore();
	const providers = new Set([...Object.keys(a.providers), ...Object.keys(b.providers)]);

	for (const provider of providers) {
		const records: Record<string, DailyCostRecord> = {};
		const dates = new Set([
			...Object.keys(a.providers[provider]?.records ?? {}),
			...Object.keys(b.providers[provider]?.records ?? {})
		]);

		for (const date of dates) {
			const left = a.providers[provider]?.records[date];
			const right = b.providers[provider]?.records[date];
			if (left && right) {
				records[date] = mergeRecords(left, right);
			} else if (left ?? right) {
				records[date] = (left ?? right) as DailyCostRecord;
			}
		}

		out.providers[provider] = { records };
	}

	return out;
}

export class DailyCostTracker {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly remote?: WebitcacheClient
	) {}

	private load(): StoredCosts {
		const stored = this.context.globalState.get<StoredCosts>(STORAGE_KEY);
		if (!stored || stored.version !== 2 || !stored.providers) {
			return emptyStore();
		}
		return stored;
	}

	/** Records the current observation for a provider (call after every balance refresh). */
	async track(providerKey: string, metric: number, kind: MetricKind, balanceUsd?: number): Promise<void> {
		if (!Number.isFinite(metric)) {
			return;
		}

		const store = this.load();
		const today = utcDateKey(new Date());
		const now = Date.now();

		const provider = store.providers[providerKey] ?? { records: {} };
		store.providers[providerKey] = provider;

		const existing = provider.records[today];
		if (!existing || existing.metricKind !== kind) {
			provider.records[today] = {
				date: today,
				startMetric: metric,
				startAt: now,
				lastMetric: metric,
				lastAt: now,
				metricKind: kind,
				startBalance: balanceUsd,
				lastBalance: balanceUsd,
				dayMinBalance: balanceUsd,
				dayMinAt: balanceUsd !== undefined ? now : undefined,
				// preserve a manual override when the metric kind changes
				manualStartBalance: existing?.manualStartBalance,
				manualStartAt: existing?.manualStartAt
			};
		} else {
			if (now < existing.startAt) {
				existing.startMetric = metric;
				existing.startAt = now;
				if (balanceUsd !== undefined) {
					existing.startBalance = balanceUsd;
				}
			}
			existing.lastMetric = metric;
			existing.lastAt = now;
			if (balanceUsd !== undefined) {
				if (existing.startBalance === undefined) {
					existing.startBalance = balanceUsd;
				}
				existing.lastBalance = balanceUsd;
				if (
					existing.dayMinBalance === undefined ||
					balanceUsd < existing.dayMinBalance ||
					(balanceUsd === existing.dayMinBalance && now > (existing.dayMinAt ?? 0))
				) {
					existing.dayMinBalance = balanceUsd;
					existing.dayMinAt = now;
				}
			}
		}

		this.prune(provider, new Date());
		await this.context.globalState.update(STORAGE_KEY, store);
		await this.syncSharedFile(store);
	}

	/** Sets (or clears with null) a manual day-start balance override for today. */
	async setManualStart(providerKey: string, amountUsd: number | null): Promise<void> {
		const store = this.load();
		const today = utcDateKey(new Date());
		const provider = store.providers[providerKey] ?? { records: {} };
		store.providers[providerKey] = provider;
		let record = provider.records[today];

		if (amountUsd === null) {
			if (!record) {
				return;
			}
			delete record.manualStartBalance;
			delete record.manualStartAt;
		} else {
			if (!record) {
				const now = Date.now();
				record = {
					date: today,
					startMetric: amountUsd,
					startAt: now,
					lastMetric: amountUsd,
					lastAt: now,
					metricKind: 'balance',
					startBalance: amountUsd,
					lastBalance: amountUsd
				};
				provider.records[today] = record;
			}
			record.manualStartBalance = amountUsd;
			record.manualStartAt = Date.now();
		}

		await this.context.globalState.update(STORAGE_KEY, store);
		await this.syncSharedFile(store);
	}

	private prune(provider: ProviderCosts, now: Date): void {
		const cutoff = new Date(now);
		cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
		const cutoffKey = utcDateKey(cutoff);
		for (const key of Object.keys(provider.records)) {
			if (key < cutoffKey) {
				delete provider.records[key];
			}
		}
	}

	/** Today's estimated spend for a provider (null when no reading was recorded today). */
	getToday(providerKey: string): {
		spentUsd: number;
		startAt: number;
		manual: boolean;
		manualStartBalance?: number;
	} | null {
		const record = this.load().providers[providerKey]?.records[utcDateKey(new Date())];
		return record
			? {
					spentUsd: spentUsd(record),
					startAt: record.startAt,
					manual: record.manualStartBalance !== undefined,
					manualStartBalance: record.manualStartBalance
				}
			: null;
	}

	/** Sum of estimated spend for the current UTC calendar month. */
	getMonth(providerKey: string): number {
		const prefix = utcDateKey(new Date()).slice(0, 7); // YYYY-MM
		const records = this.load().providers[providerKey]?.records ?? {};
		let total = 0;
		for (const [key, record] of Object.entries(records)) {
			if (key.startsWith(prefix)) {
				total += spentUsd(record);
			}
		}
		return total;
	}

	/** Snapshot of today's (UTC) day-start and lowest balances, ready to push to webitcache. */
	buildTodaySnapshot(): RemoteSnapshot | null {
		const today = utcDateKey(new Date());
		const store = this.load();
		const providers: Record<string, RemoteProviderState> = {};

		for (const [key, data] of Object.entries(store.providers)) {
			const record = data.records[today];
			if (!record) {
				continue;
			}
			const start =
				record.manualStartBalance ??
				record.startBalance ??
				(record.metricKind === 'balance' ? record.startMetric : undefined);
			if (start === undefined || !Number.isFinite(start) || !Number.isFinite(record.startAt)) {
				continue;
			}
			const state: RemoteProviderState = { s: start, a: record.startAt };
			const lowest = record.dayMinBalance ?? record.lastBalance;
			if (lowest !== undefined && Number.isFinite(lowest)) {
				state.l = lowest;
				state.t = record.dayMinAt ?? record.lastAt;
			}
			providers[key] = state;
		}

		return Object.keys(providers).length > 0 ? { v: 2, d: today, p: providers } : null;
	}

	/**
	 * Merges the shared UTC-day state into the local records: an earlier
	 * day-start from another computer replaces ours (we never push our own
	 * balance over an existing baseline) and the lowest balance wins for the
	 * day-end estimate.
	 */
	async applyRemoteSnapshot(snapshot: RemoteSnapshot | null): Promise<void> {
		if (!snapshot) {
			return;
		}
		const today = utcDateKey(new Date());
		if (snapshot.d !== today) {
			return;
		}

		const store = this.load();
		let changed = false;

		for (const [provider, remote] of Object.entries(snapshot.p)) {
			if (!remote || !Number.isFinite(remote.s) || !Number.isFinite(remote.a)) {
				continue;
			}

			const providerStore = store.providers[provider] ?? { records: {} };
			store.providers[provider] = providerStore;
		let record = providerStore.records[today];

			if (!record) {
				record = {
					date: today,
					startMetric: remote.s,
					startAt: remote.a,
					lastMetric: remote.s,
					lastAt: remote.a,
					metricKind: 'balance',
					startBalance: remote.s,
					lastBalance: remote.s
				};
				providerStore.records[today] = record;
				changed = true;
			} else if (remote.a < record.startAt && record.metricKind === 'balance') {
				// Another computer was first in this UTC day — adopt its baseline
				record.startMetric = remote.s;
				record.startAt = remote.a;
				record.startBalance = remote.s;
				changed = true;
			}

			const lowest = remote.l;
			if (
				lowest !== undefined &&
				Number.isFinite(lowest) &&
				(record.dayMinBalance === undefined ||
					lowest < record.dayMinBalance ||
					(lowest === record.dayMinBalance && (remote.t ?? 0) > (record.dayMinAt ?? 0)))
			) {
				record.dayMinBalance = lowest;
				record.dayMinAt = remote.t;
				changed = true;
			}
		}

		if (changed) {
			await this.context.globalState.update(STORAGE_KEY, store);
			await this.syncSharedFile(store);
		}
	}

	/**
	 * Pulls the shared state, merges it locally, then publishes the merged UTC-day
	 * state — but only when it actually differs from what is already stored, so a
	 * computer that wakes up after another one keeps the existing day-start
	 * instead of overwriting it with its own balance.
	 */
	async syncRemote(): Promise<void> {
		if (!this.remote) {
			return;
		}
		const today = utcDateKey(new Date());
		const remote = await this.remote.pull(today);
		if (!remote.ok) {
			return; // service unreachable / token rejected — skip push
		}
		await this.applyRemoteSnapshot(remote.snapshot);
		const snapshot = this.buildTodaySnapshot();
		if (!snapshot) {
			return;
		}
		if (remote.snapshot && snapshotSignature(remote.snapshot) === snapshotSignature(snapshot)) {
			return; // unchanged — leave the stored entry untouched
		}
		await this.remote.push(snapshot);
	}

	/** Daily totals for the last `days` UTC days (oldest first), summed across providers. */
	getRecentDays(days: number): DailyCostDay[] {
		const store = this.load();
		const result: DailyCostDay[] = [];
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		for (let offset = days - 1; offset >= 0; offset--) {
			const day = new Date(today);
			day.setUTCDate(day.getUTCDate() - offset);
			const key = utcDateKey(day);

			const byProvider: Record<string, number> = {};
			let total = 0;
			for (const [provider, data] of Object.entries(store.providers)) {
				const record = data.records[key];
				if (record) {
					const value = spentUsd(record);
					byProvider[provider] = value;
					total += value;
				}
			}

			result.push({ date: key, label: String(day.getUTCDate()), total, byProvider });
		}

		return result;
	}

	private sharedFilePath(): string | undefined {
		const raw = vscode.workspace
			.getConfiguration('aiBalance')
			.get<string>('dailyCosts.sharedFilePath', '')
			.trim();
		if (!raw) {
			return undefined;
		}
		if (raw.startsWith('~')) {
			return path.join(os.homedir(), raw.slice(1));
		}
		return raw;
	}

	/**
	 * Reads the shared file plus any cloud conflict copies in the same folder
	 * (OneDrive: `daily-costs-<PC>.json`, Dropbox: `daily-costs (conflicted
	 * copy).json`, Google Drive: `daily-costs (1).json`) and merges them.
	 */
	private async readRemoteStore(file: string): Promise<StoredCosts> {
		const candidates = [file];
		try {
			const dir = path.dirname(file);
			const base = path.parse(file);
			const entries = await fs.readdir(dir);
			for (const entry of entries) {
				if (entry === base.base || entry.endsWith('.tmp')) {
					continue;
				}
				if (!entry.toLowerCase().endsWith('.json') || !entry.startsWith(base.name)) {
					continue;
				}
				candidates.push(path.join(dir, entry));
			}
		} catch {
			// Directory does not exist yet — main file will be created on write
		}

		let merged = emptyStore();
		for (const candidate of candidates) {
			try {
				const text = await fs.readFile(candidate, 'utf8');
				const parsed = JSON.parse(text) as StoredCosts;
				if (parsed && parsed.version === 2 && parsed.providers) {
					merged = mergeStores(merged, parsed);
				}
			} catch {
				// Missing/corrupt file — skip it
			}
		}

		return merged;
	}

	/**
	 * Merges local records with the shared file (if configured) and writes the
	 * merged result back. Uses write-to-temp + rename to minimise partial reads.
	 */
	private async syncSharedFile(local: StoredCosts): Promise<void> {
		const file = this.sharedFilePath();
		if (!file) {
			return;
		}

		try {
			const remote = await this.readRemoteStore(file);

			const merged = mergeStores(local, remote);

			await fs.mkdir(path.dirname(file), { recursive: true });
			const tmp = `${file}.${process.pid}.tmp`;
			await fs.writeFile(tmp, JSON.stringify(merged, null, 2), 'utf8');
			await fs.rename(tmp, file);

			// Pull remote observations (e.g. an earlier day-start from another machine)
			const mergedWithLocal = mergeStores(this.load(), merged);
			await this.context.globalState.update(STORAGE_KEY, mergedWithLocal);
		} catch (err) {
			console.warn('AI Balance: shared daily-costs sync failed:', err);
		}
	}
}
