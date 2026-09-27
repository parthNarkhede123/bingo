import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function Profile() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    api.player(username).then(setData).catch((e) => setError(e.message));
  }, [username]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { player, history } = data;
  const winRate = player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;

  return (
    <div className="profile">
      <div className="profile-head">
        <h1>{player.username}</h1>
        <div className="rank-badge">Rank #{player.rank}</div>
      </div>
      <div className="stat-row">
        <div className="stat"><span>{player.rating}</span><small>Rating</small></div>
        <div className="stat"><span>{player.peakRating}</span><small>Peak</small></div>
        <div className="stat"><span>{player.wins}</span><small>Wins</small></div>
        <div className="stat"><span>{player.losses}</span><small>Losses</small></div>
        <div className="stat"><span>{player.draws}</span><small>Draws</small></div>
        <div className="stat"><span>{winRate}%</span><small>Win rate</small></div>
      </div>

      <h2>Recent games</h2>
      <table className="table">
        <thead><tr><th>Opponent</th><th>Result</th><th>Δ Rating</th></tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i}>
              <td>{h.opponent}</td>
              <td className={`result-cell result-cell--${h.outcome}`}>{h.outcome}</td>
              <td className={h.ratingDelta >= 0 ? 'pos' : 'neg'}>
                {h.ratingDelta >= 0 ? '+' : ''}{h.ratingDelta}
              </td>
            </tr>
          ))}
          {history.length === 0 && <tr><td colSpan="3" className="muted center">No games yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
