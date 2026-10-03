import { createApp } from './app.js';
import { configure } from './config.js';
import { createLlm } from './llm.js';
import { createTranscriber } from './transcription.js';
import { createEvaluator } from './evaluator.js';
import { fileURLToPath } from 'node:url';
const config = await configure();
const serveDir =
  process.env.NODE_ENV === 'production'
    ? fileURLToPath(new URL('../../web/dist', import.meta.url))
    : null;
const llm = createLlm(process.env);
const evaluator = createEvaluator({
  repo: config.repo,
  llm,
  // 1200ms for openai (was 3000) -- still safely spaced against rate limits, just faster than
  // the original conservative default. Groq's free tier genuinely needs the long gap.
  minIntervalMs: llm.name === 'groq' ? 25000 : 1200,
  maxAttempts: 1,
  concurrency: llm.name === 'openai' ? 3 : 1,
});
await evaluator.recover();
config.repo.kind === 'demo' &&
  process.env.AUTO_EVALUATE_EXISTING !== 'false' &&
  (await evaluator.seed());
const app = createApp({
  ...config,
  llm,
  origin: process.env.WEB_ORIGIN,
  trustProxy: Number(process.env.TRUST_PROXY_HOPS || 0),
  serveDir,
  supabaseConnectSrc: process.env.SUPABASE_URL,
  evaluator,
  // Every session created today uses the standards rubric, where cross-questions are already
  // pre-planned in the question list rather than decided live by the model (see
  // applyAnswer/domain.js) -- synchronous per-answer evaluation no longer buys any real-time
  // branching for current interviews, it only makes the student wait. Save instantly and let
  // the background evaluator (above) score every answer, matching what the consent screen
  // already tells students happens.
  deferScoring: true,
  transcriber: createTranscriber(process.env),
});
const host = config.repo.kind === 'demo' ? '127.0.0.1' : process.env.HOST || '0.0.0.0';
app.listen(Number(process.env.PORT || 3001), host, () =>
  console.log(`GGEC API ready on ${host}:${process.env.PORT || 3001} (${config.repo.kind})`),
);
