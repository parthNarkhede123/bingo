# IRONHOLD — Game Plan & Technical Design
*Companion to `STORY.md`. This is the "how it actually works" doc: mechanics, economy,
the light-database design for the free ~512 MB Atlas plan, the API, and the build plan.*

---

## 0. Design pillars (everything below serves these)

1. **Strategy & diplomacy first.** The fun is *whom to befriend, trade with, or raid* —
   not reflexes. No animation required.
2. **Forced interdependence.** Each Hold produces one unique material; everything worth
   building needs materials you don't have. Trading is mandatory (Catan's core).
3. **Asynchronous & timer-based.** Actions resolve over minutes/hours. Players check in
   a few times a day. Works on a phone, survives closed tabs.
4. **Light data.** One week per season, one main document per player, derived values
   over stored ones, TTL for everything ephemeral. The DB must never grow unbounded.
5. **Reuse the hardened platform.** Keep the existing auth, security, rate limiting,
   email, deploy, and CI. Replace only the *game* layer.

---

## 1. What we took from each reference game

**Lords Mobile** (the "millions lord" reference) — heroes/**commanders**, **gear** with
upgrade tiers, **research/leveling** trees, **resource tiles that respawn when
gathered**, and a **gem** premium currency. We keep the commander + gear + gathering +
gem ideas but strip the deep building/research grind down to a single week.
Sources: [gathering](https://lordsmobile.fandom.com/wiki/Gathering),
[equipment](https://lordsmobile.fandom.com/wiki/Equipment),
[gear tree](https://lordsmobile.fandom.com/wiki/Gear).

**Catan** — the whole game is *scarce resources you must trade for*; you literally
cannot build without dealing with rivals, and blocking/robbing is a real lever.
This is our core loop. Sources:
[official rules](https://officialgamerules.org/game-rules/settlers-of-catan/),
[the geekonomics of Catan](https://nerdist.com/article/the-geekonomics-of-catan/).

**Albion Online** — **localized economies** (no global market; each place makes
different things and prices differ), and **crafting interdependence** across
regions forcing trade routes. We adopt "your land makes one thing; you must move goods
to get the rest." Sources:
[local economies](https://wiki.albiononline.com/wiki/Local_Economies),
[trading](https://wiki.albiononline.com/wiki/Trading).

**Browser-game architecture** — browsers are a poor real-time runtime (tabs sleep,
Wi-Fi drops), so lean async/timer-based with server-authoritative state and lazy
resolution. Source:
[core loop of a browser multiplayer game](https://open.substack.com/pub/packagemain/p/how-i-built-the-core-loop-of-a-browser).

---

## 2. The core loop (one screen of it)

```
        ┌──────────────────────────────────────────────────────┐
        │  HARVEST your one material  ──►  you have a surplus    │
        │            │                                          │
        │            ▼                                          │
        │  TRADE / RAID for the materials you lack               │
        │            │                                          │
        │            ▼                                          │
        │  CRAFT gear + UPGRADE Hold (needs mixed materials)     │
        │            │                                          │
        │            ▼                                          │
        │  FIGHT & complete QUESTS  ──►  XP, Gems, Chests, CP    │
        │            │                                          │
        │            ▼                                          │
        │  LEVEL UP (skill points, army, chests) ──► repeat      │
        └──────────────────────────────────────────────────────┘
              Everything above earns Conquest Points (CP).
              Most CP at the end of the 7-day season = crowned.
```

Every action is a **timed order**: you issue it, a timer runs, it resolves. No live
control, no animation — the client shows state + countdowns.

---

## 3. Systems in detail

### 3.1 Land & materials (forced trade)
- The world has **~10 material types**, one per land "biome". At season start each
  player is seeded onto a biome → they produce exactly **one signature material**.
- **Recipes** (gear crafting, Hold upgrades, some quests) each cost **2–3 different
  materials**, always including at least one you can't produce. → You must trade/raid.
- No global market. You get foreign materials only by **trade offers** or **raiding**.
- The map itself is **not stored** — a biome is a pure function of coordinates
  (`biome(x,y)`), so the "board" costs zero database space.

### 3.2 Loadouts — the 4 stances
Gear is tagged with one **stance**. Your active loadout applies its bonuses:

| Stance | Real-world verb | What it boosts |
|--------|-----------------|----------------|
| **Assault** | attack | army power when *you* attack |
| **Bulwark** | defence | army power when *defending* |
| **Harvest** | farming | gather yield & speed |
| **March** | moving  | army march speed (shorter travel) |

You hold one loadout of each stance (a small set of equipped gear per stance). Only one
stance is *active* at a time. Switching by hand has a short cooldown — **or** Durgan
switches for you (below).

### 3.3 Army & combat (deliberately light math)
- Your army is **one number**: `troops`. No unit types in v1 (keep it small & legible).
- **Effective power** = `troops × (1 + gearBonus + skillBonus + commanderBonus)` for the
  active stance. Attacker's Assault power vs defender's Bulwark power + garrison.
- Battle is a **single deterministic resolution** (with a small seeded variance): higher
  effective power wins; loser loses more troops; winner loots materials/gems and gains
  CP. Wounded troops partially heal over time (a light "infirmary" timer) so a loss
  isn't game-ending.
- All of this is a few multiplications server-side — no simulation, no per-tick writes.

### 3.4 Gear & chests
- A **gear piece** is compact: `{ stance, tier, power }` (tier ∈ Wood/Iron/Gold/Royal).
- **Chests** roll gear weighted by chest grade (Royal → better odds of Gold/Royal gear).
  Chest sources: quests, level-ups, wild mines, ads, gem purchase.
- **Inventory is capped** (e.g. 40 pieces); overflow auto-salvages into a soft currency
  (`scrap`) used to craft/upgrade. Cap = predictable document size.
- **Crafting** better gear consumes materials (mixed → trade pressure) + scrap.

### 3.5 XP, levels, skills
- Earn XP from gathering, battles, trades, quests.
- **Level up →** `+skillPoints`, `+troops`, and *sometimes* a chest (every few levels).
- **Skill tree** is small (~10 nodes): `+assault%`, `+bulwark%`, `+harvest%`,
  `+marchSpeed%`, `+gemFind%`, `+chestLuck%`, `+lootCap`, etc. Stored as a tiny map
  `{ skillId: rank }`.

### 3.6 Commanders
- **Durgan Stonesworn (dwarf) — auto-loadout.** A server-side rule that picks the active
  stance from your current situation, re-evaluated whenever your state changes:

  ```
  priority order (first match wins):
    1. troops currently marching out to ATTACK a target      → Assault
    2. you are UNDER ATTACK (incoming army will land soon)    → Bulwark
         └─ but if you ALSO have an attack in the field       → Assault (offense-first)
    3. any army currently TRAVELING (march/return)            → March
    4. otherwise (idle / offline)                             → Harvest
  ```
  Implemented as a pure function `chooseStance(holdState)` run on every state change and
  on lazy resolution. No timers of its own.

- **Wren Nightglass (scout) — recon.** Spend a scout charge to target a rival; produces a
  **scout report** (their troops, active stance, defence, top material stocks), stored
  with a TTL. Reduces fog-of-war.

- **Acquisition:** rare. Recruit with **Gems** or earn via **Quests**. **Both are free
  for the first 12 h of a season** (`freeUntil` timestamp per commander). After expiry,
  auto-loadout / scouting stop unless recruited.

### 3.7 Gems economy
- **Earn:** watch an ad (server-verified, cooldown + daily cap), capture **wild mines**
  (ephemeral map nodes that spawn and expire), quests, daily login streak.
- **Spend:** recruit commanders (expensive/rare), extra scout charge, force-open a chest,
  optional speed-ups. Gems are the *rare* currency; materials are the *common* economy.

### 3.8 Trade & diplomacy (the heart)
- **Trade offers:** post "give X qty of material A for Y qty of material B"; anyone can
  accept while it's open. Offers have a **TTL** (e.g. 24 h) and are capped per player.
- **Direct offers:** target a specific player (private) — the diplomatic handshake.
- **Pacts (light):** two players can form a mutual **non-aggression pact** (a small doc,
  breakable, expires at season end) that blocks attacks between them. This is the
  "make a friend" mechanic with teeth. Alliances beyond pacts are social/coordination.
- **Raiding** is the alternative to trading — take materials by force, but you make an
  enemy who won't trade and may retaliate. The tension Catan's robber creates.

### 3.9 Quests
- A **small rotating set** (daily + a season arc). The **starting quest chain** hands out
  the 12 h commander trials, a first chest, and teaches trade + raid + scout.
- Rewards: XP, Gems, Chests, materials, CP. Quest state stored as a compact
  `{ questId: progress }` map on the Hold — no separate documents.

### 3.10 Leaderboard, Conquest Points & the season
- **CP** is earned from: winning battles, holding mines, completing quests, fulfilling
  trades, upgrading your Hold. It is the *only* ranking number.
- **Leaderboard** = players ordered by CP for the current season (reuses the existing
  leaderboard route, re-pointed at CP).
- **Season = 7 days** (`season` singleton with `startsAt`/`endsAt`). At the bell: snapshot
  the top, award the crown (title + small next-season blessing), then **reset**:
  season-scoped data (`holds`, `offers`, `reports`, `mines`, `pacts`) is wiped/rebuilt.
  Accounts and all-time stats persist. **This weekly wipe is what keeps the DB tiny.**

---

## 4. Keeping the database light (the ~512 MB rule)

Principles, in priority order:

1. **One main document per player per season** (`holds`) holding ~all state as compact
   fields — not dozens of little docs.
2. **Derive, don't tick.** Resources = `floor((now - lastHarvestAt) × rate)` computed on
   read. No background job writing resource counts every minute.
3. **No event log.** Battles/scouts/trades produce a **report** with a **TTL** (auto-
   deleted by Mongo), capped per player. History lives in memory of the week, then dies.
4. **TTL indexes on everything ephemeral**: `offers`, `reports`, `mines`, `pacts`.
5. **Season reset = mass delete.** Bounded lifetime → bounded storage, forever.
6. **Caps everywhere**: inventory size, open offers, reports retained, map query radius.
7. **The map is procedural** (`biome(x,y)`), so zero rows for the world.

Rough budget: a Hold doc ≈ 1–2 KB. 10,000 concurrent players ≈ **10–20 MB**. Ephemeral
collections with TTL stay in the low tens of MB. We are nowhere near 512 MB.

---

## 5. Data model (Mongoose collections)

```
users            (PERSIST — reuse existing User model, extend lightly)
  _id, username, usernameLower, email, passwordHash, resetToken* (existing)
  + stats: { seasonsPlayed, bestRank, crowns, titles[] }   // tiny, all-time

season           (SINGLETON)
  _id, number, startsAt, endsAt, status

holds            (PER PLAYER PER SEASON — the big one, still ~1–2 KB)
  _id, userId, season, biome, coords:{x,y}
  material: { type, amount, lastHarvestAt, rate }          // lazy-computed
  scrap, gems, cp, xp, level, skillPoints
  troops, wounded, woundedHealAt
  activeStance, autoLoadout(bool)
  loadouts: { assault:[gearId], bulwark:[...], harvest:[...], march:[...] }
  inventory: [ { id, stance, tier, power } ]  (capped ~40)
  foreignMaterials: { <type>: amount }        (small map, only what you hold)
  skills: { <skillId>: rank }
  commanders: { durgan:{ owned, freeUntil }, wren:{ owned, freeUntil, charges } }
  quests: { <questId>: progress }
  marches: [ { id, kind:attack|scout|mine|return, target, departAt, arriveAt } ]  (few)
  lastSeenAt

offers           (TTL 24h)   from, forMaterial, giveMaterial, giveQty, wantQty, toUser?
reports          (TTL 48h, capped) userId, kind, payload(small), createdAt
mines            (TTL)       coords, kind(gem|material), amount, expiresAt
pacts            (until season end)  a, b, expiresAt
```

All timestamps are server-set; all rate/amount math is server-authoritative.

---

## 6. API surface

**Reused (unchanged):** `POST /api/auth/register|login`, `/forgot-password`,
`/reset-password`, `GET /api/health`.

**New game REST (all require auth):**
```
GET  /api/hold                      my Hold (resources lazily computed)
POST /api/hold/harvest              start/collect a harvest
POST /api/hold/loadout              set active stance (no-op if autoLoadout on)
POST /api/hold/auto-loadout         toggle Durgan auto (requires Durgan owned/trial)
POST /api/hold/upgrade              spend materials+scrap to upgrade Hold
POST /api/march                     send army: { intent: attack|scout|mine, target }
POST /api/chests/:grade/open        open a chest → gear
POST /api/gear/:id/equip|salvage
POST /api/craft                     craft gear from materials+scrap
GET  /api/trade/offers              list open offers (paged)
POST /api/trade/offers              create an offer
POST /api/trade/offers/:id/accept
POST /api/commanders/:name/recruit  spend gems
POST /api/scout                     Wren recon a target → report
POST /api/ads/reward                grant gems for a verified/cooldowned ad view
GET  /api/quests  ·  POST /api/quests/:id/claim
POST /api/pacts  ·  POST /api/pacts/:id/break
GET  /api/leaderboard               CP ranking (repurposed existing route)
GET  /api/map?radius=               nearby holds/mines (fog-of-war filtered)
```

**Socket.IO (live nudges, not gameplay):** `hold:update`, `attack:incoming`,
`march:resolved`, `trade:accepted`, `report:new`. Sockets only *notify*; all authority
is in the REST handlers + resolver.

---

## 7. Action resolution (no heavy game loop)

- **Lazy resolution:** when a Hold is read or acted on, first fast-forward it — apply any
  harvests completed, marches arrived, wounds healed, since `lastSeenAt`. This means most
  state advances *for free* on the next request, with zero background writes.
- **Light sweeper:** one cheap interval (e.g. every 30–60 s) resolves marches whose
  `arriveAt` has passed for players who are offline (so an attack lands even if the victim
  is away), spawns/expires mines, and fires socket notifications. It touches only the few
  docs with due timers, not every player.
- Combat/gather/craft are pure functions → easy to unit-test deterministically.

---

## 8. Security & anti-abuse (inherits the hardened platform)

- Reuse existing **JWT auth**, **rate limiting**, **helmet/CORS**, fail-closed
  `JWT_SECRET`, and the password-reset hardening already shipped.
- **Server-authoritative everything:** client never sends outcomes, only intents.
- **Ad-reward endpoint** must be cooldowned + daily-capped + (ideally) provider-verified
  so gems can't be farmed by spamming the call.
- Validate every action against the actor's own Hold (no acting on others' docs).
- Season reset and the sweeper run server-side only.

---

## 9. Codebase reuse plan (Bingo → Ironhold)

**KEEP (the platform):**
- `backend/src/app.js`, `config/`, `middleware/` (auth, rateLimit, errorHandler),
  `utils/` (logger, mailer), `models/User.js`, `routes/auth.js`, server bootstrap.
- Frontend: `AuthContext`, `api/client.js`, `api/socket.js`, `Navbar`,
  `ProtectedRoute`, `CookieConsent`, `Ad.jsx`, auth pages, `Privacy`, `Terms`.
- `render.yaml`, CI, `.env.example` (extend, don't rewrite).

**REPLACE (the game layer):**
- Remove `backend/src/game/*` (engine, lines, match, rating), `models/Match.js`,
  `sockets/{gameManager,matchmaker,bots}.js` (keep `rateLimiter.js` + socket scaffold).
- Remove frontend `BingoBoard`, `BingoLetters`, `Play` (Bingo), and re-theme
  `Home`/`Leaderboard`/`Profile`.
- Add new `models/` (`Hold`, `Season`, `Offer`, `Report`, `Mine`, `Pact`), new
  `game/` (combat, harvest, chests, leveling, loadout/Durgan, resolver), new routes,
  new frontend game pages.

**DATABASE:** for a clean launch we start fresh game collections. Whether to also drop
the existing `users`/`matches` (wipe accounts) or keep accounts and only add the new
collections is a **decision for you** (see §11) — it is irreversible, so I'll confirm
before touching the live DB.

---

## 10. Build roadmap (phased, each phase shippable)

1. **Platform trim** — remove Bingo game code, keep auth/platform, green build + tests.
2. **Data + resolver core** — `Hold`, `Season`, lazy resolution, harvest, leveling.
   Unit tests for the pure functions.
3. **Combat + march + loadouts + Durgan** — attack/defend, the auto-loadout rule.
4. **Gear + chests + crafting + skills.**
5. **Trade + pacts + scout (Wren) + map/fog-of-war.**
6. **Gems + ads + quests (incl. the 12 h commander trial starter chain).**
7. **Frontend** — map, Hold panel, loadouts, trade, leaderboard, reports.
8. **Season lifecycle** — crown + weekly reset job + all-time stats.
9. **Balance pass + deploy** (reuse Render blueprint; set the season cron).

---

## 11. Open decisions for you (I'll pick sensible defaults if you don't care)

1. **Game name** — keep *Ironhold*, or your call.
2. **Live DB:** wipe accounts too, or keep accounts and only add game collections?
   *(Recommendation: keep accounts, add new collections — nothing to lose, less to redo.)*
3. **Repo:** reuse this repo/history (recommended) vs. start a brand-new repo.
4. **Materials count** (default 10) and **map size / neighbor density**.
5. **Real-money / IAP?** Story says gems come from ads + play only (no purchase) — keep
   it ad-supported and F2P? *(Recommended, matches your "no real-money gambling" stance.)*

