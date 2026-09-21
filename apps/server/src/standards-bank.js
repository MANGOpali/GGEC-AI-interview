import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
export const BANK_ID = '70000000-0000-4000-8000-000000000019';
export const standardVersion = 'ggec-standards-v3';
export const standardWeights = {
  standard_coverage: 60,
  fluency_clarity: 20,
  grammar: 10,
  overall_correctness: 10,
};
export const bankQuestionSchema = z
  .object({
    id: z.uuid().optional(),
    type: z.enum(['major', 'cross', 'extra']),
    parent_id: z.uuid().nullable().default(null),
    introduction: z.boolean().default(false),
    text: z.string().trim().min(5).max(1500),
    category: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
    weight: z.number().positive().max(10).default(1),
    points: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          text: z.string().trim().min(1).max(1000),
          weight: z.number().positive().max(10).default(1),
          alternatives: z.string().max(1000).default(''),
        }),
      )
      .max(20),
  })
  .superRefine((q, ctx) => {
    if (new Set(q.points.map((p) => p.id)).size !== q.points.length)
      ctx.addIssue({ code: 'custom', message: 'Point IDs must be unique.' });
    if (q.type === 'cross' && !q.parent_id)
      ctx.addIssue({ code: 'custom', message: 'Select the parent major question.' });
    if (q.type !== 'cross' && q.parent_id)
      ctx.addIssue({ code: 'custom', message: 'Only cross-questions have a parent.' });
    if (q.type !== 'major' && q.introduction)
      ctx.addIssue({ code: 'custom', message: 'Introduction must be a major question.' });
  });
export const emptyBank = () => ({
  revision: 0,
  enabled: false,
  grammar_allowance: 20,
  questions: [],
});
export function bankReadiness(bank) {
  const active = bank.questions.filter((q) => q.active);
  const majors = active.filter((q) => q.type === 'major');
  const complete = majors.filter(
    (q) =>
      q.points.length &&
      active.filter((c) => c.type === 'cross' && c.parent_id === q.id).length === 5 &&
      active
        .filter((c) => c.type === 'cross' && c.parent_id === q.id)
        .every((c) => c.points.length),
  );
  const intros = majors.filter((q) => q.introduction);
  const extras = active.filter((q) => q.type === 'extra' && q.points.length);
  const issues = [];
  if (intros.length !== 1 || !complete.some((q) => q.id === intros[0]?.id))
    issues.push(
      'Choose exactly one active Introduction, with its standard and five standardised cross-questions.',
    );
  if (complete.length < 7)
    issues.push(`Need seven complete major groups; ${complete.length} ready.`);
  if (extras.length < 3)
    issues.push(`Need three extra questions with standards; ${extras.length} ready.`);
  return {
    ready: issues.length === 0,
    issues,
    major_groups: complete.length,
    extra_questions: extras.length,
  };
}
export function createBankStore(repo) {
  let queue = Promise.resolve();
  const read = async () => {
    const row = await repo.get('resources', BANK_ID);
    return row ? JSON.parse(row.body) : emptyBank();
  };
  return {
    read,
    update(revision, change) {
      const result = queue.then(async () => {
        const bank = await read();
        if (bank.revision !== revision)
          throw Object.assign(new Error('Question bank changed. Reload before saving.'), {
            status: 409,
          });
        await change(bank);
        if (bank.enabled && !bankReadiness(bank).ready)
          throw Object.assign(
            new Error(
              'Complete the required standards and question groups before enabling this format. Disable it before removing required questions.',
            ),
            { status: 409 },
          );
        bank.revision++;
        bank.updated_at = new Date().toISOString();
        await repo.put('resources', {
          id: BANK_ID,
          kind: 'research',
          title: 'Internal interview standards',
          body: JSON.stringify(bank),
          position: 9999,
          active: false,
          updated_at: bank.updated_at,
        });
        return bank;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}
export function shuffle(items, pick = randomInt) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function selectStandardInterview(bank, pick = randomInt, previousIds = []) {
  if (!bankReadiness(bank).ready)
    throw Object.assign(
      new Error(
        'The 19-question bank is not ready. Ask your counsellor to complete the standards.',
      ),
      { status: 409 },
    );
  const all = bank.questions.filter((q) => q.active);
  const majors = all.filter(
    (q) =>
      q.type === 'major' &&
      q.points.length &&
      all.filter((c) => c.type === 'cross' && c.parent_id === q.id).length === 5 &&
      all.filter((c) => c.type === 'cross' && c.parent_id === q.id).every((c) => c.points.length),
  );
  const intro = majors.find((q) => q.introduction);
  const selected = [
    intro,
    ...shuffle(
      majors.filter((q) => q !== intro),
      pick,
    ).slice(0, 6),
  ];
  const extraPool = all.filter((q) => q.type === 'extra' && q.points.length);
  // Seven majors leave twelve slots. Only replace crosses with distinct authored extras.
  const minimumCrosses = Math.max(0, 12 - extraPool.length);
  const crossTotal = minimumCrosses + pick(10 - minimumCrosses);
  const counts = new Map(selected.map((q) => [q.id, 0]));
  for (let i = 0; i < crossTotal; i++) {
    const available = selected.filter((q) => counts.get(q.id) < 3);
    const target = available[pick(available.length)];
    counts.set(target.id, counts.get(target.id) + 1);
  }
  const extras = shuffle(extraPool, pick).slice(0, 12 - crossTotal);
  const blocks = [intro, ...shuffle([...selected.slice(1), ...extras], pick)];
  const questions = [];
  const snapshot = (q) => ({
    id: q.id,
    text: q.text,
    category: q.category,
    weight: q.weight,
    is_main_question: q.type !== 'cross',
    question_type: q.type,
    parent_question_id: q.parent_id,
    introduction: q.introduction,
    standard: { version: q.version, points: structuredClone(q.points) },
    expected_concepts: q.points.map((p) => p.text).join('; '),
    verified_context: '',
    source_url: '',
    time_limit_seconds: q.type === 'cross' ? 60 : 900,
    minimum_seconds: q.type === 'major' ? 120 : 0,
  });
  for (const q of blocks) {
    questions.push(snapshot(q));
    if (q.type === 'major')
      questions.push(
        ...shuffle(
          all.filter((c) => c.type === 'cross' && c.parent_id === q.id),
          pick,
        )
          .slice(0, counts.get(q.id))
          .map(snapshot),
      );
  }
  if (questions.map((q) => q.id).join(',') === previousIds.join(',')) {
    const starts = questions.flatMap((q, i) => (q.question_type !== 'cross' ? [i] : []));
    const a = starts.at(-2),
      b = starts.at(-1);
    return [...questions.slice(0, a), ...questions.slice(b), ...questions.slice(a, b)];
  }
  return questions;
}
export function saveBankQuestion(bank, raw) {
  const q = bankQuestionSchema.parse(raw);
  if (q.type === 'cross' && !bank.questions.some((p) => p.id === q.parent_id && p.type === 'major'))
    throw Object.assign(new Error('Parent major question not found.'), { status: 400 });
  const old = bank.questions.find((x) => x.id === q.id);
  if (old && old.type !== q.type && bank.questions.some((c) => c.parent_id === old.id))
    throw Object.assign(
      new Error('Remove linked cross-questions before changing the parent type.'),
      { status: 409 },
    );
  if (
    q.active &&
    q.type === 'cross' &&
    bank.questions.filter(
      (c) => c.active && c.type === 'cross' && c.parent_id === q.parent_id && c.id !== q.id,
    ).length >= 5
  )
    throw Object.assign(new Error('A major question can have only five active cross-questions.'), {
      status: 409,
    });
  const saved = { ...q, id: q.id || randomUUID(), version: (old?.version || 0) + 1 };
  bank.questions = bank.questions.filter((x) => x.id !== saved.id).concat(saved);
}
