import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useGame } from '../context/GameContext';
import { COMMANDERS, AD_REWARD_GEMS, cap } from '../game/constants';
import { num, countdown } from '../game/format';
import Ad from '../components/Ad';

const trial = (c) => c && !c.owned && c.freeUntil && new Date(c.freeUntil).getTime() > Date.now();

function rewardText(r) {
  const parts = [];
  if (r.gems) parts.push(`💎 ${r.gems}`);
  if (r.xp) parts.push(`✨ ${r.xp} XP`);
  if (r.cp) parts.push(`👑 ${r.cp} CP`);
  if (r.troops) parts.push(`🪖 ${r.troops}`);
  if (r.chest) parts.push(`🎁 ${cap(r.chest)} chest`);
  return parts.join(' · ');
}

export default function WarRoom() {
  const { hold, applyHold, pushNotice } = useGame();
  const [quests, setQuests] = useState([]);
  const [busy, setBusy] = useState('');

  const loadQuests = useCallback(() => {
    api.quests().then((d) => setQuests(d.quests || [])).catch((e) => pushNotice(e.message, 'danger'));
  }, [pushNotice]);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.hold) applyHold(res.hold);
      if (okMsg) pushNotice(okMsg, 'good');
      loadQuests();
      return res;
    } catch (e) { pushNotice(e.message, 'danger'); }
    finally { setBusy(''); }
  };

  return (
    <div className="page">
      <div className="page-head"><h1>📯 War Room</h1><span className="muted">💎 {num(hold.gems)} gems</span></div>

      <section className="panel">
        <h2>Commanders</h2>
        <p className="muted small">Legendary heroes. Free for a 12h trial at season start — recruit with gems to keep them.</p>
        <div className="grid grid--2">
          {Object.entries(COMMANDERS).map(([key, c]) => {
            const st = hold.commanders[key];
            const onTrial = trial(st);
            return (
              <div key={key} className="commander">
                <div className="commander__icon">{c.icon}</div>
                <div className="commander__body">
                  <h3>{c.name}</h3>
                  <p className="muted small">{c.blurb}</p>
                  {key === 'wren' && st.owned && <p className="tag tag--on">🔭 {num(st.charges || 0)} scout charges</p>}
                  {st.owned ? (
                    <span className="tag tag--on">Recruited</span>
                  ) : onTrial ? (
                    <div className="commander__trial">
                      <span className="tag tag--gem">Free trial · {countdown(st.freeUntil)} left</span>
                      <button className="btn btn-small" disabled={busy === `r:${key}` || hold.gems < c.cost}
                        onClick={() => run(`r:${key}`, () => api.recruit(key), `${c.name} recruited!`)}>Recruit · 💎{c.cost}</button>
                    </div>
                  ) : (
                    <button className="btn btn-small" disabled={busy === `r:${key}` || hold.gems < c.cost}
                      onClick={() => run(`r:${key}`, () => api.recruit(key), `${c.name} recruited!`)}>Recruit · 💎{c.cost}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Free gems</h2>
        <p className="muted small">Watch a short sponsor message for 💎{AD_REWARD_GEMS} (boosted by Gemfind). Cooldowned + daily-capped.</p>
        <button className="btn" disabled={busy === 'ad'}
          onClick={() => run('ad', async () => { const r = await api.adReward(); pushNotice(`+💎${r.reward} gems`, 'good'); return r; })}>
          🎬 Watch for gems
        </button>
        <Ad label="Sponsored" placement="play" style={{ marginTop: 14 }} />
      </section>

      <section className="panel">
        <h2>Quests</h2>
        <ul className="quest-list">
          {quests.map((q) => (
            <li key={q.id} className={`quest ${q.done ? 'is-done' : ''} ${q.claimed ? 'is-claimed' : ''}`}>
              <div className="quest__body">
                <strong>{q.title}</strong>
                <small className="muted">{q.desc}</small>
                <small className="reward">{rewardText(q.reward)}</small>
              </div>
              {q.claimed ? (
                <span className="tag tag--on">Claimed</span>
              ) : (
                <button className="btn btn-small" disabled={busy === `q:${q.id}` || !q.done}
                  onClick={() => run(`q:${q.id}`, () => api.claimQuest(q.id), 'Reward claimed!')}>
                  {q.done ? 'Claim' : 'Locked'}
                </button>
              )}
            </li>
          ))}
          {quests.length === 0 && <li className="muted">No quests available.</li>}
        </ul>
      </section>
    </div>
  );
}
