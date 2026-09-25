import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { standardVersion, standardWeights } from './standards-bank.js';
import { scoreAnswer, answerContributions, scoringVersion, rubricWeights } from './scoring.js';
export const mainQuestionSeconds = 120;
export const followUpSeconds = 60;
export const metrics = [
  'relevance',
  'accuracy',
  'course_knowledge',
  'university_research',
  'financial_knowledge',
  'career_credibility',
  'consistency_with_profile',
  'completeness',
  'clarity_communication',
];
const text = z.string().trim().max(3000);
// Only university, course and intake are required from students. The remaining fields are
// legacy history: existing profiles keep whatever values they already have, but new/edited
// profiles are never required to fill or show them.
export const profileSchema = z
  .object({
    name: text.default(''),
    nationality: text.default(''),
    previous_qualification: text.default(''),
    university: text.min(1),
    intake: z.string().trim().min(1).max(80),
    course: text.min(1),
    course_duration: text.default(''),
    tuition_fee: z.number().min(0).max(1000000).default(0),
    scholarship: z.number().min(0).max(1000000).default(0),
    study_gap: text.default(''),
    work_experience: text.default(''),
    funding_details: text.default(''),
    accommodation: text.default(''),
    career_plans: text.default(''),
    leaderboard_opt_in: z.boolean().default(false),
    leaderboard_alias: z.string().trim().max(40).default(''),
  })
  .refine((p) => p.scholarship <= p.tuition_fee, {
    message: 'Scholarship cannot exceed tuition fee.',
  })
  .refine((p) => !p.leaderboard_opt_in || p.leaderboard_alias.length > 0, {
    message: 'Choose a public alias to join the leaderboard.',
  });
export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9][0-9\s()-]*$/, 'Enter a valid phone number.');
export const accountSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: phoneSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined, {
    message: 'Nothing to update.',
  });
export const questionSchema = z.object({
  text: text.min(5),
  category: z.string().trim().min(1).max(80),
  expected_concepts: text,
  verified_context: text,
  source_url: z.union([z.literal(''), z.url()]),
  weight: z.number().positive().max(10),
  is_main_question: z.boolean(),
  active: z.boolean(),
  time_limit_seconds: z.number().int().min(15).max(900).nullable().default(null),
});
export const resourceKinds = ['template', 'research'];
export const resourceSchema = z.object({
  kind: z.enum(resourceKinds),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).default(''),
  position: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});
export const evaluationSchema = z
  .object({
    ...Object.fromEntries(metrics.map((k) => [k, z.number().min(0).max(10).nullable()])),
    follow_up_needed: z.boolean(),
    follow_up_question: z.string().trim().min(5).max(500).nullable(),
    feedback: z.string().max(2000),
  })
  .refine((x) => !x.follow_up_needed || !!x.follow_up_question, {
    message: 'Follow-up question required',
  });
export const reportNotice =
  'Practice feedback only; readiness thresholds are configurable implementation defaults, not university or visa decisions. Unverified accuracy and inapplicable categories are unscored. Text does not establish confidence or memorization.';
export const reportSchema = z.object({
  overall_score: z.number().min(0).max(100).nullable(),
  readiness_level: z.enum(['Ready', 'Needs Practice', 'Not Ready', 'Not evaluated']),
  category_scores: z.record(z.string().trim().min(1).max(80), z.number().min(0).max(100)),
  strong_areas: z.array(z.string().max(200)).max(20),
  weak_areas: z.array(z.string().max(200)).max(20),
  poor_answers: z.array(z.object({ answer_id: z.string(), question: z.string().max(500) })).max(20),
  recommendations: z.array(z.string().max(1000)).max(30),
});
export function fullyEvaluated(s) {
  return s.answers.length > 0 && s.answers.every((a) => scoreAnswer(a.evaluation) !== null);
}
export { seedQuestions } from './questionBank.js';
export const seedResources = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    kind: 'template',
    title: 'STAR answer template',
    body: 'Use four short moves for almost any interview question.\n\nSituation - set the scene in one sentence.\nTask - say what you had to decide or do.\nAction - describe what you actually did, in your own words.\nResult - give the outcome and what you learned.\n\nKeep it personal. Interviewers trust specific detail far more than a polished sentence.',
    position: 1,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    kind: 'template',
    title: 'Finance and funding template',
    body: 'Answer money questions with a clear, honest structure.\n\nSponsor - who is paying, and your relationship to them.\nIncome and savings - what funds are actually available and accessible.\nTuition - the exact fee for your course and intake.\nLiving costs - a realistic monthly budget for rent, food, travel and books.\nEvidence - the bank statements or sponsor letters you can show.\n\nNever guess a number. If a figure changes, update it before your interview.',
    position: 2,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    kind: 'template',
    title: 'University research template',
    body: 'Build a specific, checkable reason for choosing this university.\n\nCourse and modules - name modules you actually want to study.\nFacilities and staff - research groups, labs or support that fit your goals.\nComparison - one or two alternatives you considered and why this one won.\nCourse facts - duration, fees, intake and entry requirements from the official page.\n\nQuote the source in your own words rather than reading a page aloud.',
    position: 3,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000004',
    kind: 'research',
    title: 'How to research a university',
    body: 'Start at the official university website, not an agency or forum.\n\n1. Open the official course page and confirm the course title, duration and intake.\n2. Read the module list for your specific intake and note two modules that interest you.\n3. Check the department page for staff, research areas and facilities.\n4. Record the exact page you used and the date you checked it.\n\nTreat rankings and reviews as background only. Base your answer on facts you verified yourself.',
    position: 1,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000005',
    kind: 'research',
    title: 'Verify course modules and fees',
    body: 'Course details change between intakes, so verify before every interview.\n\n- Use the official course page for the correct intake year.\n- Confirm the exact tuition fee and any deposit or scholarship conditions.\n- List the compulsory modules, then any optional modules you plan to take.\n- Note the English language and academic entry requirements.\n\nIf a detail is not published, say so and explain how you will confirm it.',
    position: 2,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    kind: 'research',
    title: 'Funding and living costs research',
    body: 'Prepare a budget you can defend with evidence.\n\n1. Total your tuition for the full course, not one year.\n2. Estimate living costs for the actual city using the university cost-of-living guidance.\n3. List each funding source: savings, family support, sponsor, scholarship or loan.\n4. Keep documents ready: bank statements, sponsor letter, scholarship offer.\n\nYour answers should match the figures on your documents exactly.',
    position: 3,
    active: true,
  },
];
export function currentQuestion(s) {
  return s.pending_follow_up || s.questions[s.index] || null;
}
export function createSession(studentId, profile, questions) {
  if (!questions.length)
    throw Object.assign(new Error('No active main questions are available.'), { status: 409 });
  const timed = questions.map((q) => ({
    ...q,
    time_limit_seconds: q.time_limit_seconds ?? mainQuestionSeconds,
  }));
  return {
    id: randomUUID(),
    student_id: studentId,
    version: 0,
    state: 'MAIN_QUESTION',
    index: 0,
    questions: timed,
    question_started_at: new Date().toISOString(),
    profile_snapshot: profile,
    answers: [],
    pending_follow_up: null,
    report: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    review_hold: false,
    consent: { version: '2026-09-v1', accepted_at: new Date().toISOString() },
  };
}
export function applyAnswer(
  s,
  { request_id, transcript, spoken_seconds },
  evaluation,
  now = new Date(),
) {
  if (s.state === 'REPORT')
    throw Object.assign(new Error('Interview is already complete.'), { status: 409 });
  const q = currentQuestion(s),
    follow = !!s.pending_follow_up || q.question_type === 'cross';
  const startedAt = Date.parse(s.question_started_at);
  const duration = Number.isFinite(startedAt)
    ? Math.max(0, Math.min(3600, Math.round((now.getTime() - startedAt) / 1000)))
    : 0;
  const limit = Number.isFinite(q.time_limit_seconds)
    ? q.time_limit_seconds
    : follow
      ? followUpSeconds
      : mainQuestionSeconds;
  const answer = {
    id: randomUUID(),
    request_id,
    question_id: q.id,
    question_text: q.text,
    category: q.category,
    weight: q.weight,
    transcript,
    evaluation,
    answer_score: scoreAnswer(evaluation),
    is_followup: follow,
    parent_answer_id:
      q.question_type === 'cross'
        ? s.answers.find((a) => a.question_id === q.parent_question_id)?.id
        : follow
          ? q.parent_answer_id
          : null,
    question_type: q.question_type || (follow ? 'cross' : 'major'),
    spoken_seconds: spoken_seconds ?? null,
    duration_flag:
      q.question_type && spoken_seconds == null
        ? 'spoken_duration_unavailable'
        : q.question_type === 'major' && spoken_seconds < 120
          ? 'below_minimum'
          : q.question_type === 'cross' && spoken_seconds >= 60
            ? 'at_or_over_limit'
            : null,
    time_limit_seconds: limit,
    duration_seconds: duration,
    over_time: duration > limit,
    answered_at: now.toISOString(),
    created_at: now.toISOString(),
  };
  s.answers.push(answer);
  if (s.rubric_version !== standardVersion && !follow && evaluation?.follow_up_needed) {
    s.pending_follow_up = {
      ...q,
      text: evaluation.follow_up_question,
      parent_answer_id: answer.id,
      time_limit_seconds: followUpSeconds,
    };
    s.state = 'FOLLOW_UP';
  } else {
    s.pending_follow_up = null;
    s.index++;
    s.state = s.index >= s.questions.length ? 'REPORT' : 'MAIN_QUESTION';
  }
  s.question_started_at = now.toISOString();
  if (s.state === 'REPORT') {
    s.completed_at = now.toISOString();
    s.report = buildReport(s);
  }
  return s;
}
export function buildReport(s) {
  const evaluated = s.answers.filter((a) => scoreAnswer(a.evaluation) !== null),
    categories = {};
  const contributions = answerContributions(s.answers);
  for (const item of contributions) {
    if (item.score === null) continue;
    const c = (categories[item.category] ??= { total: 0, weight: 0 });
    c.total += item.score * item.weight;
    c.weight += item.weight;
  }
  const breakdown = Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, Math.round(v.total / v.weight)]),
  );
  const total = Object.values(categories).reduce((a, c) => a + c.total, 0),
    weight = Object.values(categories).reduce((a, c) => a + c.weight, 0);
  const allMainQuestionsAnswered =
    !s.questions?.length ||
    s.questions.every((q) =>
      s.answers.some(
        (a) => (s.rubric_version === standardVersion || !a.is_followup) && a.question_id === q.id,
      ),
    );
  const complete = fullyEvaluated(s) && allMainQuestionsAnswered && weight > 0;
  const score = complete ? Math.round(total / weight) : null;
  return {
    scoring_version: s.rubric_version || scoringVersion,
    rubric_weights: s.rubric_version === standardVersion ? standardWeights : rubricWeights,
    grammar_allowance: s.grammar_allowance,
    answer_scores: contributions.map((c) => ({
      answer_id: c.answer.id,
      score: c.score,
      effective_weight: c.weight,
    })),
    overall_score: score,
    readiness_level:
      score === null
        ? 'Not evaluated'
        : score >= 75
          ? 'Ready'
          : score >= 50
            ? 'Needs Practice'
            : 'Not Ready',
    evaluated_answers: evaluated.length,
    total_answers: s.answers.length,
    category_scores: breakdown,
    strong_areas: Object.keys(breakdown).filter((k) => breakdown[k] >= 75),
    weak_areas: Object.keys(breakdown).filter((k) => breakdown[k] < 60),
    poor_answers: evaluated
      .filter((a) => scoreAnswer(a.evaluation) < 50)
      .map((a) => ({ answer_id: a.id, question: a.question_text })),
    recommendations: evaluated.map((a) => a.evaluation.feedback).filter(Boolean),
    notice: reportNotice,
  };
}
// Narrative providers may enrich text, but cannot override scores, coverage or readiness.
export function mergeReport(session, narrative) {
  const computed = buildReport(session);
  return {
    ...narrative,
    ...computed,
    recommendations: narrative?.recommendations ?? computed.recommendations,
  };
}
