// Renders the B-I-N-G-O progress. `count` = number of completed lines (0..5+).
const LETTERS = ['B', 'I', 'N', 'G', 'O'];

export default function BingoLetters({ count = 0, label }) {
  return (
    <div className="bingo-letters" aria-label={`${label || 'Bingo'} progress ${Math.min(count, 5)} of 5`}>
      {label && <span className="bingo-letters__label">{label}</span>}
      <div className="bingo-letters__row">
        {LETTERS.map((l, i) => (
          <span key={l} className={`letter ${i < count ? 'letter--on' : ''}`}>{l}</span>
        ))}
      </div>
    </div>
  );
}
