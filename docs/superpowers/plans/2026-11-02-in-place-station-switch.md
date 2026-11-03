# In-place station switching

User-approved design: keep the city and shared firefighter/truck alive when choosing another station. Preserve driving mode; enter the selected station's configured bay with reset doors and correct surface/collision rules. No page navigation or complete city rebuild.

- [x] Diagnose selector navigation and startup-fixed station state.
- [x] Review architecture: destination road focus, scenery readiness, callback races, static/dynamic model ownership, closed door poses and Station 3 adaptation.
- [x] Implement latest-request coordinator and selector hook (Luna owns helper/UI/tests).
- [x] Integrate cached station runtimes, transactional activation, model ownership, loading/failure safeguards (parent owns app/runtime integration).
- [x] Unit tests and browser checks: every directed station transition, driving/on-foot mode, repeated/rapid selection, delayed and failed loads, actor/world identity, correct doors/collisions, screenshots.
- [x] Focused Sol review, fix findings, compile matching road pack and verify release candidate.

Rulings: reuse the existing isolated release worktree. Keep inactive, previously visited station runtimes as scenery; only the active station owns player/vehicle collision. Hide a facility's static wrapper when its interactive runtime takes over. Retain Station 3's established automatic door reveal. Fly/map selections start on foot; driving selections remain driving. Keep the current view and pause motion until target readiness, with latest selection winning and failure retaining the current station. Existing publication authorization persists. No physical phone available; desktop and browser viewport tests only.

## Validation

The focused pre-release suite passed 81 tests. Chromium exercised all six directed station transitions, opened the correct bay door and drove at least 23 metres at each arrival, preserved driving and on-foot modes, and tested rapid 2→3→1 selection. The initial switch happened with 38 scenery groups still pending. Read-only observation confirmed identical scene, building group, firefighter and truck objects and no new document/app/terrain/building-source requests. Static station wrappers stayed hidden after their interactive runtimes took ownership.

A separate unmodified-runtime browser test delayed and rejected Station 2 model requests with HTTP 503. The active Station 1, stopped truck pose, driving mode, document and URL were retained; retry succeeded, and rapid selection retained the final requested station. Only intentional model errors were recorded. Screenshots were reviewed at the bays and street exits. Desktop balanced-profile return visits measured 0.57–1.21 seconds including screenshot capture; the first Station 2 visit took 5.57 seconds while background scenery was pending. These are local desktop observations, not phone or network guarantees.

Sol review prompted two corrections: use Station 3's exact interior spawn coordinates for destination readiness, and ignore unrelated historical road-tile failures when destination coverage is ready. Editor entry and movement are guarded during transfer; failed model loading presents a short retry message.

Four additional destination-readiness regressions passed. Release candidate v1.6.171 uses road pack `1c1c7d00da4480dd91b0`; all 669 raw tile hashes match the previous release. Road-pack integrity and final marking-support verification passed with zero missing, below-surface or above-surface markings. Publication and fresh live browser checks follow the release commit; reports are saved in the task's external QA directory.
