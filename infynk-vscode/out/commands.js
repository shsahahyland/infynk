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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const api = __importStar(require("./apiClient"));
const TEAMS = ['Automate', 'Payments', 'Platform'];
function registerCommands(context, sidebar) {
    context.subscriptions.push(vscode.commands.registerCommand('infynk.askQuestion', () => cmdAskQuestion(sidebar)), vscode.commands.registerCommand('infynk.askAboutSelection', () => cmdAskAboutSelection(sidebar)), vscode.commands.registerCommand('infynk.ingestSources', () => cmdIngestSources()), vscode.commands.registerCommand('infynk.showGraphStats', () => cmdShowGraphStats()), vscode.commands.registerCommand('infynk.setActiveTeam', () => cmdSetActiveTeam(sidebar)));
}
async function cmdAskQuestion(sidebar) {
    await vscode.commands.executeCommand('infynkSidebar.focus');
    sidebar.prefillQuestion('');
}
async function cmdAskAboutSelection(sidebar) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const selection = editor.document.getText(editor.selection).trim();
    if (!selection) {
        vscode.window.showWarningMessage('infynk: No text selected.');
        return;
    }
    await vscode.commands.executeCommand('infynkSidebar.focus');
    sidebar.prefillQuestion(selection);
}
async function cmdIngestSources() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'infynk: Ingesting sources…',
        cancellable: false,
    }, async () => {
        try {
            const result = await api.triggerIngest();
            vscode.window.showInformationMessage(`infynk: Ingestion complete — ${result.documents_ingested} docs, ${result.graph_nodes} nodes, ${result.graph_edges} edges.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`infynk: Ingestion failed — ${String(err)}`);
        }
    });
}
async function cmdShowGraphStats() {
    try {
        const stats = await api.getGraphStats();
        vscode.window.showInformationMessage(`infynk graph: ${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges.`);
    }
    catch (err) {
        vscode.window.showErrorMessage(`infynk: Could not fetch graph stats — ${String(err)}`);
    }
}
async function cmdSetActiveTeam(sidebar) {
    const picked = await vscode.window.showQuickPick(TEAMS, {
        placeHolder: `Current team: ${sidebar.getActiveTeam()}`,
        title: 'infynk — Select active team',
    });
    if (picked) {
        sidebar.setActiveTeam(picked);
        vscode.window.showInformationMessage(`infynk: Active team set to "${picked}".`);
    }
}
//# sourceMappingURL=commands.js.map