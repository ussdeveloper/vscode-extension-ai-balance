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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
const currencyConverter_js_1 = require("./currencyConverter.js");
const peakUtils_js_1 = require("./peakUtils.js");
class StatusBarManager {
    statusBarItem;
    provider;
    currencyConverter;
    constructor(provider) {
        this.provider = provider;
        this.currencyConverter = new currencyConverter_js_1.CurrencyConverter();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'aiBalance.configure';
        this.statusBarItem.tooltip = 'AI Balance — click to open settings';
        this.updateVisibility();
    }
    updateVisibility() {
        const show = vscode.workspace.getConfiguration('aiBalance').get('display.showInStatusBar', true);
        if (show) {
            this.statusBarItem.show();
        }
        else {
            this.statusBarItem.hide();
        }
    }
    async refresh() {
        const config = vscode.workspace.getConfiguration('aiBalance');
        const show = config.get('display.showInStatusBar', true);
        if (!show) {
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.show();
        const color = config.get('display.color', '#D4A017');
        this.statusBarItem.color = color && color.trim() ? color : undefined;
        this.statusBarItem.text = '$(sync~spin) ...';
        this.statusBarItem.tooltip = 'Fetching balances...';
        const results = await this.provider.fetchAll();
        const targetCurrency = vscode.workspace.getConfiguration('aiBalance').get('display.currency', 'USD');
        const currencySymbol = currencyConverter_js_1.CurrencyConverter.getSymbol(targetCurrency);
        if (results.length === 0) {
            this.statusBarItem.text = '$(warning) No providers';
            this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
            return;
        }
        const isPeak = (0, peakUtils_js_1.isDeepSeekPeakHours)();
        const peakIndicator = isPeak ? '🔴' : '🟢';
        const parts = [peakIndicator];
        const tooltipLines = [];
        for (const r of results) {
            if (r.error && r.balance === null) {
                parts.push(`${this.shortName(r.name)} $(warning)`);
                tooltipLines.push(`${r.name}: ${r.error}`);
            }
            else if (r.balance !== null) {
                if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
                    // OpenRouter with budget: show percentage used
                    const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
                    parts.push(`${this.shortName(r.name)} ${pct}%`);
                    tooltipLines.push(`${r.name}: $${r.balance.toFixed(4)} used of $${r.total.toFixed(4)} budget (${pct}%)`);
                }
                else {
                    // DeepSeek or pay-as-you-go: show amount
                    const converted = await this.currencyConverter.convert(r.balance, targetCurrency);
                    const formatted = this.formatBalance(converted.amount, currencySymbol);
                    parts.push(`${this.shortName(r.name)} ${formatted}`);
                    const usdStr = `$${r.balance.toFixed(4)}`;
                    const convStr = `${currencySymbol}${converted.amount.toFixed(4)}`;
                    if (targetCurrency !== 'USD') {
                        tooltipLines.push(`${r.name}: ${usdStr} (${convStr}, rate: ${converted.rate.toFixed(4)})`);
                    }
                    else {
                        tooltipLines.push(`${r.name}: ${usdStr}`);
                    }
                    if (r.total !== null && r.total > 0 && r.total !== r.balance) {
                        const pct = ((r.balance / r.total) * 100).toFixed(1);
                        tooltipLines[tooltipLines.length - 1] += ` of $${r.total.toFixed(4)} (${pct}% remaining)`;
                    }
                }
            }
        }
        this.statusBarItem.text = parts.join(' ');
        const peakInfo = isPeak
            ? '🔴 DeepSeek: PEAK HOURS (2× cena)'
            : '🟢 DeepSeek: standardowa cena';
        this.statusBarItem.tooltip = tooltipLines.join('\n') +
            '\n---\n' + peakInfo +
            '\n' + (0, peakUtils_js_1.getPeakHoursDescription)().split('\n').slice(1).join('\n') +
            '\n---\nClick to open settings\nUse "AI Balance: Set ... Key" commands to add API keys';
    }
    shortName(name) {
        switch (name) {
            case 'DeepSeek': return '$(hubot)';
            case 'OpenRouter': return '$(radio-tower)';
            default: return name.substring(0, 2);
        }
    }
    formatBalance(value, _symbol) {
        // Show just the number without currency symbol
        return value.toFixed(2);
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBarManager.js.map