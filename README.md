# 🛡️ Ironhold — The Siege Week

A production-ready, free-to-play, browser-based **multiplayer strategy game**.
Rule a Hold for one **week-long season**, harvest your land's single material,
**trade** for everything else, forge gear from chests, march on rivals or mine
the wilds, and forge (or break) non-aggression pacts. Top the **Conquest Points**
ladder before the season resets and you win a crown.

Inspired by Million Lords / Lords Mobile (light 4X), Catan (forced trade), and
Albion Online (loadouts + gear). Designed to stay tiny on a free MongoDB Atlas
M0 tier: one Hold document per player per season, lazy timestamp-based
resolution, a procedurally-derived map, TTL'd ephemerals, and a weekly reset.

## Core loop

- **Your biome yields ONE material.** You physically cannot produce the other
  nine — so **trade is mandatory**, and diplomacy is the real game.
- **Four stances** — Assault ⚔️, Bulwark 🛡️, Harvest 🌾, March 🐎 — each with its
  own 3-slot gear loadout. Only your active stance's gear applies.
- **Chests → gear**, salvage into scrap, **forge** new gear from materials.
- **XP → levels → skill points**, plus troops and occasional chests.
- **Two legendary commanders**, gem-recruited (gems from ads, mines, quests),
  free for a 12h trial at season start: **Durgan** (auto-manages your stance)
  and **Wren** (scouts a rival's troops & defences).
- **Conquest Points** from battles, defends, trades, quests and upgrades decide
  the season. Highest CP at the deadline takes the crown.

## Repository layout

```
bingo/                      (repo name predates the Ironhold pivot)
├── backend/     Node.js + Express + Socket.IO + MongoDB (game server, API, auth)
├── frontend/    React + Vite single-page app (Keep, Map, Barracks, Bazaar, War Room)
└── docs/        Architecture, developer, deployment, and security documentation
```

## Quick start (local)

```bash
# 1. Backend
cd backend
cp .env.example .env          # then edit JWT_SECRET + MONGO_URI
npm install
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

You need a MongoDB instance. For local dev use a free
[MongoDB Atlas](https://www.mongodb.com/atlas) cluster or a local `mongod`.

## Documentation

| Document | Audience | Purpose |
|---|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Everyone | Design decisions, data model, protocol |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Developers | Setup, code walkthrough, testing, conventions |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Project owner | Deploy free / low-cost, configure ads |
| [docs/SECURITY.md](docs/SECURITY.md) | Developers / reviewers | Threat model, controls, pentest results |
| [SESSION.md](SESSION.md) | Everyone | Build log of how this project was created |

> Note: the `docs/` guides describe the original real-time-Bingo platform that
> Ironhold was built on top of. The hardened auth, deployment, and security
> foundations still apply; the game layer is Ironhold.

## Testing

```bash
cd backend
npm test                   # unit tests (game rules, leveling, security regressions) — no DB
npm run test:integration   # API + socket + security tests (in-memory MongoDB)
```

## Tech stack

- **Backend:** Node.js, Express, Socket.IO, Mongoose/MongoDB, JWT auth, bcrypt, Helmet, express-rate-limit
- **Frontend:** React 18, React Router, Vite, socket.io-client
- **Game model:** server-authoritative Hold state, lazy timestamp resolution, procedural map, TTL ephemerals
- **Monetization:** Google AdSense slots (non-intrusive, consent-gated)

## License

MIT. Play responsibly — this is a strategy game for entertainment, with **no
real-money gambling, wagering, or cash prizes**. Conquest Points, gems and
standings have no monetary value.
