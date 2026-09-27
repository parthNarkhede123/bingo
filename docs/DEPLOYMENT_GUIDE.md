# Bingo Arena — Deployment & Monetization Guide

Put the app online for **free (no credit card)** with automatic deploys, then
turn on ads. This repo is pre-wired for the path below; most of it is one-time
clicking.

## Architecture
Three free pieces:
1. **Database** — MongoDB Atlas M0 (free forever, 512 MB).
2. **Backend** — a Node process (Express + Socket.IO) on Render. Needs real
   WebSockets, so it runs as a **web service**, never a serverless function.
3. **Frontend** — the built React app served as a Render **static site** (CDN,
   always-on, no cold starts).

CI/CD:
- **GitHub Actions** (`.github/workflows/ci.yml`) runs all tests + the frontend
  build on every push and PR to `main`.
- **Render** watches `main` and redeploys both services on every push
  (`autoDeployTrigger: commit` in `render.yaml`). Push to main = live.

Free-tier caveat: the backend web service **sleeps after ~15 min idle** and
cold-starts (~50s) on the next request. `.github/workflows/keepalive.yml` pings
it every 13 minutes to keep it warm. Remove that when you move to a paid plan.

---

## One-time setup (do this in the morning; ~20 min)

### Step 1 — MongoDB Atlas (database)
1. Sign up at mongodb.com/atlas (use "Sign up with Google" for speed).
2. Create a free **M0** cluster (any provider/region near you).
3. **Database Access** → Add New Database User → username + strong password →
   built-in role **Read and write to any database**.
4. **Network Access** → Add IP Address → **Allow access from anywhere**
   (`0.0.0.0/0`). Render's free tier has no fixed egress IPs, so this is needed.
5. **Connect → Drivers** → copy the connection string. Insert your password and
   add the db name `bingo`:
   `mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/bingo?retryWrites=true&w=majority`
   This is your **MONGO_URI**. Keep it handy for Step 3.

### Step 2 — GitHub (code + CI)
The repo is pushed for you (see "What is automated" below). Confirm at
`github.com/<you>/bingo`. GitHub Actions runs automatically; no setup needed.

### Step 3 — Render (backend + frontend, auto-deploy)
1. Sign up at render.com with **"Sign up with GitHub"** and authorize it to read
   your repos.
2. Dashboard → **New +** → **Blueprint**.
3. Select the `bingo` repo. Render detects `render.yaml` and lists two services:
   `bingo-arena-api` (backend) and `bingo-arena` (frontend).
4. It prompts for the values marked `sync: false`:
   - **MONGO_URI** → paste the Atlas string from Step 1.
   - **VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT** → leave blank for now (ads show
     as placeholders until AdSense is approved).
   - `JWT_SECRET` is generated automatically. You never see or set it.
5. Click **Apply**. Render builds and deploys both. First build ~2-4 min.
6. Your URLs:
   - App:     `https://bingo-arena.onrender.com`
   - API:     `https://bingo-arena-api.onrender.com`  (health: `/api/health`)

**If a name was taken** and Render appended a suffix, open each service's
Settings → Environment and fix the URLs to match reality:
- Backend `CLIENT_ORIGIN` = the real frontend URL.
- Frontend `VITE_API_URL` = the real backend URL.
Then Manual Deploy → Deploy latest commit. (Also set a repo variable
`BACKEND_URL` to the real API URL so the keep-warm ping targets it.)

That's it — the game is live. Every future `git push` to `main` redeploys.

---

## What is automated for you
- `render.yaml` — provisions both services, wires env vars, generates the JWT
  secret, sets SPA routing + security headers.
- `.github/workflows/ci.yml` — tests + build gate on every push/PR.
- `.github/workflows/keepalive.yml` — 13-min health ping to dodge cold starts.
- Fail-closed config — the backend refuses to boot without a strong JWT secret
  (Render provides one), so a misconfigured deploy fails loudly, not silently.

---

## Monetization — Google AdSense
Ads are fully wired and gated on cookie consent; you only need Google's approval.

1. Create an account at adsense.com and add the site
   `bingo-arena.onrender.com`.
2. Verify ownership. Easiest here: after approval you set the publisher id (next
   step) and the site serves the AdSense script. You can also use the
   `ads.txt` method: edit `frontend/public/ads.txt`, uncomment the line, and put
   your `pub-XXXXXXXXXXXXXXXX` id in, then push.
3. Once approved, in Render set the frontend service env vars:
   - `VITE_ADSENSE_CLIENT` = `ca-pub-XXXXXXXXXXXXXXXX`
   - `VITE_ADSENSE_SLOT` = your ad unit's slot id
   Redeploy. Real ads replace the placeholders for users who accept cookies.

Reality check: AdSense approval needs a live site with genuine content and some
traffic, and review can take days to weeks. Some reviewers reject bare
`*.onrender.com` subdomains; a cheap custom domain (~$10/yr) improves odds when
you are ready to spend. Earnings at low traffic are small — this covers a domain,
not a salary, until traffic grows.

---

## Legal (required for ads, good practice regardless)
- **Privacy Policy** at `/privacy` and **Terms** at `/terms` are built in.
- Before submitting to AdSense, edit `frontend/src/pages/Privacy.jsx` and
  `Terms.jsx` and replace `REPLACE_ME@example.com` with a real contact email.
- A cookie-consent banner gates ad cookies. For heavy EEA/UK traffic, Google
  requires a certified Consent Management Platform (CMP); the built-in banner is
  a good-faith baseline, not a certified CMP.

---

## Custom domain (optional, later)
Truly free custom domains are unreliable in 2026. When earning, buy a cheap
`.com`/`.fun` (~$10/yr), add it to the Render static site (free TLS), and update
`CLIENT_ORIGIN`, `VITE_API_URL`, the canonical/OG URLs in `index.html`, and
`robots.txt`.

## Rollback
Render keeps deploy history: a service's **Deploys** tab → pick a previous
successful deploy → **Rollback**. Or `git revert` and push.
