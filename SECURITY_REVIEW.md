# Security review — 20 September 2026

## Summary

Source-level review and offline tests; not a penetration test or production security certification. No authentication bypass or cross-student data disclosure was identified in the reviewed code. This does not establish that a deployed environment is secure.

## Findings requiring attention

1. **High — previously disclosed API credentials.** Earlier conversation included provider keys. Rotation cannot be established from source inspection. Revoke/replace any still-active disclosed keys in the issuing provider account. Do not paste replacements into chat. No keys rotated or account settings changed by this review.
2. **Medium — paid AI usage has no per-account daily budget.** API has per-IP request limits and bounded worker concurrency, but repeated completed interviews can still consume provider credit. Add persistent per-student daily evaluation allowances, a global spend/request budget, queue bounds and administrator visibility before broad public signup. In-memory limits reset on restart and are not shared across replicas.
3. **Medium — third-party processing assurance remains unverified.** Current scoring route uses a reseller gateway and sends profile context and transcripts. Source code cannot verify gateway retention, subcontractors or underlying model identity. Verify provider handling terms and the consent disclosure before using sensitive real-student data. Browser speech also may use a browser-vendor service.
4. **Operational — production configuration not independently audited.** SQL migrations revoke browser table grants and restrict write/purge RPCs, but this review did not query live grants, backup access, auth signup/email/rate-limit settings, HTTPS, firewall or hosting headers. Backend defaults to all interfaces in Supabase mode; use HOST=127.0.0.1 for a local-only workstation, or a firewall/reverse proxy for deployment. Only run one backend replica with the current job architecture.
5. **Privacy boundary — encryption scope.** Profiles and session profile snapshots use AES-256-GCM. Answer transcripts and reports are ordinary database JSON, not separately encrypted by the application. Protect database/service-role access and backups; verify retention cleanup is scheduled. Deleting a profile does not delete historic interview snapshots/transcripts: use an explicit account-data erasure process if that is required.

## Fixed in this review

- Extended .gitignore to cover .env.* (except .env.example), key files and work/. Existing .env and server runtime data exclusions remain. Ignore rules do not remove files already tracked or previously shared.
- Replaced body-parser malformed-JSON errors with a fixed safe message, preventing request fragments from appearing in error responses. Added a fixed oversized-request message and regression test.

## Checks performed

- npm audit --omit=dev and npm audit both reported zero known vulnerabilities for the installed lockfile at review time.
- Compared configured server secret values against 89 non-runtime source/build files: no matches. No values printed. Runtime data, .env files, node_modules and work were intentionally excluded. This is an exact-match check of currently configured secrets, not exhaustive historical credential discovery.
- Reviewed Express authentication/ownership/assignment checks, role-protected staff/admin routes, error handling, Helmet/CORS/body limits, repository writes, SQL RLS/grants/RPC restrictions, browser token handling, encryption implementation and production serving.
- Supabase authentication validates bearer tokens server-side; demo roles are disabled in production. SQL signup does not accept a role from user metadata. React renders content as text; no dangerous raw HTML injection found in searched application sources.
- Existing tests cover access isolation, role escalation, student note redaction, idempotency, retention and PostgreSQL migration/grant behavior. See read.md for the final test/build result.

## Recommended order

1. Rotate exposed keys if still active.
2. Add per-user and global AI cost limits.
3. Verify deployed Supabase permissions, auth settings, HTTPS/firewall, backups and retention schedule.
4. Review provider data handling and implement a complete account-data erasure workflow.

No student records were changed, no live AI calls were made and no external messages were sent during this review.

Final validation: 76 offline tests passed and production build passed. Existing bundle-size warning remains.
