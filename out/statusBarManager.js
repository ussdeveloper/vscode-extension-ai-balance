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
class StatusBarManager {
    statusBarItem;
    provider;
    currencyConverter;
    costTracker;
    tickTimer;
    snapshot = null;
    lastText = '';
    lastTooltip = '';
    constructor(provider, costTracker, currencyConverter) {
        this.provider = provider;
        this.costTracker = costTracker;
        this.currencyConverter = currencyConverter;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'aiBalance.openDashboard';
        this.statusBarItem.tooltip = 'AI Balance — click to open dashboard';
        this.updateVisibility();
        // Live countdown tick — only the text is re-rendered (never the tooltip,
        // so an open tooltip does not disappear while hovering).
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
        this.lastText = '$(sync~spin) ...';
        const results = await this.provider.fetchAll();
        const targetCurrency = config.get('display.currency', 'USD');
        if (results.length === 0) {
            this.snapshot = null;
            this.statusBarItem.text = '$(warning) No providers';
            this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
            this.lastText = '$(warning) No providers';
            this.lastTooltip = 'Enable providers and add API keys in settings';
            return;
        }
        const providerParts = [];
        const rows = [];
        for (const r of results) {
            const row = {
                key: r.key,
                name: r.name,
                icon: this.shortName(r.name),
                balance: '—',
                today: '—',
                month: '—'
            };
            if (r.error && r.balance === null) {
                providerParts.push(`${row.icon} $(warning)`);
                row.balance = `⚠️ ${r.error}`;
                rows.push(row);
                continue;
            }
            if (r.balance === null) {
                rows.push(row);
                continue;
            }
            if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
                const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
                providerParts.push(`${row.icon} ${pct}%`);
                row.balance = `${pct}% · ${StatusBarManager.money(r.balance, 'USD')} / ${StatusBarManager.money(r.total, 'USD')}`;
            }
            else {
                const converted = await this.currencyConverter.convert(r.balance, targetCurrency);
                providerParts.push(`${row.icon} ${converted.amount.toFixed(2)}`);
                row.balance = StatusBarManager.money(r.balance, 'USD');
                if (targetCurrency !== 'USD') {
                    row.balance += ` · ${StatusBarManager.money(converted.amount, targetCurrency)}`;
                }
            }
            rows.push(row);
        }
        // Track daily cost baselines and share the lowest balance of the day
        for (const r of results) {
            if (r.balance === null) {
                continue;
            }
            const useUsage = typeof r.usage === 'number';
            await this.costTracker.track(r.key, useUsage ? r.usage : r.balance, useUsage ? 'usage' : 'balance', r.balance);
        }
        await this.costTracker.syncRemote();
        for (const row of rows) {
            const result = results.find((r) => r.key === row.key);
            if (!result || result.balance === null) {
                continue;
            }
            const today = this.costTracker.getToday(row.key);
            const month = this.costTracker.getMonth(row.key);
            row.today = await this.formatCostCell(today?.spentUsd ?? 0, targetCurrency, today?.manual ?? false);
            row.month = await this.formatCostCell(month, targetCurrency, false);
        }
        // Today's total cost for the status bar (sum across providers, converted)
        let dailyCostUsd = 0;
        for (const r of results) {
            if (r.balance !== null) {
                dailyCostUsd += this.costTracker.getToday(r.key)?.spentUsd ?? 0;
            }
        }
        let dailyCostPart = null;
        if (config.get('display.showDailyCost', true)) {
            const converted = await this.currencyConverter.convert(dailyCostUsd, targetCurrency);
            dailyCostPart = `$(calendar) ${StatusBarManager.formatShortAmount(converted.amount)}`;
        }
        const sharedPath = config.get('dailyCosts.sharedFilePath', '').trim();
        const remoteEnabled = !!config.get('dailyCosts.remoteUrl', '').trim();
        const syncTargets = [];
        if (remoteEnabled) {
            syncTargets.push('webitcache');
        }
        if (sharedPath) {
            syncTargets.push(sharedPath);
        }
        const syncLine = syncTargets.length > 0
            ? `🔗 **Sync:** ${syncTargets.join(' + ')} · 🕛 dzień od **00:00 UTC**`
            : '🔗 **Sync:** tylko ten komputer · 🕛 dzień od **00:00 UTC**';
        this.snapshot = {
            providerParts,
            rows,
            priceTable: await this.buildPriceTable(targetCurrency),
            syncLine,
            currency: targetCurrency,
            dailyCostPart
        };
        this.render();
        this.updateTooltip();
    }
    shortName(name) {
        switch (name) {
            case 'DeepSeek': return '$(hubot)';
            case 'OpenRouter': return '$(radio-tower)';
            default: return name.substring(0, 2);
        }
    }
    /** Status bar text only — runs on the 30 s tick and after every refresh. */
    render() {
        if (!this.snapshot) {
            return;
        }
        const peakIndicator = (0, peakUtils_js_1.isDeepSeekPeakHours)() ? '🔴' : '🟢';
        const transition = (0, peakUtils_js_1.getNextPeakTransition)();
        const countdown = (0, peakUtils_js_1.formatCountdown)(transition.minutes);
        const textParts = [`${peakIndicator} ${countdown}`, ...this.snapshot.providerParts];
        if (this.snapshot.dailyCostPart) {
            textParts.push(this.snapshot.dailyCostPart);
        }
        const text = textParts.join(' ');
        if (text !== this.lastText) {
            this.statusBarItem.text = text;
            this.lastText = text;
        }
    }
    /**
     * Rich Markdown/HTML tooltip with tables. Updated only on refresh (not on the
     * countdown tick) so hovering does not make the tooltip disappear.
     */
    updateTooltip() {
        if (!this.snapshot) {
            return;
        }
        const isPeak = (0, peakUtils_js_1.isDeepSeekPeakHours)();
        const isWeekend = (0, peakUtils_js_1.isDeepSeekWeekend)();
        const transition = (0, peakUtils_js_1.getNextPeakTransition)();
        const countdown = (0, peakUtils_js_1.formatCountdown)(transition.minutes);
        const targetTime = (0, peakUtils_js_1.formatTransitionTarget)(transition.at);
        const stateText = isPeak
            ? '🔴 **PEAK HOURS** — cena 2×'
            : isWeekend
                ? '🟢 **Weekend** — cały dzień off-peak'
                : '🟢 **Off-peak** — standardowa cena';
        const nextText = transition.next === 'peak'
            ? `do peak hours: **${countdown}** (${targetTime})`
            : `do końca peak: **${countdown}** (${targetTime})`;
        const monthLabel = StatusBarManager.monthLabel(new Date());
        const lines = [];
        lines.push('### ⚖️ AI Balance');
        lines.push(`${stateText} · ⏳ ${nextText}`);
        lines.push('');
        lines.push(`| Provider | Saldo | Dziś | ${monthLabel} |`);
        lines.push('|:--|--:|--:|--:|');
        for (const row of this.snapshot.rows) {
            lines.push(`| ${row.icon} ${row.name} | ${row.balance} | ${row.today} | ${row.month} |`);
        }
        lines.push('');
        lines.push(`### 💰 Cennik modeli (${this.snapshot.currency} / 1M tokenów)`);
        lines.push(...this.snapshot.priceTable);
        lines.push('');
        lines.push('*Ceny: api-docs.deepseek.com · kurs: open.er-api.com*');
        lines.push('');
        lines.push('### 🕒 Peak hours');
        for (const line of (0, peakUtils_js_1.getPeakHoursDescription)().split('\n').slice(1)) {
            lines.push(`- ${line}`);
        }
        lines.push('');
        lines.push(this.snapshot.syncLine);
        lines.push('');
        lines.push('---');
        lines.push('[⚙️ Ustawienia](command:aiBalance.configure) · [📊 Dashboard](command:aiBalance.openDashboard) · [✍️ Saldo początkowe](command:aiBalance.setDayStartBalance)');
        const md = new vscode.MarkdownString(lines.join('\n'), true);
        md.supportThemeIcons = true;
        md.supportHtml = true;
        md.isTrusted = true;
        if (md.value !== this.lastTooltip) {
            this.statusBarItem.tooltip = md;
            this.lastTooltip = md.value;
        }
    }
    async buildPriceTable(currency) {
        const lines = [
            '| Model | Wejście (cache miss) | Cache hit | Wyjście |',
            '|:--|--:|--:|--:|'
        ];
        for (const model of pricing_js_1.DEEPSEEK_MODELS) {
            const peak = await this.priceCells(model.peak, currency);
            const offPeak = await this.priceCells(model.offPeak, currency);
            lines.push(`| **${model.model}** · peak | ${peak[0]} | ${peak[1]} | ${peak[2]} |`);
            lines.push(`| ${model.model} · off-peak | ${offPeak[0]} | ${offPeak[1]} | ${offPeak[2]} |`);
        }
        return lines;
    }
    async priceCells(price, currency) {
        const convert = async (usd) => {
            if (currency === 'USD') {
                return StatusBarManager.money(usd, 'USD');
            }
            const conv = await this.currencyConverter.convert(usd, currency);
            return StatusBarManager.money(conv.amount, currency);
        };
        return [
            await convert(price.inputCacheMiss),
            await convert(price.inputCacheHit),
            await convert(price.output)
        ];
    }
    async formatCostCell(usd, currency, manual) {
        const prefix = manual ? '✍️ ' : '';
        const usdText = `~${StatusBarManager.money(usd, 'USD')}`;
        if (currency === 'USD') {
            return `${prefix}${usdText}`;
        }
        const conv = await this.currencyConverter.convert(usd, currency);
        return `${prefix}${usdText} · ${StatusBarManager.money(conv.amount, currency)}`;
    }
    /** Short number: up to 4 decimals, trailing zeros trimmed (0.8314 / 0.044 / 1.32). */
    static trimNumber(value) {
        if (!Number.isFinite(value) || value <= 0) {
            return '0';
        }
        return value.toFixed(4).replace(/\.?0+$/, '') || '0';
    }
    /** Money with currency: $1.23 or 4.9 zł. */
    static money(value, currency) {
        const number = StatusBarManager.trimNumber(value);
        if (currency === 'USD') {
            return `$${number}`;
        }
        return `${number} ${currencyConverter_js_1.CurrencyConverter.getSymbol(currency)}`;
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