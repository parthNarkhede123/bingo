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
    api.leaderboard(5).then((d) => setTop(d.leaderboard)).catch(() => {});
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <h1>Ranked Multiplayer Bingo</h1>
        <p className="muted">
          Arrange your 5×5 board, call numbers turn by turn, and race to five lines.
          First to <strong>B-I-N-G-O</strong> wins and climbs the ladder.
        </p>
        {user ? (
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/play')}>
            ▶ Find a Match
          </button>
        ) : (
          <div className="cta-row">
            <Link to="/register" className="btn btn-primary btn-lg">Play free</Link>
            <Link to="/login" className="btn btn-ghost btn-lg">Sign in</Link>
          </div>
        )}
      </section>

      <Ad label="Sponsored" style={{ margin: '24px 0' }} />

      <section className="panel">
        <div className="panel__head">
          <h2>Top players</h2>
          <Link to="/leaderboard">View all →</Link>
        </div>
        <ol className="mini-leaderboard">
          {top.map((p) => (
            <li key={p.username}>
              <span className="rank">#{p.rank}</span>
              <Link to={`/profile/${p.username}`}>{p.username}</Link>
              <span className="rating">{p.rating}</span>
            </li>
          ))}
          {top.length === 0 && <li className="muted">No ranked games yet — be the first!</li>}
        </ol>
      </section>

      <section className="how">
        <h2>How to play</h2>
        <ol>
          <li>Get matched with an opponent near your rating.</li>
          <li>Arrange numbers 1–25 on your board during the setup timer.</li>
          <li>Take turns calling numbers. Every call marks both boards.</li>
          <li>Complete rows, columns, or diagonals to earn B-I-N-G-O letters.</li>
          <li>First to 5 completed lines wins the match and rating points.</li>
        </ol>
      </section>
    </div>
  );
}
