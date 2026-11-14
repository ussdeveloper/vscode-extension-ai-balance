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
const currencyConverter_js_1 = require("./currencyConverter.js");
const dashboardPanel_js_1 = require("./dashboardPanel.js");
let balanceProvider;
let statusBarManager;
let refreshTimer;
async function activate(context) {
    console.log('AI Balance extension activating...');
    balanceProvider = new balanceProvider_js_1.BalanceProvider(context.secrets);
    const costTracker = new dailyCostTracker_js_1.DailyCostTracker(context);
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
    const dashboardRefreshCmd = vscode.commands.registerCommand('aiBalance.dashboardRefresh', () => {
        dashboardPanel_js_1.DashboardPanel.refreshCurrent(true);
    });
    context.subscriptions.push(refreshCmd, configureCmd, setDeepSeekKeyCmd, setOpenRouterKeyCmd, clearKeysCmd, openDashboardCmd, dashboardRefreshCmd, statusBarManager);
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