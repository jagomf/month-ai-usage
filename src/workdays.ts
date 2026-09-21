export interface WorkdayStats {
  /** Working days in the calendar month of the given date. */
  total: number;
  /** Working days already elapsed, counting today as a whole day. */
  elapsed: number;
}

export const DEFAULT_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Keeps only valid weekday numbers (0 = Sunday … 6 = Saturday), falling back to Mon-Fri. */
export function normalizeWorkingDays(workingDays: readonly number[] | undefined): Set<number> {
  const valid = (workingDays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return new Set(valid.length > 0 ? valid : DEFAULT_WORKING_DAYS);
}

export function workdayStats(date: Date, workingDays?: readonly number[]): WorkdayStats {
  const days = normalizeWorkingDays(workingDays);
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let total = 0;
  let elapsed = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (!days.has(new Date(year, month, day).getDay())) {
      continue;
    }
    total++;
    if (day <= today) {
      elapsed++;
    }
  }
  return { total, elapsed };
}

export function workdayPercent(stats: WorkdayStats): number {
  return stats.total === 0 ? 0 : (stats.elapsed / stats.total) * 100;
}
