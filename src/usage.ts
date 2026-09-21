import { UsageSnapshot } from './providers/types';
import { WorkdayStats, workdayPercent } from './workdays';

export type UsageLevel = 'ok' | 'warning' | 'error';

export interface UsageModel {
  usagePct: number | null;
  monthPct: number;
  level: UsageLevel;
  text: string;
  /** One-liner shown as the first tooltip line: `Copilot: NN% - Claude: NN%`. */
  summary: string;
  details: string[];
}

const REASONS: Record<string, string> = {
  auth: 'session expired',
  network: 'offline',
  schema: 'unexpected response',
  ratelimit: 'rate limited',
  config: 'not configured',
  disabled: 'disabled',
};

export function formatPercent(value: number | null, decimals = 0): string {
  if (value === null) {
    return '--%';
  }
  return `${value.toFixed(decimals)}%`;
}

function snapshotSummary(snapshot: UsageSnapshot): string {
  if (snapshot.usedPct !== null) {
    return `${snapshot.label}: ${Math.round(snapshot.usedPct)}%`;
  }
  if (snapshot.unlimited) {
    return `${snapshot.label}: unlimited`;
  }
  const reason = snapshot.error ? (REASONS[snapshot.error.kind] ?? snapshot.error.message) : 'n/a';
  return `${snapshot.label}: n/a (${reason})`;
}

function snapshotDetails(snapshot: UsageSnapshot): string[] {
  const lines: string[] = [];
  if (snapshot.used !== undefined && snapshot.limit !== undefined) {
    const value =
      snapshot.unit === 'usd'
        ? `$${(snapshot.used / 100).toFixed(2)} of $${(snapshot.limit / 100).toFixed(2)}`
        : `${snapshot.used.toLocaleString('en-US')} of ${snapshot.limit.toLocaleString('en-US')} credits`;
    lines.push(`${snapshot.label}: ${value}`);
  }
  if (snapshot.error) {
    lines.push(`${snapshot.label}: ${snapshot.error.message}`);
  }
  return lines;
}

export interface UsageThresholds {
  /** Usage percentage at which the item turns to the warning colour. */
  warning: number;
  /** Usage percentage at which the item turns to the error colour. */
  error: number;
}

export function buildModel(
  snapshots: UsageSnapshot[],
  workdays: WorkdayStats,
  thresholds: UsageThresholds,
): UsageModel {
  const measured = snapshots
    .map((snapshot) => snapshot.usedPct)
    .filter((pct): pct is number => pct !== null);

  const usagePct =
    measured.length === 0 ? null : measured.reduce((sum, pct) => sum + pct, 0) / measured.length;
  const monthPct = workdayPercent(workdays);

  let level: UsageLevel = 'ok';
  if (usagePct !== null) {
    if (usagePct >= thresholds.error) {
      level = 'error';
    } else if (usagePct >= thresholds.warning) {
      level = 'warning';
    }
  }

  const details = [
    `Working month: ${workdays.elapsed} of ${workdays.total} days`,
    ...snapshots.flatMap(snapshotDetails),
  ];

  return {
    usagePct,
    monthPct,
    level,
    text: `Usage: ${formatPercent(usagePct)} / Month: ${formatPercent(monthPct)}`,
    summary: snapshots.map(snapshotSummary).join(' - '),
    details,
  };
}
