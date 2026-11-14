"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyCostTracker = void 0;
exports.spentUsd = spentUsd;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs/promises"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const STORAGE_KEY = 'aiBalance.dailyCosts.v2';
const RETENTION_DAYS = 180;
function emptyStore() {
    return { version: 2, providers: {} };
}
function pad2(value) {
    return value.toString().padStart(2, '0');
}
function localDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
/** Money spent during the day according to a single record. */
function spentUsd(record) {
    const delta = record.metricKind === 'usage'
        ? record.lastMetric - record.startMetric
        : record.startMetric - record.lastMetric;
    return Math.max(delta, 0);
}
/**
 * Merges two observations of the same day: earliest start wins,
 * latest end wins. Records with different metric kinds are not mixed.
 */
function mergeRecords(a, b) {
    if (a.metricKind !== b.metricKind) {
        return a.startAt <= b.startAt ? a : b;
    }
    const start = a.startAt <= b.startAt ? a : b;
    const last = a.lastAt >= b.lastAt ? a : b;
    return {
        date: start.date,
        metricKind: start.metricKind,
        startMetric: start.startMetric,
        startAt: start.startAt,
        lastMetric: last.lastMetric,
        lastAt: last.lastAt
    };
}
function mergeStores(a, b) {
    const out = emptyStore();
    const providers = new Set([...Object.keys(a.providers), ...Object.keys(b.providers)]);
    for (const provider of providers) {
        const records = {};
        const dates = new Set([
            ...Object.keys(a.providers[provider]?.records ?? {}),
            ...Object.keys(b.providers[provider]?.records ?? {})
        ]);
        for (const date of dates) {
            const left = a.providers[provider]?.records[date];
            const right = b.providers[provider]?.records[date];
            if (left && right) {
                records[date] = mergeRecords(left, right);
            }
            else if (left ?? right) {
                records[date] = (left ?? right);
            }
        }
        out.providers[provider] = { records };
    }
    return out;
}
class DailyCostTracker {
    context;
    constructor(context) {
        this.context = context;
    }
    load() {
        const stored = this.context.globalState.get(STORAGE_KEY);
        if (!stored || stored.version !== 2 || !stored.providers) {
            return emptyStore();
        }
        return stored;
    }
    /** Records the current observation for a provider (call after every balance refresh). */
    async track(providerKey, metric, kind) {
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
                metricKind: kind
            };
        }
        else {
            if (now < existing.startAt) {
                existing.startMetric = metric;
                existing.startAt = now;
            }
            existing.lastMetric = metric;
            existing.lastAt = now;
        }
        this.prune(provider, new Date());
        await this.context.globalState.update(STORAGE_KEY, store);
        await this.syncSharedFile(store);
    }
    prune(provider, now) {
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
    getToday(providerKey) {
        const record = this.load().providers[providerKey]?.records[localDateKey(new Date())];
        return record ? { spentUsd: spentUsd(record), startAt: record.startAt } : null;
    }
    /** Sum of estimated spend for the current calendar month. */
    getMonth(providerKey) {
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
    getRecentDays(days) {
        const store = this.load();
        const result = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let offset = days - 1; offset >= 0; offset--) {
            const day = new Date(today);
            day.setDate(day.getDate() - offset);
            const key = localDateKey(day);
            const byProvider = {};
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
    sharedFilePath() {
        const raw = vscode.workspace
            .getConfiguration('aiBalance')
            .get('dailyCosts.sharedFilePath', '')
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
    async readRemoteStore(file) {
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
        }
        catch {
            // Directory does not exist yet — main file will be created on write
        }
        let merged = emptyStore();
        for (const candidate of candidates) {
            try {
                const text = await fs.readFile(candidate, 'utf8');
                const parsed = JSON.parse(text);
                if (parsed && parsed.version === 2 && parsed.providers) {
                    merged = mergeStores(merged, parsed);
                }
            }
            catch {
                // Missing/corrupt file — skip it
            }
        }
        return merged;
    }
    /**
     * Merges local records with the shared file (if configured) and writes the
     * merged result back. Uses write-to-temp + rename to minimise partial reads.
     */
    async syncSharedFile(local) {
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
        }
        catch (err) {
            console.warn('AI Balance: shared daily-costs sync failed:', err);
        }
    }
}
exports.DailyCostTracker = DailyCostTracker;
//# sourceMappingURL=dailyCostTracker.js.map