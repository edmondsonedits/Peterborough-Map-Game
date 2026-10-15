# Geo Guesser v1.6.108

User-authorized implementation and publication of the shared 200-location catalog.

- Canonical locations: 100 easy / 50 medium / 50 hard, based on recognizability. Keep civic coordinates, separate cross streets and provenance. Do not reuse route-complexity scores as recognition tiers.
- Preserve explicit local edits by rebasing them from the old catalog; retire unchanged unverified records. Keep legacy seed only for migration/audit.
- Shared simulator and route modes consume every canonical address, projecting existing incident categories per service. Preserve EMS hospital transitions and route scoring.
- Geo setup: service → difficulty → base. Both services use the same addresses. Untimed, explicit Next Call, separate cross-street setting visible by default. No scoreboard clients.
- Validate catalog, migration, selection, map/review/reset behavior, simulator EMS and route regressions; exercise desktop/mobile in Chromium.
- Bump to v1.6.108, normalize caches, review, deploy through main, verify Pages version and game flow.

Validation: shared catalog/migration and Geo flow tests were observed failing before implementation, then passing. Full Node suite: 349/349 passed. Chromium UI checks: desktop1365×900; mobile390×844,844×390,667×375,390×568. Existing EMS transport and route regressions passed, including actual dispatch of the shared 200-address catalog. A fresh whole-branch review found four issues; all fixed with failing regression tests: service projections after migration, EMS generated Fire challenge exclusion, immutable editor export baseline, landscape header/crosshair overlap. No deferred findings. External basemap tiles unavailable in local test environment; verify the deployed map separately.
