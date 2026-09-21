import { useEffect, useState } from 'react';
import { api } from '../services/api';
export default function Coaching({ session }) {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api(`/sessions/${session.id}/coaching`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session.id, session.report?.evaluated_answers]);
  return (
    <section className="card">
      <h2>Improve your next answer</h2>
      <p>
        These are example structures, not facts about you or scripts to memorise. Replace brackets
        with your own truthful details and checked sources.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.items.map((a) => (
        <details key={a.answer_id}>
          <summary>{session.answers.find((x) => x.id === a.answer_id)?.question_text}</summary>
          <p>{a.feedback || 'No AI feedback is available yet.'}</p>
          <blockquote>{a.example}</blockquote>
        </details>
      ))}
      <h3>Reference information used</h3>
      {!session.questions.some((q) => q.reference) && (
        <p>
          No dated course references were attached to this attempt. Factual claims need separate
          verification.
        </p>
      )}
      {session.questions
        .filter((q) => q.reference)
        .map((q) => (
          <details key={q.id}>
            <summary>
              {q.text} —{' '}
              {q.reference_status === 'matched'
                ? 'Matched at interview start'
                : 'Not used for factual scoring'}
            </summary>
            <p>
              {q.reference.university} · {q.reference.course} · {q.reference.intake}
            </p>
            <p>
              Checked {q.reference.checked_on}; review by {q.reference.valid_until}
            </p>
            <p>{q.reference.facts}</p>
            <p>{q.reference.modules}</p>
            <p>{q.reference.fees}</p>
            {q.reference_source_url && (
              <a href={q.reference_source_url} target="_blank" rel="noreferrer">
                University source
              </a>
            )}
          </details>
        ))}
      <h3>How your score is calculated</h3>
      {session.rubric_version === 'ggec-standards-v3' ? (
        <p>
          Standard coverage 60%, transcript clarity 20%, grammar 10%, correctness 10%. Required
          points earn full, half or no credit. Grammar allowance: {session.grammar_allowance}%.
          Cross-answers share their major question's weight; extras have their own weight. Timing,
          pace and accent do not change marks.
        </p>
      ) : (
        <p>
          Applicable criterion ratings are multiplied by their weights, averaged, then converted to
          100. Optional unscored criteria are excluded. Relevance of 0 gives 0; relevance up to 2
          caps the score at 29, and up to 4 caps it at 49. Follow-up questions share their main
          question's weight.
        </p>
      )}
      {data && (
        <p>
          {Object.entries(data.rubric_weights)
            .map(([k, v]) => `${k.replaceAll('_', ' ')}: ${v}`)
            .join('; ')}
          .
        </p>
      )}
    </section>
  );
}
