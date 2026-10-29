# Richmond Hill Dispatch demo

The user requested Close, Demo and Request full version in the unavailable Dispatch popup, starting with Richmond Hill. Demo means five completed calls using the existing Peterborough-style Fire/EMS simulator and the selected city's mapped, drivable streets.

## Approach

Use a native Richmond Hill city package and the shared simulator. The existing preview factory disables route guidance and hospital transport, so extending its scene-only behavior would not match this request. A separate simulator would duplicate working controls and is unnecessary.

## Behaviour

- Richmond Hill's Dispatch card opens a compact, accessible popup with Close, Demo and Request full version. Other cities retain their existing capability gates.
- Demo opens the existing device-appropriate simulator with Richmond Hill selected. All Richmond Hill Dispatch entry routes enforce the five-call session limit from city configuration; a query string cannot enable another city's unavailable mode.
- All six Fire halls and two EMS bases have five distinct, sourced local call choices. Existing shared Geo/Route catalogue records remain unchanged. Use normal route guidance, controls, collision, service and base selection.
- Count completed assignments, not button clicks or calls started. EMS completes after its hospital handover. Changing bases/services or cancelling a call preserves completed progress; repeated completion events count once. Reload/replay starts a fresh demo, not an entitlement mechanism.
- After five completions, show Replay demo, Return to cities and Request full version. Do not silently dispatch a sixth call.
- Full-version requests use the existing private Feedback inbox with explicit full-version wording and a separate deduplication identity from demo requests. Only an explicit request-button click sends a message. The finish screen opens the selected city's request popup without sending automatically.
- Mackenzie Richmond Hill Hospital's public Trench Street approach is a modeled training checkpoint, not a claimed ambulance-bay survey. Verify selected calls and hospital paths against the shipped road graph.

## Verification and scope

Test session lifecycle, selected-city routing, Feedback acknowledgements/retries/account changes, all selected routes, and Fire/EMS desktop/mobile browser flows. Capture popup, in-game and completion screenshots. Preserve Peterborough and existing six-city behavior. Build a reviewable branch/PR; this feature request does not itself request a new production deployment.
