import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

/**
 * Shared game state for the authenticated app. Owns the current Hold (the
 * server's serialized, already-settled state), a refresh() that re-fetches it,
 * and a lightweight toast/notice queue fed by both actions and live socket
 * nudges (attack:incoming, march:resolved, trade:accepted, report:new).
 *
 * The server is the sole authority: sockets only tell us "something changed",
 * and we re-pull the Hold over REST rather than trusting any pushed state.
 */
const GameContext = createContext(null);

let noticeSeq = 0;

export function GameProvider({ children }) {
  const { user } = useAuth();
  const [hold, setHold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState([]);
  const timers = useRef({});

  const pushNotice = useCallback((text, kind = 'info') => {
    const id = ++noticeSeq;
    setNotices((list) => [...list, { id, text, kind }]);
    timers.current[id] = setTimeout(() => {
      setNotices((list) => list.filter((n) => n.id !== id));
      delete timers.current[id];
    }, 6000);
  }, []);

  const dismissNotice = useCallback((id) => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  // Accept a Hold returned by any action so the UI updates without a round-trip.
  const applyHold = useCallback((h) => { if (h) setHold(h); }, []);

  const refresh = useCallback(async () => {
    try {
      const { hold: h } = await api.getHold();
      setHold(h);
      setError('');
      return h;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  // Initial load whenever the signed-in user changes.
  useEffect(() => {
    if (!user) { setHold(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.getHold()
      .then(({ hold: h }) => { if (alive) { setHold(h); setError(''); } })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user]);

  // Live nudges: on any relevant event, surface a notice and re-pull the Hold.
  useEffect(() => {
    if (!user) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    const onIncoming = (p) => { pushNotice('⚠️ Incoming attack on your Hold!', 'danger'); };
    const onResolved = (p) => {
      const map = { attack: 'Your attack has resolved.', defended: 'Your Hold was attacked!', scout: 'A scouting report arrived.' };
      pushNotice(map[p && p.kind] || 'A march has resolved.', 'info');
      refresh().catch(() => {});
    };
    const onTrade = (p) => {
      pushNotice(`🤝 ${p && p.by ? p.by : 'Someone'} accepted your trade offer.`, 'good');
      refresh().catch(() => {});
    };
    const onReport = (p) => { pushNotice(`📜 New report${p && p.title ? `: ${p.title}` : ''}.`, 'info'); };

    socket.on('attack:incoming', onIncoming);
    socket.on('march:resolved', onResolved);
    socket.on('trade:accepted', onTrade);
    socket.on('report:new', onReport);
    socket.on('hold:update', () => refresh().catch(() => {}));

    return () => {
      socket.off('attack:incoming', onIncoming);
      socket.off('march:resolved', onResolved);
      socket.off('trade:accepted', onTrade);
      socket.off('report:new', onReport);
      socket.off('hold:update');
    };
  }, [user, pushNotice, refresh]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const value = { hold, loading, error, refresh, applyHold, pushNotice, notices, dismissNotice };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
