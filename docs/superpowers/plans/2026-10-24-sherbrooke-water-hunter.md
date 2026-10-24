# Sherbrooke → Water → Hunter building pass

User requested all buildings along the recorded route, screenshots and corresponding game improvements. Continue the approved source-faithful workflow without another design round. Existing engine and profile renderer are retained.

Route scope: Sherbrooke east from Station 1/Stewart to Water; Water north to Hunter; Hunter east to Burnham as shown by the recording. Do not substitute the unrecorded westbound Hunter leg.

1. Reuse the full-video two-second index and inspect both sides from approximately 08:00–13:55. Save selected original 3840 lens screenshots and 2048 perspective views, linked to source times/hashes; skip repeated traffic-light frames.
2. Inventory every first-row footprint and visible landmark, match by street order/corners/tags, and record observed versus obscured details. Existing Sherbrooke profiles count toward coverage but must be reviewed against the full original recording. Do not force unseen rear buildings into the street-facing set.
3. Add route-specific profiles/evidence in city-explorer/route-building-profiles.js and route-building-evidence.json, merged into sherbrooke-footage-profiles.js. Correct observable massing, materials, floor/window rhythm, glazing, roof silhouette and entrances; preserve footprint placement and the prior photo facades. Extend only the narrow renderer options required by recorded larger buildings.
4. Meaningful tests for complete inventory accounting, exact source-edge placement, geometry, outward detail orientation and editor integration; then related frontage tests and matched before/after street views, desktop/narrow-lite smoke and truck movement. Avoid full-project testing until preparing a release.
5. Save coverage/contact sheets and concise change report, including any occluded/unmatched cases. No claim of individual review of every video frame. Preserve originals and restrict all H access to H:/ChatGPT. Parent owns edits; one read-only agent owns the map inventory. Previous publication is v1.6.126; finish local implementation and verification first.

Progress: source extraction and catalogue complete; 51 candidates accounted for, 26 new profiles and two refinements implemented. 36 related tests passed. Independent source-edge review passed. Desktop/narrow-lite runtime checks passed; corrected road-position screenshot comparisons are being finalized. See docs/SHERBROOKE-WATER-HUNTER-IMPROVEMENTS.md.

Continuation: implemented 27 new profiles plus two corrections, footprint-clipped stepped volumes, Simcoe mansard/dormer groups and source ownership of Quaker/Showplace. Independent review found a concave zone-boundary case; regression reproduced before repair. Related tests and desktop/narrow-lite corridor QA passed. Publishing v1.6.127 uses the prior user authorization. Six obscured/behind-route buildings and unrecorded Quaker rear estimates remain documented.

Final: source point-cap bug found by left/right obliques and corrected only for reviewed footprints; conversion regression passes. 586 production checks, diff whitespace check and focused browser recaptures pass. Release v1.6.127 is ready for the user-authorized main/Pages publication.
