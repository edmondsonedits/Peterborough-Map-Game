# Scene-response browser QA

Run from the repository root with Node.js, Python 3, Playwright, and a Playwright Chromium browser available:

```sh
node tests/scene-response-browser.cjs
```

If Playwright is installed outside the repository, set `NODE_PATH` to its module directory. Set `PTBO_CHROMIUM_EXECUTABLE` to use a specific Chromium binary; otherwise Playwright uses its default. The script starts and stops a local HTTP server and writes `report.json`, server logs, and representative screenshots under `test-artifacts/scene-response-browser/`. Set `PTBO_QA_OUTPUT` to change that directory. The process exits nonzero if any case fails.

To run a narrow smoke test:

```sh
PTBO_QA_CITIES=belleville PTBO_QA_SERVICES=fire PTBO_QA_MODES=missions node tests/scene-response-browser.cjs
```

`PTBO_QA_CITIES` accepts the six scene-response city IDs; `PTBO_QA_SERVICES` accepts `fire,ems`; `PTBO_QA_MODES` accepts `missions,bases,mobile,island,crossmode,legacy,support`. Omit them to run the full matrix. Cases run sequentially to avoid retaining multiple large road surfaces.

The mission checks use native keyboard or emulated touch input to move from the selected base, then inject the vehicle position at the scene to test arrival, exactly-once history, no EMS transport, and Next Call. They do not prove a complete driven route. Base checks cover the current canonical roster and collision-surface access. The Island check first dispatches the published 355 Lakeshore Avenue exercise, then temporarily suppresses civic calls in memory to exercise the published intersection fallback; it does not change source data. Cross-mode and legacy checks use isolated browser storage. External requests, including telemetry and map tiles, are blocked, so screenshots do not verify a live basemap or real-world access.
