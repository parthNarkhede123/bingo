import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import GameNav from './GameNav';
import ResourceBar from './ResourceBar';

// Auth-gated shell for all in-game screens: sub-nav + resource bar + the routed
// page. Redirects to login when signed out.
export default function GameLayout() {
  const { user, loading: authLoading } = useAuth();
  const { hold, loading, error, refresh } = useGame();
  const location = useLocation();

  if (authLoading) return <div className="center muted" style={{ padding: 60 }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="game">
      <GameNav />
      {hold && <ResourceBar />}
      {loading && !hold && <div className="center muted" style={{ padding: 48 }}><div className="spinner" /></div>}
      {error && !hold && (
        <div className="panel center">
          <p className="error">{error}</p>
          <button className="btn" onClick={() => refresh().catch(() => {})}>Retry</button>
        </div>
      )}
      {hold && <Outlet />}
    </div>
  );
}
