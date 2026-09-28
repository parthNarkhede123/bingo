import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useGame } from '../context/GameContext';
import { STANCES, STANCE_META, materialColor, cap } from '../game/constants';
import { num, countdown } from '../game/format';

const commanderActive = (c) => !!c && (c.owned || (c.freeUntil && new Date(c.freeUntil).getTime() > Date.now()));

export default function Keep() {
  const { hold, applyHold, pushNotice } = useGame();
  const [busy, setBusy] = useState('');
  const now = Date.now();

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.hold) applyHold(res.hold);
      if (okMsg) pushNotice(okMsg, 'good');
      return res;
    } catch (e) {
      pushNotice(e.message, 'danger');
    } finally {
      setBusy('');
    }
  };

  const durgan = commanderActive(hold.commanders.durgan);
  const incoming = hold.incomingAt && new Date(hold.incomingAt).getTime() > now;
  const armies = (hold.marches || []).filter((m) => m.status === 'outbound');

  return (
    <div className="page">
      <div className="page-head">
        <h1>🏰 Your Keep</h1>
        <span className="muted">Hold at ({hold.coords.x}, {hold.coords.y}) · Season {hold.season}</span>
      </div>

      {incoming && (
        <div className="alert alert--danger">
          ⚠️ Incoming attack — arrives in <strong>{countdown(hold.incomingAt, now)}</strong>. Switch to
          {' '}<strong>Bulwark</strong> and rally troops.
        </div>
      )}

      <div className="grid grid--2">
        <section className="panel">
          <h2>Stance</h2>
          <p className="muted small">Your standing orders shape every march and defence.</p>
          {durgan && hold.autoLoadout && (
            <p className="tag tag--gem">⛏️ Durgan is auto-managing your stance.</p>
          )}
          <div className="stance-grid">
            {STANCES.map((s) => (
              <button
                key={s}
                className={`stance-btn ${hold.activeStance === s ? 'is-active' : ''}`}
                disabled={busy === `stance:${s}` || (durgan && hold.autoLoadout)}
                onClick={() => run(`stance:${s}`, () => api.setStance(s))}
                title={STANCE_META[s].blurb}
              >
                <span className="stance-btn__icon">{STANCE_META[s].icon}</span>
                <span className="stance-btn__label">{STANCE_META[s].label}</span>
                <small>{STANCE_META[s].blurb}</small>
              </button>
            ))}
          </div>
          {durgan && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!hold.autoLoadout}
                disabled={busy === 'auto'}
                onChange={(e) => run('auto', () => api.setAutoLoadout(e.target.checked))}
              />
              <span>Auto-loadout (Durgan picks the best stance for the moment)</span>
            </label>
          )}
        </section>

        <section className="panel">
          <h2>Harvest</h2>
          <div className="mat-line">
            <span className="dot" style={{ background: materialColor(hold.material.type) }} />
            <strong>{cap(hold.material.type)}</strong>
          </div>
          <div className="stat-rows">
            <div><span>Stored</span><b>{num(hold.material.amount)} / {num(hold.material.cap)}</b></div>
            <div><span>Rate</span><b>+{num(hold.material.rate)}/h</b></div>
          </div>
          <button className="btn btn-ghost" disabled={busy === 'harvest'} onClick={() => run('harvest', () => api.harvest())}>
            Refresh stores
          </button>
          <p className="muted small">Your material accrues on its own — harvest just settles the clock. Only your biome yields it, so you must trade for the rest.</p>
        </section>

        <section className="panel">
          <h2>Army</h2>
          <div className="stat-rows">
            <div><span>Troops</span><b>{num(hold.troops)}</b></div>
            <div><span>Wounded</span><b>{num(hold.wounded)}{hold.wounded > 0 && hold.woundedHealAt ? ` · heals in ${countdown(hold.woundedHealAt, now)}` : ''}</b></div>
          </div>
          <p className="muted small">Wounded troops recover over time. March from the <Link to="/map">Map</Link>.</p>
        </section>

        <section className="panel">
          <h2>Fortify</h2>
          <p className="muted small">Spend 300 of your material, 100 each of 2 foreign materials, and 50 scrap to fortify: <b>+50 troops</b>, XP, and Conquest Points.</p>
          <button className="btn" disabled={busy === 'upgrade'} onClick={() => run('upgrade', () => api.upgrade(), 'Your Hold grows stronger.')}>
            Fortify Hold
          </button>
        </section>
      </div>

      <section className="panel">
        <h2>Armies in the field</h2>
        {armies.length === 0 && <p className="muted">No marches out. Send one from the <Link to="/map">Map</Link>.</p>}
        {armies.length > 0 && (
          <ul className="march-list">
            {armies.map((m) => (
              <li key={m.id}>
                <span className={`badge badge--${m.kind}`}>{m.kind}</span>
                <span>→ ({m.targetCoords.x}, {m.targetCoords.y})</span>
                {m.troops > 0 && <span className="muted">{num(m.troops)} troops</span>}
                <span className="ml-auto">{countdown(m.arriveAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
