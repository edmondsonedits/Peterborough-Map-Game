# Peterborough Emergency Games

Static GitHub Pages frontend containing the Peterborough Geo Guesser and Fire & Emergency Dispatch Simulator. The competitive leaderboard is designed as a separate Cloudflare Worker backed by D1; GitHub Pages never holds database or administrative secrets.

## Local development

Install Node.js LTS, then run:

```powershell
npm.cmd run check
npm.cmd run serve
```

Open `http://localhost:4173`. The games use OpenStreetMap tiles and preserve provider attribution.

## Project structure

- `index.html` — game selector
- `geo-guesser/` — Geo Guesser frontend
- `response-simulator/` — dispatch simulator frontend
- `shared/geography.js` — canonical stations and locations
- `shared/storage.js` — versioned, defensive browser storage helper
- `leaderboard-worker/` — Worker/D1 API and database migration
- `tests/` — dependency-free Node unit tests

## GitHub Pages deployment

The Pages workflow deploys only `main`. It runs `npm run check` and an obvious-secret scan before uploading the site artifact. Review the draft PR and its checks before merging. Roll back by reverting the merge commit on `main`.

## Leaderboard architecture

Cloudflare Worker `peterborough-map-games-leaderboard` exposes a public API. Its D1 binding is named `DB` and points to `peterborough-map-games`. The Worker creates server-authoritative game sessions, assigns round IDs from the canonical dataset, validates submitted guesses, calculates penalties server-side, and stores at most one result per session.

Required Worker variables:

- `ALLOWED_ORIGINS` — `https://edmondsonedits.github.io,http://localhost:4173`
- `GAME_VERSION` — `1`
- `SCORING_VERSION` — `1`

Required Worker secrets, set only in Cloudflare:

- `IP_HASH_SALT` — random value for privacy-preserving rate-limit keys
- `ADMIN_TOKEN` — separate secret for future protected moderation operations

Never put these values in Git, GitHub Actions logs, GitHub Pages files, or frontend JavaScript.

## D1 migration and Worker deployment

From `leaderboard-worker/`, after authenticating Wrangler to the owner account:

```powershell
npx.cmd wrangler d1 migrations apply peterborough-map-games --remote
npx.cmd wrangler secret put IP_HASH_SALT
npx.cmd wrangler secret put ADMIN_TOKEN
npx.cmd wrangler deploy
```

Verify `GET /health`, create a session, complete it, and read the relevant leaderboard before connecting the production frontend. Use two isolated browser sessions before calling the shared leaderboard live.

## Development mode and privacy

The simulator and Geo Guesser contain local editing tools intended only for development. Do not represent simulator calls as real emergency information. Local scores and preferences may use browser storage, but a public leaderboard must use the Worker/D1 API. The Worker’s rate-limit key is a salted hash of the request IP; do not log raw IP addresses.

## Known limitations

The backend/frontend integration, full simulator input rebuild, adversarial tests, and browser end-to-end suite are not yet complete. Do not merge draft PR #2 until those items are implemented and verified.
