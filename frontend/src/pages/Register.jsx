import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await register(username.trim(), email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>Create your account</h1>
      <form onSubmit={submit}>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            pattern="[a-zA-Z0-9_]{3,20}" title="3-20 letters, numbers, underscores"
            autoComplete="username" required />
        </label>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            minLength={8} autoComplete="new-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
