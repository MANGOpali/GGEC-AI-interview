import { useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { auth } from '../services/api';
import { AttemptList, Button, Field, Title } from './common';
import StudyDetails from './StudyDetails';

export default function Profile({
  user,
  profile,
  sessions,
  openSession,
  onSaveAccount,
  onSaveStudy,
  onDeleteStudy,
}) {
  const [account, setAccount] = useState({ name: '', phone: '' }),
    [busy, setBusy] = useState(false),
    [pw, setPw] = useState({ current: '', next: '', confirm: '' }),
    [pwBusy, setPwBusy] = useState(false),
    [pwMessage, setPwMessage] = useState(''),
    [pwError, setPwError] = useState('');
  useEffect(() => setAccount({ name: user?.name || '', phone: user?.phone || '' }), [user]);
  return (
    <>
      <Title
        eyebrow="YOUR DETAILS"
        title="Your account, in your hands."
        description="Keep your contact details current, review your saved attempts and update your study story."
      />
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSaveAccount({ name: account.name, phone: account.phone });
          setBusy(false);
        }}
      >
        <h2>Account details</h2>
        <div className="form-grid">
          <Field
            name="name"
            value={account.name}
            required
            onChange={(v) => setAccount({ ...account, name: v })}
          />
          <Field
            name="phone"
            type="tel"
            value={account.phone}
            required
            onChange={(v) => setAccount({ ...account, phone: v })}
          />
          <label className="field">
            Email
            <input type="email" value={user?.email || ''} readOnly />
          </label>
        </div>
        <p className="muted">
          Your phone number is visible to your assigned counsellor and administrators. Email cannot
          be changed here.
        </p>
        <div className="actions">
          <Button disabled={busy}>
            {busy ? 'Saving…' : 'Save account details'}
            <Check size={16} />
          </Button>
        </div>
      </form>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setPwError('');
          setPwMessage('');
          if (!user?.email) return setPwError('Password changes are not available in the local demo.');
          if (pw.next.length < 8) return setPwError('Use at least 8 characters for your new password.');
          if (pw.next !== pw.confirm) return setPwError('New passwords do not match.');
          setPwBusy(true);
          try {
            await auth.changePassword(user.email, pw.current, pw.next);
            setPw({ current: '', next: '', confirm: '' });
            setPwMessage('Password updated. Use it next time you sign in.');
          } catch (error) {
            setPwError(error.message);
          } finally {
            setPwBusy(false);
          }
        }}
      >
        <h2>Change password</h2>
        <div className="form-grid">
          <Field
            name="current_password"
            type="password"
            value={pw.current}
            required
            onChange={(v) => setPw({ ...pw, current: v })}
          />
          <Field
            name="new_password"
            type="password"
            value={pw.next}
            required
            onChange={(v) => setPw({ ...pw, next: v })}
          />
          <Field
            name="confirm_password"
            type="password"
            value={pw.confirm}
            required
            onChange={(v) => setPw({ ...pw, confirm: v })}
          />
        </div>
        <p className="muted">Confirm your current password before choosing a new one.</p>
        <div className="actions">
          <Button disabled={pwBusy}>
            <KeyRound size={16} />
            {pwBusy ? 'Updating…' : 'Update password'}
          </Button>
        </div>
        {pwError && <p role="alert">{pwError}</p>}
        {pwMessage && <p role="status">{pwMessage}</p>}
      </form>
      <section className="card">
        <div className="section-title">
          <h2>Your saved attempts</h2>
          <span className="pill">{sessions.length} attempts</span>
        </div>
        {sessions.length ? (
          <AttemptList sessions={sessions} open={openSession} />
        ) : (
          <div className="empty">
            <p>No attempts yet. Start your first practice interview.</p>
          </div>
        )}
      </section>
      <StudyDetails value={profile} onSave={onSaveStudy} onDelete={onDeleteStudy} />
    </>
  );
}
