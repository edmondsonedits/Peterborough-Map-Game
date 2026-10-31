# Richmond Hill dispatch parity

Goal: run Richmond Hill through the existing Peterborough Fire/EMS simulator, retaining the five-call demo and all other cities.

- [x] Compare package capabilities, road and call loading, station selection, dispatch phases and routing.
- [x] Enable real Richmond Hill roads, shared routing, six fire stations and two EMS bases.
- [x] Configure five existing sourced addresses, completed-call progress and replay; use the shared EMS pickup/transport/handover workflow with a modeled Trench Street hospital approach.
- [x] Verify browser startup, Fire/EMS dispatch, map/tablet failure behavior, real-data reachability, and regression tests.
- [ ] Review the integrated patch, increment the release by 0.0.1, publish and verify deployment.

No separate city simulator or new external dependency. Hospital identity/address verified with Mackenzie Health; the approach checkpoint is modeled on packaged Trench Street geometry, not a surveyed ambulance entrance.

Validation: full Node regression suite 1,135 passed, 0 failed; local browser confirmed Fire and EMS dispatch, road-aligned spawns, protected roads and the local tablet map. Independent review calculated 40 base-to-demo and five hospital routes. Five-completion/replay and EMS handover tested through the shared mission code.

Review corrections: preserve fifth-call comparison and completed-demo actions after base/service changes; use the same modeled hospital approach before and after optional editor initialization; version demo roster requests to refresh published spawn data.
