# Consistent station camera and controls implementation plan

**Goal:** Use the Station 1/2 manual-door experience across all three stations, with selectable camera views and a closer automatic bay view that transitions to the normal street camera.

**Design approved by user:** Manual bay doors everywhere; selectable views in settings; closer inside the station and normal after departure. Keep accurate station geometry and existing bay spawn locations. Default camera mode is Automatic, alongside Close, Standard and Wide. Save the choice locally with a safe fallback when storage is unavailable. Changes apply immediately without reloading the city. Indoor clearance remains enforced for every preset.

**Architecture:** A small camera-preference/policy module supplies shared framing and smooth bounds-based bay influence. Existing camera following, terrain clearance and station wall checks remain in the main runtime. Station 3's sectional controller gains reversible manual movement and obstruction handling. A single lightweight Station 3 runtime adapter provides the existing controls with door state and collision/spawn-local helpers.

**Tech stack:** Existing Three.js, plain JavaScript modules, native HTML settings dialog, Node tests and Playwright touch/desktop browser QA.

## Ownership and work

- [x] Luna worker implemented Station 3 controller, local bay collision helpers and focused regression tests: closed default, open/close/toggle, continuous reversals, obstruction and reset.
- [x] Parent implemented shared camera module, settings UI, app integration and Station 3 manual controls. Tested persisted presets, storage failure, bounded bay detection, smooth transitions and indoor clearance.
- [x] Parent reviewed worker output and tested cold starts, switch arrivals, door closing/obstruction, camera entry/exit, mobile settings, persistence and unchanged city/session identity. Sol reviewed geometry and integration; lateral facade collision received a focused follow-up.
- [x] Freeze runtime changes, rebuild the matching road pack, and verify geometry and markings. Publication and fresh live verification follow through the Pages release workflow.

## Verification focus

- Door stays closed at Station 3 until requested; only the truck bay opens. Closing cannot intersect the truck or firefighter, and closed doors block entry/exit.
- Camera transitions depend on actual bay bounds, not just station selection. Passing elsewhere in the city must not activate an interior camera.
- Presets survive reset, station changes and reload; Settings changes do not restart the game. Keyboard/controller camera cycling stays consistent with Settings.
- Narrow touch viewport: controls are reachable, the settings picker remains open, and camera framing shows the truck/door without clipping the rear wall or ceiling.
- No physical phone is connected; distinguish browser touch emulation from device verification.

## Local results

- Desktop drive-out and camera transition passed at all three stations. At rest inside the bay, Automatic uses 0.82 of the normal follow distance and a lower camera; after departure it returns smoothly to the normal view.
- Visual review increased the initial close distance from 0.68 to 0.82 to keep the camera behind the truck and corrected the Station 2 camera clearance test for low rear service volumes.
- Touch browser checks at 393 x 852 passed: manual Station 3 button, reachable settings, immediate changes and saved camera choice after reload. No browser errors or failed requests occurred.
- Local evidence: `H:/ChatGPT/Peterborough-Camera-Doors-20261102/final-local/report.json` and adjacent screenshots. These are browser checks, not a physical-phone test.
- The final unmodified release-candidate browser run passed all three drive-outs and the touch driving-camera check with zero errors or failed requests. Evidence: `H:/ChatGPT/Peterborough-Camera-Doors-20261102/release-candidate/`.
- Reviewed collision regressions cover lateral entry using full actor extents, clear outside travel, open-aperture passage, and escape from existing overlap. Bay/controller suites passed 24 tests; the additional camera, HUD, release-loader and gameplay/switching checks passed.
- Road build `8faf8c2623c7b408689e` passed package and marking verification. All 669 raw tiles were unchanged. The Windows gzip OS header was normalized to the prior Linux value only after confirming every resulting transport hash matched the previous published packet; all 669 packet files remain byte-identical.
