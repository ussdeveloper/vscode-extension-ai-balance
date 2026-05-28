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
let balanceProvider;
let statusBarManager;
let refreshTimer;
function activate(context) {
    console.log('AI Balance extension activating...');
    balanceProvider = new balanceProvider_js_1.BalanceProvider();
    statusBarManager = new statusBarManager_js_1.StatusBarManager(balanceProvider);
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