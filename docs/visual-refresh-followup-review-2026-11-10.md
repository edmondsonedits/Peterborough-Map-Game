# Independent follow-up review — November 10, 2026

Reviewed remote candidate `51da803355195786d7e70854dfc98dc81736094d` (v1.6.203) and the newer uncommitted workspace diff. Read the remote ledger and plan first. The ledger reserves implementation and capture files to the ongoing primary pass; this follow-up made no source edits and did not take over those files. Two read-only agents independently reviewed code and actual images.

## Verified evidence

- GitHub browser run: https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42844958589 . Latest queried status: Lite captures, solo driving, multiplayer driving, vehicle/multiplayer regressions and Station 1 driving succeeded. Balanced capture job remained in progress at baseline capture. This status is a snapshot, not a final CI result.
- Lite artifact `13779930124`, `visual-refresh-lite-42844958589-1`, belongs to exact candidate `51da803355195786d7e70854dfc98dc81736094d`.
- Local evidence under `qa-captures/51da803/lite`: 52 matched static baseline/current pairs, recorded zero position/quaternion deltas; 26 additional current cab images. There are no baseline cab images. Do not call these matched before/after cab captures.
- Actual cab contact sheet, dental baseline/current images and Reid sage-house cab image were inspected against owner photos R033 and R073. Lite suppresses photo-facade details (`graphics-quality.js` optionalScenery false and app.js createFootageFacade gate). Blank windows/doors in Lite cannot establish whether new detailed facades work. This behavior also exists in the baseline; no new regression was established.
- Static eye requests are labelled 2.5 m but the dental capture reports actual 5 m AGL. Actual cab images separately report approximately 2.4–3.2 m AGL. The pending harness wording changes acknowledge raised-fly static views.
- Independently reran five focused test files: chemong-roof-details, route-open-ground, route-sherbrooke-appearance, route-source-height and shared-wall-integration: 37 passed, 0 failed. Capture config validation reports 26 sites and 22 source IDs.

## Findings for the owning implementer

1. **Capture coverage must expand before accepting Sherbrooke.** The pending composition adds eight Sherbrooke records, but SOURCE_IDS/SITES still contain only the previous 22 route records. The existing Sherbrooke control targets another building. Add dedicated poses for each new source and validate coverage against active route records, not only two hand-maintained capture lists. Run actual current Balanced/Lite captures after integrating/versioning the code.
2. **Walmart ground work is not yet visible.** `route-open-ground.js` exists and its isolated tests pass, but app.js has no runtime integration. Do not report the parking changes completed until wired, source/support readiness exercised, and captured from the cab. Preserve lot-hole and road exclusions.
3. **Balanced visual evidence remains required.** Lite's established optional-scenery gate removes most of the new façade detail. Keep that performance policy; do not enable everything in Lite merely to make screenshots look better. Inspect Balanced glazing, signs, entry placement and real mapped wall heights.
4. **New roof work needs new-head evidence.** No critical code defect found for the two enabled Chemong roof footprints: source outlines and maximum roof top are preserved, explicit roof/source dimension guards remain, invalid geometry fails without partial output, and existing batches are reused. The v1.6.203 images do not show these newer uncommitted changes.

## Patch and release status

Read the local 21-file applicability audit: old app.js/release-normalizer cannot replace the newer files; missing route subsets need selective restoration, and prior unsupported lot/island placements remain withheld. Preserve these decisions.

No code update, version bump, merge, production publication or quality approval occurred in this review-only follow-up. v1.6.203 remains the latest verified remote code candidate at review time. Original implementation ownership is unchanged. Next pass should resolve the findings, checkpoint a new code version, then review exact-head Balanced and Lite evidence before publishing. The four-hour cutoff remains 13:57 America/Toronto on November 10; no new schedules were created.
