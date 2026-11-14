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
const pricing_js_1 = require("./pricing.js");
const formatUtils_js_1 = require("./formatUtils.js");
class StatusBarManager {
    statusBarItem;
    provider;
    currencyConverter;
    costTracker;
    tickTimer;
    snapshot = null;
    constructor(provider, costTracker, currencyConverter) {
        this.provider = provider;
        this.costTracker = costTracker;
        this.currencyConverter = currencyConverter;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'aiBalance.openDashboard';
        this.statusBarItem.tooltip = 'AI Balance — click to open dashboard';
        this.updateVisibility();
        // Live countdown tick — pure local re-render from system time, no API calls
        this.tickTimer = setInterval(() => this.render(), 30_000);
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
            this.snapshot = null;
            this.statusBarItem.text = '$(warning) No providers';
            this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
            return;
        }
        const providerParts = [];
        const tooltipLines = [];
        for (const r of results) {
            if (r.error && r.balance === null) {
                providerParts.push(`${this.shortName(r.name)} $(warning)`);
                tooltipLines.push(`${r.name}: ${r.error}`);
            }
            else if (r.balance !== null) {
                if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
                    // OpenRouter with budget: show percentage used
                    const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
                    providerParts.push(`${this.shortName(r.name)} ${pct}%`);
                    tooltipLines.push(`${r.name}: $${r.balance.toFixed(4)} used of $${r.total.toFixed(4)} budget (${pct}%)`);
                }
                else {
                    // DeepSeek or pay-as-you-go: show amount
                    const converted = await this.currencyConverter.convert(r.balance, targetCurrency);
                    const formatted = this.formatBalance(converted.amount, currencySymbol);
                    providerParts.push(`${this.shortName(r.name)} ${formatted}`);
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
        // Track daily cost baselines: first (and latest) balance/usage reading of the day
        for (const r of results) {
            if (r.balance === null) {
                continue;
            }
            const useUsage = typeof r.usage === 'number';
            await this.costTracker.track(r.key, useUsage ? r.usage : r.balance, useUsage ? 'usage' : 'balance');
        }
        const dailyUsageLines = await this.computeDailyUsage(results, targetCurrency, currencySymbol);
        // Today's total cost for the status bar (sum across providers, converted)
        let dailyCostUsd = 0;
        for (const r of results) {
            if (r.balance === null) {
                continue;
            }
            dailyCostUsd += this.costTracker.getToday(r.key)?.spentUsd ?? 0;
        }
        let dailyCostPart = null;
        if (config.get('display.showDailyCost', true)) {
            const converted = await this.currencyConverter.convert(dailyCostUsd, targetCurrency);
            dailyCostPart = `$(calendar) ${StatusBarManager.formatShortAmount(converted.amount)}`;
        }
        this.snapshot = { providerParts, tooltipLines, dailyUsageLines, dailyCostPart };
        this.render();
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
    /** Rebuilds status bar text + tooltip from the stored snapshot (runs on every tick). */
    render() {
        if (!this.snapshot) {
            return;
        }
        const isPeak = (0, peakUtils_js_1.isDeepSeekPeakHours)();
        const isWeekend = (0, peakUtils_js_1.isDeepSeekWeekend)();
        const peakIndicator = isPeak ? '🔴' : '🟢';
        const transition = (0, peakUtils_js_1.getNextPeakTransition)();
        const countdown = (0, peakUtils_js_1.formatCountdown)(transition.minutes);
        const targetTime = (0, peakUtils_js_1.formatTransitionTarget)(transition.at);
        // Countdown next to the peak dot, then provider balances and today's cost
        const textParts = [`${peakIndicator} ${countdown}`, ...this.snapshot.providerParts];
        if (this.snapshot.dailyCostPart) {
            textParts.push(this.snapshot.dailyCostPart);
        }
        this.statusBarItem.text = textParts.join(' ');
        const peakInfo = isPeak
            ? '🔴 DeepSeek: PEAK HOURS (2× cena)'
            : isWeekend
                ? '🟢 DeepSeek: weekend — cały dzień poza szczytem'
                : '🟢 DeepSeek: standardowa cena';
        const countdownInfo = transition.next === 'peak'
            ? `⏳ Do najbliższego peak hours: ${countdown} (${targetTime})`
            : `⏳ Do końca peak hours (off-peak): ${countdown} (${targetTime})`;
        const sections = [...this.snapshot.tooltipLines];
        if (this.snapshot.dailyUsageLines.length > 0) {
            sections.push('---', ...this.snapshot.dailyUsageLines);
        }
        sections.push('---', peakInfo, countdownInfo, (0, peakUtils_js_1.getPeakHoursDescription)().split('\n').slice(1).join('\n'), '---', ...(0, pricing_js_1.getModelPricingLines)(), '---', 'Click the status bar item to open the usage dashboard', 'Use "AI Balance: Set ... Key" commands to add API keys');
        this.statusBarItem.tooltip = sections.join('\n');
    }
    /** Formats a USD cost, converting to the display currency when configured. */
    async formatCost(usd, targetCurrency, currencySymbol) {
        const usdStr = (0, formatUtils_js_1.formatUsdAmount)(usd);
        if (targetCurrency === 'USD') {
            return usdStr;
        }
        const conv = await this.currencyConverter.convert(usd, targetCurrency);
        return `${usdStr} (${currencySymbol}${conv.amount.toFixed(2)})`;
    }
    /**
     * Estimated daily/monthly cost from balance snapshots: the earliest and
     * latest reading of each day (persisted by DailyCostTracker; optionally
     * synced across computers via a shared file). Top-ups can skew values.
     */
    async computeDailyUsage(results, targetCurrency, currencySymbol) {
        const lines = [];
        const monthLabel = StatusBarManager.monthLabel(new Date());
        for (const r of results) {
            if (r.balance === null) {
                continue;
            }
            const today = this.costTracker.getToday(r.key);
            const month = this.costTracker.getMonth(r.key);
            const todayStr = await this.formatCost(today?.spentUsd ?? 0, targetCurrency, currencySymbol);
            const monthStr = await this.formatCost(month, targetCurrency, currencySymbol);
            lines.push(`📊 ${r.name} — dziś: ~${todayStr} · ${monthLabel}: ~${monthStr}`);
        }
        if (lines.length > 0) {
            lines.unshift('Koszty dzienne (od pierwszego odczytu salda dnia):');
            const sharedPath = vscode.workspace
                .getConfiguration('aiBalance')
                .get('dailyCosts.sharedFilePath', '')
                .trim();
            lines.push(sharedPath
                ? `🔗 Sync między komputerami: ${sharedPath}`
                : '🔗 Sync: tylko ten komputer — komenda "AI Balance: Set Shared Costs File" włącza współdzielenie pierwszego odczytu dnia');
        }
        return lines;
    }
    /** Localized month name, e.g. "Listopad". */
    static monthLabel(date) {
        const label = date.toLocaleDateString('pl-PL', { month: 'long' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    /** Compact amount for the status bar: 1.23 / 0.123 / 0.0123. */
    static formatShortAmount(value) {
        if (value >= 1) {
            return value.toFixed(2);
        }
        if (value >= 0.01) {
            return value.toFixed(3);
        }
        return value.toFixed(4);
    }
    dispose() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = undefined;
        }
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBarManager.js.map