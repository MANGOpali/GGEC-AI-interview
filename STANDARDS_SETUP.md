# Set up the 19-question interview

The code is ready, but the new bank starts as a draft. GGEC must supply the marking standards before enabling it. Existing interviews keep their saved format and marks.

## Dashboard setup

1. Sign in as staff and open **Question bank → 19-question interview standards**.
2. Add at least **7 major questions**, including exactly one marked Introduction. You can copy wording from the existing library; write your own standard points.
3. Add exactly **5 active cross-questions per major**, linked to that major. Each needs its own standard points.
4. Add at least **3 extra questions**, with their own points.
5. For each point, enter its required meaning, optional accepted alternatives, and relative weight. Avoid requiring one memorized sentence or one fixed order.
6. An admin sets the grammar allowance (default 20%) and enables the format once the readiness checklist passes.

Minimum authored bank: **45 questions (7 major + 35 cross + 3 extra)**. Each full interview draws **19: 7 majors + 0–9 crosses + enough extras to fill 12 remaining slots**. With only three ready extras, nine crosses are required. Add five extras to allow seven crosses; add twelve extras to allow no crosses. More complete major groups and extras can be added. Disabling the format allows incomplete draft edits; changes never alter existing interview snapshots.

## Selection and timing

Introduction always comes first. Other major/extra blocks shuffle. Each major may have 0–3 of its five cross-questions. Selected crosses immediately follow their parent. The total cross count is randomly chosen from max(0, 12 minus ready extra count) through 9; extras fill the remaining slots without duplication. For example: 9 crosses + 3 extras, 8 + 4, or 7 + 5. A major can have no crosses. Exact repetition of the same student's latest full sequence is prevented; global uniqueness across all students is not guaranteed. Saved order survives resume. Future question wording is hidden from students until reached.

Major answers target at least two minutes; shorter submissions are accepted with a duration flag. Longer major/extra answers are allowed up to a 15-minute recording safety limit. Cross-question recording stops at one minute; students should finish before then. Extra answers may be shorter when complete. Duration never changes marks. Recorded duration comes from transcription metadata carried by the client: it is informational, not tamper-proof evidence. Typed answers have no verified spoken duration.

## Marking

| Component | Weight |
| --- | ---: |
| Required standard points | 60% |
| Fluency / clarity of expression | 20% |
| Grammar | 10% |
| Overall correctness | 10% |

AI returns evidence and full (1), partial (0.5), or no (0) credit for every authored point. Equivalent wording, reordered points and suitable alternative examples are accepted. Code computes weighted point coverage and the final mark. Missing points do not automatically zero the whole answer: clarity, grammar and correctness still contribute.

The grammar allowance means the percentage of transcript sentences containing a grammatical error, not the percentage of words. At or below the allowance, grammar receives 10/10. Above it, grammar = 10 × (100 − error percentage) / (100 − allowance). For example, at a 20% allowance and 60% error rate, grammar is 5/10. Sentence splitting and error identification are estimates, particularly for unpunctuated speech transcripts.

Pace and accent are not marked. Current English assessment uses the submitted transcript, which students can correct. It cannot independently verify spoken fluency, pronunciation, pauses, or transcription errors. Correctness is assessed against supplied standards, profile and context; it is not external fact verification. Validate the rubric with counsellor-marked sample answers before relying on its marks.

A major and its crosses share the major's report weight so receiving more crosses does not increase that topic's influence. Extras have their own weights. Background evaluation, progress and retry continue to work; concise point-level feedback appears in reports.

## Developer handover

- `standards-bank.js`: schema, readiness, revision checks, selection and immutable snapshots.
- `standards-evaluation.js`: provider response schema, prompt, sentence-based grammar and deterministic scoring.
- `StandardsBank.jsx`: staff authoring and admin settings.
- Version: `ggec-standards-v3`. Older `ggec-rubric-v2` sessions retain legacy behavior. Category-focused practice still uses the legacy library.
- Supported new-format adapters: OpenAI-compatible and Groq. Gemini activation is blocked until its structured adapter supports this rubric.
- Storage uses a reserved inactive `resources` record containing the versioned bank JSON. Existing resources migration is required; no additional migration is needed. Generic resource routes hide/protect this record. Bank routes require staff access; enabling and allowance changes require admin access.
- Run one backend process/replica: revision checks serialize edits within that process, not across distributed replicas.
- The old nine-criterion scoring-comparison form rejects v3 attempts; a dedicated v3 counsellor comparison form remains future work.
- Offline visual fixture: `node scripts/preview-standards.js` runs an isolated fictional bank on API 3003 / UI 5175 without real provider calls or student records.

## Verification (2026-09-20)

88 automated tests passed and the frontend production build passed. Tests cover 19-question selection, cross links/counts, sequence variation, snapshot preservation, partial credit, grammar arithmetic, staff/admin restrictions, hidden future questions, revision conflicts and legacy regressions. Browser checks confirmed the new consent copy, Introduction first and dashboard categories/settings. One fictional answer returned valid point-level output through the configured GPT gateway; this verifies compatibility, not assessment accuracy. The build retains a non-blocking bundle-size warning (~528 kB minified).
