# Peterborough visual refresh implementation plan

> For agentic workers: use subagent-driven development with bounded implementation tasks and independent reviews. User explicitly authorized autonomous iteration and agent review over an eight-hour window.

**Goal:** Make still-generic streets more recognizable and convincing using Danny's available photographs, earlier proven facade systems and commercially reusable materials.
**Architecture:** Extend the existing Three.js r180 shared facade/material batches and source-backed appearance overrides. Preserve geographic geometry, road/collision systems, truck handling and reviewed authored buildings. Prefer shared visual detail over per-building materials or unbounded meshes.
**Tech stack:** Existing static JavaScript modules, Three.js r180, Node tests, existing Playwright camera harness and GitHub CI.
**Spec:** Danny's November 10 request in this conversation; focus beyond already-worked Sherbrooke and Hunter bridge, use own images plus the verified free materials, iterate with agents and a strong independent reviewer.

## Current scope amendment

User renewed work at 2026-11-10 14:57 UTC for four hours. Use recovered 300-photo handoff in route order, starting Walmart/Chemong through Mason, then Reid. Match correct mapped footprint, corner and viewing side before adding named signs. Record estimated colors/dimensions separately. Previous unfinished code was lost to workspace maintenance; recheck actual branch state. Review and test each bounded batch before acceptance.

## Global constraints

- Work branch: `codex/visual-refresh-20261110`; starting production version v1.6.201. Increment one patch for each completed update; do not call a branch deployed.
- Eight-hour work window begins approximately 2026-11-10 02:37 UTC and ends 10:37 UTC. Scheduled follow-up passes do not establish eight hours of uninterrupted model compute.
- Preserve mapped footprints, surveyed dimensions, roads, collision, dispatch, steering and multiplayer protocol/world compatibility.
- Prioritize generic ordinary residential/commercial streets. Use Sherbrooke/Hunter and the Fire/EMS facilities as regression controls.
- User photographs already packaged in the repository are available; original H:/ChatGPT footage is not present in this cloud checkout. Never claim unseen originals were inspected. Use existing source evidence honestly, and do not infer an exact roof from absent pixels.
- CC0 sources are recorded in the downloaded material manifest. Preserve source/author/licence and physical scale. CC BY/SA references require their respective obligations; do not copy branded artwork into the game as generic decoration.
- Keep batching, quality profiles, fallbacks and explicit authored appearance precedence. Avoid new runtime dependencies and render-engine changes.
- Baseline full suite initially fails because fresh checkout dependencies are missing; resolve documented test dependencies before attributing failures to code.
- A reviewer must see matched screenshots and actual test evidence before visual quality is approved. A rendering blocker is a blocker, not an approval.

## Review focus

1. Explicit building material tags must not change roofs, footprint bounds or authored appearances.
2. Source image load failures must retain functional procedural maps and avoid unhandled errors.
3. Balanced/Low/Lite must retain bounded texture/draw budgets, stable mip filtering and meaningful measured comparisons.
4. Representative front and oblique camera views must show an improvement; protect detailed facility/footage views.
5. Publication must retain the matching solo/multiplayer world and protocol; follow docs/deployment-recovery.md if publishing.

## Task 1: Shared wall materials and truthful wall selection

Files: city-explorer/station2-neighborhood-facades.mjs, minimal integration in city-explorer/app.js, new small material source module/assets if justified, relevant tests and source manifest.

- [ ] Add focused failing tests for recognized `building:material` selection (brick, plaster/render/concrete, wood, stone; unknown retains existing deterministic choice). Select wall family at the shared wall path, without changing the upstream roof-affecting wall key.
- [ ] Introduce Bricks003 and Concrete034 from the verified CC0 downloads as shared wall-map inputs. Keep the existing four material keys and procedural fallback. Use realistic physical repeat scales and correct sRGB handling. Do not grow material/draw counts per building.
- [ ] Keep GPU dimensions at the existing 256-square budget; unchanged source JPEGs may be sampled into the existing runtime canvas. Source download cost must be recorded. Do not add normal/roughness maps until measured benefit warrants them.
- [ ] Provide deterministic opt-out for same-head A/B, and a completion signal suitable for QA; avoid polling-heavy or speculative abstraction.
- [ ] Run targeted tests; record exact changed files and remaining concerns for review.
- [ ] Capture generic house/storefront/apartment/industrial matched views plus facility and footage controls. Resolve independent review findings before acceptance.

## Task 2: Own-photo supported appearance improvements

- [ ] Inspect available original user crops and existing source review records; inventory exact accessible sources and targets in the ledger.
- [ ] Choose a bounded remaining facade defect supported by visible evidence. Extend the existing recording appearance/profile path, preserving manual values, source identity and fallback.
- [ ] For Cricket 22/24, resolve the missing original frame issue before changing roof massing; do not mistake an old documented issue for fresh visual verification.
- [ ] Verify front, oblique, failed-photo and Lite behavior, then independent review.

## Task 3: Storefront visual identity

- [ ] Review current ground-floor storefront glazing/entrance artwork against cleared local reference photos and available owner crops.
- [ ] Improve shared glazing/transom/entry appearance only where the current plan identifies storefront ground-floor openings. Keep existing geometry budgets and avoid per-building materials.
- [ ] Test residential/civic/industrial exclusions and measure extra draws/textures; accept only after matched screenshot review.

## Continued passes and completion

- [ ] Discover further worthwhile generic-street improvements from screenshots after accepted tasks; append a concrete bounded task with file ownership and acceptance evidence before implementation.
- [ ] One implementation writer at a time; parallel read-only source research, QA and review are encouraged. Use focused workers and reserve Astra for broad independent review.
- [ ] Review findings return to the implementer for correction and re-review. No unsupported numeric quality score substitutes for evidence.
- [ ] Keep `docs/visual-refresh-2026-11-10-ledger.md` current with UTC timestamps, commits, tests, screenshots, open findings, next task and ownership.
- [ ] Save branch checkpoints remotely for follow-up runs. Do not overlap active writers. Final pass reports completed changes, version/URL, actual review status and remaining limits.

