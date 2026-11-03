# Dispatch city rollout checklist

This is the Richmond Hill/Peterborough feature set applied to all 33 registered cities in the v1.6.173 release candidate. A city receives the shared game runtime plus local data; it does not get a separate fork of the engine. Completion evidence is recorded in `all-city-dispatch-release.json` and `base-areas/`.

| # | Feature required for each city | Configuration or verification |
|---|---|---|
| 1 | Correct city identity and playable demo entry | `cities/city-registry.js`, city manifest and package agree; Play Demo works independently of account role. |
| 2 | Local map center, zoom and geographic bounds | City package/map settings; bounds also cover the configured hospital. |
| 3 | Local streets and road labels | City `roads.geojson.gz`, with source metadata in `training-data.json`. |
| 4 | Drivable road widths | Shared `road-collision-core.js` applies road-class/width allowances, including wider roads. |
| 5 | Softer intersection corners | Shared `road-intersection-softener.js` permits larger turning cuts; collision regressions cover transitions. |
| 6 | Shared collision and route data | Routing reuses the collision-validated road set; approved supplements retain their validation rules. |
| 7 | Fire and EMS base roster | Active, selection-eligible canonical facilities only; excluded/planned facilities stay excluded. |
| 8 | Correct facility identity | Address/source review plus imagery; conflicting source points are retained separately from modeled driving geometry. |
| 9 | Individually fitted base areas | Rotated rectangles cover the station building, parking and apron; `geo-data.json` stores flat runtime `drivingArea` fields. |
| 10 | Playable base spawn | Spawn lies within its fitted area, with modeled heading and drivable access. |
| 11 | Continuous station-to-street exit | Collision-model samples follow a real route beyond the yard boundary with zero blocked moves. Default fallback boxes cannot count as fits. |
| 12 | North-up primary view | Shared camera behavior begins north-up and follows the truck. |
| 13 | Joystick matches map orientation | North-up controls point geographically; in the truck-following view, up follows the truck/view direction. Shared input tests cover the transformation. |
| 14 | Recenter teaching hint | Dragging the map pauses follow and exposes the small recenter hint; recenter resumes follow. |
| 15 | Local demo call pool | Existing canonical city calls and reviewed local training assignments, with reachable pools for every offered base/service. |
| 16 | Dispatch lifecycle | Receive call, respond, arrive, complete and start the next call. |
| 17 | Fire and EMS service behavior | Service-specific vehicles/bases and scene handling share the same engine. |
| 18 | EMS hospital destination | Sourced hospital identity and coordinates; site points are not claimed as surveyed ambulance entrances. |
| 19 | Hospital transport and handover | Every offered mainland EMS assignment has a route to the configured hospital. Toronto Island EMS explicitly ends at the scene; no ferry is simulated. |
| 20 | Suggested routes and review | Response and hospital legs, route comparison and history; mobile review hides driving overlays and restores controls afterward. |
| 21 | Saved data compatibility | Canonical IDs/coordinates/statuses remain intact; historical aliases and dataset-version identities are retained; saved edits remain authoritative. |
| 22 | Desktop and mobile usability | Real short keyboard/touch movement and camera checks, plus full workflow checks using controlled arrivals for long legs. These are not physical-phone/full-drive claims. |
| 23 | Release consistency | Versioned loaders, standalone city factory fallback, package tests, complete fitted-area gate, upstream integration, CI deployment and live verification. |

The demo deliberately has a smaller call pool than a full city edition. `Request Full Version` remains separate from `Play Demo`. The 3D entry offers Peterborough play and a request for the selected city; this Dispatch rollout does not claim a full 3D city for every municipality.
