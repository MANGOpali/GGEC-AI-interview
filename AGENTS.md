# Continuation instructions

Before changing this project, read `read.md` (current handover and change log) and `README.md` (setup and operations).

After every functional/configuration change, update `read.md` in the same work session with: date, affected files, behavior, validation actually performed, failures/limitations, and next steps. Never mark an untested integration as verified. Keep existing entries; add new dated entries rather than erasing history.

Never print, commit or package `.env`, API keys, encryption keys or student data. Keep providers behind interfaces. Do not replace semantic model evaluation with keywords. Deterministic code owns scores. Keep absence of evaluation distinct from a real zero score. Do not silently rescore historical attempts or send them to another provider.

Run relevant tests and the frontend build for changes to interview/evaluation flow. `npm run test:live` uses real Groq quota (at most four calls) with fictional isolated data; only run when live verification is requested or necessary and authorized. Normal `npm test` must remain offline.
