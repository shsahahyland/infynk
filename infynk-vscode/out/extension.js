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
const sidebarProvider_1 = require("./sidebarProvider");
const commands_1 = require("./commands");
const apiClient_1 = require("./apiClient");
function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'infynk.openSidebar';
    statusBarItem.tooltip = 'infynk — click to open sidebar';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    const sidebar = new sidebarProvider_1.SidebarProvider(context.extensionUri, statusBarItem);
    context.subscriptions.push(sidebar);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.viewId, sidebar, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    context.subscriptions.push(vscode.commands.registerCommand('infynk.openSidebar', () => vscode.commands.executeCommand('infynkSidebar.focus')));
    (0, commands_1.registerCommands)(context, sidebar);
    const cfg = vscode.workspace.getConfiguration('infynk');
    if (cfg.get('autoIngestOnStartup', false)) {
        (0, apiClient_1.triggerIngest)().catch(() => {
            // silent — ingest failure on startup should not interrupt the user
        });
    }
}
function deactivate() {
    // Disposables registered in context.subscriptions are cleaned up automatically.
}
//# sourceMappingURL=extension.js.map