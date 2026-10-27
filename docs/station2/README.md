# Peterborough Fire Station 2

This local game feature recreates the current Station 2 at 100 Marina Boulevard as an editable Blender asset and a playable Three.js station. Select Station 2, enter the truck inside the bay, drive through the open middle bay, and reach Marina Boulevard.

## Play

Start `node tools/serve-preview.cjs 4182` from the game checkout and open `/city-explorer/?station=2&lite=1`. The normal start is beside the truck; press **E** to enter or exit when stopped. **W/S** accelerate, brake and reverse; **A/D** steer. The **Start in truck** button resets to the parked truck. `&spawn=truck` starts directly in it. The start control also supports pointer/touch input.

The user simplified the scope to visual appearance: the middle front door remains folded open, the two outer front doors display their red glazed leaves, and the rear doors stay closed. There are no bay-door controls. Walls, jambs and static door leaves still provide collision. Station-local collision is enabled only after the model passes its loading contract. A failed model retains the existing map and moves the spawn to the Marina approach with an unavailable message.

## Source fidelity

The [research record](research-and-design.md) distinguishes verified features from estimates. The City's 2022 design presentation supplies the early site arrangement, and completed contractor photographs control the facade, grey masonry, red glazed doors, timber and clerestory appearance. The door installer identifies three four-fold FF-300 doors and two sectional C-175 doors, all nominally 14 by 14 feet (4.2672 m).

No complete dimensioned as-built or room-layout set was publicly retrieved. The footprint, ancillary-wing geometry, rear-door locations, slab levels and service enclosure are estimates. The ancillary wing is an exterior mass, not an invented full interior. This is a recognizable game reconstruction and working apparatus bay, not a surveyed architectural twin. Reference photographs are research-only; the shipped texture images are original procedural work.

## Assets and reproduction

- `city-explorer/assets/station2/layout.json`: one metre-scale transform/dimension contract for the asset, spawn, doors and collisions.
- `tools/blender/build_station2.py`: deterministic Blender build, editable source save, GLB export, re-import verification and review renders.
- `city-explorer/assets/station2/station2.glb`: game asset with independent moving door nodes and embedded materials.
- `city-explorer/assets/station2/asset-report.json`: export measurements and verification.
- Native `.blend`, reference media and render files are in the accompanying `../model` and `../research` folders outside the game checkout.

Run Blender in background with `--python tools/blender/build_station2.py`. The script resolves the game and project roots from its own location. See [asset-worker-report.md](asset-worker-report.md) for the final optimization procedure. The glTF axes are Y up, facade toward -Z and bay depth +Z; Blender source converts axes at export.

The measured existing pumper is 3.18 m across mirrors, 3.22 m high and 10.415 m long. Gameplay conservatively uses a 3.2 by 10.5 m collision envelope. Nominal door openings are unchanged.

## Verification

Final browser and automated results are recorded below after the completed checks. The local preview is separate from the public deployed game. Desktop browser emulation is not physical-phone performance evidence.

Final acceptance on 27 October 2026:

- Blender generation and GLB reimport: 12 independent front pivots, 14 rear panels, 45 opening samples with zero static blockers; optimized GLB 1,158,344 bytes, Khronos validator zero errors/warnings. Final SHA-256: 4e24998d5359b632fe27a278cc8dc4fe0b55ed8334c65f06376452d43e358901.
- Desktop browser: final static center opening, readable frontage and bay, obsolete arena absent even when the editor document loads late, Start in truck, E entry/exit, and keyboard driving across the apron to Marina approach. No uncaught JavaScript errors.
- Touch browser emulation at 390×844: the mobile start button is visible, within the viewport, and starts driving. No physical-device claim.
- Final floor clearance: the slab samples the bay ground and sits above its highest sampled point, with a bounded foundation and blended apron. A fresh lite-mode browser drive after this adjustment passed without JavaScript errors; the observed slab datum was 8.6884 game metres (not a surveyed elevation).
- Intentional GLB 404: safe approach spawn, generic city retained, new station collision disabled, no uncaught JavaScript errors.
- Stations 1 and 3: browser entry and forward-driving checks passed.
- `node --test tests/station-two.test.mjs tests/station-architecture.test.mjs tests/station-reference-details.test.mjs` passed (five reported Node tests, with the Station 2 file containing additional focused assertions). Gameplay, station-pavement and station-road-detail scripts passed; JavaScript syntax and staged whitespace checks passed.
- Evidence is retained in the accompanying `../qa` directory, including `visual-result.json`, `fallback-result.json`, `other-stations-result.json`, source/model validation reports and screenshots.

The surrounding city remains the existing GIS scenery. Unverified room arrangements and exact as-built dimensions remain unresolved. This feature is committed locally and served by the local preview, not uploaded or published.
