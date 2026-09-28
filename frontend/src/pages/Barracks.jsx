import { useState } from 'react';
import { api } from '../api/client';
import { useGame } from '../context/GameContext';
import { TIERS, TIER_COLOR, STANCES, STANCE_META, SKILL_META, cap } from '../game/constants';
import { num } from '../game/format';

const LOADOUT_SLOTS = 3;
const CRAFT_COST = { wood: '50 mat', iron: '120 mat · 20 scrap', gold: '250 mat · 60 scrap', royal: '500 mat · 150 scrap' };

function GearChip({ piece, children }) {
  return (
    <div className="gear" style={{ '--tier': TIER_COLOR[piece.tier] }}>
      <div className="gear__top">
        <span className="gear__icon">{STANCE_META[piece.stance].icon}</span>
        <span className="gear__tier">{cap(piece.tier)}</span>
      </div>
      <div className="gear__pow">+{Math.round((piece.power || 0) * 100)}%</div>
      <div className="gear__stance">{STANCE_META[piece.stance].label}</div>
      {children}
    </div>
  );
}

export default function Barracks() {
  const { hold, applyHold, pushNotice } = useGame();
  const [busy, setBusy] = useState('');
  const [craftTier, setCraftTier] = useState('wood');
  const [craftStance, setCraftStance] = useState('assault');

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.hold) applyHold(res.hold);
      if (okMsg) pushNotice(okMsg, 'good');
    } catch (e) {
      pushNotice(e.message, 'danger');
    } finally {
      setBusy('');
    }
  };

  const equippedIds = new Set(STANCES.flatMap((s) => hold.loadouts[s]));
  const byId = Object.fromEntries(hold.inventory.map((p) => [p.id, p]));

  return (
    <div className="page">
      <div className="page-head"><h1>⚔️ Barracks</h1><span className="muted">{hold.inventory.length}/40 gear · ♻️ {num(hold.scrap)} scrap</span></div>

      <section className="panel">
        <h2>Chests</h2>
        <div className="chest-row">
          {TIERS.map((t) => (
            <div key={t} className="chest" style={{ '--tier': TIER_COLOR[t] }}>
              <div className="chest__name">{cap(t)}</div>
              <div className="chest__count">×{hold.chests[t] || 0}</div>
              <button className="btn btn-small" disabled={busy === `chest:${t}` || (hold.chests[t] || 0) < 1}
                onClick={() => run(`chest:${t}`, async () => {
                  const r = await api.openChest(t);
                  pushNotice(r.salvaged ? `Inventory full — ${r.piece.tier} piece auto-salvaged.` : `Opened a ${r.piece.tier} ${r.piece.stance} piece!`, r.salvaged ? 'info' : 'good');
                  return r;
                })}>
                Open
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Skills <span className="pip">{hold.skillPoints} SP</span></h2>
        <div className="skill-grid">
          {Object.entries(SKILL_META).map(([k, meta]) => {
            const rank = hold.skills[k] || 0;
            const maxed = rank >= meta.max;
            return (
              <div key={k} className="skill">
                <div className="skill__head"><strong>{meta.label}</strong><span className="muted small">{rank}/{meta.max}</span></div>
                <div className="pips">{Array.from({ length: meta.max }).map((_, i) => <span key={i} className={i < rank ? 'on' : ''} />)}</div>
                <small className="muted">{meta.blurb}</small>
                <button className="btn btn-small" disabled={busy === `skill:${k}` || maxed || hold.skillPoints < 1}
                  onClick={() => run(`skill:${k}`, () => api.spendSkill(k))}>
                  {maxed ? 'Maxed' : '+1'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Loadouts</h2>
        <p className="muted small">Up to {LOADOUT_SLOTS} pieces per stance. Only the active stance's gear applies.</p>
        <div className="loadout-grid">
          {STANCES.map((s) => (
            <div key={s} className={`loadout ${hold.activeStance === s ? 'is-active' : ''}`}>
              <div className="loadout__head">{STANCE_META[s].icon} {STANCE_META[s].label}</div>
              <div className="loadout__slots">
                {hold.loadouts[s].map((id) => byId[id] && (
                  <GearChip key={id} piece={byId[id]}>
                    <button className="chip-x" title="Salvage" disabled={busy === `sal:${id}`}
                      onClick={() => run(`sal:${id}`, () => api.salvageGear(id))}>×</button>
                  </GearChip>
                ))}
                {Array.from({ length: LOADOUT_SLOTS - hold.loadouts[s].length }).map((_, i) => <div key={i} className="slot-empty" />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Forge</h2>
        <p className="muted small">Craft gear from your material + 2 foreign materials (40 each) + scrap.</p>
        <div className="forge">
          <label className="field"><span>Tier</span>
            <select value={craftTier} onChange={(e) => setCraftTier(e.target.value)}>
              {TIERS.map((t) => <option key={t} value={t}>{cap(t)} — {CRAFT_COST[t]}</option>)}
            </select>
          </label>
          <label className="field"><span>Stance</span>
            <select value={craftStance} onChange={(e) => setCraftStance(e.target.value)}>
              {STANCES.map((s) => <option key={s} value={s}>{STANCE_META[s].label}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy === 'craft'} onClick={() => run('craft', () => api.craft(craftTier, craftStance), 'Forged a new piece.')}>Forge</button>
        </div>
      </section>

      <section className="panel">
        <h2>Inventory</h2>
        {hold.inventory.length === 0 && <p className="muted">Empty. Open chests or forge gear.</p>}
        <div className="gear-grid">
          {hold.inventory.map((p) => {
            const equipped = equippedIds.has(p.id);
            const slotFull = hold.loadouts[p.stance].length >= LOADOUT_SLOTS;
            return (
              <GearChip key={p.id} piece={p}>
                <div className="gear__actions">
                  {!equipped && (
                    <button className="btn btn-small" disabled={busy === `eq:${p.id}` || slotFull}
                      title={slotFull ? `${p.stance} loadout full` : 'Equip'}
                      onClick={() => run(`eq:${p.id}`, () => api.equipGear(p.id))}>Equip</button>
                  )}
                  {equipped && <span className="tag tag--on">Equipped</span>}
                  <button className="btn btn-small btn-ghost" disabled={busy === `sv:${p.id}`}
                    onClick={() => run(`sv:${p.id}`, () => api.salvageGear(p.id))}>Salvage</button>
                </div>
              </GearChip>
            );
          })}
        </div>
      </section>
    </div>
  );
}
