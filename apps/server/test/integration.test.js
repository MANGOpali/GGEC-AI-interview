import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { localRepository, demoUsers } from '../src/repository.js';
import { createVault } from '../src/crypto.js';
import { createLlm } from '../src/llm.js';
import { metrics, evaluationSchema } from '../src/domain.js';
const profile = {
  name: 'Test Student',
  nationality: 'Nepali',
  previous_qualification: 'BBA',
  university: 'Example University',
  course: 'MSc Business',
  course_duration: '1 year',
  tuition_fee: 16000,
  scholarship: 2000,
  study_gap: '',
  work_experience: '',
  funding_details: 'Private sponsor income 35000',
  accommodation: 'University residence',
  career_plans: 'Business analyst',
  leaderboard_opt_in: false,
  leaderboard_alias: '',
};
const testQuestions = [
  ['UK choice', 'Why did you choose the UK for your studies?'],
  ['University research', 'Why did you choose this particular university?'],
  ['Course knowledge', 'Why did you choose this course?'],
  ['Course knowledge', 'Which modules will you study?'],
  ['Course knowledge', 'Which module interests you most, and why?'],
  ['Academic background', 'How does this course relate to your previous education?'],
  ['Career plans', 'How will this course help your career?'],
  ['Finance', 'Who is sponsoring your studies?'],
  ['Finance', 'How will you pay your tuition fees and living expenses?'],
  ['Accommodation', 'Where will you live in the UK?'],
  ['Career plans', 'What are your plans after graduation?'],
].map(([category, text], i) => ({
  id: `90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  category,
  text,
  expected_concepts: '',
  verified_context: '',
  source_url: '',
  weight: 1,
  is_main_question: true,
  active: true,
}));
async function setup(
  t,
  llm = createLlm({}),
  serveDir = null,
  supabaseConnectSrc = null,
  evaluator = null,
  deferScoring = false,
  transcriber = null,
) {
  const dir = await mkdtemp(join(tmpdir(), 'ggec-')),
    key = randomBytes(32).toString('base64'),
    vault = createVault(key),
    path = join(dir, 'db.json'),
    repo = await localRepository(path, vault);
  for (const q of await repo.list('questions')) await repo.remove('questions', q.id);
  for (const q of testQuestions) await repo.put('questions', q);
  const app = createApp({
    repo,
    llm,
    authenticate: async (req) => (await repo.get('users', req.get('X-Demo-User'))) || null,
    serveDir,
    supabaseConnectSrc,
    evaluator,
    deferScoring,
    transcriber,
  });
  const as = (role = 'student') => {
    const user = demoUsers.find((u) => u.role === role);
    return {
      get: (p) =>
        request(app)
          .get('/api' + p)
          .set('X-Demo-User', user.id),
      post: (p, b) =>
        request(app)
          .post('/api' + p)
          .set('X-Demo-User', user.id)
          .send(b),
      put: (p, b) =>
        request(app)
          .put('/api' + p)
          .set('X-Demo-User', user.id)
          .send(b),
      delete: (p) =>
        request(app)
          .delete('/api' + p)
          .set('X-Demo-User', user.id),
    };
  };
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { repo, app, as, path, vault };
}
test('vertical slice: profile, consent, all questions, transcripts, resume, report, persistence', async (t) => {
  const { as, repo, path, vault } = await setup(t);
  const s = as();
  await s.put('/profile', profile).expect(200);
  assert.equal((await s.get('/profile')).body.name, profile.name);
  await s.post('/sessions', {}).expect(400);
  let session = (await s.post('/sessions', { consent: true }).expect(201)).body;
  assert.equal(session.questions.length, 11);
  for (let i = 0; i < 11; i++) {
    session = (
      await s
        .post(`/sessions/${session.id}/answers`, {
          version: session.version,
          request_id: randomUUID(),
          transcript: `My thoughtful answer number ${i}.`,
        })
        .expect(200)
    ).body;
  }
  assert.equal(session.state, 'REPORT');
  assert.equal(session.answers.length, 11);
  assert.equal(session.report.overall_score, null);
  assert.equal(session.report.readiness_level, 'Not evaluated');
  const reopened = await localRepository(path, vault);
  assert.equal((await reopened.session(session.id)).answers.length, 11);
  assert.equal((await s.get('/leaderboard')).body.length, 0);
  const disk = await readFile(path, 'utf8');
  assert(!disk.includes(profile.funding_details));
  assert.equal((await repo.profile(demoUsers[0].id)).funding_details, profile.funding_details);
});
test('access controls prevent cross-student access, staff submissions and self role escalation', async (t) => {
  const { as, app, repo } = await setup(t);
  await request(app).get('/api/me').expect(401);
  await as()
    .put('/profile', { ...profile, role: 'admin' })
    .expect(200);
  assert.equal((await as().get('/me')).body.role, 'student');
  let s = (await as().post('/sessions', { consent: true })).body;
  await request(app).get(`/api/sessions/${s.id}`).set('X-Demo-User', demoUsers[3].id).expect(404);
  await as().post('/questions', {}).expect(403);
  await as('counsellor')
    .post(`/sessions/${s.id}/answers`, {
      request_id: randomUUID(),
      version: 0,
      transcript: 'Unauthorized',
    })
    .expect(403);
  await as('counsellor').get(`/sessions/${s.id}`).expect(200);
  assert((await repo.list('access_logs')).some((l) => l.resource === 'interview-and-transcripts'));
  await repo.saveProfile(demoUsers[3].id, profile);
  const students = (await as('counsellor').get('/students')).body;
  assert(!students.some((u) => u.id === demoUsers[3].id));
  await as('counsellor').get('/audit').expect(403);
});
test('idempotency and optimistic concurrency prevent duplicate or out-of-order answers', async (t) => {
  const { as } = await setup(t);
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  const input = { request_id: randomUUID(), version: 0, transcript: 'Answer' };
  const first = (await as().post(`/sessions/${s.id}/answers`, input).expect(200)).body;
  const retry = (await as().post(`/sessions/${s.id}/answers`, input).expect(200)).body;
  assert.equal(retry.answers.length, 1);
  assert.equal(first.version, retry.version);
  await as()
    .post(`/sessions/${s.id}/answers`, { ...input, request_id: randomUUID() })
    .expect(409);
});
const evaluation = {
  ...Object.fromEntries(metrics.map((k) => [k, k === 'accuracy' ? null : 8])),
  flags: [],
  follow_up_needed: true,
  follow_up_question: 'How will the shorter course affect your budget?',
  reasoning: 'Staff-only evidence note',
  feedback: 'Explain the cost comparison.',
  missing_information: [],
  contradictions: [],
};
test('semantic provider context, dynamic follow-up cap and student note redaction', async (t) => {
  let contexts = [];
  const llm = {
    name: 'test',
    evaluateAnswer: async (c) => {
      contexts.push(c);
      return structuredClone(evaluation);
    },
    generateFollowUp: (e) => e.follow_up_question,
  };
  const { as } = await setup(t, llm);
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  for (let i = 0; i < 2; i++) {
    s = (
      await as()
        .post(`/sessions/${s.id}/answers`, {
          request_id: randomUUID(),
          version: s.version,
          transcript: 'UK courses are shorter.',
        })
        .expect(200)
    ).body;
  }
  assert.equal(contexts[0].profile.funding_details, profile.funding_details);
  assert.equal(contexts[1].prior_qa.length, 1);
  assert.equal(s.index, 1);
  assert.equal(s.state, 'MAIN_QUESTION');
  assert.equal(s.answers[1].is_followup, true);
  assert.equal(s.answers[1].parent_answer_id, s.answers[0].id);
  assert(!JSON.stringify(s).includes(evaluation.reasoning));
  assert(
    JSON.stringify((await as('counsellor').get(`/sessions/${s.id}`)).body).includes(
      evaluation.reasoning,
    ),
  );
});
test('provider failures preserve transcripts without manufacturing scores', async (t) => {
  const { as } = await setup(t, {
    name: 'unavailable',
    evaluateAnswer: async () => {
      throw Error('quota');
    },
  });
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  s = (
    await as()
      .post(`/sessions/${s.id}/answers`, {
        version: s.version,
        request_id: randomUUID(),
        transcript: 'Saved despite outage.',
      })
      .expect(200)
  ).body;
  assert.equal(s.answers[0].transcript, 'Saved despite outage.');
  assert.equal(s.answers[0].evaluation, null);
  assert(s.warning);
});
const fullEval = () => ({
  ...structuredClone(evaluation),
  follow_up_needed: false,
  follow_up_question: null,
});
test('deferred evaluation is enqueued only after the submitted transcript commits', async (t) => {
  const { as, repo } = await setup(t);
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  s = await repo.session(s.id);
  s.questions = s.questions.slice(0, 1);
  s = await repo.saveSession(s, s.version);
  let readQueued;
  const app = createApp({
    repo,
    llm: { name: 'test', evaluateAnswer: async () => null },
    authenticate: async () => demoUsers[0],
    evaluator: {
      enabled: true,
      enqueue: (session) => {
        readQueued = repo.session(session.id);
      },
    },
  });
  await request(app)
    .post(`/api/sessions/${s.id}/answers`)
    .send({
      version: s.version,
      request_id: randomUUID(),
      transcript: 'Committed before the worker reads.',
    })
    .expect(200);
  const queued = await readQueued;
  assert.equal(queued.answers.length, 1);
  assert.equal(queued.answers[0].transcript, 'Committed before the worker reads.');
});
const aiReport = (score) => ({
  overall_score: score,
  readiness_level: score >= 75 ? 'Ready' : 'Needs Practice',
  category_scores: { Finance: score },
  strong_areas: ['Finance'],
  weak_areas: [],
  poor_answers: [],
  missing_information: [],
  contradictions: [],
  recommendations: ['Keep practising with concrete figures.'],
});
test('completed sessions keep deterministic scores when provider narrative claims a different score', async (t) => {
  const { as, repo } = await setup(t, {
    name: 'test',
    evaluateAnswer: async () => fullEval(),
    generateFollowUp: () => null,
    generateFinalReport: async () => aiReport(88),
  });
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  for (let i = 0; i < s.questions.length; i++)
    s = (
      await as()
        .post(`/sessions/${s.id}/answers`, {
          version: s.version,
          request_id: randomUUID(),
          transcript: `Answer ${i}.`,
        })
        .expect(200)
    ).body;
  assert.equal(s.state, 'REPORT');
  assert.equal(s.report.overall_score, 80);
  assert.deepEqual(s.report.recommendations, ['Keep practising with concrete figures.']);
  assert.equal(s.answers.length, 11);
  assert.equal((await repo.session(s.id)).report.overall_score, 80);
});
test('completed sessions fall back to the local aggregation when the AI report fails', async (t) => {
  const { as, repo } = await setup(t, {
    name: 'test',
    evaluateAnswer: async () => fullEval(),
    generateFollowUp: () => null,
    generateFinalReport: async () => {
      throw Error('report outage');
    },
  });
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  for (let i = 0; i < s.questions.length; i++)
    s = (
      await as()
        .post(`/sessions/${s.id}/answers`, {
          version: s.version,
          request_id: randomUUID(),
          transcript: `Answer ${i}.`,
        })
        .expect(200)
    ).body;
  assert.equal(s.state, 'REPORT');
  assert.equal(s.report.overall_score, 80);
  assert.equal(s.report.readiness_level, 'Ready');
  assert((await repo.session(s.id)).report);
});
test('production static serving hosts the built web app and keeps /api responses', async (t) => {
  const web = await mkdtemp(join(tmpdir(), 'ggec-web-')),
    dist = join(web, 'dist');
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), '<h1>GGEC Pre-CAS</h1>');
  await writeFile(join(dist, 'asset.js'), '/* built */');
  const { as, app: served } = await setup(t, createLlm({}), dist, 'https://xyz.supabase.co');
  const page = await request(served).get('/');
  assert.equal(page.status, 200);
  assert(page.text.includes('GGEC Pre-CAS'));
  assert.match(
    page.headers['content-security-policy'],
    /connect-src 'self' https:\/\/xyz\.supabase\.co/,
  );
  const asset = await request(served).get('/asset.js');
  assert.equal(asset.text, '/* built */');
  assert((await request(served).get('/anything/else')).text.includes('GGEC Pre-CAS'));
  const health = await request(served).get('/api/health');
  assert.equal(health.body.ok, true);
  assert.equal((await as().get('/me')).body.name, 'Demo Student');
  t.after(() => rm(web, { recursive: true, force: true }));
});
test('retention removes old content, preserves held sessions, expires unfinished interviews', async (t) => {
  const { as, repo } = await setup(t);
  await as().put('/profile', profile);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    let s = (await as().post('/sessions', { consent: true })).body;
    s = (
      await as().post(`/sessions/${s.id}/answers`, {
        version: s.version,
        request_id: randomUUID(),
        transcript: 'Old transcript',
      })
    ).body;
    s = await repo.session(s.id);
    s.started_at = '2020-01-01T00:00:00.000Z';
    s.review_hold = i === 1;
    await repo.saveSession(s, s.version);
    ids.push(s.id);
  }
  assert.equal(await repo.cleanup(90), 1);
  assert.equal((await repo.session(ids[0])).answers[0].transcript, null);
  assert.equal((await repo.session(ids[0])).state, 'EXPIRED');
  assert.equal((await repo.session(ids[1])).answers[0].transcript, 'Old transcript');
});
test('question CRUD and validation, encrypted field tamper resistance', async (t) => {
  const { as, vault } = await setup(t);
  await as()
    .put('/profile', { ...profile, scholarship: 99999 })
    .expect(400);
  const q = {
    text: 'Explain your plans?',
    category: 'Plans',
    expected_concepts: 'Specific plans',
    verified_context: '',
    source_url: '',
    weight: 2,
    is_main_question: true,
    active: true,
  };
  const created = (await as('admin').post('/questions', q).expect(201)).body;
  await as('counsellor')
    .put(`/questions/${created.id}`, { ...q, weight: 3 })
    .expect(200);
  await as('admin').delete(`/questions/${created.id}`).expect(204);
  const encrypted = vault.seal(profile);
  encrypted.tag = randomBytes(16).toString('base64');
  assert.throws(() => vault.open(encrypted));
  assert(!evaluationSchema.safeParse({ ...evaluation, relevance: 100 }).success);
});
test('leaderboard only publishes alias for opted-in, fully evaluated completed attempts', async (t) => {
  const { as, repo } = await setup(t, {
    name: 'test',
    evaluateAnswer: async () => ({
      ...structuredClone(evaluation),
      follow_up_needed: false,
      follow_up_question: null,
    }),
    generateFollowUp: () => null,
  });
  const questions = await repo.list('questions');
  for (const q of questions.slice(1)) await repo.remove('questions', q.id);
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  s = (
    await as().post(`/sessions/${s.id}/answers`, {
      version: s.version,
      request_id: randomUUID(),
      transcript: 'A complete answer',
    })
  ).body;
  assert.equal(s.report.overall_score, 80);
  assert.deepEqual((await as().get('/leaderboard')).body, []);
  await as().put('/profile', {
    ...profile,
    leaderboard_opt_in: true,
    leaderboard_alias: 'Study Explorer',
  });
  assert.deepEqual((await as().get('/leaderboard')).body, [{ alias: 'Study Explorer', score: 80 }]);
  await as().put('/profile', profile);
  assert.deepEqual((await as().get('/leaderboard')).body, []);
});

test('explicit evaluation queues only authorized completed, retained attempts', async (t) => {
  const queued = [];
  const { as, repo, app } = await setup(t, createLlm({}), null, null, {
    enabled: true,
    enqueue: (s) => queued.push(s.id),
  });
  await as().put('/profile', profile).expect(200);
  let s = (await as().post('/sessions', { consent: true }).expect(201)).body;
  await as().post(`/sessions/${s.id}/evaluate`, {}).expect(409);
  s = await repo.session(s.id);
  s.state = 'REPORT';
  s.answers = [{ id: randomUUID(), transcript: 'A saved answer', evaluation: null }];
  await repo.saveSession(s, s.version);
  await request(app)
    .post(`/api/sessions/${s.id}/evaluate`)
    .set('X-Demo-User', '10000000-0000-4000-8000-000000000004')
    .send({})
    .expect(404);
  await as().post(`/sessions/${s.id}/evaluate`, {}).expect(202);
  assert.deepEqual(queued, [s.id]);
});

test('evaluation status is scoped and retry enforces cooldown, completion and provider availability', async (t) => {
  const { as, repo, app } = await setup(t);
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true })).body;
  s = await repo.session(s.id);
  s.state = 'REPORT';
  s.answers = [{ id: randomUUID(), transcript: 'Private fixture answer', evaluation: null }];
  s = await repo.saveSession(s, s.version);
  await request(app).get(`/api/sessions/${s.id}/evaluation`).expect(401);
  await request(app)
    .get(`/api/sessions/${s.id}/evaluation`)
    .set('X-Demo-User', demoUsers[3].id)
    .expect(404);
  const disabled = (await as().get(`/sessions/${s.id}/evaluation`).expect(200)).body;
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.can_retry, false);
  assert(!JSON.stringify(disabled).includes('Private fixture answer'));
  const enabledApp = createApp({
    repo,
    llm: { name: 'fixture' },
    authenticate: async () => demoUsers[0],
    evaluator: {
      enabled: true,
      enqueue() {
        throw new Error('Should not queue');
      },
    },
  });
  s.evaluation_job = {
    state: 'failed',
    retry_after: new Date(Date.now() + 60000).toISOString(),
    message: 'Wait before retrying',
  };
  s = await repo.saveSession(s, s.version);
  await request(enabledApp).post(`/api/sessions/${s.id}/evaluate`).send({}).expect(409);
  s.evaluation_job = { state: 'running' };
  s = await repo.saveSession(s, s.version);
  await request(enabledApp).post(`/api/sessions/${s.id}/evaluate`).send({}).expect(202);
});

test('reference CRUD matches intake, snapshots evidence and keeps future edits out of existing attempts', async (t) => {
  const { as, repo } = await setup(t);
  await as().put('/profile', { ...profile, intake: 'September 2026' });
  const q = (await as('admin').get('/questions')).body[0];
  const today = new Date().toISOString().slice(0, 10);
  const reference = {
    university: profile.university,
    course: profile.course,
    intake: 'September 2026',
    checked_on: today,
    valid_until: today,
    modules: 'Fictional module',
    fees: 'Fictional fee',
    facts: 'Fictional verified context',
  };
  await as()
    .put(`/questions/${q.id}`, { ...q, reference, source_url: 'https://example.org/course' })
    .expect(403);
  await as('admin')
    .put(`/questions/${q.id}`, { ...q, reference, source_url: 'http://example.org/course' })
    .expect(400);
  await as('admin')
    .put(`/questions/${q.id}`, { ...q, reference, source_url: 'https://example.org/course' })
    .expect(200);
  const s = (await as().post('/sessions', { consent: true })).body;
  assert.equal(s.questions.find((item) => item.id === q.id).reference, undefined);
  assert.match(
    (await repo.session(s.id)).questions.find((item) => item.id === q.id).verified_context,
    /Fictional verified context/,
  );
  await as('admin').put(`/questions/${q.id}`, {
    ...q,
    reference: { ...reference, facts: 'Changed later' },
    source_url: 'https://example.org/course',
  });
  assert(
    !JSON.stringify((await repo.session(s.id)).questions.find((item) => item.id === q.id)).includes(
      'Changed later',
    ),
  );
  await as().put('/profile', { ...profile, intake: 'January 2027' });
  const other = (await as().post('/sessions', { consent: true })).body;
  assert.equal(
    (await repo.session(other.id)).questions.find((item) => item.id === q.id).verified_context,
    '',
  );
});

test('counsellor calibration is blind until submission, isolated and never changes AI scores', async (t) => {
  const { as, repo, app } = await setup(t, {
    name: 'fixture',
    evaluateAnswer: async () => fullEval(),
    generateFollowUp: () => null,
  });
  await as().put('/profile', profile);
  let s = (await as().post('/sessions', { consent: true, category: 'UK choice' })).body;
  await as().get(`/sessions/${s.id}/coaching`).expect(409);
  s = (
    await as().post(`/sessions/${s.id}/answers`, {
      version: s.version,
      request_id: randomUUID(),
      transcript: 'Fictional complete answer.',
    })
  ).body;
  assert.equal(s.state, 'REPORT');
  await as().get(`/sessions/${s.id}/calibration`).expect(403);
  const blind = (await as('counsellor').get(`/sessions/${s.id}/calibration`)).body;
  assert.equal(blind.comparison.rows.length, 0);
  assert(!JSON.stringify(blind.answers).includes('evaluation'));
  const input = {
    sample_type: 'weak',
    metrics: Object.fromEntries(metrics.map((k) => [k, k === 'accuracy' ? null : 4])),
  };
  await request(app)
    .post(`/api/sessions/${s.id}/calibration/${s.answers[0].id}`)
    .set('X-Demo-User', demoUsers[3].id)
    .send(input)
    .expect(403);
  const paired = (
    await as('counsellor')
      .post(`/sessions/${s.id}/calibration/${s.answers[0].id}`, input)
      .expect(200)
  ).body;
  assert.equal(paired.paired, 1);
  assert.equal(paired.rows[0].human, 40);
  assert.equal(paired.rows[0].ai, 80);
  await as('counsellor')
    .post(`/sessions/${s.id}/calibration/${s.answers[0].id}`, input)
    .expect(409);
  const own = (await as().get(`/sessions/${s.id}`)).body;
  assert.equal(own.answers[0].human_reviews, undefined);
  assert.equal(own.report.overall_score, 80);
  assert.equal(
    (await as('admin').get(`/sessions/${s.id}/calibration`)).body.comparison.rows.length,
    0,
  );
  assert(
    (await as().get(`/sessions/${s.id}/coaching`)).body.items[0].example.includes('[UK course]'),
  );
});

test('category practice selects only requested questions and cannot enter the leaderboard', async (t) => {
  const { as } = await setup(t, {
    name: 'fixture',
    evaluateAnswer: async () => fullEval(),
    generateFollowUp: () => null,
  });
  await as().put('/profile', {
    ...profile,
    leaderboard_opt_in: true,
    leaderboard_alias: 'Fixture',
  });
  await as().post('/sessions', { consent: true, category: 'Unknown' }).expect(409);
  let s = (await as().post('/sessions', { consent: true, category: 'UK choice' })).body;
  assert.equal(s.questions.length, 1);
  assert.equal(s.practice_category, 'UK choice');
  s = (
    await as().post(`/sessions/${s.id}/answers`, {
      version: s.version,
      request_id: randomUUID(),
      transcript: 'Fictional practice answer',
    })
  ).body;
  assert.equal(s.report.overall_score, 80);
  assert.deepEqual((await as().get('/leaderboard')).body, []);
  const history = (await as().get('/sessions')).body;
  assert.equal(history[0].practice_category, 'UK choice');
  assert.equal(history[0].report.scoring_version, 'ggec-rubric-v2');
});

test('account phone is validated, updatable and cannot change a role', async (t) => {
  const { as, repo } = await setup(t);
  const updated = (await as().put('/me', { phone: '+234 801 234 5678' }).expect(200)).body;
  assert.equal(updated.phone, '+234 801 234 5678');
  assert.equal((await as().get('/me')).body.phone, '+234 801 234 5678');
  await as().put('/me', { phone: 'not-a-phone' }).expect(400);
  await as().put('/me', {}).expect(400);
  await as().put('/me', { phone: '+234 801 234 5678', role: 'admin' }).expect(200);
  assert.equal((await as().get('/me')).body.role, 'student');
  assert.equal((await repo.get('users', demoUsers[0].id)).phone, '+234 801 234 5678');
});

test('student resources are read-only, admin-managed and hide unpublished entries', async (t) => {
  const { as } = await setup(t);
  assert.equal((await as().get('/resources?kind=template').expect(200)).body.length, 3);
  assert.equal((await as().get('/resources?kind=research').expect(200)).body.length, 3);
  await as()
    .post('/resources', { kind: 'template', title: 'Draft', body: '', position: 9, active: true })
    .expect(403);
  const created = (
    await as('admin')
      .post('/resources', {
        kind: 'template',
        title: 'Draft',
        body: 'Body',
        position: 9,
        active: false,
      })
      .expect(201)
  ).body;
  assert.equal((await as().get('/resources?kind=template')).body.length, 3);
  assert.equal((await as('admin').get('/resources?kind=template')).body.length, 4);
  await as('admin')
    .put(`/resources/${created.id}`, {
      kind: 'template',
      title: 'Live',
      body: 'Body',
      position: 9,
      active: true,
    })
    .expect(200);
  const visible = (await as().get('/resources?kind=template')).body;
  assert.equal(visible.length, 4);
  assert.equal(visible.at(-1).title, 'Live');
  await as().delete(`/resources/${created.id}`).expect(403);
  await as('admin').delete(`/resources/${created.id}`).expect(204);
  assert.equal((await as().get('/resources?kind=template')).body.length, 3);
  await as().get('/resources?kind=bogus').expect(400);
});

test('invalid identifiers are rejected before reaching the store', async (t) => {
  const { as } = await setup(t);
  await as('admin').get('/sessions/not-a-uuid').expect(400);
  await as('admin').delete('/resources/not-a-uuid').expect(400);
  await as('admin').get(`/sessions/${randomUUID()}/evaluation`).expect(404);
});

test('wildcard CORS origins are rejected at startup', async (t) => {
  const { repo } = await setup(t);
  assert.throws(
    () => createApp({ repo, llm: createLlm({}), authenticate: async () => null, origin: '*' }),
    /explicit origins/,
  );
});

test('new sessions expose the per-question time limit and start clock', async (t) => {
  const { as } = await setup(t);
  const s = as();
  await s.put('/profile', profile).expect(200);
  const created = (await s.post('/sessions', { consent: true }).expect(201)).body;
  assert.ok(created.question_started_at);
  assert.ok(created.questions.every((q) => q.time_limit_seconds === 120));
});

test('fast submissions persist without inline AI calls and enqueue after every commit', async (t) => {
  let calls = 0,
    queued = 0;
  const llm = {
    name: 'openai',
    evaluateAnswer: async () => {
      calls++;
      throw new Error('Must not be called on submission');
    },
  };
  let repo;
  const evaluator = {
    enabled: true,
    enqueue: async (s) => {
      queued++;
      const saved = await repo.session(s.id);
      assert.equal(saved.answers.length, queued);
    },
  };
  const fixture = await setup(t, llm, null, null, evaluator, true);
  repo = fixture.repo;
  const client = fixture.as();
  await client.put('/profile', profile).expect(200);
  let s = (await client.post('/sessions', { consent: true }).expect(201)).body;
  for (let i = 0; i < 11; i++) {
    const input = {
      version: s.version,
      request_id: randomUUID(),
      transcript: 'Fictional saved answer',
    };
    s = (await client.post(`/sessions/${s.id}/answers`, input).expect(200)).body;
    assert.equal(s.answers.length, i + 1);
    assert.equal(queued, i + 1);
    if (i === 10) await client.post(`/sessions/${s.id}/answers`, input).expect(200);
  }
  assert.equal(calls, 0);
  assert.equal(queued, 11);
  assert.equal(s.report.overall_score, null);
});

test('malformed JSON never echoes private request fragments and body size is bounded', async (t) => {
  const { app } = await setup(t);
  const malformed = await request(app)
    .post('/api/profile')
    .set('Content-Type', 'application/json')
    .send('{"private":"PRIVATE_SENTINEL" broken')
    .expect(400);
  assert.equal(malformed.body.error, 'Invalid JSON request.');
  assert(!malformed.text.includes('PRIVATE_SENTINEL'));
  const large = await request(app)
    .post('/api/profile')
    .send({ private: 'x'.repeat(70000) })
    .expect(413);
  assert.equal(large.body.error, 'Request is too large.');
});

test('audio endpoint enforces student ownership, consent, format and size before provider calls', async (t) => {
  let calls = 0;
  const { as, app } = await setup(t, createLlm({}), null, null, null, true, {
    name: 'groq',
    transcribeAudio: async () => {
      calls++;
      return { text: 'Fictional speech' };
    },
  });
  await as().put('/profile', profile);
  const s = (await as().post('/sessions', { consent: true })).body;
  const url = `/api/sessions/${s.id}/transcribe`;
  const audio = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
  const send = (user, consent = true, bytes = audio) => {
    let r = request(app).post(url).set('Content-Type', 'audio/webm');
    if (user) r = r.set('X-Demo-User', user);
    if (consent) r = r.set('X-Audio-Consent', 'groq-v1');
    return r.send(bytes);
  };
  await send(null).expect(401);
  await send(demoUsers[3].id).expect(404);
  await send(demoUsers[1].id).expect(403);
  await send(demoUsers[0].id, false).expect(400);
  await send(demoUsers[0].id, true, Buffer.from('not an audio recording')).expect(415);
  await send(demoUsers[0].id, true, Buffer.alloc(8 * 1024 * 1024 + 1)).expect(413);
  assert.equal(calls, 0);
  const result = await send(demoUsers[0].id).expect(200);
  assert.equal(result.body.text, 'Fictional speech');
  assert.equal(calls, 1);
});

test('standards bank is staff-only, validates activation, snapshots 19 questions and hides future prompts',async t=>{
 const {as,repo}=await setup(t,{name:'openai'},null,null,null,true);
 const {BANK_ID,createBankStore,saveBankQuestion}=await import('../src/standards-bank.js');
 await as().get('/standards-bank').expect(403);
 await as().put('/standards-bank/settings',{revision:0,enabled:true,grammar_allowance:20}).expect(403);
 await as('admin').put('/standards-bank/settings',{revision:0,enabled:true,grammar_allowance:20}).expect(409);
 const store=createBankStore(repo);
 await store.update(0,b=>{
  for(let i=0;i<7;i++){
   const id=randomUUID();
   saveBankQuestion(b,{id,type:'major',introduction:i===0,text:`Major question ${i}?`,category:'Test',points:[{id:'p',text:'PRIVATE_STANDARD_SENTINEL',weight:1}]});
   for(let j=0;j<5;j++)saveBankQuestion(b,{type:'cross',parent_id:id,text:`Cross question ${i}-${j}?`,category:'Test',points:[{id:'p',text:'Private cross standard',weight:1}]});
  }
  for(let i=0;i<3;i++)saveBankQuestion(b,{type:'extra',text:`Extra question ${i}?`,category:'Extra',points:[{id:'p',text:'Private extra standard',weight:1}]});
 });
 await as('admin').put('/standards-bank/settings',{revision:1,enabled:true,grammar_allowance:25}).expect(200);
 await as('admin').put('/standards-bank/settings',{revision:1,enabled:false,grammar_allowance:0}).expect(409);
 for(const role of ['student','admin'])assert(!(await as(role).get('/resources')).body.some(r=>r.id===BANK_ID));
 await as('admin').delete(`/resources/${BANK_ID}`).expect(403);
 await as().put('/profile',profile).expect(200);
 let s=(await as().post('/sessions',{consent:true}).expect(201)).body;
 assert.equal(s.questions.length,19);assert(s.questions[0].introduction);assert.equal(s.grammar_allowance,25);
 assert(!JSON.stringify(s).includes('PRIVATE_STANDARD_SENTINEL'));
 assert.equal(s.questions[1].text,'Question revealed when you reach it');
 const saved=await repo.session(s.id);assert.equal(saved.questions[0].standard.points[0].text,'PRIVATE_STANDARD_SENTINEL');
 s=(await as().post(`/sessions/${s.id}/answers`,{request_id:randomUUID(),version:s.version,transcript:'My answer',spoken_seconds:45}).expect(200)).body;
 assert(['major','cross','extra'].includes(s.questions[s.index].question_type));assert.equal(s.index,1);assert.equal(s.answers[0].duration_flag,'below_minimum');
 await as('admin').put('/standards-bank/settings',{revision:2,enabled:true,grammar_allowance:40}).expect(200);
 assert.equal((await repo.session(s.id)).grammar_allowance,25);
});
