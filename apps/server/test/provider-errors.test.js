import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluationFailure } from '../src/provider-errors.js';
test('provider failures give actionable safe messages without echoing upstream content', () => {
  for (const [error, pattern] of [
    [{ providerStatus: 402 }, /credit/],
    [{ providerStatus: 401 }, /API key/],
    [{ providerStatus: 403 }, /permissions/],
    [{ providerStatus: 400 }, /request format/],
    [{ providerStatus: 404 }, /model/],
    [{ providerStatus: 429 }, /usage limit/],
    [{ name: 'TimeoutError' }, /too long/],
    [{ code: 'AI_INVALID_RESPONSE' }, /invalid score/],
    [{ providerStatus: 502 }, /unavailable/],
  ]) {
    const message = evaluationFailure({ ...error, message: 'PRIVATE PROVIDER CONTENT' });
    assert.match(message, pattern);
    assert.ok(!message.includes('PRIVATE'));
  }
});
