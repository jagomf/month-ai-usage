import * as vscode from 'vscode';

import { UsageModel } from './usage';

export interface RenderOptions {
  model: UsageModel;
  /** Age of the data in minutes; undefined when it was just refreshed. */
  staleMinutes?: number;
  offline?: boolean;
}

export function render(item: vscode.StatusBarItem, options: RenderOptions): void {
  const { model } = options;
  item.text = model.text;

  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${model.summary || 'No data'}**\n\n`);
  for (const line of model.details) {
    tooltip.appendMarkdown(`${line}\n\n`);
  }
  if (options.offline) {
    tooltip.appendMarkdown('_Offline: showing the last saved data._\n\n');
  }
  if (options.staleMinutes !== undefined && options.staleMinutes > 0) {
    tooltip.appendMarkdown(`_Updated ${options.staleMinutes} min ago._\n\n`);
  }
  item.tooltip = tooltip;

  switch (model.level) {
    case 'error':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
    case 'warning':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      break;
    default:
      item.backgroundColor = undefined;
  }
}
