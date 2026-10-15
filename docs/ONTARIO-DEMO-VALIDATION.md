# Ontario demo release validation — v1.6.109

Validated October 15, 2026.

## Pass 1 — Data and shared runtime

- 30 municipal packs, 600 shared call locations: each city10 Easy/5 Medium/5 Hard.
- All686 researched facility records retained;582 active eligible bases selectable. Future, disputed and support-only records are excluded from starts.168 construction project records retained.
- Canonical research IDs preserved;45 verified legacy base-ID aliases preserve existing saved changes. The old Pickering Seaton record lacks a civic address and is not automatically matched; its original saved delta remains intact.
- Shared engine tests exercise every selectable base at every difficulty:1,746 starts. Fire/EMS receive identical location IDs per tier. Calls reset to the selected base at zoom18 after Next Call.
- Peterborough keeps its original200-address100/50/50 catalog and existing saved-edit migration. Existing six free-driving previews remain available.

## Pass 2 — Automated regression and review

`node --test tests/*.test.cjs tests/*.test.mjs`

Result:400 passed,0 failed.

New checks are included in the Pages deployment workflow. JavaScript syntax checks and `git diff --check` passed. A separate reviewer inspected tracked/untracked implementation, data builder, store/URL readiness, request tracking, privacy and utility links. No remaining Critical, Important or Minor findings.

Review fixes were first reproduced by failing regression tests, then verified passing:

- Late analytics initialization cannot change the device-request deduplication ID.
- New Geo-only selections cannot send Dispatch Editor to a missing city package. The utility explicitly identifies Peterborough where that is the supported editor.
- A queued native dialog close event cannot erase a newly reopened request.
- A failed pending request leaves a reopened dialog able to retry.

## Pass 3 — Browser playtests

`PTBO_QA_OFFLINE_TILES=1 node tools/check-ontario-demos.cjs`

Result:30 city startups/gameplay flows passed; Fire/EMS×3 difficulties with first/last bases per service; correct guess, explicit Next Call, reveal, finish and reset verified. Five viewport sizes passed:1440×900,390×844,844×390,768×1024,320×740. No uncaught page errors or missing local assets.

Request workflow: opening/cancelling left count0; one confirmed request produced count1 for Ottawa/Route Mapping; duplicate submit prevented; local Stats displayed that exact city/mode total while secure global analytics remained locked. Keyboard open, close/focus return, unsupported-city retry and mobile wrappers were checked.

The local browser used explicitly labelled test tiles for layout: this sandbox could not load the live OSM tile service. No production provider change was made. Hosted tile rendering is verified separately after publication; local fixture screenshots are not evidence of live geographic tile availability.

## Known deployment dependency

Device request counts are working and explicitly labelled. Global administrator demand totals require an authenticated backend exposing the existing secure aggregate interface. Cloudflare is not yet configured; no insecure raw-statistics fallback or database permission change was introduced.
