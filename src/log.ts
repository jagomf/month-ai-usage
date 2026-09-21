import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, '«redacted»'],
  [/gh[pousr]_[A-Za-z0-9]+/g, '«redacted»'],
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer «redacted»'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '«redacted»'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '«redacted»'],
  // Identifiers that give away the person or the employer.
  [
    /("(?:login|name|account_name|account_email|group_name|org_service_name|analytics_tracking_id)"\s*:\s*)"[^"]*"/g,
    '$1"«redacted»"',
  ],
  [/("[a-z_]*domains"\s*:\s*)\[[^\]]*\]/gi, '$1["«redacted»"]'],
];

/** Strips tokens, cookies, emails, uuids and identifying names so nothing sensitive reaches the output channel. */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

export function getLogChannel(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel('Month AI Usage', { log: true });
  return channel;
}

export function logInfo(message: string): void {
  getLogChannel().info(redact(message));
}

export function logWarn(message: string): void {
  getLogChannel().warn(redact(message));
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : '';
  getLogChannel().error(redact(detail ? `${message} — ${detail}` : message));
}

export function disposeLog(): void {
  channel?.dispose();
  channel = undefined;
}
