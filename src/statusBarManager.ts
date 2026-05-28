import * as vscode from 'vscode';
import { BalanceProvider, ProviderBalance } from './balanceProvider.js';
import { CurrencyConverter } from './currencyConverter.js';

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private provider: BalanceProvider;
	private currencyConverter: CurrencyConverter;

	constructor(provider: BalanceProvider) {
		this.provider = provider;
		this.currencyConverter = new CurrencyConverter();
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'aiBalance.configure';
		this.statusBarItem.tooltip = 'AI Balance — click to open settings';
		this.updateVisibility();
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
		const show = vscode.workspace.getConfiguration('aiBalance').get<boolean>('display.showInStatusBar', true);
		if (!show) {
			this.statusBarItem.hide();
			return;
		}
		this.statusBarItem.show();

		this.statusBarItem.text = '$(sync~spin) AI...';
		this.statusBarItem.tooltip = 'Fetching balances...';

		const results = await this.provider.fetchAll();
		const targetCurrency = vscode.workspace.getConfiguration('aiBalance').get<string>('display.currency', 'USD');
		const currencySymbol = CurrencyConverter.getSymbol(targetCurrency);

		if (results.length === 0) {
			this.statusBarItem.text = '$(warning) AI: No providers';
			this.statusBarItem.tooltip = 'Enable providers and add API keys in settings';
			return;
		}

		const parts: string[] = [];
		const tooltipLines: string[] = [];

		for (const r of results) {
			if (r.error && r.balance === null) {
				parts.push(`${this.shortName(r.name)}:$(warning)`);
				tooltipLines.push(`${r.name}: ${r.error}`);
			} else if (r.balance !== null) {
				if (r.key === 'openrouter' && r.total !== null && r.total > 0) {
					// OpenRouter with budget: show percentage used
					const pct = Math.min((r.balance / r.total) * 100, 100).toFixed(1);
					parts.push(`${this.shortName(r.name)}:${pct}%`);
					tooltipLines.push(`${r.name}: $${r.balance.toFixed(4)} used of $${r.total.toFixed(4)} budget (${pct}%)`);
				} else {
					// DeepSeek or pay-as-you-go: show amount
					const converted = await this.currencyConverter.convert(r.balance, targetCurrency);
					const formatted = this.formatBalance(converted.amount, currencySymbol);
					parts.push(`${this.shortName(r.name)}:${formatted}`);

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

		this.statusBarItem.text = parts.join(' ');
		this.statusBarItem.tooltip = tooltipLines.join('\n') + '\n---\nClick to open settings\nUse "AI Balance: Set ... Key" commands to add API keys';
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

	dispose() {
		this.statusBarItem.dispose();
	}
}
