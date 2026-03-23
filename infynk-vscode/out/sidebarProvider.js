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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const api = __importStar(require("./apiClient"));
const TEAMS = ['Automate', 'Payments', 'Platform'];
const HEALTH_POLL_MS = 30_000;
class SidebarProvider {
    static viewId = 'infynkSidebar';
    _view;
    _statusBarItem;
    _activeTeam;
    _healthTimer;
    _extensionUri;
    constructor(extensionUri, statusBarItem) {
        this._extensionUri = extensionUri;
        this._statusBarItem = statusBarItem;
        this._activeTeam = vscode.workspace
            .getConfiguration('infynk')
            .get('defaultTeam', 'Automate');
        this._updateStatusBar(true);
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaUri],
        };
        webviewView.webview.html = this._buildHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
        this._startHealthPolling();
    }
    sendMessage(msg) {
        this._view?.webview.postMessage(msg);
    }
    prefillQuestion(question) {
        const team = this._activeTeam;
        if (this._view) {
            this._view.show(true);
            this.sendMessage({ type: 'askPrefill', question, team });
        }
    }
    getActiveTeam() {
        return this._activeTeam;
    }
    setActiveTeam(team) {
        this._activeTeam = team;
        this._updateStatusBar(undefined);
        this.sendMessage({ type: 'setTeam', team });
    }
    dispose() {
        if (this._healthTimer) {
            clearInterval(this._healthTimer);
        }
    }
    async _handleMessage(msg) {
        switch (msg.type) {
            case 'ask':
                await this._handleAsk(msg.question, msg.team);
                break;
            case 'ingest':
                await this._handleIngest();
                break;
            case 'setTeam':
                this._activeTeam = msg.team;
                this._updateStatusBar(undefined);
                break;
            case 'ready':
                this._pollHealth();
                break;
        }
    }
    async _handleAsk(question, team) {
        try {
            const result = await api.askQuestion({ question, user_team: team });
            this.sendMessage({
                type: 'answer',
                answer: result.answer,
                sources: result.sources,
                confidence: result.confidence,
            });
        }
        catch (err) {
            this.sendMessage({ type: 'error', message: String(err) });
        }
    }
    async _handleIngest() {
        try {
            const result = await api.triggerIngest();
            this.sendMessage({
                type: 'ingestResult',
                status: result.status,
                documents: result.documents_ingested,
                nodes: result.graph_nodes,
                edges: result.graph_edges,
            });
        }
        catch (err) {
            this.sendMessage({ type: 'error', message: String(err) });
        }
    }
    _startHealthPolling() {
        if (this._healthTimer) {
            clearInterval(this._healthTimer);
        }
        this._pollHealth();
        this._healthTimer = setInterval(() => this._pollHealth(), HEALTH_POLL_MS);
    }
    async _pollHealth() {
        try {
            const result = await api.getHealth();
            const online = result.status === 'ok';
            this._updateStatusBar(online);
            this.sendMessage({ type: 'healthStatus', online });
        }
        catch {
            this._updateStatusBar(false);
            this.sendMessage({ type: 'healthStatus', online: false });
        }
    }
    _updateStatusBar(online) {
        const dot = online === true ? '●' : online === false ? '○' : '●';
        this._statusBarItem.text = `infynk ${dot} ${this._activeTeam}`;
        this._statusBarItem.color =
            online === false
                ? new vscode.ThemeColor('statusBarItem.errorForeground')
                : undefined;
    }
    _buildHtml(webview) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'panel.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const nonce = getNonce();
        const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http: https:;`;
        html = html
            .replace('{{CSP}}', csp)
            .replace('{{NONCE}}', nonce)
            .replace('{{TEAMS}}', JSON.stringify(TEAMS))
            .replace('{{DEFAULT_TEAM}}', JSON.stringify(this._activeTeam));
        return html;
    }
}
exports.SidebarProvider = SidebarProvider;
function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}
//# sourceMappingURL=sidebarProvider.js.map