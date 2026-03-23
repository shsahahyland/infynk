import * as vscode from 'vscode';
import * as api from './apiClient';
import { SidebarProvider } from './sidebarProvider';

const TEAMS = ['Automate', 'Payments', 'Platform'];

export function registerCommands(
  context: vscode.ExtensionContext,
  sidebar: SidebarProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('infynk.askQuestion', () =>
      cmdAskQuestion(sidebar),
    ),
    vscode.commands.registerCommand('infynk.askAboutSelection', () =>
      cmdAskAboutSelection(sidebar),
    ),
    vscode.commands.registerCommand('infynk.ingestSources', () =>
      cmdIngestSources(),
    ),
    vscode.commands.registerCommand('infynk.showGraphStats', () =>
      cmdShowGraphStats(),
    ),
    vscode.commands.registerCommand('infynk.setActiveTeam', () =>
      cmdSetActiveTeam(sidebar),
    ),
  );
}

async function cmdAskQuestion(sidebar: SidebarProvider): Promise<void> {
  await vscode.commands.executeCommand('infynkSidebar.focus');
  sidebar.prefillQuestion('');
}

async function cmdAskAboutSelection(sidebar: SidebarProvider): Promise<void> {
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

async function cmdIngestSources(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'infynk: Ingesting sources…',
      cancellable: false,
    },
    async () => {
      try {
        const result = await api.triggerIngest();
        vscode.window.showInformationMessage(
          `infynk: Ingestion complete — ${result.documents_ingested} docs, ${result.graph_nodes} nodes, ${result.graph_edges} edges.`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(`infynk: Ingestion failed — ${String(err)}`);
      }
    },
  );
}

async function cmdShowGraphStats(): Promise<void> {
  try {
    const stats = await api.getGraphStats();
    vscode.window.showInformationMessage(
      `infynk graph: ${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges.`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`infynk: Could not fetch graph stats — ${String(err)}`);
  }
}

async function cmdSetActiveTeam(sidebar: SidebarProvider): Promise<void> {
  const picked = await vscode.window.showQuickPick(TEAMS, {
    placeHolder: `Current team: ${sidebar.getActiveTeam()}`,
    title: 'infynk — Select active team',
  });
  if (picked) {
    sidebar.setActiveTeam(picked);
    vscode.window.showInformationMessage(`infynk: Active team set to "${picked}".`);
  }
}
