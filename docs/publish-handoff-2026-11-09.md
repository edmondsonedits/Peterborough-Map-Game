# Release record: City Explorer v1.6.201

Status: PUBLISHED and verified on 10 November 2026. The interrupted source checkpoint described below has been completed.

- Play: https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/
- Published commit: `e4319a16d7f471b06a9843dad5904cd5d563cab1`.
- World: `6a591732d8f63f37a15c7a93`; multiplayer protocol: `2`.
- Render service `city-explorer-multiplayer`: deploy `dep-dbp77m3rjlhs73f2et2g` observed Live at that commit. Public `/healthz` returned ready with the matching world and protocol.
- [Pages run 42736259572](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42736259572), attempt 2, job `129567525550`: successful deployment after the compatibility gate passed.
- Nine public release resources matched the final local commit byte-for-byte. Reloading the canonical public URL displayed v1.6.201 in the browser title.

Live backend verification passed with two real Colyseus WebSocket clients on Render using protocol 2 and the expected world. The clients became distinct authoritative drivers of Pump 1 and Car 1; their peers observed movement of 1.077 m (31 input acknowledgements) and 1.983 m (30 acknowledgements), respectively. The temporary QA room was explicitly closed, both clients disconnected, and the room was confirmed absent from the directory.

Live 3D interaction was not verified in the cloud browser: both the canonical URL and `?lite=1` failed to create a WebGL context, with `GL_VENDOR=Disabled` and `GL_RENDERER=Disabled`. The same environment error occurred with v1.6.200 before deployment. Successful CI rendering and playtests below are separate evidence, not live browser playtests.

## Release content and validation

The driving upgrade includes cab/bonnet views, Lite graphics, map entities and map driving, a City Hall training call from all three halls, multiplayer jitter smoothing and immediate local preview, and vehicle tuning. The merged v1.6.200 work was preserved, including four-seat crews, aerial actions, vehicle selection, Rescue 1/Car 1, latest solo steering, and location/route changes. Crew map labels include passengers.

Release completion also fixed issues found during browser QA:

- Lite startup now registers the authored-scene world bridge explicitly, independently of the optional captured-detail layer. The station-apron shader supplies its required world-position varying in Lite.
- On-foot reset now selects a collision-checked vehicle exit. The old fixed world-X offset placed the firefighter inside Car 1's measured body. Regression tests cover measured dimensions, rotated bays, the active vehicle's previous position, and a fully blocked reset.
- Changed module imports use the correct release cache tokens. Road/world assets were rebuilt from the final runtime source; source/world checks and the Pages protocol/world gate were retained.
- Browser harnesses support Linux software rendering while preserving Windows behavior, wait for observable movement/readiness, retain failure diagnostics, and run solo and two-client checks independently. Balanced rendering and Lite functional coverage are both tested. Geometry fixtures extract only their intended app functions.

Validation:

- All 1,564 Node tests passed after the reset fix.
- [Browser QA run 42735115744](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42735115744), final [PR #79](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/79) head `b1b393c9173e00bc1395ae7bd2bc97f0a31efb22`: all four jobs passed, including station, vehicle/multiplayer regressions, solo upgrade, and two-client upgrade.
- All 12 multitouch combinations passed: portrait/landscape, on-foot/driving/fly, and movement-first/look-first. Focus-loss and mouse/keyboard checks also passed.
- Solo browser checks covered balanced desktop, Lite desktop/touch, camera views, map driving, and training calls from halls 1/2/3. Two-client Lite checks covered crew seats, separate vehicles, walking/driving, remote motion observation, map controls, and restoring solo mode after leaving. These used matching local frontend/server instances in CI.

## Historical checkpoint: 9 November 2026

The interrupted branch was `codex/driving-upgrade-20261109`. Original upgrade commit `37dd265f` had been merged with main through `0dd33ca3` (v1.6.200), then normalized to v1.6.201. The local road compiler was deliberately stopped at source mesh 2250/3603 for PC shutdown, before tile writing; its checked-in road/world assets were stale at that point.

At that checkpoint, 1,555/1,556 merged tests passed; the remaining Toronto provenance-hash failure was recorded in `tests/city-call-catalogues.test.cjs`. The earlier two-client browser run predated the main merge. Neither result is the final release validation above.

Publishing was authorized, but no authenticated Render deployment was available: the dashboard first timed out, then opened signed out, and a login attempt reached a temporary rate limit. No production deployment had occurred at that checkpoint.

The last observed public frontend then was v1.6.200 with world `42e7a6191e02736c34910091`; Render reported that same world without a `protocolVersion` field. Main's later geospatial commit `0dd33ca3` contained world `c4d8187719c9114d8eb90893`, and Pages run `42512611687` failed because it did not match the backend. Main was not proof of the live artifact. The completed publication above supersedes that state.

For future releases, follow [deployment-recovery.md](deployment-recovery.md). Never bypass the protocol/world gate or substitute expected hashes for a real rebuild.
