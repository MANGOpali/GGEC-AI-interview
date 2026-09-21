import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer, rubricWeights } from '../src/scoring.js';
import { buildReport, fullyEvaluated, mergeReport } from '../src/domain.js';
const evaluation = (value) => ({
  ...Object.fromEntries(Object.keys(rubricWeights).map((k) => [k, value])),
  feedback: 'Practice examples.',
  missing_information: [],
  contradictions: [],
});
const answer = (id, value, extra = {}) => ({
  id,
  question_id: id,
  category: 'Plans',
  weight: 1,
  is_followup: false,
  evaluation: evaluation(value),
  ...extra,
});
test('weighted rubric renormalizes nullable criteria and keeps actual zero scores', () => {
  const e = evaluation(null);
  Object.assign(e, {
    relevance: 8,
    consistency_with_profile: 6,
    completeness: 4,
    clarity_communication: 10,
  });
  assert.equal(scoreAnswer(e), 67.69);
  assert.equal(scoreAnswer(evaluation(0)), 0);
  assert.equal(scoreAnswer(evaluation(null)), null);
  assert.equal(scoreAnswer({ ...evaluation(8), completeness: undefined }), null);
  assert.equal(scoreAnswer({ ...evaluation(8), accuracy: NaN }), null);
  assert.equal(fullyEvaluated({ answers: [{ evaluation: {} }] }), false);
});
test('irrelevance caps prevent polished unrelated answers from scoring highly', () => {
  assert.equal(scoreAnswer({ ...evaluation(10), relevance: 0 }), 0);
  assert.equal(scoreAnswer({ ...evaluation(10), relevance: 2 }), 29);
  assert.equal(scoreAnswer({ ...evaluation(10), relevance: 4 }), 49);
});
test('follow-ups share the main weight and category weights are honored', () => {
  const s = {
    answers: [
      answer('main', 8),
      answer('follow', 4, { is_followup: true, parent_answer_id: 'main' }),
      answer('other', 10, { category: 'Finance', weight: 2 }),
    ],
  };
  const r = buildReport(s);
  assert.equal(r.overall_score, 87);
  assert.equal(r.category_scores.Plans, 60);
  assert.equal(r.category_scores.Finance, 100);
  assert.deepEqual(
    r.answer_scores.map((a) => a.effective_weight),
    [0.5, 0.5, 2],
  );
});
test('missing evaluation or unanswered main questions withholds final scores', () => {
  assert.equal(
    buildReport({ answers: [answer('a', 8), answer('b', 8, { evaluation: null })] }).overall_score,
    null,
  );
  assert.equal(
    buildReport({ questions: [{ id: 'a' }, { id: 'b' }], answers: [answer('a', 8)] }).overall_score,
    null,
  );
});
test('readiness boundaries and narrative cannot replace deterministic scores', () => {
  for (const [v, label] of [
    [7.5, 'Ready'],
    [7.4, 'Needs Practice'],
    [5, 'Needs Practice'],
    [4.9, 'Not Ready'],
  ]) {
    assert.equal(buildReport({ answers: [answer('a', v)] }).readiness_level, label);
  }
  const r = mergeReport(
    { answers: [answer('a', 6)] },
    { overall_score: 100, readiness_level: 'Ready', recommendations: ['Research modules.'] },
  );
  assert.equal(r.overall_score, 60);
  assert.equal(r.readiness_level, 'Needs Practice');
  assert.deepEqual(r.recommendations, ['Research modules.']);
});
