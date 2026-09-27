// Renders a 5x5 bingo board.
//   - editable=true (setup): clicking a cell selects it; clicking a second cell
//     swaps the two numbers. Used to arrange your board before the game.
//   - editable=false (play): shows marked cells; if it's your turn, clicking an
//     unmarked cell calls that number.
export default function BingoBoard({
  board,
  called = [],
  editable = false,
  selectedIndex = null,
  onCellClick,
  yourTurn = false,
  disabled = false,
}) {
  const calledSet = new Set(called);

  return (
    <div className={`board ${disabled ? 'board--disabled' : ''}`}>
      {board.map((num, idx) => {
        const marked = calledSet.has(num);
        const isSelected = selectedIndex === idx;
        const clickable = editable || (yourTurn && !marked && !disabled);
        return (
          <button
            key={idx}
            type="button"
            className={[
              'cell',
              marked ? 'cell--marked' : '',
              isSelected ? 'cell--selected' : '',
              clickable ? 'cell--clickable' : '',
            ].join(' ')}
            onClick={() => clickable && onCellClick && onCellClick(idx, num)}
            disabled={!clickable}
            aria-pressed={marked}
          >
            {num}
          </button>
        );
      })}
    </div>
  );
}
