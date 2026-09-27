# Bingo Arena — Architecture & Design

> Analysis, decisions, and system design for a real-time, ranked, multiplayer
> Bingo web application. This is the "why" document; see DEVELOPER_GUIDE.md for
> the "how".

## 1. Requirements analysis

### 1.1 Product goal
A free-to-play, browser-based, 1‑v‑1 online Bingo game modeled on chess.com:
players are matched in real time, play a fast turn-based match, and are ranked
on a global ladder. Revenue comes from advertising, so hosting must be free or
near-free at low traffic and scale gracefully.

### 1.2 The game (canonical rules used here)
- Each player owns a **5×5** board containing the numbers **1–25**, each exactly
  once (a permutation).
- Players **alternate turns**. On your turn you **call one number** (1–25) that
  has not been called yet.
- A called number is **marked on both boards**.
- A **line** is any full row, column, or the two diagonals (12 lines total).
- Each completed line = one letter of **B‑I‑N‑G‑O**. **5 completed lines wins.**
- If a single call pushes both players to ≥5 lines, the higher line count wins;
  an exact tie is a **draw**. (Documented tie-break; deterministic.)

### 1.3 Functional requirements
1. Account registration, login, session via JWT.
2. Real-time matchmaking (pair two waiting players).
3. Board setup phase (arrange 1–25) with a timer.
4. Turn-based play with a per-turn timer and auto-play on timeout.
5. Server-authoritative rules and win detection.
6. Elo rating updates after each rated match.
7. Global leaderboard and per-player profile with match history.
8. Reconnection: survive a brief disconnect without losing the game.
9. Ad slots for monetization.

### 1.4 Non-functional requirements
- **Security:** server-authoritative, no client trust; hardened against common
  web/websocket attacks (see SECURITY.md).
- **Cost:** deployable on free tiers; single-process friendly.
- **Latency:** turn updates feel instant (<150 ms typical on the same region).
- **Correctness:** game logic covered by automated tests; no rule ambiguity.
- **Portability:** 12-factor config via environment variables.

## 2. Technology choices & rationale

| Concern | Choice | Why |
|---|---|---|
| Realtime transport | **Socket.IO** | Battle-tested, auto-reconnect, rooms, fallback; simple server-authoritative model. |
| Backend runtime | **Node.js + Express** | Same language as frontend, huge ecosystem, cheap to host, non-blocking I/O fits many concurrent sockets. |
| Database | **MongoDB (Mongoose)** | Generous free tier (Atlas 512 MB), flexible documents for match history, simple to operate. |
| Auth | **JWT + bcrypt** | Stateless tokens work across REST + websockets without server session storage; bcrypt is the standard for password hashing. |
| Frontend | **React + Vite** | Fast DX, tiny production bundle, static output deployable to any CDN for free. |
| Ranking | **Elo** | Well-understood, transparent, cheap to compute, proven in chess.com-style ladders. |
| Ads | **Google AdSense** | No upfront cost, pays per impression/click, drop-in `<ins>` slots. |

**Why server-authoritative?** Bingo is trivially cheatable if the client
reports its own board state or win. The server owns every board, the called-set,
whose turn it is, and win detection. Clients may only *propose* "call number N".

## 3. High-level architecture

```
        ┌──────────────┐        HTTPS/WSS         ┌───────────────────────────┐
        │   Browser    │  ───────────────────────▶│        Node server        │
        │ React (Vite) │   REST: auth/leaderboard  │  Express (REST API)       │
        │ socket.io-cli│   WS:   game events       │  Socket.IO (realtime)     │
        └──────────────┘◀───────────────────────── │  GameManager (authority)  │
                                                    │  Matchmaker (queue)       │
                                                    └───────────┬───────────────┘
                                                                │ Mongoose
                                                                ▼
                                                        ┌───────────────┐
                                                        │   MongoDB     │
                                                        │ users, matches│
                                                        └───────────────┘
```

- **Stateless REST** for registration, login, leaderboard, profiles.
- **Stateful sockets** for live play. Match state lives in memory (fast) and is
  persisted to MongoDB only when a match ends (history + rating).
- **Single process** by default (fits free tiers). Horizontal scaling notes are
  in §8.

## 4. Data model

### User
| Field | Type | Notes |
|---|---|---|
| username | string (unique) | 3–20 chars, `[a-zA-Z0-9_]` |
| usernameLower | string (unique) | case-insensitive lookups |
| email | string (unique) | validated, lowercased |
| passwordHash | string | bcrypt, `select:false` (never returned) |
| rating | number | Elo, default 1000 |
| peakRating | number | highest ever |
| wins / losses / draws / gamesPlayed | number | stats |
| lastSeen / timestamps | date | activity |

### Match (persisted on completion)
`players[]` (userId, username, ratingBefore/After/Delta, board), `calledNumbers`,
`moves[]` (number, by), `winner`, `result` (`decided`\|`draw`), `reason`,
`rated`, `startedAt`, `endedAt`. Full boards + moves are stored so any match can
be **replayed and audited** for disputes or anti-cheat review.

## 5. Real-time protocol (Socket.IO)

Auth: the JWT is sent in the handshake `auth.token`; the server verifies it and
binds `userId` to the socket. One live socket per user is enforced.

**Client → Server**
| Event | Payload | Effect |
|---|---|---|
| `queue:join` | – | Enter matchmaking |
| `queue:leave` | – | Leave matchmaking |
| `board:submit` | `{ board:number[25] }` | Lock a custom board during setup (validated) |
| `game:call` | `{ number }` | Call a number on your turn |
| `game:leave` | – | Resign / forfeit |

**Server → Client**
| Event | Payload | Meaning |
|---|---|---|
| `queue:waiting` | `{ size }` | Waiting for an opponent |
| `match:found` | `{ matchId, yourBoard, opponent, setupDeadline }` | Paired; setup begins |
| `board:accepted` | `{ board }` | Your board is locked |
| `game:start` | `{ firstPlayer, turnDeadline }` | Play begins |
| `game:update` | `{ number, by, nextTurn, turnDeadline, scores, over }` | A move happened |
| `game:over` | `{ result, reason, ratingChange, newRating, yourScore, opponentScore }` | Match ended |
| `game:state` | full snapshot | Sent on reconnect |
| `opponent:disconnected` / `opponent:reconnected` | – | Opponent presence |
| `error` | `{ code, message }` | Rejected action |

## 6. Game state machine

Per match: `SETUP → PLAYING → OVER`.

- **SETUP** (timer `SETUP_SECONDS`): both players get a server-generated random
  board and may rearrange/lock it. When both lock, or the timer fires, play
  starts with whatever board each player has.
- **PLAYING** (per-turn timer `TURN_SECONDS`): the player on move calls an
  uncalled number. The `Match` validates turn/range/duplicate, marks both
  boards, recomputes completed lines, and checks the win condition. On a
  timeout, the server auto-calls a random uncalled number for the player; after
  `MAX_TIMEOUTS` such misses that player forfeits.
- **OVER:** ratings computed, match persisted, both clients notified, timers
  cleared, in-memory session freed.

All transitions and validation live in `backend/src/game/match.js` and
`backend/src/sockets/gameManager.js`. They are pure enough to unit-test without
a network or database (see `backend/tests/`).

## 7. Matchmaking

A single in-memory queue keyed by userId. On join we pair with the closest-rated
waiting player within an **acceptance band** that widens the longer someone
waits (±100 initially, +50 every 5 s, capped). A periodic sweep pairs
long-waiters. This keeps early matches fair while guaranteeing nobody is stuck.

## 8. Rating system (Elo)

`expected = 1 / (1 + 10^((opp − me)/400))`, `new = round(me + K·(score − expected))`.
K is provisional-aware: 40 for new players (<30 games), 24 normally, 16 for
2100+ (stability at the top). A rating floor of 100 prevents degenerate values.
See `backend/src/game/rating.js` and its tests.

## 9. Scalability path (beyond the free single instance)

The only stateful, in-memory pieces are the matchmaking queue and live match
sessions. To scale horizontally later:
1. Add the **Socket.IO Redis adapter** so events fan out across instances.
2. Move the **matchmaking queue to Redis** (atomic pop of two players).
3. Pin a match's sockets to one instance (sticky sessions) or store live match
   state in Redis so any instance can serve any socket.

Until then, one instance comfortably handles thousands of concurrent sockets,
which is far beyond early traffic.

## 10. Monetization

Ad slots (`frontend/src/components/Ad.jsx`) render Google AdSense units when
`VITE_ADSENSE_CLIENT` is configured, and a labelled placeholder otherwise. Slots
are placed on the home, leaderboard, and the game sidebar — never over the board
or mid-turn, to protect UX and comply with ad-network placement policies. See
DEPLOYMENT_GUIDE.md §Monetization for approval and revenue details.

## 11. Key risks & mitigations
- **Cheating** → server authority + board validation + full move audit log.
- **Abuse/DoS** → auth on every socket, per-socket token bucket, REST rate
  limits, payload caps, bounded pagination.
- **Free-tier cold starts** → DB reconnect retries; stateless REST; graceful
  shutdown. Document the "spin-down" behavior for users.
- **Rating farming** → rated matches require two distinct accounts matched by
  the server; single-socket-per-user; future IP/velocity checks noted in
  SECURITY.md.
