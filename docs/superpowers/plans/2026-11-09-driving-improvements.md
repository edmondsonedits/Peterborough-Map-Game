# City Explorer driving improvements

**Goal:** Improve multiplayer presentation, vehicle handling, driving views, older-phone rendering, map driving and one dispatch training call within the requested hour.

**Architecture:** Extend the existing Three.js runtime and shared movement code. Preserve authoritative multiplayer ownership/world data. Keep map presentation independent of the underlying driving mode. No new renderer, physics engine, hosting plan or public deployment.

**Decisions:** Reuse the current isolated multiplayer checkout. Preserve parallel route/building work in its separate checkout. Add cab/bonnet views with a lightweight windshield frame; retain existing chase views. Add explicit Lite mode, retaining full driving/collision rules. Use the existing City Hall landmark for a clearly identified simulated alarm, with arrival requiring a stopped vehicle.

**Ownership and verification:**
- [x] Network worker: bounded jitter handling, monotonic remote presentation and deterministic networking regressions.
- [x] Vehicle worker: camera geometry, vehicle handling and Lite profile; relevant unit tests.
- [x] Root: map/player/truck markers, optional map driving, dispatch lifecycle, app/HTML/mobile integration.
- [x] Root: browser desktop/touch smoke including screenshots, map driving, cab view, Lite and dispatch; related test suite and diff check.
- [x] Fresh review: integration correctness, focus loss, multiplayer mode transitions, camera visibility and Lite parity.

**Limits:** No exact subscription allowance target is enforceable. Physical older-phone performance and WAN latency require device/network evidence beyond browser emulation. Training-call lifecycle is local to each responding player; all use the same destination.
