// Explicit opt-in test: uses live API quota with fictional data in an isolated repository.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../apps/server/src/app.js';
import { localRepository, demoUsers } from '../apps/server/src/repository.js';
import { createVault } from '../apps/server/src/crypto.js';
import { createLlm } from '../apps/server/src/llm.js';

assert.equal(process.env.LLM_PROVIDER, 'groq', 'This quota-bounded smoke test expects Groq.');
const dir = await mkdtemp(join(tmpdir(), 'ggec-live-'));
try {
  const repo = await localRepository(
    join(dir, 'demo.json'),
    createVault(randomBytes(32).toString('base64')),
  );
  const provider = createLlm(process.env);
  let calls = 0,
    lastCall = 0;
  const llm = {
    ...provider,
    async evaluateAnswer(context) {
      assert(calls < 4, 'Live test is capped at four model requests.');
      const delay = Math.max(0, 25000 - (Date.now() - lastCall));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastCall = Date.now();
      calls++;
      return provider.evaluateAnswer(context);
    },
  };
  for (const q of await repo.list('questions'))
    if (q.category !== 'Course knowledge' || !q.text.startsWith('Why'))
      await repo.remove('questions', q.id);
  const student = demoUsers[0];
  const app = createApp({ repo, llm, authenticate: async () => student });
  const post = (path, body) =>
    request(app)
      .post('/api' + path)
      .send(body);
  await request(app)
    .put('/api/profile')
    .send({
      name: 'Fictional Evaluation Test',
      nationality: 'Nepali',
      previous_qualification: 'BBA',
      university: 'Example University',
      course: 'MSc Business Analytics',
      course_duration: '1 year',
      tuition_fee: 16000,
      scholarship: 0,
      study_gap: 'None',
      work_experience: 'One year as a junior analyst',
      funding_details: 'Fictional family savings',
      accommodation: 'Fictional student residence',
      career_plans: 'Return to Nepal and work as a business analyst',
      leaderboard_opt_in: false,
      leaderboard_alias: '',
    })
    .expect(200);
  const samples = {
    relevant:
      'My BBA introduced me to statistics and business decision-making. In my year as a junior analyst I used spreadsheets to compare sales, but I could not build reliable forecasts. I chose MSc Business Analytics to learn statistical modelling, data management and practical business analysis, building directly on that experience. I am particularly interested in applying forecasting to inventory decisions and explaining the results to managers. After graduating I plan to return to Nepal and apply for business analyst roles in retail or banking. I still need to confirm the exact module titles with the university rather than claim unverified details.',
    irrelevant:
      'I like football and pizza. Yesterday I watched television. I do not know what this course is about or how it relates to my plans.',
  };
  const results = {};
  for (const [kind, transcript] of Object.entries(samples)) {
    let s = (await post('/sessions', { consent: true }).expect(201)).body;
    for (let i = 0; i < 2 && s.state !== 'REPORT'; i++) {
      s = (
        await post(`/sessions/${s.id}/answers`, {
          version: s.version,
          request_id: randomUUID(),
          transcript,
        }).expect(200)
      ).body;
      assert(s.answers.at(-1).evaluation, `${kind}: model evaluation failed; no score fabricated.`);
      assert.equal(s.answers.at(-1).evaluation.accuracy, null);
      assert.equal(s.answers.at(-1).evaluation.reasoning, undefined);
      console.log(`${kind}: answer ${i + 1} saved, score ${s.answers.at(-1).answer_score}/100`);
    }
    assert.equal(s.state, 'REPORT');
    assert(Number.isFinite(s.report.overall_score));
    const loaded = (await request(app).get(`/api/sessions/${s.id}`).expect(200)).body;
    assert.equal(loaded.report.overall_score, s.report.overall_score);
    results[kind] = {
      score: s.report.overall_score,
      readiness: s.report.readiness_level,
      answers: s.answers.length,
      scoring_version: s.report.scoring_version,
    };
  }
  assert(
    results.relevant.score > results.irrelevant.score,
    'Relevant answer should score above unrelated answer in this smoke test.',
  );
  const summary = {
    tested_at: new Date().toISOString(),
    provider: provider.name,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    fictional_data_only: true,
    isolated_repository: true,
    live_requests: calls,
    results,
    verified: [
      'profile and consent API',
      'real AI response validation',
      'answer score persistence',
      'bounded follow-up',
      'completed report',
      'reload preserves score',
      'student note redaction',
    ],
    limitation: 'A smoke test, not a calibrated assessment-quality benchmark.',
  };
  await mkdir('verification', { recursive: true });
  await writeFile('verification/live-evaluation.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (!dir.startsWith(join(tmpdir(), 'ggec-live-')))
    throw new Error('Unexpected temporary test directory');
  await rm(dir, { recursive: true, force: true });
}
