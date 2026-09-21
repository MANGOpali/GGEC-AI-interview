# GGEC AI Pre-CAS Interview Simulator

For the latest implementation state, scoring rules, test evidence and dated changes, read [read.md](read.md). Future maintainers must follow [AGENTS.md](AGENTS.md) and update that handover after changes.

## Groq free-tier testing

Set `LLM_PROVIDER=groq`, `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b` in `apps/server/.env`, then restart the backend. The Groq adapter validates strict JSON evaluations, includes profile and prior-answer context, and generates follow-ups. It makes no Gemini or embedding calls. Final reports aggregate the evaluated answers locally, avoiding another model request. Rate-limit errors leave the answer unscored; no paid-provider fallback is used.

Set `AUTO_EVALUATE_EXISTING=false` to avoid automatic backfilling of old demo attempts at startup. Newly submitted answers still use the configured provider. Keep keys server-side; never include `.env` in a shared archive.

## OpenAI / GPT provider (active)

Set `LLM_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-5.5`) in `apps/server/.env`, then restart the backend. `OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`; set it only for an OpenAI-compatible gateway. The adapter reuses the same strict JSON evaluation, profile/prior-answer context and local report aggregation as Groq, and sends `max_completion_tokens` only (`temperature`/`reasoning_effort` are omitted for reasoning-model safety). Confirm the exact model id for your account and that it supports structured outputs. Rate-limit or invalid responses leave the answer unscored; there is no automatic provider fallback. This path has not been verified against a live OpenAI account — run a real evaluation before relying on it, and rotate any key that was shared in chat.

A runnable React + Vite + Tailwind frontend and Express backend for Global Gate Educational Consultancy. The original HTML was used only as a reference for the workflow; its keyword scoring, fake rankings and hard-coded report have not been carried over.

## Start locally — no accounts or API keys required

Install Node.js **22.12+** (tested with Node 24). From this project folder:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. The API listens on **127.0.0.1:3001**. If port 5173 is occupied, stop the conflicting process instead of using another origin without updating `WEB_ORIGIN`.

The default is an explicitly labelled, **local-only demo**. Select Student, Counsellor or Admin in the banner. Enter fictional profile details, save the profile, accept the test-session consent, and answer the interview by typing or using a supported browser microphone. Open **Profile** to update your account or resume a saved attempt. The seeded demo counsellor is assigned to the first demo student.

- Profiles and attempts persist in `apps/server/data/demo.json`.
- Profile fields and per-session profile snapshots use AES-256-GCM; the local key is generated in `apps/server/data/demo.key`.
- Demo files and keys are ignored by Git. Do not put real student data in demo mode.
- **AI is disabled by default.** Transcripts are real and persistent; evaluations and overall scores remain unassigned. No simulated AI scores are presented as real.
- Demo is refused with `NODE_ENV=production` and always binds to loopback. Never expose it through a public tunnel or proxy.

## What is implemented

| Area            | Behavior                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication  | Supabase email/password signup with name and phone, confirmation and sign-in; trusted server token verification; Student/Counsellor/Admin authorization                                          |
| Profiles        | Create, read, update, delete; all requested fields; financial amounts in GBP; encrypted storage and immutable per-attempt snapshots                                          |
| Question bank   | Staff CRUD; categories, expected concepts, weight, verified source context, active/main toggles, optional per-question time limit; ships with the Pre-CAS set — 10 asked main questions and 139 staff-visible reference questions (`apps/server/src/questionBank.js`) |
| Interview       | Explicit consent before creation; state machine; typed answers, browser STT, TTS; saved transcripts; resume; bounded follow-ups; per-question countdown (main 2:00, follow-up 1:00) that auto-stops recording while the student still submits manually |
| AI              | Swappable provider interface; OpenAI-compatible, Groq and Gemini structured-output adapters; schema validation; full profile, question and prior Q&A context                                              |
| Reports         | Weighted rubric/category aggregation, readiness, strengths, weaknesses, missing information, possible contradictions, recommendations and question references; JSON download |
| Staff           | Assigned-student profiles and attempt history; transcript and private evaluator-note review; retention holds                                                                 |
| Admin           | All-student scope, counsellor assignments and recent access audit events; staff roles provisioned by trusted SQL                                                             |
| Leaderboard     | Explicit profile opt-in; public alias only; best fully evaluated completed score; immediate opt-out                                                                          |
| Data protection | Fail-closed authorization, UUID-validated route ids, explicit-origin CORS (wildcard refused), request validation, rate limiting, Helmet, encryption, audited staff reads, optimistic concurrency and transactional SQL writes             |
| Retention       | Runnable cleanup command and optional pg_cron schedule; configurable age; holds respected; expired unfinished attempts closed                                                |

Categories are editable labels on questions. Their lifecycle is managed by editing/deleting those questions; there is no separate category entity. Use the same question weight across a category to change its contribution. Question snapshots mean changes only affect new interviews.

### Student workspace and resources

Students sign up with name, phone and email, then land on **Start Interview**. Their sidebar is **Profile · Start Interview · Templates · Research Methods**. The Profile page holds editable account details (name and phone; email is read-only), a change-password form that re-checks the current password, the list of saved attempts (resume from here) and the study-details form.

Templates and Research Methods are admin-authored content. Admins manage them on the **Resources** page (create, edit, delete, publish/hide and order) and can insert from nine built-in starter presets before editing. The server validates resources and publishes only active entries to students. Phone capture and the `resources` table require migration `002_phone_resources.sql`. Each question is timed: main questions default to 2:00 and follow-ups to 1:00, recording auto-stops at zero, and the timer never changes a score (over-time answers still score normally). Counsellors/admins can override the main-question limit per question; this requires migration `003_question_timers.sql`. See `read.md` for the preset list, authorization rules and limitations.

## Connect a real Supabase project

1. Create a Supabase project. In its SQL editor execute `supabase/migrations/001_initial.sql` **once on a fresh project**, then `supabase/migrations/002_phone_resources.sql` (adds `users.phone`, updates the signup trigger and creates the `resources` table), then `supabase/migrations/003_question_timers.sql` (adds the nullable `questions.time_limit_seconds` column). No secrets belong in SQL or source control.
2. Copy `apps/server/.env.example` to `apps/server/.env` and set:

   ```dotenv
   APP_MODE=supabase
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
   DATA_ENCRYPTION_KEY=YOUR_GENERATED_BASE64_KEY
   WEB_ORIGIN=http://localhost:5173
   ```

   Generate a key locally and place its output directly in the server environment:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Keep that key stable and back it up in your secret manager. Loss prevents profile decryption. Rotation requires a controlled decrypt/re-encrypt migration; automatic key rotation is not implemented.

3. Copy `apps/web/.env.example` to `apps/web/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and public/anon key. **Never prefix a service-role key or Gemini key with `VITE_`.** The server’s unused anon-key example is optional; server authentication uses `getUser(token)` with its server client.
4. Configure Supabase Auth site URL and permitted redirect URLs for your frontend. Enable email/password and configure your email delivery/confirmation settings. New registrations always receive the Student role; client metadata cannot promote a user.
5. Seed the question bank from the server folder:

   ```sh
   cd apps/server
   node --env-file-if-exists=.env src/seed.js
   ```

   Existing seeded questions are preserved, so rerunning does not overwrite staff edits.

6. Register accounts, confirm their emails, then promote staff through trusted SQL using actual account IDs:

   ```sql
   update public.users set role = 'admin' where id = 'ACTUAL_AUTH_USER_UUID';
   -- Or role = 'counsellor' for counsellors.
   ```

   Use Administration in the app to assign students to counsellors. No self-service staff promotion endpoint exists.

7. Restart the app. Verify Student A cannot access Student B, and that counsellors see only their assignments before onboarding real students.

### RLS and API access design

Every table has RLS enabled. Scoped policies encode student ownership, counsellor assignment and admin access. **Browser `anon`/`authenticated` roles deliberately have no direct table privileges or write-RPC privileges.** All data operations go through Express. This enforces audit logging and ensures students never receive private evaluator notes.

The backend service role bypasses RLS; therefore its explicit verified-user and assignment checks are security-critical. Directly adding browser table grants would defeat the private-note redaction and audited-read boundary. Do not do that. Browser signup uses Supabase Auth only.

Core tables: `users`, `student_profiles`, `assignments`, `questions`, `interview_sessions`, `interview_answers`, `reports`, `access_logs`, `resources`. Flexible profile fields and evaluation/report content use JSONB. Session writes use one SQL transaction and a version check; answers and reports are separate relational records. Local demo storage implements the same repository interface with atomic file replacement.

## Enable Gemini evaluation

Set server-side environment variables:

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=YOUR_SERVER_ONLY_KEY
GEMINI_MODEL=AN_AVAILABLE_MODEL_ID_FROM_YOUR_ACCOUNT
```

Choose an available model for your Google account and confirm its data-use terms, regional availability, quotas and suitability for student data. Hosting and API free-tier availability are not assumed or guaranteed.

The Gemini adapter uses REST `generateContent`, structured JSON output and a 25-second timeout per request. All output is validated with Zod. An unavailable provider or invalid response preserves the transcript, leaves the answer unscored and displays a warning. Such an attempt receives no overall score or leaderboard entry until evaluation completes. Newly failed evaluations can enter the in-memory deferred queue after the transcript commits. Historical demo attempts are not backfilled at startup when `AUTO_EVALUATE_EXISTING=false`. See `read.md` for queue limitations and the active OpenAI setup.

The model evaluates meaning, not word counts or keyword hits. It receives the full encrypted-at-rest profile after server-side decryption, the current question, expected concepts, verified context and all prior Q&A. It may ask **one dynamic follow-up per main question**. Follow-ups cannot recursively expand indefinitely. Answers and questions are treated as untrusted prompt content.

Accuracy is always forced to `null` unless staff supplied both verified context and a source URL. The app does not verify source URLs or fetch live university facts. Staff must maintain that evidence. Inapplicable metrics are nullable. Text cannot establish actual confidence or memorization: `formulaic_indicator` is explicitly uncertain. Internal notes are short evidence summaries, not chain-of-thought, and are stripped from student responses.

### Scoring defaults

Rubric `ggec-rubric-v2` uses explicit criterion weights, renormalizes optional null criteria, requires four core scores and applies caps to irrelevant answers. Main and follow-up answers share the main question's weight. Overall scores are issued only when all answers are evaluated and every main question is answered. Default readiness thresholds: **75+ Ready**, **50–74 Needs Practice**, **below 50 Not Ready**. The full formula and weights are in [read.md](read.md) and `apps/server/src/scoring.js`. These practice defaults require counsellor calibration.

Missing and contradictory information comes from contextual evaluations. Groq and OpenAI reports aggregate locally with no extra model request. Gemini can supply additional narrative; the API always preserves deterministic score arithmetic when merging that narrative. Historical reports are not silently rescored.

## Service boundaries and state flow

```text
React screens → api service → Express routes → domain logic → repository
                    │                              │
             Supabase Auth                   LLM provider
React screens → speech / voice services       (disabled | OpenAI | Groq | Gemini)
```

- `apps/web/src/services/speech.js`: `transcribeAudio()` and voice adapter. UI never calls browser speech APIs directly.
- `apps/web/src/services/api.js`: HTTP and Supabase Auth boundary; UI never calls Supabase directly.
- `apps/server/src/llm.js`: `evaluateAnswer()` and `generateFollowUp()` provider. Replace this adapter to change model provider.
- `apps/server/src/repository.js`: local file or Supabase persistence.
- `apps/server/src/domain.js`: validations, questions, progression and report aggregation.
- `apps/web/src/services/machine.js`: recording, transcript and submission transitions.

```text
PROFILE → CONSENT → MAIN_QUESTION → RECORDING → TRANSCRIPTION
                                  ↘ typed answer ↗
TRANSCRIPTION → EVALUATION → FOLLOW_UP or NEXT MAIN_QUESTION → REPORT
```

Durable server states are `MAIN_QUESTION`, `FOLLOW_UP`, `REPORT`, `EXPIRED`; recording/transcription/evaluation states are transient client states. The final report is produced in the same atomic answer commit. Version conflicts protect against concurrent requests. Repeated request IDs return the already-saved result. Unsaved drafts are intentionally not placed in browser storage; they are lost if you navigate away or reload before submitting.

## Audit and retention operations

Staff profile, attempt-list and transcript reads write an audit event before the API returns the data. Administrators can inspect the most recent 100 events. Review-hold changes are also audited. No request-body or token logging is enabled.

Configure `RETENTION_DAYS` (default 90), then run from the project root:

```sh
npm run retention -w apps/server
```

This removes old raw transcripts, per-answer evaluations and sensitive report narrative lists, clears session profile snapshots, and expires unfinished attempts. Aggregate scores and static question references remain. Held sessions are excluded. The age is measured from the session start date. Profile deletion removes the current profile and leaderboard participation; historic encrypted snapshots follow interview retention.

For automatic Supabase cleanup, enable **pg_cron** in the dashboard, then execute `supabase/retention-cron.sql` once. Edit its period directly if needed: the cron SQL does not read the Node environment. Alternatively schedule the Node command on your own trusted runner. A schedule is supplied but **not installed remotely by this build**.

Current profiles, identity records, aggregate reports, audit logs and database backups have separate lifecycle needs. Full account erasure, backup expiration, encrypted-key rotation and hold governance require an operator policy; they are not automated here. Audio upload/storage is intentionally absent because the selected STT flow only needs transcripts.

## Deploy

### Frontend (Vercel or another static host)

- Project root: this repository; install: `npm ci`; build: `npm run build`.
- Output: `apps/web/dist`.
- Set browser environment values plus `VITE_API_URL=https://YOUR_API_HOST` (without `/api`).
- All frontend environment values are public. Do not place secrets there.

### Backend (Render/Railway or another Node host)

- Install from repository root: `npm ci`; start: `npm start`.
- Set `NODE_ENV=production`, `APP_MODE=supabase`, the secret server environment values, and `WEB_ORIGIN=https://YOUR_FRONTEND_HOST`. `WEB_ORIGIN` must list explicit origins; a wildcard `*` is refused at startup.
- Use the host-provided `PORT`; set `HOST=0.0.0.0` (or leave it unset in Supabase mode).
- Set `TRUST_PROXY_HOPS` only for the actual number of trusted reverse proxies in your hosting topology. It defaults to 0.
- Health endpoint: `/api/health`. Use HTTPS for real deployment and browser microphone access.
- Set up retention scheduling, secure backups, email delivery, monitoring and secret management before onboarding students.
- Work through the **Deployment security checklist** in [read.md](read.md) before real student data (key rotation, migrations, production environment, HTTPS, Auth URLs, single replica, proxy hops, test-account cleanup and key backup).

This is a tested implementation and deployment scaffold, **not a claim that an unconfigured project is ready to hold production student data**. Live Supabase Auth/PostgREST, live Gemini, speech permissions and hosted operations need verification with your accounts. Rate limits and local-demo locking are per-process; use a shared rate-limit store and server-side pagination/filtering for larger deployments. Supabase listing fetches pages, but staff authorization/aggregation currently occurs in application memory.

## Verification

```sh
npm test
npm run build
npm run check
```

Tests exercise a full 11-question transcript-only vertical slice (from a test fixture independent of the shipped bank), encryption, access isolation, staff restrictions, note redaction, answer idempotency, provider context, follow-up limits, per-question time limits and over-time flagging, provider failures, question CRUD, resource visibility/authorization, account/phone updates, UUID route validation, wildcard-origin rejection, starter preset shape, report/leaderboard rules and retention holds. A PGlite PostgreSQL test executes the migration, signup trigger, transactional save RPC, grants, RLS and retention. It stubs only the Supabase `auth` schema/roles; it does not replace a live Auth/PostgREST integration test.

Browser checks covered the dashboard, profile save, consent gating, answer submission and interview progression with fictional data. Browser STT/TTS adapters are implemented; actual microphone capture and live AI have not been exercised with user credentials.

## Reference documentation

- [Supabase server-side user verification](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)

## Commands and API summary

| Command                            | Purpose                               |
| ---------------------------------- | ------------------------------------- |
| `npm run dev`                      | Local API and Vite frontend           |
| `npm run build`                    | Production frontend bundle            |
| `npm start`                        | Express API only                      |
| `npm test`                         | Domain/API/database integration tests |
| `npm run retention -w apps/server` | Run configured transcript cleanup     |

Authenticated API paths include `/me` (GET/PUT for name and phone), `/profile`, `/questions`, `/resources`, `/sessions`, `/sessions/:id/answers`, `/sessions/:id/evaluation`, `/sessions/:id/evaluate`, `/sessions/:id/review-hold`, `/students`, `/users`, `/assignments`, `/audit`, `/leaderboard`. See `apps/server/src/app.js` for request schemas and method-specific authorization. Invalid input is rejected; invalid route identifiers return 400; server failures return generic messages without secrets.


## Evaluation progress and retry

Open a completed interview report to see saved-answer progress. Use **Evaluate answers** or **Retry remaining answers** when offered. Successful scores are preserved. A quota/provider failure stops the batch and offers retry after a minimum one-minute cooldown. Keep the backend running to process jobs; leaving the page is safe.

Job intent and individual answer scores persist in the session's existing JSON data in demo and Supabase modes. Startup resumes previously queued/running jobs for the same provider, even with `AUTO_EVALUATE_EXISTING=false`; that setting still prevents backfilling unrelated historical demo attempts. No new SQL migration is needed. Deploy **one backend replica** until distributed job leases and a shared quota scheduler are added. A provider call interrupted before its result commits may be repeated after restart.

For offline UI checks, `node scripts/preview-fixtures.js` serves an isolated fictional app at port 5174, with simulated quota failure and retry. It makes no real model calls. See `read.md` for current test evidence and the user-confirmed microphone check.


## Scoring comparison, references and focused practice

- **Counsellor/Admin → Scoring comparison:** choose a completed assigned attempt, rate the answer independently and then see its AI comparison. Read [CALIBRATION.md](CALIBRATION.md) before gathering a benchmark. Real counsellor ratings are required; the software alone does not establish scoring accuracy.
- **Question bank → Edit → Verified course reference:** attach an official HTTPS source with university/course/intake, check/review dates and relevant facts. Fill the matching intake in the student's profile. References are attached per question and saved inside the existing context column using a versioned format. No SQL migration is needed. New sessions reject expired or mismatched reference evidence; old snapshots remain unchanged.
- **Student → Overview:** history distinguishes full interviews from category practice and shows scoring versions. **Practice interview → Practice focus** starts a short category session with consent. Weak-area report buttons offer the same path. Category sessions are excluded from the leaderboard.
- Completed reports explain the arithmetic, show reference provenance and offer example answer structures. Placeholders need truthful student details; they are not ready-made factual answers. No additional model calls are needed for these structures.

### Diagnosing a slow GPT gateway

Run `node --env-file=apps/server/.env scripts/diagnose-provider.mjs` from the project root for one real, potentially billable fictional scoring request. It prints safe response metadata and validation status, never credentials or student answers, and writes no interview data. It is separate from offline tests.

On 2026-09-17 the configured CodeGate GPT-5.5 route passed this test but needed about 100 seconds for one answer. Direct OpenAI remains untested. The adapter allows 180 seconds by default (`OPENAI_TIMEOUT_MS` overrides this). Reports preserve each completed score; use the report's evaluation retry control for missing scores. New failures distinguish timeout, provider credit/access/request rejection and invalid output. Existing historical generic failures cannot reveal their original cause.

### Parallel background scoring

Completed-interview background scoring uses up to three simultaneous answer requests with the OpenAI-compatible provider, starting requests at least three seconds apart. Groq/Gemini stay sequential. Scores save as they finish, and the report completes after all answers are evaluated. A provider error stops new requests while already-started responses are saved; retry processes only missing scores. Live answer scoring/follow-ups retain their existing flow. Run one backend replica. No database migration or environment change is required; restart a production backend to load the worker update.

### Cost and latency plan — 2026-09-18

Implemented: production submissions save transcripts without waiting for AI. After the final answer commits, the existing worker evaluates missing answers (three concurrently for OpenAI). Fast interviews use main questions without new live AI follow-ups; an already pending historical follow-up can still be answered. Requests retain full consistency context. Background prompts disable unused follow-up generation and ask for <=35-word feedback, <=25-word evidence reasoning and at most two missing/contradiction items each. These are prompt targets, not guaranteed provider output limits. The report shows three prioritized improvements (weakest scored answers first), with existing long text previewed at 35 words and complete details expandable. Historical stored feedback is preserved.

Cost controls: parallelism changes latency, not token pricing. No extra final-report call for OpenAI; retry only missing scores. Removing follow-up evaluation calls reduces request count compared with a run that generated follow-ups, but no fixed percentage saving is claimed. Output brevity should reduce billed output tokens; measure with real usage before promising savings. Next optional work: record aggregate input/output usage per job without transcript logging, compare a cheaper model against counsellor ratings, then consider smaller context or batching only after accuracy and recovery tests. Do not trim earlier answers blindly because contradictions depend on them. No new paid diagnostic or historical rescoring in this change.

### Question angles and practice sub-questions

See QUESTION_BANK.md for the complete curated companion catalog: 10 main topics, 40 alternative main wordings and 30 related sub-questions. New interviews choose one random angle per unchanged built-in main question, and snapshot its wording and scoring focus. Sub-questions are optional self-practice in the expandable bank before starting an interview. They do not incur AI calls or add interview questions. Staff can view the same bank next to question CRUD. Variants live in apps/server/src/questionAngles.js; the existing database still has 149 rows. Changing a built-in main question's text/category disables its automatic variation; custom questions keep their own wording. No migration needed. Random repeats between attempts are possible.

New full interviews place the Introduction topic first and shuffle the remaining topics. The chosen order is saved for resume. Category-focused practice retains its category filter; existing interviews are unchanged.

## Groq Whisper speech recognition

Backend .env:

```env
STT_PROVIDER=groq
GROQ_STT_MODEL=whisper-large-v3
GROQ_API_KEY=your_private_key
```

Restart the backend and refresh the browser. Leave LLM_PROVIDER unchanged to keep GPT scoring. Health should show stt=groq. Use HTTPS in deployment (localhost works for development). Students accept audio consent, record, press Stop, review the returned text, then submit. Text appears after Stop, not word by word. A retry button retains failed audio only while the page stays open; refresh/navigation loses it. GGEC does not persist raw audio; the reviewed submitted transcript follows normal retention. Groq receives the recording. Set STT_PROVIDER=browser and restart/refresh to restore the old browser recognition explicitly.

Audio limits: 8 MiB, 15 minutes client-side, existing shorter per-question timers; supported browser recording containers WebM/MP4/Ogg (WAV also accepted by API). One active upload per student, three globally per backend process, 20 attempts per student per ten minutes. No automatic billable retries. The server checks signatures and returned duration but does not decode audio before sending to Groq. Keep one backend replica; distributed limits/budgets remain future work. Keys must never enter VITE_ variables.

Live check on 2026-09-20: one short synthetic WAV succeeded in 443ms. This is not evidence of accuracy for Nepali-accented English; test representative students before relying on transcription quality.

## New authored-standards format

See [STANDARDS_SETUP.md](STANDARDS_SETUP.md) to configure the 19-question interview (7 majors, up to 9 crosses, and extras filling the remaining slots) and 60/20/10/10 scoring. It stays disabled until staff author the required standards and an admin enables it. Existing attempts keep their original format.

Background scoring starts after each submitted answer is saved. Students continue answering while the existing worker pool evaluates available answers; the final report is completed after the interview. Provider failures retain saved answers and successful scores for retry.

## Basic signup without confirmation emails

For the requested basic email/password registration, turn **Confirm Email** off in Supabase **Authentication > Sign In / Providers > Email**, then save. This is a hosted project setting; changing frontend code does not disable it. No SMTP integration or additional application API route is needed. The signup form saves name/email/phone through the existing database trigger and opens the app when Supabase returns a session. Passwords remain managed by Supabase Auth. Existing pending accounts may need administrator handling. This dashboard setting has not been changed by the coding task.

## Unique phone numbers

Apply `supabase/migrations/004_unique_phone.sql` in Supabase SQL Editor to enforce unique non-empty phone numbers. It removes non-digit formatting for comparison, protects inserts and updates atomically, and allows empty legacy numbers. It does not infer country codes: use consistent international phone numbers. Existing duplicates cause migration failure; review them manually without deleting accounts automatically. The hosted migration has not been applied by this task. Supabase signup may mask trigger errors as a generic database error, so the signup UI says a duplicate phone is a possible cause, not a confirmed cause.
