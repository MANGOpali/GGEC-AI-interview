import { useState } from 'react';
import { api } from '../services/api';
import { Button, Title, label, date } from './common';
const metrics = [
  'relevance',
  'consistency_with_profile',
  'completeness',
  'clarity_communication',
  'course_knowledge',
  'university_research',
  'financial_knowledge',
  'career_credibility',
  'accuracy',
];
export default function Calibration({ sessions, run }) {
  const [id, setId] = useState(''),
    [data, setData] = useState(null),
    [draft, setDraft] = useState({}),
    [type, setType] = useState('other'),
    [busy, setBusy] = useState(false);
  async function load(value) {
    const result = await run(() => api(`/sessions/${value}/calibration`));
    if (result) {
      setId(value);
      setData(result);
      setDraft({});
    }
  }
  const next = data?.answers.find((a) => !a.reviewed),
    c = data?.comparison;
  return (
    <>
      <Title
        title="Compare AI and counsellor scores"
        eyebrow="SCORING CALIBRATION"
        description="Score independently before revealing the AI comparison. Use several strong, weak and contradictory answers. This does not change student scores."
      />
      <p className="alert">
        For an independent assessment, choose an attempt whose AI report you have not already read.
        Scores are locked after submission.
      </p>
      <label className="field">
        Completed attempt
        <select value={id} onChange={(e) => load(e.target.value)}>
          <option value="">Choose an attempt</option>
          {sessions
            .filter((s) => s.state === 'REPORT')
            .map((s, i) => (
              <option key={s.id} value={s.id}>
                {date(s.started_at)} - Attempt {i + 1} ({s.id.slice(0, 8)})
              </option>
            ))}
        </select>
      </label>
      {data && (
        <section className="card">
          <details>
            <summary>Profile and question reference context</summary>
            <dl>
              {Object.entries(data.profile)
                .filter(([k]) => !k.startsWith('leaderboard'))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
            {data.questions.map((q) => (
              <p key={q.id}>
                {q.text}: {q.verified_context || 'No verified factual context'}
              </p>
            ))}
          </details>
          {next ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const ok = await run(async () => {
                  await api(`/sessions/${id}/calibration/${next.id}`, 'POST', {
                    sample_type: type,
                    metrics: Object.fromEntries(
                      metrics.map((k) => [
                        k,
                        draft[k] == null || draft[k] === '' ? null : Number(draft[k]),
                      ]),
                    ),
                  });
                  return true;
                });
                if (ok) await load(id);
                setBusy(false);
              }}
            >
              <h2>{next.question}</h2>
              <p className="transcript-text">{next.transcript}</p>
              <p>
                0 absent/irrelevant; 1-2 seriously weak; 3-4 limited; 5-6 adequate; 7-8 specific and
                supported; 9-10 exceptional. Leave optional criteria blank when inapplicable.
              </p>
              <label className="field">
                Sample type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {['strong', 'weak', 'contradictory', 'other'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                {metrics.map((k, i) => (
                  <label className="field" key={k}>
                    {label(k)}
                    {i < 4 ? ' (required)' : ''}
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      required={i < 4}
                      value={draft[k] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <Button disabled={busy}>Save independent assessment and reveal comparison</Button>
            </form>
          ) : (
            <p>All answers in this attempt have your assessment.</p>
          )}
        </section>
      )}
      {c && (
        <section className="card">
          <h2>Paired comparison</h2>
          <p>
            {c.paired} paired answers. Mean absolute difference:{' '}
            {c.mean_absolute_difference ?? 'Not available'}/100. Mean AI minus human:{' '}
            {c.mean_ai_minus_human ?? 'Not available'}. Positive means AI scored higher.
          </p>
          <p>
            Small samples do not establish accuracy. Review disagreements before changing rubric
            weights.
          </p>
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Type</th>
                <th>Counsellor</th>
                <th>AI</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.answer_id}>
                  <td>
                    {r.question}
                    <details>
                      <summary>Criteria comparison</summary>
                      {Object.entries(r.criteria).map(([k, v]) => (
                        <p key={k}>
                          {label(k)}: counsellor {v.human ?? 'N/A'}, AI {v.ai ?? 'N/A'}
                        </p>
                      ))}
                    </details>
                  </td>
                  <td>{r.sample_type}</td>
                  <td>{r.human}</td>
                  <td>{r.ai ?? 'Not evaluated'}</td>
                  <td>{r.difference ?? 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
