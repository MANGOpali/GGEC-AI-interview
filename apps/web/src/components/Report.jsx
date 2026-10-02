import { useEffect, useState } from 'react';
import Coaching from './Coaching';
import EvaluationProgress from './EvaluationProgress';
import { Download, ShieldCheck } from 'lucide-react';
import { Button, Title, date } from './common';

// Eases a number from 0 to target on mount/change -- used for the score summary and every ring
// so the report feels like it's actively computing rather than just appearing as static text.
function useAnimatedNumber(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) {
      setValue(0);
      return;
    }
    let frame,
      start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

// Hand-rolled circular progress ring (no charting library) -- same approach already used
// elsewhere in this app for the camera "Recording" pulse and the ID-check scan animation.
function RingStat({ label, value }) {
  const size = 84,
    stroke = 7,
    radius = (size - stroke) / 2,
    circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const animated = useAnimatedNumber(pct);
  const offset = circumference * (1 - animated / 100);
  const color = pct >= 75 ? '#1fa971' : pct >= 50 ? '#d08a10' : '#D01020';
  return (
    <div className="ring-stat">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e9eef8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ring-stat-value">
          {Math.round(animated)}
        </text>
      </svg>
      <span className="ring-stat-label">{label}</span>
    </div>
  );
}

export default function Report({ session: s, staff, onHold, onUpdate, onPractice }) {
  const r = s.report;
  const animatedScore = useAnimatedNumber(r?.overall_score);
  const priorities = [...s.answers]
    .filter((a) => a.evaluation?.feedback)
    .sort((a, b) => (a.answer_score ?? 100) - (b.answer_score ?? 100))
    .map((a) => a.evaluation.feedback);
  const shortFeedback = (text) => {
    const words = text.trim().split(/\s+/);
    return words.length > 35 ? `${words.slice(0, 35).join(' ')}…` : text;
  };
  async function download() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const pageBottom = doc.internal.pageSize.getHeight() - margin;
    const lineHeight = 15;
    let y = margin;
    const ensureSpace = (needed = lineHeight) => {
      if (y + needed > pageBottom) {
        doc.addPage();
        y = margin;
      }
    };
    const heading = (text, size = 14) => {
      ensureSpace(size + 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      doc.text(text, margin, y);
      y += size + 8;
    };
    const paragraph = (text) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const line of doc.splitTextToSize(text, maxWidth)) {
        ensureSpace();
        doc.text(line, margin, y);
        y += lineHeight;
      }
    };
    const bullet = (text) => paragraph(`•  ${text}`);

    heading('GGEC Pre-CAS Interview Report', 18);
    paragraph(
      `${s.practice_category ? s.practice_category + ' practice · ' : ''}${date(s.started_at)} · ${s.answers.length} saved answers`,
    );
    y += 6;
    if (s.ended_reason === 'anti_cheat_violation') {
      paragraph(
        'This attempt ended early due to repeated attention/focus violations during the interview. Answers already submitted are still scored normally below.',
      );
      y += 6;
    }
    if (r) {
      heading('Summary');
      paragraph(
        `Overall practice score: ${r.overall_score === null ? 'Not scored' : `${r.overall_score}/100`} (${r.evaluated_answers}/${r.total_answers} answers evaluated)`,
      );
      paragraph(`Practice readiness: ${r.readiness_level}`);
      paragraph(`Strong areas: ${r.strong_areas.join(', ') || 'Not assessed yet'}`);
      if (r.speech_metrics?.average_wpm != null) {
        paragraph(`Speaking pace: ~${r.speech_metrics.average_wpm} words/min`);
        paragraph(
          `Filler words: ${r.speech_metrics.filler_word_count} (${r.speech_metrics.filler_rate_per_100_words} per 100 words)`,
        );
      }
      y += 6;
      heading('Category scores');
      Object.entries(r.category_scores).forEach(([k, v]) => paragraph(`${k}: ${v}/100`));
      y += 6;
      if (r.four_cs) {
        heading("Your 4 C's");
        paragraph(`Coverage: ${r.four_cs.standard_coverage ?? '—'}/10`);
        paragraph(`Clarity: ${r.four_cs.fluency_clarity ?? '—'}/10`);
        paragraph(`Correctness: ${r.four_cs.overall_correctness ?? '—'}/10`);
        paragraph(`Command: ${r.four_cs.grammar ?? '—'}/10`);
        y += 6;
      }
      const topPriorities = [...new Set(priorities.length ? priorities : r.recommendations || [])].slice(
        0,
        3,
      );
      if (topPriorities.length) {
        heading('Your next 3 improvements');
        topPriorities.forEach((t) => bullet(shortFeedback(t)));
        y += 6;
      }
      if (r.weak_areas.length) {
        heading('Focus areas');
        r.weak_areas.forEach((t) => bullet(t));
        y += 6;
      }
      const poorQuestions = r.poor_answers.map((x) => x.question);
      if (poorQuestions.length) {
        heading('Questions to revisit');
        poorQuestions.forEach((t) => bullet(t));
      }
    } else {
      paragraph('No report is available yet for this attempt.');
    }
    doc.save(`ggec-report-${s.id}.pdf`);
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
          Download PDF
        </Button>
        {staff && (
          <Button secondary onClick={onHold}>
            {s.review_hold ? 'Release retention hold' : 'Hold for counsellor review'}
          </Button>
        )}
      </div>
      {s.ended_reason === 'anti_cheat_violation' && (
        <div className="alert error" role="alert">
          This attempt ended early due to repeated attention/focus violations during the
          interview. Answers already submitted are still scored normally below.
        </div>
      )}
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
          <div className="report-grid">
            <div className="card score-summary">
              <span className="score-summary-label">
                <ShieldCheck size={15} />
                AI Score Summary
              </span>
              <div className="score-summary-value">
                {r.overall_score === null ? '—' : `${Math.round(animatedScore)}%`}
              </div>
              <p className="muted">{r.readiness_level}</p>
              <p className="muted">
                {r.evaluated_answers}/{r.total_answers} answers evaluated
              </p>
              {r.strong_areas.length > 0 && (
                <p className="muted">Strong areas: {r.strong_areas.join(', ')}</p>
              )}
              {r.speech_metrics?.average_wpm != null && (
                <>
                  <hr />
                  <span className="score-summary-label">Delivery</span>
                  <p className="muted">Speaking pace: ~{r.speech_metrics.average_wpm} words/min</p>
                  <p className="muted">
                    Filler words: {r.speech_metrics.filler_word_count} (
                    {r.speech_metrics.filler_rate_per_100_words} per 100 words)
                  </p>
                </>
              )}
            </div>
            <div className="card ring-grid-card">
              <h2>Score breakdown</h2>
              <div className="ring-grid">
                {Object.entries(r.category_scores).map(([k, v]) => (
                  <RingStat key={k} label={k} value={v} />
                ))}
              </div>
            </div>
            <div className="card question-list-card">
              <h2>Question list</h2>
              <ol className="question-list">
                {s.answers.map((a, i) => (
                  <li key={a.id}>
                    <span className="question-list-number">{i + 1}</span>
                    <span className="question-list-text">{a.question_text}</span>
                    <span className="question-list-score">
                      {a.answer_score != null ? `${a.answer_score}/100` : '—'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {r.four_cs && (
              <div className="card four-cs-card">
                <h2>Your 4 C's</h2>
                <p className="muted">
                  Coverage, Clarity, Correctness and Command — the four things this standards-based
                  interview measures in every answer.
                </p>
                <div className="ring-grid">
                  <RingStat label="Coverage" value={Math.round((r.four_cs.standard_coverage ?? 0) * 10)} />
                  <RingStat label="Clarity" value={Math.round((r.four_cs.fluency_clarity ?? 0) * 10)} />
                  <RingStat
                    label="Correctness"
                    value={Math.round((r.four_cs.overall_correctness ?? 0) * 10)}
                  />
                  <RingStat label="Command" value={Math.round((r.four_cs.grammar ?? 0) * 10)} />
                </div>
              </div>
            )}
          </div>
          <div className="card feedback-card">
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
            <h3>Your next 3 improvements</h3>
            <ul>
              {[...new Set(priorities.length ? priorities : r.recommendations || [])]
                .slice(0, 3)
                .map((text, i) => (
                  <li key={i}>{shortFeedback(text)}</li>
                ))}
            </ul>
            <details className="feedback-details">
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
        <details className="card practice-examples">
          <summary>Practice examples</summary>
          <Coaching session={s} />
        </details>
      )}
    </>
  );
}
