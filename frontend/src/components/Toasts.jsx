import { useGame } from '../context/GameContext';

// Fixed-position notice stack fed by GameContext (actions + live socket nudges).
export default function Toasts() {
  const { notices, dismissNotice } = useGame();
  if (!notices.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`toast toast--${n.kind}`} onClick={() => dismissNotice(n.id)}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
