import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator } from '../src/evaluator.js';
import { metrics } from '../src/domain.js';
const seedQuestions = [
  { id: 'e-1', category: 'Fixture A', text: 'Question one?', weight: 1 },
  { id: 'e-2', category: 'Fixture B', text: 'Question two?', weight: 1 },
  { id: 'e-3', category: 'Fixture C', text: 'Question three?', weight: 1 },
];
const evaluated = () => ({
  ...Object.fromEntries(metrics.map((k) => [k, 8])),
  flags: [],
  follow_up_needed: false,
  follow_up_question: null,
  reasoning: 'Evidence summary',
  feedback: 'Be specific.',
  missing_information: [],
  contradictions: [],
});
const aiReport = (s) => ({
  source: 'gemini',
  overall_score: null,
  readiness_level: 'Not evaluated',
  category_scores: {},
  strong_areas: [],
  weak_areas: [],
  poor_answers: [],
  missing_information: [],
  contradictions: [],
  recommendations: [],
  evaluated_answers: s.answers.filter((a) => a.evaluation).length,
  total_answers: s.answers.length,
  notice: 'notice',
});
function fakeRepo(db) {
  return {
    db,
    async sessions() {
      return db.map((s) => structuredClone(s));
    },
    async session(id) {
      const s = db.find((x) => x.id === id);
      return s ? structuredClone(s) : null;
    },
    async saveSession(s, expected) {
      const i = db.findIndex((x) => x.id === s.id);
      assert.notEqual(i, -1);
      assert.equal(db[i].version, expected, 'saveSession used a stale version');
      db[i] = structuredClone(s);
      db[i].version = expected + 1;
      return structuredClone(db[i]);
    },
  };
}
function fakeLlm({ evalFailures = 0, reportFails = false, calls = { eval: 0, report: 0 } } = {}) {
  return {
    name: 'gemini',
    async evaluateAnswer(context) {
      calls.eval++;
      if (calls.eval <= evalFailures) throw new Error('quota');
      assert(context.question.category, 'question must carry its category');
      return { ...evaluated(), follow_up_question: null };
    },
    generateFollowUp(e) {
      return e?.follow_up_needed ? e.follow_up_question : null;
    },
    async generateFinalReport(s) {
      calls.report++;
      if (reportFails) throw new Error('report outage');
      return aiReport(s);
    },
  };
}
const session = (id, answers = []) => ({
  id,
  student_id: '10000000-0000-4000-8000-000000000001',
  version: 3,
  state: 'REPORT',
  index: seedQuestions.length,
  profile_snapshot: { course: 'MSc Business', funding_details: 'Parents sponsor' },
  answers,
  pending_follow_up: null,
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  report: null,
});
const answer = (i, question, evaluation = null) => ({
  id: `a-${i}`,
  request_id: `req-${i}`,
  question_id: question.id,
  question_text: question.text,
  category: question.category,
  weight: question.weight,
  transcript: `Answer for question ${i}`,
  evaluation,
  is_followup: false,
  parent_answer_id: null,
  created_at: new Date().toISOString(),
});
test('deferred evaluator scores missing answers then writes an AI report', async () => {
  const calls = { eval: 0, report: 0 };
  const s = session('s1', [
    answer(0, seedQuestions[0], evaluated()),
    answer(1, seedQuestions[1]),
    answer(2, seedQuestions[2]),
  ]);
  const repo = fakeRepo([s]);
  const ev = createEvaluator({ repo, llm: fakeLlm({ calls }), minIntervalMs: 0, retryWaitMs: 0 });
  ev.enqueue(s);
  await ev.idle();
  const saved = repo.db[0];
  assert.equal(calls.eval, 2);
  assert(saved.answers.every((a) => a.evaluation));
  assert.equal(saved.report.source, 'gemini');
});
test('deferred evaluator keeps pending work queued while quota recovers and later completes', async () => {
  const calls = { eval: 0, report: 0 };
  const s = session('s2', [answer(0, seedQuestions[0]), answer(1, seedQuestions[1])]);
  const repo = fakeRepo([s]);
  const ev = createEvaluator({
    repo,
    llm: fakeLlm({ evalFailures: 1, calls }),
    minIntervalMs: 0,
    retryWaitMs: 0,
    maxAttempts: 2,
  });
  ev.enqueue(s);
  await ev.idle();
  assert(calls.eval >= 2, 'affter a quota failure the item should be retried');
  assert.equal(
    repo.db[0].answers.every((a) => a.evaluation),
    true,
  );
  assert.equal(repo.db[0].report.source, 'gemini');
});
test('deferred evaluator falls back to a recomputed local report when AI report fails', async () => {
  const calls = { eval: 0, report: 0 };
  const s = session('s3', [answer(0, seedQuestions[0], evaluated()), answer(1, seedQuestions[1])]);
  const repo = fakeRepo([s]);
  const ev = createEvaluator({
    repo,
    llm: fakeLlm({ reportFails: true, calls }),
    minIntervalMs: 0,
    retryWaitMs: 0,
  });
  ev.enqueue(s);
  await ev.idle();
  const saved = repo.db[0];
  assert(saved.answers.every((a) => a.evaluation));
  assert.notEqual(saved.report.source, 'gemini');
  assert.equal(saved.report.overall_score, 80);
});
test('seed() enqueues only sessions that still need evaluation', async () => {
  const calls = { eval: 0, report: 0 };
  const done = session('done', [answer(0, seedQuestions[0], evaluated())]);
  done.report = { source: 'gemini', ...aiReport(done) };
  const repo = fakeRepo([done, session('stuck', [answer(0, seedQuestions[0])])]);
  const ev = createEvaluator({ repo, llm: fakeLlm({ calls }), minIntervalMs: 0, retryWaitMs: 0 });
  assert.equal(await ev.seed(), 1);
  await ev.idle();
  assert.equal(calls.eval, 1);
  assert.equal(
    repo.db.find((x) => x.id === 'stuck').answers[0].evaluation.consistency_with_profile,
    8,
  );
  assert.equal(
    repo.db.find((x) => x.id === 'done').report.source,
    'gemini',
    'finished sessions must not be rewritten',
  );
});
test('deferred evaluation retains question evidence and recomputes a previously partial report', async () => {
  const q = {
    ...seedQuestions[0],
    verified_context: 'Fictional supplied course context',
    source_url: 'https://example.org/course',
    expected_concepts: 'Compare alternatives',
  };
  const s = session('partial', [answer(0, q)]);
  s.questions = [q];
  s.report = aiReport(s);
  const llm = fakeLlm();
  llm.evaluateAnswer = async (context) => {
    assert.equal(context.question.verified_context, q.verified_context);
    assert.equal(context.question.expected_concepts, q.expected_concepts);
    return evaluated();
  };
  const repo = fakeRepo([s]),
    ev = createEvaluator({ repo, llm, minIntervalMs: 0, retryWaitMs: 0 });
  ev.enqueue(s);
  await ev.idle();
  assert.equal(repo.db[0].report.overall_score, 80);
});
test('retained sessions never send removed transcripts for reevaluation', async () => {
  const s = session('purged', [{ ...answer(0, seedQuestions[0]), transcript: null }]);
  s.retained_at = new Date().toISOString();
  const calls = { eval: 0, report: 0 },
    repo = fakeRepo([s]),
    ev = createEvaluator({ repo, llm: fakeLlm({ calls }), minIntervalMs: 0, retryWaitMs: 0 });
  ev.enqueue(s);
  await ev.idle();
  assert.equal(calls.eval, 0);
  assert.equal(calls.report, 0);
});

test('each answer commits before the next provider request, and duplicate clicks are deduplicated', async () => {
  const s = session('progress', [answer(0, seedQuestions[0]), answer(1, seedQuestions[1])]);
  const repo = fakeRepo([s]);
  let release;
  const blocked = new Promise((r) => (release = r));
  let calls = 0;
  const llm = fakeLlm();
  llm.evaluateAnswer = async () => {
    calls++;
    if (calls === 2) {
      assert.equal(repo.db[0].report.evaluated_answers, 1);
      await blocked;
    }
    return evaluated();
  };
  const ev = createEvaluator({ repo, llm, minIntervalMs: 0 });
  await ev.enqueue(s);
  await ev.enqueue(s);
  while (calls < 2) await new Promise((r) => setTimeout(r, 2));
  assert.equal(repo.db[0].evaluation_job.state, 'running');
  assert.equal(repo.db[0].answers[0].answer_score, 80);
  release();
  await ev.idle();
  assert.equal(calls, 2);
  assert.equal(repo.db[0].evaluation_job.state, 'complete');
});

test('restart recovers only explicit jobs and skips their already saved scores', async () => {
  const partial = session('restart', [
    answer(0, seedQuestions[0], evaluated()),
    answer(1, seedQuestions[1]),
  ]);
  partial.evaluation_job = { state: 'running', provider: 'gemini' };
  const historical = session('untouched', [answer(0, seedQuestions[0])]);
  const repo = fakeRepo([partial, historical]),
    calls = { eval: 0, report: 0 };
  const ev = createEvaluator({ repo, llm: fakeLlm({ calls }), minIntervalMs: 0 });
  assert.equal(await ev.recover(), 1);
  await ev.idle();
  assert.equal(calls.eval, 1);
  assert.equal(repo.db[0].report.overall_score, 80);
  assert.equal(repo.db[1].answers[0].evaluation, null);
});

test('quota stops the batch, persists partial progress and permits retry without rescoring successes', async () => {
  const repo = fakeRepo([
    session('quota', [
      answer(0, seedQuestions[0]),
      answer(1, seedQuestions[1]),
      answer(2, seedQuestions[2]),
    ]),
  ]);
  const llm = fakeLlm();
  let calls = 0;
  llm.evaluateAnswer = async () => {
    if (++calls === 2) throw Object.assign(new Error('quota'), { providerStatus: 429 });
    return evaluated();
  };
  const ev = createEvaluator({ repo, llm, minIntervalMs: 0 });
  await ev.enqueue('quota');
  await ev.idle();
  assert.equal(calls, 2);
  assert.equal(repo.db[0].report.evaluated_answers, 1);
  assert.equal(repo.db[0].report.overall_score, null);
  assert.equal(repo.db[0].evaluation_job.state, 'failed');
  assert.match(repo.db[0].evaluation_job.message, /usage limit/);
  await ev.enqueue('quota');
  await ev.idle();
  assert.equal(calls, 4);
  assert.equal(repo.db[0].report.overall_score, 80);
});

test('provider result merges over concurrent hold update and never restores purged transcripts', async () => {
  for (const purge of [false, true]) {
    const repo = fakeRepo([session('concurrent', [answer(0, seedQuestions[0])])]);
    const llm = fakeLlm();
    llm.evaluateAnswer = async () => {
      repo.db[0].review_hold = true;
      repo.db[0].version++;
      if (purge) {
        repo.db[0].retained_at = new Date().toISOString();
        repo.db[0].answers[0].transcript = null;
      }
      return evaluated();
    };
    const ev = createEvaluator({ repo, llm, minIntervalMs: 0 });
    await ev.enqueue('concurrent');
    await ev.idle();
    assert.equal(repo.db[0].review_hold, true);
    assert.equal(repo.db[0].answers[0].evaluation !== null, !purge);
  }
});

test(
  'three workers overlap, save out of order without loss and retain prior answer context',
  { timeout: 5000 },
  async () => {
    const answers = Array.from({ length: 7 }, (_, i) => answer(i, seedQuestions[i % 3]));
    const repo = fakeRepo([session('parallel', answers)]);
    const gates = new Map();
    const llm = fakeLlm();
    let inFlight = 0,
      peak = 0,
      calls = 0;
    llm.evaluateAnswer = async (context) => {
      const i = Number(context.answer.split(' ').at(-1));
      assert.equal(context.prior_qa.length, i);
      calls++;
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => gates.set(i, resolve));
      inFlight--;
      return evaluated();
    };
    const ev = createEvaluator({ repo, llm, concurrency: 3, minIntervalMs: 0 });
    const wait = async (condition) => {
      while (!condition()) await new Promise((r) => setTimeout(r, 2));
    };
    await ev.enqueue('parallel');
    await wait(() => gates.size === 3);
    assert.equal(calls, 3);
    gates.get(2)();
    await wait(() => gates.has(3));
    assert.equal(repo.db[0].answers[2].answer_score, 80);
    assert.equal(repo.db[0].answers[0].evaluation, null);
    gates.get(0)();
    gates.get(1)();
    gates.get(3)();
    await wait(() => gates.size === 7);
    gates.get(4)();
    gates.get(5)();
    gates.get(6)();
    await ev.idle();
    assert.equal(peak, 3);
    assert.equal(calls, 7);
    assert.equal(repo.db[0].report.overall_score, 80);
    assert.equal(repo.db[0].evaluation_job.state, 'complete');
    assert(repo.db[0].answers.every((a) => a.answer_score === 80));
  },
);

test(
  'parallel quota failure drains in-flight scores and retry skips successes',
  { timeout: 5000 },
  async () => {
    const repo = fakeRepo([
      session(
        'parallel-quota',
        Array.from({ length: 6 }, (_, i) => answer(i, seedQuestions[i % 3])),
      ),
    ]);
    const llm = fakeLlm();
    const gates = [];
    let calls = 0;
    llm.evaluateAnswer = async () => {
      const n = calls++;
      await new Promise((r) => (gates[n] = r));
      if (n === 0) throw Object.assign(new Error('quota'), { providerStatus: 429 });
      return evaluated();
    };
    const ev = createEvaluator({ repo, llm, concurrency: 3, minIntervalMs: 0 });
    await ev.enqueue('parallel-quota');
    while (gates.length < 3) await new Promise((r) => setTimeout(r, 2));
    gates[0]();
    await new Promise((r) => setTimeout(r, 10));
    gates[1]();
    gates[2]();
    await ev.idle();
    assert.equal(calls, 3);
    assert.equal(repo.db[0].report.evaluated_answers, 2);
    assert.equal(repo.db[0].report.overall_score, null);
    assert.equal(repo.db[0].evaluation_job.state, 'failed');
    llm.evaluateAnswer = async () => {
      calls++;
      return evaluated();
    };
    await ev.enqueue('parallel-quota');
    await ev.idle();
    assert.equal(calls, 7);
    assert.equal(repo.db[0].report.overall_score, 80);
  },
);

test('answers submitted during an active interview are scored without waiting for completion', async () => {
 const s=session('live', [answer(0,seedQuestions[0])]);s.state='MAIN_QUESTION';s.index=1;s.completed_at=null;
 const repo=fakeRepo([s]);let release, entered;
 const started=new Promise(r=>entered=r), gate=new Promise(r=>release=r);const seen=[];
 const llm={name:'openai',async evaluateAnswer(ctx){seen.push(ctx.answer);if(seen.length===1){entered();await gate;}return evaluated();}};
 const evaluator=createEvaluator({repo,llm,minIntervalMs:0,concurrency:3});
 await evaluator.enqueue(s);await started;
 const latest=await repo.session(s.id);latest.answers.push(answer(1,seedQuestions[1]));latest.index=2;await repo.saveSession(latest,latest.version);
 await evaluator.enqueue(s.id);release();await evaluator.idle();
 const saved=await repo.session(s.id);assert.equal(saved.state,'MAIN_QUESTION');assert.equal(saved.answers.filter(a=>a.evaluation).length,2);assert.equal(seen.length,2);assert.equal(saved.evaluation_job.state,'complete');assert.equal(saved.report,null);
});
