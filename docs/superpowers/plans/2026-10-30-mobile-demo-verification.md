# Local verification - v1.6.155

Baseline: origin/main 5ca6df0. Isolated checkout: H:/ChatGPT/Peterborough-Mobile-Demo-Fixes-20261030. No deployment performed.

154 focused tests pass across camera follow, held joystick mapping, pointer ownership, gears, zoom, homepage requests, all 33 city simulator rosters, Ontario source data, release integrity and desktop steering. Syntax checks and git diff --check pass.

Tests use real Leaflet in jsdom for camera lifecycle and packaged canonical city rosters. They do not establish rendered appearance, mobile browser performance or physical-phone behavior.

26 formerly inaccessible city demos now have package entrypoints. Their demos retain base-training capabilities; the six existing response-demo cities retain scene exercises, and Peterborough retains full dispatch. Request Full Version uses the existing private feedback workflow; no real messages were sent.

Camera requests use the canonical release token instead of fixed v1.5.10. Source shell tokens are 1.6.155, and the changed feedback request module has a fresh import token. Focused review found no remaining concrete correctness issue.

## Publication verification

Release workflow test groups: 1,022 checks passed before publication; subsequent exact request-message coverage also passed. Actual Edge desktop and phone-sized browser checks exercised both menu choices, touch steering in both camera modes, map dragging, the visible teaching bubble, and Recenter. No page errors were reported. Recenter centre error was 0.03 m. Screenshots and detailed JSON are retained locally under artifacts/release-qa (excluded from publishing). These are browser emulation checks, not physical-phone evidence.

The 3D entry now opens Play in Peterborough and Request Your City demo. Play targets Peterborough regardless of the selected request city; requests retain the selected city. The 3D runtime reached gameplayReady through that exact action. Deployment commit and fresh live-file comparison are recorded separately after publication.
