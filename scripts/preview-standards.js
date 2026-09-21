// Isolated offline UI fixture. No environment file or external model calls.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { localRepository, demoUsers } from '../apps/server/src/repository.js';
import { createVault } from '../apps/server/src/crypto.js';
import { createApp } from '../apps/server/src/app.js';
import { createEvaluator } from '../apps/server/src/evaluator.js';
import {
  createBankStore,
  saveBankQuestion,
  selectStandardInterview,
  standardVersion,
} from '../apps/server/src/standards-bank.js';
import { validatedStandardEvaluation, sentences } from '../apps/server/src/standards-evaluation.js';
import { createSession, applyAnswer } from '../apps/server/src/domain.js';
const dir = await mkdtemp(join(tmpdir(), 'ggec-standards-fixture-'));
const repo = await localRepository(
  join(dir, 'data.json'),
  createVault(randomBytes(32).toString('base64')),
);
const bank = await createBankStore(repo).update(0, (b) => {
  for (let i = 0; i < 7; i++) {
    const id = randomUUID();
    saveBankQuestion(b, {
      id,
      type: 'major',
      introduction: i === 0,
      text:
        i === 0
          ? 'Please introduce yourself and your study plans.'
          : `Fictional major topic ${i}: explain your study choice.`,
      category: i === 0 ? 'Introduction' : `Topic ${i}`,
      points: [
        { id: 'p1', text: 'Fictional required point: describe your goal', weight: 1 },
        { id: 'p2', text: 'Fictional required point: explain the connection', weight: 1 },
      ],
    });
    for (let j = 0; j < 5; j++)
      saveBankQuestion(b, {
        type: 'cross',
        parent_id: id,
        text: `Fictional cross ${i}-${j}: give one example.`,
        category: `Topic ${i}`,
        points: [{ id: 'p', text: 'Fictional required point: give a relevant example', weight: 1 }],
      });
  }
  for (let i = 0; i < 3; i++)
    saveBankQuestion(b, {
      type: 'extra',
      text: `Fictional extra ${i}: explain your research.`,
      category: 'Extra',
      points: [{ id: 'p', text: 'Fictional required point: describe your research', weight: 1 }],
    });
  b.enabled = true;
});
const profile = {
  name: 'Fictional Standards Student',
  nationality: 'Nepali',
  previous_qualification: 'BBA',
  university: 'Example University',
  course: 'MSc Business',
  course_duration: '1 year',
  tuition_fee: 10000,
  scholarship: 0,
  study_gap: '',
  work_experience: '',
  funding_details: 'Fictional sponsor',
  accommodation: 'University housing',
  career_plans: 'Business analyst',
  leaderboard_opt_in: false,
  leaderboard_alias: '',
};
await repo.saveProfile(demoUsers[0].id, profile);
const evaluate = (context) =>
  validatedStandardEvaluation(
    {
      point_results: context.question.standard.points.map((p, i) => ({
        point_id: p.id,
        credit: i === 0 ? 1 : 0.5,
        evidence: 'Synthetic fixture evidence',
      })),
      fluency_clarity: 8,
      overall_correctness: 8,
      grammar_error_sentence_ids: [],
      feedback: 'Add one specific example.',
      reasoning: 'Synthetic fixture only.',
      missing_information: ['A specific example'],
      contradictions: [],
    },
    { ...context, sentences: sentences(context.answer) },
  );
const llm = { name: 'openai', evaluateAnswer: async (context) => evaluate(context) };
const evaluator = createEvaluator({ repo, llm, minIntervalMs: 0, concurrency: 3 });
const done = createSession(demoUsers[0].id, profile, selectStandardInterview(bank));
done.rubric_version = standardVersion;
done.grammar_allowance = 20;
for (const q of done.questions)
  applyAnswer(
    done,
    {
      request_id: randomUUID(),
      transcript: 'My fictional study goal is business analysis.',
      spoken_seconds: q.question_type === 'cross' ? 40 : 110,
    },
    evaluate({
      question: q,
      answer: 'My fictional study goal is business analysis.',
      grammar_allowance: 20,
    }),
  );
await repo.saveSession(done, -1);
const app = createApp({
  repo,
  llm,
  evaluator,
  deferScoring: true,
  authenticate: async (req) => repo.get('users', req.get('X-Demo-User')),
  origin: 'http://127.0.0.1:5175',
});
const server = app.listen(3003, '127.0.0.1');
const vite = await createServer({
  root: resolve('apps/web'),
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_API_URL': '"http://127.0.0.1:3003"',
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
await vite.listen();
console.log('Fictional offline standards preview: http://127.0.0.1:5175');
process.on('SIGINT', async () => {
  await vite.close();
  server.close();
  process.exit();
});
