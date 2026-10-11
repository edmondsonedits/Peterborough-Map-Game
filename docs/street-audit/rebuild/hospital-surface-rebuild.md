# Bounded Hospital pavement reconstruction

Fresh implementation, 2026-10-11. No recovered patch or old implementation was used.

## Scope

The existing Station pavement reconciliation accepts optional `radius` and
`heightSmoothing` arguments. Defaults remain 240 m and zero smoothing. Hospital / Medical
uses center 44.301005, -78.34631, radius 120 m and a 4 m separable 3×3 weighted height
filter. Raw height taps are memoized, and smoothed lattice heights retain the terrain
clearance floor. It runs after the normal Station reconciliation and before official
curb construction. The final rendered pavement index is used for contact and curbs.

Municipal source rings are unchanged. Ownership clipping retains the existing
axis-aligned ±radius box; elevation weights taper radially from 100 to 120 m.
Triangle interpolation can extend a tiny elevation change past the nominal radial
boundary within that box: an independent 2 m grid outside radial 120 m found two
samples over 1 mm, maximum 2.627 mm at offset (-119, 17) m, radius 120.21 m.
This is not a claim of exact circular geometry support.

## Reproducible evidence

Run from repository root:

- `node tools/test_hospital_pavement_options.mjs`
- `HOSPITAL_SURFACE_REPORT=docs/street-audit/rebuild/hospital-surface-results.json node tools/test_hospital_surface.mjs`
- `node tools/test_hospital_surface_controls.mjs`

The fixture reads the packaged municipal polygons, all OSM road profiles and actual
Ontario lidar PNG. It reproduces Float32 terrain lattice heights, municipal longest-edge
subdivision, height caching, and Float32 mesh uploads for desktop and low-power profiles.
It retains all intersecting source polygons instead of clipping source rings to the
520×520 m analysis window before triangulation. Analyzer bounds include triangles
intersecting that window, including boundary-crossing faces. Bridge elevation lifts
outside the local window and water recess are not simulated. It is a deterministic
local geometry/contact fixture, not a browser-equivalence or real-device performance claim.

Results in `hospital-surface-results.json`:

- Desktop full-window >25 mm geometry violations: 49 → 35; maximum remaining overlap
  difference 288.68 mm. Low-power: 54 → 44; maximum remaining overlap 310.32 mm.
- Central 100×100 m: zero >25 mm seam/overlap violations in either profile after
  reconciliation. Desktop pre-repair maximum overlap was 1.5264 m; low-power 169.66 mm.
- The exact historical target route was unavailable. A new equivalent physical
  probe at the centroid of the worst pre-repair core overlap, using four headings,
  both directions and three initial heights, improves from 1.4369 m to 1.251 mm
  on desktop and from 141.4 mm to 0.454 mm on low-power. The location and every
  trace are recorded in `targetProbe`; these are not the historical 6.6/4.8 mm values.
- All flagged shared-edge pairs in both before and after geometry were crossed at
  three interior points, both directions and three initial heights, tracking each
  previous contact height. Desktop: 198 traces, no worsening. Low-power: 342 traces,
  maximum worsening 0.1645 mm, below the unmodified 1 mm regression threshold.
- At 44.30127890, -78.34761916, desktop physical worst step falls from 548.8 mm to
  216.4 mm; low-power from 425.8 mm to 168.7 mm across the two tested directions.
  These remaining steps are substantial and are not described as smooth or fixed.
- No road-contact segment newly exceeds 15% grade with more than five percentage
  points of deterioration. Sampling is at approximately one-metre spacing.
- Raw height queries: 2,170 desktop / 2,168 low-power. Recorded local reconciliation
  timings are environment-dependent and are provided in the JSON, not performance promises.
- Normal Station reconstruction and Chemong geometry stay byte-for-byte unchanged;
  the same distant GPU geometries are reused and sampled contacts compare exactly.

Counts differ from earlier reported experiments. These new fixture measurements are
reported directly; the historical counts are not used as assertions or substituted
for new results. Residual full-window geometry reports deliberately retain `status: fail`
for pre-existing >25 mm mismatches. The acceptance tests separately assert improvement,
no physical contact deterioration over 1 mm, and no specified new grade regression.

## Related regressions verified

Pavement field, Station layer, rendered pavement, independent continuity analyzer,
Hospital options, official bridge-use, citywide road quality, Station road detail,
road network, and lidar terrain-clearance tests all passed. Browser visual comparison
and the repository-wide suite are owned by the integration task.
