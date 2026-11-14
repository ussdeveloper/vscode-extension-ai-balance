import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Daily cost tracking based on balance snapshots.
 *
 * The API only exposes the CURRENT balance, so each day we persist:
 *   - the earliest observed metric (startMetric/startAt),
 *   - the latest observed metric (lastMetric/lastAt).
 * Money spent that day = balance(start) − balance(end), or for cumulative
 * usage counters: usage(end) − usage(start). Top-ups can skew balance-based
 * values, which is why cumulative `usage` is preferred when a provider has it.
 *
 * Optional cross-computer sync: when `aiBalance.dailyCosts.sharedFilePath`
 * points to a JSON file in a synced folder (OneDrive/Dropbox/network share),
 * all machines using the same API key merge their observations. The earliest
 * day-start wins, the latest day-end wins — so every machine agrees on the
 * daily spend even if only one of them was running at midnight. Conflict
 * copies created by cloud clients (e.g. `daily-costs (1).json`,
 * `daily-costs-<PC>.json`) are detected and merged as well.
 */

export type MetricKind = 'usage' | 'balance';

export interface DailyCostRecord {
	/** Local date key, e.g. "2026-11-14". */
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

function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Money spent during the day according to a single record. */
export function spentUsd(record: DailyCostRecord): number {
	if (record.manualStartBalance !== undefined && record.lastBalance !== undefined) {
		return Math.max(record.manualStartBalance - record.lastBalance, 0);
	}
	if (record.metricKind === 'usage') {
		return Math.max(record.lastMetric - record.startMetric, 0);
	}
	const start = record.startBalance ?? record.startMetric;
	const last = record.lastBalance ?? record.lastMetric;
	return Math.max(start - last, 0);
}

/**
 * Merges two observations of the same day: earliest start wins,
 * latest end wins. Records with different metric kinds are not mixed.
 */
function mergeRecords(a: DailyCostRecord, b: DailyCostRecord): DailyCostRecord {
	if (a.metricKind !== b.metricKind) {
		return a.startAt <= b.startAt ? a : b;
	}
	const start = a.startAt <= b.startAt ? a : b;
	const last = a.lastAt >= b.lastAt ? a : b;
	const manual = [a, b]
		.filter((r) => r.manualStartBalance !== undefined)
		.sort((x, y) => (y.manualStartAt ?? 0) - (x.manualStartAt ?? 0))[0];

	return {
		date: start.date,
		metricKind: start.metricKind,
		startMetric: start.startMetric,
		startAt: start.startAt,
		lastMetric: last.lastMetric,
		lastAt: last.lastAt,
		startBalance: start.startBalance ?? (start.metricKind === 'balance' ? start.startMetric : undefined),
		lastBalance: last.lastBalance ?? (last.metricKind === 'balance' ? last.lastMetric : undefined),
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
	constructor(private readonly context: vscode.ExtensionContext) {}

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
		const today = localDateKey(new Date());
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
			}
		}

		this.prune(provider, new Date());
		await this.context.globalState.update(STORAGE_KEY, store);
		await this.syncSharedFile(store);
	}

	/** Sets (or clears with null) a manual day-start balance override for today. */
	async setManualStart(providerKey: string, amountUsd: number | null): Promise<void> {
		const store = this.load();
		const today = localDateKey(new Date());
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
		cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
		const cutoffKey = localDateKey(cutoff);
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
		const record = this.load().providers[providerKey]?.records[localDateKey(new Date())];
		return record
			? {
					spentUsd: spentUsd(record),
					startAt: record.startAt,
					manual: record.manualStartBalance !== undefined,
					manualStartBalance: record.manualStartBalance
				}
			: null;
	}

	/** Sum of estimated spend for the current calendar month. */
	getMonth(providerKey: string): number {
		const prefix = localDateKey(new Date()).slice(0, 7); // YYYY-MM
		const records = this.load().providers[providerKey]?.records ?? {};
		let total = 0;
		for (const [key, record] of Object.entries(records)) {
			if (key.startsWith(prefix)) {
				total += spentUsd(record);
			}
		}
		return total;
	}

	/** Daily totals for the last `days` days (oldest first), summed across providers. */
	getRecentDays(days: number): DailyCostDay[] {
		const store = this.load();
		const result: DailyCostDay[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let offset = days - 1; offset >= 0; offset--) {
			const day = new Date(today);
			day.setDate(day.getDate() - offset);
			const key = localDateKey(day);

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

			result.push({ date: key, label: String(day.getDate()), total, byProvider });
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
