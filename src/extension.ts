import * as vscode from 'vscode';
import { BalanceProvider } from './balanceProvider.js';
import { StatusBarManager } from './statusBarManager.js';
import { DailyCostTracker } from './dailyCostTracker.js';
import { WebitcacheClient, WEBITCACHE_TOKEN_SECRET } from './webitcacheSync.js';
import { CurrencyConverter } from './currencyConverter.js';
import { DashboardPanel } from './dashboardPanel.js';

let balanceProvider: BalanceProvider;
let statusBarManager: StatusBarManager;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export async function activate(context: vscode.ExtensionContext) {
	console.log('AI Balance extension activating...');

	balanceProvider = new BalanceProvider(context.secrets);

	// webitcache token: SecretStorage override (masked input) or the built-in one.
	// The token is never contributed to the Settings UI, so it cannot be read there.
	let webitcacheToken = (await context.secrets.get(WEBITCACHE_TOKEN_SECRET)) ?? '';

	const costTracker = new DailyCostTracker(context, new WebitcacheClient(() => webitcacheToken));
	const currencyConverter = new CurrencyConverter();
	statusBarManager = new StatusBarManager(balanceProvider, costTracker, currencyConverter);

	// Register commands
	const refreshCmd = vscode.commands.registerCommand('aiBalance.refresh', () => {
		statusBarManager.refresh();
	});

	const configureCmd = vscode.commands.registerCommand('aiBalance.configure', async () => {
		// Check if any API keys are set
		const dsKey = await context.secrets.get('aiBalance.deepseek.apiKey');
		const orKey = await context.secrets.get('aiBalance.openrouter.apiKey');

		if (!dsKey && !orKey) {
			// No keys at all → prompt to set them one by one
			const setKeys = await vscode.window.showInformationMessage(
				'No API keys configured. Would you like to set them now?',
				'Yes, set keys'
			);
			if (setKeys) {
				// DeepSeek key
				const dsInput = await vscode.window.showInputBox({
					title: 'DeepSeek API Key',
					password: true,
					placeHolder: 'sk-...',
					ignoreFocusOut: true,
					prompt: 'Enter your DeepSeek API key (stored securely in OS keychain)'
				});
				if (dsInput !== undefined && dsInput !== '') {
					await context.secrets.store('aiBalance.deepseek.apiKey', dsInput);
					vscode.window.showInformationMessage('DeepSeek API key saved');
				}

				// OpenRouter key
				const orInput = await vscode.window.showInputBox({
					title: 'OpenRouter API Key',
					password: true,
					placeHolder: 'sk-or-v1-...',
					ignoreFocusOut: true,
					prompt: 'Enter your OpenRouter API key (stored securely in OS keychain)'
				});
				if (orInput !== undefined && orInput !== '') {
					await context.secrets.store('aiBalance.openrouter.apiKey', orInput);
					vscode.window.showInformationMessage('OpenRouter API key saved');
				}

				statusBarManager.refresh();
			}
			return;
		}

		// Keys exist → open settings
		vscode.commands.executeCommand('workbench.action.openSettings', '@aiBalance');
	});

	const setDeepSeekKeyCmd = vscode.commands.registerCommand('aiBalance.setDeepSeekKey', async () => {
		const key = await vscode.window.showInputBox({
			title: 'DeepSeek API Key',
			password: true,
			placeHolder: 'sk-...',
			ignoreFocusOut: true,
			prompt: 'Enter your DeepSeek API key (stored securely in OS keychain)'
		});
		if (key !== undefined) {
			await context.secrets.store('aiBalance.deepseek.apiKey', key);
			vscode.window.showInformationMessage('DeepSeek API key saved securely');
			statusBarManager.refresh();
		}
	});

	const setOpenRouterKeyCmd = vscode.commands.registerCommand('aiBalance.setOpenRouterKey', async () => {
		const key = await vscode.window.showInputBox({
			title: 'OpenRouter API Key',
			password: true,
			placeHolder: 'sk-or-v1-...',
			ignoreFocusOut: true,
			prompt: 'Enter your OpenRouter API key (stored securely in OS keychain)'
		});
		if (key !== undefined) {
			await context.secrets.store('aiBalance.openrouter.apiKey', key);
			vscode.window.showInformationMessage('OpenRouter API key saved securely');
			statusBarManager.refresh();
		}
	});

	const clearKeysCmd = vscode.commands.registerCommand('aiBalance.clearKeys', async () => {
		await context.secrets.delete('aiBalance.deepseek.apiKey');
		await context.secrets.delete('aiBalance.openrouter.apiKey');
		vscode.window.showInformationMessage('All AI Balance API keys cleared');
		statusBarManager.refresh();
	});

	const openDashboardCmd = vscode.commands.registerCommand('aiBalance.openDashboard', () => {
		DashboardPanel.createOrShow(context, balanceProvider, costTracker, currencyConverter);
	});

	const setWebitcacheTokenCmd = vscode.commands.registerCommand('aiBalance.setWebitcacheToken', async () => {
		const input = await vscode.window.showInputBox({
			title: 'webitcache token (masked)',
			password: true,
			placeHolder: 'token — wartość jest ukryta',
			ignoreFocusOut: true,
			prompt: 'Token zapisywany w OS keychain i nigdy nie pokazywany. Puste pole = przywróć domyślny (wbudowany).'
		});
		if (input === undefined) {
			return;
		}

		const value = input.trim();
		if (value) {
			await context.secrets.store(WEBITCACHE_TOKEN_SECRET, value);
		} else {
			await context.secrets.delete(WEBITCACHE_TOKEN_SECRET);
		}
		webitcacheToken = value;
		vscode.window.showInformationMessage(
			value ? 'webitcache token zapisany (maskowany)' : 'Przywrócono domyślny webitcache token'
		);
		statusBarManager.refresh();
		DashboardPanel.refreshCurrent(true);
	});

	const resetWebitcacheTokenCmd = vscode.commands.registerCommand('aiBalance.resetWebitcacheToken', async () => {
		await context.secrets.delete(WEBITCACHE_TOKEN_SECRET);
		webitcacheToken = '';

		// Remove a legacy plain-text token left over in settings.json (old versions)
		const cfg = vscode.workspace.getConfiguration('aiBalance');
		const inspected = cfg.inspect<string>('dailyCosts.remoteToken');
		if (inspected?.globalValue !== undefined) {
			await cfg.update('dailyCosts.remoteToken', undefined, vscode.ConfigurationTarget.Global);
		}
		if (inspected?.workspaceValue !== undefined) {
			await cfg.update('dailyCosts.remoteToken', undefined, vscode.ConfigurationTarget.Workspace);
		}

		vscode.window.showInformationMessage('Przywrócono domyślny webitcache token (nie jest pokazywany)');
		statusBarManager.refresh();
		DashboardPanel.refreshCurrent(true);
	});

	const dashboardRefreshCmd = vscode.commands.registerCommand('aiBalance.dashboardRefresh', () => {
		DashboardPanel.refreshCurrent(true);
	});

	const setSharedCostsPathCmd = vscode.commands.registerCommand('aiBalance.setSharedCostsPath', async () => {
		const current = vscode.workspace.getConfiguration('aiBalance').get<string>('dailyCosts.sharedFilePath', '');
		const input = await vscode.window.showInputBox({
			title: 'Shared daily-costs file (sync across computers)',
			value: current,
			placeHolder: 'C:\\Users\\you\\OneDrive\\ai-balance\\daily-costs.json',
			ignoreFocusOut: true,
			prompt: 'Plik JSON w synchronizowanym folderze (OneDrive/Dropbox/udział sieciowy). Puste = tylko ten komputer.'
		});
		if (input === undefined) {
			return;
		}

		await vscode.workspace
			.getConfiguration('aiBalance')
			.update('dailyCosts.sharedFilePath', input.trim(), vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(
			input.trim() ? 'Wspólny plik kosztów ustawiony' : 'Synchronizacja kosztów wyłączona'
		);
		statusBarManager.refresh();
	});

	const setDayStartBalanceCmd = vscode.commands.registerCommand('aiBalance.setDayStartBalance', async () => {
		const provider = await vscode.window.showQuickPick(
			[
				{ label: 'DeepSeek', description: 'saldo konta (USD)', key: 'deepseek' },
				{ label: 'OpenRouter', description: 'kredyty (USD)', key: 'openrouter' }
			],
			{ title: 'Saldo początkowe dnia — wybierz providera', ignoreFocusOut: true }
		);
		if (!provider) {
			return;
		}

		const today = costTracker.getToday(provider.key);
		const input = await vscode.window.showInputBox({
			title: `Saldo początkowe dnia — ${provider.label} (USD)`,
			prompt: 'Saldo z początku dnia (USD). Puste pole = usuń ręczne ustawienie i licz automatycznie.',
			value: today?.manualStartBalance !== undefined ? String(today.manualStartBalance) : '',
			placeHolder: 'np. 92.07',
			ignoreFocusOut: true,
			validateInput: (value) => {
				const text = value.trim().replace(',', '.');
				if (text === '') {
					return null;
				}
				const n = Number(text);
				return Number.isFinite(n) && n >= 0 ? null : 'Podaj liczbę ≥ 0';
			}
		});
		if (input === undefined) {
			return;
		}

		const text = input.trim().replace(',', '.');
		if (text === '') {
			await costTracker.setManualStart(provider.key, null);
			vscode.window.showInformationMessage('Ręczne saldo początkowe dnia usunięte');
		} else {
			await costTracker.setManualStart(provider.key, Number(text));
			vscode.window.showInformationMessage('Saldo początkowe dnia zapisane');
		}
		statusBarManager.refresh();
		DashboardPanel.refreshCurrent(true);
	});

	context.subscriptions.push(
		refreshCmd, configureCmd,
		setDeepSeekKeyCmd, setOpenRouterKeyCmd, clearKeysCmd,
		openDashboardCmd, dashboardRefreshCmd, setSharedCostsPathCmd, setDayStartBalanceCmd,
		setWebitcacheTokenCmd, resetWebitcacheTokenCmd,
		statusBarManager
	);

	// Listen for config changes → re-refresh
	const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('aiBalance')) {
			if (e.affectsConfiguration('aiBalance.refreshInterval')) {
				if (refreshTimer) {
					clearInterval(refreshTimer);
					refreshTimer = undefined;
				}
				scheduleRefresh();
			}
			statusBarManager.refresh();
		}
	});
	context.subscriptions.push(configListener);

	// Initial fetch
	statusBarManager.refresh();

	// Set up auto-refresh
	scheduleRefresh();
}

function scheduleRefresh() {
	const interval = vscode.workspace.getConfiguration('aiBalance').get<number>('refreshInterval', 300);
	if (interval > 0) {
		refreshTimer = setInterval(() => {
			statusBarManager.refresh();
		}, interval * 1000);
	}
}

export function deactivate() {
	if (refreshTimer) {
		clearInterval(refreshTimer);
	}
}
