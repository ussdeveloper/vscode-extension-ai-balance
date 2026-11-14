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
import { DailyCostTracker } from './dailyCostTracker.js';
import { formatUsdAmount } from './formatUtils.js';

interface StatusSnapshot {
	providerParts: string[];
	tooltipLines: string[];
	dailyUsageLines: string[];
}

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private provider: BalanceProvider;
	private currencyConverter: CurrencyConverter;
	private costTracker: DailyCostTracker;
	private tickTimer: ReturnType<typeof setInterval> | undefined;
	private snapshot: StatusSnapshot | null = null;

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

		// Track daily cost baselines: first (and latest) balance/usage reading of the day
		for (const r of results) {
			if (r.balance === null) {
				continue;
			}
			const useUsage = typeof r.usage === 'number';
			await this.costTracker.track(
				r.key,
				useUsage ? (r.usage as number) : r.balance,
				useUsage ? 'usage' : 'balance'
			);
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
			'Click the status bar item to open the usage dashboard',
			'Use "AI Balance: Set ... Key" commands to add API keys'
		);

		this.statusBarItem.tooltip = sections.join('\n');
	}

	/** Formats a USD cost, converting to the display currency when configured. */
	private async formatCost(usd: number, targetCurrency: string, currencySymbol: string): Promise<string> {
		const usdStr = formatUsdAmount(usd);
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
	private async computeDailyUsage(
		results: ProviderBalance[],
		targetCurrency: string,
		currencySymbol: string
	): Promise<string[]> {
		const lines: string[] = [];
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
		}

		return lines;
	}

	/** Localized month name, e.g. "Listopad". */
	private static monthLabel(date: Date): string {
		const label = date.toLocaleDateString('pl-PL', { month: 'long' });
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	dispose() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = undefined;
		}
		this.statusBarItem.dispose();
	}
}
