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
exports.BalanceProvider = void 0;
const vscode = __importStar(require("vscode"));
class BalanceProvider {
    async fetchAll() {
        const results = [];
        const config = vscode.workspace.getConfiguration('aiBalance');
        // DeepSeek
        const dsEnabled = config.get('providers.deepseek.enabled', true);
        if (dsEnabled) {
            const result = await this.fetchDeepSeek(config);
            if (result)
                results.push(result);
        }
        // OpenRouter
        const orEnabled = config.get('providers.openrouter.enabled', true);
        if (orEnabled) {
            const result = await this.fetchOpenRouter(config);
            if (result)
                results.push(result);
        }
        return results;
    }
    async fetchDeepSeek(config) {
        const apiKey = config.get('providers.deepseek.apiKey', '');
        const apiUrl = config.get('providers.deepseek.apiUrl', 'https://api.deepseek.com');
        if (!apiKey) {
            return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: 'No API key' };
        }
        try {
            const response = await fetch(`${apiUrl}/user/balance`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: `HTTP ${response.status}` };
            }
            const data = await response.json();
            const balanceInfo = data.balance_infos?.[0];
            if (balanceInfo) {
                const total = parseFloat(balanceInfo.total_balance || '0');
                return { name: 'DeepSeek', key: 'deepseek', balance: total, total: total };
            }
            return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: 'Unexpected response' };
        }
        catch (err) {
            return { name: 'DeepSeek', key: 'deepseek', balance: null, total: null, error: err.message };
        }
    }
    async fetchOpenRouter(config) {
        const apiKey = config.get('providers.openrouter.apiKey', '');
        const apiUrl = config.get('providers.openrouter.apiUrl', 'https://openrouter.ai/api');
        if (!apiKey) {
            return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: 'No API key' };
        }
        try {
            // Credits endpoint: GET /api/v1/credits
            // Returns: { data: { total_credits: 65, total_usage: 9.57 } }
            const creditsRes = await fetch(`${apiUrl}/v1/credits`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (creditsRes.ok) {
                const creditsData = await creditsRes.json();
                const d = creditsData?.data;
                if (d && typeof d.total_credits === 'number') {
                    const balance = d.total_credits - (d.total_usage ?? 0);
                    return {
                        name: 'OpenRouter',
                        key: 'openrouter',
                        balance,
                        total: null
                    };
                }
            }
            // Fallback: auth/key → { data: { usage, limit } }
            const response = await fetch(`${apiUrl}/v1/auth/key`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: `HTTP ${response.status}` };
            }
            const data = await response.json();
            if (data?.data) {
                const usage = data.data.usage ?? 0;
                const limit = data.data.limit ?? 0;
                const balance = limit > 0 ? limit - usage : usage;
                return {
                    name: 'OpenRouter',
                    key: 'openrouter',
                    balance,
                    total: null
                };
            }
            return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: 'Unexpected response' };
        }
        catch (err) {
            return { name: 'OpenRouter', key: 'openrouter', balance: null, total: null, error: err.message };
        }
    }
}
exports.BalanceProvider = BalanceProvider;
//# sourceMappingURL=balanceProvider.js.map