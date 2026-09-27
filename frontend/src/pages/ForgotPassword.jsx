import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.forgotPassword(identifier.trim());
      // The API responds identically whether or not the account exists, so we
      // always show the same confirmation (no account enumeration).
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-card">
        <h1>Check your email</h1>
        <p className="muted">
          If an account matches <strong>{identifier.trim()}</strong>, we've sent a link to reset
          your password. It expires in 1 hour. Don't forget to check your spam folder.
        </p>
        <p className="muted"><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Forgot your password?</h1>
      <p className="muted">Enter your username or email and we'll send you a reset link.</p>
      <form onSubmit={submit}>
        <label>Username or email
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !identifier.trim()}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="muted"><Link to="/login">Back to sign in</Link></p>
    </div>
  );
}
