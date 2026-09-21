import {
  unpackQuestion,
  packQuestion,
  snapshotQuestion,
  humanSchema,
  comparison,
  coaching,
} from './practice.js';
import { rubricWeights } from './scoring.js';
import { evaluationStatus } from './evaluator.js';
import { evaluationFailure } from './provider-errors.js';
import { validAudio } from './transcription.js';
import {
  BANK_ID,
  createBankStore,
  bankReadiness,
  selectStandardInterview,
  saveBankQuestion,
  standardVersion,
  standardWeights,
} from './standards-bank.js';
import { angleBank, selectAngle, orderInterviewQuestions } from './questionAngles.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountSchema,
  profileSchema,
  questionSchema,
  resourceKinds,
  resourceSchema,
  createSession,
  currentQuestion,
  applyAnswer,
  fullyEvaluated,
  mergeReport,
} from './domain.js';
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const reportFailure = (label, error) => console.error(label, evaluationFailure(error));
export function createApp({
  repo,
  llm,
  authenticate,
  origin = 'http://localhost:5173',
  trustProxy = 0,
  serveDir = null,
  supabaseConnectSrc = null,
  evaluator = null,
  deferScoring = false,
  transcriber = null,
}) {
  const app = express();
  const standards = createBankStore(repo);
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(
    supabaseConnectSrc
      ? helmet({
          contentSecurityPolicy: {
            directives: { 'connect-src': ["'self'", supabaseConnectSrc] },
          },
        })
      : helmet(),
  );
  const origins = origin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.includes('*')) throw new Error('WEB_ORIGIN must list explicit origins, not "*".');
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '64kb' }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, mode: repo.kind, ai: llm.name, stt: transcriber?.name || 'browser' }),
  );
  app.use('/api', async (req, _res, next) => {
    req.user = await authenticate(req);
    if (!req.user) fail(401, 'Please sign in.');
    next();
  });
  const identifier = z.uuid();
  const checkId = (_req, _res, next, value) =>
    identifier.safeParse(value).success
      ? next()
      : next(Object.assign(new Error('Invalid identifier.'), { status: 400 }));
  app.param('id', checkId);
  app.param('answerId', checkId);
  const staff = (u) => u.role === 'admin' || u.role === 'counsellor';
  const canRead = async (u, id) =>
    u.id === id ||
    u.role === 'admin' ||
    (u.role === 'counsellor' &&
      (await repo.list('assignments')).some(
        (a) => a.counsellor_id === u.id && a.student_id === id,
      ));
  const audit = async (u, id, resource) => {
    if (staff(u))
      await repo.put('access_logs', {
        id: randomUUID(),
        actor_id: u.id,
        student_id: id,
        resource,
        created_at: new Date().toISOString(),
      });
  };
  const session = async (req) => {
    const s = await repo.session(req.params.id);
    if (!s || !(await canRead(req.user, s.student_id))) fail(404, 'Interview not found.');
    return s;
  };
  const student = (s) => {
    const out = structuredClone(s);
    delete out.profile_snapshot;
    out.questions.forEach((q) => {
      if (out.state !== 'REPORT') delete q.reference;
      else if (q.reference) {
        delete q.reference.checked_by;
        q.reference_source_url = q.source_url;
      }
    });
    out.questions = out.questions.map(
      ({ expected_concepts, verified_context, source_url, standard, ...q }) => q,
    );
    if (out.rubric_version === standardVersion && out.state !== 'REPORT')
      out.questions = out.questions.map((q, i) =>
        i > out.index
          ? {
              id: q.id,
              text: 'Question revealed when you reach it',
              category: '',
              time_limit_seconds: null,
            }
          : q,
      );
    if (out.pending_follow_up) {
      if (out.state !== 'REPORT') delete out.pending_follow_up.reference;
      delete out.pending_follow_up.expected_concepts;
      delete out.pending_follow_up.verified_context;
      delete out.pending_follow_up.source_url;
    }
    out.answers = out.answers.map((a) => {
      delete a.human_reviews;
      if (a.evaluation) delete a.evaluation.reasoning;
      return a;
    });
    return out;
  };
  app.get('/api/me', (req, res) => res.json(req.user));
  app.get('/api/interview-rules', async (_req, res) => {
    const b = await standards.read();
    res.json({
      enabled: b.enabled,
      grammar_allowance: b.grammar_allowance,
      total_questions: b.enabled ? 19 : null,
    });
  });
  app.get('/api/standards-bank', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const b = await standards.read();
    res.json({ ...b, readiness: bankReadiness(b), can_configure: req.user.role === 'admin' });
  });
  app.put('/api/standards-bank/settings', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const input = z
      .object({
        revision: z.number().int().min(0),
        enabled: z.boolean(),
        grammar_allowance: z.number().min(0).max(100),
      })
      .parse(req.body);
    if (input.enabled && !['openai', 'groq'].includes(llm.name))
      fail(409, 'Standards scoring requires the OpenAI-compatible or Groq scoring adapter.');
    await standards.update(input.revision, (b) => {
      b.enabled = input.enabled;
      b.grammar_allowance = input.grammar_allowance;
    });
    res.json({ ok: true });
  });
  app.post('/api/standards-bank/questions', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const revision = z.number().int().min(0).parse(req.body.revision);
    await standards.update(revision, (b) => saveBankQuestion(b, req.body.question));
    res.json({ ok: true });
  });
  app.delete('/api/standards-bank/questions/:id', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const revision = z.number().int().min(0).parse(req.body.revision);
    await standards.update(revision, (b) => {
      if (b.questions.some((q) => q.parent_id === req.params.id))
        fail(409, 'Remove linked cross-questions first.');
      b.questions = b.questions.filter((q) => q.id !== req.params.id);
    });
    res.json({ ok: true });
  });
  const transcribing = new Set();
  app.post(
    '/api/sessions/:id/transcribe',
    rateLimit({
      windowMs: 600000,
      limit: 20,
      keyGenerator: (req) => req.user.id,
      message: { error: 'Speech request limit reached. Wait or type your answer.' },
    }),
    async (req, _res, next) => {
      if (!transcriber) fail(503, 'Speech service is not configured. Type your answer.');
      const s = await session(req);
      if (req.user.role !== 'student' || s.student_id !== req.user.id)
        fail(403, 'Only the student may transcribe an answer.');
      if (s.retained_at || !['MAIN_QUESTION', 'FOLLOW_UP'].includes(s.state))
        fail(409, 'This interview is not accepting recordings.');
      if (req.get('X-Audio-Consent') !== 'groq-v1')
        fail(400, 'Audio processing consent is required.');
      if (transcribing.has(req.user.id) || transcribing.size >= 3)
        fail(429, 'Speech service is busy. Wait and retry.');
      transcribing.add(req.user.id);
      _res.once('close', () => {
        if (!req.audioProcessing) transcribing.delete(req.user.id);
      });
      next();
    },
    express.raw({ type: () => true, limit: '8mb', inflate: false }),
    async (req, res) => {
      const type = (req.get('Content-Type') || '').split(';')[0].trim();
      if (!validAudio(req.body, type))
        fail(415, 'Unsupported audio. Please record again using a supported browser.');
      if (res.destroyed) return;
      req.audioProcessing = true;
      try {
        const result = await transcriber.transcribeAudio(req.body, type);
        res.json(result);
      } finally {
        transcribing.delete(req.user.id);
      }
    },
  );
  app.put('/api/me', async (req, res) => {
    const patch = accountSchema.parse(req.body);
    res.json(await repo.put('users', { ...req.user, ...patch }));
  });
  app.get('/api/profile', async (req, res) => res.json(await repo.profile(req.user.id)));
  app.put('/api/profile', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'Student access required.');
    const p = profileSchema.parse(req.body);
    await repo.saveProfile(req.user.id, p);
    res.json(p);
  });
  app.delete('/api/profile', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'Student access required.');
    await repo.remove('student_profiles', req.user.id);
    res.sendStatus(204);
  });
  app.get('/api/questions', async (req, res) => {
    const qs = await repo.list('questions');
    res.json(
      staff(req.user)
        ? qs.map(unpackQuestion)
        : qs
            .filter((q) => q.active)
            .map(({ expected_concepts, verified_context, source_url, ...q }) => q),
    );
  });
  app.get('/api/question-angles', async (_req, res) => {
    const rows = await repo.list('questions');
    res.json(
      angleBank
        .filter((t) =>
          rows.some(
            (q) =>
              q.id === t.topic_id &&
              q.active &&
              q.is_main_question &&
              q.text === t.original_text &&
              q.category === t.category,
          ),
        )
        .map(({ original_text, ...topic }) => ({
          ...topic,
          angles: topic.angles.map(({ expected_concepts, ...angle }) => angle),
        })),
    );
  });
  app.post('/api/questions', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    res.status(201).json(
      await repo.put('questions', {
        id: randomUUID(),
        ...packQuestion(questionSchema.parse(req.body), req.body, req.user.id),
      }),
    );
  });
  app.put('/api/questions/:id', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    if (!(await repo.get('questions', req.params.id))) fail(404, 'Question not found.');
    res.json(
      await repo.put('questions', {
        id: req.params.id,
        ...packQuestion(questionSchema.parse(req.body), req.body, req.user.id),
      }),
    );
  });
  app.delete('/api/questions/:id', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    await repo.remove('questions', req.params.id);
    res.sendStatus(204);
  });
  app.get('/api/resources', async (req, res) => {
    const kind = z.enum(resourceKinds).optional().parse(req.query.kind);
    let rows = (await repo.list('resources')).filter((r) => r.id !== BANK_ID);
    if (req.user.role !== 'admin') rows = rows.filter((r) => r.active);
    if (kind) rows = rows.filter((r) => r.kind === kind);
    res.json(rows.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)));
  });
  app.post('/api/resources', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    res.status(201).json(
      await repo.put('resources', {
        id: randomUUID(),
        ...resourceSchema.parse(req.body),
        updated_at: new Date().toISOString(),
      }),
    );
  });
  app.put('/api/resources/:id', async (req, res) => {
    if (req.params.id === BANK_ID) fail(403, 'Use the standards dashboard for this resource.');
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    if (!(await repo.get('resources', req.params.id))) fail(404, 'Resource not found.');
    res.json(
      await repo.put('resources', {
        id: req.params.id,
        ...resourceSchema.parse(req.body),
        updated_at: new Date().toISOString(),
      }),
    );
  });
  app.delete('/api/resources/:id', async (req, res) => {
    if (req.params.id === BANK_ID) fail(403, 'Use the standards dashboard for this resource.');
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    await repo.remove('resources', req.params.id);
    res.sendStatus(204);
  });
  app.get('/api/sessions', async (req, res) => {
    const rows = [];
    for (const s of await repo.sessions())
      if (await canRead(req.user, s.student_id)) {
        await audit(req.user, s.student_id, 'session-list');
        rows.push({
          id: s.id,
          student_id: s.student_id,
          state: s.state,
          practice_category: s.practice_category || null,
          started_at: s.started_at,
          completed_at: s.completed_at,
          report: s.report
            ? {
                overall_score: s.report.overall_score,
                readiness_level: s.report.readiness_level,
                scoring_version: s.report.scoring_version || null,
              }
            : null,
        });
      }
    res.json(rows.sort((a, b) => b.started_at.localeCompare(a.started_at)));
  });
  app.post('/api/sessions', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'Student access required.');
    if (req.body?.consent !== true) fail(400, 'Explicit consent is required.');
    const p = await repo.profile(req.user.id);
    if (!p) fail(409, 'Complete your student profile first.');
    const category = z.string().trim().min(1).max(80).optional().parse(req.body.category);
    const qs = (await repo.list('questions'))
      .filter((q) => q.active && q.is_main_question && (!category || q.category === category))
      .map((q) => snapshotQuestion(selectAngle(q), p));
    const bank = await standards.read();
    const useStandards = bank.enabled && !category;
    if (useStandards && !['openai', 'groq'].includes(llm.name))
      fail(409, 'Standards scoring is not available with the configured provider.');
    const previous=useStandards?(await repo.sessions()).filter(s=>s.student_id===req.user.id&&s.rubric_version===standardVersion).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0]:null;
    const created = createSession(
      req.user.id,
      p,
      useStandards ? selectStandardInterview(bank,undefined,previous?.questions?.map(q=>q.id)) : orderInterviewQuestions(qs),
    );
    if (useStandards) {
      created.rubric_version = standardVersion;
      created.grammar_allowance = bank.grammar_allowance;
      created.standard_bank_revision = bank.revision;
    }
    created.practice_category = category || null;
    res.status(201).json(student(await repo.saveSession(created, -1)));
  });
  app.get('/api/sessions/:id', async (req, res) => {
    const s = await session(req);
    await audit(req.user, s.student_id, 'interview-and-transcripts');
    res.json(staff(req.user) ? s : student(s));
  });
  app.get('/api/sessions/:id/evaluation', async (req, res) => {
    res.json(evaluationStatus(await session(req), !!evaluator?.enabled));
  });
  app.post(
    '/api/sessions/:id/evaluate',
    rateLimit({ windowMs: 60000, limit: 3 }),
    async (req, res) => {
      const s = await session(req);
      if (s.state !== 'REPORT' || s.retained_at)
        fail(409, 'A completed interview with retained answers is required.');
      if (!evaluator?.enabled) fail(503, 'AI evaluation is unavailable.');
      await audit(req.user, s.student_id, 'requested-interview-evaluation');
      const status = evaluationStatus(s, true);
      if (['queued', 'running'].includes(status.state)) return res.status(202).json(status);
      if (!status.can_retry)
        return res.status(409).json({
          error: status.message || 'No answers need evaluation, or retry is not available yet.',
        });
      await evaluator.enqueue(s);
      res.status(202).json({ status: 'queued', session_id: s.id });
    },
  );
  app.post(
    '/api/sessions/:id/answers',
    rateLimit({ windowMs: 60000, limit: 15 }),
    async (req, res) => {
      const input = z
        .object({
          request_id: z.uuid(),
          version: z.number().int().min(0),
          transcript: z.string().trim().min(1).max(12000),
          spoken_seconds: z.number().min(0).max(3600).nullable().optional(),
        })
        .parse(req.body);
      let s = await session(req);
      if (s.student_id !== req.user.id || req.user.role !== 'student')
        fail(403, 'Only the student may submit answers.');
      if (s.answers.some((a) => a.request_id === input.request_id)) return res.json(student(s));
      if (s.version !== input.version) fail(409, 'Interview changed. Reload the saved attempt.');
      if (!['MAIN_QUESTION', 'FOLLOW_UP'].includes(s.state))
        fail(409, 'This interview is no longer accepting answers.');
      let evaluation = null,
        warning = null,
        shouldEnqueue = false;
      try {
        if (!deferScoring)
          evaluation = await llm.evaluateAnswer({
            profile: s.profile_snapshot,
            question: currentQuestion(s),
            answer: input.transcript,
            prior_qa: s.answers.map((a) => ({ question: a.question_text, answer: a.transcript })),
            is_followup: !!s.pending_follow_up,
          });
        if (evaluation) evaluation.follow_up_question = llm.generateFollowUp(evaluation);
      } catch (error) {
        reportFailure('AI evaluation failed:', error);
        warning = `Your answer was saved. ${evaluationFailure(error)}`;
      }
      s = applyAnswer(s, input, evaluation);
      if (s.state === 'REPORT') {
        const allEvaluated = fullyEvaluated(s);
        if (allEvaluated) {
          try {
            const report = await llm.generateFinalReport?.(s);
            if (report) s.report = mergeReport(s, report);
          } catch (error) {
            reportFailure('AI report failed:', error);
            warning ??=
              'Your answers were saved, but the AI report was unavailable. A locally aggregated report is shown instead.';
          }
        } else if (evaluator?.enabled) {
          shouldEnqueue = true;
          warning ??=
            'Your answers were saved. AI scoring will complete shortly, and your overall score will appear here once finished.';
        }
      } else if (evaluation === null) {
        if (evaluator?.enabled) {
          shouldEnqueue = true;
          warning ??=
            'Your answer was saved. AI scoring is running in the background; continue to the next question.';
        } else {
          warning =
            'Your answer was saved, but AI evaluation was unavailable. This attempt will have no overall score.';
        }
      }
      s = await repo.saveSession(s, input.version);
      // Only queue after committing, so workers never read the pre-answer version.
      if (shouldEnqueue) {
        try {
          await evaluator.enqueue(s, { respectCooldown: true });
          s = await repo.session(s.id);
        } catch {
          warning = 'Your answers are saved. Open the completed report to retry evaluation.';
        }
      }
      res.json({ ...student(s), warning });
    },
  );
  app.put('/api/sessions/:id/review-hold', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    let s = await session(req);
    const { review_hold } = z.object({ review_hold: z.boolean() }).parse(req.body);
    s.review_hold = review_hold;
    await audit(req.user, s.student_id, review_hold ? 'hold-enabled' : 'hold-disabled');
    res.json(await repo.saveSession(s, s.version));
  });
  app.get('/api/sessions/:id/coaching', async (req, res) => {
    const s = await session(req);
    if (s.state !== 'REPORT' || s.retained_at)
      fail(409, 'Complete an interview to view practice examples.');
    res.json({
      rubric_weights: s.rubric_version===standardVersion ? standardWeights : rubricWeights,
      items: s.answers.map((a) => ({
        answer_id: a.id,
        example:
          coaching[a.category] ||
          'I chose [option] because [specific evidence], which relates to [personal goal].',
        feedback: a.evaluation?.feedback || null,
      })),
    });
  });
  app.get('/api/sessions/:id/calibration', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const s = await session(req);
    if (s.rubric_version === standardVersion)
      fail(
        409,
        'The legacy calibration form does not support this standards rubric. Review the point-by-point report instead.',
      );
    if (s.state !== 'REPORT' || s.retained_at)
      fail(409, 'A completed interview with transcripts is required.');
    await audit(req.user, s.student_id, 'calibration-review');
    res.json({
      profile: s.profile_snapshot,
      questions: s.questions,
      answers: s.answers.map((a) => ({
        id: a.id,
        question: a.question_text,
        transcript: a.transcript,
        reviewed: !!a.human_reviews?.some((r) => r.reviewer_id === req.user.id),
      })),
      comparison: comparison(s, req.user.id),
    });
  });
  app.post('/api/sessions/:id/calibration/:answerId', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const input = humanSchema.parse(req.body),
      s = await session(req);
    if (s.rubric_version === standardVersion)
      fail(409, 'The legacy calibration form does not support this standards rubric.');
    if (s.state !== 'REPORT' || s.retained_at)
      fail(409, 'A completed interview with transcripts is required.');
    const a = s.answers.find((a) => a.id === req.params.answerId);
    if (!a) fail(404, 'Answer not found.');
    if (a.human_reviews?.some((r) => r.reviewer_id === req.user.id))
      fail(409, 'Your independent assessment is already submitted.');
    if (
      input.metrics.accuracy !== null &&
      !s.questions.some((q) => q.id === a.question_id && q.verified_context && q.source_url)
    )
      fail(400, 'Accuracy requires verified question evidence.');
    (a.human_reviews ??= []).push({
      ...input,
      reviewer_id: req.user.id,
      created_at: new Date().toISOString(),
    });
    await audit(req.user, s.student_id, 'calibration-submit');
    await repo.saveSession(s, s.version);
    res.json(comparison(s, req.user.id));
  });
  app.get('/api/students', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    const rows = [];
    for (const u of await repo.list('users'))
      if (u.role === 'student' && (await canRead(req.user, u.id))) {
        await audit(req.user, u.id, 'student-profile');
        rows.push({ ...u, profile: await repo.profile(u.id) });
      }
    res.json(rows);
  });
  app.get('/api/users', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    res.json(await repo.list('users'));
  });
  app.get('/api/assignments', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    res.json(await repo.list('assignments'));
  });
  app.post('/api/assignments', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const p = z.object({ counsellor_id: z.uuid(), student_id: z.uuid() }).parse(req.body);
    const c = await repo.get('users', p.counsellor_id),
      s = await repo.get('users', p.student_id);
    if (c?.role !== 'counsellor' || s?.role !== 'student')
      fail(400, 'Choose a counsellor and student.');
    const old = (await repo.list('assignments')).find(
      (a) => a.student_id === p.student_id && a.counsellor_id === p.counsellor_id,
    );
    res.json(old || (await repo.put('assignments', { id: randomUUID(), ...p })));
  });
  app.delete('/api/assignments/:id', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    await repo.remove('assignments', req.params.id);
    res.sendStatus(204);
  });
  app.get('/api/audit', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    res.json(
      (await repo.list('access_logs'))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 100),
    );
  });
  app.get('/api/leaderboard', async (_req, res) => {
    const sessions = await repo.sessions(),
      rows = [];
    for (const p of await repo.list('student_profiles')) {
      if (!p.leaderboard_opt_in) continue;
      const scores = sessions
        .filter(
          (s) =>
            s.student_id === p.id &&
            s.state === 'REPORT' &&
            !s.practice_category &&
            s.report?.overall_score != null,
        )
        .map((s) => s.report.overall_score);
      if (scores.length) rows.push({ alias: p.leaderboard_alias, score: Math.max(...scores) });
    }
    res.json(rows.sort((a, b) => b.score - a.score).slice(0, 100));
  });
  if (serveDir && existsSync(join(serveDir, 'index.html'))) {
    app.use(express.static(serveDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api'))
        return res.sendFile(join(serveDir, 'index.html'), (err) => err && next());
      next();
    });
  }
  app.use((err, _req, res, _next) => {
    // Body-parser syntax errors can contain fragments of the submitted private payload.
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    if (err.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    res.status(status).json({
      error:
        status === 500
          ? 'Something went wrong. Please try again.'
          : err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : err.message,
    });
  });
  return app;
}
