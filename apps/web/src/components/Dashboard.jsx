import PracticeProgress from './PracticeProgress';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  Clock,
  GraduationCap,
  Mic,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { AttemptList, Stat, date } from './common';

function StaffDashboard({ user, sessions, openSession }) {
  // Staff's own test-interview attempts aren't student work; keep them out of student stats/list.
  const studentSessions = sessions.filter((s) => !s.is_staff_test);
  const complete = studentSessions.filter((s) => s.state === 'REPORT'),
    scored = complete
      .filter((s) => !s.practice_category && s.report?.overall_score != null)
      .map((s) => s.report.overall_score),
    avgScore = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    awaitingEvaluation = complete.filter((s) => s.report?.overall_score == null).length;
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">STAFF WORKSPACE</span>
          <h1>Your student workspace</h1>
          <p>Support progress with thoughtful, evidence-based feedback.</p>
        </div>
        <span className="date">{date(new Date())}</span>
      </div>
      <div className="stats">
        <Stat
          icon={ClipboardList}
          title="Completed by your students"
          value={complete.length}
          note="Across all assigned/visible students"
        />
        <Stat
          icon={Trophy}
          title="Average score"
          value={avgScore == null ? '—' : `${avgScore}/100`}
          note={avgScore == null ? 'Available once attempts are evaluated' : 'Across evaluated full interviews'}
        />
        <Stat
          icon={Clock}
          title="Awaiting evaluation"
          value={awaitingEvaluation}
          note={awaitingEvaluation ? 'May need a follow-up check' : 'All caught up'}
        />
      </div>
      <section className="card">
        <div className="section-title">
          <h2>Recent student attempts</h2>
          <span className="pill">{studentSessions.length} attempts</span>
        </div>
        {studentSessions.length ? (
          <AttemptList sessions={studentSessions.slice(0, 10)} open={openSession} />
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Mic size={26} />
            </span>
            <h3>No student attempts yet</h3>
            <p>Once your assigned students begin practicing, their attempts will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}

export default function Dashboard({ user, profile, sessions, onStart, onProfile, openSession }) {
  if (user.role !== 'student')
    return <StaffDashboard user={user} sessions={sessions} openSession={openSession} />;
  const complete = sessions.filter((s) => s.state === 'REPORT'),
    scores = complete
      .filter((s) => !s.practice_category)
      .map((s) => s.report?.overall_score)
      .filter((x) => x != null);
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YOUR PREPARATION, ONE STEP AT A TIME</span>
          <h1>Welcome{user?.name ? ', ' + user.name.split(' ')[0] : ''}.</h1>
          <p>Make your next interview feel a little more familiar.</p>
        </div>
        <span className="date">{date(new Date())}</span>
      </div>
      <PracticeProgress sessions={sessions} />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-tag">GGEC PRE-CAS PRACTICE</span>
          <h2>
            A clearer story.
            <br />A more confident you.
          </h2>
          <p>
            Turn your study plans into thoughtful answers.
            <br />
            Practice a realistic interview, one question at a time.
          </p>
          <button className="btn cream" onClick={onStart}>
            Start a practice interview
            <ArrowUpRight size={18} />
          </button>
          <small>
            Personal to your profile <span>•</span> Voice or text answers
          </small>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="art-card back">
            <GraduationCap size={34} />
            <span>Your next chapter</span>
          </div>
          <div className="art-card front">
            <span className="art-dot">●</span>
            <b>
              Let’s talk about
              <br />
              your ambitions.
            </b>
            <div className="wave">
              {[12, 25, 40, 22, 55, 34, 18, 48, 30, 42, 20, 12].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <span className="art-caption">A little practice goes a long way</span>
          </div>
          <div className="art-check">
            <Check size={21} />
          </div>
        </div>
      </section>
      <div className="stats">
        <Stat
          icon={ClipboardList}
          title="Completed interviews"
          value={complete.length}
          note="Every attempt is a step forward"
        />
        <Stat
          icon={Trophy}
          title="Best practice score"
          value={scores.length ? `${Math.max(...scores)}/100` : '—'}
          note={scores.length ? 'Across your evaluated attempts' : 'Available after AI evaluation'}
        />
        <Stat
          icon={ShieldCheck}
          title="Latest readiness"
          value={complete[0]?.report?.readiness_level || 'Not assessed'}
          note="A practice indicator for your preparation"
        />
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-title">
            <h2>Your recent practice</h2>
            <span className="pill">{sessions.length} attempts</span>
          </div>
          {sessions.length ? (
            <AttemptList sessions={sessions.slice(0, 5)} open={openSession} />
          ) : (
            <div className="empty">
              <span className="empty-icon">
                <Mic size={26} />
              </span>
              <h3>Your first step starts here</h3>
              <p>
                Complete your profile, then take your first mock interview.
                <br />
                Your saved attempts and feedback will appear here.
              </p>
              <button className="text-button" onClick={onStart}>
                Let’s get started <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="card checklist">
          <span className="eyebrow">BEFORE YOU BEGIN</span>
          <h2>Set yourself up well.</h2>
          {[
            ['01', 'Make it personal', 'Add your course, university and study plans.'],
            ['02', 'Find a quiet moment', 'Check your microphone, or use text answers.'],
            ['03', 'Speak in your own words', 'Focus on your reasons and what you know.'],
          ].map(([n, t, d]) => (
            <div className="check-item" key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </div>
          ))}
          <button className="text-button" onClick={onProfile}>
            {profile ? 'Review your profile' : 'Complete your profile'}
            <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
