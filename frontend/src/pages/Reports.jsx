import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ago } from '../game/format';

const KIND_ICON = { battle: '⚔️', scout: '🔭', trade: '🤝', system: '📜' };

// Render the small payload a report carries (troop counts, loot, scouted stats)
// without assuming any single shape — reports are intentionally light.
function Detail({ payload }) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return null;
  const entries = Object.entries(payload).filter(([, v]) => v !== null && typeof v !== 'object');
  if (entries.length === 0) return null;
  return (
    <div className="report__detail">
      {entries.map(([k, v]) => <span key={k}><b>{k}</b> {String(v)}</span>)}
    </div>
  );
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.reports()
      .then((d) => setReports(d.reports || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-head"><h1>📜 Reports</h1><span className="muted">Battles, scouts & trades — kept for 48h</span></div>
      {error && <p className="error">{error}</p>}
      {loading && <div className="center muted" style={{ padding: 40 }}><div className="spinner" /></div>}
      {!loading && reports.length === 0 && <p className="muted">No reports yet. March, scout or trade to make history.</p>}
      <ul className="report-list">
        {reports.map((r) => (
          <li key={r._id} className={`report report--${r.kind}`}>
            <span className="report__icon">{KIND_ICON[r.kind] || '📜'}</span>
            <div className="report__body">
              <strong>{r.title}</strong>
              <Detail payload={r.payload} />
            </div>
            <span className="report__time muted">{ago(r.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
