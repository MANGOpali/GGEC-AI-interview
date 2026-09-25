// Vercel Function entrypoint. Unlike src/index.js (used by Render/local `npm start`, which
// binds a persistent server with app.listen()), Vercel Functions are request-scoped: the
// module runs to completion and the default export is invoked per request, so we build the
// Express app and export it directly, with no app.listen() call.
import { createApp } from '../src/app.js';
import { configure } from '../src/config.js';
import { createLlm } from '../src/llm.js';
import { createTranscriber } from '../src/transcription.js';
import { createEvaluator } from '../src/evaluator.js';

const config = await configure();
const llm = createLlm(process.env);
const evaluator = createEvaluator({
  repo: config.repo,
  llm,
  minIntervalMs: llm.name === 'groq' ? 25000 : 3000,
  maxAttempts: 1,
  concurrency: llm.name === 'openai' ? 3 : 1,
});
await evaluator.recover();

const app = createApp({
  ...config,
  llm,
  origin: process.env.WEB_ORIGIN,
  trustProxy: Number(process.env.TRUST_PROXY_HOPS || 0),
  // The "web" service serves the built frontend directly; this function only ever answers /api.
  serveDir: null,
  supabaseConnectSrc: process.env.SUPABASE_URL,
  evaluator,
  deferScoring: false,
  transcriber: createTranscriber(process.env),
});

// This project is API-only (no serveDir); send anyone landing on the bare root to the
// actual student-facing app instead of Express's default 404.
app.get('/', (_req, res) => res.redirect(process.env.WEB_APP_URL || 'https://ggec-ai-interview-web.vercel.app/'));

export default app;
