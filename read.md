# GGEC — current handover and change log

Read this file first when continuing development. `README.md` covers setup; this file records the current implementation and evidence. `AGENTS.md` instructs future agents to update this file after changes. Documentation updates are a working rule, not an automatic background service.

## Current state — 2026-09-17

- React/Vite/Tailwind frontend; Express API; local encrypted demo repository or Supabase repository. Local browser: http://127.0.0.1:5173; API: http://127.0.0.1:3001.
- Active configured provider: OpenAI-compatible, model `gpt-5.5` (`LLM_PROVIDER=openai`; endpoint defaults to `https://api.openai.com/v1`, override with `OPENAI_BASE_URL`). Groq (`openai/gpt-oss-120b`) and Gemini remain available adapters. Credentials exist only in the ignored server `.env`. Never read them into logs or include them in source archives. The Groq and OpenAI keys were both shared in chat and should be rotated by their owner; do not reproduce them.
- Groq performs semantic evaluation and generates a maximum of one follow-up per main question. It makes no Gemini/embedding calls and calculates final reports locally. Gemini remains an optional adapter with separate configuration and narrative synthesis.
- `AUTO_EVALUATE_EXISTING=false` avoids startup backfilling of historical demo attempts. Explicit jobs persist in session JSON and resume after a restart with the same provider. Each successful score is committed separately. Run one backend replica: distributed worker leases are not implemented.
- UI branding uses the GGEC square logo (`apps/web/public/logo.jpg`, also favicon) with a navy `#002060` / crimson `#D01020` theme derived from the logo.
- Student/Counsellor/Admin roles, profiles, question bank, consent, speech adapters, interview resume, encrypted snapshots, transcript storage, reports, leaderboard opt-in, audit and retention are implemented. See README for security/deployment details.
- Students register with name, phone (required, no SMS) and email + password. The student sidebar is Profile, Start Interview, Templates and Research Methods; Templates/Research are admin-editable resources. Requires migration `002_phone_resources.sql`.
- Each interview question is timed like a real interview: main questions default to 2:00 and follow-ups to 1:00, recording auto-stops at zero, and students still submit manually. The timer is informational and never changes a score. Requires migration `003_question_timers.sql`.
- The question bank ships with 149 questions from the Pre-CAS set in `apps/server/src/questionBank.js`: 10 main (asked in every interview) and 139 reference-only (staff-visible, never asked). Live Supabase and the local demo both hold the same set.

## Scoring contract: `ggec-rubric-v2`

AI assigns each applicable criterion 0–10 based on answer meaning, the profile, expected concepts and previous answers. Code calculates the final score. Keyword matching, answer duration and transcript length do not award points.

| Criterion | Weight |
| --- | ---: |
| Relevance | 20 |
| Consistency with profile | 20 |
| Completeness | 15 |
| Clarity/communication | 10 |
| Course knowledge | 10 |
| University research | 8 |
| Financial knowledge | 8 |
| Career credibility | 6 |
| Verified accuracy | 3 |

**Answer score:** `10 × sum(criterion score × weight) / sum(applicable weights)`, rounded to two decimal places. Null optional metrics do not count as zero. Relevance, consistency, completeness and clarity must be numeric; otherwise the answer is not fully evaluated. Invalid/out-of-range/non-finite metrics do not produce a score.

**Relevance caps:** relevance 0 gives answer score 0; relevance 1–2 caps at 29; relevance above 2 through 4 caps at 49. This stops polished but irrelevant responses receiving high scores. Flags have no extra arithmetic penalty, avoiding double penalties. These practice-policy defaults require human calibration before operational use.

**Question weighting:** main and follow-up share the main question's weight equally. A question with weight 2 and one follow-up contributes weight 1 per answer, rather than weight 4 in total. Category and overall scores use these contributions; final totals are rounded to integers. Per-answer scores and effective weights are recorded in the report.

**Coverage:** every submitted answer must have a score, and every main question snapshot must have a main answer. Missing evaluation means a null overall score, never a fabricated zero. A genuinely irrelevant answer may score zero and still count as evaluated. Readiness is Ready at 75+, Needs Practice at 50–74, Not Ready below 50. These are practice labels, not admission/visa predictions.

**Evidence:** accuracy is forced to null without both staff-supplied verified context and source URL. Sources are not automatically checked. Finance criteria should be null on unrelated course-choice questions. Formulaic wording is only an uncertain indicator; no claims about confidence or memorization are inferred from text.

**Reports:** `mergeReport()` prevents a narrative model from changing computed numbers, completeness or readiness. Historical saved reports are not silently recalculated; v2 applies when a report is newly generated/recomputed. Compare reports by scoring version; pre-v2 attempts may be unversioned.

## Code map

| Path | Responsibility |
| --- | --- |
| `apps/server/src/scoring.js` | Versioned weights, answer scoring, relevance caps, follow-up weight sharing |
| `apps/server/src/domain.js` | Schemas, question snapshots, progression, report aggregation and merge rules |
| `apps/server/src/llm.js` | Groq/OpenAI/Gemini/disabled providers, shared chat-completions adapter, prompts, structured output validation |
| `apps/server/src/app.js` | Authorized API routes, transcript commit, student note redaction, queue dispatch |
| `apps/server/src/evaluator.js` | Deferred evaluation; preserves question source evidence and skips retained sessions |
| `apps/server/src/repository.js` | Atomic local persistence / Supabase transactional RPC adapter |
| `apps/server/src/crypto.js` | AES-GCM encryption of profiles/snapshots |
| `apps/web/src/App.jsx` | Student/staff screens, previous-answer score, report and per-criterion display |
| `apps/web/src/services/recognition.js` | STT lifecycle, interim text, bounded reconnection and timeouts |
| `apps/web/src/services/speech.js` | Speech-service facade and TTS |
| `apps/web/src/services/machine.js` | Client recording/transcription/submission transitions |
| `supabase/migrations/001_initial.sql` | Tables, RLS, restricted grants, signup and save/retention functions |
| `supabase/migrations/002_phone_resources.sql` | `users.phone`, signup-trigger update, `resources` table and starter content |
| `supabase/migrations/003_question_timers.sql` | Nullable `questions.time_limit_seconds` (15–900s) for per-question answer timers |
| `apps/server/test/timing.test.js` | Offline coverage for per-question limits, elapsed time and over-time flagging |
| `apps/server/test/openai.test.js` | Offline coverage for the OpenAI-compatible adapter: endpoint, bearer auth, model, overrides and error handling |
| `apps/web/src/components/Profile.jsx` | Student account details, change password and saved attempts |
| `apps/web/src/components/ResourceList.jsx` | Student Templates / Research Methods pages (admin-authored content) |
| `apps/web/src/content/resourcePresets.js` | Built-in starter templates/research methods the admin can insert in the resource form |
| `apps/web/src/components/ResourceAdmin.jsx` | Admin CRUD for student resources, with a starter-template picker |
| `scripts/smoke-live.js` | Explicit live Groq API smoke test, fictional isolated repository, maximum four calls |

## Verification and commands

```sh
npm ci
npm run dev
npm test
npm run build
# Explicitly uses real API quota; not part of npm test:
npm run test:live
```

`npm test` uses offline fixtures and PGlite. Expected failure-path console messages may appear even when all tests pass. The live test uses fictional data in a temporary repository, exercises real Express routes through Supertest, saves/reloads scores, and writes a non-sensitive summary to `verification/live-evaluation.json`. It never edits the live demo question bank or student attempts.

Latest checks (2026-09-16): **42 offline tests passed**, and **`npm run build` succeeded**. The live Groq smoke test completed **four requests**, two one-main-question interviews with one follow-up each. The relevant answer sequence scored **68/100 (Needs Practice)**; the irrelevant sequence scored **0/100 (Not Ready)**. Individual relevant answers scored 79.55 and 56.97; the repeated answer did not fully resolve the follow-up. Scores persisted and matched after API reload. Student responses omitted private evaluator notes. Evidence: [verification/live-evaluation.json](verification/live-evaluation.json). The offline suite grew again after the phone/resources work (55), the security-review hardening (57), the starter presets (58) and the per-question timers (63); see the dated change-log entries. The 2026-09-17 timer addition last ran `npm test` → **63 offline tests pass** and a successful `npm run build` (513.54 kB raw / 148.92 kB gzip). Adding the OpenAI provider raised the offline suite to **67 passing** (`npm test`), with `npm run build` still succeeding.

The running API health check previously returned `{"ok":true,"mode":"demo","ai":"groq"}`; with `LLM_PROVIDER=openai` the same route now reports `"ai":"openai"` (not yet re-verified against a live process). No real student records were changed by the live test. A smoke test demonstrates connectivity and workflow, not a calibrated assessment benchmark. The full 11-question progression is covered offline; this quota-bounded live test uses a shorter interview.

## Important boundaries / next work

- Live Supabase is connected and the **full per-account Auth/PostgREST + UI isolation flow was verified end-to-end 2026-09-16** (real accounts, real browser): sign-in, role-scoped URL routes, and per-role page content all behave correctly. The counsellor was assigned the student. Only remote deployment remains outstanding.
- Operator steps still recommended:
  1. Auth → URL Configuration: Site URL `http://localhost:5173`; add redirect URL `http://localhost:5173` (load-bearing for link/PKCE flows and email-confirmation links; password sign-in already works without it).
  2. Rotate the Groq **and OpenAI** API keys (both were shared in chat transcripts; they currently exist only in the git-ignored `apps/server/.env`).
  3. Optional: delete the three browser-managed demo users if no longer wanted.
  4. Run `supabase/migrations/002_phone_resources.sql` in the Supabase SQL Editor to enable phone capture at signup, the account Profile page and the Resources pages.
- Browser STT depends on browser/vendor support, network and microphone permissions. A network error was previously observed in the embedded browser. On 2026-09-17 the user confirmed that spoken words appear and remain after Stop in the requested Chrome/Edge check; this is user verification, not a claim of support on every browser/device.
- Free API quotas remain finite. Preserve bounded retries; never silently fall back to a paid provider. Do not retry all historical attempts to test a code edit.
- Evaluation jobs and per-answer scores now persist; optimistic conflicts merge with up to three attempts. Multi-worker coordination remains a deployment prerequisite if scaling beyond one backend replica. A crash between a provider response and its database commit can repeat that one provider call.
- Interview questions expected from deferred work use saved source snapshots; do not remove those contexts.
- Student internal reasoning must remain private; all external services stay behind adapters.
- Page components were split out of `App.jsx` into `apps/web/src/components/` (2026-09-16); continue the split incrementally if needed, preserving behavior.
- Keep real `.env`, `data/`, keys, node_modules and build caches out of shared source ZIPs.

## Deployment security checklist

Code review (2026-09-17) found no exploitable code-level hole: `npm audit` reports 0 vulnerabilities, no key values exist in tracked source, every `/api` route is authenticated/role-checked, RLS is on with no browser grants, request bodies are Zod-validated, and there are no XSS/eval/SSRF sinks. The items below are operator/configuration gates, not code bugs.

**Must do before real student data:**
1. Rotate the Groq and OpenAI keys (both were shared in chat) and confirm no other key was exposed.
2. Run `002_phone_resources.sql` in the Supabase SQL Editor; confirm `001` is already live.
3. Production env: `NODE_ENV=production`, `APP_MODE=supabase`, `WEB_ORIGIN=https://<frontend>` (explicit origin only; `*` is rejected at startup), a valid `DATA_ENCRYPTION_KEY`, and `VITE_API_URL`/`VITE_SUPABASE_*` on the web host. Demo mode is refused under `NODE_ENV=production`.
4. Serve over HTTPS only (bearer tokens and browser microphone both require it).
5. Supabase Auth → URL Configuration: set the real Site URL and redirect URLs; configure email delivery.
6. Run exactly one backend replica (rate limiter and evaluation worker are per-process), or add a shared store/leases before scaling.
7. Set `TRUST_PROXY_HOPS` to the real trusted-proxy count so per-IP rate limits work.
8. Delete/rotate the test accounts and `apps/server/data/accounts.json` before onboarding users.
9. Back up `DATA_ENCRYPTION_KEY` and the Supabase keys; define rotation.

**Recommended hardening (not blocking):**
- Phone is plaintext PII in `public.users` (like name/email), readable by the assigned counsellor and admins by design; include it in the retention/deletion policy.
- Review Supabase password policy (min length, leaked-password protection) and project auth rate limits.
- Staff list endpoints aggregate in application memory; add pagination/filtering for large cohorts.
- `/api/health` discloses mode and provider name; trim if that matters.

## Change log

### 2026-09-17 — OpenAI (`gpt-5.5`) provider added and set as active

- Added an OpenAI-compatible provider in `apps/server/src/llm.js`. Groq and OpenAI now share a single `chatCompletionsProvider()` helper (chat-completions endpoint, bearer auth, strict `json_schema` structured output parsed by `evaluationSchema`, accuracy forced to null without verified context + source URL, final reports aggregated locally with no extra model request).
- `createLlm()` now dispatches `LLM_PROVIDER=openai`: requires `OPENAI_API_KEY`, uses `OPENAI_MODEL` (default `gpt-5.5`) and optional `OPENAI_BASE_URL` (default `https://api.openai.com/v1`, for OpenAI-compatible gateways). Failures keep only `{ providerStatus }` and never echo provider bodies; HTTP 429 maps to a clean rate-limit message with no retry.
- `apps/server/.env` switched to `LLM_PROVIDER=openai` with `OPENAI_MODEL=gpt-5.5`; the key lives only in that git-ignored file. Groq credentials were left in place. `apps/server/.env.example` documents `OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_BASE_URL`.
- Added `apps/server/test/openai.test.js` (endpoint/auth/model/context, model + base-URL overrides, 429 no-retry/no-leak, truncated/invalid rejection, missing-key throw).
- Behavior kept identical to Groq on purpose: one semantic evaluation per answer, at most one follow-up per main question, deterministic local scoring, no automatic provider fallback.
- Validation: `npm test` → **67 offline tests pass** (was 63; +4 OpenAI tests) and `npm run build` succeeded. A constructor check returns provider `openai`.
- Limitations / next steps: no live call was made, so the OpenAI path is **not live-verified**. `max_completion_tokens` is the only tuning parameter sent — `temperature` and `reasoning_effort` are intentionally omitted for reasoning-model safety; confirm the account's exact model id and structured-output support, and adjust `OPENAI_MODEL` if it differs. **The OpenAI key was pasted into chat and must be rotated by its owner; do not reproduce or commit it.**

### 2026-09-17 — question bank restored from the Pre-CAS question set (10 asked + 139 reference)

- **Source:** `PreCasInterviewQuestions.pdf` in the repo root (7 pages). Text was extracted with the Python `pypdf` package (installed on demand) through a temporary text file that was deleted afterwards; the PDF remains the source of record.
- **New `apps/server/src/questionBank.js`:** 149 questions with fixed ids `50000000-0000-4000-8000-…`. The 10 PDF *Main Questions* are `is_main_question: true` and are asked in every interview. The 2 *Cross Questions* and 137 *Extra Pre-CAS* questions are `is_main_question: false` reference records, grouped by the PDF's own headings (Personal / profile, University / course knowledge, Academic progression, Finance, Sponsor credibility, Accommodation / UK living, UK knowledge, Work-related, Career / return-home, Comparison, Application process, Credibility / pressure). Obvious typos were fixed (`accomodation`→`accommodation`, `sponser`→`sponsor`) and capitalization normalized; wording is otherwise preserved. Expected concepts were authored only for the 10 main questions.
- **`apps/server/src/domain.js`:** `seedQuestions` now re-exports from `questionBank.js`; `repository.js`, `seed.js` and demo seeding are unchanged.
- **Live Supabase:** all 149 rows upserted through a one-off service-role script (temporary script deleted after the run); verified `public.questions` **0 → 149** (10 main).
- **Local demo:** `apps/server/data/demo.json` `questions` set to the same 149 rows.
- **Interview effect:** only the 10 main questions are asked, so student interviews stay short; reference questions appear to staff in **Admin → Questions** and are never asked.
- **Tests:** `integration.test.js` now clears any seeded questions in `setup()` before injecting its own 11-question fixture, so the offline suite is independent of the shipped bank. `npm test` → **63 offline tests pass**. No frontend code changed.
- **Limitations / next steps:** reference questions are staff-visible records only — the app has no random-pool selection, so extras are not surfaced to students; review the PDF wording for accuracy before operational use; per-question time limits and weights are left at defaults.

### 2026-09-17 — question bank cleared (awaiting the new question set)

- **Live Supabase:** deleted all 11 rows from `public.questions` with a one-off service-role script (the temporary script was removed after the run); verified count **11 → 0**. Existing attempts are unaffected because each session stores its own question snapshots.
- **Local demo:** `apps/server/data/demo.json` `questions` cleared (**11 → 0**); profiles, sessions and resources untouched.
- **Code:** `apps/server/src/domain.js` now has `export const seedQuestions = [];`, so `seed.js` and fresh demo databases seed no questions.
- **Tests decoupled from the seed set:** `evaluator.test.js` defines a local 3-question fixture (it no longer imports `seedQuestions`), and `integration.test.js` injects an 11-question fixture in `setup()`. The offline suite therefore no longer depends on the built-in question bank, so adding the new questions will not break tests.
- **Validation:** `npm test` → **63 offline tests pass**. No frontend code changed.
- **Effect / next step:** the question bank is now empty everywhere. Add the new questions via **Admin → Questions**, or by filling `seedQuestions` and running the seed script for a fresh environment. The replacement question set had not been provided yet.

### 2026-09-17 — per-question answer timers (2:00 main / 1:00 follow-up)

- **Added `supabase/migrations/003_question_timers.sql`:** `questions.time_limit_seconds integer`, nullable with a `15–900` check. `NULL` means the course default applies. Must be run in the Supabase SQL Editor before this feature works in Supabase mode.
- **`apps/server/src/domain.js`:** exported `mainQuestionSeconds = 120` and `followUpSeconds = 60`; `questionSchema` accepts the nullable limit; `createSession` stamps `question_started_at` and fills each snapshot's limit; `applyAnswer(session, input, evaluation, now = new Date())` records `duration_seconds` (clamped 0–3600), `time_limit_seconds`, `over_time` and `answered_at`, resets `question_started_at`, and gives generated follow-ups a 60s limit. Timing is server-authoritative and does not affect any score.
- **`apps/web/src/components/Interview.jsx`:** live mm:ss countdown badge in the question header (amber under 15s, "Time's up" past zero), the recorder auto-stops at zero, new recordings are blocked until submit, manual submit still works, and a resumed attempt recomputes the clock from `question_started_at`. Consent copy and the practice-space subtitle now explain the timings.
- **`Report.jsx`:** each reviewed answer shows "Time used x of y" and whether it was within or over the limit.
- **`Questions.jsx`:** counsellors/admins set an optional per-question "Answer time limit" (30s–10:00, or course default) and the bank list shows the limit.
- **`styles.css`:** added `.section-tools` and `.timer`/`.timer.urgent`/`.timer.over`.
- **Tests:** new `apps/server/test/timing.test.js` covers the 2:00 default plus elapsed recording, the over-time flag with clamping, the 1:00 follow-up default and a custom override; `integration.test.js` asserts a new session exposes `time_limit_seconds: 120` and a start clock; `database.test.js` runs `003` and asserts the column exists.
- **Validation:** `npm test` → **63 offline tests pass** (58 previous plus five assertions across the two test files); `npm run build` succeeds (513.54 kB raw / 148.92 kB gzip; the >500 kB warning is expected). No live browser/voice timer check was run this turn.
- **Limitations / next steps:** over-time answers still score normally (informational only); an attempt abandoned mid-question keeps accruing elapsed time, so a long resume shows over-time; `003_question_timers.sql` is not yet applied live. The per-question Standards score cap and the English-fluency pre-question remain planned, not implemented.

### 2026-09-17 — starter template library for the admin resource form

- **Added `apps/web/src/content/resourcePresets.js`:** nine built-in starter presets (five `template`, four `research`) with `id`, `kind`, `label`, `title` and `body`, covering common pre-CAS needs such as introduction, why-this-course, career plan, study gap, work experience, university comparison, English requirements, city/accommodation and entry deadlines. These are distinct from the six seeded resources.
- **`ResourceAdmin.jsx`:** the New/Edit resource form now has a "Start from a starter" select (grouped into Templates and Research methods). Choosing one fills `kind`, `title` and `body` in the local form; the admin reviews/edits and must still click Save, so nothing is written until confirmed. The select resets to its placeholder after each pick.
- **Tests:** added `apps/server/test/resource-presets.test.js`, which asserts unique `id`s, at least one preset per kind, a well-formed id, and that every preset passes the server `resourceSchema` (so preset titles/bodies can never exceed the API limits).
- **Validation:** `npm test` → **58 offline tests pass** (57 previous plus the preset test); `npm run build` succeeds (511.21 kB raw / 148.14 kB gzip; the >500 kB warning is expected).
- **Limitations:** presets are plain text (matching existing resources), not rich text; inserting a preset over an existing resource replaces its title and body in the form only until Save; the list is code-managed, so adding presets requires a code change rather than admin authoring.

### 2026-09-17 — security review hardening (CORS, identifiers, logging)

- **Review performed:** dependency audit (`npm audit` → 0 vulnerabilities), source secret scan (only variable names/placeholders, no key values), and manual review of auth/authz, RLS/grants, headers, validation, redirects and the new phone/resources endpoints.
- **`apps/server/src/app.js`:** `WEB_ORIGIN` now rejects a wildcard origin at startup (`*` throws) instead of allowing any origin; route parameters `:id` and `:answerId` are validated as UUIDs, returning 400 before any store call (invalid ids previously surfaced as 500); provider-failure logging now uses `reportFailure()`, which prints the error message and HTTP status only and never provider response bodies.
- **`apps/server/src/llm.js`:** the Gemini adapter no longer embeds the provider response body in its error message (Groq already did not); it keeps only `providerStatus`. `retryAfter()` still reads the body locally.
- **Tests:** added "invalid identifiers are rejected before reaching the store" (400 for a bad id, 404 for an unknown valid UUID) and "wildcard CORS origins are rejected at startup".
- **Validation:** `npm test` → **57 offline tests pass** (55 previous plus the two above); `npm run build` succeeds (505.57 kB raw / 146.01 kB gzip; the >500 kB warning is expected). No live pen test was run this turn.
- **Limitations / next steps:** the deploy gates and hardening notes are now listed in "Deployment security checklist" above; phone remains non-unique plaintext; rate limiting and the evaluator remain single-replica.

### 2026-09-17 — student phone signup, account Profile page, student nav and Resources

- **Migration `002_phone_resources.sql` — the operator must run it in the Supabase SQL Editor; DDL cannot be applied with the service key:** adds `public.users.phone` (text, not null default ''), updates `handle_new_user()` to copy `phone` from signup metadata, and adds `public.resources` (`kind` template|research, `title`, `body`, `position`, `active`, `updated_at`) with the same no-browser-grants/service-role model as the other tables. Seeds six starter resources (three templates, three research methods).
- **Signup now requires name, phone and email + password** (`apps/web/src/components/Login.jsx` → `auth.signUp(email, password, name, phone)` in `services/api.js`). Phone is stored in `public.users`; the trigger copies it from signup metadata once 002 is applied.
- **New student Profile page** (`components/Profile.jsx`): account details (name and phone editable, email read-only), change password (re-authenticates the current password before `updateUser`, so the old password is required), the saved-attempts list, and the former study form moved unchanged to `components/StudyDetails.jsx`. Account updates use the new `PUT /api/me`; name/phone are validated (`accountSchema`, `phoneSchema`) and the role cannot be changed through it.
- **Student sidebar is now exactly Profile · Start Interview · Templates · Research Methods** (`App.jsx`); students land on Start Interview (`/student`), routes are `/student/{profile,interview,templates,research}`, and Overview + Leaderboard are no longer student pages (staff keep Leaderboard). Staff/admin navigation is unchanged apart from a new admin-only **Resources** page; `openSession` opens `interview` for students and `practice` for staff.
- **Templates and Research Methods are admin-editable in-app:** `GET /api/resources?kind=…` for signed-in users (students/staff see active only, admin sees all), `POST`/`PUT`/`DELETE /api/resources` admin-only; `components/ResourceList.jsx` renders the two student pages and `components/ResourceAdmin.jsx` is the admin CRUD screen. Demo mode seeds the same six resources.
- **Validation:** `npm test` → **55 offline tests pass** (53 previous plus phone/account and resources authorization/visibility), `npm run build` succeeds. Earlier entries report 42/49 tests; those figures are historical.
- **Live follow-ups (operator):** run `002_phone_resources.sql`; optionally re-run `create-accounts.js` to backfill the test student's phone (`+234…`); existing students without a phone can add it on the Profile page.
- **Limitations:** phone is stored as text (not E.164-normalised) and is not unique-verified; no SMS verification (deliberate). Resources are plain text with preserved line breaks, not rich text/Markdown. The live Supabase run of 002 and these screens against live accounts were not exercised this turn.

### 2026-09-16 — production artifact + live speech experiments

- **Deploy prep (remains to ship):** ran the server with `NODE_ENV=production` and `PORT=8080` and verified the single-process artifact serves everything: `GET /` → 200 `text/html` (built index), `GET /student/practice` → 200 via the SPA fallback (no rewrites needed), hashed JS/CSS assets → 200, `GET /api/health` → `{"ok":true,"mode":"supabase","ai":"groq"}`, and unauthenticated `/api/me` → 401. A live student sign-in also booted the production UI to `/student`. Deployment still needs a chosen host (Render/Railway/VPS), the git-ignored env vars set there, and `NODE_ENV=production` on start.
- **Live speech test (partial):** drove the practice flow headlessly in Edge (production build) with a SAPI-synthesized WAV as the captured device. `SpeechRecognition` is supported; "Use microphone" starts the recognizer (status stays "Listening…" for the full duration, no errors, no interim) but produces **no transcript** — the Web Speech API does not consume the headless fake-device audio capture, so it needs a real microphone signal. Verdict: the app's mic flow starts the engine cleanly, but end-to-end spoken transcription on a real microphone still needs a manual check (open the dev app, allow the mic, answer one question by voice).
- Created a minimal student profile and left one empty practice session row on the live DB for the test student; harmless, expires per retention policy.
- Auth URL configuration (site URL + redirect `http://localhost:5173`) remains a dashboard-only step for the operator; password sign-in is unaffected.

### 2026-09-16 — live role UI verified end-to-end + staff nav fix

- Walked the UI in a real browser headlessly (Edge + Chrome DevTools Protocol, temporary Node script, since deleted) using the three real Supabase accounts: each sign-in session was injected, the app booted authenticated, and navigation was exercised per role.
  - Student → `/student`; nav: Overview, Practice interview, My profile, Leaderboard; student dashboard only, no staff menus.
  - Counsellor → `/counsellor`; nav: Student progress, Question bank, Leaderboard; Students page lists the assigned student ("Test Student").
  - Admin → `/admin`; nav additionally shows Administration; clicking it opens `/admin/admin` with counsellor assignments, the full user list (student/counsellor/admin), and the staff-access audit section.
- Fixed `apps/web/src/App.jsx` nav: staff previously saw a dangling "Overview" button that points at the student-only `dashboard` page (outside the staff route set, so it silently redirected); Overview now renders only for students.
- Auth provider settings (public `/auth/v1/settings`): email provider enabled, signups allowed. Password sign-in is live without any redirect configuration.
- Security scan: the Groq API key appears in no tracked/editable source file — only in the git-ignored `apps/server/.env`. It was shared in an earlier chat transcript, so rotating it (new key in the Groq console) remains the recommended safe step.
- Validation: production `vite build` passed (491 kB raw / 142 kB gzip, unchanged); 42 offline tests passed; live CDP walk-through above.

### 2026-09-16 — role-scoped URL routes + live accounts provisioned

- `apps/web/src/App.jsx` now maps every page to a role-scoped URL route: `/student`, `/counsellor`, `/admin` (child pages sit under the matching root, e.g. `/student/practice`). Unknown or wrong-role paths redirect to the role home; the default role/path is Student (`/student` overview). Browser back/forward works via `popstate`; navigation uses `history.pushState`.
- Validated headlessly in demo mode (Edge): `/` renders the student dashboard; `/counsellor` and `/admin` visited as a student redirect to `/student`; `/student/practice` renders the practice page. Build passes with 42 offline tests.
- Added `apps/server/src/create-accounts.js` (run with `node --env-file-if-exists=.env src/create-accounts.js`): provisions confirmed accounts for the three roles via the service role, promotes the staff roles in `public.users`, and saves credentials to the git-ignored `apps/server/data/accounts.json`. Idempotent per email (skips existing users, only re-syncs the role); optional `ACC_<ROLE>_EMAIL` / `ACC_<ROLE>_PASSWORD` env overrides.
- Provisioned and verified live: student/counsellor/admin each sign in through the anon client; `/api/me` returns the correct role per account; RBAC guards hold: `/api/users` 403 for student and counsellor, 200 for admin; `/api/students` 403 for student, 200 for counsellor and admin. Admin created the counsellor→student assignment through the audited `/api/assignments` endpoint.
- Note: `vite build` output grew to ~491 kB raw / ~142 kB gzip. Once `VITE_SUPABASE_URL` is defined, Vite can no longer dead-code-eliminate the `@supabase/supabase-js` browser client; the increase is expected, not a defect.
- Limitation: full UI walk-through of per-role isolation and remote deployment are still untested. Test accounts use generated passwords stored only in the git-ignored `accounts.json`; rotate or delete them after testing.

### 2026-09-16 — live Supabase connection (in progress)

- Migration `001_initial.sql` ran successfully on the live project (user-confirmed). Auth tables, signup trigger, RLS, restricted grants and save/retention functions are live.
- `apps/server/.env` now sets `APP_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, a generated `DATA_ENCRYPTION_KEY`, and `WEB_ORIGIN=http://localhost:5173`. `apps/web/.env` sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Existing Groq/Gemini keys preserved. Keys exist only in the git-ignored `.env` files.
- Validation: server boots with `APP_MODE=supabase` (health `{"ok":true,"mode":"supabase","ai":"groq"}`); `seed.js` inserted the 11 question bank rows idempotently against the live DB.
- Performed 2026-09-16: auto-confirmed account provision of all three roles, service-role role promotion, counsellor→student assignment, live RBAC guard checks and a full per-role UI walk-through in a real browser. Remaining: Supabase Auth site/redirect URL configuration (link/PKCE flows) and remote deployment. Full checklist is in the boundaries section above.

### 2026-09-16 — UI component split, Sparkles removal, theme screenshot check

- Split the single 1550-line `apps/web/src/App.jsx` into `apps/web/src/components/` modules: `common.jsx` (Button, Field, Title, Stat, AttemptList, label/date/emptyProfile), `Login`, `Dashboard`, `Profile`, `Interview`, `Report`, `Questions`, `Students`, `Leaderboard`, `Administration`. `App.jsx` is now the state/navigation shell only. JSX and behavior were kept byte-equivalent.
- Removed the generic `Sparkles` (common "AI" logo) icon from the dashboard hero tag "GGEC PRE-CAS PRACTICE" and the interview tips card.
- Validation: production Vite build passed; 42 offline tests passed.
- Theme visual check: rendered the running app headlessly (Edge, 1366x900). Screenshot pixel sampling confirmed the navy theme renders (`#002060` = 22.4% of the frame; hero/buttons), crimson accent `#B01020` present, and the GGEC square logo is drawn in the sidebar (its red/navy pixels detected at the brand region). Microphone/AI behavior not exercised in this check.

### 2026-09-16 — GGEC logo and brand theme

- Copied `apps/logo/square logo.jpg` to `apps/web/public/logo.jpg` and used it as the favicon (`index.html`) and in the sidebar/auth brand (replaced the `GraduationCap` icon box in `App.jsx`).
- Recolored the UI theme to the logo palette extracted from the image: primary navy `#002060` (buttons, hero, brand surfaces) with crimson `#D01020` accents (status/progress dots, focus outlines, links), light navy-tinted neutrals and borders replacing the previous green/cream palette. Semantic error colors and white hero overlays were kept.
- Replaced the `.brand-icon` CSS box for an `<img>` (`object-fit: cover`, 40px sidebar / 58px auth) instead of the previous colored icon padding.
- Validation: production `vite build` passed; 42 offline tests passed. Logo colours sampled programmatically from the JPEG (dominant navy `#002060`, accent red `#D01020`); no visual browser check yet.
- Limitations: exact hex tones are best-effort extracts, not brand-guide values; hero art/illustration still uses generic shapes, not the logo artwork.

### 2026-09-16 — explicit scoring and continuation documentation

- Added `scoring.js`, rubric v2 weights, required core criteria, irrelevance caps, shared main/follow-up weight, report answer-score contributions and versioning.
- `domain.js` now withholds overall scores for incomplete coverage and merges provider narrative without letting it override deterministic numbers.
- Fixed `app.js` to enqueue failed evaluation only **after** saving the answer, preventing the worker from reading a pre-answer version.
- Deferred evaluation now preserves expected concepts/source evidence, skips retained transcripts, and recomputes a report when a missing answer is newly evaluated.
- Added previous-answer feedback and per-answer/per-criterion report scores in the UI.
- Added offline scoring/regression tests and a quota-bounded live verification script.
- Added this handover file and `AGENTS.md` update instructions. Updated README scoring guidance.
- Validation: 41 offline tests passed; frontend production build passed; four real Groq requests completed both isolated smoke interviews and persisted/reloaded final reports. Remaining limits are documented above.

### 2026-09-16 — Groq connection (previous work)

- Added strict structured evaluation through Groq, with server-only configuration and generic errors that do not expose provider response bodies.
- Verified a real fictional answer; 33 offline tests and frontend build passed at that point.
- Disabled startup backfilling to save quota. Accepted a Windows UTF-8 BOM in demo JSON without modifying saved data.

### 2026-09-15 — initial application and microphone recovery

- Built React/Express project, Supabase schema/RLS, auth/roles, profile/question CRUD, consent/interview persistence, reports, staff tools, leaderboard, audit and retention.
- Added speech startup/stop watchdogs, interim transcripts, bounded reconnection and explicit permission/network feedback. Initial speech lifecycle and application checks passed; real microphone transcription remained unverified.

## How to update this file

For every functional change, add a dated entry with the request, files changed, resulting behavior, tests/build/live verification actually run, and unresolved limitations. Update the Current state and Scoring contract if they changed. Keep older entries as history. Never store credentials, actual student transcripts or sensitive profile information here.


## 2026-09-16 � Explicit historical evaluation

- Added authenticated `POST /api/sessions/:id/evaluate` to queue a single completed attempt. Existing owner/assigned-counsellor/admin access checks apply; expired/retention-cleaned attempts are rejected. Staff requests are audited. Requests are rate limited and the worker deduplicates active jobs.
- Existing valid answer evaluations are preserved. Missing evaluations use the saved profile/question snapshots; the final report uses the current deterministic rubric.
- Runtime Groq background calls are spaced 25 seconds apart. Each queued pass attempts missing answers once; failures stay unscored for an explicit retry, avoiding repeated quota consumption. This pacing does not coordinate with simultaneous foreground interview requests.
- Jobs remain in memory: keep the backend running until the report is saved. No progress endpoint or UI retry button yet; fetch the session to read its final report. Automatic historical startup evaluation remains disabled locally.
- User requested evaluation of the completed September 15 attempt only; the newer unfinished attempt is left untouched.

- Verification for this change: 42 offline tests passed; production Vite build passed. Live historical evaluation result is checked separately after completion.

- Live verification completed: the selected historical attempt now has 12/12 evaluations and a persisted report. Confirmed the report and category scores in the browser. Existing valid evaluation was preserved; no other attempt was queued.


### 2026-09-17 — Evaluation progress/retry and microphone verification

- Files: `apps/server/src/evaluator.js`, `app.js`, `index.js`; `apps/web/src/components/EvaluationProgress.jsx`, `Report.jsx`; `services/recognition.js`; evaluator, integration, database and speech tests; `scripts/preview-fixtures.js`.
- Added owner/assigned-staff-scoped `GET /api/sessions/:id/evaluation` returning counts, state, retry eligibility and safe messages. Report shows Evaluate/Retry, accessible progress, polling through long jobs, connection recovery, manual refresh, quota cooldown and automatic final-report refresh. Existing note redaction remains in place.
- `evaluation_job` metadata is saved inside the existing session data JSON. No migration required. POST persists intent before returning; startup recovers only queued/running jobs with the same provider. Historical idle attempts are not automatically sent. A changed provider pauses recovery for explicit review/retry.
- Each validated answer evaluation and partial report commit immediately. Valid scores are preserved on retry. Bounded optimistic retries merge onto current session state, preserving holds and respecting retention cleanup. Runtime uses a single pass and stops at the first provider failure, with a 60-second manual retry cooldown. Groq background calls remain spaced 25 seconds apart. New in-progress failures defer backfill until interview completion to avoid background version changes while the student drafts.
- Silent recognition engines now show helpful guidance after 15 seconds without words, without discarding text or forcibly stopping speech. Tests cover silence, delayed results, natural disconnect/reconnect, stop during reconnect, blocked permissions, network/audio-capture errors, interim/final duplication and cleanup.
- Verification: **49 offline tests passed**, including database job-metadata persistence, job recovery, per-answer commits, quota interruption/retry, duplicate queue requests, authorization and retention races. Production frontend build passed.
- Browser fixture verification: isolated fictional app on port 5174, no API keys/live model calls; initial Evaluate control, live partial count, quota warning/cooldown, remaining-answer retry and completion checked. This fixture deliberately fails its second model call once; scores are synthetic test data only and never touch the real application records.
- Real microphone: user explicitly confirmed on 2026-09-17: "Yes, the words appear and stay" after the requested Chrome/Edge speak-and-Stop test. No raw audio recorded by GGEC and no test transcript submitted for scoring.
- Limits: one backend replica only; no distributed leases/shared quota scheduler. Abrupt failure after provider response but before commit may repeat one call. Disabled provider leaves persisted jobs paused until re-enabled/restarted. Cooldown is a minimum, not a promise that the provider quota has reset. Live Supabase restart recovery was not separately exercised this turn; both repository formats and PostgreSQL metadata persistence are covered offline.
- Reproduce offline UI: from project root run `node scripts/preview-fixtures.js`, open `http://127.0.0.1:5174`, open the fictional completed report, evaluate, wait for the simulated quota cooldown, retry. Stop the fixture server after testing. This does not load real environment credentials.


### 2026-09-17 — Counsellor comparison, dated references and focused practice

- Added `practice.js` service helpers; `Calibration`, `PracticeProgress`, `Coaching` UI components; updated API routes, question/profile editors, report/interview/dashboard navigation, provider feedback prompt, repository report metadata and tests.
- **Scoring comparison:** separate staff navigation and scoped per-attempt blind review endpoint. Unreviewed answers expose transcript/profile/evidence without AI ratings in this endpoint. The reviewer supplies rubric scores and a strong/weak/contradictory/other label; submitted ratings are immutable per reviewer. Comparison shows paired count, per-criterion ratings, mean absolute disagreement and signed AI-minus-human disagreement. Other authorised report views remain available, so reviewer discipline is needed for independence. No weights changed, no historical attempts rescored, no claim of real-world calibration. `CALIBRATION.md` supplies the workflow and fictional discussion samples without invented gold ratings.
- Human numerical assessments live in each answer's existing JSON data as `human_reviews`. Student responses remove them; staff access remains assigned-student/admin scoped and audited. No new free-text counsellor field added. Existing aggregate retention semantics apply to the numeric ratings; cleared transcripts prevent further calibration access.
- **Verified references:** question editor accepts an optional reference with university, course, intake, checked-on/review-by dates, modules, fees and relevant facts. Source requires HTTPS. Versioned reference JSON is encoded in the existing `questions.verified_context` text column via service helpers; staff API decodes it for editing. No new database migration. References are per-question, not a central university catalogue. The operator must read the official source; the app does not fetch or independently verify URLs.
- Profile now has optional intake. New session snapshots use reference evidence only if university/course/intake match (trimmed, case-insensitive) and the date is in range. Legacy undated text and expired/mismatched packs do not support factual scoring in new attempts. Saved historic snapshots remain intact. Source provenance is visible in completed student reports; source/answer hints stay hidden before completion. Reference updates affect only future sessions.
- **Student improvements:** chronological history with score, practice category and scoring version; full-interview best score excludes category practices. Practice focus dropdown selects an active category, and weak-area report buttons open a new consent step. Category scores cannot enter the leaderboard. Reports explain deterministic weights/relevance caps and offer labelled example structures with placeholders, never invented student facts. These examples incur no LLM requests. Model feedback prompt now explicitly asks for answer-specific score explanation and one improvement.
- Supabase history carries scoring version through existing session JSON on new saves; older rows may show Legacy/unknown. No database schema changes required for these features.
- Verification: **53 offline tests passed**; production build passed (Vite warns about the main bundle being slightly above 500 kB). Tests cover dated matching/expiry, snapshot immutability, reference authorization, blind review/redaction, locked independent ratings, numeric comparison, category selection and leaderboard exclusion. Browser fixture checked student history, counsellor navigation/independent input/submission, reference editor fields and category selection with consent gating. Browser ratings were synthetic fixture values only; no real accounts/attempts were modified and no live model quota used this turn.
- Outstanding input: user has not yet supplied the first real university/course/intake or actual counsellor-scored sample answers. The interfaces work, but no live source pack has been populated and actual counsellor calibration is still pending. Do not describe this as an already calibrated model.
- API recommendation checked against Groq official docs: retain the existing Groq `openai/gpt-oss-120b` adapter/free tier for testing. Published limits: 1,000 requests/day, 8,000 tokens/minute, 200,000 tokens/day. Optional paid pricing listed as $0.15/M input and $0.60/M output tokens. Account limits and pricing may change; no billing plan/provider/key was changed.

### 2026-09-17 — GPT-5.5 gateway diagnosis and safe failure messages

- Verified the running API selects `openai` in Supabase mode. The configured gateway is CodeGate (`codegate.dev/v1`), model `gpt-5.5`; no credentials changed.
- One live fictional scoring request through the actual adapter returned HTTP 200, finish_reason stop, validated rubric JSON and a deterministic score of 74.32. It took 100,024 ms; 318 completion tokens and zero reported reasoning tokens. This verifies this gateway request, not the underlying model identity or direct OpenAI service. No student transcript was sent by this diagnostic.
- Read-only inspection found one completed failed evaluation job with ten saved answers and zero evaluations. Its previously stored generic message cannot establish the original cause. Current success does not prove the earlier failure is resolved; provider latency is confirmed. No historical answers rescored and no provider switch performed.
- Added provider-errors.js and tests: fixed safe messages distinguish timeout, insufficient credit, rejected access/model/format, quota and invalid output. Background worker and foreground submission now use these messages. Adapter replaces malformed JSON/schema errors with a safe invalid-response code; logs no longer print arbitrary provider error text. UI explains that processing may take over a minute per answer.
- Reproduction: from project root, `node --env-file=apps/server/.env scripts/diagnose-provider.mjs`. This makes ONE real, potentially billable fictional request, logs only diagnostic metadata, and does not persist an interview. It is not part of offline tests.
- Validation: npm run check passed: 68 offline tests plus production frontend build. Existing main-bundle size warning remains. New messages were not separately browser-tested. Default OpenAI timeout remains 180 seconds; no unsupported tuning parameters or automatic paid retries added.
- Next: refresh the report and explicitly retry its missing answers. Successful scores persist individually. If the gateway fails again, the new message identifies a safe failure category; historical generic errors remain unchanged. A full ten-answer run at the observed sample latency could take roughly 17 minutes, but latency varies.

### 2026-09-18 — Three concurrent GPT-5.5 evaluations verified

- User requested a provider concurrency check. Sent exactly three small fictional answer evaluations concurrently through the existing createLlm adapter to the configured CodeGate GPT-5.5 route. No student data, database writes, configuration changes or automatic retries.
- All three produced validated rubric scores. Requests began at 0/39/40 ms and completed in 7,911 / 8,774 / 13,427 ms respectively. Total batch wall time: 13,467 ms. No quota/access errors observed.
- Confirms this account accepted three overlapping scoring requests in this test. It does not establish an unlimited concurrency allowance or prove internal provider scheduling. No same-day sequential baseline was run; do not claim an exact speedup. Yesterday's 100-second call and today's faster calls demonstrate variable latency.
- Official API reference https://docs.codegate.dev/api/ documents upstream 429 errors; no numeric guaranteed concurrency allowance found. Use a bounded pool of three with rate-limit backoff if implementing parallel scoring.
- App evaluation worker remains sequential. This was a live diagnostic only; no new app build/tests needed because no runtime code changed. Diagnostic source is in excluded work/check-parallel.mjs. No implementation of parallel persistence/retries performed yet.

### 2026-09-18 — Parallel background evaluation implemented

- Updated evaluator.js and index.js: OpenAI-compatible background jobs use a bounded pool of three answer requests; Groq/Gemini remain sequential. One interview job runs at a time. Request starts retain the existing three-second spacing for OpenAI. This limit applies to the background worker, not concurrent students' foreground submissions.
- Each worker receives the complete earlier transcript context, independently of score completion order. Successful scores persist immediately. Local read/merge/save operations are serialized to avoid lost updates; existing optimistic conflict retries handle external writes.
- On provider failure, stop scheduling new requests and drain already-started requests, saving their successful scores before marking the job failed. A retry skips saved scores. Unexpected storage failures also drain workers before ending the job. Retention and changed-transcript checks remain in place.
- Existing automatic background enqueue on interview completion and explicit report retry use this pool. Foreground answer scoring and live follow-up generation remain as before; this does not defer all interview scoring until submission. No historical job was explicitly started or rescored during this change.
- Validation: 70 offline tests passed, including out-of-order completion, maximum three in flight, earlier-answer context, independent saves, quota draining and missing-only retry. Production build passed with existing bundle-size warning. API health returned Supabase/openai after source changes. No additional paid requests or full live ten-answer benchmark performed; previous three-request provider check remains the live evidence.
- Single-server limitation remains. Abrupt shutdown between provider response and persistence can repeat that request after recovery. Provider latency still varies; do not promise an exact completion time.

### 2026-09-18 — Fast database-first submissions and concise feedback

- Production index.js enables deferScoring on createApp. Answer POST saves transcripts and advances main questions without calling the provider. Only after the final save does it enqueue the existing parallel worker. Explicit report retry/recovery stay available. Main question flow no longer generates live AI follow-ups; existing pending follow-ups remain answerable. Core createApp defaults to the legacy mode for explicit integrations/fixtures; production entrypoint selects fast mode.
- Updated Interview.jsx waiting/consent copy. Updated Report.jsx: three improvement previews, prioritizing lower answer scores, at most 35 words each; full lists and practice examples are expandable. Stored historical feedback remains intact and downloadable.
- llm.js requests concise feedback/evidence and at most two missing/contradiction items each. evaluator.js supplies is_background so no unused follow-up question is requested after completion. These prompt limits are targets; rubric validation and scoring weights are unchanged. Full previous-answer/profile context retained for consistency.
- README includes cost plan: no follow-up evaluation calls in fast flow, short output, local OpenAI report, missing-only retry; parallelism itself does not reduce token costs. Future optional aggregate usage tracking/model comparison/context optimization requires validation. No paid requests or historical rescoring performed.
- New integration test checks eleven database-first submissions, no foreground AI calls, final-commit-only enqueue and duplicate final submission. Initial test exceeded the existing 15 submissions/minute limiter by retrying every answer; corrected fixture to retry just the final answer, without changing production limits.
- Final validation: 71 offline tests passed and production build passed (existing bundle-size warning). Running API health returned Supabase/openai. No separate browser visual check or live cost measurement performed.

### 2026-09-18 — Curated random question angles and practice sub-question bank

- Verified live database count read-only: 149 questions, 10 main and 139 reference; all ten built-in mains match the new catalog. No database question rows changed.
- Added questionAngles.js: ten explicit topic groups, four main angles per group (40) and three related practice sub-questions per group (30). Each main variant includes its own scoring concepts. Nationality-neutral local-study wording replaces the Nepal assumption when selecting the built-in home-country topic. No model calls generate questions.
- Session creation selects one random angle per eligible built-in main question before the existing evidence snapshot. Keeps original question UUID, category, time limit, weight and verified reference. Chosen text/angle id/concepts persist in the session, so resume and evaluation use the actual question asked. Random selection can repeat between attempts; no recent-history exclusion implemented.
- Staff-edited text/category and custom questions retain their exact wording; deleted/inactive/non-main questions do not participate. Catalog angles are source-maintained, not editable through the existing database question form. Angle-specific concepts override the main row concepts for eligible built-in questions; evidence and weighting remain staff-controlled.
- Authenticated question-angles endpoint publishes only eligible topic prompts, strips scoring concepts and does not expose profile or verified-source context. Student pre-interview and staff question-bank views have expandable topic lists and a random self-practice prompt button. Sub-questions do NOT add interview answers or trigger scoring calls, as requested by the user. Existing 139 reference questions remain available in the prior bank.
- Added QUESTION_BANK.md as a readable catalog. No student attempts modified, no credentials changed and no paid AI calls. Full-interview count remains ten for current live configuration.
- Validation: 75 offline tests passed; production frontend build passed with existing bundle-size warning. Tests cover all catalog choices, scoring focus, preserved identity/weights, custom question protection, fixed session snapshots and ten-main-question completion without inserted sub-questions. API health passed. No separate browser visual check performed.

### 2026-09-20 — Security review

- Reviewed authentication/authorization, staff/student redaction, API middleware, database/RLS/RPC design, encryption scope, browser token handling, dependencies and configured-secret exposure. Detailed findings and scope in SECURITY_REVIEW.md.
- Both production-only and full npm audits returned zero known vulnerabilities. Exact-match scan of 89 source/build files found no configured server secret values (excluded environment/runtime/work/dependency directories). This does not establish historical secrets were never leaked; previously chat-disclosed keys still need owner rotation if active.
- Fixed .gitignore to exclude all .env variants except example files, *.key and work/. Fixed malformed JSON and oversized body responses to use constant safe text; added regression tests. No authentication policy/data schema changed.
- Outstanding: persistent per-student/global AI budgets and bounded admission queue, production infrastructure/live grant verification, third-party data handling, end-to-end erasure workflow. Application encrypts profiles/snapshots, not transcript/report JSON. No live student changes or paid AI calls.
- Validation: 76 offline tests passed; production build passed with the existing bundle-size warning. Regression verifies malformed request content is not echoed and oversized requests remain rejected.

### 2026-09-20 — Introduction first, remaining questions shuffled

- New sessions order active Introduction-category questions first and Fisher-Yates shuffle the remaining selected main questions using server-side crypto randomness. Category-focused practice keeps its category filter; no unrelated introduction is inserted. Saved sessions keep their original order, including interviews already started before this change.
- Updated questionAngles.js and session creation in app.js. Existing per-topic angle selection, scoring and question counts are unchanged. Added regression coverage for introduction position, permutation/no mutation, focused/empty sets and stored ordering. No database migration or paid AI calls.
- Validation: 77 offline tests passed and production build passed with existing bundle-size warning. Reference snapshot test now locates its question by UUID rather than assuming the first position. Initial run exposed that outdated test assumption; rerun passed. Existing source ZIP predates this ordering change; project files are current.

### 2026-09-20 — Groq credential updated
- Replaced GROQ_API_KEY in the ignored server environment file at user request. Verified the saved value without printing it. No model API request made and key validity not tested. Scoring provider remains unchanged; browser STT remains active until the Whisper recording/upload adapter is implemented. No secrets included in documentation or archives. Chat messages cannot be removed by this agent; the disclosed replacement should be rotated before production use.

### 2026-09-20 — Groq Whisper speech-to-text implemented

- Added server transcription.js provider interface and authenticated POST /api/sessions/:id/transcribe. Production config independently selects STT_PROVIDER=groq and GROQ_STT_MODEL=whisper-large-v3 using the existing server-only GROQ_API_KEY. GPT scoring remains unchanged. Health reports stt=groq; browser STT remains an explicit fallback configuration (STT_PROVIDER=browser), not a silent provider fallback.
- Endpoint enforces student ownership, active non-retained session, explicit groq-v1 consent header, 20 requests per student per ten minutes, one request per student and three concurrent audio requests per process. Accepts raw WebM/MP4/Ogg/WAV with signature checks, 8 MiB body limit and no compressed bodies; sends multipart only to the fixed Groq transcription endpoint. No disk/database audio storage or profile/expected-answer prompts. English transcription, not translation or grammar rewriting.
- Browser MediaRecorder adapter records at requested 64 kbps, stops/relinquishes microphone on Stop or existing question timer, enforces 15-minute maximum and 8 MiB cap. Text appears after recording ends. API upload timeout 100s, provider timeout 90s. Failure preserves audio in page memory for explicit retry. Replacement, successful transcription, submission or unmount releases audio references; navigating/refreshing loses failed recordings. Typed answer remains available. Original transcript and edits are not separately persisted: only the reviewed submitted answer is saved, as before.
- Added per-recording Groq consent checkbox covering existing sessions too, updated consent copy and retry UI. Frontend secrets remain absent; all audio uploads use existing auth. Browser interface in speech.js routes to recorded-speech.js behind the same transcribeAudio contract. No new package dependencies.
- Verification: 81 offline tests passed and production build passed (existing bundle warning). New tests cover endpoint auth/ownership/consent/type/size checks, provider multipart/model/no-prompt behavior, safe provider failure, microphone release/retry and cancel during permission. One live synthetic Windows speech WAV transcribed successfully in 443ms and included the expected business/analyst words. No real student audio used. API health confirms running stt=groq.
- User asked for real microphone confirmation through async question; pending at documentation time. Nepali-accent accuracy, actual browser/device recording formats and mixed-language behavior still need user testing. Server signature checks are not full audio decoding; duration is checked from provider metadata after processing, so byte/rate/concurrency limits are the pre-provider controls. In-memory limits are single-process and reset on restart. No retention guarantee is made for Groq's own infrastructure; confirm provider terms separately.
- Credential remains ignored; key validity verified by synthetic call, never printed. Since user shared the key in chat, rotate before production use. No credentials in source ZIP.

### 2026-09-20 — User confirmed Groq microphone flow
- User confirmed Groq speech-to-text is working after implementation. Real microphone flow is now user-verified. This confirmation does not establish measured accuracy across Nepali accents, devices or mixed-language speech.

## 2026-09-20 — Authored standards and 19-question format

Implemented `ggec-standards-v3`: 7 majors / 9 linked crosses / 3 extras, Introduction first, randomized 1–3 crosses per major from five authored options, saved order and previous-sequence avoidance. Added staff bank CRUD, admin grammar allowance/activation, readiness checks, immutable standards snapshots, student redaction, deterministic 60/20/10/10 marking with semantic partial credit, duration-only flags, and point-level report/coaching views. Existing background evaluation/retry remains in use. The new format is draft until GGEC authors a complete bank; no production standards were invented or real interviews rescored.

Read **STANDARDS_SETUP.md** for activation, precise scoring definitions, storage and limitations. New modules: standards-bank.js, standards-evaluation.js, StandardsBank.jsx. The bank is a protected reserved JSON resources record using the existing repository; no new migration. Single backend replica remains required. Category practice and old sessions retain v2; old scoring comparison is blocked for v3 rather than showing misleading criteria.

Verification: 88 tests passed; production build passed (non-blocking ~528 kB bundle warning). Isolated browser fixture verified consent, 19-question Introduction-first start, and staff bank settings/categories. One fictional GPT gateway evaluation validated structured point output; this is not evidence of marking accuracy. English is assessed from the submitted transcript, not independently verified audio; duration metadata is informational. Minimum bank requires 45 authored questions, all with standards. Follow up with counsellor calibration before treating marks as reliable.

## 2026-09-21 — Optional crosses with extra-question replacement

Updated standards-bank.js: each selected major may receive 0–3 crosses. Keep exactly seven majors and nineteen total questions. Randomly choose a total of max(0, 12 minus available complete extras) through nine crosses, then fill all remaining slots with distinct extra questions. Nine crosses means three extras; seven crosses means five extras; no crosses requires twelve ready extras. No repeated or invented extras. Introduction stays first, crosses stay linked to their parent, and saved attempts retain their order. Five authored cross options per eligible major remains the bank readiness requirement; asking zero does not remove that authoring requirement.

Updated dashboard/consent copy, README and STANDARDS_SETUP.md. Tests cover zero/seven/nine crosses, replacement counts, unique questions, and insufficient extra-pool bounds. Removed an obsolete integration assertion that Introduction must always have a cross. Existing standards, scoring and historical attempts are unchanged. No paid API calls or live student data were used. Final verification results recorded below.

Validation: 89 offline tests passed; frontend production build passed (existing non-blocking ~528 kB chunk warning). Configured-secret scan found no matches in distributable files. No new live browser or provider test was needed for this selection change.

## 2026-09-21 — Score saved answers during the interview

Cause: app.js explicitly queued deferred evaluation only at REPORT; this was unrelated to Groq transcription. Changed the answer route to enqueue after every successful transcript commit, including incomplete interviews. Evaluator preserves a rerun signal when new answers arrive during an active batch, then processes newly saved answers without rescoring successes. Existing configured parallel workers remain; a single initial answer naturally has only one available task. Automatic submissions/reruns respect provider cooldowns. Final overall report remains completion-only.

Interview.jsx retries score-only optimistic-version conflicts against the refreshed version with the same idempotency key and only while question index/state/follow-up remain unchanged. If the question changed elsewhere, it preserves the draft and asks the student to review it instead of silently discarding it or submitting to another question. Updated student copy to describe background scoring.

Validation: 90 offline tests passed and production frontend build passed (existing non-blocking bundle-size warning). Added a blocked-provider test proving an answer arriving during evaluation is scored before interview completion; updated integration test verifies every answer is committed before enqueue and duplicate submission does not requeue. Initial checks exposed an idle/queue timing regression from an asynchronous pre-check and obsolete retry assumptions; corrected before the final passing run. No live provider calls, student rescoring or Groq changes. Frontend conflict retry is build-verified, not a real-browser concurrency test. Files: app.js, evaluator.js, Interview.jsx, evaluator.test.js, integration.test.js.

## 2026-09-21 — Registration email error clarification

User supplied exact error: "Email not confirmed". This indicates pending account email verification, not invalid email syntax. Login.jsx now explains checking the signup confirmation email and Spam/Junk before signing in. It also distinguishes invalid email, email-service authorization restrictions and email rate limits. api.js trims outer whitespace for signup/signin; common.jsx trims email inputs on blur. No confirmation bypass, auth setting changes, account creation or outgoing email performed. User must confirm through their inbox; if email never arrived, investigate sending configuration/resend separately.

Validation: frontend build passed (existing non-blocking bundle warning). Actual inbox delivery and account verification were not tested. No passwords/keys exposed. This supersedes the initial hypothesis that whitespace might explain the reported error.

## 2026-09-21 — Visible signup confirmation instructions

Login.jsx now displays a highlighted notice before registration: use an inbox you can access and confirm your email before signing in. After successful signup, a persistent highlighted panel shows the entered address and three steps (open email/check Spam, click confirmation link, return to sign in). The panel also appears for email_not_confirmed. Password is cleared after signup. No mail-provider settings changed and no emails were sent during development.

Validation: production frontend build passed; existing non-blocking bundle-size warning remains. No real signup/inbox delivery or browser visual test was performed for this copy/UI change. Account verification still requires the student's email link.

## 2026-09-21 — Basic signup without email delivery

User requested removing confirmation notices and using basic database-backed login without new routes/email APIs. Removed pre/post-signup confirmation panels in Login.jsx. Existing email/password Supabase authentication remains; signup captures trimmed name/email/phone and the existing handle_new_user trigger saves them to public.users. api.js returns signup data; when Supabase issues a session, Login immediately opens the authenticated app. If the hosted service still requires confirmation, the UI does not falsely grant access and shows a short contact-GGEC message.

REMAINING EXTERNAL SETUP: In Supabase Authentication > Sign In / Providers > Email, turn Confirm Email off and save. No Supabase management credential/connector is available in this task, so the hosted setting was NOT changed. Existing pending accounts may still require administrator handling; none were modified. Password checks, role isolation and RLS remain. No extra endpoint or SMTP service added. No pretend login based on public contact details.

Validation: all 90 offline tests passed; frontend build passed (existing chunk warning). Actual hosted signup without confirmation remains unverified until the dashboard setting changes. Files: Login.jsx, services/api.js, README.md, read.md.

## 2026-09-21 — Live registration diagnostic requested by user

Performed one signup using the exact browser-configured Supabase URL/anon key and signup metadata shape, a generated password, fictional name/phone and unique reserved example.com address (no real recipient). Public auth settings returned mailer_autoconfirm=false, external.email=true, disable_signup=false. Signup returned HTTP 429 / over_email_send_rate_limit / email rate limit exceeded, with no user or session returned. This confirms the configured hosted project still requires confirmation and its email send quota blocks this request. Did not retry, bypass auth, modify settings, or print credentials. No successful test account creation was observed; server-side partial records were not inspected. Next step remains disabling Confirm Email in that Supabase project, then retesting. Code/build unchanged; no extra build necessary for this diagnostic.

## 2026-09-21 — Basic signup live verification succeeded

After user saved Supabase settings, repeated the authorized single-account registration diagnostic. Public settings now report mailer_autoconfirm=true. Signup succeeded with a generated password and a unique fictional example.com address; Supabase returned a user and authenticated session immediately. A separate email/password sign-in also succeeded, then the diagnostic signed out. No confirmation email required. One diagnostic account named GGEC Registration Diagnostic Test was created and remains; no credentials printed or persisted. This supersedes the earlier pending-dashboard-setup blocker. Verification was through the browser-configured Supabase SDK flow, not a browser UI interaction. No application code changed.

## 2026-09-21 — Duplicate-phone database protection

Added migration 004_unique_phone.sql with an immutable digit-normalization function and partial unique expression index on public.users.phone. Protects signup-trigger inserts and account updates against duplicates, including formatting variants, with database-level concurrency enforcement. Empty legacy values remain allowed. Country prefixes are not inferred; international-format consistency is required. Existing duplicates abort the transactional migration without removing records. Login.jsx explains that a generic signup database failure may be a duplicate phone, without asserting that every provider failure is a duplicate.

Validation: 92 offline tests passed and production build passed (existing chunk warning). New PGlite tests cover insert/update formatting duplicates, empty legacy fields, and safe failure on pre-existing duplicates. Hosted Supabase migration is NOT applied: no management/SQL access is configured. User must run the linked migration in SQL Editor. No new API route or public phone lookup was added. Local demo repository does not implement this SQL uniqueness rule. README includes setup/limitations.

## 2026-09-21 — GitHub source repository

Initialized project Git repository on main and configured origin https://github.com/MANGOpali/GGEC-AI-interview.git at the user's request. Preserved the existing README/setup documentation. Extended .gitignore to exclude installers, temporary probes, verification outputs, local reference PDF, logs and archives alongside existing environment files, keys, student data and dependencies. Initial source set: 94 files. Configured-secret scan and staged credential-pattern scan found no matches. Most recent validation remains 92 passing tests and a successful production build; no application behavior changed for publication. Migration 004 still requires application in hosted Supabase.

## 2026-09-21 — Simplified student study profile to university/course/intake

The student-facing study profile now asks for exactly three fields: university or college name, course, and intake. Account registration fields (name, email, phone, password) were already handled separately in `Profile.jsx`'s account form and are unaffected.

- `apps/server/src/domain.js`: `profileSchema` keeps `university`, `course` and `intake` required (`intake` was previously optional; it is now required with the same two other fields). Every other historical field (`name`, `nationality`, `previous_qualification`, `course_duration`, `tuition_fee`, `scholarship`, `study_gap`, `work_experience`, `funding_details`, `accommodation`, `career_plans`) becomes optional with a default (`''` or `0`) instead of `min(1)`/required, so a payload containing only the three new fields validates. The `scholarship <= tuition_fee` and leaderboard-alias refinements are unchanged and still hold against the defaults.
- `apps/web/src/components/common.jsx`: `emptyProfile` now only seeds `university`, `course`, `intake` and the leaderboard fields. `Field` accepts an optional `label` override (used for "University or college name") without changing its default `label(name)` behavior for every other caller.
- `apps/web/src/components/StudyDetails.jsx`: the form now renders a single "Your studies" section with just the three required fields; the old "About you" and "Your plans" sections and all ten legacy fields (name, nationality, previous qualification, study gap, work experience, course duration, tuition fee, scholarship, funding details, accommodation, career plans) were removed from the UI. The leaderboard opt-in/alias section is unchanged.
- `apps/web/src/components/Dashboard.jsx`: the student greeting used `profile.name`, a field no longer collected; it now reads the account's `user.name` instead, which is always present because it is a required registration field.
- `apps/server/src/llm.js` and `apps/server/src/standards-evaluation.js`: added explicit instructions to the legacy-rubric system prompt, the report-synthesis prompt and the standards-format prompt that a blank or missing profile field means the student was never asked for it, and must be treated as unknown, not as a contradiction, inconsistency or missing-information gap. `relevantProfileFields`/embedding consistency signal already skipped empty fields before this change, so no code change was needed there, only the instruction text the model reasons from.
- Storage (`repository.js`) was already field-agnostic (it stores/returns whatever object it is given), so no migration or repository change was needed. Historical profiles with the old fields are read and written back unchanged: `StudyDetails.jsx` loads the full stored profile into local state and only edits/renders the three visible fields, so saving a historical profile leaves its other stored values untouched. Deleting a profile still removes the whole `student_profiles` row, as before.
- `apps/server/test/integration.test.js`: added `intake: 'September 2026'` to the shared full-profile test fixture (it previously relied on the default `''`, which no longer validates now that `intake` is required) and added a new test, "minimal student profile: only university, course and intake are required", covering: empty body rejected (400), all-blank fields rejected (400), missing `intake` rejected (400), a minimal 3-field payload accepted and echoed back with the legacy fields defaulted (`nationality: ''`, `tuition_fee: 0`), profile GET reflecting the same, and a full session/answer flow completing normally with only the minimal profile.
- No historic interview or session was rescored or touched; no `.env`, key or student data was read, printed or committed.

Validation: `npm run check` passed — 93 offline tests (up from 92) and the production frontend build both passed (existing non-blocking ~304 kB main chunk, no new bundle-size warning). No live provider calls were made for this change; the prompt-wording additions asking the model to treat blank profile fields as "unknown" are validated by schema/test coverage of the surrounding code, not by a live model call, so their effect on actual model output quality is unverified until exercised with a real provider.

Limitations / follow-ups: this change does not touch the counsellor/admin "Students" list or reports, which already tolerate a missing/blank profile field (`Students.jsx` only reads `profile.course`); no admin-facing display of the removed legacy fields was found to need hiding. Existing historical profiles keep their previously entered nationality/tuition/etc. values in storage untouched; there is no bulk-erase or redaction of that legacy data, only a stop to requiring or showing it for students going forward, as requested.
