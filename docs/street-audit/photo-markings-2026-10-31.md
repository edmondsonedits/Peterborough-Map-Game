# Peterborough road-marking photo comparison — 2026-10-31

Reviewed by a research agent, implementation agent, and the primary agent. Public source photographs were viewed directly and compared with normal phone chase-camera game captures. Reference images remain local QA artifacts; they are not bundled into the game.

## Sources and observations

[Peterborough Bicycle Advisory Committee, published September 2020](https://p-bac.org/cycling-infrastructure-and-peterborough/) supplies labelled photographs of Water, Parkhill, George and Sherbrooke. Capture dates are unknown. Water shows white parallel buffer stripes and diagonal hatching in a residential setting; the exact block is unresolved, so it cannot justify adding a buffer beside Showplace. Parkhill shows white solid cycle-lane borders, white broken same-direction lane divisions and yellow opposing-traffic division. George shows white bicycle symbols and a striped buffer alongside temporary planters/bollards; the article describes a demonstration segment between London and McDonnel, not a current city-wide treatment. Sherbrooke shows a separated track, with white bicycle/diamond markings; it is not the Station 1 block used by the gameplay screenshot. None of these photos authorizes a whole-street override.

The Hunter Street East / Ashburnham Bridge game view was inspected for continuity and colour roles. Available heritage photos do not resolve road-deck paint, so its exact real-world pattern remains unconfirmed.

[Ontario Traffic Manual Book 11, Ministry of Transportation, March 2000](https://ontario-traffic-council.s3.amazonaws.com/uploads/2023/01/OTM-Book-11-Pavement-Hazard-and-Delineation-Markings.pdf.pdf), sections on directional and lane lines, provides the dimensional baseline. It supports shorter urban dashes and narrower normal longitudinal stripes than the previous artistic defaults. This is a rendering convention, not photographic proof of each street. [MTO's pavement-marking handbook](https://www.ontario.ca/document/official-mto-drivers-handbook/pavement-markings) confirms the colour distinction: yellow for opposing flow, white for same-direction separation.

## Corrections

- Replace 4.2 m / 6.3 m urban dash/gap defaults with 3 m / 6 m; eligible faster arterial white lane divisions use 3 m / 9 m; broken yellow directional dividers retain 3 m / 6 m. Preserve closed-loop phase fitting and junction cuts.
- Reduce normal vehicle-lane and conventional cycle-lane stripes from 0.15 m to 0.10 m. Retain the existing wider 0.15 m freeway/trunk edge treatment.
- Include the dash regime in chain compatibility so a speed-class change cannot silently inherit its neighbour's pattern.
- Preserve existing correct white/yellow material roles, explicit solid/double/broken classifications, reviewed Sherbrooke interpretation, and geographic road/contact meshes. The photo review did not establish a safe basis for repainting arbitrary blocks or inventing buffers, turn pockets or stop bars.

The rebuilt pack must pass source/tile hashes and the whole-map visible-pavement test. Before/after phone captures use the same world poses, normal chase camera, visible HUD and touch controls. These are browser phone emulation, not physical-phone FPS or thermal measurements. Evidence is under artifacts/photo-road-markings (excluded from publication).

## Accepted build and visual checks

Release 1.6.161, pack `12cf5ae1355f3c7c442f`: 669 tiles, 4,348,188 total triangles, 74,659,526 compressed bytes. All 47 staged source fingerprints pass. Whole-map visible-paint check: 1,206,368 non-tiny triangles, zero missing/below/above-surface failures (12,663 tiny triangles recorded separately). All 669 contact hashes and 2,579,249 road-contact triangles match the prior pack exactly. Full suite: 1,252 passed, zero failures/skips.

The matched before/after phone run passes every assertion. Balanced covers Water/Showplace, Charlotte bend, George junction, Hunter bridge deck and reviewed Sherbrooke; Low/High cover Water. Primary-agent visual inspection of all seven after captures accepts the narrower lines as readable and the shorter dashes as better proportioned. Touch controls move and turn the truck; no first-party, page or tile failures. Software-rendered browser emulation does not establish physical-phone frame rate. Public photo files are excluded from Git and the hosted game.
