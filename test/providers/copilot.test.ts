import * as assert from 'assert';

import { fetchCopilotUsage, parseCopilot } from '../../src/providers/copilot';
import { FetchResponse, ProviderError } from '../../src/providers/types';
import { loadFixture } from '../fixtures';

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

suite('parseCopilot', () => {
  test('reads the premium_interactions quota', () => {
    const snapshot = parseCopilot(loadFixture('copilot-user.json'));
    assert.strictEqual(snapshot.used, 750);
    assert.strictEqual(snapshot.limit, 1000);
    assert.strictEqual(snapshot.usedPct, 75);
    assert.strictEqual(snapshot.unit, 'credits');
  });

  test('an unlimited quota yields no percentage', () => {
    const snapshot = parseCopilot(loadFixture('copilot-unlimited.json'));
    assert.strictEqual(snapshot.usedPct, null);
    assert.strictEqual(snapshot.unlimited, true);
  });

  test('credits_used wins over entitlement - remaining', () => {
    const snapshot = parseCopilot(loadFixture('copilot-credits-used.json'));
    assert.strictEqual(snapshot.used, 770);
    assert.strictEqual(snapshot.usedPct, 77);
  });

  test('without premium_interactions it picks the largest entitlement', () => {
    let reported: string | undefined;
    const snapshot = parseCopilot(loadFixture('copilot-no-premium.json'), (quotaId) => {
      reported = quotaId;
    });
    assert.strictEqual(reported, 'ai_credits');
    assert.strictEqual(snapshot.used, 400);
    assert.strictEqual(snapshot.usedPct, 80);
  });

  test('a broken schema throws a schema ProviderError', () => {
    assert.throws(
      () => parseCopilot(loadFixture('copilot-broken.json')),
      (error: unknown) => error instanceof ProviderError && error.kind === 'schema',
    );
  });
});

suite('fetchCopilotUsage', () => {
  test('without a token it asks for authentication', async () => {
    await assert.rejects(
      fetchCopilotUsage({ fetch: () => Promise.resolve(response(200)), getToken: () => Promise.resolve(null) }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'auth',
    );
  });

  test('401 maps to an auth error', async () => {
    await assert.rejects(
      fetchCopilotUsage({
        fetch: () => Promise.resolve(response(401)),
        getToken: () => Promise.resolve('token'),
      }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'auth',
    );
  });

  test('404 means the account has no Copilot', async () => {
    await assert.rejects(
      fetchCopilotUsage({
        fetch: () => Promise.resolve(response(404)),
        getToken: () => Promise.resolve('token'),
      }),
      (error: unknown) => error instanceof ProviderError && error.kind === 'config',
    );
  });

  test('429 propagates Retry-After', async () => {
    await assert.rejects(
      fetchCopilotUsage({
        fetch: () => Promise.resolve(response(429, {}, { 'retry-after': '120' })),
        getToken: () => Promise.resolve('token'),
      }),
      (error: unknown) =>
        error instanceof ProviderError && error.kind === 'ratelimit' && error.retryAfterMs === 120_000,
    );
  });

  test('a successful response returns the snapshot', async () => {
    const snapshot = await fetchCopilotUsage({
      fetch: () => Promise.resolve(response(200, loadFixture('copilot-user.json'))),
      getToken: () => Promise.resolve('token'),
    });
    assert.strictEqual(snapshot.usedPct, 75);
  });
});
