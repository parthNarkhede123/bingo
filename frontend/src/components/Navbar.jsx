import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <Link to={user ? '/keep' : '/'} className="brand">🛡️ Ironhold</Link>
      <div className="nav-links">
        <Link to="/leaderboard">Leaderboard</Link>
        {user ? (
          <>
            <Link to="/keep" className="nav-play">Play</Link>
            <Link to={`/profile/${user.username}`}>{user.username}</Link>
            <button className="btn btn-ghost" onClick={() => { logout(); navigate('/login'); }}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="btn btn-small">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}
