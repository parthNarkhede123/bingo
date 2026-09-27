import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      // Send them to sign in shortly after confirming.
      setTimeout(() => navigate('/login'), 2200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-card">
        <h1>Invalid reset link</h1>
        <p className="muted">This link is missing its token. Please request a new one.</p>
        <p className="muted"><Link to="/forgot-password">Request a new link</Link></p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1>Password updated</h1>
        <p className="muted">Your password has been reset. Redirecting you to sign in…</p>
        <p className="muted"><Link to="/login">Sign in now</Link></p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        <label>New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            minLength={8} autoComplete="new-password" required />
        </label>
        <label>Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            minLength={8} autoComplete="new-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
      </form>
      <p className="muted"><Link to="/login">Back to sign in</Link></p>
    </div>
  );
}
