import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <Link to="/" className="brand">🎯 Bingo Arena</Link>
      <div className="nav-links">
        <Link to="/leaderboard">Leaderboard</Link>
        {user ? (
          <>
            <Link to={`/profile/${user.username}`}>{user.username} · {user.rating}</Link>
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
