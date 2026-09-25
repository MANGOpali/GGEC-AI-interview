import Coaching from './Coaching';
import EvaluationProgress from './EvaluationProgress';
import { BookOpen, Download, ShieldCheck, Trophy } from 'lucide-react';
import { Button, Stat, Title, date } from './common';

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
    </>
  );
}
