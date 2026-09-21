import { z } from 'zod';
import { scoreAnswer, rubricWeights, scoringVersion } from './scoring.js';
export const referenceSchema = z
  .object({
    university: z.string().trim().min(1).max(200),
    course: z.string().trim().min(1).max(200),
    intake: z.string().trim().min(1).max(80),
    checked_on: z.iso.date(),
    valid_until: z.iso.date(),
    modules: z.string().trim().max(1500),
    fees: z.string().trim().max(1000),
    facts: z.string().trim().min(1).max(2000),
  })
  .refine(
    (r) => r.checked_on <= new Date().toISOString().slice(0, 10) && r.valid_until >= r.checked_on,
    { message: 'Checked date must not be in the future; review date must follow checked date.' },
  );
// Versioned source pack inside the existing question context column; no DB migration.
export function unpackQuestion(q) {
  try {
    const r = JSON.parse(q.verified_context);
    if (r.kind === 'ggec-reference-v1')
      return { ...q, reference: r.reference, verified_context: r.reference.facts };
  } catch {}
  return { ...q, reference: null };
}
export function packQuestion(q, raw, reviewer) {
  if (!raw.reference) return q;
  const reference = referenceSchema.parse(raw.reference);
  if (!/^https:\/\//i.test(q.source_url))
    throw Object.assign(new Error('Verified references require an HTTPS source URL.'), {
      status: 400,
    });
  return {
    ...q,
    verified_context: JSON.stringify({
      kind: 'ggec-reference-v1',
      reference: { ...reference, checked_by: reviewer },
    }),
  };
}
const same = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();
export function snapshotQuestion(q, profile, today = new Date().toISOString().slice(0, 10)) {
  const parsed = unpackQuestion(q),
    r = parsed.reference;
  // Legacy undated/unscoped source text cannot establish factual accuracy for new sessions.
  const usable =
    r &&
    /^https:\/\//i.test(q.source_url) &&
    same(r.university, profile.university) &&
    same(r.course, profile.course) &&
    same(r.intake, profile.intake) &&
    r.checked_on <= today &&
    today <= r.valid_until;
  return {
    ...q,
    reference: r || null,
    reference_status: usable ? 'matched' : r ? 'unmatched_or_expired' : 'not_verified',
    verified_context: usable ? JSON.stringify(r) : '',
    source_url: usable ? q.source_url : '',
  };
}
export const humanSchema = z
  .object({
    metrics: z.object(
      Object.fromEntries(
        Object.keys(rubricWeights).map((k) => [k, z.number().min(0).max(10).nullable()]),
      ),
    ),
    sample_type: z.enum(['strong', 'weak', 'contradictory', 'other']),
  })
  .refine((r) => scoreAnswer(r.metrics) !== null, {
    message: 'Score relevance, consistency, completeness and clarity.',
  });
export function comparison(s, reviewer) {
  const rows = s.answers.flatMap((a) => {
    const human = a.human_reviews?.find((r) => r.reviewer_id === reviewer);
    if (!human) return [];
    const ai = scoreAnswer(a.evaluation),
      score = scoreAnswer(human.metrics);
    return [
      {
        answer_id: a.id,
        question: a.question_text,
        category: a.category,
        sample_type: human.sample_type,
        human: score,
        ai,
        difference: ai === null ? null : Math.round((ai - score) * 100) / 100,
        criteria: Object.fromEntries(
          Object.keys(rubricWeights).map((k) => [
            k,
            { human: human.metrics[k], ai: a.evaluation?.[k] ?? null },
          ]),
        ),
      },
    ];
  });
  const matched = rows.filter((r) => r.difference !== null);
  return {
    scoring_version: scoringVersion,
    rows,
    paired: matched.length,
    mean_absolute_difference: matched.length
      ? Math.round(
          (matched.reduce((sum, r) => sum + Math.abs(r.difference), 0) / matched.length) * 100,
        ) / 100
      : null,
    mean_ai_minus_human: matched.length
      ? Math.round((matched.reduce((sum, r) => sum + r.difference, 0) / matched.length) * 100) / 100
      : null,
  };
}
export const coaching = {
  'UK choice':
    'I compared [UK course] with [alternative]. The difference that matters to my goals is [specific feature], because [personal reason].',
  'University research':
    'I chose [university] because [verified course feature]. Compared with [alternative], it offers [relevant difference] for my goal of [goal].',
  'Course knowledge':
    '[Verified module] covers [topic]. I want to develop [skill] and apply it to [specific career task].',
  'Academic background':
    'My previous study in [subject] developed [skill]. This course builds on it through [module] and helps me address [gap].',
  'Career plans':
    'After graduation I plan to [role/location]. I will use [course skill] for [task], and my first practical step is [action].',
  Finance:
    'My tuition is [verified amount] and scholarship is [confirmed amount]. [Sponsor] will cover the remainder and my [itemised living budget] using [documented funds].',
  Accommodation:
    'I researched [housing option]. The rent is [verified amount], the journey is [route/time], and my budget includes [other costs].',
};
