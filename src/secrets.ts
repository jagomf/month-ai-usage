import * as vscode from 'vscode';

const SECRET_KEY = 'monthAiUsage.claudeSessionKey';

export function getClaudeSessionKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return Promise.resolve(context.secrets.get(SECRET_KEY));
}

export async function setClaudeSessionKey(context: vscode.ExtensionContext, value: string): Promise<void> {
  await context.secrets.store(SECRET_KEY, value);
}

export async function clearClaudeSessionKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
}

export function onSecretChange(context: vscode.ExtensionContext, listener: () => void): vscode.Disposable {
  return context.secrets.onDidChange((event) => {
    if (event.key === SECRET_KEY) {
      listener();
    }
  });
}
