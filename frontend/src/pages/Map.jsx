import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useGame } from '../context/GameContext';
import { materialColor, cap } from '../game/constants';
import { num } from '../game/format';

const RADII = [20, 40, 60, 100];

export default function Map() {
  const { hold, applyHold, pushNotice } = useGame();
  const [radius, setRadius] = useState(40);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // {type:'hold'|'mine', ...}
  const [troops, setTroops] = useState(10);
  const [busy, setBusy] = useState('');

  const load = useCallback((r) => {
    setLoading(true);
    api.map(r)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(radius); }, [radius, load]);

  const cx = hold.coords.x;
  const cy = hold.coords.y;
  const span = radius * 2 || 1;
  const pos = (c) => ({
    left: `${((c.x - (cx - radius)) / span) * 100}%`,
    top: `${((c.y - (cy - radius)) / span) * 100}%`,
  });

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.hold) applyHold(res.hold);
      pushNotice(okMsg, 'good');
      setSel(null);
      load(radius);
    } catch (e) {
      pushNotice(e.message, 'danger');
    } finally {
      setBusy('');
    }
  };

  const holds = (data && data.holds) || [];
  const mines = (data && data.mines) || [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>🗺️ The Reach</h1>
        <div className="seg">
          {RADII.map((r) => (
            <button key={r} className={radius === r ? 'is-active' : ''} onClick={() => setRadius(r)}>±{r}</button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !data && <div className="center muted" style={{ padding: 40 }}><div className="spinner" /></div>}

      <div className="map-layout">
        <div className="minimap">
          <div className="minimap__grid">
            <div className="minimap__you" style={pos(hold.coords)} title="Your Hold">🏰</div>
            {holds.filter((h) => !h.you).map((h) => (
              <button
                key={`h${h.coords.x},${h.coords.y}`}
                className={`pin pin--hold ${sel && sel.type === 'hold' && sel.coords.x === h.coords.x && sel.coords.y === h.coords.y ? 'is-sel' : ''}`}
                style={{ ...pos(h.coords), '--pin': materialColor(h.material) }}
                title={`${h.username} · ${cap(h.material)}`}
                onClick={() => { setSel({ type: 'hold', ...h }); setTroops(Math.min(50, hold.troops)); }}
              />
            ))}
            {mines.map((m) => (
              <button
                key={`m${m.coords.x},${m.coords.y}`}
                className={`pin pin--mine ${sel && sel.type === 'mine' && sel.coords.x === m.coords.x && sel.coords.y === m.coords.y ? 'is-sel' : ''}`}
                style={{ ...pos(m.coords), '--pin': materialColor(m.material) }}
                title={`Mine · ${cap(m.material)} ×${num(m.amount)}`}
                onClick={() => { setSel({ type: 'mine', ...m }); setTroops(Math.min(10, hold.troops)); }}
              >⛏</button>
            ))}
          </div>
          <p className="muted small center">🏰 you · ◆ holds · ⛏ wild mines — colour = material</p>
        </div>

        <aside className="map-detail">
          {!sel && <p className="muted">Pick a hold or mine on the map to act. Troop counts are hidden until you <strong>scout</strong>.</p>}

          {sel && sel.type === 'hold' && (
            <div className="panel">
              <h3>{sel.username}</h3>
              <p><span className="dot" style={{ background: materialColor(sel.material) }} /> {cap(sel.material)} biome</p>
              <p className="muted small">At ({sel.coords.x}, {sel.coords.y})</p>
              <label className="field">
                <span>Troops to send</span>
                <input type="number" min="1" max={hold.troops} value={troops}
                  onChange={(e) => setTroops(Math.max(1, Math.min(hold.troops, Number(e.target.value) || 1)))} />
              </label>
              <div className="btn-row">
                <button className="btn btn--attack" disabled={busy === 'attack' || hold.troops < 1}
                  onClick={() => act('attack', () => api.march({ intent: 'attack', target: sel.coords, troops }), 'Army marching to attack!')}>
                  ⚔️ Attack
                </button>
                <button className="btn btn-ghost" disabled={busy === 'scout'}
                  onClick={() => act('scout', () => api.scout(sel.coords), 'Wren rides to scout.')}>
                  🔭 Scout
                </button>
              </div>
              <p className="muted small">Scouting needs Wren (trial or recruited). A pact blocks attacks both ways.</p>
            </div>
          )}

          {sel && sel.type === 'mine' && (
            <div className="panel">
              <h3>⛏ Wild Mine</h3>
              <p><span className="dot" style={{ background: materialColor(sel.material) }} /> {cap(sel.material)} ×{num(sel.amount)}</p>
              <p className="muted small">At ({sel.coords.x}, {sel.coords.y})</p>
              <label className="field">
                <span>Troops to occupy</span>
                <input type="number" min="1" max={hold.troops} value={troops}
                  onChange={(e) => setTroops(Math.max(1, Math.min(hold.troops, Number(e.target.value) || 1)))} />
              </label>
              <button className="btn" disabled={busy === 'mine' || hold.troops < 1}
                onClick={() => act('mine', () => api.march({ intent: 'mine', target: sel.coords, troops }), 'Miners dispatched.')}>
                Occupy mine
              </button>
              <p className="muted small">Claimed mines yield foreign material you can trade or refine.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
