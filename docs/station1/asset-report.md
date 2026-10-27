# Station 1 Blender asset report

## Source basis and limits

The model follows the shared `city-explorer/assets/station1/layout.json` contract and the inspected owner frames `owner-0158_LEFT_SIDE.jpg`, `owner-0149_LEFT_SIDE.jpg`, and `owner-0170_LEFT_SIDE.jpg`. The front frame controls the five-door count and the dark piers, red doors, shallow canopies, bollards, polygonal watchroom, and raised rear roof. The City 2018 interior image controls the bay wall bands, trusses, door tracks, ducts, and yellow extraction hoses. The gear rack is a restrained representation of the documented storage type.

Door and height dimensions are photo-scaled estimates over the GIS footprint, not a field survey. Ancillary room adjacency remains unresolved; no full room plan was invented. The GLB uses an original procedural brick tile; no reference-photo pixels are shipped.

## Model and runtime contract

- Five red sectional doors, each 4.1 m wide by 4.5 m high, with eight independent panels and a four-lite horizontal window row at approximately 1.4 m above the slab.
- Stable nodes `Door_F{1..5}_Panel{0..7}` have identity rotation and the shared panel-centre transforms. The native export/reimport audit checked all 40 nodes.
- `Station1_TrainingTower` remains a separate parent for runtime terrain adjustment.
- The detached tower shaft, cap, and training apertures share the narrow shaft centerline; the adjacent low practice wing has a sloped roof with triangular end infill.
- Five stowed exhaust assemblies use flexible yellow hoses with 75 mm body radius, 48 mm rib pitch, and shallow 7 mm corrugations. The Catmull paths are sampled every 8 mm; steel branch elbows, compact couplings, and ceiling balancer lines connect them overhead. Their lowest point is above 3.7 m and their offside placement clears the 3.2 m truck envelope.
- The apparatus bay includes a concrete slab, mint/teal/cream walls, pale roof undersides, roof-zone-specific white joists/trusses, door tracks, split-height exhaust ducts, and limited gear storage.
- Static geometry is batched by material. The GLB is 1,701,316 bytes (under the 2 MB target), with 157 meshes/primitives, 51,470 triangles, 20 materials, and one embedded original texture.

## Outputs

- Builder: `tools/blender/build_station1.py`
- Editable scene and review images: `H:/ChatGPT/Peterborough-Station1-20261027/model/station1.blend`, `station1-exterior.png`, `station1-tower-exterior.png`, `station1-bay-interior.png`, `station1-exhaust-detail.png`, and `station1-overhead.png`
- Runtime asset: `city-explorer/assets/station1/station1.glb`
- Original texture source: `city-explorer/assets/station1/textures/station1-warm-brick-1m.png`
- Machine-readable counts and transforms: `city-explorer/assets/station1/asset-report.json`; full validator output: `H:/ChatGPT/Peterborough-Station1-20261027/qa/second-bay-hoses/gltf-validation.json`

## Verification

The Blender build exported and reimported the GLB, then checked the 40 named panel nodes, translations, identity rotations, required root/static/tower nodes, mesh counts, triangles, and bounds. The reimport QA scene is cleared before import so its counts and review renders contain one model.

The Blender export/reimport audit confirms the 40 door pivots, required root/static/tower nodes, and one-scene mesh counts. `gltf-validator` reports **0 errors, 0 warnings, and 151 informational unused-UV messages** for untextured meshes. The brick texture remains embedded and used by the brick material.

Reimported Blender-space bounds are X `[-42.925, 11.990]`, Y `[-36.710, 5.420]`, and Z `[-0.240, 12.850]` metres. Z is vertical in the Blender reimport; the GLB itself is Y-up.

## SHA-256

- `station1.glb`: `9DC08C10FF550AF48C25DC1634DC42E9BDCD3B1650750F3AAF5AA39EEC6D8DD7`
- `station1-warm-brick-1m.png`: `32DE2BF4AE7DCB8DE33B2E93EE15CE9736C345C6F230EC7A0B82B1D9B28FDFCE`
- `station1.blend`: `E8EC7F39140961D3848F67DC4F2E19755299C22A5BFFD6055C1DBFBBE5CEAD3F`
- `build_station1.py`: `9ACA1DD4DCD79ECABB03AB3C11B2559C0EB2538CB8E33C715D8E086B32AD076C`
