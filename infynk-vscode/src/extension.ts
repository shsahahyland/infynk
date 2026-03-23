import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';
import { registerCommands } from './commands';
import { triggerIngest } from './apiClient';

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = 'infynk.openSidebar';
  statusBarItem.tooltip = 'infynk — click to open sidebar';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const sidebar = new SidebarProvider(context.extensionUri, statusBarItem);
  context.subscriptions.push(sidebar);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('infynk.openSidebar', () =>
      vscode.commands.executeCommand('infynkSidebar.focus'),
    ),
  );

  registerCommands(context, sidebar);

  const cfg = vscode.workspace.getConfiguration('infynk');
  if (cfg.get<boolean>('autoIngestOnStartup', false)) {
    triggerIngest().catch(() => {
      // silent — ingest failure on startup should not interrupt the user
    });
  }
}

export function deactivate(): void {
  // Disposables registered in context.subscriptions are cleaned up automatically.
}
