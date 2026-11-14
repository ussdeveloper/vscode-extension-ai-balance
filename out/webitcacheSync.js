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
exports.WebitcacheClient = exports.WEBITCACHE_TOKEN_SECRET = exports.WEBITCACHE_DEFAULT_TOKEN = exports.WEBITCACHE_DEFAULT_URL = void 0;
const vscode = __importStar(require("vscode"));
/** Built-in webitcache endpoint and token — never exposed in the Settings UI. */
exports.WEBITCACHE_DEFAULT_URL = 'https://webitcache.analogbrain.com';
exports.WEBITCACHE_DEFAULT_TOKEN = 'w-_TFrOQBwU_7mVJOOC7cvKWxAl_4raI6YEBW2Tsx7U';
/** SecretStorage key for the optional user-provided (masked) token override. */
exports.WEBITCACHE_TOKEN_SECRET = 'aiBalance.webitcacheToken';
/**
 * Resolves endpoint + token. Precedence:
 *   1. SecretStorage override (entered through a masked prompt — never displayed),
 *   2. legacy plain-text `aiBalance.dailyCosts.remoteToken` from settings.json
 *      (no longer contributed to the Settings UI, kept for compatibility),
 *   3. the built-in token.
 * Leaving `aiBalance.dailyCosts.remoteUrl` empty disables remote sync.
 */
function resolveConfig(tokenOverride) {
    const config = vscode.workspace.getConfiguration('aiBalance');
    const url = config
        .get('dailyCosts.remoteUrl', exports.WEBITCACHE_DEFAULT_URL)
        .trim()
        .replace(/\/+$/, '');
    if (!url) {
        return null;
    }
    const legacy = config.get('dailyCosts.remoteToken', '').trim();
    const token = tokenOverride.trim() || legacy || exports.WEBITCACHE_DEFAULT_TOKEN;
    return { url, token };
}
async function post(path, body, tokenOverride) {
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
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
class WebitcacheClient {
    tokenOverride;
    /** @param tokenOverride returns the SecretStorage token ('' = use built-in). */
    constructor(tokenOverride = () => '') {
        this.tokenOverride = tokenOverride;
    }
    /**
     * Reads the newest 10 entries and merges today's (UTC) state:
     * the EARLIEST day-start wins (a computer that starts later never replaces
     * it) and the lowest balance wins for the day-end estimate.
     * Falls back to `/read` when history is unavailable/empty.
     */
    async pull(today) {
        let entries = [];
        const history = await post('/history', {}, this.tokenOverride());
        if (history === null) {
            // Service unreachable or token rejected — the caller should not push either
            return { ok: false, snapshot: null };
        }
        if (Array.isArray(history)) {
            entries = history;
        }
        else if (history && Array.isArray(history.entries)) {
            entries = history.entries;
        }
        if (entries.length === 0) {
            const latest = await post('/read', {}, this.tokenOverride());
            if (latest && typeof latest.data === 'string') {
                entries = [latest];
            }
        }
        const merged = { v: 2, d: today, p: {} };
        for (const entry of entries) {
            if (!entry || typeof entry.data !== 'string') {
                continue;
            }
            let snapshot;
            try {
                snapshot = JSON.parse(entry.data);
            }
            catch {
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
                if (state.l !== undefined &&
                    (current.l === undefined ||
                        state.l < current.l ||
                        (state.l === current.l && (state.t ?? 0) > (current.t ?? 0)))) {
                    current.l = state.l;
                    current.t = state.t;
                }
            }
        }
        return { ok: true, snapshot: Object.keys(merged.p).length > 0 ? merged : null };
    }
    /** Publishes the merged UTC-day state (ignored when over the 255-char limit). */
    async push(snapshot) {
        const data = JSON.stringify(snapshot);
        if (data.length <= 255) {
            await post('/save', { data }, this.tokenOverride());
        }
    }
}
exports.WebitcacheClient = WebitcacheClient;
//# sourceMappingURL=webitcacheSync.js.map