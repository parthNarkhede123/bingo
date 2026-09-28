# Ironhold — Build Session Log

> **Pivot (2026-09-28):** This project began as **Bingo Arena**, a real-time 1v1
> multiplayer Bingo game. It was later pivoted into **Ironhold — The Siege Week**,
> a light week-long browser strategy/trade game, reusing the same hardened
> platform (auth, security, CI/CD, Render + Atlas deploy). The Bingo game layer
> was removed; the sections below the divider are the original Bingo build log,
> kept as history. The live deploy still uses the `bingo-arena` service names
> (and `bingo-arena.onrender.com`) so the running deployment and its configured
> secrets were preserved across the pivot.

## Ironhold at a glance

- **One week-long season.** Win by topping the **Conquest Points** ladder.
- **Server-authoritative Hold** (one doc/player/season). State is resolved
  lazily from timestamps on read; a sweeper advances marches, wild mines, and
  season rollover. The map is procedural (biome derived from coordinates), so
  it costs no storage.
- **Forced interdependence:** each biome yields exactly one of ten materials;
  crafting, upgrading and winning need foreign materials, so players must trade
  (escrow-based offers) or raid for them.
- **Systems:** 4 stances × 3-slot gear loadouts, chests → gear → salvage/forge,
  XP → levels → skill points, two gem-recruited commanders (Durgan auto-loadout,
  Wren scouting) with 12h season-start trials, quests, ad-reward gems, and light
  non-aggression pacts that block attacks both ways.
- **Frontend screens:** Keep, Map (raid/scout/mine), Barracks (gear/skills/forge),
  Bazaar (trade offers + pacts), War Room (commanders/quests/ads), Reports.

---

# Bingo Arena — Build Session Log

A record of how this application was designed, built, tested, and hardened, so a
future maintainer can understand not just *what* exists but *why*.

## Goal

A deployment-ready, real-time multiplayer Bingo web app in the spirit of
chess.com: online 1v1 matches, an Elo ranking system, a leaderboard, ad-based
monetization, and a free / minimal-cost hosting path. Correctness and security
("so no one can hack it") were explicit, first-class requirements.

## Game rules implemented

A 5×5 board holds the numbers 1–25 (each once). Players take turns calling one
uncalled number; every call is marked on **both** boards. A completed row,
column, or diagonal is one letter of B-I-N-G-O. The first player to complete
**five** lines wins. If a single call pushes both players to five lines, the
higher line count wins and an exact tie is a draw.

## Architecture at a glance

- **Backend:** Node.js + Express + Socket.IO + MongoDB (Mongoose). All game
  rules are server-authoritative in a pure, unit-tested core (`src/game/`).
- **Frontend:** React + Vite + React Router + socket.io-client.
- **Real-time:** one Socket.IO connection per player; matchmaking, setup, play,
  and end-of-game are all event-driven.
- **Persistence:** users (with rating/stats) and a full audit record of every
  finished match (boards + move list + rating deltas).

See `docs/ARCHITECTURE.md` for the full design, protocol tables, and the
scale-out path (Redis) when a single instance is no longer enough.

## Key design decisions
- **Server owns all truth.** Clients only *propose* a call; the `Match` state
  machine validates and computes everything. This is the core anti-cheat.
- **Pure game core.** `src/game/` has no I/O, so rules are tested in
  milliseconds without a DB or network.
- **Fail-closed secrets.** The server refuses to boot without a strong
  `JWT_SECRET` in every environment (a fix from the security audit).
- **Free-tier first.** Single process, MongoDB Atlas free tier, static frontend
  on a CDN. Horizontal scaling is documented but not required to launch.
- **Ads that degrade gracefully.** The ad component renders a placeholder until
  a real AdSense client id is configured, so nothing breaks pre-approval.

## Testing
- **41 unit tests** (`npm test`, Node's built-in runner): game engine, match
  state machine, Elo, and the security-hardening regressions. No DB/network.
- **18 integration tests** (`npm run test:integration`, Jest + supertest +
  in-memory MongoDB + a real Socket.IO server): auth, security controls, and a
  full end-to-end game that plays a scripted sequence to a decisive winner and
  asserts the resulting ratings.
- **Smoke test** (`node tests/smoke.js`): boots the real server in production
  mode against in-memory Mongo and checks `/api/health`.
- **Frontend:** `npm run build` produces a clean production bundle.

All suites pass.

## Security audit

An adversarial multi-agent penetration test (36 agents: seven attack dimensions
plus per-finding refutation/verification) was run against the code. It surfaced
one critical, several high, and a set of medium/low issues. Twelve were fixed in
this build — most importantly a JWT signing-key fail-open that allowed full
token forgery — and the remaining residual risks are documented with their
mitigations. Full report: `docs/SECURITY.md`.

Highlights fixed: fail-closed JWT secret, socket handshake rate-limiting + a
connection cap, a timing-based user-enumeration oracle, unbounded matchmaking,
stale-rating matchmaking, non-atomic result persistence, plaintext-password
reflection in error responses, and setup-phase rating farming.

## Repository layout

```
README.md                 # overview + quick start
SESSION.md                # this file
docs/
  ARCHITECTURE.md         # design, protocol, data model, scaling
  DEVELOPER_GUIDE.md      # setup, code map, testing, conventions
  DEPLOYMENT_GUIDE.md     # free/low-cost deploy + ad monetization
  SECURITY.md             # threat model, pentest findings, resolutions
backend/                  # Express + Socket.IO + MongoDB API and game server
frontend/                 # React + Vite client
```

## Status

Feature-complete and deployment-ready. Backend and frontend build and all test
suites pass. To go live: provision MongoDB Atlas, set the environment variables,
deploy the backend and the static frontend, then apply for AdSense — every step
is in `docs/DEPLOYMENT_GUIDE.md`.

## Suggested next steps (not required to launch)
- Add a Privacy Policy + consent banner (required before ads).
- Move rate-limit and matchmaking state to Redis when scaling past one instance.
- Add short-lived access tokens + refresh (or httpOnly cookies) to retire the
  localStorage token.
- Build match replay on top of the persisted move logs.
