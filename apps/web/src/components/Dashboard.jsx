import PracticeProgress from './PracticeProgress';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  GraduationCap,
  Mic,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { AttemptList, Stat, date } from './common';

export default function Dashboard({ user, profile, sessions, onStart, onProfile, openSession }) {
  const staff = user.role !== 'student',
    complete = sessions.filter((s) => s.state === 'REPORT'),
    scores = complete
      .filter((s) => !s.practice_category)
      .map((s) => s.report?.overall_score)
      .filter((x) => x != null);
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YOUR PREPARATION, ONE STEP AT A TIME</span>
          <h1>
            {staff
              ? 'Your student workspace'
              : `Welcome${user?.name ? ', ' + user.name.split(' ')[0] : ''}.`}
          </h1>
          <p>
            {staff
              ? 'Support progress with thoughtful, evidence-based feedback.'
              : 'Make your next interview feel a little more familiar.'}
          </p>
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
            {staff ? 'Review student progress' : 'Start a practice interview'}
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
            <h2>{staff ? 'Recent student attempts' : 'Your recent practice'}</h2>
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
          {!staff && (
            <button className="text-button" onClick={onProfile}>
              {profile ? 'Review your profile' : 'Complete your profile'}
              <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      </div>
    </>
  );
}
