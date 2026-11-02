# Startup optimization tasks 1 and 2

> For agentic workers: use subagent-driven-development; one focused implementer with parent QA and focused final review.

Goal: Remove redundant whole-city editor restoration and load selected spawn assets early, preserving visual and geographic quality.
Architecture: Track modified overrides and batch dirty geometry updates. Reuse asset loader promises; selected station, truck and player load alongside map preparation; distant facilities and survey imagery stay optional. Keep explicit gameplay readiness gates.
Tech stack: existing Three.js modules, Node tests, Playwright.
Spec: User approved priorities 1 and 2 from the measured startup audit. Baseline v168:135.9s startup;112.5s applyCityOverrides;8.8s city generation;5.7s city open data. No visual reductions, no streaming redesign.

- [x] Task1: Implement dirty-only editor restoration, valid first-load empty-document fast path, one bounds update per changed mesh. Tests: empty first load does no geometry work; hide/appearance/replace removal restores originals; repeated application and undo; shared meshes and streamed road refresh; authored stations remain protected.
- [x] Task2: Start selected station, truck and player asset requests alongside city data using cached promises. Defer unselected Station3 and survey/orthophoto preparation safely. Test selected readiness, no duplicate downloads, failure fallback, station1/2/3 initialization. Preserve editor/survey availability on demand and collision authority.
- [x] Parent: review diff, compare instrumented startup, test door/entry/drive-out at stations1 and2, verify city/editor behavior and no runtime errors. Critique and fix actual defects.
- [x] Release preparation: v169 normalized, 59 unique focused checks passed, matching road pack compiled and verified; all 669 raw geometry tile hashes unchanged.

Publication is authorized; deployment and live performance evidence will be recorded after this commit reaches GitHub Pages.

Rulings: Reuse the existing isolated codex release worktree. Use one Luna implementer across these closely related changes to reduce context overhead. Existing publication authorization persists. Real-phone testing remains deferred by user; desktop timings are not phone proof.
