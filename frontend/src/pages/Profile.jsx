import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import Ad from '../components/Ad';

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

  const { player } = data;

  return (
    <div className="profile">
      <div className="profile-head">
        <h1>{player.username}</h1>
        {player.inSeason && player.rank ? (
          <div className="rank-badge">Rank #{player.rank}</div>
        ) : (
          <div className="rank-badge rank-badge--out">Not in this season</div>
        )}
      </div>
      <div className="stat-row">
        <div className="stat"><span>👑 {player.cp}</span><small>Conquest Pts</small></div>
        <div className="stat"><span>{player.level}</span><small>Level</small></div>
        <div className="stat"><span>{player.crowns}</span><small>Crowns</small></div>
        <div className="stat"><span>{player.seasonsPlayed}</span><small>Seasons</small></div>
      </div>

      <Ad label="Sponsored" placement="profile" style={{ margin: '4px 0 24px' }} />

      <section className="panel">
        <p className="muted">
          {player.inSeason
            ? `${player.username} holds a Keep this season. Crowns are earned by finishing a season at #1.`
            : `${player.username} hasn't claimed a Hold this season.`}
        </p>
        <Link to="/leaderboard" className="btn btn-ghost">See the full ladder →</Link>
      </section>

      <Ad label="Sponsored" placement="profile" style={{ margin: '24px 0 8px' }} />
    </div>
  );
}
