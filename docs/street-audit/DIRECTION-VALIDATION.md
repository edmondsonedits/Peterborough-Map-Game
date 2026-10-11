# Direction-aware audit validation — 2026-10-11

Source base: `ae711377f46fda285c5b0211f4c0992ddb9b754e`.
This change touches only audit code, tests and audit documentation/output.
No geographic input, runtime road, paint, dispatch, routing or application file
was changed. Nothing was pushed or deployed.

## Results

- Full original and updated audits run locally against the same current packaged
  sources. Every original value in all 5,961 rows was retained; directional and
  junction tags are additionally exposed where present.
- All 232 raw numeric conflicts remain visible: 100 require compatibility review
  first; 132 remain direction-compatible review candidates. Four of the latter
  already trigger the bounded paint override, leaving 128 without that override.
- 247 ways across all raw statuses require compatibility review.
- Medical Drive ways 250806638, 250807663, 250813228 and Hospital Drive ways
  250811903, 250811907 retain their raw conflicts and are correctly classified
  as carriageway mismatches. Their complete geometric coverage does not make
  one-way and bidirectional lane totals directly comparable.
- Two consecutive runs produced byte-identical output: SHA-256
  `cd11aa2e123eac4865c0cf17f11b485cf33c4fe8d3b9a51c54d261394d496f5a`.
- All six input and two code SHA-256 receipts independently verified.
- Independent code review found no remaining blocker after correcting separation
  of historical visual evidence from current paint-override applicability.

## Checks run

Python 3.12; Shapely 2.0.7 and pyproj 3.7.0 (matching repository pins);
NumPy 2.5.4; Node.js 24.19.0.

- `python -m unittest discover -s tools`: six audit test methods pass, including
  repeated end-to-end CLI scenarios. Covers OSM reverse one-way, signed/reversed
  ORN geometry, bidirectional mismatch even with equal counts, ambiguous
  equal-count candidate directions, conservative unknown directions, raw status
  preservation, actual paint guard bounds, historical review preservation, and
  input/code receipts. Initial tests failed before their corresponding fixes.
- `python tools/geospatial/test_official_lidar_terrain.py`: four tests pass.
- `node --test tools/test_*.mjs tools/geospatial/test_*.mjs`: 90 of 91 pass.
  `tools/test_city_editor_release.mjs` fails its existing assertion
  “the app entrypoint must have a release cache key.” The same failure was
  reproduced from a pristine archive of the source base. Its obsolete
  `road-orientation-fix.js?v=city-editor-20260925` expectation is outside this
  audit-only change; neither the test nor the HTML was modified.
- `git diff --check`: pass.
- Runtime/geographic diff against base: empty.

No browser/device QA or new aerial/field survey was performed. The Node suite
is therefore not an end-to-end runtime certification, and its existing failure
means the full suite is not green. ORN event retrieval/effective dates are
preserved; recomputing the audit does not make the underlying survey newer.
