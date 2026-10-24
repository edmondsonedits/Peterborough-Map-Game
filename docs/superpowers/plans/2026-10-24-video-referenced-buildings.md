# Video-referenced building improvements implementation plan

> For agentic workers: use superpowers:subagent-driven-development, with one focused Luna implementer. User explicitly requested direct execution and minimal usage; continue without further design questions.

Goal: Take timestamped screenshots throughout the selected October 18 15:44 driving recording, use FisheyeReframer for useful perspective references, and improve positively identified buildings in the existing Peterborough Map Game simulator.

Architecture: Reuse the existing isolated codex/sherbrooke-existing-city worktree. Keep official GIS footprints, terrain, roads, collision and controls authoritative. Extend the existing source-ID-keyed reviewed-profile/detail path where needed; no engine replacement or broad unrelated refactor. Reference imagery stays local unless deliberately selected as a small, provenance-tracked runtime texture. No upload, push or deployment in this task.

Tech stack: Existing Three.js modules, Node tests, Python/FFmpeg/OpenCV FisheyeReframer, existing browser QA hooks.

Spec: User requests in this thread and H:/ChatGPT/Peterborough-Building-References-20261024/REFERENCE-CATALOGUE.md. This direct execution request supersedes the earlier read-only review scope.

Global constraints:
- Access H: only within H:/ChatGPT. Check resolved input/output paths; never follow old metadata paths elsewhere on H:.
- Preserve originals and concurrent edits. New files stay under H:/ChatGPT.
- One focused Luna worker handled bounded implementation research; parent took over all code ownership after its write step stalled. The worker made no concurrent edits.
- Buildings require a positively established source ID. Unknown addresses/hidden details are recorded as unresolved, not invented.
- Dimensions derived visually remain estimates. Correct topology/features/materials using evidence; preserve authoritative footprint unless separately supported.
- Avoid scaling up the 960px overview to claim detailed references: selected views use original 3840px lens frames and 2048px/100-degree output.
- Proportional checks: focused feature/asset tests, related frontage/editor tests, syntax/diff checks, desktop and narrow-lite smoke plus truck movement. No physical-phone claim.

Review focus:
- Wrong POI-to-footprint association or duplicate/adjacent-building contamination.
- Fisheye curvature copied into planar building geometry, or photos hiding required porch/balcony depth.
- Source IDs not linked to editor hide/copy/restore.
- Optional-photo failure, duplicate front windows and geometry, low-power rendering.
- Expanding imagery/draw calls unnecessarily or altering driving/roads.

Task 1 — Timestamped full-recording reference coverage (parent):
- Create reusable screenshot extraction/index script in H:/ChatGPT/Peterborough-Building-References-20261024.
- Extract both lens frames at two-second intervals plus final second, retaining exact requested timestamps and source identity.
- Reuse existing samples and converter; create contact sheets and selected aimed 2048px views as needed rather than reviewing every image at full resolution.
- Verify first/last coverage, paired lens counts, decoded image sizes and manifest links. No source writes.

Task 2 — Evidence-matched map improvements (one worker):
- Inspect cached OSM and existing facade/profile integration, then map visible named buildings/ordered adjacent frontages to exact existing source IDs.
- Use screenshots across the recording to identify supported improvements beyond the prior six photo fronts. Prioritize real roof forms, floor/window patterns, materials, projecting porches/bays/balconies and recognizable commercial fronts.
- Add a compact evidence manifest and source-ID-keyed profiles. Reuse/generalize existing geometry helpers narrowly. Keep side/rear uncertainty explicit.
- Add meaningful tests for new source associations/profile precedence/geometry/editor bindings as changed; run focused tests and existing related regressions.
- Keep source footage, previews and large reference collections out of public assets. If adding small selected textures, record crops and source provenance.

Task 3 — Final verification and handoff (parent with scoped worker fixes):
- Review implementation against references, source IDs and constraints; no automatic model escalation unless reasoning difficulty warrants it.
- Run syntax/diff checks, focused related tests and targeted browser views at new/changed buildings, then narrow-lite/control smoke.
- Save before/after evidence, exact changed IDs and unresolved coverage. Report local changes with their verification and no deployment claim.

Preflight conflict scan:
| Scope pair | Interface | Finding |
|---|---|---|
| Task 1 / Task 2 | Reference manifests and selected images | Parent writes reference package; worker only reads it and requests needed timestamps. No shared code ownership. |
| Task 2 / Task 3 | Simulator modules and QA | Worker owns implementation; parent reviews and does not edit those files concurrently. |
| Task 1 internal | Raw frames vs flattened references | Preserve raw samples; detailed reference output comes from original resolution. |
| Task 2 internal | Source IDs vs rendering | Require explicit positive matches before authoring data; unverified buildings remain unchanged. |
| Task 3 internal | Local results vs deployment | Local QA only; no publishing inferred from implementation request. |

Progress ledger:
- Existing worktree verified isolated and clean at task start; branch codex/sherbrooke-existing-city.
- Initial 64-timestamp overview and selected 40 perspective references already exist; do not repeat their extraction unnecessarily.
- Full-video extraction complete: 473 paired timestamps, 946 raw lens images and 2,838 aimed views; all 3,784 images verified. Selected detailed views total 64.
- Parent implemented three positively matched buildings and five street faces, with evidence manifest and editor-linked groups.
- Independent source-match review corrected the bank corner and verified final Chemong frontage/sign clearance. Visual review caught and fixed mirrored sign text.
- 31 related tests passed. Desktop and narrow-lite smoke passed at 19 frontage groups and 584/319 draw calls; zero errors, six existing facade photos loaded, gardens and truck controls preserved.
- Final implementation report: docs/VIDEO-BUILDING-IMPROVEMENTS.md. Local saved changes only; no push/deployment. Unmatched residential candidates remain documented rather than guessed.
