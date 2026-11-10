# Solo and multiplayer release procedure

## Verified release: 10 November 2026

v1.6.201 is published at commit `e4319a16d7f471b06a9843dad5904cd5d563cab1`,
world `6a591732d8f63f37a15c7a93`, protocol `2`. Render deploy
`dep-dbp77m3rjlhs73f2et2g` was observed Live at that commit, and public
`/healthz` returned ready with the matching world and protocol.
[Pages run 42736259572](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42736259572),
attempt 2, job `129567525550`, completed successfully. Nine public release
resources matched the final local commit byte-for-byte, and the canonical
public page's browser title showed v1.6.201.

All 1,564 Node tests passed. The final PR #79
[browser QA run 42735115744](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42735115744)
passed all four jobs: station/mobile, vehicle/multiplayer regressions, solo
upgrade, and two-client upgrade. This includes all 12 multitouch combinations,
balanced desktop rendering, Lite desktop/touch functionality, and matching
local-server multiplayer checks.

Production networking and movement were separately verified with two real
Colyseus WebSocket clients on Render at protocol 2 and the expected world. The
clients drove Pump 1 and Car 1, and peers observed 1.077 m / 31 input
acknowledgements and 1.983 m / 30 acknowledgements, respectively. Both clients
disconnected after the QA room was explicitly closed; it was then absent from
the room directory.

Live 3D interaction was not verified in the cloud browser. Both the canonical
URL and `?lite=1` failed WebGL context creation with `GL_VENDOR=Disabled` and
`GL_RENDERER=Disabled`; the same environment error occurred with v1.6.200 before
deployment. Do not present successful CI rendering/playtests or the live backend
client check as live visual verification.

See [the v1.6.201 release record](publish-handoff-2026-11-09.md) for the interrupted
checkpoint history, Lite authored-scene/apron fixes, collision-safe reset fix,
and browser-harness changes. The older incident and rollback pair below remain
historical evidence, not the current deployment.

## Incident: 6 November 2026

The v1.6.196 gameplay changes reached main, but production remained v1.6.188.
Do not equate a merged PR, a successful Render deploy, or an uploaded Pages
artifact with a published release.

Three distinct failures occurred:

1. The Pages compatibility check rejected an older Render world. The world hash
   must match the final generated multiplayer world, including any geospatial
   bot commit made after the gameplay merge.
2. An early attempt rejected stale road-pack source hashes. Wait for the
   geospatial workflow and verify its final assets before deploying Render.
3. Runs 42266647887 and 42268330518 passed validation and uploaded the site,
   but Pages stayed in `deployment_queued` before returning `Deployment failed,
   try again later`. The logs establish failure after artifact upload; they do
   not identify GitHub's internal cause. Do not describe this as a confirmed
   platform-wide outage or change gameplay to address it.

Rerunning an earlier job also produced `Multiple artifacts named github-pages`.
v1.6.197 gives both upload and deployment the same attempt-specific artifact
name (`github-pages-${{ github.run_attempt }}`), so a later attempt cannot select
the earlier upload. This fixes the retry collision, not the unexplained queue
failure. No compatibility or regression checks are bypassed.

## Release checklist

1. Record the currently published version, public world hash, and matching
   Render commit for rollback. Preserve a matching frontend/server pair.
2. Increment `shared/build-version.js` by one patch and run
   `node scripts/normalize-release.cjs`. If road source changed, rebuild the
   road pack, then run `node tools/normalize-road-gzip.mjs`. Export the matching
   multiplayer world with `node tools/export-multiplayer-world.mjs` and commit
   the normalized generated assets.
3. Run the release tests, `node tools/verify-road-pack.mjs`, and
   `node tools/verify-road-markings.mjs`. If main triggers **Build Peterborough
   geospatial assets**, wait for its completion and fetch main again. Use the
   final bot commit and its world hash, not an earlier merge SHA.
4. Deploy that exact commit to Render service `city-explorer-multiplayer`.
   Wait for `/healthz` to report `status: ready`, the expected `worldVersion`,
   and the matching `protocolVersion`.
   A free instance can take over 50 seconds to wake. A successful HTTP request
   alone is not proof of version compatibility.
5. Run/retry **Deploy GitHub Pages** against the final main state. With
   v1.6.197 or later, re-running failed jobs is safe from artifact-name
   collisions. Do not rerun the old workflow definition expecting this fix.
6. Verify the public `shared/build-version.js`, City Explorer HTML, and
   `city-explorer/multiplayer/world-data/v1/station-heights.json` after CDN
   propagation. Compare the public world hash and protocol to Render `/healthz` again.
   Then verify solo startup and a multiplayer room against the live URLs.
7. Report the version and play link only with explicit verification results.
   Record any browser QA limitations separately from deployment results.

## Failure recovery

- Backend mismatch: inspect Render's deployed SHA, final world manifest,
  protocol, and pending geospatial runs. Deploy the correct server; never remove
  either the world or protocol gate.
- Road source mismatch: rebuild assets from the normalized source, then deploy
  the resulting final world to Render before retrying Pages.
- Pages queue failure after successful upload: save run/job IDs and logs,
  inspect GitHub Status, and retry the same validated release once. If it
  persists, preserve evidence for GitHub Support; do not claim a guessed cause.
- Failed publication while Render is already newer: check whether the public
  site actually changed before restoring the server. If Pages still serves
  the old world, restore its matching Render commit and verify `/healthz`.
  Never leave the public multiplayer client pointing at an incompatible world.

The last verified pre-incident pair was public v1.6.188, world
`b8a4b66d364a519c978649b8`, Render commit
`017ccfd7f3cc3936fd4d886ed0e291c63e1bf33f`.

References: [failed release run](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42268330518),
[Pages upload inputs](https://github.com/actions/upload-pages-artifact#inputs-),
[Pages deployment action](https://github.com/actions/deploy-pages).
