# Driving Camera v1.4.19 browser test report

Tested 2026-07-20 with the real `response-simulator/camera-game-test/` page in the Codex in-app browser. The test page loaded the real desktop/mobile simulator wrappers, the real Leaflet map, the production truck marker, the production road-boundary network, and the production touch controls.

## Acceptance summary

| Check | Result |
| --- | --- |
| Fixed Map settles at exactly 0 degrees | Pass |
| Driving View follows the smoothed visual truck heading | Pass |
| Switching modes preserves exact truck latitude/longitude | Pass |
| Truck remains visually anchored to the same screen point | Pass |
| Road centre point remains under the truck while stationary | Pass |
| Gas, Reverse, thumbstick steering, stations, siren, recenter, options, speed settings, Start Call, Reveal Route, and Compare Route | Pass |
| Road boundaries and 60% lane-centering assist | Pass |
| Loading and ready states | Pass |
| Clean fresh-session console | Pass: 0 errors, 0 warnings |
| Camera labels | Pass: `Fixed Map`, `Driving View` only |

## Viewport matrix

| Viewport | Driving anchor error | Fixed anchor error | Maximum normal-frame error | Stationary road-screen error | Coordinate drift on switch |
| --- | ---: | ---: | ---: | ---: | ---: |
| 360 x 800 | 0.0000107 px | 0.0000062 px | 0.0000209 px | 0 px | 0 degrees |
| 412 x 915 | 0.0000107 px | 0.0000084 px | 0.0000431 px | 0 px | 0 degrees |
| 708 x 1536 | 0.0000256 px | 0.0000414 px | 0.0000611 px | 0 px | 0 degrees |
| 1366 x 768 | 0.0000191 px | 0.0000182 px | 0.0000384 px | 0 px | 0 degrees |

The largest measured normal-frame truck anchor error across the viewport matrix was **0.0000611 CSS pixels**. This is far below one device pixel and is consistent with floating-point transform rounding. The nearest-road test at Station 1 resolved to Sherbrooke Street at approximately `1.36e-10` metres from the truck coordinate.

## Sustained controls and motion

- Held the real Gas control for approximately 16 seconds at speed settings 1, 25, and 50.
- Exercised gradual left/right steering, a controlled approximately 105-degree turn, a 180-degree sharp turn, a 359-to-0 wrap crossing, and Reverse.
- Ran 20 camera-mode switches while the truck was moving, alternating real thumbstick steering and Gas pointer input. Coordinate movement continued normally, the final anchor error was approximately `0.0000057` px, and only one visible truck marker and one camera world remained.
- The shortest-angle interpolation self-test passed for `359 -> 1`, `1 -> 359`, and the exact 180-degree case.
- Releasing the thumbstick held the current heading for more than two seconds with 0-degree drift.
- Road boundaries remained enabled with the production collision network active (14,436 to 16,455 segments observed across loads) and lane-centering assist at 60%.

## Gameplay regressions

- Station 1, Station 2, Station 3, and return-to-Station-1 spawns stayed on-road with no camera-anchor drift.
- Emergency lights toggled both the checkbox state and truck marker class.
- Recenter restored camera following.
- Speed settings 1, 25, and 50 were set through the real Options menu; the speedometer reacted during motion.
- Start Call created the active dispatch HUD. Reveal Route produced the suggested route. The test-only completion helper (`?automation=1`) advanced the real incident state so Compare Route could be exercised; the comparison UI rendered player and suggested route statistics.
- A fresh 412 x 915 load reached the ready state with no new JavaScript errors or warnings and no automation-only control on the normal test URL.

## Coordinates and invariants

Station 1 test coordinate: `44.30069911219256, -78.32219225555951`.

For every settled stationary switch, the pre-switch and post-switch latitude/longitude values were exactly equal. Fixed Map settled to an exact `0` bearing. Driving View settled to the same value as the smoothed visual vehicle heading. The truck marker stayed visible at opacity 1 and was not duplicated.

## Artifacts

- `baseline-driving-360x800.png` and `baseline-fixed-360x800.png`: v1.4.18 baseline.
- `v1.4.19-driving-360x800.png` and `v1.4.19-fixed-360x800.png`: corrected mobile modes.
- `v1.4.19-fixed-1366x768.png`: corrected desktop Fixed Map.

## Limitations

The moving-road distance can legitimately vary within the road polygon as the collision and lane-assist systems negotiate bends and intersections. The camera invariant is therefore tested independently: the same geographic road point and truck point receive the same camera matrix, while the exact centreline-under-truck assertion is measured at stationary station spawns. No production simulator workflow or camera UI is changed by this test-only module.
