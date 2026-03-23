import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as api from './apiClient';

const TEAMS = ['Automate', 'Payments', 'Platform'];
const HEALTH_POLL_MS = 30_000;

export type SidebarMessage =
  | { type: 'ask'; question: string; team: string }
  | { type: 'ingest' }
  | { type: 'setTeam'; team: string }
  | { type: 'ready' };

export type HostMessage =
  | { type: 'answer'; answer: string; sources: api.SourceReference[]; confidence: number }
  | { type: 'ingestResult'; status: string; documents: number; nodes: number; edges: number }
  | { type: 'healthStatus'; online: boolean }
  | { type: 'error'; message: string }
  | { type: 'askPrefill'; question: string; team: string }
  | { type: 'setTeam'; team: string };

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'infynkSidebar';

  private _view?: vscode.WebviewView;
  private _statusBarItem: vscode.StatusBarItem;
  private _activeTeam: string;
  private _healthTimer?: ReturnType<typeof setInterval>;
  private readonly _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, statusBarItem: vscode.StatusBarItem) {
    this._extensionUri = extensionUri;
    this._statusBarItem = statusBarItem;
    this._activeTeam = vscode.workspace
      .getConfiguration('infynk')
      .get<string>('defaultTeam', 'Automate');
    this._updateStatusBar(true);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: SidebarMessage) =>
      this._handleMessage(msg),
    );

    this._startHealthPolling();
  }

  sendMessage(msg: HostMessage): void {
    this._view?.webview.postMessage(msg);
  }

  prefillQuestion(question: string): void {
    const team = this._activeTeam;
    if (this._view) {
      this._view.show(true);
      this.sendMessage({ type: 'askPrefill', question, team });
    }
  }

  getActiveTeam(): string {
    return this._activeTeam;
  }

  setActiveTeam(team: string): void {
    this._activeTeam = team;
    this._updateStatusBar(undefined);
    this.sendMessage({ type: 'setTeam', team });
  }

  dispose(): void {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
    }
  }

  private async _handleMessage(msg: SidebarMessage): Promise<void> {
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

  private async _handleAsk(question: string, team: string): Promise<void> {
    try {
      const result = await api.askQuestion({ question, user_team: team });
      this.sendMessage({
        type: 'answer',
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
      });
    } catch (err) {
      this.sendMessage({ type: 'error', message: String(err) });
    }
  }

  private async _handleIngest(): Promise<void> {
    try {
      const result = await api.triggerIngest();
      this.sendMessage({
        type: 'ingestResult',
        status: result.status,
        documents: result.documents_ingested,
        nodes: result.graph_nodes,
        edges: result.graph_edges,
      });
    } catch (err) {
      this.sendMessage({ type: 'error', message: String(err) });
    }
  }

  private _startHealthPolling(): void {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
    }
    this._pollHealth();
    this._healthTimer = setInterval(() => this._pollHealth(), HEALTH_POLL_MS);
  }

  private async _pollHealth(): Promise<void> {
    try {
      const result = await api.getHealth();
      const online = result.status === 'ok';
      this._updateStatusBar(online);
      this.sendMessage({ type: 'healthStatus', online });
    } catch {
      this._updateStatusBar(false);
      this.sendMessage({ type: 'healthStatus', online: false });
    }
  }

  private _updateStatusBar(online: boolean | undefined): void {
    const dot = online === true ? '●' : online === false ? '○' : '●';
    this._statusBarItem.text = `infynk ${dot} ${this._activeTeam}`;
    this._statusBarItem.color =
      online === false
        ? new vscode.ThemeColor('statusBarItem.errorForeground')
        : undefined;
  }

  private _buildHtml(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'media',
      'panel.html',
    );
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

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join('');
}
