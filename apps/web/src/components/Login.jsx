import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { auth } from '../services/api';
import { Button, Field } from './common';

export default function Login({ onSuccess, error }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
          await auth.signIn(email, password);
          await onSuccess();
        } catch (e) {
          const messages = {
            email_not_confirmed:
              'Your account is not ready for sign-in. Please ask GGEC to enable access.',
          };
          setMessage(messages[e.code] || e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Welcome back</h2>
      <Field name="email" type="email" value={email} onChange={setEmail} required />
      <Field name="password" type="password" value={password} onChange={setPassword} required />
      <Button disabled={busy}>
        {busy ? 'Please wait…' : 'Sign in'}
        <ArrowRight size={17} />
      </Button>
      <p className="muted">New here? Contact your GGEC admin to have an account created.</p>
      {message && <p role="status">{message}</p>}
      {error && (
        <Button type="button" secondary onClick={onSuccess}>
          Retry connection
        </Button>
      )}
    </form>
  );
}
