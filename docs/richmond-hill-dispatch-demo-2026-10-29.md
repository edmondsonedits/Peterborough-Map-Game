# Richmond Hill five-call Dispatch demo

Richmond Hill's Dispatch card now opens **Close / Demo / Request full version**. Demo launches the existing native Fire/EMS simulator with local roads, bases, route guidance and hospital transport. The full mode remains unavailable in the launcher.

Each of six Fire halls and two EMS bases has five distinct sourced civic destinations (40 curated assignments). A session ends after five completed calls; EMS completion requires hospital handover. Aborts and base/service changes preserve progress. The finish screen offers replay, return to cities, or navigation to the full-version request. Requests use the existing private Feedback conversation, and navigation never sends one automatically.

Native route guidance now uses the selected city package's road asset and projection centre, including gzip decoding. This fixes a Peterborough-only road source that prevented Richmond Hill guidance. Peterborough keeps its original defaults. Existing Richmond Hill saved calls, deletions and edits retain the same data version.

The branch incorporates main through `a105632703a88917789e936b71a59654b3351224`, including the independently published 3D screen cleanup, and uses canonical build **1.6.153**. The only rebase conflict was the adjacent simulator script tags; both demo scripts were retained. Normalized cache-token changes account for the otherwise unrelated surface files.

## Validation

- The full Node suite passes: **1,005 tests**, zero failures or skips.
- City data checks prove **180 directed route legs**, including continuous Fire calls and EMS hospital/onward connections.
- **11 unique browser cases** passed across desktop/mobile, all eight bases, Fire/EMS five-call completion, cancellation, replay, selected-city isolation, request intent, rendered maps and native driving/routing.
- The actual native guidance graph resolves **60 legs**: 40 base-to-call, 10 call-to-hospital and 10 hospital-to-next-call.
- A keyboard-only trip follows the **549 m** production route from Station 8-1 to 40 Harding Boulevard West. It records **426.6 m on named streets outside the base yard**, normal arrival/completion and no added collisions. No position, heading, velocity or physics writes were used for that trip.
- Independent reviews of the implementation, popup launch-status fix and city-specific routing fix found no actionable issues.

Browser evidence was collected on build 1.6.152 before main's separate release; focused launcher/routing/cache checks were repeated after integration as 1.6.153. The full Node suite was also repeated after integration. See the [evidence and reproducer](validation/richmond-hill-demo-2026-10-29/README.md).

## Scope and limits

Other five-call lifecycle tests deliberately inject scene/hospital GPS to exercise the real transition timers; they do not prove every route was fully driven. The keyboard trip is the independent street-driving proof. The initial shorter Station 8-4 drive only covered the modeled base yard.

Base starts, call approaches and the hospital checkpoint use audited modeled public-road positions. The hospital checkpoint is not a surveyed ambulance bay. Full source notes and route distances are in [dispatch-demo-review.json](../cities/richmond-hill/dispatch-demo-review.json). Existing call catalogues and road assets were preserved.

No real Feedback messages were sent during testing. The request adapter was mocked, with external traffic blocked except allowed map-image GETs. New cities require their own native package and curated pools; this change enables Richmond Hill only. Publishing remains separate from this review branch.
