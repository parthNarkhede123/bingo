import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';
import BingoBoard from '../components/BingoBoard';
import BingoLetters from '../components/BingoLetters';
import Ad from '../components/Ad';

function shuffled() {
  const a = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A fresh, empty setup board. 0 = no number placed yet (renders blank).
const emptyBoard = () => Array(25).fill(0);

// The next number to place: the lowest of 1..25 not already on the board, so
// tapping fills 1, 2, 3 … in order and refills gaps left by clearing a cell.
function nextNumberFor(board) {
  const used = new Set(board.filter((n) => n > 0));
  for (let n = 1; n <= 25; n += 1) if (!used.has(n)) return n;
  return null; // board is full
}

export default function Play() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const myId = user && user.id;

  const [phase, setPhase] = useState('idle'); // idle|searching|setup|playing|over
  const [board, setBoard] = useState([]);
  const [called, setCalled] = useState([]);
  const [opponent, setOpponent] = useState(null);
  const [turn, setTurn] = useState(null);
  const [myScore, setMyScore] = useState({ lines: 0, letters: 0 });
  const [oppScore, setOppScore] = useState({ lines: 0, letters: 0 });
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');
  const [locked, setLocked] = useState(false);
  const socketRef = useRef(null);

  // 1s ticker for countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) { navigate('/login'); return; }
    socketRef.current = socket;

    const onWaiting = () => setPhase('searching');
    const onFound = (data) => {
      setOpponent(data.opponent);
      setBoard(emptyBoard());
      setCalled([]);
      setMyScore({ lines: 0, letters: 0 });
      setOppScore({ lines: 0, letters: 0 });
      setResult(null);
      setLocked(false);
      setDeadline(data.setupDeadline);
      setPhase('setup');
      setNotice('');
    };
    const onAccepted = (data) => { setBoard(data.board); setLocked(true); setNotice('Board locked. Waiting for opponent…'); };
    const onStart = (data) => {
      if (data.yourBoard) setBoard(data.yourBoard);
      setPhase('playing'); setTurn(data.firstPlayer); setDeadline(data.turnDeadline); setNotice('');
    };
    const onUpdate = (u) => {
      setCalled((prev) => (u.number != null && !prev.includes(u.number) ? [...prev, u.number] : prev));
      if (u.scores) {
        setMyScore(u.scores[myId] || { lines: 0, letters: 0 });
        const oppKey = Object.keys(u.scores).find((k) => k !== myId);
        setOppScore((oppKey && u.scores[oppKey]) || { lines: 0, letters: 0 });
      }
      if (!u.over) { setTurn(u.nextTurn); setDeadline(u.turnDeadline); }
    };
    const onOver = (data) => {
      setPhase('over');
      setResult(data);
      if (data.yourScore) setMyScore(data.yourScore);
      if (data.opponentScore) setOppScore(data.opponentScore);
      setDeadline(null);
      refresh();
    };
    const onState = (s) => {
      // Reconnect: rebuild from snapshot.
      setBoard(s.yourBoard);
      setCalled(s.called || []);
      setTurn(s.turn);
      if (s.you) setMyScore(s.you);
      if (s.opponent) setOppScore(s.opponent);
      setPhase(s.over ? 'over' : (s.phase === 'setup' ? 'setup' : 'playing'));
    };
    const onOppDisc = (d) => setNotice(`Opponent disconnected. They have ${d.graceSeconds}s to return…`);
    const onOppRecon = () => setNotice('');
    const onQueueTimeout = (d) => { setPhase('idle'); setNotice((d && d.message) || 'No opponent found. Please try again.'); };
    const onError = (e) => {
      setNotice(e.message || 'Error');
      // A rejected/full queue join leaves us with nothing to wait for.
      if (e.code === 'QUEUE_FULL' || e.code === 'IN_GAME') setPhase('idle');
    };

    socket.on('queue:waiting', onWaiting);
    socket.on('match:found', onFound);
    socket.on('board:accepted', onAccepted);
    socket.on('game:start', onStart);
    socket.on('game:update', onUpdate);
    socket.on('game:over', onOver);
    socket.on('game:state', onState);
    socket.on('opponent:disconnected', onOppDisc);
    socket.on('opponent:reconnected', onOppRecon);
    socket.on('queue:timeout', onQueueTimeout);
    socket.on('error', onError);

    // Kick off matchmaking on mount.
    setPhase('searching');
    socket.emit('queue:join');

    return () => {
      socket.off('queue:waiting', onWaiting);
      socket.off('match:found', onFound);
      socket.off('board:accepted', onAccepted);
      socket.off('game:start', onStart);
      socket.off('game:update', onUpdate);
      socket.off('game:over', onOver);
      socket.off('game:state', onState);
      socket.off('opponent:disconnected', onOppDisc);
      socket.off('opponent:reconnected', onOppRecon);
      socket.off('queue:timeout', onQueueTimeout);
      socket.off('error', onError);
      // If still only searching, leave the queue on exit.
      socket.emit('queue:leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const myTurn = phase === 'playing' && turn === myId;

  const handleSetupCell = useCallback((idx) => {
    if (locked) return;
    setBoard((b) => {
      const nb = b.slice();
      if (nb[idx] > 0) { nb[idx] = 0; return nb; } // tap a placed cell to clear it
      const next = nextNumberFor(nb);
      if (next != null) nb[idx] = next;            // place the next number in sequence
      return nb;
    });
  }, [locked]);

  const randomize = () => { if (!locked) setBoard(shuffled()); };
  const clearBoard = () => { if (!locked) setBoard(emptyBoard()); };
  const undo = () => {
    if (locked) return;
    setBoard((b) => {
      let maxIdx = -1, maxVal = 0;
      b.forEach((n, i) => { if (n > maxVal) { maxVal = n; maxIdx = i; } });
      if (maxIdx < 0) return b;
      const nb = b.slice(); nb[maxIdx] = 0; return nb;
    });
  };
  const placedCount = board.filter((n) => n > 0).length;
  const lockIn = () => { if (placedCount === 25) socketRef.current.emit('board:submit', { board }); };
  const callNumber = (idx, num) => { if (myTurn) socketRef.current.emit('game:call', { number: num }); };
  const resign = () => { socketRef.current.emit('game:leave'); };
  const searchAgain = () => { setNotice(''); setPhase('searching'); socketRef.current.emit('queue:join'); };

  const playAgain = () => {
    setResult(null); setPhase('searching'); setCalled([]);
    setMyScore({ lines: 0, letters: 0 }); setOppScore({ lines: 0, letters: 0 });
    socketRef.current.emit('queue:join');
  };


  return (
    <div className="play">
      {phase === 'idle' && (
        <div className="center searching">
          <h2>No match right now</h2>
          {notice && <p className="muted">{notice}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={searchAgain}>Search again</button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>Home</button>
          </div>
        </div>
      )}

      {phase === 'searching' && (
        <div className="center searching">
          <div className="spinner" />
          <h2>Finding an opponent…</h2>
          <p className="muted">Matching you with a player near your rating.</p>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>Cancel</button>
        </div>
      )}

      {(phase === 'setup' || phase === 'playing' || phase === 'over') && (
        <div className="game-grid">
          <div className="game-main">
            <div className="game-head">
              <div>
                <strong>You</strong> ({user.rating})
                <BingoLetters count={myScore.lines} />
              </div>
              <div className="vs">vs</div>
              <div className="right">
                <strong>{opponent ? opponent.username : 'Opponent'}</strong>
                {opponent ? ` (${opponent.rating})` : ''}
                <BingoLetters count={oppScore.lines} label="" />
              </div>
            </div>

            {secondsLeft != null && phase !== 'over' && (
              <div className={`timer ${secondsLeft <= 5 ? 'timer--urgent' : ''}`}>
                {phase === 'setup' ? 'Arrange your board' : (myTurn ? 'Your turn' : "Opponent's turn")} · {secondsLeft}s
              </div>
            )}
            {notice && <div className="notice">{notice}</div>}

            <BingoBoard
              board={board}
              called={called}
              editable={phase === 'setup' && !locked}
              onCellClick={phase === 'setup' ? handleSetupCell : callNumber}
              yourTurn={myTurn}
              disabled={phase === 'over'}
            />

            {phase === 'setup' && !locked && (
              <div className="controls setup-controls">
                <p className="muted setup-hint">
                  Tap the squares to place <strong>1 → 25</strong> in any order.
                  Tap a placed square to clear it — or let us fill it for you.
                </p>
                <div className="setup-progress" aria-label={`${placedCount} of 25 placed`}>
                  <div className="setup-progress__bar" style={{ width: `${(placedCount / 25) * 100}%` }} />
                  <span>{placedCount}/25</span>
                </div>
                <div className="setup-buttons">
                  <button className="btn btn-ghost btn-small" onClick={undo} disabled={placedCount === 0}>↩ Undo</button>
                  <button className="btn btn-ghost btn-small" onClick={clearBoard} disabled={placedCount === 0}>✕ Clear</button>
                  <button className="btn btn-ghost btn-small" onClick={randomize}>🎲 Randomize</button>
                  <button className="btn btn-primary" onClick={lockIn} disabled={placedCount !== 25}>
                    {placedCount === 25 ? 'Lock in board' : `Place ${25 - placedCount} more`}
                  </button>
                </div>
              </div>
            )}

            {phase === 'playing' && (
              <div className="controls">
                <p className="muted">
                  {myTurn ? 'Tap an unmarked number on your board to call it.' : 'Waiting for opponent to call…'}
                </p>
                <button className="btn btn-danger btn-small" onClick={resign}>Resign</button>
              </div>
            )}
          </div>

          <aside className="game-side">
            <div className="panel">
              <h3>Called numbers</h3>
              <div className="called-list">
                {called.length === 0 && <span className="muted">None yet</span>}
                {called.map((n) => <span key={n} className="chip">{n}</span>)}
              </div>
            </div>
            <Ad label="Advertisement" placement="play" />
          </aside>
        </div>
      )}

      {phase === 'over' && result && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className={`result result--${result.result}`}>
              {result.result === 'win' ? '🏆 You win!' : result.result === 'loss' ? 'Defeat' : 'Draw'}
            </h2>
            <p className="muted">{reasonText(result.reason)}</p>
            <div className="rating-change">
              <span>Rating</span>
              <strong className={result.ratingChange >= 0 ? 'pos' : 'neg'}>
                {result.ratingChange >= 0 ? '+' : ''}{result.ratingChange}
              </strong>
              <span>→ {result.newRating}</span>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={playAgain}>Play again</button>
              <button className="btn btn-ghost" onClick={() => navigate('/')}>Home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function reasonText(reason) {
  switch (reason) {
    case 'BINGO': return 'Five lines completed.';
    case 'SIMULTANEOUS_BINGO': return 'Both reached five lines on the same call.';
    case 'FORFEIT': return 'A player resigned.';
    case 'DISCONNECT_FORFEIT': return 'A player disconnected.';
    case 'TIMEOUT_FORFEIT': return 'A player ran out of time too many times.';
    default: return '';
  }
}
