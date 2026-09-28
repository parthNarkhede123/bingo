import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Ad from '../components/Ad';
import { num } from '../game/format';

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ season: null, endsAt: null });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard(100)
      .then((d) => { setRows(d.leaderboard || []); setMeta({ season: d.season, endsAt: d.endsAt }); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="leaderboard-page">
      <h1>Conquest Ladder</h1>
      {meta.season != null && (
        <p className="muted">Season {meta.season}{meta.endsAt ? ` · ends ${new Date(meta.endsAt).toLocaleDateString()}` : ''} — highest Conquest Points takes the crown.</p>
      )}
      <Ad label="Sponsored" placement="leaderboard" style={{ margin: '12px 0 20px' }} />
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>#</th><th>Lord</th><th>👑 CP</th><th>Level</th><th>Troops</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.username}>
                <td>{r.rank}</td>
                <td><Link to={`/profile/${r.username}`}>{r.username}</Link></td>
                <td className="strong">{num(r.cp)}</td>
                <td>{r.level}</td>
                <td>{num(r.troops)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" className="muted center">No lords ranked yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      <Ad label="Sponsored" placement="leaderboard" style={{ margin: '22px 0 8px' }} />
    </div>
  );
}
