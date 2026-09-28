import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useGame } from '../context/GameContext';
import { MATERIALS, materialColor, cap } from '../game/constants';
import { num, countdown } from '../game/format';

function Mat({ m, qty }) {
  return (
    <span className="matq">
      <span className="dot" style={{ background: materialColor(m) }} />
      {num(qty)} {cap(m)}
    </span>
  );
}

export default function Trade() {
  const { hold, applyHold, pushNotice } = useGame();
  const [offers, setOffers] = useState([]);
  const [pacts, setPacts] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ giveMaterial: '', giveQty: 100, wantMaterial: '', wantQty: 100, toUsername: '' });
  const [pactTarget, setPactTarget] = useState('');

  const reload = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([api.offers(), api.pacts()]);
      setOffers(o.offers || []);
      setPacts(p.pacts || []);
      setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      giveMaterial: f.giveMaterial || hold.material.type,
      wantMaterial: f.wantMaterial || MATERIALS.find((m) => m !== hold.material.type),
    }));
    reload();
  }, [reload, hold.material.type]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.hold) applyHold(res.hold);
      if (okMsg) pushNotice(okMsg, 'good');
      await reload();
      return res;
    } catch (e) { pushNotice(e.message, 'danger'); }
    finally { setBusy(''); }
  };

  const submitOffer = (e) => {
    e.preventDefault();
    if (form.giveMaterial === form.wantMaterial) return pushNotice('Trade two different materials.', 'danger');
    const body = {
      giveMaterial: form.giveMaterial, giveQty: Number(form.giveQty),
      wantMaterial: form.wantMaterial, wantQty: Number(form.wantQty),
    };
    if (form.toUsername.trim()) body.toUsername = form.toUsername.trim();
    run('create', () => api.createOffer(body), 'Offer posted — your goods are escrowed.');
  };

  const mine = (o) => o.fromUsername === hold.username;

  return (
    <div className="page">
      <div className="page-head"><h1>🤝 Bazaar</h1><span className="muted">Every biome yields one material — trade for the rest.</span></div>
      {error && <p className="error">{error}</p>}

      <div className="grid grid--2">
        <section className="panel">
          <h2>Post an offer</h2>
          <form onSubmit={submitOffer} className="offer-form">
            <div className="offer-form__row">
              <label className="field"><span>You give</span>
                <select value={form.giveMaterial} onChange={(e) => setForm({ ...form, giveMaterial: e.target.value })}>
                  {MATERIALS.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                </select>
              </label>
              <input type="number" min="1" value={form.giveQty} onChange={(e) => setForm({ ...form, giveQty: e.target.value })} />
            </div>
            <div className="offer-form__row">
              <label className="field"><span>You want</span>
                <select value={form.wantMaterial} onChange={(e) => setForm({ ...form, wantMaterial: e.target.value })}>
                  {MATERIALS.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                </select>
              </label>
              <input type="number" min="1" value={form.wantQty} onChange={(e) => setForm({ ...form, wantQty: e.target.value })} />
            </div>
            <label className="field"><span>To (optional — leave blank for open market)</span>
              <input type="text" placeholder="username" value={form.toUsername} onChange={(e) => setForm({ ...form, toUsername: e.target.value })} />
            </label>
            <button className="btn" disabled={busy === 'create'}>Post offer (escrows the give side)</button>
          </form>
        </section>

        <section className="panel">
          <h2>Pacts</h2>
          <p className="muted small">A non-aggression pact blocks attacks both ways until season end.</p>
          <div className="pact-new">
            <input type="text" placeholder="lord's username" value={pactTarget} onChange={(e) => setPactTarget(e.target.value)} />
            <button className="btn btn-small" disabled={busy === 'pact' || pactTarget.trim().length < 3}
              onClick={() => run('pact', () => api.createPact(pactTarget.trim()), 'Pact proposed.').then(() => setPactTarget(''))}>Propose</button>
          </div>
          <ul className="pact-list">
            {pacts.map((p) => (
              <li key={p._id}>
                <span>🕊️ {p.with}</span>
                <span className="muted small">expires {countdown(p.expiresAt)}</span>
                <button className="btn btn-small btn-ghost ml-auto" disabled={busy === `break:${p._id}`}
                  onClick={() => run(`break:${p._id}`, () => api.breakPact(p._id), 'Pact broken.')}>Break</button>
              </li>
            ))}
            {pacts.length === 0 && <li className="muted">No pacts. Make an ally.</li>}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h2>Open offers</h2>
        {offers.length === 0 && <p className="muted">No offers on the market. Post one above.</p>}
        <div className="offer-grid">
          {offers.map((o) => (
            <div key={o._id} className={`offer ${mine(o) ? 'offer--mine' : ''}`}>
              <div className="offer__who">{mine(o) ? 'You' : o.fromUsername}{o.toUserId ? ' · direct' : ''}</div>
              <div className="offer__trade">
                <Mat m={o.giveMaterial} qty={o.giveQty} />
                <span className="offer__arrow">→</span>
                <Mat m={o.wantMaterial} qty={o.wantQty} />
              </div>
              {mine(o) ? (
                <button className="btn btn-small btn-ghost" disabled={busy === `c:${o._id}`}
                  onClick={() => run(`c:${o._id}`, () => api.cancelOffer(o._id), 'Offer cancelled — escrow returned.')}>Cancel</button>
              ) : (
                <button className="btn btn-small" disabled={busy === `a:${o._id}`}
                  onClick={() => run(`a:${o._id}`, () => api.acceptOffer(o._id), 'Trade complete!')}>Accept</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
