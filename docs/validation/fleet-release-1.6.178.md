# Fleet release v1.6.178

User authorized publication on2026-11-03 after local fleet commitceeb5c36.

- Preserves productiongeospatialrefresh e6ff6d01.
- Adds Station1 rescue aerial and enclosed medicalpickup, five session-persistent direct vehicle choices, rear mountedfolding rescuebasket/underside monitor, outriggers, laddercontrols, spray and stow.
-1250deployment tests passed, plus35release/pack regressions after canonical normalization.
- Roadcompiler completed fromnormal .cjs file entry withpolygonoptimizerchecked. Pack6037a4864359c497ca44 has669tiles,4349747triangles and74689607compressedbytes. All669decoded and compressedtile payloads are byte-identical toproduction; only sourcefingerprint/buildIDmetadata changes. Packverifier andmarkingverifier pass; zerounsupported/above/belowpaintfailures.
- New fleet checks added to Pages workflow. Canonical entrypoints/cache keys normalized tov1.6.178, including fleet module importmap.
- Local desktop andphoneviewport fleet/browser acceptance recorded in artifacts/fleet-final-browser.json.

Published successfully in Pages run41746880049 from8d8187f3. Fresh public checks matched56/56changed runtimefiles. An uninjected live Edge browser confirmed v1.6.178, allfive Blender-ready models, driving start, Medi/Aerial menu selection, correct in-bay deployment rejection, no page/first-party HTTPerrors and no narrow-viewport overflow. Receipt: docs/validation/fleet-publication-receipt.json. Legacy desktop/mobile browser-entry QA now explicitly verifies fresh driving before preparing its separate on-foot scenario; both tools pass locally. Physicalphone performance remains unmeasured.
