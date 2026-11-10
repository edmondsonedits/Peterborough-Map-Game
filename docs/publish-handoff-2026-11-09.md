# Publish handoff: City Explorer v1.6.201

Status: NOT PUBLISHED. This is a resumable source checkpoint, not a deployment-ready artifact.

Repository: https://github.com/edmondsonedits/Peterborough-Map-Game
Branch: codex/driving-upgrade-20261109
Local checkout: H:\ChatGPT\City-Explorer-Multiplayer-20261105

## Completed

- Original driving upgrade was committed as 37dd265f: multiplayer jitter smoothing and immediate local preview, vehicle tuning, cab/bonnet views, Lite, map entities/map driving, and a City Hall training call from all three halls.
- Merged origin/main through 0dd33ca3 (v1.6.200). All conflicts resolved. Preserve its four-seat crews, aerial actions, vehicle selection, Rescue 1/Car 1, latest solo steering, and location/route changes.
- Canonical version is now 1.6.201; normalize-release.cjs was run.
- Protocol is 2. Server /healthz now reports protocolVersion; the Pages deployment gate requires the matching protocol AND world hash. Do not bypass either check.
- Crew map labels now include passengers, with a focused regression.
- Merged full suite: 1555/1556 passed. Only tests/city-call-catalogues.test.cjs:21 fails at line49 due an unchanged Toronto provenance hash mismatch. Two older roster failures were resolved by newer main.
- Focused merged multiplayer checks:82/82. Vehicle checks:16/16. Protocol deployment gate:4/4. Crew map:3/3.
- Merged desktop/touch browser smoke passed: cab/chase, map driving, Lite and training-call start from halls1/2/3. Local report artifacts are not pushed.

## Remaining work

1. Fetch current main and preserve newer work. Check the checkpoint diff and docs/driving-upgrade-2026-11-09.md plus docs/deployment-recovery.md.
2. Finish the road/world artifact build. The local compiler was deliberately stopped at source mesh2250/3603 for the user's PC shutdown. It had not reached the tile-writing stage, so checked-in road/world assets are still stale for the new source. Do not change expected hashes to conceal this.
3. Follow the existing build/CI setup for Playwright and serve the checkout. tools/build-road-pack.cjs uses ROAD_BUILD_URL or http://127.0.0.1:4186. Then run tools/normalize-road-gzip.mjs, tools/export-multiplayer-world.mjs, tools/verify-road-pack.mjs and tools/verify-road-markings.mjs. Commit the generated assets. Inspect branch/push behavior before using a cloud geospatial workflow.
4. Start the matching local multiplayer server and rerun tools/check-multiplayer-driving-upgrade.mjs on the merged release/world. The completed earlier two-client browser run predates the main merge; the merged unit tests and solo/touch smoke passed.
5. Deploy a matching pair: Render city-explorer-multiplayer and GitHub Pages. User explicitly authorized publishing. No paid plan changes, billing changes or new hosting migration. Existing GitHub access worked; no Render CLI/token/deploy-hook was available. Dashboard browser initially timed out, then opened signed out. User's login attempt reached a temporary rate limit. User could not sign in before leaving. Successful authenticated Render access remains required.
6. Record the final SHA and world hash. Account for the automatic geospatial workflow after a main push; use the final matching artifacts or cancel only a provably redundant rebuild after local validation, preserving current work. Pages must retain its protocol/world gate. An additional Cloudflare Workers Builds check is connected to this repo; inspect it before pushing main because it may auto-publish a mirror.
7. Wait for successful backend readiness and Pages deployment, compare live versions and relevant asset hashes, then run desktop/touch and two-client live smoke. tools/check-driving-upgrade.mjs and tools/check-multiplayer-driving-upgrade.mjs accept MAP_QA_URL and MULTIPLAYER_QA_SERVER. Report only observed results.

## Last live observations before checkpoint

- Frontend: https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/
- Build marker:1.6.200
- Public world hash:42e7a6191e02736c34910091
- Backend:https://city-explorer-multiplayer.onrender.com/healthz returned ready with the same world hash; no protocolVersion field.
- Main's later geospatial bot revision0dd33ca3 contains worldc4d8187719c9114d8eb90893. Its Pages run42512611687 failed because backend42e7... did not matchc4d8.... Keep this distinction; main is not proof of the live artifact.
- No remote branch/main update or new production deployment occurred before this checkpoint push.

If Render authentication remains unavailable, preserve the prepared release and request only the necessary sign-in. Do not claim publication or publish an incompatible client by removing the gate.
