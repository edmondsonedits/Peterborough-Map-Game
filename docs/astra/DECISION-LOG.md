# Decision Log

Only durable decisions belong here.

## D001 — Geospatial truth is authoritative
Terrain, roads, hydrography, building footprints and navigation/collision semantics remain owned by GIS/open-data layers. Visual work must not silently distort them to match perspective imagery.

## D002 — Browser/Three.js remains the distribution target
The project remains a browser experience. Three.js is the primary runtime; Blender is an asset-authoring tool, not the runtime.

## D003 — Mesh city must remain complete
Authored landmarks, semantic detail and captured-detail overlays may improve fidelity, but failure/absence must reveal a usable geospatial mesh city.

## D004 — Captured-detail assets are appearance only
Spark/SPZ/RAD layers never own renderer, camera, scene, navigation, collision, roads, water or terrain. Rights/provenance approval is mandatory before a production capture becomes loadable.

## D005 — Bounded fidelity districts before city-wide polish
Improve and verify one representative district, generalize reusable rules, then expand. Station 1 is the first fidelity district.

## D006 — Fresh-context resemblance critic
The builder does not grade its own work. Real references and named renders are reviewed in a separate regular ChatGPT context using a resemblance-first P0–P3 rubric.

## D007 — Regular ChatGPT owns project-management work
Repository research, reference manifests, planning, critique synthesis and `docs/astra/` maintenance should be done in ordinary ChatGPT whenever possible to conserve Astra credits.

## D008 — Astra is execution-focused
Astra sessions should receive one compact execution packet, operate/render/measure the local project, implement the defined production objective, and return a factual session receipt rather than reconstructing project history.

## D009 — No discrepancy-hiding polish
Fog, bloom, darkness, depth of field, grading, vegetation or similar effects cannot count as fidelity improvements when they merely hide incorrect geometry/materials.

## D010 — Version discipline
Any production code change increments the project version exactly 0.0.1. Documentation-only state maintenance does not by itself create a new production version.

## D011 — Operational response geometry must remain drivable
Real-world identity/address and visual/GIS representation can be distinct from the simulator's operational arrival/access coordinate. EMS/fire yards and response targets must intersect the authoritative drivable network. Do not use a building centroid or visually convenient point as the driving target when it makes arrival impossible; use a documented road-access/operational point while preserving the real place identity.
