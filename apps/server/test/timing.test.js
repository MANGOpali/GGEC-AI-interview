import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAnswer,
  createSession,
  currentQuestion,
  mainQuestionSeconds,
  followUpSeconds,
  metrics,
} from '../src/domain.js';
const questions = [
  { id: 'q1', text: 'Why this course?', category: 'Motivation', weight: 1 },
  { id: 'q2', text: 'Tell me about your studies.', category: 'Academic', weight: 1 },
];
const profile = { name: 'Timing Student' };
const evaluation = (extra = {}) => ({
  ...Object.fromEntries(metrics.map((k) => [k, 8])),
  flags: [],
  reasoning: '',
  feedback: 'Clear answer.',
  missing_information: [],
  contradictions: [],
  follow_up_needed: false,
  follow_up_question: '',
  ...extra,
});
test('main questions default to a two-minute limit and record elapsed time', () => {
  const s = createSession('student', profile, questions.map((q) => ({ ...q })));
  assert.equal(s.questions[0].time_limit_seconds, mainQuestionSeconds);
  assert.ok(s.question_started_at);
  s.question_started_at = '2026-09-17T10:00:00.000Z';
  applyAnswer(
    s,
    { request_id: 'r1', transcript: 'A complete answer.' },
    evaluation(),
    new Date('2026-09-17T10:01:10.000Z'),
  );
  const answer = s.answers[0];
  assert.equal(answer.time_limit_seconds, 120);
  assert.equal(answer.duration_seconds, 70);
  assert.equal(answer.over_time, false);
  assert.equal(s.question_started_at, '2026-09-17T10:01:10.000Z');
});
test('answers past the limit are flagged and elapsed time is clamped', () => {
  const s = createSession('student', profile, questions.map((q) => ({ ...q })));
  s.question_started_at = '2026-09-17T10:00:00.000Z';
  applyAnswer(
    s,
    { request_id: 'r1', transcript: 'A long answer.' },
    evaluation(),
    new Date('2026-09-17T10:02:05.000Z'),
  );
  assert.equal(s.answers[0].duration_seconds, 125);
  assert.equal(s.answers[0].over_time, true);
});
test('generated follow-ups default to a one-minute limit', () => {
  const s = createSession('student', profile, questions.map((q) => ({ ...q })));
  s.question_started_at = '2026-09-17T10:00:00.000Z';
  applyAnswer(
    s,
    { request_id: 'r1', transcript: 'A complete answer.' },
    evaluation({ follow_up_needed: true, follow_up_question: 'Can you say more?' }),
    new Date('2026-09-17T10:00:30.000Z'),
  );
  assert.equal(s.state, 'FOLLOW_UP');
  assert.equal(s.pending_follow_up.time_limit_seconds, followUpSeconds);
  assert.equal(currentQuestion(s).time_limit_seconds, 60);
});
test('a custom per-question limit overrides the default', () => {
  const s = createSession(
    'student',
    profile,
    questions.map((q, i) => ({ ...q, time_limit_seconds: i === 0 ? 300 : null })),
  );
  assert.equal(s.questions[0].time_limit_seconds, 300);
  assert.equal(s.questions[1].time_limit_seconds, 120);
});
