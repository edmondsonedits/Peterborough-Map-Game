# Intersection holograms — 2026-10-25

[Before/after and turn/night comparison](../test-artifacts/intersection-holograms-20261025/comparison.html) · [Measurements](../test-artifacts/intersection-holograms-20261025/summary.json)

Implemented locally in `H:\ChatGPT\Peterborough-Map-Game-Sherbrooke`. No deployment, publication or push.

## Behavior and scope

- Large cyan/white holograms hover above intersections and use Three.js Sprites to face the active camera. Panels sit 9.6 m above their junction road surface, clearing the text above typical signal heads. Physical street-name boards/posts are omitted by default; lamps, signals and map labels remain.
- Driving selection uses truck heading. The label shows the other street(s), switching near the turn's angular midpoint (about 48 degrees for perpendicular roads), with hysteresis to prevent jitter. Camera lookaround alone does not change the name. Exact mapped names are retained. A multiway junction can list multiple crossing names.
- Full: **1,775 eligible intersections / 919 distinct names**. Lite: **1,771 / 918**. These counts reflect loaded road data and same-grade/source-endpoint eligibility; unnamed, nonmotor, disconnected, and grade-separated crossings do not receive invented names. This is citywide integration, with visual verification only at the four junctions below.
- Shared settings in `intersection-holograms.js`; pure topology/selection in `intersection-hologram-rules.js`. Only three full or two lite sprites can render, within 110 m, with overlapping labels culled. Depth testing preserves building occlusion. Labels can pass overhead out of view when driving directly beneath them. High flight and map mode hide them.
- No road, footprint, address, vehicle controller, collision or source traffic-furniture coordinates changed. Default runtime still has 149 mapped lamps and 213 signals, and no physical street-name sign parts.

## Evidence

Fresh baseline precedes runtime changes. `baseline/` and `final/` have exactly matching camera coordinates, viewport, quality and theme for Charlotte/George Street North, Mark/Robinson, Aylmer Street North/Bellevue and Borden/High. Resolution: 1500×950 full and 430×900 lite; approximately 2.6 m road eye height. Images were inspected, including oblique and night views.

`checks-final/` is the accepted driving-mode evidence: George Street North at 0°/40°, Charlotte Street at 55°/90°. Camera-only ±20° full or ±8° lite keeps George Street North. These are **controlled vehicle headings at a fixed camera**, not a physically driven turn. Separate path-follower smokes call actual `updateFireTruck` at 60 Hz: full 2,661 frames (44.35 virtual seconds), lite 3,654 frames (60.9 virtual seconds), both completed with zero off-road frames. No physical-phone test or exhaustive citywide visual inspection.

The earlier `checks/` directory is a retained failed harness attempt: it froze the camera before the existing QA tool applied its orientation. Its images and CPU samples are not accepted verification. `candidate/` also predates the elevation clustering fix and panel-height adjustment. Baseline/final paired evidence remains separate and valid.

## Performance

| Profile / view | Draw calls before → after | Textures | Geometries |
|---|---:|---:|---:|
| full / downtown | 381 → 379 | 15 → 15 | 954 → 953 |
| full / east-city | 284 → 282 | 15 → 15 | 954 → 953 |
| full / residential | 231 → 229 | 15 → 15 | 967 → 966 |
| full / lansdowne | 1090 → 1088 | 36 → 36 | 1178 → 1177 |
| lite / downtown | 201 → 199 | 6 → 6 | 361 → 360 |
| lite / east-city | 170 → 168 | 6 → 6 | 364 → 363 |
| lite / residential | 148 → 146 | 6 → 6 | 391 → 390 |
| lite / lansdowne | 275 → 273 | 9 → 9 | 501 → 500 |

Full readiness: 53.487 → 53.115 s; lite: 11.464 → 11.354 s. These are sequential local observations, not controlled cold-cache benchmarks. Frame medians remain about 16.7 ms, p95 at most about 16.8 ms; the display cap is not proof of GPU performance. The 300-iteration nearby-label update sample averaged about 0.004 ms CPU per call on this host, a warm-loop observation only.

The fixed canvas pool has a 3 MiB full / 0.5 MiB lite RGBA upper-bound estimate, no mipmaps, versus about 16 MiB / 8 MiB for the prior sign atlas including mipmaps. Three.js lazily uploads visible textures; measured total texture object counts did not grow in these views. No external images, new texture downloads, dynamic lights or per-intersection meshes were added.

## Checks and review

22 focused Node tests pass: intersection topology/heading/hysteresis, height-boundary clustering, layer/overpass separation, renderer pool/lookaround/clutter/hiding/viewport limits and existing roadside geometry/placement regressions. JavaScript syntax and focused diff checks pass. Desktop/lite browser console, page and HTTP-error checks are empty. Map/overview hiding, unchanged lamp/signal counts and dynamic sprite transforms were checked.

Independent `deep_reviewer` / GPT-6 Sol Medium reviewed the focused code and actual final day/oblique/turn/night images: **no blocking finding; no further action recommended for this scoped review**. Reviewer explicitly retained the controlled-heading limitation above.

Settings and fallback recipe: [authoring guide](city-visual-authoring.md#floating-intersection-street-names). Append `streetLabels=legacy` for former physical boards or `streetLabels=off` to hide intersection names. No new asset licence is required for the programmatic panel artwork.
