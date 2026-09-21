import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../src/llm.js';
import { metrics, buildReport } from '../src/domain.js';
import { transition } from '../../web/src/services/machine.js';
const reportOutput = {
  overall_score: 82,
  readiness_level: 'Ready',
  category_scores: { 'UK choice': 80, Finance: 84 },
  strong_areas: ['UK choice', 'Finance'],
  weak_areas: [],
  poor_answers: [],
  missing_information: ['Funding details'],
  contradictions: [],
  recommendations: ['Add concrete budget numbers.'],
};
function geminiProvider() {
  return createLlm({
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-only-not-a-real-key',
    GEMINI_MODEL: 'test-model',
  });
}
const evaluatedAnswer = (id, category) => ({
  id,
  question_text: `Question ${id}`,
  category,
  weight: 1,
  is_followup: false,
  transcript: 'My detailed answer.',
  evaluation: {
    ...Object.fromEntries(metrics.map((k) => [k, 8])),
    flags: ['formulaic_indicator'],
    follow_up_needed: false,
    follow_up_question: null,
    reasoning: 'NOT SENT TO THE REPORT CALL',
    feedback: 'Be specific.',
    missing_information: ['Funding details'],
    contradictions: [],
  },
});
test('Gemini adapter validates output and does not assign unsupported factual accuracy', async (t) => {
  const output = {
    ...Object.fromEntries(metrics.map((k) => [k, 7])),
    flags: [],
    follow_up_needed: false,
    follow_up_question: null,
    reasoning: 'Evidence summary',
    feedback: 'Be specific.',
    missing_information: [],
    contradictions: [],
  };
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      }),
    };
  });
  const provider = createLlm({
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-only-not-a-real-key',
    GEMINI_MODEL: 'test-model',
  });
  const result = await provider.evaluateAnswer({
    profile: {},
    question: { verified_context: '', source_url: '' },
    answer: 'My answer',
    prior_qa: [],
  });
  assert.equal(result.accuracy, null);
  assert(!sent.url.includes('test-only-not-a-real-key'));
  assert.equal(JSON.parse(sent.options.body).generationConfig.responseMimeType, 'application/json');
  output.relevance = 500;
  await assert.rejects(provider.evaluateAnswer({ question: {} }));
});
test('embedding signal informs consistency_with_profile without leaking or deciding scores', async (t) => {
  const output = {
    ...Object.fromEntries(metrics.map((k) => [k, 7])),
    flags: [],
    follow_up_needed: false,
    follow_up_question: null,
    reasoning: 'Evidence summary',
    feedback: 'Be specific.',
    missing_information: [],
    contradictions: [],
  };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    if (url.includes(':batchEmbedContents'))
      return {
        ok: true,
        json: async () => ({
          embeddings: [
            { values: [0.9, 0.1, 0.4] },
            { values: [0.9, 0.1, 0.4] },
            { values: [0.2, 0.8, 0.3] },
            { values: [0.9, 0.1, 0.4] },
          ],
        }),
      };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      }),
    };
  });
  const provider = geminiProvider();
  const result = await provider.evaluateAnswer({
    profile: {
      funding_details: 'Parents sponsor about £25,000 per year.',
      tuition_fee: 16000,
      scholarship: 0,
    },
    question: { category: 'Finance', verified_context: '', source_url: '' },
    answer: 'My parents sponsor my studies with a joint income around £25k per year.',
    prior_qa: [],
  });
  assert.equal(result.accuracy, null);
  assert.equal(calls.filter((o) => o.url.includes(':batchEmbedContents')).length, 1);
  const evaluationCall = JSON.parse(calls.at(-1).body);
  const prompt = evaluationCall.contents[0].parts[0].text;
  assert(prompt.includes('semantic_consistency'));
  assert(!prompt.includes('test-only-not-a-real-key'));
  const signal = JSON.parse(prompt).semantic_consistency;
  assert.equal(signal.source, 'gemini-embedding-001');
  assert(Math.abs(signal.mean - 0.812) < 0.01);
  assert(Math.abs(signal.fields.funding - 1) < 0.01);
  assert(Math.abs(signal.fields['tuition fee'] - 0.437) < 0.01);
  assert(Math.abs(signal.fields.scholarship - 1) < 0.01);
});
test('failed embedding falls back to full LLM evaluation without a signal', async (t) => {
  const output = {
    ...Object.fromEntries(metrics.map((k) => [k, 6])),
    flags: [],
    follow_up_needed: false,
    follow_up_question: null,
    reasoning: 'Evidence summary',
    feedback: 'Be specific.',
    missing_information: [],
    contradictions: [],
  };
  const evaluationBody = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes(':batchEmbedContents'))
      return { ok: false, status: 429, json: async () => ({}) };
    evaluationBody.push(options);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      }),
    };
  });
  const result = await geminiProvider().evaluateAnswer({
    profile: { funding_details: 'Parents fund my studies.' },
    question: { category: 'Finance', verified_context: '', source_url: '' },
    answer: 'My parents pay.',
    prior_qa: [],
  });
  assert.equal(result.relevance, 6);
  assert.equal(evaluationBody.length, 1);
  const prompt = JSON.parse(evaluationBody[0].body).contents[0].parts[0].text;
  assert(!prompt.includes('semantic_consistency'));
});
test('Gemini report generator aggregates evaluations into a validated, enriched report', async (t) => {
  const session = {
    id: 'session-1',
    profile_snapshot: { course: 'BSc Law', funding_details: 'Parents' },
    answers: [
      evaluatedAnswer('a1', 'UK choice'),
      { ...evaluatedAnswer('a2', 'Finance'), question_text: 'How will you fund it?' },
    ],
  };
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, ...JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(reportOutput) }] } }],
      }),
    };
  });
  const report = await geminiProvider().generateFinalReport(session);
  assert.equal(report.overall_score, 82);
  assert.equal(report.readiness_level, 'Ready');
  assert.equal(report.evaluated_answers, 2);
  assert.equal(report.total_answers, 2);
  assert.equal(report.notice.length > 40, true);
  const input = sent.contents[0].parts[0].text;
  assert(input.includes('BSc Law'));
  assert(
    !input.includes('NOT SENT TO THE REPORT CALL'),
    'internal reasoning must never leave the server',
  );
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert(!sent.url.includes('test-only-not-a-real-key'));
});
test('Gemini report forces Not evaluated for partially evaluated sessions and strips fences', async (t) => {
  const session = {
    id: 'session-2',
    profile_snapshot: {},
    answers: [
      evaluatedAnswer('a1', 'Finance'),
      { ...evaluatedAnswer('a2', 'Finance'), evaluation: null },
    ],
  };
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        { content: { parts: [{ text: '```json\n' + JSON.stringify(reportOutput) + '\n```' }] } },
      ],
    }),
  }));
  const report = await geminiProvider().generateFinalReport(session);
  assert.equal(report.overall_score, null);
  assert.equal(report.readiness_level, 'Not evaluated');
  assert.equal(report.evaluated_answers, 1);
  assert.equal(report.total_answers, 2);
});
test('Gemini report returns null without any evaluated answer and disabled provider always returns null', async () => {
  assert.equal(
    await geminiProvider().generateFinalReport({ answers: [{ evaluation: null }] }),
    null,
  );
  const disabled = createLlm({ LLM_PROVIDER: 'disabled' });
  assert.equal(await disabled.generateFinalReport({ answers: [] }), null);
});
test('report refuses partial evaluation scores and excludes null metrics', () => {
  const evaluation = {
    ...Object.fromEntries(metrics.map((k) => [k, k === 'accuracy' ? null : 8])),
    missing_information: [],
    contradictions: [],
    feedback: 'Add examples.',
  };
  const answer = { id: 'a', question_text: 'Why?', category: 'Plans', weight: 1, evaluation };
  const report = buildReport({ answers: [answer] });
  assert.equal(report.overall_score, 80);
  assert.equal(report.readiness_level, 'Ready');
  assert.equal(
    buildReport({ answers: [answer, { ...answer, evaluation: null }] }).overall_score,
    null,
  );
});
test('client recording/submission transitions reject invalid state changes', () => {
  assert.equal(transition('MAIN_QUESTION', 'RECORD'), 'RECORDING');
  assert.equal(transition('RECORDING', 'STOP'), 'TRANSCRIPTION');
  assert.equal(transition('TRANSCRIPTION', 'SUBMIT'), 'EVALUATION');
  assert.equal(transition('EVALUATION', 'FAIL'), 'TRANSCRIPTION');
  assert.throws(() => transition('RECORDING', 'SUBMIT'));
});
