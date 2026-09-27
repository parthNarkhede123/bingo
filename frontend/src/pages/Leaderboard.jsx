import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Ad from '../components/Ad';

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard(100)
      .then((d) => setRows(d.leaderboard))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="leaderboard-page">
      <h1>Leaderboard</h1>
      <Ad label="Sponsored" style={{ margin: '12px 0 20px' }} />
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <table className="table">
          <thead>
            <tr><th>#</th><th>Player</th><th>Rating</th><th>W</th><th>L</th><th>D</th><th>Games</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.username}>
                <td>{r.rank}</td>
                <td><Link to={`/profile/${r.username}`}>{r.username}</Link></td>
                <td className="strong">{r.rating}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.draws}</td>
                <td>{r.gamesPlayed}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="7" className="muted center">No ranked players yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
