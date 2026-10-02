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
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountSchema,
  phoneSchema,
  profileSchema,
  questionSchema,
  resourceKinds,
  resourceSchema,
  createSession,
  currentQuestion,
  applyAnswer,
  fullyEvaluated,
  mergeReport,
  buildReport,
  INTERVIEW_QUESTION_COUNT,
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
      fail(409, 'Standards scoring requires a supported AI provider to be configured.');
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
      req.currentSession = s;
      if (s.student_id !== req.user.id)
        fail(403, 'Only the interview owner may transcribe an answer.');
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
        const question = currentQuestion(req.currentSession);
        const result = await transcriber.transcribeAudio(req.body, type, question?.text);
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
  const sessionListRow = (s) => ({
    id: s.id,
    student_id: s.student_id,
    state: s.state,
    practice_category: s.practice_category || null,
    is_staff_test: !!s.is_staff_test,
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
  app.get('/api/sessions', async (req, res) => {
    let rows;
    if (req.user.role === 'student') {
      // A student can always read their own sessions (canRead's first check) and audit() is a
      // no-op for non-staff anyway -- skip straight to a database-filtered query instead of
      // scanning every student's sessions just to throw most of them away.
      rows = (await repo.sessionsForStudent(req.user.id)).map(sessionListRow);
    } else {
      rows = [];
      for (const s of await repo.sessions())
        if (await canRead(req.user, s.student_id)) {
          await audit(req.user, s.student_id, 'session-list');
          rows.push(sessionListRow(s));
        }
    }
    res.json(rows.sort((a, b) => b.started_at.localeCompare(a.started_at)));
  });
  app.post('/api/sessions', async (req, res) => {
    const isStaffTest = staff(req.user);
    if (req.user.role !== 'student' && !isStaffTest) fail(403, 'Student access required.');
    if (req.body?.consent !== true) fail(400, 'Explicit consent is required.');
    let p = await repo.profile(req.user.id);
    if (!p) {
      // Staff testing the interview flow on their own account have no student profile;
      // real students still must complete theirs before starting an attempt.
      if (!isStaffTest) fail(409, 'Complete your student profile first.');
      p = {};
    }
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
    if (isStaffTest) created.is_staff_test = true;
    if (!isStaffTest) {
      const needed = created.questions.length;
      const field = category ? 'free_questions_remaining' : 'interview_question_credits_remaining';
      if ((req.user[field] ?? 0) < needed)
        fail(
          402,
          category
            ? `Not enough free practice questions remaining (${needed} needed for this category). Contact your administrator for more.`
            : `Not enough interview credits for a full interview (${needed} needed). Contact your administrator to renew your package.`,
        );
    }
    const saved = await repo.saveSession(created, -1);
    // Full interviews are charged entirely up front -- the student confirms this cost on a
    // consent popup before this request ever fires, so an abandoned attempt still costs the
    // credit it already warned about. Category/free-question practice is unaffected: it's
    // still charged per answer as it's evaluated (see app.js's /answers handler and
    // evaluator.js), since there's no equivalent upfront warning for that free-trial pool.
    if (!isStaffTest && !category) {
      try {
        await repo.adjustCredit?.(
          req.user.id,
          'interview_question_credits_remaining',
          -created.questions.length,
        );
      } catch (error) {
        console.error('Credit deduction failed:', error);
      }
    }
    res.status(201).json(student(saved));
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
      if (s.student_id !== req.user.id) fail(403, 'Only the interview owner may submit answers.');
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
            rubric_version: s.rubric_version,
            grammar_allowance: s.grammar_allowance,
            profile: s.profile_snapshot,
            question: currentQuestion(s),
            answer: input.transcript,
            prior_qa: s.answers.map((a) => ({ question: a.question_text, answer: a.transcript })),
            is_followup: !!s.pending_follow_up,
          });
        if (evaluation) {
          evaluation.follow_up_question = llm.generateFollowUp(evaluation);
          // Mirrors the background evaluator's deduction (src/evaluator.js). Full interviews are
          // charged entirely at session creation (see POST /sessions above), not here -- only
          // category/free-question practice is still charged per answer.
          if (!s.is_staff_test && s.practice_category) {
            try {
              await repo.adjustCredit?.(s.student_id, 'free_questions_remaining', -1);
            } catch (creditError) {
              console.error('Credit deduction failed:', creditError);
            }
          }
        }
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
  app.post('/api/sessions/:id/end-early', async (req, res) => {
    const { version, reason } = z
      .object({ version: z.number().int().min(0), reason: z.string().trim().min(1).max(200) })
      .parse(req.body);
    let s = await session(req);
    if (s.student_id !== req.user.id) fail(403, 'Only the interview owner may end this attempt.');
    if (s.version !== version) fail(409, 'Interview changed. Reload the saved attempt.');
    if (!['MAIN_QUESTION', 'FOLLOW_UP'].includes(s.state))
      fail(409, 'This interview is already complete.');
    s.state = 'REPORT';
    s.completed_at = new Date().toISOString();
    s.ended_reason = reason;
    s.report = buildReport(s);
    s = await repo.saveSession(s, version);
    res.json(student(s));
  });
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
  app.post('/api/users', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    if (repo.kind !== 'supabase') fail(400, 'Account creation requires Supabase mode.');
    const input = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.email(),
        phone: phoneSchema.optional(),
        role: z.enum(['student', 'counsellor', 'admin']),
      })
      .parse(req.body);
    const password = randomBytes(12).toString('base64url');
    const { data, error } = await repo.client.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: { name: input.name, ...(input.phone ? { phone: input.phone } : {}) },
    });
    if (error)
      fail(
        409,
        /already|exists/i.test(error.message)
          ? 'An account with this email already exists.'
          : 'Could not create the account.',
      );
    if (input.role !== 'student') {
      const { error: roleError } = await repo.client
        .from('users')
        .update({ role: input.role })
        .eq('id', data.user.id);
      if (roleError) fail(500, 'Account created but role assignment failed. Check it in Supabase.');
    }
    await audit(req.user, data.user.id, 'account-created');
    res
      .status(201)
      .json({ id: data.user.id, email: input.email, name: input.name, role: input.role, password });
  });
  app.get('/api/packages', async (req, res) => {
    if (!staff(req.user)) fail(403, 'Staff access required.');
    res.json((await repo.list('credit_packages')).filter((p) => p.active !== false));
  });
  app.post('/api/packages', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        price_rs: z.number().min(0),
        interview_credits: z.number().int().min(1).max(1000),
      })
      .parse(req.body);
    res
      .status(201)
      .json(await repo.put('credit_packages', { id: randomUUID(), active: true, ...input }));
  });
  app.put('/api/packages/:id', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const existing = await repo.get('credit_packages', req.params.id);
    if (!existing) fail(404, 'Package not found.');
    const input = z.object({ active: z.boolean() }).parse(req.body);
    res.json(await repo.put('credit_packages', { ...existing, ...input }));
  });
  app.post('/api/students/:id/purchases', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const target = await repo.get('users', req.params.id);
    if (target?.role !== 'student') fail(404, 'Student not found.');
    const input = z
      .object({ package_id: z.uuid(), note: z.string().trim().max(300).optional() })
      .parse(req.body);
    const pkg = await repo.get('credit_packages', input.package_id);
    if (!pkg) fail(404, 'Package not found.');
    const questionCredits = pkg.interview_credits * INTERVIEW_QUESTION_COUNT;
    const remaining = await repo.adjustCredit(
      target.id,
      'interview_question_credits_remaining',
      questionCredits,
    );
    await repo.put('credit_purchases', {
      id: randomUUID(),
      student_id: target.id,
      package_id: pkg.id,
      price_paid_rs: pkg.price_rs,
      question_credits_granted: questionCredits,
      recorded_by: req.user.id,
      note: input.note || '',
      created_at: new Date().toISOString(),
    });
    await audit(req.user, target.id, 'package-purchase-recorded');
    res.status(201).json({ interview_question_credits_remaining: remaining });
  });
  app.post('/api/students/:id/grant-free-questions', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const target = await repo.get('users', req.params.id);
    if (target?.role !== 'student') fail(404, 'Student not found.');
    const input = z.object({ amount: z.number().int().min(1).max(1000) }).parse(req.body);
    const remaining = await repo.adjustCredit(target.id, 'free_questions_remaining', input.amount);
    await repo.put('free_question_grants', {
      id: randomUUID(),
      student_id: target.id,
      amount: input.amount,
      recorded_by: req.user.id,
      note: '',
      created_at: new Date().toISOString(),
    });
    await audit(req.user, target.id, 'free-questions-granted');
    res.status(201).json({ free_questions_remaining: remaining });
  });
  app.get('/api/students/:id/credit-history', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Admin access required.');
    const target = await repo.get('users', req.params.id);
    if (target?.role !== 'student') fail(404, 'Student not found.');
    const packagesById = Object.fromEntries(
      (await repo.list('credit_packages')).map((p) => [p.id, p]),
    );
    const purchases = (await repo.list('credit_purchases'))
      .filter((p) => p.student_id === target.id)
      .map((p) => ({
        type: 'purchase',
        id: p.id,
        created_at: p.created_at,
        package_name: packagesById[p.package_id]?.name || 'Deleted package',
        price_paid_rs: p.price_paid_rs,
        question_credits_granted: p.question_credits_granted,
        note: p.note,
      }));
    const grants = (await repo.list('free_question_grants'))
      .filter((g) => g.student_id === target.id)
      .map((g) => ({ type: 'grant', id: g.id, created_at: g.created_at, amount: g.amount }));
    res.json([...purchases, ...grants].sort((a, b) => b.created_at.localeCompare(a.created_at)));
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
