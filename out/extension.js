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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const balanceProvider_js_1 = require("./balanceProvider.js");
const statusBarManager_js_1 = require("./statusBarManager.js");
const dailyCostTracker_js_1 = require("./dailyCostTracker.js");
const webitcacheSync_js_1 = require("./webitcacheSync.js");
const currencyConverter_js_1 = require("./currencyConverter.js");
const dashboardPanel_js_1 = require("./dashboardPanel.js");
let balanceProvider;
let statusBarManager;
let refreshTimer;
let dayStartDialogOpen = false;
/** Parses "92,07", "$92.07", "92.07 USD" → 92.07; null when empty/unusable. */
function parseAmount(raw) {
    const cleaned = raw.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    if (cleaned === '' || cleaned === '.') {
        return null;
    }
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
}
async function activate(context) {
    console.log('AI Balance extension activating...');
    balanceProvider = new balanceProvider_js_1.BalanceProvider(context.secrets);
    // webitcache token: SecretStorage override (masked input) or the built-in one.
    // The token is never contributed to the Settings UI, so it cannot be read there.
    let webitcacheToken = (await context.secrets.get(webitcacheSync_js_1.WEBITCACHE_TOKEN_SECRET)) ?? '';
    const costTracker = new dailyCostTracker_js_1.DailyCostTracker(context, new webitcacheSync_js_1.WebitcacheClient(() => webitcacheToken));
    const currencyConverter = new currencyConverter_js_1.CurrencyConverter();
    statusBarManager = new statusBarManager_js_1.StatusBarManager(balanceProvider, costTracker, currencyConverter);
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
            const setKeys = await vscode.window.showInformationMessage('No API keys configured. Would you like to set them now?', 'Yes, set keys');
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
        dashboardPanel_js_1.DashboardPanel.createOrShow(context, balanceProvider, costTracker, currencyConverter);
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
            await context.secrets.store(webitcacheSync_js_1.WEBITCACHE_TOKEN_SECRET, value);
        }
        else {
            await context.secrets.delete(webitcacheSync_js_1.WEBITCACHE_TOKEN_SECRET);
        }
        webitcacheToken = value;
        vscode.window.showInformationMessage(value ? 'webitcache token zapisany (maskowany)' : 'Przywrócono domyślny webitcache token');
        statusBarManager.refresh();
        dashboardPanel_js_1.DashboardPanel.refreshCurrent(true);
    });
    const resetWebitcacheTokenCmd = vscode.commands.registerCommand('aiBalance.resetWebitcacheToken', async () => {
        await context.secrets.delete(webitcacheSync_js_1.WEBITCACHE_TOKEN_SECRET);
        webitcacheToken = '';
        // Remove a legacy plain-text token left over in settings.json (old versions)
        const cfg = vscode.workspace.getConfiguration('aiBalance');
        const inspected = cfg.inspect('dailyCosts.remoteToken');
        if (inspected?.globalValue !== undefined) {
            await cfg.update('dailyCosts.remoteToken', undefined, vscode.ConfigurationTarget.Global);
        }
        if (inspected?.workspaceValue !== undefined) {
            await cfg.update('dailyCosts.remoteToken', undefined, vscode.ConfigurationTarget.Workspace);
        }
        vscode.window.showInformationMessage('Przywrócono domyślny webitcache token (nie jest pokazywany)');
        statusBarManager.refresh();
        dashboardPanel_js_1.DashboardPanel.refreshCurrent(true);
    });
    const dashboardRefreshCmd = vscode.commands.registerCommand('aiBalance.dashboardRefresh', () => {
        dashboardPanel_js_1.DashboardPanel.refreshCurrent(true);
    });
    const setSharedCostsPathCmd = vscode.commands.registerCommand('aiBalance.setSharedCostsPath', async () => {
        const current = vscode.workspace.getConfiguration('aiBalance').get('dailyCosts.sharedFilePath', '');
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
        vscode.window.showInformationMessage(input.trim() ? 'Wspólny plik kosztów ustawiony' : 'Synchronizacja kosztów wyłączona');
        statusBarManager.refresh();
    });
    const setDayStartBalanceCmd = vscode.commands.registerCommand('aiBalance.setDayStartBalance', async () => {
        if (dayStartDialogOpen) {
            return; // the tooltip/webview link can fire the command twice
        }
        dayStartDialogOpen = true;
        try {
            // Let the hover tooltip / webview release focus, otherwise the quick
            // input opens without keyboard focus and Enter does nothing.
            await new Promise((resolve) => setTimeout(resolve, 100));
            const provider = await vscode.window.showQuickPick([
                { label: 'DeepSeek', description: 'saldo konta (USD)', key: 'deepseek' },
                { label: 'OpenRouter', description: 'kredyty (USD)', key: 'openrouter' }
            ], {
                title: 'Saldo początkowe dnia — wybierz providera',
                placeHolder: 'Enter zatwierdza wybór',
                ignoreFocusOut: true
            });
            if (!provider) {
                return;
            }
            const today = costTracker.getToday(provider.key);
            const input = await vscode.window.showInputBox({
                title: `Saldo początkowe dnia — ${provider.label} (USD)`,
                prompt: 'Saldo z początku dnia (USD). Enter zatwierdza. Puste pole = usuń ręczne ustawienie i licz automatycznie.',
                value: today?.manualStartBalance !== undefined ? String(today.manualStartBalance) : '',
                placeHolder: 'np. 92.07',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (value.trim() === '') {
                        return null;
                    }
                    const amount = parseAmount(value);
                    return amount !== null && amount >= 0 ? null : 'Podaj liczbę ≥ 0 (np. 92.07) albo zostaw puste';
                }
            });
            console.info(`AI Balance: setDayStartBalance ${provider.key} → input=${JSON.stringify(input)}`);
            if (input === undefined) {
                return;
            }
            const amount = parseAmount(input);
            if (amount === null) {
                await costTracker.setManualStart(provider.key, null);
                vscode.window.showInformationMessage(`${provider.label}: ręczne saldo początkowe usunięte — liczę automatycznie`);
            }
            else {
                await costTracker.setManualStart(provider.key, amount);
                vscode.window.showInformationMessage(`${provider.label}: saldo początkowe ${amount.toFixed(2)} USD zapisane — koszt dnia przeliczony`);
            }
            statusBarManager.refresh();
            dashboardPanel_js_1.DashboardPanel.refreshCurrent(true);
        }
        catch (err) {
            console.error('AI Balance: setDayStartBalance failed', err);
            vscode.window.showErrorMessage(`Nie udało się zapisać salda początkowego: ${err}`);
        }
        finally {
            dayStartDialogOpen = false;
        }
    });
    context.subscriptions.push(refreshCmd, configureCmd, setDeepSeekKeyCmd, setOpenRouterKeyCmd, clearKeysCmd, openDashboardCmd, dashboardRefreshCmd, setSharedCostsPathCmd, setDayStartBalanceCmd, setWebitcacheTokenCmd, resetWebitcacheTokenCmd, statusBarManager);
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
    const interval = vscode.workspace.getConfiguration('aiBalance').get('refreshInterval', 300);
    if (interval > 0) {
        refreshTimer = setInterval(() => {
            statusBarManager.refresh();
        }, interval * 1000);
    }
}
function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
}
//# sourceMappingURL=extension.js.map