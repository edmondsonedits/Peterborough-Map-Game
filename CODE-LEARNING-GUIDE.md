# Peterborough Emergency Games — v1.5.3 Code Learning Guide

Version **1.5.3** is the code-learning edition of v1.5.2. The gameplay systems remain the same; the release adds plain-language source comments, navigation headings, player-facing explanations, dependency warnings, and safe-editing notes.

## What “hidden text” means

The explanations use source-code comments such as:

```js
/* This explains what the code is doing. */
```

Browsers ignore comments. They are visible to someone reading the files on GitHub or in an editor, but they are not displayed inside the game and do not directly affect gameplay or performance.

## Project map

- `index.html` — main game launcher.
- `response-simulator/` — dispatch selection, truck movement, steering, road boundaries, camera, arrival detection, and route review.
- `response-simulator/mobile/` — touch controls and the mobile wrapper around the same simulator.
- `geo-guesser/` — dispatch-location guessing, scoring, distance display, and round flow.
- `city-explorer/` — unscored map exploration for learning Peterborough.
- `dispatch-editor/` — adding, correcting, confirming, filtering, and exporting dispatch locations.
- `shared/` — release information, station coordinates, dispatch data, and shared data-loading logic.
- `tools/geospatial/` — developer tools that prepare or validate road/map data; these do not run during normal gameplay.

## How to read the comments

The source uses several recurring headings:

- **PURPOSE** — the system’s overall job.
- **WHAT THE PLAYER EXPERIENCES** — what the code causes on screen or in the controls.
- **WHAT THE CODE DOES** — the technical steps in plain language.
- **WHY IT EXISTS** — the problem the code solves.
- **IMPORTANT SETTINGS** — values a non-coder may reasonably tune.
- **INCREASE / DECREASE** — what changing a setting does to game feel.
- **LIVE STATE** — values that change while the game runs.
- **PLAYER CONNECTION** — how a technical function affects play.
- **SAFE EDITING / EDITING NOTE** — related systems and tests to check after a change.

## Recommended reading order

1. Start with `response-simulator/code-learning-comments-1.5.3.js` for the complete simulator map.
2. Read `response-simulator/mobile/index.html` to see how touch controls communicate with the embedded game.
3. Read `response-simulator/vehicle-instruments.js` for staged module loading and fallback behaviour.
4. Read `response-simulator/simulator-readiness-1.4.5.js` for the startup order.
5. Read `response-simulator/arcade-mobile-camera-1.5.3.js` for a complete example of settings, state, helper functions, difficult logic, and player effects.
6. Read `response-simulator/settings-menu-compact-1.5.3.js` for a smaller interface example.
7. Use the comment-only maps in the other game folders before reading their larger HTML files.

## Main response-simulator flow

1. Leaflet creates the map and loads a selected tile provider.
2. The truck marker is created at a station.
3. Readiness loads and verifies steering, road boundaries, settings, and mobile camera systems.
4. Enabled incident checkboxes are collected.
5. A matching dispatch record is chosen and displayed.
6. The animation loop reads input, changes velocity and heading, and moves the truck.
7. Road logic restricts or assists movement around mapped roads.
8. Distance to the active incident is measured while responding.
9. Entering the arrival radius completes the call and stops the timer.
10. Route review can compare the driven path with a suggested path.

## Accuracy rule

A comment must describe the code that actually runs. When behaviour and a comment disagree, inspect the executable line first and correct the explanation. An inaccurate teaching comment is more harmful than no comment because it gives the reader false confidence.

## Safe versioning rule

A filename can contain an older feature-version number while the file internally supports the current production release. Some filenames are retained because other pages already reference them. The production release is identified by `shared/build-version.js` and the visible version badge.
