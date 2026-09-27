# Bingo Arena — Developer Guide

Everything you need to run, understand, test, and extend the codebase.

## 1. Prerequisites
- **Node.js ≥ 18** (developed on Node 26). Check: `node -v`.
- **MongoDB**: a connection string. Options:
  - Free **MongoDB Atlas** cluster (recommended, works everywhere).
  - Local `mongod` (`mongodb://127.0.0.1:27017/bingo`).
  - Tests need no external DB — they spin up an in-memory MongoDB automatically.

## 2. First-time setup

```bash
git clone <your-repo> bingo && cd bingo

# Backend
cd backend
cp .env.example .env
#   → set MONGO_URI and a strong JWT_SECRET:
#     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
npm run dev            # nodemon, http://localhost:4000

# Frontend (second terminal)
cd ../frontend
cp .env.example .env   # VITE_API_URL=http://localhost:4000
npm install
npm run dev            # http://localhost:5173
```

Open http://localhost:5173, register two accounts in two browsers (or one
normal + one incognito window), click **Find a Match** in both, and play.

## 3. Environment variables

### Backend (`backend/.env`)
| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | development | `production` enforces a strong `JWT_SECRET` |
| `PORT` | 4000 | HTTP/WS port |
| `CLIENT_ORIGIN` | http://localhost:5173 | Comma-separated allowed origins (CORS + socket) |
| `MONGO_URI` | mongodb://127.0.0.1:27017/bingo | Database connection |
| `JWT_SECRET` | (dev placeholder) | **Must** be ≥32 random chars in production |
| `JWT_EXPIRES_IN` | 7d | Token lifetime |
| `BCRYPT_ROUNDS` | 12 | Password hash cost |
| `SETUP_SECONDS` | 30 | Board setup timer |
| `TURN_SECONDS` | 20 | Per-turn timer |
| `RECONNECT_GRACE_SECONDS` | 30 | Reconnect window before forfeit |
| `MAX_TIMEOUTS` | 3 | Auto-play misses before forfeit |
| `RATE_WINDOW_MS` / `RATE_MAX` / `AUTH_RATE_MAX` | 60000 / 100 / 10 | REST rate limits |

### Frontend (`frontend/.env`)
| Var | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL (REST + socket) |
| `VITE_ADSENSE_CLIENT` | AdSense publisher id (blank → placeholder ads) |
| `VITE_ADSENSE_SLOT` | AdSense slot id |

## 4. Code map

```
backend/src/
  index.js              # boot: config check → DB → HTTP + sockets → listen
  app.js                # Express app (helmet, cors, json cap, routes, errors)
  config/
    index.js            # env config + production safety assertion
    db.js               # Mongoose connect with retry
  models/
    User.js, Match.js   # Mongoose schemas
  middleware/
    auth.js             # signToken / verifyToken / requireAuth
    rateLimit.js        # api + auth limiters
    errorHandler.js     # 404 + central error handler
  routes/
    auth.js             # register / login / me
    leaderboard.js      # leaderboard + player profile
  game/                 # PURE, network-free game logic (fully unit-tested)
    lines.js            # the 12 line index sets
    engine.js           # board validation, random board, line counting
    match.js            # Match state machine (turns, calls, win, forfeit)
    rating.js           # Elo
  sockets/
    index.js            # Socket.IO setup, auth, event dispatch, matchmaking sweep
    matchmaker.js       # rating-band queue
    gameManager.js      # live match sessions, timers, finalize + persistence
    rateLimiter.js      # per-socket token bucket

frontend/src/
  main.jsx, App.jsx     # entry + router
  api/client.js         # REST wrapper
  api/socket.js         # socket singleton
  context/AuthContext.jsx
  components/           # Navbar, ProtectedRoute, BingoBoard, BingoLetters, Ad
  pages/                # Home, Login, Register, Play, Leaderboard, Profile
  styles/global.css
```

## 5. Design principles
- **Server owns truth.** The client never decides legality or outcomes. It sends
  `board:submit` and `game:call`; everything else is validated and computed
  server-side in `game/` and `sockets/gameManager.js`.
- **Pure core.** `game/` has no I/O, so rules are tested in milliseconds with
  Node's built-in test runner (no DB, no network).
- **Fail safe.** Invalid input is rejected with a typed `error`, never a crash.

## 6. Game flow (what happens on the wire)

1. Client connects with `auth: { token }`. The server verifies the JWT in
   `io.use` and attaches `userId`, `username`, `rating` to the socket.
2. Client emits `queue:join`. The matchmaker pairs two players within a rating
   band that widens the longer you wait.
3. Server creates a match and emits `match:found` to each player with their own
   random board and the opponent's public info. **Setup phase** begins.
4. During setup a player may rearrange their board and emit `board:submit`.
   The server re-validates (`validateBoard`) and echoes `board:accepted`.
   When both are ready — or the setup timer fires — `game:start` is emitted.
5. On your turn you emit `game:call { number }`. The server validates the turn
   and number, marks it on **both** boards, recomputes completed lines, and
   broadcasts `game:update` with the number, whose turn is next, and both scores.
6. First player to 5 completed lines wins → `game:over` with per-player result,
   reason, and Elo change. The match is persisted and cleaned up.

Edge cases handled server-side: turn timeout (auto-call, then forfeit after
`MAX_TIMEOUTS`), resign (`game:leave`), disconnect (grace timer then forfeit),
reconnect (`game:state` snapshot rebuilds the client), and simultaneous bingo
(higher line count wins, exact tie is a draw).

### Socket events
| Direction | Event | Payload |
|---|---|---|
| C→S | `queue:join` / `queue:leave` | — |
| C→S | `board:submit` | `{ board: number[25] }` |
| C→S | `game:call` | `{ number }` |
| C→S | `game:leave` | — |
| S→C | `queue:waiting` | `{ size }` |
| S→C | `match:found` | `{ matchId, yourBoard, opponent, setupDeadline }` |
| S→C | `board:accepted` | `{ board }` |
| S→C | `game:start` | `{ firstPlayer, turnDeadline }` |
| S→C | `game:update` | `{ number, by, nextTurn, turnDeadline, scores, over }` |
| S→C | `game:over` | `{ result, reason, ratingChange, newRating, yourScore, opponentScore }` |
| S→C | `game:state` | reconnect snapshot |
| S→C | `opponent:disconnected` / `opponent:reconnected` | `{ graceSeconds }` |
| S→C | `error` | `{ code, message }` |

## 7. Testing

```bash
cd backend
npm test                 # 33 unit tests (game engine, match, rating) — no DB
npm run test:integration # auth, security, full-game jest suites (in-memory Mongo)
node tests/smoke.js      # boots the real server in production mode, hits /health
```

- **Unit** (`node --test`): pure logic. Fast, deterministic. Add cases here first.
- **Integration** (`jest --runInBand`): real Express + Socket.IO + in-memory
  MongoDB via `tests/testServer.js`. Runs serially to keep timers predictable.
- The full-game test uses hand-designed boards so a specific call sequence forces
  a decisive winner even though every call marks both boards. If you change line
  logic, re-derive those fixtures.

Frontend: `npm run build` must succeed with no errors before shipping.

## 8. Conventions
- CommonJS on the backend (`require`), ESM + JSX on the frontend.
- Socket errors are always `{ code, message }` — `code` is machine-readable,
  `message` is user-facing. Reuse existing codes where possible.
- Keep `game/` free of any I/O, timers, or socket references so it stays testable.
- Timers live only in `gameManager.js`; always clear them in `cleanup`/`shutdown`.
- Money-touching or auth-touching change → add a test in `security.jest.js`.

## 9. Extending the game
- **New win condition / board size:** edit `game/lines.js` and the `SIZE`/`CELLS`
  constants in `engine.js`; unit tests will guide the rest.
- **New socket event:** add a `limited(...)` handler in `sockets/index.js`, do all
  validation in `gameManager.js`, and document it in the table above.
- **Persistence / replay:** every finished match is already stored in the `Match`
  collection with boards, called numbers, and move order — build replay on top.
- **Scale-out:** the only in-memory state is the matchmaker queue and live
  sessions. Move those to Redis (with the socket.io Redis adapter) to run multiple
  instances. See `docs/ARCHITECTURE.md` for the path.
