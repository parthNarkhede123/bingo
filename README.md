# 🎯 Bingo Arena — Real-Time Multiplayer Bingo

A production-ready, online, ranked 1‑v‑1 Bingo game in the style of chess.com:
real-time matchmaking, an Elo ranking system, a global leaderboard, player
profiles, and an ad-supported free-to-play model.

## What the game is

Each player has a **5×5 board** filled with the numbers **1–25** (each once).
Players take turns **calling a number**; every call is marked on **both** boards.
Completing a **row, column, or diagonal** earns one letter of **B‑I‑N‑G‑O**.
The first player to complete **5 lines** wins the match and gains rating points.

## Repository layout

```
bingo/
├── backend/     Node.js + Express + Socket.IO + MongoDB (game server, API, auth)
├── frontend/    React + Vite single-page app (game UI, lobby, leaderboard)
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
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Everyone | Requirements analysis, design decisions, data model, protocol |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Developers | Setup, code walkthrough, testing, conventions |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Project owner | Deploy free / low-cost, configure ads & earn revenue |
| [docs/SECURITY.md](docs/SECURITY.md) | Developers / reviewers | Threat model, controls, pentest results |
| [SESSION.md](SESSION.md) | Everyone | Full build log of how this project was created |

## Testing

```bash
cd backend
npm test                   # 41 unit tests (game rules, Elo, security regressions) — no DB
npm run test:integration   # 18 API + socket + security tests (in-memory MongoDB)
node tests/smoke.js        # boots the real server in production mode, checks /health
```

## Tech stack

- **Backend:** Node.js, Express, Socket.IO, Mongoose/MongoDB, JWT auth, bcrypt, Helmet, express-rate-limit
- **Frontend:** React 18, React Router, Vite, socket.io-client
- **Ranking:** Elo with provisional K-factor
- **Monetization:** Google AdSense slots (non-intrusive, gated by env var)

## License

MIT — see individual package files. Play responsibly: this is a skill/luck game
for entertainment, not real-money gambling.
