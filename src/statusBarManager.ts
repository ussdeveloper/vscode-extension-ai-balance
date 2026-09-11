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
import { getModelPricingLines } from './pricing.js';

interface DailyBaseline {
	date: string;
	metric: number;
}

interface StatusSnapshot {
	providerParts: string[];
	tooltipLines: string[];
	dailyUsageLines: string[];
}

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private provider: BalanceProvider;
	private currencyConverter: CurrencyConverter;
	private extensionContext: vscode.ExtensionContext;
	private tickTimer: ReturnType<typeof setInterval> | undefined;
	private snapshot: StatusSnapshot | null = null;

	constructor(provider: BalanceProvider, context: vscode.ExtensionContext) {
		this.provider = provider;
		this.extensionContext = context;
		this.currencyConverter = new CurrencyConverter();
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'aiBalance.configure';
		this.statusBarItem.tooltip = 'AI Balance — click to open settings';
		this.updateVisibility();

		// Live countdown tick — pure local re-render from system time, no API calls
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

		const results = await this.provider.fetchAll();
		const targetCurrency = vscode.workspace.getConfiguration('aiBalance').get<string>('display.currency', 'USD');
		const currencySymbol = CurrencyConverter.getSymbol(targetCurrency);

		if (results.length === 0) {
			this.snapshot = null;
			this.statusBarItem.text = '$(warning) No providers';
			this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
			return;
		}

		const providerParts: string[] = [];
		const tooltipLines: string[] = [];

		for (const r of results) {
			if (r.error && r.balance === null) {
				providerParts.push(`${this.shortName(r.name)} $(warning)`);
				tooltipLines.push(`${r.name}: ${r.error}`);
			} else if (r.balance !== null) {
				if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
					// OpenRouter with budget: show percentage used
					const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
					providerParts.push(`${this.shortName(r.name)} ${pct}%`);
					tooltipLines.push(`${r.name}: $${r.balance.toFixed(4)} used of $${r.total.toFixed(4)} budget (${pct}%)`);
				} else {
					// DeepSeek or pay-as-you-go: show amount
					const converted = await this.currencyConverter.convert(r.balance, targetCurrency);
					const formatted = this.formatBalance(converted.amount, currencySymbol);
					providerParts.push(`${this.shortName(r.name)} ${formatted}`);

					const usdStr = `$${r.balance.toFixed(4)}`;
					const convStr = `${currencySymbol}${converted.amount.toFixed(4)}`;
					if (targetCurrency !== 'USD') {
						tooltipLines.push(`${r.name}: ${usdStr} (${convStr}, rate: ${converted.rate.toFixed(4)})`);
					} else {
						tooltipLines.push(`${r.name}: ${usdStr}`);
					}

					if (r.total !== null && r.total > 0 && r.total !== r.balance) {
						const pct = ((r.balance / r.total) * 100).toFixed(1);
						tooltipLines[tooltipLines.length - 1] += ` of $${r.total.toFixed(4)} (${pct}% remaining)`;
					}
				}
			}
		}

		const dailyUsageLines = await this.computeDailyUsage(results, targetCurrency, currencySymbol);

		this.snapshot = { providerParts, tooltipLines, dailyUsageLines };
		this.render();
	}

	private shortName(name: string): string {
		switch (name) {
			case 'DeepSeek': return '$(hubot)';
			case 'OpenRouter': return '$(radio-tower)';
			default: return name.substring(0, 2);
		}
	}

	private formatBalance(value: number, _symbol: string): string {
		// Show just the number without currency symbol
		return value.toFixed(2);
	}

	/** Rebuilds status bar text + tooltip from the stored snapshot (runs on every tick). */
	private render(): void {
		if (!this.snapshot) {
			return;
		}

		const isPeak = isDeepSeekPeakHours();
		const isWeekend = isDeepSeekWeekend();
		const peakIndicator = isPeak ? '🔴' : '🟢';

		const transition = getNextPeakTransition();
		const countdown = formatCountdown(transition.minutes);
		const targetTime = formatTransitionTarget(transition.at);

		// Countdown right next to the peak dot, then provider balances
		this.statusBarItem.text = [`${peakIndicator} ${countdown}`, ...this.snapshot.providerParts].join(' ');

		const peakInfo = isPeak
			? '🔴 DeepSeek: PEAK HOURS (2× cena)'
			: isWeekend
				? '🟢 DeepSeek: weekend — cały dzień poza szczytem'
				: '🟢 DeepSeek: standardowa cena';
		const countdownInfo = transition.next === 'peak'
			? `⏳ Do najbliższego peak hours: ${countdown} (${targetTime})`
			: `⏳ Do końca peak hours (off-peak): ${countdown} (${targetTime})`;

		const sections: string[] = [...this.snapshot.tooltipLines];

		if (this.snapshot.dailyUsageLines.length > 0) {
			sections.push('---', ...this.snapshot.dailyUsageLines);
		}

		sections.push(
			'---',
			peakInfo,
			countdownInfo,
			getPeakHoursDescription().split('\n').slice(1).join('\n'),
			'---',
			...getModelPricingLines(),
			'---',
			'Click to open settings',
			'Use "AI Balance: Set ... Key" commands to add API keys'
		);

		this.statusBarItem.tooltip = sections.join('\n');
	}

	/** Local (system) date key, e.g. "2026-09-11". */
	private static localDateKey(date: Date): string {
		const y = date.getFullYear();
		const m = (date.getMonth() + 1).toString().padStart(2, '0');
		const d = date.getDate().toString().padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	/**
	 * Approximate cost of today's usage (system local day): compares the current
	 * balance/usage with the first reading of the day, persisted in globalState.
	 * DeepSeek exposes no usage API, so its value is an estimate (top-ups can
	 * skew it); OpenRouter uses its cumulative `usage` counter.
	 */
	private async computeDailyUsage(
		results: ProviderBalance[],
		targetCurrency: string,
		currencySymbol: string
	): Promise<string[]> {
		const today = StatusBarManager.localDateKey(new Date());
		const lines: string[] = [];

		for (const r of results) {
			if (r.balance === null) {
				continue;
			}

			const useUsage = typeof r.usage === 'number';
			const metric = useUsage ? (r.usage as number) : r.balance;
			const stateKey = `aiBalance.dailyBaseline.${r.key}`;

			const stored = this.extensionContext.globalState.get<DailyBaseline>(stateKey);
			let spentUsd = 0;

			if (stored && stored.date === today) {
				// usage grows with spend, balance shrinks — normalise both to "spent"
				const delta = useUsage ? metric - stored.metric : stored.metric - metric;
				spentUsd = Math.max(delta, 0);
			} else {
				await this.extensionContext.globalState.update(stateKey, { date: today, metric } as DailyBaseline);
			}

			if (targetCurrency !== 'USD') {
				const conv = await this.currencyConverter.convert(spentUsd, targetCurrency);
				lines.push(`📊 ${r.name} — dziś: ~$${spentUsd.toFixed(4)} (${currencySymbol}${conv.amount.toFixed(4)})`);
			} else {
				lines.push(`📊 ${r.name} — dziś: ~$${spentUsd.toFixed(4)}`);
			}
		}

		if (lines.length > 0) {
			lines.unshift('Koszt użycia dzisiaj (szacunek od pierwszego odczytu dnia):');
		}

		return lines;
	}

	dispose() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = undefined;
		}
		this.statusBarItem.dispose();
	}
}
