import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../src/llm.js';
import { metrics } from '../src/domain.js';

const make = () => createLlm({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'fake-test-key' });
const evaluation = {
  ...Object.fromEntries(metrics.map((k) => [k, 8])),
  flags: [],
  follow_up_needed: true,
  follow_up_question: 'Which module supports your goal?',
  reasoning: 'Specific evidence.',
  feedback: 'Name the relevant modules.',
  missing_information: ['Modules'],
  contradictions: [],
};
test('Groq validates structured evaluation, preserves context and makes no Gemini calls', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'openai/gpt-oss-120b');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(JSON.parse(body.messages[1].content).profile.course, 'MSc Business');
    return {
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(evaluation) } }],
      }),
    };
  });
  const llm = make(),
    e = await llm.evaluateAnswer({
      profile: { course: 'MSc Business' },
      question: {},
      answer: 'My answer',
      prior_qa: [],
    });
  assert.equal(e.accuracy, null);
  assert.equal(llm.generateFollowUp(e), evaluation.follow_up_question);
  const report = await llm.generateFinalReport({
    answers: [{ evaluation: e, category: 'Course', weight: 1, question_text: 'Why?', id: 'a' }],
  });
  assert.equal(report.source, 'groq');
  assert.equal(report.overall_score, 80);
  assert.equal(calls, 1);
});
test('Groq quota failure does not retry or leak provider response bodies', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: false, status: 429, text: async () => 'secret echoed by provider' };
  });
  await assert.rejects(make().evaluateAnswer({}), /free-tier rate limit/);
  assert.equal(calls, 1);
});
test('Groq rejects truncated and invalid responses', async (t) => {
  let finish = 'length';
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ choices: [{ finish_reason: finish, message: { content: '{}' } }] }),
  }));
  await assert.rejects(make().evaluateAnswer({ question: {} }), /incomplete/);
  finish = 'stop';
  await assert.rejects(make().evaluateAnswer({ question: {} }));
  assert.throws(() => createLlm({ LLM_PROVIDER: 'groq' }), /GROQ_API_KEY/);
});
