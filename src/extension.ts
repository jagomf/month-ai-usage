import * as vscode from 'vscode';

import { getConfig, onConfigChange } from './config';
import { getLogChannel, logError, logInfo, redact } from './log';
import { claudeHeaders, fetchClaudeUsage, looksLikeBotProtection } from './providers/claude';
import { fetchCopilotUsage } from './providers/copilot';
import { resolveGitHubToken, selectGitHubAccount } from './providers/github-account';
import { UsageSnapshot, errorSnapshot } from './providers/types';
import { RefreshResult, Scheduler } from './scheduler';
import { clearClaudeSessionKey, getClaudeSessionKey, onSecretChange, setClaudeSessionKey } from './secrets';
import { render } from './statusBar';
import { buildModel } from './usage';
import { workdayStats } from './workdays';

const ITEM_PRIORITY = 100;
const CACHE_KEY = 'lastSnapshot';
const ORG_KEY = 'claudeOrganizationId';

interface CachedSnapshots {
  at: number;
  snapshots: UsageSnapshot[];
}

let item: vscode.StatusBarItem;
let scheduler: Scheduler;
let lastSnapshots: UsageSnapshot[] = [];

function paint(snapshots: UsageSnapshot[], cachedAt?: number): void {
  const config = getConfig();
  const model = buildModel(snapshots, workdayStats(new Date(), config.workingDays), {
    warning: config.warningThresholdPercent,
    error: config.errorThresholdPercent,
    providerWarning: config.providerWarningThresholdPercent,
    providerError: config.providerErrorThresholdPercent,
  });
  const staleMinutes = cachedAt === undefined ? undefined : Math.floor((Date.now() - cachedAt) / 60_000);
  render(item, { model, staleMinutes, offline: cachedAt !== undefined });
}

async function collect(context: vscode.ExtensionContext): Promise<UsageSnapshot[]> {
  const config = getConfig();
  const tasks: Promise<UsageSnapshot>[] = [];

  if (config.copilotEnabled) {
    tasks.push(
      fetchCopilotUsage({
        fetch,
        getToken: () => resolveGitHubToken(context, false),
        onQuotaId: (quotaId) => logInfo(`Copilot: using quota "${quotaId}".`),
      }).catch((error: unknown) => errorSnapshot('copilot', 'Copilot', error)),
    );
  }

  if (config.claudeEnabled) {
    tasks.push(
      fetchClaudeUsage({
        fetch,
        getSessionKey: () => getClaudeSessionKey(context),
        organizationId: config.claudeOrganizationId || context.globalState.get<string>(ORG_KEY),
        monthlyLimitUsd: config.claudeMonthlyLimitUsd,
        onOrganizationId: (organizationId) => void context.globalState.update(ORG_KEY, organizationId),
      }).catch((error: unknown) => errorSnapshot('claude', 'Claude', error)),
    );
  }

  return Promise.all(tasks);
}

async function refresh(context: vscode.ExtensionContext): Promise<RefreshResult> {
  const snapshots = await collect(context);
  lastSnapshots = snapshots;
  paint(snapshots);

  for (const snapshot of snapshots) {
    if (snapshot.error) {
      logInfo(`${snapshot.label}: ${snapshot.error.kind} — ${snapshot.error.message}`);
    }
  }

  if (snapshots.some((snapshot) => snapshot.usedPct !== null)) {
    await context.globalState.update(CACHE_KEY, { at: Date.now(), snapshots } satisfies CachedSnapshots);
  }

  const rateLimited = snapshots.some((snapshot) => snapshot.error?.kind === 'ratelimit');
  return { retryAfterMs: rateLimited ? 5 * 60_000 : undefined };
}

async function askForSessionKey(context: vscode.ExtensionContext): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: 'claude.ai session key',
    prompt: 'DevTools → Application → Cookies → https://claude.ai → sessionKey',
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) =>
      input.trim().startsWith('sk-ant-') ? undefined : 'The cookie must start with "sk-ant-".',
  });
  if (!value) {
    return;
  }

  const sessionKey = value.trim();
  try {
    const response = await fetch('https://claude.ai/api/organizations', { headers: claudeHeaders(sessionKey) });
    const body = await response.text();
    logInfo(`Session key check: /api/organizations responded ${response.status}.`);
    if (!response.ok) {
      logInfo(`Response head: ${redact(body.slice(0, 300))}`);
      const reason = looksLikeBotProtection(body)
        ? 'blocked the request (bot protection)'
        : response.status === 401 || response.status === 403
          ? 'rejected that session key'
          : `responded ${response.status}`;
      void vscode.window.showErrorMessage(`claude.ai ${reason}; the session key was not saved.`);
      return;
    }
  } catch (error) {
    logError('Could not validate the session key', error);
    void vscode.window.showErrorMessage('Could not reach claude.ai; the session key was not saved.');
    return;
  }

  await setClaudeSessionKey(context, sessionKey);
  await context.globalState.update(ORG_KEY, undefined);
  void vscode.window.showInformationMessage('Claude session key saved.');
}

async function showDetails(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const model = buildModel(lastSnapshots, workdayStats(new Date(), config.workingDays), {
    warning: config.warningThresholdPercent,
    error: config.errorThresholdPercent,
    providerWarning: config.providerWarningThresholdPercent,
    providerError: config.providerErrorThresholdPercent,
  });

  const picked = await vscode.window.showQuickPick(
    [
      ...model.details.map((detail) => ({ label: detail, action: 'none' as const })),
      { label: '$(refresh) Refresh now', action: 'refresh' as const },
      { label: '$(key) Change the Claude session key', action: 'sessionKey' as const },
      { label: '$(account) Select the GitHub account', action: 'account' as const },
      { label: '$(output) Open the log', action: 'log' as const },
    ],
    { title: model.text, placeHolder: model.summary || 'No data yet' },
  );

  switch (picked?.action) {
    case 'refresh':
      await scheduler.refreshNow(true);
      break;
    case 'sessionKey':
      await askForSessionKey(context);
      break;
    case 'account':
      if (await selectGitHubAccount(context)) {
        await scheduler.refreshNow(true);
      }
      break;
    case 'log':
      getLogChannel().show();
      break;
    default:
      break;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  item = vscode.window.createStatusBarItem('monthAiUsage.status', vscode.StatusBarAlignment.Right, ITEM_PRIORITY);
  item.name = 'Month AI Usage';
  item.command = 'monthAiUsage.showDetails';
  item.text = 'Usage: --% / Month: --%';
  item.show();

  const cached = context.globalState.get<CachedSnapshots>(CACHE_KEY);
  if (cached?.snapshots?.length) {
    lastSnapshots = cached.snapshots;
    paint(cached.snapshots, cached.at);
  } else {
    paint([]);
  }

  scheduler = new Scheduler(
    () => refresh(context),
    () => getConfig().refreshIntervalMinutes * 60_000,
  );

  context.subscriptions.push(
    item,
    scheduler,
    onConfigChange(() => {
      paint(lastSnapshots);
      scheduler.reschedule();
    }),
    onSecretChange(context, () => void scheduler.refreshNow(true)),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === 'github') {
        void scheduler.refreshNow(true);
      }
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        void scheduler.refreshNow();
      }
    }),
    vscode.commands.registerCommand('monthAiUsage.refresh', () => scheduler.refreshNow(true)),
    vscode.commands.registerCommand('monthAiUsage.showDetails', () => showDetails(context)),
    vscode.commands.registerCommand('monthAiUsage.setClaudeSessionKey', () => askForSessionKey(context)),
    vscode.commands.registerCommand('monthAiUsage.clearClaudeSessionKey', async () => {
      await clearClaudeSessionKey(context);
      void vscode.window.showInformationMessage('Claude session key cleared.');
    }),
    vscode.commands.registerCommand('monthAiUsage.selectGitHubAccount', () => selectGitHubAccount(context)),
  );

  scheduler.start();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
