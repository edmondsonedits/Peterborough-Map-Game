# Citywide building refinements implementation plan

> For agentic workers: use subagent-driven-development; one focused Luna worker owns visuals, parent owns review and release.

**Goal:** Complete the six follow-up items authorized by the user: complex roofs, commercial details, residential details, low-profile facade density, canopy passage, and device performance verification.
**Architecture:** Extend existing deterministic shared facade and roof batches. Preserve source footprints, explicit building tags, researched replacements, station behavior, roads and editor ranges. Reuse materials and bound detail by building and rendering distance.
**Tech Stack:** Three.js, shared JS geometry modules, Node tests, Playwright.
**Spec:** User explicitly authorizes sensible architectural estimates and all listed refinements, with efficient agents and continuing publication authorization.

- [x] Worker: inventory217 remaining roof cases, improve valid roof geometry including courtyards and explicit shapes; report any invalid source cases individually.
- [x] Worker: add bounded storefront, loading-bay, roof-equipment and trim details; residential porch/step/chimney and safe yard details; dense shared low-profile facade treatment.
- [x] Parent: verify canopy passage against actual runtime collision paths. Baseline truck cleared a representative39.6m canopy with55.95m travel and zeroerrors. Inspection shows ordinary buildings have no footprint collider; previous blanket-collision limitation was overstated. Preserve existing station collisions.
- [x] Parent: inspect screenshots, measure total geometry/material cost (target <=15% extra vs v167), check loading, gameplay and mobile-emulated performance. Physical-phone validation deferred by the user: no phone available; finish other work. Desktop narrow-viewport checks passed and are not phone proof.
- [x] Review concrete defects and correct them, run targeted regression checks, and compile matching release assets.

Publication is authorized. Record deployment and live verification evidence after the commit reaches GitHub Pages.
