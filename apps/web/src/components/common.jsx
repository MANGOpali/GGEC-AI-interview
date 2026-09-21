import { ArrowUpRight, ClipboardList } from 'lucide-react';

export const label = (s) => s.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
export const date = (s) =>
  new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
// Students only enter university/college, course and intake. Other keys are legacy fields kept
// for older stored profiles; new profiles never require or show them.
export const emptyProfile = {
  university: '',
  course: '',
  intake: '',
  leaderboard_opt_in: false,
  leaderboard_alias: '',
};
export function Button({ children, secondary = false, ...props }) {
  return (
    <button className={secondary ? 'btn secondary' : 'btn'} {...props}>
      {children}
    </button>
  );
}
export function Field({ name, value, onChange, type = 'text', required = false, label: labelText }) {
  return (
    <label className="field">
      {labelText ?? label(name)}
      {type === 'textarea' ? (
        <textarea
          required={required}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          required={required}
          type={type}
          onBlur={type === 'email' ? (e) => onChange(e.target.value.trim()) : undefined}
          min={type === 'number' ? 0 : undefined}
          value={value ?? ''}
          onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
    </label>
  );
}
export function Title({ eyebrow, title, description }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function Stat({ icon: Icon, title, value, note }) {
  return (
    <div className="card stat">
      <div>
        <span>{title}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function AttemptList({ sessions, open }) {
  return (
    <div className="attempts">
      {sessions.map((s, i) => (
        <button key={s.id} onClick={() => open(s.id)}>
          <span className="attempt-icon">
            <ClipboardList size={20} />
          </span>
          <span>
            <b>
              {s.practice_category
                ? `${s.practice_category} practice`
                : `Mock interview ${sessions.length - i}`}
            </b>
            <small>
              {date(s.started_at)} ·{' '}
              {s.state === 'REPORT'
                ? 'Completed'
                : s.state === 'EXPIRED'
                  ? 'Expired'
                  : 'In progress'}
            </small>
          </span>
          <span className="attempt-score">
            {s.report?.overall_score != null
              ? `${s.report.overall_score}/100`
              : s.state === 'REPORT'
                ? 'Not evaluated'
                : s.state === 'EXPIRED'
                  ? 'View'
                  : 'Resume'}
            <ArrowUpRight size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}
