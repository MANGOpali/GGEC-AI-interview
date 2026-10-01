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
        "This attempt ended early — the camera repeatedly couldn't confirm the student was facing the screen. Answers already submitted are still scored normally below.",
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
      y += 6;
      heading('Category scores');
      Object.entries(r.category_scores).forEach(([k, v]) => paragraph(`${k}: ${v}/100`));
      y += 6;
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
          This attempt ended early — the camera repeatedly couldn't confirm the student was
          facing the screen. Answers already submitted are still scored normally below.
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
