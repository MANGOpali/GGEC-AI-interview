import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  emptyBank,
  bankReadiness,
  selectStandardInterview,
  saveBankQuestion,
  standardVersion,
  createBankStore,
} from '../src/standards-bank.js';
import { validatedStandardEvaluation, sentences } from '../src/standards-evaluation.js';
import { scoreAnswer } from '../src/scoring.js';
import { createSession, applyAnswer } from '../src/domain.js';
export function completeBank() {
  const bank = emptyBank();
  for (let i = 0; i < 7; i++) {
    const id = randomUUID();
    saveBankQuestion(bank, {
      id,
      type: 'major',
      introduction: i === 0,
      text: `Major ${i} question?`,
      category: i === 0 ? 'Introduction' : `Category ${i}`,
      points: [
        { id: 'p1', text: 'First required meaning', weight: 1 },
        { id: 'p2', text: 'Second required meaning', weight: 1 },
      ],
    });
    for (let j = 0; j < 5; j++)
      saveBankQuestion(bank, {
        type: 'cross',
        parent_id: id,
        text: `Cross ${i}-${j} question?`,
        category: `Category ${i}`,
        points: [{ id: 'c1', text: 'Cross meaning', weight: 1 }],
      });
  }
  for (let i = 0; i < 3; i++)
    saveBankQuestion(bank, {
      type: 'extra',
      text: `Extra ${i} question?`,
      category: 'Extra',
      points: [{ id: 'e1', text: 'Extra meaning', weight: 1 }],
    });
  return bank;
}
const response = (points) => ({
  point_results: points.map((p) => ({ point_id: p.id, credit: 1, evidence: 'Relevant evidence' })),
  fluency_clarity: 8,
  overall_correctness: 8,
  grammar_error_sentence_ids: [],
  feedback: 'One short improvement.',
  reasoning: 'Evidence.',
  missing_information: [],
  contradictions: [],
});
test('19-question selection meets counts, parent links, introduction and cross distributions', () => {
  const bank = completeBank();
  assert(bankReadiness(bank).ready);
  const sequences = new Set();
  for (let k = 0; k < 50; k++) {
    const qs = selectStandardInterview(bank);
    assert.equal(qs.length, 19);
    assert(qs[0].introduction);
    assert.equal(qs.filter((q) => q.question_type === 'major').length, 7);
    assert.equal(qs.filter((q) => q.question_type === 'cross').length, 9);
    assert.equal(qs.filter((q) => q.question_type === 'extra').length, 3);
    assert.equal(new Set(qs.map((q) => q.id)).size, 19);
    let parent;
    const counts = {};
    for (const q of qs) {
      if (q.question_type === 'major') {
        parent = q.id;
        counts[parent] = 0;
      } else if (q.question_type === 'extra') parent = null;
      else {
        assert.equal(q.parent_question_id, parent);
        counts[parent]++;
      }
    }
    assert(Object.values(counts).every((n) => n >= 0 && n <= 3));
    sequences.add(qs.map((q) => q.id).join(','));
  }
  assert(sequences.size > 1);
  const snap = selectStandardInterview(bank);
  bank.questions[0].points[0].text = 'Changed';
  assert.notEqual(snap[0].standard.points[0].text, 'Changed');
});
test('incomplete standards fail closed, and a sixth cross is rejected', () => {
  const bank = completeBank(),
    parent = bank.questions.find((q) => q.type === 'major');
  assert.throws(
    () =>
      saveBankQuestion(bank, {
        type: 'cross',
        parent_id: parent.id,
        text: 'Sixth cross?',
        category: 'Test',
        points: [],
      }),
    /five/,
  );
  bank.questions.find((q) => q.type === 'cross').points = [];
  assert(!bankReadiness(bank).ready);
  assert.throws(() => selectStandardInterview(bank), /not ready/);
});
test('standard partial credit and sentence-based allowance use deterministic arithmetic', () => {
  const question = selectStandardInterview(completeBank())[0];
  const context = {
    question,
    grammar_allowance: 20,
    sentences: sentences('One. Two. Three. Four. Five.'),
  };
  const raw = response(question.standard.points);
  raw.point_results[1].credit = 0.5;
  raw.grammar_error_sentence_ids = [1];
  const e = validatedStandardEvaluation(raw, context);
  assert.equal(e.standard_coverage, 7.5);
  assert.equal(e.grammar, 10);
  assert.equal(scoreAnswer(e), 79);
  raw.grammar_error_sentence_ids = [1, 2, 3];
  assert.equal(validatedStandardEvaluation(raw, context).grammar, 5);
  raw.grammar_error_sentence_ids = [1, 1];
  assert.throws(() => validatedStandardEvaluation(raw, context), /sentence/);
  raw.grammar_error_sentence_ids = [];
  raw.point_results[1].point_id = 'unknown';
  assert.throws(() => validatedStandardEvaluation(raw, context), /coverage/);
});
test('nineteen submitted answers complete with cross grouping, no live followups and timing flags', () => {
  const qs = selectStandardInterview(completeBank());
  const s = createSession('student', {}, qs);
  s.rubric_version = standardVersion;
  s.grammar_allowance = 20;
  for (const q of qs) {
    const e = validatedStandardEvaluation(response(q.standard.points), {
      question: q,
      grammar_allowance: 20,
      sentences: sentences('A clear answer.'),
    });
    applyAnswer(
      s,
      {
        request_id: randomUUID(),
        transcript: 'A clear answer.',
        spoken_seconds: q.question_type === 'cross' ? 45 : 90,
      },
      e,
    );
  }
  assert.equal(s.state, 'REPORT');
  assert.equal(s.answers.length, 19);
  assert.equal(s.report.scoring_version, standardVersion);
  assert.equal(s.report.overall_score, 94);
  assert.equal(s.answers.filter((a) => a.is_followup).length, 9);
  assert(s.answers.filter((a) => a.is_followup).every((a) => a.parent_answer_id));
  assert.equal(s.answers[0].duration_flag, 'below_minimum');
});
test('standards document uses revision checks and serializes edits', async () => {
  let row = null;
  const repo = { get: async () => row, put: async (_, r) => (row = structuredClone(r)) };
  const store = createBankStore(repo);
  await store.update(0, (b) => (b.grammar_allowance = 30));
  await assert.rejects(
    store.update(0, (b) => (b.grammar_allowance = 10)),
    /changed/,
  );
  assert.equal((await store.read()).grammar_allowance, 30);
});

test('saved previous sequence is not repeated even when random draws repeat', () => {
  const bank = completeBank();
  const first = selectStandardInterview(bank, () => 0);
  const second = selectStandardInterview(
    bank,
    () => 0,
    first.map((q) => q.id),
  );
  assert.notDeepEqual(
    second.map((q) => q.id),
    first.map((q) => q.id),
  );
  assert.equal(second[0].id, first[0].id);
  assert.equal(second.length, 19);
});

test('cross-question gaps are filled by distinct extras, including seven crosses and none', () => {
  const bank = completeBank();
  for (let i = 3; i < 12; i++)
    saveBankQuestion(bank, {
      type: 'extra',
      text: 'Additional extra ' + i,
      category: 'Extra',
      points: [{ id: 'p', text: 'Required meaning', weight: 1 }],
    });
  for (const crossTotal of [0, 7, 9]) {
    let calls = 0;
    // Selecting the other six majors consumes five shuffle draws before the total draw.
    const pick = (n) => {
      calls++;
      return calls === 6 ? crossTotal : 0;
    };
    const qs = selectStandardInterview(bank, pick);
    assert.equal(qs.length, 19);
    assert.equal(qs.filter((q) => q.question_type === 'cross').length, crossTotal);
    assert.equal(qs.filter((q) => q.question_type === 'extra').length, 12 - crossTotal);
    assert.equal(new Set(qs.map((q) => q.id)).size, 19);
    assert(qs[0].introduction);
    for (const major of qs.filter((q) => q.question_type === 'major'))
      assert(qs.filter((q) => q.parent_question_id === major.id).length <= 3);
  }
  bank.questions
    .filter((q) => q.type === 'extra')
    .slice(5)
    .forEach((q) => (q.active = false));
  const qs = selectStandardInterview(bank, () => 0);
  assert.equal(qs.filter((q) => q.question_type === 'cross').length, 7);
  assert.equal(qs.filter((q) => q.question_type === 'extra').length, 5);
});
