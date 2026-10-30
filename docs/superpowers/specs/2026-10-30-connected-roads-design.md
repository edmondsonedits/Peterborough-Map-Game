# Connected Peterborough roads design

User authorization: 2026-10-30: execute the recommended selective rebuild completely and provide the finished live simulator; use judgment without another design checkpoint.

Preserve Three.js, authoritative municipal pavement XY/holes, source OSM coordinates and stable IDs, road widths, mapped lane semantics, bridges/underpasses, stations, editor bindings, and gameplay controls. Replace disconnected generated ribbon/cap construction with one connected surface. Rendered Float32 triangles own vehicle contact. Smooth shared junction approaches while preserving real hills and grade separation. All supported paint types follow final pavement and do not add collision geometry. Preserve genuinely unmarked roads and record missing location evidence rather than invent turn restrictions/markings.

Prepare geographic road tiles before deployment. Phones and desktop share the road footprint/contact surface. Runtime retains bounded neighboring road tiles, prefetches ahead, disposes evicted GPU resources and retains safe fallbacks on asset failure. Shared asphalt/paint materials and merged tile geometry keep draw calls and allocations bounded. The existing legacy path remains a diagnostic rollback.

Acceptance: synthetic geometry and grade-separation tests, real-data coverage/continuity audit, actual renderer paint/contact tests, matched full/lite overhead and truck-eye screenshots, scripted valid routes and turns, startup/frame/memory observations, regression checks, independent review, successful Pages deployment and live asset/version verification. Physical-phone measurements require device access and must not be claimed from desktop emulation. All work and evidence stored under H:/ChatGPT.
