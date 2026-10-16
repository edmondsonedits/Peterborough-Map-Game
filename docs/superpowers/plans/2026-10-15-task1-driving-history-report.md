# Task 1: directed guidance and persistent history

Implemented locally on `codex/complete-quality-review`; no commit, push, data change or publication.

Changed `response-simulator/route-reveal.js`, `response-simulator/training-history-1.6.45.js`, `tests/driving-route-guidance.test.cjs`, `tests/ems.test.cjs`, and `tests/training-history.test.cjs`.

The guidance graph now indexes road segments. Each operational endpoint projects to its single nearest road section within the existing access radius, then uses legal directed partial edges and ordinary graph paths. Exact graph junctions retain access to their connected roads. The calculator retains its result fields, road-profile objective and consumer interface. Roundabouts imply one-way unless an explicit no/false/0/-1 override applies. Site/call/base coordinates, mission workflows and authoritative data are untouched.

Tradeoff: disconnected endpoints return unavailable instead of selecting a farther nearby node with an unchecked shortcut. Off-road endpoints retain their original coordinates and the existing nearest-road access interpretation; no obstacle/parcel connectivity is invented. The endpoint connector now reaches only the nearest projected point, not arbitrary graph vertices. Long road segments work without requiring a nearby stored vertex.

History completions retain their browser-tab session grouping and add a random document identity to the deduplication key. Generations restarting on reload no longer overwrite old missions; repeat reports of the same generation/service within a document still update one row. Existing saved rows remain readable.

Red evidence: before production changes, the new routing/history batch failed eight assertions covering long same-segment access, contraflow, a connected return loop, divided/disconnected roads, nearest-segment off-road access, implied roundabouts, the real North Monaghan case, and history after reload. The remaining ten tests passed. These were behavior failures, not harness errors.

Green evidence: `node --test --test-reporter=tap tests/driving-route-guidance.test.cjs tests/ems.test.cjs tests/training-history.test.cjs tests/route-response-quality.test.cjs tests/route-tracing.test.cjs tests/route-learning.test.cjs tests/route-decisions-integration.test.cjs` passed **77/77** with no skips. Syntax checks for both changed production scripts and scoped `git diff --check` passed.

The new EMS catalog check uses existing collision/arrival resolution and all 200 canonical calls: 400 base-to-scene and 200 scene-to-hospital routes are available. Tests also cover valid bidirectional and reverse-only travel, directed loops, exact junctions, forward/partial same-segment routes, explicit roundabout overrides, and legacy history rows. Browser acceptance and the complete suite remain lead-owned integration checks.
