// Renders a 5x5 bingo board. Empty cells (value 0) render blank.
//   - editable=true (setup): clicking an empty cell places the next number
//     (1, 2, 3 …); clicking a filled cell clears it. Used to arrange your board.
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
        const empty = !num;
        const marked = !empty && calledSet.has(num);
        const isSelected = selectedIndex === idx;
        const clickable = editable || (yourTurn && !marked && !disabled);
        return (
          <button
            key={idx}
            type="button"
            className={[
              'cell',
              marked ? 'cell--marked' : '',
              empty ? 'cell--empty' : '',
              isSelected ? 'cell--selected' : '',
              clickable ? 'cell--clickable' : '',
            ].join(' ')}
            onClick={() => clickable && onCellClick && onCellClick(idx, num)}
            disabled={!clickable}
            aria-pressed={marked}
          >
            {num || ''}
          </button>
        );
      })}
    </div>
  );
}
