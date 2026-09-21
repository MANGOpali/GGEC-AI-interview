import Coaching from './Coaching';
import EvaluationProgress from './EvaluationProgress';
import { BookOpen, Download, ShieldCheck, Trophy } from 'lucide-react';
import { Button, Stat, Title, date, label } from './common';
const duration = (seconds) =>
  seconds == null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function Report({ session: s, staff, onHold, onUpdate, onPractice }) {
  const r = s.report;
  const priorities = [...s.answers]
    .filter((a) => a.evaluation?.feedback)
    .sort((a, b) => (a.answer_score ?? 100) - (b.answer_score ?? 100))
    .map((a) => a.evaluation.feedback);
  const shortFeedback = (text) => {
    const words = text.trim().split(/\s+/);
    return words.length > 35 ? `${words.slice(0, 35).join(' ')}…` : text;
  };
  function download() {
    const sanitized = structuredClone(s);
    delete sanitized.profile_snapshot;
    if (!staff)
      sanitized.answers.forEach((a) => {
        if (a.evaluation) delete a.evaluation.reasoning;
      });
    const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `ggec-report-${s.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Title
        eyebrow="INTERVIEW REVIEW"
        title={
          s.state === 'REPORT'
            ? 'One step further. Well done.'
            : s.state === 'EXPIRED'
              ? 'This attempt has expired.'
              : 'Interview in progress.'
        }
        description={`${s.practice_category ? s.practice_category + ' practice · ' : ''}${date(s.started_at)} · ${s.answers.length} saved answers`}
      />
      <div className="actions">
        <Button secondary onClick={download}>
          <Download size={17} />
          Download report
        </Button>
        {staff && (
          <Button secondary onClick={onHold}>
            {s.review_hold ? 'Release retention hold' : 'Hold for counsellor review'}
          </Button>
        )}
      </div>
      {s.state === 'REPORT' && <EvaluationProgress session={s} onUpdate={onUpdate} />}
      {!staff && r?.weak_areas?.length > 0 && (
        <div className="actions">
          {r.weak_areas.map((category) => (
            <Button key={category} secondary onClick={() => onPractice?.(category)}>
              Practise {category}
            </Button>
          ))}
        </div>
      )}
      {r && (
        <>
          <div className="stats">
            <Stat
              icon={Trophy}
              title="Overall practice score"
              value={r.overall_score === null ? '—' : `${r.overall_score}/100`}
              note={`${r.evaluated_answers}/${r.total_answers} answers evaluated`}
            />
            <Stat
              icon={ShieldCheck}
              title="Practice readiness"
              value={r.readiness_level}
              note="A guide for further preparation"
            />
            <Stat
              icon={BookOpen}
              title="Strong areas"
              value={r.strong_areas.length}
              note={r.strong_areas.join(', ') || 'Not assessed yet'}
            />
          </div>
          <div className="card">
            <h2>Your feedback</h2>
            <p className="muted">{r.notice}</p>
            {r.scoring_version && (
              <p className="muted">
                {r.scoring_version === 'ggec-standards-v3'
                  ? `Standards 60%, transcript clarity 20%, grammar 10%, correctness 10%. Grammar allowance: ${r.grammar_allowance}%. Cross-answers share their major question's weight. Pace and accent are not assessed.`
                  : `Scoring: ${r.scoring_version}. Applicable rubric scores are weighted; follow-ups share their main question’s weight. Irrelevant answers have a score cap.`}
              </p>
            )}
            {r.overall_score === null && (
              <div className="alert">
                This attempt is not fully evaluated. Your saved answers are available for counsellor
                review. No overall score or ranking has been assigned.
              </div>
            )}
            <div className="category-bars">
              {Object.entries(r.category_scores).map(([k, v]) => (
                <div key={k}>
                  <span>
                    {k}
                    <b>{v}/100</b>
                  </span>
                  <div className="progress-track">
                    <div style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <h3>Your next 3 improvements</h3>
            <ul>
              {[...new Set(priorities.length ? priorities : r.recommendations || [])]
                .slice(0, 3)
                .map((text, i) => (
                  <li key={i}>{shortFeedback(text)}</li>
                ))}
            </ul>
            <details>
              <summary>View all feedback and consistency checks</summary>
              {[
                ['Focus areas', r.weak_areas],
                ['Questions to revisit', r.poor_answers.map((x) => x.question)],
                ['Missing information', r.missing_information],
                ['Possible contradictions', r.contradictions],
                ['Recommended improvements', r.recommendations],
              ].map(
                ([t, items]) =>
                  items.length > 0 && (
                    <section key={t}>
                      <h3>{t}</h3>
                      <ul>
                        {items.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </section>
                  ),
              )}
            </details>
          </div>
        </>
      )}
      {s.state === 'REPORT' && !s.retained_at && (
        <details className="card">
          <summary>Practice examples</summary>
          <Coaching session={s} />
        </details>
      )}
      <section className="card transcript-review">
        <h2>Question-by-question review</h2>
        {s.answers.length === 0 && <p>No answers have been submitted yet.</p>}
        {s.answers.map((a, i) => (
          <details key={a.id}>
            <summary>
              {String(i + 1).padStart(2, '0')} · {a.question_text}{' '}
              {a.is_followup && <span className="pill">Follow-up</span>}
            </summary>
            <p className="transcript-text">
              {a.transcript ?? 'Transcript removed by the retention policy.'}
            </p>
            <p>{a.evaluation?.feedback || 'No AI evaluation available.'}</p>
            <p className="muted">
              <b>
                Answer score:{' '}
                {r?.answer_scores?.find((x) => x.answer_id === a.id)?.score ??
                  a.answer_score ??
                  'Not evaluated'}
                {(r?.answer_scores?.find((x) => x.answer_id === a.id)?.score ?? a.answer_score) !=
                null
                  ? '/100'
                  : ''}
              </b>
            </p>
            {a.duration_seconds != null && (
              <p className="muted">
                <b>Time used:</b> {duration(a.duration_seconds)}
                {a.time_limit_seconds != null && ` of ${duration(a.time_limit_seconds)}`}
                {a.over_time ? ' · over the limit' : ' · within the limit'}
              </p>
            )}
            {a.duration_flag && (
              <p className="muted">
                Duration: {label(a.duration_flag)}
                {a.spoken_seconds != null
                  ? ` · ${Math.round(a.spoken_seconds)} recorded seconds (reported by client)`
                  : ''}
                . Timing does not change marks.
              </p>
            )}
            {a.evaluation?.scoring_version === 'ggec-standards-v3' && (
              <>
                <p>{a.evaluation.assessment_basis}</p>
                <dl>
                  {['standard_coverage', 'fluency_clarity', 'grammar', 'overall_correctness'].map(
                    (k) => (
                      <div key={k}>
                        <dt>{label(k)}</dt>
                        <dd>{Number(a.evaluation[k]).toFixed(1)}/10</dd>
                      </div>
                    ),
                  )}
                </dl>
                <p>
                  Sentences flagged for grammar: {a.evaluation.grammar_error_sentence_ids.length}/
                  {a.evaluation.sentence_count} ({a.evaluation.grammar_error_percent.toFixed(1)}%).
                  Allowance: {a.evaluation.grammar_allowance}%.
                </p>
                <ul>
                  {a.evaluation.point_results.map((p) => (
                    <li key={p.point_id}>
                      <b>
                        {p.credit === 1
                          ? 'Covered'
                          : p.credit === 0.5
                            ? 'Partly covered'
                            : 'Missing or incorrect'}
                        :
                      </b>{' '}
                      {p.point_text} — {p.evidence}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {a.evaluation && a.evaluation.scoring_version !== 'ggec-standards-v3' && (
              <dl>
                {[
                  'relevance',
                  'accuracy',
                  'course_knowledge',
                  'university_research',
                  'financial_knowledge',
                  'career_credibility',
                  'consistency_with_profile',
                  'completeness',
                  'clarity_communication',
                ].map((metric) => (
                  <div key={metric}>
                    <dt>{label(metric)}</dt>
                    <dd>
                      {a.evaluation[metric] == null ? 'Not assessed' : `${a.evaluation[metric]}/10`}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {a.evaluation?.flags?.length > 0 && (
              <p className="muted">Indicators: {a.evaluation.flags.map(label).join(', ')}</p>
            )}
            {staff && a.evaluation?.reasoning && (
              <div className="alert">
                <b>Counsellor note</b>
                <p>{a.evaluation.reasoning}</p>
              </div>
            )}
          </details>
        ))}
      </section>
    </>
  );
}
