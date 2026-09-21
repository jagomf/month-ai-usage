import * as vscode from 'vscode';

const ACCOUNT_KEY = 'copilotAccountId';
const SCOPES = ['user:email'];

async function findStoredAccount(
  context: vscode.ExtensionContext,
): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
  const accountId = context.globalState.get<string>(ACCOUNT_KEY);
  if (!accountId) {
    return undefined;
  }
  const accounts = await vscode.authentication.getAccounts('github');
  return accounts.find((account) => account.id === accountId);
}

export async function resolveGitHubToken(
  context: vscode.ExtensionContext,
  interactive: boolean,
): Promise<string | null> {
  const account = await findStoredAccount(context);
  const session = await vscode.authentication.getSession(
    'github',
    SCOPES,
    interactive ? { createIfNone: true, account } : { createIfNone: false, silent: true, account },
  );
  return session?.accessToken ?? null;
}

/** Lets the user pick which GitHub account holds the Copilot subscription. */
export async function selectGitHubAccount(context: vscode.ExtensionContext): Promise<boolean> {
  const accounts = await vscode.authentication.getAccounts('github');
  if (accounts.length === 0) {
    const session = await vscode.authentication.getSession('github', SCOPES, { createIfNone: true });
    if (!session) {
      return false;
    }
    await context.globalState.update(ACCOUNT_KEY, session.account.id);
    return true;
  }

  const stored = context.globalState.get<string>(ACCOUNT_KEY);
  const picked = await vscode.window.showQuickPick(
    accounts.map((account) => ({
      label: account.label,
      description: account.id === stored ? 'in use' : undefined,
      id: account.id,
    })),
    { title: 'GitHub account with Copilot', placeHolder: 'Pick the account whose quota you want to track' },
  );
  if (!picked) {
    return false;
  }
  await context.globalState.update(ACCOUNT_KEY, picked.id);
  return true;
}
