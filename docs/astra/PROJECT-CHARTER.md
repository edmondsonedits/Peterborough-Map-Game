# Peterborough 3D Digital-Twin Charter

## Mission
Build a browser-distributed, recognizable 3D reconstruction of Peterborough, Ontario that can support firefighter/EMS training without sacrificing geographic truth or existing gameplay.

## Authority order
1. GIS/geospatial truth owns terrain, roads, hydrography, building footprints, navigation and future collision.
2. Reviewed semantic survey data may add stable real-world detail without silently moving authoritative geometry.
3. Authored Three.js/Blender assets may improve appearance, but must remain georeferenced and replaceable.
4. Optional captured-detail/splat assets are appearance overlays only and must never own navigation or collision.

## Project invariants
- Keep the existing city as the complete fallback.
- Target normal web browsers with Three.js; do not require a native engine.
- Use Blender where authored landmark assets materially improve fidelity.
- Preserve provenance, licence and capture-date metadata for reference-derived work.
- Never derive production textures/splats from imagery without reuse rights.
- Visually inspect visual changes at named, repeatable views.
- Measure meaningful performance changes on representative desktop and low-power profiles.
- Do not break response-simulator or other existing gameplay.
- Code-changing production deliveries increment the project version exactly 0.0.1.

## Working model
- **Regular ChatGPT:** project manager, repository inspection, research, reference/provenance work, code review, planning, independent visual critique, state-document maintenance, and code changes that do not require operating a local 3D application.
- **Astra:** execution environment for tasks that materially benefit from operating/rendering the browser world, Blender, local asset tooling, or machine-local performance measurement.
- **Independent visual critic:** a fresh regular ChatGPT context receives real references plus named renders and scores resemblance rather than beauty.

## Success criteria
A production area is considered complete only when:
- its major geographic composition and silhouettes match authoritative/reviewed references;
- a local user could recognize the location without HUD labels;
- P0/P1 visual-QA findings are closed or explicitly accepted;
- reference provenance is recorded;
- the mesh-only fallback remains usable;
- performance remains within the current device budgets or a new measured baseline is accepted.

## Current production strategy
Improve Peterborough in bounded, testable districts rather than attempting a city-wide photorealistic rebuild. The first fidelity district is Peterborough Fire Station 1 and its existing 662,695 m² semantic-survey area. Reusable improvements should be generalized citywide only after the pilot is visually verified.