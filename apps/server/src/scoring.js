// Versioned, deterministic practice rubric. Models assess meaning; this code owns arithmetic.
import { standardScore } from './standards-evaluation.js';
export const scoringVersion = 'ggec-rubric-v2';
export const rubricWeights = Object.freeze({
  relevance: 20,
  consistency_with_profile: 20,
  completeness: 15,
  clarity_communication: 10,
  course_knowledge: 10,
  university_research: 8,
  financial_knowledge: 8,
  career_credibility: 6,
  accuracy: 3,
});
const core = ['relevance', 'consistency_with_profile', 'completeness', 'clarity_communication'];
export function scoreAnswer(evaluation) {
  if (evaluation?.scoring_version === 'ggec-standards-v3') return standardScore(evaluation);
  if (!evaluation || core.some((k) => !Number.isFinite(evaluation[k]))) return null;
  let total = 0,
    weight = 0;
  for (const [metric, w] of Object.entries(rubricWeights)) {
    const value = evaluation[metric];
    if (value == null) continue;
    if (!Number.isFinite(value) || value < 0 || value > 10) return null;
    total += value * w;
    weight += w;
  }
  const raw = (total / weight) * 10;
  // Fluent but irrelevant answers cannot earn a high overall answer score.
  const cap =
    evaluation.relevance === 0
      ? 0
      : evaluation.relevance <= 2
        ? 29
        : evaluation.relevance <= 4
          ? 49
          : 100;
  return Math.round(Math.min(raw, cap) * 100) / 100;
}
export function answerContributions(answers) {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const groups = new Map();
  for (const a of answers) {
    const main = a.is_followup && byId.has(a.parent_answer_id) ? byId.get(a.parent_answer_id) : a;
    if (!groups.has(main)) groups.set(main, []);
    groups.get(main).push(a);
  }
  return [...groups].flatMap(([main, group]) =>
    group.map((a) => ({
      answer: a,
      score: scoreAnswer(a.evaluation),
      category: main.category,
      // Follow-ups share the main question's weight instead of doubling it.
      weight: (Number.isFinite(main.weight) && main.weight > 0 ? main.weight : 1) / group.length,
    })),
  );
}
