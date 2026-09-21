// Offline UI verification only. No .env loading, live accounts, or real model requests.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { createApp } from '../apps/server/src/app.js';
import { createEvaluator } from '../apps/server/src/evaluator.js';
import { localRepository, demoUsers } from '../apps/server/src/repository.js';
import { createVault } from '../apps/server/src/crypto.js';
import { createSession, applyAnswer, seedQuestions, metrics } from '../apps/server/src/domain.js';
const dir = await mkdtemp(join(tmpdir(), 'ggec-ui-fixture-'));
const repo = await localRepository(
  join(dir, 'data.json'),
  createVault(randomBytes(32).toString('base64')),
);
const profile = {
  name: 'Fictional UI Test',
  course: 'MSc Business',
  university: 'Example University',
  nationality: 'Nepali',
  previous_qualification: 'BBA',
  course_duration: '1 year',
  tuition_fee: 10000,
  scholarship: 0,
  funding_details: 'Fictional sponsor',
  accommodation: 'University housing',
  career_plans: 'Business analyst',
};
await repo.saveProfile(demoUsers[0].id, profile);
let s = createSession(demoUsers[0].id, profile, seedQuestions.slice(0, 3));
for (let i = 0; i < 3; i++)
  s = applyAnswer(
    s,
    { transcript: 'Fictional response for offline UI testing', request_id: crypto.randomUUID() },
    null,
  );
await repo.saveSession(s, -1);
let calls = 0;
const llm = {
  name: 'offline-fixture',
  async evaluateAnswer() {
    await new Promise((r) => setTimeout(r, 7000));
    if (++calls === 2)
      throw Object.assign(new Error('Offline quota fixture'), { providerStatus: 429 });
    return {
      ...Object.fromEntries(metrics.map((k) => [k, 8])),
      flags: [],
      follow_up_needed: false,
      follow_up_question: null,
      reasoning: 'Private fixture note',
      feedback: 'Offline fixture feedback',
      missing_information: [],
      contradictions: [],
    };
  },
  generateFollowUp() {
    return null;
  },
};
const evaluator = createEvaluator({ repo, llm, minIntervalMs: 1000 });
const app = createApp({
  repo,
  llm,
  evaluator,
  authenticate: async (req) => demoUsers.find((u) => u.id === req.get('X-Demo-User')),
  origin: 'http://127.0.0.1:5174',
});
const server = app.listen(3002, '127.0.0.1');
const vite = await createServer({
  root: resolve('apps/web'),
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_API_URL': '"http://127.0.0.1:3002"',
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
await vite.listen();
console.log('Offline fixture app: http://127.0.0.1:5174 — fictional scores only');
process.on('SIGINT', async () => {
  await vite.close();
  server.close();
  process.exit(0);
});
