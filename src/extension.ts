import * as vscode from 'vscode';
import { BalanceProvider } from './balanceProvider.js';
import { StatusBarManager } from './statusBarManager.js';

let balanceProvider: BalanceProvider;
let statusBarManager: StatusBarManager;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Balance extension activating...');

	balanceProvider = new BalanceProvider();
	statusBarManager = new StatusBarManager(balanceProvider);

	// Register commands
	const refreshCmd = vscode.commands.registerCommand('aiBalance.refresh', () => {
		statusBarManager.refresh();
	});

	const configureCmd = vscode.commands.registerCommand('aiBalance.configure', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', '@aiBalance');
	});

	context.subscriptions.push(refreshCmd, configureCmd, statusBarManager);

	// Listen for config changes → re-refresh
	const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('aiBalance')) {
			// Re-schedule with new interval
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
