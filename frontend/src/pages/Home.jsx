import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Ad from '../components/Ad';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [top, setTop] = useState([]);

  useEffect(() => {
    api.leaderboard(5).then((d) => setTop(d.leaderboard || [])).catch(() => {});
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <h1>Ironhold — The Siege Week</h1>
        <p className="muted">
          Rule a Hold for one week-long season. Harvest your land's <strong>one</strong> material,
          <strong> trade</strong> for the rest, forge gear from chests, march on rivals or mine the wilds,
          and forge (or break) pacts. Top the <strong>Conquest Points</strong> ladder before the week ends.
        </p>
        {user ? (
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/keep')}>
            ▶ Enter your Keep
          </button>
        ) : (
          <div className="cta-row">
            <Link to="/register" className="btn btn-primary btn-lg">Claim a Hold</Link>
            <Link to="/login" className="btn btn-ghost btn-lg">Sign in</Link>
          </div>
        )}
      </section>

      <Ad label="Sponsored" placement="home" style={{ margin: '24px 0' }} />

      <section className="panel">
        <div className="panel__head">
          <h2>Top lords this season</h2>
          <Link to="/leaderboard">View all →</Link>
        </div>
        <ol className="mini-leaderboard">
          {top.map((p) => (
            <li key={p.username}>
              <span className="rank">#{p.rank}</span>
              <Link to={`/profile/${p.username}`}>{p.username}</Link>
              <span className="rating">👑 {p.cp}</span>
            </li>
          ))}
          {top.length === 0 && <li className="muted">No lords ranked yet — be the first!</li>}
        </ol>
      </section>

      <section className="how">
        <h2>How the week works</h2>
        <ol>
          <li>Claim a Hold on the map — your biome yields a single unique material.</li>
          <li>Because you make only one material, <strong>trade</strong> in the Bazaar for the others.</li>
          <li>Open chests and forge gear; equip it across four stances — Assault, Bulwark, Harvest, March.</li>
          <li>March to raid rival Holds, occupy wild mines, or scout with Wren. Recruit Durgan to auto-command.</li>
          <li>Earn Conquest Points from battles, trades, quests and upgrades. Highest CP when the season ends wins a crown.</li>
        </ol>
      </section>

      <Ad label="Sponsored" placement="home" style={{ margin: '28px 0 8px' }} />
    </div>
  );
}
