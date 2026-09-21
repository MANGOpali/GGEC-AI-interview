import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Field, emptyProfile } from './common';

export default function StudyDetails({ value, onSave, onDelete }) {
  const [p, setP] = useState(value || emptyProfile),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => setP(value || emptyProfile), [value]);
  return (
    <form
      className="card profile-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(p);
        setBusy(false);
      }}
    >
      <h2>Study details</h2>
      {[
        [
          'About you',
          ['name', 'nationality', 'previous_qualification', 'study_gap', 'work_experience'],
        ],
        [
          'Your studies',
          ['university', 'course', 'intake', 'course_duration', 'tuition_fee', 'scholarship'],
        ],
        ['Your plans', ['funding_details', 'accommodation', 'career_plans']],
      ].map(([title, fields]) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="form-grid">
            {fields.map((name) => (
              <Field
                key={name}
                name={name}
                value={p[name]}
                required={!['study_gap', 'work_experience', 'intake'].includes(name)}
                type={
                  ['tuition_fee', 'scholarship'].includes(name)
                    ? 'number'
                    : ['funding_details', 'accommodation', 'career_plans'].includes(name)
                      ? 'textarea'
                      : 'text'
                }
                onChange={(v) => setP({ ...p, [name]: v })}
              />
            ))}
          </div>
          {title === 'Your studies' && (
            <p className="muted">Tuition and scholarship amounts are in GBP (£).</p>
          )}
        </section>
      ))}
      <section>
        <h2>Your privacy choices</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.leaderboard_opt_in}
            onChange={(e) => setP({ ...p, leaderboard_opt_in: e.target.checked })}
          />
          <span>
            Include my best completed score on the member leaderboard using my chosen alias. I can
            opt out at any time.
          </span>
        </label>
        {p.leaderboard_opt_in && (
          <Field
            name="leaderboard_alias"
            value={p.leaderboard_alias}
            required
            onChange={(v) => setP({ ...p, leaderboard_alias: v })}
          />
        )}
        <p className="muted">
          Funding and profile details are encrypted in storage. Your assigned counsellor and
          administrators can review your profile.
        </p>
      </section>
      <div className="actions">
        <Button disabled={busy}>
          {busy ? 'Saving…' : 'Save study details'}
          <Check size={16} />
        </Button>
        {value && (
          <button type="button" className="text-button danger" onClick={() => setConfirm(!confirm)}>
            Delete study details
          </button>
        )}
      </div>
      {confirm && (
        <div className="alert">
          <p>
            Delete your study details and remove leaderboard participation? Existing interview
            snapshots remain until retention cleanup.
          </p>
          <Button
            secondary
            type="button"
            onClick={() => {
              onDelete();
              setConfirm(false);
            }}
          >
            Confirm deletion
          </Button>
        </div>
      )}
    </form>
  );
}
