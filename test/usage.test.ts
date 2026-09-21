import * as assert from 'assert';

import { UsageSnapshot } from '../src/providers/types';
import { buildModel } from '../src/usage';

const WORKDAYS = { total: 20, elapsed: 10 }; // 50 % of the working month
const THRESHOLDS = { warning: 80, error: 95 };

function snapshot(provider: 'copilot' | 'claude', usedPct: number | null, extra: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    provider,
    label: provider === 'copilot' ? 'Copilot' : 'Claude',
    usedPct,
    ...extra,
  };
}

suite('buildModel', () => {
  test('averages both providers', () => {
    const model = buildModel([snapshot('copilot', 40), snapshot('claude', 60)], WORKDAYS, THRESHOLDS);
    assert.strictEqual(model.usagePct, 50);
    assert.strictEqual(model.monthPct, 50);
    assert.strictEqual(model.text, 'Usage: 50% / Month: 50%');
    assert.strictEqual(model.summary, 'Copilot: 40% - Claude: 60%');
  });

  test('uses the only available provider when the other one fails', () => {
    const model = buildModel(
      [snapshot('copilot', 80), snapshot('claude', null, { error: { kind: 'auth', message: 'expired' } })],
      WORKDAYS,
      THRESHOLDS,
    );
    assert.strictEqual(model.usagePct, 80);
    assert.strictEqual(model.summary, 'Copilot: 80% - Claude: n/a (session expired)');
  });

  test('with no data at all usage is unknown and the level stays ok', () => {
    const model = buildModel([], WORKDAYS, THRESHOLDS);
    assert.strictEqual(model.usagePct, null);
    assert.strictEqual(model.text, 'Usage: --% / Month: 50%');
    assert.strictEqual(model.level, 'ok');
  });

  test('an unlimited provider is left out of the average', () => {
    const model = buildModel(
      [snapshot('copilot', null, { unlimited: true }), snapshot('claude', 30)],
      WORKDAYS,
      THRESHOLDS,
    );
    assert.strictEqual(model.usagePct, 30);
    assert.strictEqual(model.summary, 'Copilot: unlimited - Claude: 30%');
  });

  test('colour levels depend on total usage, not on the elapsed month', () => {
    const earlyMonth = { total: 20, elapsed: 1 };
    assert.strictEqual(buildModel([snapshot('copilot', 10)], earlyMonth, THRESHOLDS).level, 'ok');
    assert.strictEqual(buildModel([snapshot('copilot', 79.9)], WORKDAYS, THRESHOLDS).level, 'ok');
    assert.strictEqual(buildModel([snapshot('copilot', 80)], WORKDAYS, THRESHOLDS).level, 'warning');
    assert.strictEqual(buildModel([snapshot('copilot', 94.9)], WORKDAYS, THRESHOLDS).level, 'warning');
    assert.strictEqual(buildModel([snapshot('copilot', 95)], WORKDAYS, THRESHOLDS).level, 'error');
  });

  test('rounds the status bar text to the nearest integer', () => {
    const model = buildModel(
      [snapshot('copilot', 66.4), snapshot('claude', 66.4)],
      { total: 3, elapsed: 1 },
      THRESHOLDS,
    );
    assert.strictEqual(model.text, 'Usage: 66% / Month: 33%');
  });

  test('details include the working days and the spend', () => {
    const model = buildModel(
      [snapshot('claude', 20, { used: 10000, limit: 50000, unit: 'usd' })],
      WORKDAYS,
      THRESHOLDS,
    );
    assert.deepStrictEqual(model.details, [
      'Working month: 10 of 20 days',
      'Claude: $100.00 of $500.00',
    ]);
  });
});
