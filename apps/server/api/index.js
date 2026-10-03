// Vercel Function entrypoint. Unlike src/index.js (used by Render/local `npm start`, which
// binds a persistent server with app.listen()), Vercel Functions are request-scoped: the
// module runs to completion and the default export is invoked per request, so we build the
// Express app and export it directly, with no app.listen() call.
import { waitUntil } from '@vercel/functions';
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
  // 1200ms for openai (was 3000) -- still safely spaced against rate limits, just faster than
  // the original conservative default. Groq's free tier genuinely needs the long gap.
  minIntervalMs: llm.name === 'groq' ? 25000 : 1200,
  maxAttempts: 1,
  concurrency: llm.name === 'openai' ? 3 : 1,
  // Without this, the background evaluation queue is a bare fire-and-forget promise: Vercel's
  // request-scoped Functions can freeze it mid-flight the instant the triggering request's
  // response is sent, before it ever reaches the provider. waitUntil tells the platform to keep
  // this invocation alive until the queued scoring actually finishes.
  onBackgroundWork: waitUntil,
});
// Not awaited: this scans the entire interview_sessions table to re-queue anything left
// "queued"/"running" by a previous instance, which on Vercel's request-scoped cold starts
// otherwise blocks the very first request (even /api/health) until the scan finishes -- and
// that scan only gets slower as more sessions accumulate. It's a best-effort cleanup for a rare
// case (a prior instance dying mid-evaluation), not something any request needs to wait on.
evaluator.recover().catch((error) => console.error('Evaluator recovery failed:', error));

const app = createApp({
  ...config,
  llm,
  origin: process.env.WEB_ORIGIN,
  trustProxy: Number(process.env.TRUST_PROXY_HOPS || 0),
  // The "web" service serves the built frontend directly; this function only ever answers /api.
  serveDir: null,
  supabaseConnectSrc: process.env.SUPABASE_URL,
  evaluator,
  // See src/index.js for why this is now deferred: every current session uses the standards
  // rubric, where cross-questions are pre-planned rather than decided live by the model, so
  // synchronous per-answer evaluation no longer buys real-time branching -- only latency.
  deferScoring: true,
  transcriber: createTranscriber(process.env),
});

// This project is API-only (no serveDir); send anyone landing on the bare root to the
// actual student-facing app instead of Express's default 404.
app.get('/', (_req, res) => res.redirect(process.env.WEB_APP_URL || 'https://ggec-ai-interview-web.vercel.app/'));

export default app;
