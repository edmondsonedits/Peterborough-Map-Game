# Water Street directory-marker and enclosed-bay review

Reviewed 2026-11-10 against the actual v1.6.204 Balanced cab capture, the owner’s R231/R233 route photographs and current source profiles. This is a diagnosis and proposed correction, not driver-seat approval of a later build.

## Exact source and identity

| Source | Verified directory identity | Exact east-facing Water Street edge, south to north |
|---|---|---|
| `way/1006243558` | `osm:node/7854664939`, Amandala’s, 375 Water Street | `(44.3051683,-78.3190059)` → `(44.3052438,-78.3190090)` |
| `way/1006243559` | `osm:node/7854664940`, Faculty Bar & Small Plates, 379 Water Street | `(44.3052438,-78.3190090)` → `(44.3053222,-78.3190123)` |

The actual obscured Amandala’s plaque is visible in `qa-captures/f7d9610/evidence/current/balanced/water-hunter/water-r231-1006243558-cab.png`: only its left part, beginning “Am…”, remains in front of the lower-left bay cheek. The neighboring Faculty panel’s right edge intersects the second building’s bay.

[Amandala’s own website](https://www.amandalas.ca/) and the [Downtown Business Improvement Area listing](https://theboro.ca/directory/amandalas/) both give 375 Water Street. The official site’s [exterior photograph](https://images.squarespace-cdn.com/content/v1/53bd5d71e4b03588e893558e/1635813218248-WWYSJ4TJXASTDB6QQKWX/amnadalas%2Bno%2Bsign.png) matches the red central door and paired cream sash fronts. It shows a broad dark fabric awning with white script below the upper bay. The photograph’s capture date is not established. R231/R233 show that awning absent or retracted, and do not support a small blue upper-wall sign. The website photograph is identity/location corroboration; it is not authority to add the awning to the October route state.

The Faculty identity/address remains backed by the existing reviewed row and [kawarthaNOW’s venue listing](https://kawarthanow.com/venue/5829/faculty-bar-small-plates/). A [2025 event posted by Faculty Bar itself](https://www.eventbrite.com/e/single-mothers-pkew-pkew-pkew-heartless-romantics-live-at-faculty-bar-tickets-1329183516679) also identifies 379 Water Street. The attempted current official `facultyptbo.com` page was not accessible, and `bar379.ca` returned no readable content. No newly verified physical Faculty sign design is claimed.

## Reproduced cause

The directory builder recorded an inferred opening top from the former glazed-floor profiles. The reviewed route profiles now replace those ground bands with explicit windows, but the runtime takes the maximum of the old directory opening estimate and the new one. It then places the blue educational plaque above that stale minimum. The sign planner validates the source wall and roof, but does not consider a reviewed projecting bay in front of that wall.

| Source | Directory plate, metres above base | Plate width / outward offset | Lower bay, metres above base / depth |
|---|---|---|---|
| `1006243558` | 3.1707–3.7107 | 2.20 m / 0.34 m | 3.15–5.70 / 0.55 m |
| `1006243559` | 3.2687–3.8087 | 3.67 m / 0.34 m | 3.25–5.80 / 0.55 m |

The plate fractions remain the catalogue’s `.7153062699509829` and `.5075001825112289`. Both bays are at `.78` with 2.25 m total width and a `.58` front-width fraction. The first plate is largely behind the lower bay waist and glass; the second plate’s northern end passes behind the southern angled cheek.

A read-only Node analysis rendered the production facade helper against the exact source OSM polygons and cast 21×11 outward-normal sample rays toward each planned directory plate. The bay intercepted 143/231 Amandala’s samples (104 wall, 15 trim, 24 glass) and 22/231 Faculty samples (16 wall, 4 trim, 2 glass). These are geometric samples, not a pixel-area or cab-visibility measurement. The script is `/tmp/analyse-water-sign.mjs` and its northern variant; it does not alter source files.

## Bounded proposal

1. Extract the existing bay normalization into a pure shared plan used by both the enclosure renderer and directory-sign constraints. Retain the current clamped dimensions, three-face outline and explicitly joined spandrel bounds.
2. Reject a directory plane that intersects or embeds behind those occupied facade spans. Do not increase its projection beyond the bay or move it to another source wall. Keep an explicit rejection reason and source/bay identity in diagnostics.
3. If retaining the verified names as educational markers, allow only source- and directory-ID-specific reviewed bands below the bays. Proposed bands: 3558 `2.55–2.95 m`; 3559 `2.60–3.00 m`, with a maximum 0.35 m panel height, unchanged horizontal fraction, width, wall and identity. Existing authored ground windows top out at 2.45 m and 2.55 m respectively. These bands lie on the photographed dark storefront frieze, clear the ground windows and remain below the bay bottoms. Their position and standard blue style are explicitly estimated training markers, not reconstructed October signage.
4. Apply the band only to a candidate that actually conflicts and only when its exact catalogue ID/name match. Without that explicit source review, reject the sign and retain its directory identity for later review.

Proposed files are `recorded-enclosed-bays.js`, a pure `business-sign-obstructions.js`, the corresponding renderer call in `business-signs.js`, the two reviewed Water profile records and focused tests. No app, road, source mass, bay dimension or collision change is needed.

## Required checks before approval

- A failing test must reproduce both existing plate/bay conflicts with production source geometry.
- Renderer and obstruction plan must use the same normalized bay dimensions, including malformed/clamped inputs and joined tiers.
- The reviewed marker fallback must fit its explicit band, source wall and opening clearance, and must not intersect any projected bay face.
- An unknown ID, different business name, unrecorded secondary wall, missing band, excessive shift or invalid band must never gain a relocated marker.
- Full and Lite must preserve the same placement decision; output positions must be finite and bounded.
- Preserve actual-rendered-sign deduplication; no new duplicate name or directory promotion.
- Recapture both 3558 and 3559 from the same cab, eye and oblique poses, compare the unchanged bay silhouette and confirm visible, correctly attributed markers. Tests alone cannot approve this appearance.

## Implemented candidate for v1.6.207

The approved proposal is implemented. `planRecordedEnclosedBays` supplies the renderer and the directory constraint with the same bounded three-face outlines and joined-tier intervals. `business-sign-obstructions.js` clips each occupied span at the actual label plane depth and rejects conflicting candidates by default. Only the two exact reviewed row/name pairs can recover into their explicitly authored marker bands, and only after a real collision is detected. Clear original candidates and unrelated walls remain unchanged.

The emitted directory sample includes `placementEvidence.kind: estimated-educational-marker`, `observedSign: false`, the reviewed directory ID, R231/R233 evidence IDs, the original and revised vertical bounds, and the standard blue marker style. The two existing names are retained once each; no new tenant or awning is introduced.

Before implementation, the new regression failed with 35/55 sampled rays blocked on Amandala’s and allowed an unreviewed conflicting name through. The implemented candidate passes the actual two-facade ray checks in both full and Lite modes, unknown name/ID rejection, invalid/missing/occupied band rejection, unrelated-wall preservation and shared clamped/spandrel-plan checks. The focused obstruction, enclosed-bay and applied-lettering guard run passed 17/17. New driver-seat pixels and independent visual acceptance remain required before release approval.
