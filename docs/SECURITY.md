# Bingo Arena — Security & Pentest Report

This document records the threat model, the security controls in place, the
penetration-test that was run against the code, and every finding with its
resolution. It is written for developers and operators of this application.

## 1. Threat model

**Assets:** user accounts and credentials, match integrity (no cheating),
ratings/leaderboard integrity, and service availability.

**Trust boundary:** the client is fully untrusted. It can send arbitrary socket
and HTTP messages. Therefore **all** game rules, turn order, win detection, and
rating changes are computed server-side; the client can only *propose* actions.

**Adversaries considered:**
- An anonymous attacker hitting the public HTTP/WebSocket surface.
- A logged-in user trying to cheat (forge moves, play out of turn, farm rating).
- A user trying to impersonate another account or forge authentication.
- A user trying to exhaust server memory/CPU (denial of service).

## 2. Controls in place
- **Authentication:** JWT (HS256, single-algorithm allowlist), bcrypt password
  hashing (cost 12). Secret is required and validated at boot in every
  environment (fail-closed).
- **Server authority:** the `Match` state machine validates every call
  (turn, range, duplicate, game-over) before mutating state. Clients never
  compute outcomes.
- **Input validation:** express-validator on every REST body/param; a strict
  string/type check blocks NoSQL-operator injection (`{ $gt: "" }` is rejected,
  never evaluated).
- **HTTP hardening:** Helmet with a strict CSP (`default-src 'none'`), CORS
  allow-list, 16 KB JSON body cap, IP-based rate limits (general + stricter auth).
- **WebSocket hardening:** JWT handshake auth, per-IP handshake rate limit and a
  global connection cap enforced *before* a session is allocated, a per-socket
  token bucket on events, and a single-live-socket-per-user rule.
- **Auditability:** every finished match is persisted with both boards, the full
  move list, and rating deltas for dispute/anti-cheat review.

## 3. Penetration test methodology

An automated **adversarial multi-agent audit** was run against the codebase.
Seven independent analysts each attacked one dimension — authentication,
game-state integrity, injection, the socket layer, denial-of-service,
configuration/secrets, and game logic/economy. Every candidate finding was then
handed to a separate verifier agent instructed to *refute* it and reproduce it
against the real code and installed libraries. Only findings that survived
verification are treated as real. Thirty-six agents ran in total.

The injection surface (NoSQL, mass assignment, ReDoS, body-size limits) was
verified to be **correctly handled** — no action needed there.

## 4. Findings and resolutions

### Fixed in this build

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Critical | Hardcoded fallback JWT secret; the safety check only ran when `NODE_ENV === 'production'` exactly, so any other value (unset, `prod`, `staging`) booted with a public, source-visible signing key — full token forgery / auth bypass. | Removed the fallback. `assertProductionSafety()` now requires a ≥32-char `JWT_SECRET` in **every** environment (fail-closed). Local dev may opt into an *ephemeral per-process* secret with `ALLOW_INSECURE_JWT=1`. |
| 2 | High | Login anti-enumeration dummy bcrypt hash was malformed (59 chars), so `bcrypt.compare` short-circuited in ~0.02 ms vs ~200 ms for a real user — a timing oracle for account enumeration. | Compare unknown-user logins against a **valid** precomputed bcrypt hash (random input, configured cost) so both paths do equal work. |
| 3 | High | Socket.IO handshake had no rate limit or connection cap; engine.io allocated a session before auth, and the per-socket token bucket reset on every reconnect — connection-flood DoS and reconnect-churn amplification. | Added an `allowRequest` gate enforcing a per-IP handshake rate limit and a global concurrent-connection ceiling **before** any session is allocated. |
| 4 | High | Matchmaking queue was unbounded and swept with an O(n²) scan every 3 s; unmatchable entries never left. | Queue is capped (`MAX_QUEUE_SIZE`), stale entries are evicted after `MAX_QUEUE_WAIT_MS`, and the sorted sweep breaks early past the widest band (near-linear). |
| 5 | High | Socket rating was cached at handshake and never refreshed, so a long-lived socket matched at a stale band; persisted `ratingBefore` used the stale value and disagreed with `ratingAfter − delta`. | `queue:join` reads the current rating from the DB; `ratingBefore` is taken from the same fresh value used for the Elo computation. |
| 6 | High | `finalize` wrote both users then the match doc with no atomicity; a partial failure left one rating updated and the other not. | Writes now run in a MongoDB transaction on a replica set (Atlas), with an automatic fallback to sequential writes on a standalone (local/test). |
| 7 | Medium | The validation error response echoed the submitted `value`, leaking the plaintext password into 400 responses (and any logs/APM capturing bodies). | `handleValidation` returns only `{ path, msg }` — the submitted value is never reflected. |
| 8 | Medium | Matches abandoned during setup (before `game:start`) were fully rated, enabling rating/win farming by matching then bailing. | Matches that never left setup are recorded as **unrated** (no Elo, no win/loss stats); an audit record is still kept. |
| 9 | Medium | `trust proxy` was hardcoded to `1`; with the wrong proxy count, `X-Forwarded-For` could spoof `req.ip` and evade IP rate limits. | Configurable via `TRUST_PROXY` (default 1). Set `0` when running with no proxy. Documented in the deployment guide. |
| 10 | Low/Info | JWT verify had no algorithm allowlist; password max length (128) exceeded bcrypt's 72-byte limit. | Verify is locked to `HS256`; password input is capped at 72 bytes. |
| 11 | Info | `/api/health` disclosed the environment name. | Removed `env` from the health response. |
| 12 | Low | Leaderboard player lookup param wasn't constrained to the username charset. | Added the same `^[a-zA-Z0-9_]+$` allowlist used at registration. |

### Accepted / residual risks (documented, not fixed)

- **JWT in `localStorage`, no per-token revocation (medium/low).** Token-based
  auth is required for the WebSocket handshake. Mitigated by the strict CSP
  (blocks the XSS that would steal it) and a reduced **2-day** token lifetime
  (`JWT_EXPIRES_IN`). Rotating `JWT_SECRET` invalidates all tokens as a blunt
  kill switch. A future enhancement is short-lived access tokens + refresh, or
  httpOnly cookies with CSRF protection.
- **bcryptjs runs on the event loop (medium).** At cost 12 each hash blocks
  briefly. Mitigated by the auth rate limit and the new handshake limit. At
  scale, move to native `bcrypt` or a worker thread.
- **Elo is not strictly zero-sum (medium).** The provisional K-factor and the
  rating floor allow small net rating injection via collusion — the same
  property most ladder systems have. The full move log is persisted so
  collusion is auditable; automated collusion detection is future work.
- **Registration email enumeration (low).** A distinct 409 reveals whether an
  email is registered. The message is already generic; a full fix requires an
  email-verification flow. Rate-limited today.
- **In-memory rate-limit and matchmaking state (low).** Per-instance only. When
  scaling to multiple instances, move both to Redis (see ARCHITECTURE.md).

## 5. Operator security checklist
- [ ] `JWT_SECRET` set to a fresh ≥32-char random value (never the example).
- [ ] `NODE_ENV=production` on the live backend.
- [ ] `CLIENT_ORIGIN` set to your exact frontend origin(s).
- [ ] `TRUST_PROXY` matches your hosting (1 for Render/Railway/Fly, 0 for none).
- [ ] MongoDB Atlas network access restricted as tightly as your host allows.
- [ ] A Privacy Policy is published before enabling ads (see DEPLOYMENT_GUIDE.md).
- [ ] Rotate `JWT_SECRET` immediately if a leak is suspected.
