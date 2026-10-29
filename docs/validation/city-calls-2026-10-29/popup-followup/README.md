# Final diagnostic-popup correction

A final imported-text review found two Leaflet diagnostic popups that interpolated call name, subtype and civic address into HTML. The frozen expanded data contained no markup payloads in the 51,252 name/address/cross-street fields screened across 15,170 shared/route rows in the 32 expansion cities. Both popup paths now use the existing `escapeDispatchText` encoder. Their bold heading and two line breaks remain intact; no catalogue, assignment, arrival target, mission state or driving code changed.

The new `tests/dispatch-popup-browser.cjs` exercises the real Show All Dispatch Locations overlay and the native custom-add prompt/save path. Before the fix, both fixtures executed the harmless injected event counter and failed. Afterward, the test requires literal visible fields, only the intended B/BR elements, and zero event execution. A repeated run exposed a test race while Leaflet removed the closing popup; the harness now waits for detachment before opening the next popup. All assertions remain. Three consecutive final runs passed, recorded in [popup-browser.txt](popup-browser.txt).

Independent review found no issue in this bounded correction. Post-fix validation:

- [Repository tests](node-tests.txt): **977 passed, zero failed**.
- [Scene suite](scene-browser/report.json): **33/33**, including all **199 bases**, mobile, Island civic/fallback cases, saved edits and migration, and modeled support labels.
- [Peterborough transport](peterborough-transport/report.json): **2/2**, desktop and emulated mobile.
- [Input receipt](input-hashes.json): the only changed runtime input versus the previous browser receipts is `response-simulator/index.html`, from `d1c7d544a4cce2704f254bfa0c7be6b049ca75e89f7ce8fdc9329be35339eb93` to `ec41834e1037e30f975ba1fe358d52553be9b5ee825d7ab571456bf7cf216752`. The new popup test is also fingerprinted.

The scene suite's 201-file before/after manifests are byte-identical, SHA-256 `7c176bf42d41e550fa467a0e459bc467d34683a9077a89450c233099da40f6ec`. The aggregate input receipt was captured after the completed checks. Previous all-city Geo/Route results still cover the unchanged data and Route Mapping code; these follow-ups cover the changed simulator HTML. The collision core used by the two recorded native drives is unchanged.

Scene/transport arrivals still use the disclosed GPS-position fixtures. These reruns do not add fully driven journeys or live-basemap checks. Their external tiles are blocked. See the [main validation report](../../../city-call-validation-2026-10-29.md) for the distinct evidence scopes.

Reproduce from the repository root with Playwright available; set `PTBO_CHROMIUM_EXECUTABLE` if Chromium is installed separately:

```sh
node tests/dispatch-popup-browser.cjs
node --test tests/*.test.cjs tests/*.test.mjs
PTBO_QA_OUTPUT=test-artifacts/popup-followup/scene-browser node tests/scene-response-browser.cjs
PTBO_QA_CITIES=peterborough PTBO_QA_MODES=transport PTBO_EXPECTED_VERSION=1.6.151 PTBO_QA_OUTPUT=test-artifacts/popup-followup/transport node tests/city-call-expansion-browser.cjs
```
