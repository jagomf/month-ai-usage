import * as vscode from 'vscode';

const ITEM_PRIORITY = 100;

let item: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  item = vscode.window.createStatusBarItem('monthAiUsage.status', vscode.StatusBarAlignment.Right, ITEM_PRIORITY);
  item.name = 'Month AI Usage';
  item.command = 'monthAiUsage.showDetails';
  item.text = 'Uso: --% / Mes: --%';
  item.tooltip = 'Copilot: --% - Claude: --%';
  item.show();

  context.subscriptions.push(
    item,
    vscode.commands.registerCommand('monthAiUsage.refresh', () => {
      void vscode.window.showInformationMessage('Month AI Usage: refresh not implemented yet.');
    }),
    vscode.commands.registerCommand('monthAiUsage.showDetails', () => {
      void vscode.window.showInformationMessage('Month AI Usage: details not implemented yet.');
    }),
    vscode.commands.registerCommand('monthAiUsage.setClaudeSessionKey', () => {
      void vscode.window.showInformationMessage('Month AI Usage: session key storage not implemented yet.');
    }),
    vscode.commands.registerCommand('monthAiUsage.clearClaudeSessionKey', () => {
      void vscode.window.showInformationMessage('Month AI Usage: session key storage not implemented yet.');
    }),
  );
}

export function deactivate(): void {
  // The status bar item is disposed through context.subscriptions.
}
