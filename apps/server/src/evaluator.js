import { buildReport, fullyEvaluated, mergeReport } from './domain.js';
import { scoreAnswer } from './scoring.js';
import { evaluationFailure } from './provider-errors.js';

const pending = (s) => !s.retained_at && s.state !== 'EXPIRED';
export function evaluationStatus(s, enabled) {
  const evaluated = s.answers.filter((a) => scoreAnswer(a.evaluation) !== null).length;
  const job = s.evaluation_job;
  const state = !pending(s)
    ? 'unavailable'
    : !enabled && ['queued', 'running'].includes(job?.state)
      ? 'paused'
      : job?.state || (s.report?.overall_score != null ? 'complete' : 'idle');
  return {
    state,
    evaluated,
    total: s.answers.length,
    enabled,
    message: job?.message || '',
    retry_after: job?.retry_after || null,
    can_retry:
      !!enabled &&
      pending(s) &&
      s.state === 'REPORT' &&
      !['queued', 'running'].includes(state) &&
      s.report?.overall_score == null &&
      s.answers.some((a) => a.transcript != null && scoreAnswer(a.evaluation) === null) &&
      !(job?.retry_after && Date.parse(job.retry_after) > Date.now()),
  };
}

// One server replica owns this queue. Job intent and each successful answer live in the
// existing transactional session JSON, so both repositories support restart recovery.
export function createEvaluator({
  repo,
  llm,
  minIntervalMs = 3000,
  retryWaitMs = 30000,
  maxAttempts = 1,
  concurrency = 1,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3)
    throw new Error('Evaluation concurrency must be between 1 and 3.');
  const enabled = !!llm && llm.name !== 'disabled';
  const rerun = new Set();
  const active = new Set(),
    queue = [];
  let running = false,
    lastCall = 0;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let pacing = Promise.resolve();
  const pace = () => {
    pacing = pacing.then(async () => {
      await sleep(Math.max(0, minIntervalMs - (Date.now() - lastCall)));
      lastCall = Date.now();
    });
    return pacing;
  };
  // Retry only optimistic conflicts, merging into the latest row (including retention/holds).
  const writeUpdate = async (id, change) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const s = await repo.session(id);
      if (!s || !pending(s)) return null;
      if (change(s) === false) return s;
      try {
        return await repo.saveSession(s, s.version);
      } catch (error) {
        if (error.status !== 409 || attempt === 2) throw error;
      }
    }
  };
  // Serialize local writes; model calls overlap, session read/merge/save operations do not.
  let saving = Promise.resolve();
  const update = (id, change) => {
    const result = saving.then(() => writeUpdate(id, change));
    saving = result.catch(() => {});
    return result;
  };
  const mark = (id, fields) =>
    update(id, (s) => {
      s.evaluation_job = { ...s.evaluation_job, ...fields, updated_at: new Date().toISOString() };
    });
  const processOne = async (id) => {
    await mark(id, { state: 'running', message: '', retry_after: null });
    let errorMessage = '',
      cooldown = null;
    for (let pass = 0; pass < maxAttempts; pass++) {
      const snapshot = await repo.session(id);
      if (!snapshot || !pending(snapshot)) return;
      const items = snapshot.answers.values();
      let stopped = false;
      const worker = async () => {
        for (const item of items) {
          if (stopped) return;
          if (scoreAnswer(item.evaluation) !== null || item.transcript == null) continue;
          await pace();
          if (stopped) return;
          const s = await repo.session(id);
          if (stopped) return;
          if (!s || !pending(s)) return;
          const index = s.answers.findIndex((a) => a.id === item.id),
            a = s.answers[index];
          if (!a || a.transcript == null || scoreAnswer(a.evaluation) !== null) continue;
          let evaluation;
          try {
            evaluation = await llm.evaluateAnswer({
              rubric_version: s.rubric_version,
              grammar_allowance: s.grammar_allowance,
              is_background: true,
              profile: s.profile_snapshot,
              question: {
                ...s.questions?.find((q) => q.id === a.question_id),
                text: a.question_text,
                category: a.category,
                weight: a.weight,
                is_main_question: !a.is_followup,
              },
              answer: a.transcript,
              is_followup: !!a.is_followup,
              prior_qa: s.answers
                .slice(0, index)
                .map((x) => ({ question: x.question_text, answer: x.transcript })),
            });
            if (scoreAnswer(evaluation) === null) throw new Error('Invalid evaluation');
            evaluation.follow_up_question = llm.generateFollowUp?.(evaluation) ?? null;
          } catch (error) {
            stopped = true;
            errorMessage ||= evaluationFailure(error);
            cooldown = new Date(Date.now() + 60000).toISOString();
            break; // Stop the batch on provider failure; never hammer the remaining answers.
          }
          await update(id, (latest) => {
            const target = latest.answers.find((x) => x.id === a.id);
            if (
              !target ||
              target.transcript !== a.transcript ||
              scoreAnswer(target.evaluation) !== null
            )
              return false;
            target.evaluation = evaluation;
            target.answer_score = scoreAnswer(evaluation);
            if (latest.state === 'REPORT') latest.report = buildReport(latest);
            latest.evaluation_job.updated_at = new Date().toISOString();
          });
        }
      };
      const workers = await Promise.allSettled(
        Array.from({ length: concurrency }, async () => {
          try {
            await worker();
          } catch (error) {
            stopped = true;
            throw error;
          }
        }),
      );
      // Drain all in-flight work before finalizing or moving to another interview.
      const failed = workers.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (!errorMessage || pass + 1 === maxAttempts) break;
      await sleep(retryWaitMs);
      errorMessage = '';
      cooldown = null;
    }
    const s = await repo.session(id);
    if (!s || !pending(s)) return;
    let narrative = null;
    if (s.state === 'REPORT' && fullyEvaluated(s)) {
      try {
        await pace();
        narrative = await llm.generateFinalReport?.(s);
      } catch {
        /* Deterministic report remains valid without provider narrative. */
      }
    }
    await update(id, (latest) => {
      if (latest.state === 'REPORT')
        latest.report = narrative ? mergeReport(latest, narrative) : buildReport(latest);
      const complete =
        latest.state === 'REPORT' ? latest.report?.overall_score != null : fullyEvaluated(latest);
      latest.evaluation_job = {
        ...latest.evaluation_job,
        state: complete ? 'complete' : 'failed',
        message: complete
          ? ''
          : errorMessage || 'Some answers are missing or unavailable. Please review this attempt.',
        retry_after: complete ? null : cooldown,
        updated_at: new Date().toISOString(),
      };
    });
  };
  const run = async () => {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const id = queue.shift();
        try {
          await processOne(id);
        } catch {
          try {
            await mark(id, {
              state: 'failed',
              message: 'Evaluation was interrupted. Saved scores are safe. Please retry.',
            });
          } catch {
            console.error('Could not save evaluation job status; restart recovery will retry it.');
          }
        } finally {
          active.delete(id);
          if (rerun.delete(id)) await enqueue(id, { respectCooldown: true });
        }
      }
    } finally {
      running = false;
    }
  };
  const enqueue = async (session, { respectCooldown = false } = {}) => {
    if (!enabled) return 0;
    const id = typeof session === 'string' ? session : session?.id;
    if (!id) return queue.length;
    if (active.has(id)) {
      rerun.add(id);
      return queue.length;
    }
    active.add(id);
    try {
      const current = await repo.session(id);
      if (!current || !pending(current) || (respectCooldown && current.evaluation_job?.retry_after && Date.parse(current.evaluation_job.retry_after) > Date.now())) {
        active.delete(id); return queue.length;
      }
      const saved = await mark(id, {
        state: 'queued',
        provider: llm.name,
        message: '',
        retry_after: null,
      });
      if (!saved) {
        active.delete(id);
        return 0;
      }
      queue.push(id);
      void run();
      return queue.length;
    } catch (error) {
      active.delete(id);
      throw error;
    }
  };
  const recover = async () => {
    if (!enabled) return 0;
    let count = 0;
    for (const row of await repo.sessions()) {
      if (pending(row) && ['queued', 'running'].includes(row.evaluation_job?.state)) {
        if (row.evaluation_job.provider !== llm.name) {
          await mark(row.id, {
            state: 'failed',
            message: 'The AI provider changed. Review the provider before retrying.',
          });
          continue;
        }
        await enqueue(row.id);
        count++;
      }
    }
    return count;
  };
  const seed = async () => {
    if (!enabled) return 0;
    let count = 0;
    for (const row of await repo.sessions()) {
      const s = await repo.session(row.id);
      if (pending(s) && !fullyEvaluated(s)) {
        await enqueue(s);
        count++;
      }
    }
    return count;
  };
  return {
    enabled,
    enqueue,
    recover,
    seed,
    isActive: (id) => (id ? active.has(id) : running),
    async idle() {
      while (active.size || running) await sleep(5);
    },
  };
}
