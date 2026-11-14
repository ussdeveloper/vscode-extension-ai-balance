import * as vscode from 'vscode';
import { BalanceProvider, ProviderBalance } from './balanceProvider.js';
import { CurrencyConverter } from './currencyConverter.js';
import {
	isDeepSeekPeakHours,
	isDeepSeekWeekend,
	getPeakHoursDescription,
	getNextPeakTransition,
	formatCountdown,
	formatTransitionTarget
} from './peakUtils.js';
import { DEEPSEEK_MODELS, TokenPrice } from './pricing.js';
import { DailyCostTracker } from './dailyCostTracker.js';

interface ProviderRow {
	key: string;
	name: string;
	icon: string;
	balance: string;
	today: string;
	month: string;
}

interface StatusSnapshot {
	providerParts: string[];
	rows: ProviderRow[];
	priceTable: string[];
	syncLine: string;
	currency: string;
	dailyCostPart: string | null;
}

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private provider: BalanceProvider;
	private currencyConverter: CurrencyConverter;
	private costTracker: DailyCostTracker;
	private tickTimer: ReturnType<typeof setInterval> | undefined;
	private snapshot: StatusSnapshot | null = null;
	private lastText = '';
	private lastTooltip = '';

	constructor(
		provider: BalanceProvider,
		costTracker: DailyCostTracker,
		currencyConverter: CurrencyConverter
	) {
		this.provider = provider;
		this.costTracker = costTracker;
		this.currencyConverter = currencyConverter;
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'aiBalance.openDashboard';
		this.statusBarItem.tooltip = 'AI Balance — click to open dashboard';
		this.updateVisibility();

		// Live countdown tick — only the text is re-rendered (never the tooltip,
		// so an open tooltip does not disappear while hovering).
		this.tickTimer = setInterval(() => this.render(), 30_000);
	}

	private updateVisibility(): void {
		const show = vscode.workspace.getConfiguration('aiBalance').get<boolean>('display.showInStatusBar', true);
		if (show) {
			this.statusBarItem.show();
		} else {
			this.statusBarItem.hide();
		}
	}

	async refresh(): Promise<void> {
		const config = vscode.workspace.getConfiguration('aiBalance');
		const show = config.get<boolean>('display.showInStatusBar', true);
		if (!show) {
			this.statusBarItem.hide();
			return;
		}
		this.statusBarItem.show();

		const color = config.get<string>('display.color', '#D4A017');
		this.statusBarItem.color = color && color.trim() ? color : undefined;

		this.statusBarItem.text = '$(sync~spin) ...';
		this.statusBarItem.tooltip = 'Fetching balances...';
		this.lastText = '$(sync~spin) ...';

		const results = await this.provider.fetchAll();
		const targetCurrency = config.get<string>('display.currency', 'USD');

		if (results.length === 0) {
			this.snapshot = null;
			this.statusBarItem.text = '$(warning) No providers';
			this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
			this.lastText = '$(warning) No providers';
			this.lastTooltip = 'Enable providers and add API keys in settings';
			return;
		}

		const providerParts: string[] = [];
		const rows: ProviderRow[] = [];

		for (const r of results) {
			const row: ProviderRow = {
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
			} else {
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
			await this.costTracker.track(
				r.key,
				useUsage ? (r.usage as number) : r.balance,
				useUsage ? 'usage' : 'balance',
				r.balance
			);
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
		let dailyCostPart: string | null = null;
		if (config.get<boolean>('display.showDailyCost', true)) {
			const converted = await this.currencyConverter.convert(dailyCostUsd, targetCurrency);
			dailyCostPart = `$(calendar) ${StatusBarManager.formatShortAmount(converted.amount)}`;
		}

		const sharedPath = config.get<string>('dailyCosts.sharedFilePath', '').trim();
		const remoteEnabled = !!config.get<string>('dailyCosts.remoteUrl', '').trim();
		const syncTargets: string[] = [];
		if (remoteEnabled) {
			syncTargets.push('webitcache');
		}
		if (sharedPath) {
			syncTargets.push(sharedPath);
		}
		const syncLine =
			syncTargets.length > 0
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

	private shortName(name: string): string {
		switch (name) {
			case 'DeepSeek': return '$(hubot)';
			case 'OpenRouter': return '$(radio-tower)';
			default: return name.substring(0, 2);
		}
	}

	/** Status bar text only — runs on the 30 s tick and after every refresh. */
	private render(): void {
		if (!this.snapshot) {
			return;
		}

		const peakIndicator = isDeepSeekPeakHours() ? '🔴' : '🟢';
		const transition = getNextPeakTransition();
		const countdown = formatCountdown(transition.minutes);

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
	private updateTooltip(): void {
		if (!this.snapshot) {
			return;
		}

		const isPeak = isDeepSeekPeakHours();
		const isWeekend = isDeepSeekWeekend();
		const transition = getNextPeakTransition();
		const countdown = formatCountdown(transition.minutes);
		const targetTime = formatTransitionTarget(transition.at);

		const stateText = isPeak
			? '🔴 **PEAK HOURS** — cena 2×'
			: isWeekend
				? '🟢 **Weekend** — cały dzień off-peak'
				: '🟢 **Off-peak** — standardowa cena';
		const nextText =
			transition.next === 'peak'
				? `do peak hours: **${countdown}** (${targetTime})`
				: `do końca peak: **${countdown}** (${targetTime})`;

		const monthLabel = StatusBarManager.monthLabel(new Date());
		const lines: string[] = [];

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
		for (const line of getPeakHoursDescription().split('\n').slice(1)) {
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

	private async buildPriceTable(currency: string): Promise<string[]> {
		const lines: string[] = [
			'| Model | Wejście (cache miss) | Cache hit | Wyjście |',
			'|:--|--:|--:|--:|'
		];

		for (const model of DEEPSEEK_MODELS) {
			const peak = await this.priceCells(model.peak, currency);
			const offPeak = await this.priceCells(model.offPeak, currency);
			lines.push(`| **${model.model}** · peak | ${peak[0]} | ${peak[1]} | ${peak[2]} |`);
			lines.push(`| ${model.model} · off-peak | ${offPeak[0]} | ${offPeak[1]} | ${offPeak[2]} |`);
		}

		return lines;
	}

	private async priceCells(price: TokenPrice, currency: string): Promise<[string, string, string]> {
		const convert = async (usd: number): Promise<string> => {
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

	private async formatCostCell(usd: number, currency: string, manual: boolean): Promise<string> {
		const prefix = manual ? '✍️ ' : '';
		const usdText = `~${StatusBarManager.money(usd, 'USD')}`;
		if (currency === 'USD') {
			return `${prefix}${usdText}`;
		}
		const conv = await this.currencyConverter.convert(usd, currency);
		return `${prefix}${usdText} · ${StatusBarManager.money(conv.amount, currency)}`;
	}

	/** Short number: up to 4 decimals, trailing zeros trimmed (0.8314 / 0.044 / 1.32). */
	private static trimNumber(value: number): string {
		if (!Number.isFinite(value) || value <= 0) {
			return '0';
		}
		return value.toFixed(4).replace(/\.?0+$/, '') || '0';
	}

	/** Money with currency: $1.23 or 4.9 zł. */
	private static money(value: number, currency: string): string {
		const number = StatusBarManager.trimNumber(value);
		if (currency === 'USD') {
			return `$${number}`;
		}
		return `${number} ${CurrencyConverter.getSymbol(currency)}`;
	}

	/** Localized month name, e.g. "Listopad". */
	private static monthLabel(date: Date): string {
		const label = date.toLocaleDateString('pl-PL', { month: 'long' });
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	/** Compact amount for the status bar: 1.23 / 0.123 / 0.0123. */
	private static formatShortAmount(value: number): string {
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
