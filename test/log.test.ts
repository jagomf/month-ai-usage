import * as assert from 'assert';

import { redact } from '../src/log';

suite('redact', () => {
  test('hides the claude.ai cookie', () => {
    assert.strictEqual(redact('Cookie: sessionKey=sk-ant-sid01-abc_DEF-123'), 'Cookie: sessionKey=«redacted»');
  });

  test('hides the GitHub token', () => {
    assert.strictEqual(redact('Authorization: Bearer ghu_abc123'), 'Authorization: Bearer «redacted»');
  });

  test('hides emails and uuids', () => {
    assert.strictEqual(
      redact('user@example.com 22222222-2222-4222-8222-222222222222'),
      '«redacted» «redacted»',
    );
  });

  test('hides the login and the organization name', () => {
    const dump = '{"login": "someone_corp", "name": "Example Corp", "analytics_tracking_id": "abc"}';
    assert.strictEqual(
      redact(dump),
      '{"login": "«redacted»", "name": "«redacted»", "analytics_tracking_id": "«redacted»"}',
    );
  });

  test('hides company domain lists', () => {
    assert.strictEqual(
      redact('{"allowed_invite_domains": ["acme.com", "acme.es"]}'),
      '{"allowed_invite_domains": ["«redacted»"]}',
    );
  });

  test('leaves usage figures untouched', () => {
    assert.strictEqual(redact('{"credits_used": 750}'), '{"credits_used": 750}');
  });
});
