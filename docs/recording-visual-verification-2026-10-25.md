# Driving photograph integration - local verification, 2026-10-25

Implemented in `H:\ChatGPT\Peterborough-Map-Game-Sherbrooke`, branch `codex/sherbrooke-existing-city`. Existing dirty work and source photographs were preserved. Nothing was committed, pushed or published.

[Open the before/after comparison](../test-artifacts/recording-visuals-20261025/comparison.html). It contains 23 matched front/oblique/detail/control cameras in desktop full (1500 x 950) and narrow lite (430 x 900), at 2.6 m street-eye height. The accepted images are in `accepted/`; preserved baselines are in `baseline/`, `baseline-extra/` and `baseline-water/`.

## Retained changes

| Site | Reference-derived addition | Limit |
| --- | --- | --- |
| No Frills, George/Sherbrooke, R01 | Bounded yellow wall panel, adjusted existing wordmark layout, small original maple-badge crop | Main photo contains foreground obstruction; no whole-wall wrap. Colour/dimensions are estimates. |
| Commerce Building, V01 | Rectified two-column COMMERCE BUILDING sign crop on the Water Street wing | Explicit `additionalFrontages[0]`; Hunter facade is unchanged. Baked lighting remains. |
| 364 Water, R13 | Broad pale stone/concrete pier separating the vertical glazed bay from ribbon windows | Surface panel over existing facade geometry; no height, roof, footprint or collision changes. |
| Sherbrooke S03, S04, S05, S09, S10 | Existing garden paths and driveways use subtle photo-supported neutral greys | No new lawn, parking extent, path or driveway geometry. This adjustment is subtle. |

Eight unique matched buildings/sites. Two small images ship: 18,218 encoded bytes; estimated 249,516 RGBA8-plus-mipmap bytes (0.238 MiB), excluding driver overhead. No new texture pipeline or reflection system. Settings use the existing component and photo loader paths. The reusable helper supports future profiled buildings; these particular source-backed assignments do not apply to the whole city.

## Performance evidence

All GPU captures ran sequentially on the same local Windows desktop/browser. The first sixteen views were traversed in the same order, with matching camera parameters, resolution and day lighting. First-ready is a single local sample, not a statistically established loading improvement.

| Mode | Ready before -> accepted | Draw-call change, first 16 views | Texture-object delta | Browser/network errors |
| --- | --- | --- | --- | --- |
| full | 51.324 -> 50.984 s | 0.00% to 0.35% | +2 to +2 | 0 |
| lite | 10.545 -> 10.546 s | 0.00% to 0.71% | +0 to +2 | 0 |

Median requestAnimationFrame intervals stayed about 16.7 ms. They are display-capped and do not establish GPU execution performance. The local acceptance budgets were <=10% draw-call growth, <=20% median frame-interval change, <=1 MiB new encoded images and <=12 MiB estimated decoded image storage; this pass remains within those budgets.

R13 was originally captured in a separate baseline group. The following matched-camera results use the accepted state, but the traversal/warmup differs from that baseline group, so they are supplementary observations rather than a loading/allocation benchmark:

| View | Draw calls before -> accepted | Median frame interval |
| --- | --- | --- |
| full R13-front | 355 -> 356 | 16.7 -> 16.7 ms |
| full R13-oblique | 308 -> 309 | 16.7 -> 16.7 ms |
| lite R13-front | 186 -> 187 | 16.7 -> 16.7 ms |
| lite R13-oblique | 206 -> 207 | 16.7 -> 16.7 ms |

## Verification and review

- 21 focused tests passed: recording asset hashes/budgets, facade selection, immutable identity/massing/roof preservation, photo success/failure behavior, garden geometry bounds, and explicit personal overrides, plus relevant existing frontage/photo tests.
- JavaScript syntax checks passed for shared runtime edits; `git diff --check` passed. Existing LF/CRLF warnings are unrelated.
- All 23 final desktop and lite cameras were recaptured after review. Runtime console/page/network error lists are empty.
- Full and narrow-lite night and brief driving smoke checks passed during the integrated run before removing the rejected address photo; the truck entered driving mode and moved. Those smoke checks precede the final R13 display-pier correction, address-photo removal and unused-custom-override guards; none changes collision or driving logic. Night/driving evidence is preserved in `final/`.
- Final browser fallback run: `recordingReferences=off` requested zero new photographs; blocking both retained image requests left procedural details usable. Unit tests also cover full-photo replacement versus partial-photo overlays.
- One independent `deep_reviewer` (GPT-6 Sol Medium) reviewed the focused diff, original R13 frame, actual desktop/lite before/after images, and evidence. It found one blocking source-fidelity issue: isolating `364Water.com` from a FOR SALE / LEASE board implied a permanent standalone plaque. That crop and runtime assignment were removed; the stone pier remains. The reviewer reported no other blocking regression in this scoped integration. This is a scoped verdict, not approval of the entire city or engine.
- The comparison page checks all 92 before/after image references and its mode/view controls. See `comparison-qa.json` for the result.

The capture harness initially hit an undefined `views` variable after desktop screenshots. Its page-evaluation argument was fixed and captures/measurements rerun. Those intermediate images remain for audit; the comparison exclusively shows `accepted/` images.

## Sources, reproduction and fallback

Use [the authoring guide](city-visual-authoring.md#applying-the-located-driving-photographs). Source coordinates, hashes, crop dimensions, accepted/rejected observations and preparation settings are in `city-explorer/assets/recording-frontages/recipes.json` and `manifest.json`; architectural observations are in `city-explorer/data/recording-reference-evidence.json`. Source is the user's October 18 drive, not a new external image licence. Original media remains unchanged under the permitted H:\ChatGPT tree.

Regenerate the two crop assets with `python tools/streetscape/build_recording_frontages.py --references H:/ChatGPT/Peterborough-Building-References-20261024`. Run `node test-artifacts/recording-visuals-20261025/capture.cjs accepted` against the loopback server for the fixed cameras, then `generate-comparison.py`. The reference opt-out is `city-explorer/?recordingReferences=off`; `visuals=legacy` also disables these overlays. Neither option rolls back unrelated concurrent work.

## Deferred and unverified

Unlocated parking-lot/grass scenes and the unmatched residential image set were not placed because their exact site correspondence is unconfirmed. Existing lawn geometry is retained. Obstructed commercial candidates remain references; full facade reconstruction and porch depth were outside this bounded integration. Calibration, perspective, shadows and crop positions remain approximate. No physical phone, other hardware, whole-city traversal or deployment was tested.
