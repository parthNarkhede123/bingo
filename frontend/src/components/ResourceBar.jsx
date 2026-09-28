import { useGame } from '../context/GameContext';
import { materialColor, cap as capName } from '../game/constants';
import { num } from '../game/format';

const xpForLevel = (lvl) => Math.round(60 * Math.pow(lvl, 1.6));

// Persistent header strip showing the Hold's core resources. Reads live state
// from GameContext; the server has already settled harvest/returns on fetch.
export default function ResourceBar() {
  const { hold } = useGame();
  if (!hold) return null;

  const need = xpForLevel(hold.level);
  const xpPct = Math.min(100, Math.round(((hold.xp || 0) / need) * 100));
  const foreignCount = Object.keys(hold.foreignMaterials || {}).length;

  return (
    <div className="resbar">
      <div className="resbar__item resbar__mat" title="Your Hold's material (harvested passively)">
        <span className="dot" style={{ background: materialColor(hold.material.type) }} />
        <div>
          <strong>{capName(hold.material.type)}</strong>
          <small>{num(hold.material.amount)} / {num(hold.material.cap)} · +{num(hold.material.rate)}/h</small>
        </div>
      </div>

      <div className="resbar__stats">
        <span title="Conquest Points — the season ranking">👑 {num(hold.cp)}</span>
        <span title="Gems — recruit commanders, from ads/mines/quests">💎 {num(hold.gems)}</span>
        <span title="Scrap — salvage/crafting">♻️ {num(hold.scrap)}</span>
        <span title="Troops (wounded recover over time)">🪖 {num(hold.troops)}{hold.wounded ? ` (+${num(hold.wounded)}🩹)` : ''}</span>
        <span title="Foreign materials held (from trade/raids)">📦 {foreignCount}</span>
      </div>

      <div className="resbar__level" title={`Level ${hold.level} · ${num(hold.xp)}/${num(need)} XP`}>
        <div className="resbar__lvl-top">
          <span>Lv {hold.level}</span>
          {hold.skillPoints > 0 && <span className="pip">{hold.skillPoints} SP</span>}
        </div>
        <div className="xpbar"><div className="xpbar__fill" style={{ width: `${xpPct}%` }} /></div>
      </div>
    </div>
  );
}
