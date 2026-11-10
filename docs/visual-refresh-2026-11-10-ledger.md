# Visual refresh ledger — 2026-11-10

Plan: docs/superpowers/plans/2026-11-10-visual-refresh.md
Work branch: codex/visual-refresh-20261110
Window: 2026-11-10 02:37–10:37 UTC (21:37–05:37 America/Toronto)
Status: initial pass active; research/QA agents working; no visual code accepted yet.

## Baseline

- Production v1.6.201; dedicated fresh clone, clean before work.
- Existing ordinary buildings use four shared 256-square canvas wall textures, meter-scale UVs, deterministic tinting and spatial/material batches.
- Reviewed/user-photo facades and custom facilities have existing precedence and suppression paths; preserve these.
- Original user footage on H:/ChatGPT is absent here. Packaged user crops under city-explorer/assets/sherbrooke-frontages and recording-frontages are available for inspection.
- Initial broad Node invocation finds missing fresh-checkout packages; targeted facade baseline passed 52 tests in the audit agent.
- Local Chromium Playwright startup currently fails due to sandbox socket/ProcessSingleton restrictions. QA agent is checking the available browser and CI fallback. Do not claim visual approval until images are captured.
- CLI GitHub push has no credentials; authenticated GitHub connector has push/admin permissions and is the supported checkpoint route.

## Initial priorities

1. Shared CC0 brick/render surfaces and respect for known building material tags without altering roof decisions.
2. Source-supported appearance corrections using accessible owner photos.
3. Better street-facing storefront glazing through the existing bounded facade system.

## Decisions

- Continue autonomously under Danny's explicit instruction; routine design/reversible edits do not need repeated confirmation.
- Maintain original source image files; use the existing canvas/material mechanism to bound GPU map resolution.
- Full validation and independent review precede quality approval; passing unit tests alone is insufficient for a visual upgrade.

