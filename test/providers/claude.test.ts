import * as assert from 'assert';

import {
  buildClaudeSnapshot,
  fetchClaudeUsage,
  parseSpend,
  parseSpendLimit,
  parseUsage,
  pickOrganizationId,
  spendRange,
} from '../../src/providers/claude';
import { FetchResponse, ProviderError } from '../../src/providers/types';
import { loadFixture } from '../fixtures';

const ORG = '22222222-2222-4222-8222-222222222222';

/** Routes are matched in declaration order; the `''` key acts as a catch-all. */
function routedFetch(routes: Record<string, unknown>, status = 200): (url: string) => Promise<FetchResponse> {
  return (url: string) => {
    const key = Object.keys(routes).find((route) => url.includes(route));
    const body = key === undefined ? {} : routes[key];
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  };
}

suite('pickOrganizationId', () => {
  test('prefers the enterprise organization', () => {
    assert.strictEqual(pickOrganizationId(loadFixture('claude-organizations.json')), ORG);
  });

  test('an empty array is a schema error', () => {
    assert.throws(
      () => pickOrganizationId([]),
      (error: unknown) => error instanceof ProviderError && error.kind === 'schema',
    );
  });
});

suite('parseSpendLimit', () => {
  test('returns the limit in cents', () => {
    assert.strictEqual(parseSpendLimit(loadFixture('claude-spend-limit.json')), 50000);
  });

  test('a disabled limit does not count', () => {
    assert.strictEqual(parseSpendLimit(loadFixture('claude-spend-limit-disabled.json')), undefined);
  });

  test('an organization-wide pool is not the user allowance', () => {
    assert.strictEqual(parseSpendLimit(loadFixture('claude-spend-limit-org.json')), undefined);
  });
});

suite('parseUsage', () => {
  test('reads spend.used and spend.limit', () => {
    assert.deepStrictEqual(parseUsage(loadFixture('claude-usage.json')), {
      usedMinorUnits: 29500,
      limitMinorUnits: 50000,
    });
  });

  test('falls back to extra_usage and rounds the credits', () => {
    assert.deepStrictEqual(parseUsage(loadFixture('claude-usage-extra-only.json')), {
      usedMinorUnits: 29500,
      limitMinorUnits: 50000,
    });
  });

  test('an unrelated payload yields nothing', () => {
    assert.deepStrictEqual(parseUsage({ five_hour: null }), {});
  });
});

suite('parseSpend', () => {
  test('adds up totals', () => {
    assert.strictEqual(parseSpend(loadFixture('claude-spend.json')), 1000);
  });

  test('without totals it adds up the series', () => {
    assert.strictEqual(parseSpend(loadFixture('claude-spend-series-only.json')), 600);
  });

  test('neither totals nor series is a schema error', () => {
    assert.throws(
      () => parseSpend({ currency: 'usd' }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'schema',
    );
  });
});

suite('buildClaudeSnapshot', () => {
  test('computes the percentage against the limit', () => {
    const snapshot = buildClaudeSnapshot(1000, 50000);
    assert.strictEqual(snapshot.usedPct, 2);
    assert.strictEqual(snapshot.unit, 'usd');
  });

  test('without a known limit there is no percentage', () => {
    const snapshot = buildClaudeSnapshot(1000, undefined);
    assert.strictEqual(snapshot.usedPct, null);
    assert.strictEqual(snapshot.error?.kind, 'config');
  });
});

suite('spendRange', () => {
  test('uses UTC dates from the 1st', () => {
    assert.deepStrictEqual(spendRange(new Date('2026-09-21T22:30:00Z')), {
      start: '2026-09-01',
      end: '2026-09-21',
    });
  });
});

suite('fetchClaudeUsage', () => {
  const routes = {
    'usage/spend': loadFixture('claude-spend.json'),
    'usage': loadFixture('claude-usage.json'),
    overage_spend_limit: loadFixture('claude-spend-limit-org.json'),
    '': loadFixture('claude-organizations.json'),
  };

  test('without a session key it asks for configuration', async () => {
    await assert.rejects(
      fetchClaudeUsage({ fetch: routedFetch(routes), getSessionKey: () => Promise.resolve(undefined) }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'config',
    );
  });

  test('uses the personal spend from /usage, not the organization pool', async () => {
    const snapshot = await fetchClaudeUsage({
      fetch: routedFetch(routes),
      getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
      organizationId: ORG,
      now: new Date('2026-09-21T00:00:00Z'),
    });
    assert.strictEqual(snapshot.used, 29500);
    assert.strictEqual(snapshot.limit, 50000);
    assert.strictEqual(snapshot.usedPct, 59);
  });

  test('falls back to usage/spend when /usage has no figures', async () => {
    const snapshot = await fetchClaudeUsage({
      fetch: routedFetch({
        'usage/spend': loadFixture('claude-spend.json'),
        usage: { five_hour: null },
        '': loadFixture('claude-organizations.json'),
      }),
      getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
      organizationId: ORG,
      monthlyLimitUsd: 100,
      now: new Date('2026-09-21T00:00:00Z'),
    });
    assert.strictEqual(snapshot.used, 1000);
    assert.strictEqual(snapshot.usedPct, 10);
  });

  test('the setting overrides the limit', async () => {
    const snapshot = await fetchClaudeUsage({
      fetch: routedFetch(routes),
      getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
      organizationId: ORG,
      monthlyLimitUsd: 1000,
      now: new Date('2026-09-21T00:00:00Z'),
    });
    assert.strictEqual(snapshot.limit, 100000);
    assert.strictEqual(snapshot.usedPct, 29.5);
  });

  test('discovers the organization when it is not configured', async () => {
    let discovered: string | undefined;
    const snapshot = await fetchClaudeUsage({
      fetch: routedFetch(routes),
      getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
      onOrganizationId: (id) => {
        discovered = id;
      },
      now: new Date('2026-09-21T00:00:00Z'),
    });
    assert.strictEqual(discovered, ORG);
    assert.strictEqual(snapshot.usedPct, 59);
  });

  test('a 403 maps to an auth error', async () => {
    await assert.rejects(
      fetchClaudeUsage({
        fetch: routedFetch(routes, 403),
        getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
        organizationId: ORG,
      }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'auth',
    );
  });

  test('a 403 with an HTML challenge is reported as bot protection', async () => {
    const html = '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>';
    await assert.rejects(
      fetchClaudeUsage({
        fetch: () =>
          Promise.resolve({
            ok: false,
            status: 403,
            headers: { get: () => null },
            json: () => Promise.reject(new Error('not json')),
            text: () => Promise.resolve(html),
          }),
        getSessionKey: () => Promise.resolve('sk-ant-sid01-test'),
        organizationId: ORG,
      }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'network',
    );
  });
});
