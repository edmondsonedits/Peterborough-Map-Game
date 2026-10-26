# Roadside lights verification — 2026-10-25

Local checkout: `H:\ChatGPT\Peterborough-Map-Game-Sherbrooke`. No push, deployment or publication.

[Open the before/after comparison](../test-artifacts/roadside-lights-20261025/comparison.html). Original baseline remains separate from the corrected-camera `baseline-matched` evidence.

## Changes and scope

- All 149 mapped lamps and 213 traffic signals use shared roadside anchors and static cantilever geometry. All 213 signal bases and four lamp bases originally sampled on road; none do now. Source IDs/coordinates remain unchanged in editor records.
- Every roadside lamp/signal head samples pavement. Area/path lamps keep appropriate non-road anchors. Positions are conservative appearance inference from existing road geometry, not surveyed pole locations.
- All 122 Sherbrooke utility-pole lamps retain their existing GLB appearance, width and height; a separate yaw and length aim each attached fixture over pavement. Wires follow corrected pole objects. Actual transformed fixture endpoints and all pole bases are audited.
- Street-name posts use the same intersection clearance. Hunter ornamental lamps already sit outside the traffic ribbon and retain their reference-backed shape. Explicitly authored editor positions remain authoritative.
- No road footprint, collision, vehicle controller, lane information or business data changed. No new textures, external assets or dynamic lights.

## Measured evidence

| Profile | Ready before → after | Main furniture CPU build | Signposts | Utility poles moved | Roadside head failures |
|---|---:|---:|---:|---:|---:|
| full | 52.43 → 53.66 s | 871 ms | 150 | 13 / 122 | 0 |
| lite | 10.98 → 11.37 s | 366 ms | 55 | 7 / 122 | 0 |

Loading figures are individual sequential local observations, not a controlled cold-cache benchmark. Geometry/lamp placement runs once at load; no per-frame road searches were added.

- full: draw-call change 3 to 3; texture allocation change 0 to 0; triangle change 48560 to 48560. Display-capped median approximately 16.7 ms; do not infer GPU speed or phone performance.
- full driving smoke: George Street North path follower completed, 0 off-road frames, maximum tracking error 0.50 m. It calls the real truck update at 60 Hz.
- full: console/network errors 0; lamp/signal editor hide and restore passed for all 3/7 parts.

- lite: draw-call change 3 to 4; texture allocation change 0 to 0; triangle change 48560 to 48752. Display-capped median approximately 16.7 ms; do not infer GPU speed or phone performance.
- lite driving smoke: George Street North path follower completed, 0 off-road frames, maximum tracking error 0.50 m. It calls the real truck update at 60 Hz.
- lite: console/network errors 0; lamp/signal editor hide and restore passed for all 3/7 parts.

## Checks and limits

Actual images inspected in full and narrow lite: downtown intersection/front and oblique, Lansdowne approach, east-city intersection, a downtown area lamp, north-city roadside lamps and a service-road lamp. Citywide quantitative audits cover all mapped and Sherbrooke light poles; these representative captures do not mean every street was visually inspected. No physical phone testing.

Focused node tests cover placement, geometry, source direction, short-arm reach, wider pavement, blocked footprints, ribbon lookup parity, Sherbrooke pole/wire preservation and legacy fallback. Existing road-contact and Hunter-appearance regression checks also pass. JavaScript syntax and focused diff checks passed.

Independent Sol review found a first-pass lamp aiming defect and excessive placement cost. Both were corrected and rechecked. Final verdict: no scoped blocker found. The reviewer independently confirmed all 122 actual utility-lamp tips over pavement and all 484 mapped/corridor pole bases clear in full and lite, with source identity, static rendering and wire references preserved.

## Reproduce

Run `node test-artifacts/roadside-lights-20261025/capture.cjs baseline-matched`, then `final`, against local port 8893 with Playwright available through NODE_PATH. Full and lite are sequential. Baseline mode intercepts the saved pre-change app in the browser only; it never overwrites runtime code. Run `node test-artifacts/roadside-lights-20261025/finish.cjs` to validate audits and rebuild the comparison. Preserve these baselines for future work.
