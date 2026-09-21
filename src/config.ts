import * as vscode from 'vscode';

import { DEFAULT_WORKING_DAYS } from './workdays';

export interface ExtensionConfig {
  refreshIntervalMinutes: number;
  copilotEnabled: boolean;
  claudeEnabled: boolean;
  claudeOrganizationId: string;
  claudeMonthlyLimitUsd: number;
  warningThresholdPercent: number;
  errorThresholdPercent: number;
  workingDays: number[];
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('monthAiUsage');
  return {
    refreshIntervalMinutes: Math.max(1, config.get<number>('refreshIntervalMinutes', 15)),
    copilotEnabled: config.get<boolean>('copilot.enabled', true),
    claudeEnabled: config.get<boolean>('claude.enabled', true),
    claudeOrganizationId: config.get<string>('claude.organizationId', '').trim(),
    claudeMonthlyLimitUsd: Math.max(0, config.get<number>('claude.monthlyLimitUsd', 0)),
    warningThresholdPercent: config.get<number>('warningThresholdPercent', 80),
    errorThresholdPercent: config.get<number>('errorThresholdPercent', 95),
    workingDays: config.get<number[]>('workingDays', [...DEFAULT_WORKING_DAYS]),
  };
}

export function onConfigChange(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('monthAiUsage')) {
      listener();
    }
  });
}
