import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../src/llm.js';
import { metrics } from '../src/domain.js';

const make = (env = {}) =>
  createLlm({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'fake-test-key', ...env });
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
test('OpenAI validates structured evaluation, preserves context and makes no Gemini calls', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.5');
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
  assert.equal(report.source, 'openai');
  assert.equal(report.overall_score, 80);
  assert.equal(calls, 1);
});
test('OpenAI honours model and base URL overrides', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://gateway.example/v1/chat/completions');
    assert.equal(JSON.parse(options.body).model, 'gpt-5.5-turbo');
    return {
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(evaluation) } }],
      }),
    };
  });
  const llm = make({ OPENAI_MODEL: 'gpt-5.5-turbo', OPENAI_BASE_URL: 'https://gateway.example/v1/' });
  await llm.evaluateAnswer({ profile: {}, question: {}, answer: 'x', prior_qa: [] });
});
test('OpenAI quota failure does not retry or leak provider response bodies', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: false, status: 429, text: async () => 'secret echoed by provider' };
  });
  await assert.rejects(make().evaluateAnswer({}), /rate limit reached/);
  assert.equal(calls, 1);
});
test('OpenAI rejects truncated and invalid responses', async (t) => {
  let finish = 'length';
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ choices: [{ finish_reason: finish, message: { content: '{}' } }] }),
  }));
  await assert.rejects(make().evaluateAnswer({ question: {} }), /incomplete/);
  finish = 'stop';
  await assert.rejects(make().evaluateAnswer({ question: {} }));
  assert.throws(() => createLlm({ LLM_PROVIDER: 'openai' }), /OPENAI_API_KEY/);
});
