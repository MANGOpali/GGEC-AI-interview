import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotQuestion,
  packQuestion,
  referenceSchema,
  unpackQuestion,
} from '../src/practice.js';
test('expired and legacy course evidence is not usable; new reference survives serialization', () => {
  const profile = { university: 'Example', course: 'Business', intake: 'September' };
  const reference = {
    ...profile,
    checked_on: '2020-01-01',
    valid_until: '2020-02-01',
    modules: '',
    fees: '',
    facts: 'Fictional facts',
  };
  const q = packQuestion(
    { source_url: 'https://example.org', verified_context: '' },
    { reference },
    'reviewer',
  );
  assert.equal(unpackQuestion(q).reference.checked_by, 'reviewer');
  assert.equal(snapshotQuestion(q, profile, '2020-01-15').reference_status, 'matched');
  assert.equal(snapshotQuestion(q, profile, '2020-03-15').source_url, '');
  assert.equal(
    snapshotQuestion(
      { source_url: 'https://example.org', verified_context: 'Undated text' },
      profile,
    ).verified_context,
    '',
  );
  assert.throws(() =>
    referenceSchema.parse({ ...reference, checked_on: '2999-01-01', valid_until: '2999-02-01' }),
  );
});
