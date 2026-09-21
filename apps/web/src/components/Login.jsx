import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { auth } from '../services/api';
import { Button, Field } from './common';

export default function Login({ onSuccess, error }) {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
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
          if (signup) {
            const result = await auth.signUp(email, password, name, phone);
            if (result.session) {
              await onSuccess();
              return;
            }
            setMessage(
              'Registration received. Ask GGEC to finish enabling sign-in for your account.',
            );
            setPassword('');
            setSignup(false);
          } else {
            await auth.signIn(email, password);
            await onSuccess();
          }
        } catch (e) {
          const messages = {
            unexpected_failure: 'Registration could not be saved. Your phone number may already be registered. Try signing in if you already have an account, or contact GGEC.',
            email_not_confirmed:
              'Your account is not ready for sign-in. Please ask GGEC to enable access.',
            email_address_invalid:
              'The email service rejected this address. Check for spaces or a backslash before @. If it is correct, share this error code with support: email_address_invalid.',
            email_address_not_authorized:
              'This email is not authorised by the registration email service. Contact GGEC to check its email sending configuration. Code: email_address_not_authorized.',
            over_email_send_rate_limit:
              'The confirmation email limit has been reached. Please try again later. Code: over_email_send_rate_limit.',
          };
          setMessage(messages[e.code] || e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{signup ? 'Create your account' : 'Welcome back'}</h2>
      {signup && <Field name="name" value={name} onChange={setName} required />}
      {signup && <Field name="phone" type="tel" value={phone} onChange={setPhone} required />}
      {signup && (
        <p className="muted">
          We use your phone number only to support your preparation. It is visible to your assigned
          counsellor and administrators.
        </p>
      )}
      <Field name="email" type="email" value={email} onChange={setEmail} required />
      <Field name="password" type="password" value={password} onChange={setPassword} required />
      <Button disabled={busy}>
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        <ArrowRight size={17} />
      </Button>
      <button type="button" className="text-button" onClick={() => setSignup(!signup)}>
        {signup ? 'Already registered? Sign in' : 'New here? Create an account'}
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <Button type="button" secondary onClick={onSuccess}>
          Retry connection
        </Button>
      )}
    </form>
  );
}
