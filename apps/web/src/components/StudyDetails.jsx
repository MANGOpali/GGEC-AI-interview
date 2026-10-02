import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Badge, Button, Field, emptyProfile } from './common';

export default function StudyDetails({ value, onSave, onDelete }) {
  const [p, setP] = useState(value || emptyProfile),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => setP(value || emptyProfile), [value]);
  const isComplete = Boolean(p.university?.trim() && p.course?.trim() && p.intake?.trim());
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
      <section>
        <div className="section-title">
          <h2>Your university &amp; course</h2>
          <Badge tone={isComplete ? 'on' : 'off'}>{isComplete ? 'Added' : 'Not added yet'}</Badge>
        </div>
        <p className="muted">
          This is used to personalize your interview questions — add it here before your first
          attempt.
        </p>
        <div className="form-grid">
          <Field
            name="university"
            label="University or college name"
            placeholder="e.g. University of Manchester"
            value={p.university}
            required
            onChange={(v) => setP({ ...p, university: v })}
          />
          <Field
            name="course"
            label="Course name"
            placeholder="e.g. BSc Computer Science"
            value={p.course}
            required
            onChange={(v) => setP({ ...p, course: v })}
          />
          <Field
            name="intake"
            label="Intake (start term)"
            placeholder="e.g. September 2026"
            value={p.intake}
            required
            onChange={(v) => setP({ ...p, intake: v })}
          />
        </div>
      </section>
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
