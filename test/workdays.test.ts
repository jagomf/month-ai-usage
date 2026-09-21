import * as assert from 'assert';

import { workdayStats } from '../src/workdays';

interface Case {
  date: [number, number, number];
  workingDays?: number[];
  total: number;
  elapsed: number;
  note: string;
}

const CASES: Case[] = [
  { date: [2026, 8, 21], total: 22, elapsed: 15, note: 'Monday mid-month' },
  { date: [2026, 8, 30], total: 22, elapsed: 22, note: 'last working day of the month' },
  { date: [2026, 8, 5], total: 22, elapsed: 4, note: 'Saturday adds nothing over Friday' },
  { date: [2026, 8, 6], total: 22, elapsed: 4, note: 'Sunday adds nothing either' },
  { date: [2026, 8, 7], total: 22, elapsed: 5, note: 'the following Monday' },
  { date: [2026, 7, 1], total: 21, elapsed: 0, note: 'month starting on a Saturday' },
  { date: [2026, 7, 3], total: 21, elapsed: 1, note: 'first working day of that month' },
  { date: [2028, 1, 29], total: 21, elapsed: 21, note: 'leap February, fully elapsed' },
  { date: [2026, 6, 31], total: 23, elapsed: 23, note: '31-day month with 23 working days' },
  { date: [2026, 8, 21], workingDays: [0, 1, 2, 3, 4], total: 22, elapsed: 15, note: 'Sunday-to-Thursday week' },
  { date: [2026, 8, 21], workingDays: [1], total: 4, elapsed: 3, note: 'Mondays only' },
  { date: [2026, 8, 21], workingDays: [], total: 22, elapsed: 15, note: 'empty list falls back to Mon-Fri' },
  { date: [2026, 8, 21], workingDays: [9, -1], total: 22, elapsed: 15, note: 'invalid values fall back to Mon-Fri' },
];

suite('workdayStats', () => {
  for (const testCase of CASES) {
    const [year, month, day] = testCase.date;
    const label = `${year}-${month + 1}-${day} (${testCase.note})`;
    test(label, () => {
      const stats = workdayStats(new Date(year, month, day), testCase.workingDays);
      assert.strictEqual(stats.total, testCase.total, 'total');
      assert.strictEqual(stats.elapsed, testCase.elapsed, 'elapsed');
    });
  }
});
