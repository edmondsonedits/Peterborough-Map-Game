# City-wide shared building textures

User-authorized scope: extend the accepted Station 2 texture treatment to every ordinary mapped building in Peterborough. Preserve custom/photo/authored buildings, source footprints, heights, collision, roads and station gameplay. This is a local implementation; no publication was requested for this expansion.

Approach: reuse the eight existing tiny shared textures and batched geometry. Replace radius selection with explicit eligibility and exclusion rules. Index nearby roads spatially rather than scanning the entire city per building. Give all eligible walls coverage, keep per-building opening geometry bounded, and use distance/quality reduction for optional detail. Never exhaust a global budget that silently leaves later neighborhoods bare. Keep original roof envelopes and source-tagged shapes; preserve bespoke geometry.

1. One Luna worker owns app integration, pure city eligibility/road-index helpers and focused tests. Add aggregate coverage and exclusion diagnostics with optional detailed audit, plus baseline/pilot query controls. Avoid broad renames or asset duplication.
2. Parent owns QA scripts/reports and reviews the diff. Compare baseline and city-wide views in north, downtown, west and east neighborhoods; inspect a known custom building and low-power mode.
3. Check whole-renderer coverage, bounded road queries/geometry, shared texture count, editor lifecycle, startup/render metrics and Station 2 drive-out. Fix concrete issues; escalate only if a focused attempt exposes unresolved complexity.
4. Deliver local preview, concise measured coverage/performance and remaining limitations. Do not publish or regenerate road packs for this local visual task.