import * as vscode from 'vscode';
import { BalanceProvider } from './balanceProvider.js';
import { StatusBarManager } from './statusBarManager.js';

let balanceProvider: BalanceProvider;
let statusBarManager: StatusBarManager;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export async function activate(context: vscode.ExtensionContext) {
	console.log('AI Balance extension activating...');

	balanceProvider = new BalanceProvider(context.secrets);
	statusBarManager = new StatusBarManager(balanceProvider);

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

	context.subscriptions.push(
		refreshCmd, configureCmd,
		setDeepSeekKeyCmd, setOpenRouterKeyCmd, clearKeysCmd,
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
