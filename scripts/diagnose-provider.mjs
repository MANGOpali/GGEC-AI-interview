import { createLlm } from '../apps/server/src/llm.js';
import { scoreAnswer } from '../apps/server/src/scoring.js';
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const start = Date.now();
  try {
    const r = await original(url, options);
    const p = await r
      .clone()
      .json()
      .catch(() => ({}));
    const choice = p.choices?.[0];
    console.log(
      JSON.stringify({
        http: r.status,
        elapsed_ms: Date.now() - start,
        content_type: r.headers.get('content-type'),
        has_choices: Array.isArray(p.choices),
        finish_reason: choice?.finish_reason,
        content_chars: choice?.message?.content?.length,
        completion_tokens: p.usage?.completion_tokens,
        reasoning_tokens: p.usage?.completion_tokens_details?.reasoning_tokens,
        error_present: !!p.error,
        error_mentions_schema: /schema|response_format/i.test(p.error?.message || ''),
        error_mentions_model: /model/i.test(p.error?.message || ''),
        error_mentions_credit: /quota|credit|balance/i.test(p.error?.message || ''),
      }),
    );
    return r;
  } catch (e) {
    console.log(
      JSON.stringify({
        transport_error: e.name,
        code: e.cause?.code,
        elapsed_ms: Date.now() - start,
      }),
    );
    throw e;
  }
};
try {
  const llm = createLlm(process.env);
  const e = await llm.evaluateAnswer({
    profile: {
      course: 'MSc Business',
      previous_qualification: 'BBA',
      career_plans: 'Business analyst',
    },
    question: {
      text: 'How will this course support your career?',
      category: 'Career plans',
      expected_concepts: 'Specific skills and a realistic role',
      verified_context: '',
      source_url: '',
    },
    answer:
      'My BBA introduced business statistics. I want to develop analytical skills and use them to evaluate business performance as a business analyst.',
    prior_qa: [],
    is_followup: false,
  });
  console.log(JSON.stringify({ validated: true, score: scoreAnswer(e) }));
} catch (e) {
  console.log(
    JSON.stringify({
      validated: false,
      error_type: e.name,
      provider_status: e.providerStatus,
      issues: e.issues?.map((i) => ({ path: i.path, code: i.code })),
    }),
  );
  process.exitCode = 1;
}
