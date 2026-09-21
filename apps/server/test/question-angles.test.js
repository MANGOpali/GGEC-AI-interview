import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleBank, selectAngle } from '../src/questionAngles.js';
import { seedQuestions } from '../src/questionBank.js';
import { snapshotQuestion } from '../src/practice.js';
import { createSession, applyAnswer } from '../src/domain.js';

test('ten main topics have distinct angles and related practice questions', () => {
  assert.equal(angleBank.length, 10);
  assert.equal(angleBank.flatMap((t) => t.angles).length, 40);
  assert.equal(angleBank.flatMap((t) => t.sub_questions).length, 30);
  const ids = angleBank.flatMap((t) => [...t.angles, ...t.sub_questions].map((q) => q.id));
  assert.equal(new Set(ids).size, 70);
  for (const t of angleBank)
    for (const q of t.angles) {
      assert(q.text.length > 10);
      assert(q.expected_concepts.length > 10);
    }
});
test('each choice preserves question identity, weight and evidence but has angle-specific scoring focus', () => {
  for (const q of seedQuestions.filter((q) => q.is_main_question)) {
    for (let index = 0; index < 4; index++) {
      const chosen = selectAngle({ ...q, weight: 2 }, () => index);
      assert.equal(chosen.id, q.id);
      assert.equal(chosen.weight, 2);
      assert.equal(chosen.text, angleBank.find((t) => t.topic_id === q.id).angles[index].text);
      assert.notEqual(chosen.expected_concepts, q.expected_concepts);
    }
  }
});
test('custom, staff-edited and reference questions are not replaced', () => {
  for (const q of [
    { ...seedQuestions[0], text: 'Staff custom wording' },
    { ...seedQuestions[0], category: 'Custom' },
    { ...seedQuestions[0], id: 'custom' },
    seedQuestions[10],
  ])
    assert.equal(
      selectAngle(q, () => {
        throw new Error('Must not pick');
      }),
      q,
    );
});
test('chosen wording is snapshotted, ten main questions remain, no practice sub-question is inserted', () => {
  const qs = seedQuestions
    .filter((q) => q.is_main_question)
    .map((q) =>
      snapshotQuestion(
        selectAngle(q, () => 0),
        {},
      ),
    );
  const s = createSession('fixture', {}, qs);
  const original = structuredClone(s.questions);
  for (let i = 0; i < 10; i++)
    applyAnswer(s, { request_id: `r${i}`, transcript: 'Fictional answer' }, null);
  assert.equal(s.state, 'REPORT');
  assert.equal(s.answers.length, 10);
  assert.deepEqual(s.questions, original);
  assert(s.answers.every((a, i) => a.question_text === original[i].text && !a.is_followup));
  assert(!s.questions.some((q) => q.text.includes('Nepal')));
});

test('introduction stays first while remaining questions shuffle without mutation or duplication', async () => {
 const {orderInterviewQuestions}=await import('../src/questionAngles.js');
 const questions=seedQuestions.filter(q=>q.is_main_question);
 const before=structuredClone(questions);
 const ordered=orderInterviewQuestions(questions,()=>0);
 assert.equal(ordered[0].category,'Introduction');
 assert.deepEqual(new Set(ordered.map(q=>q.id)),new Set(questions.map(q=>q.id)));
 assert.notDeepEqual(ordered.slice(1),questions.filter(q=>q.category!=='Introduction'));
 assert.deepEqual(questions,before);
 const focused=questions.filter(q=>q.category==='Finance');
 assert.deepEqual(orderInterviewQuestions(focused,()=>0),focused);
 assert.deepEqual(orderInterviewQuestions([]),[]);
 const saved=createSession('student',{},ordered);
 assert.deepEqual(saved.questions.map(q=>q.id),ordered.map(q=>q.id));
});
