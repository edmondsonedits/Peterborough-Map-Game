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
- Static geometry is batched by material. The GLB is 1,972,316 bytes (under the 2 MB target), with 200 meshes/primitives, 55,134 triangles, 20 materials, and one embedded original texture.

## Outputs

- Builder: `tools/blender/build_station1.py`
- Editable scene and review images: `H:/ChatGPT/Peterborough-Station1-20261027/model/station1.blend`, `station1-exterior.png`, `station1-tower-exterior.png`, `station1-bay-interior.png`, `station1-exhaust-detail.png`, and `station1-overhead.png`
- Runtime asset: `city-explorer/assets/station1/station1.glb`
- Original texture source: `city-explorer/assets/station1/textures/station1-warm-brick-1m.png`
- Machine-readable counts and transforms: `city-explorer/assets/station1/asset-report.json`; full validator output: `H:/ChatGPT/Peterborough-Facilities-20261027/qa/station1-validation.json`

## Verification

The Blender build exported and reimported the GLB, then checked the 40 named panel nodes, translations, identity rotations, required root/static/tower nodes, mesh counts, triangles, and bounds. The reimport QA scene is cleared before import so its counts and review renders contain one model.

The Blender export/reimport audit confirms the 40 door pivots, required root/static/tower nodes, and one-scene mesh counts. `gltf-validator` reports **0 errors, 0 warnings, and 194 informational unused-UV messages** for untextured meshes. The brick texture remains embedded and used by the brick material.

Reimported Blender-space bounds are X `[-42.925, 11.990]`, Y `[-36.710, 5.420]`, and Z `[-0.240, 13.780]` metres. Z is vertical in the Blender reimport; the GLB itself is Y-up.

## SHA-256

- `station1.glb`: `228909c654890e17149c8ec833077027b09f656093b2554ca836838f229186c4`
- `station1-warm-brick-1m.png`: `32DE2BF4AE7DCB8DE33B2E93EE15CE9736C345C6F230EC7A0B82B1D9B28FDFCE`
- `station1.blend`: `b32aaad7773dfc825bb93a85f8a0d33d55e76405437d5300805134a52598ad28`
- `build_station1.py`: `631aa0390b6c8c196ef92d7354b7b70ea921b84b6ad6e8bd029d9ab22e1f38e8`

## Rear and side additions

Five rear scenery doors, one estimated 3 x 3 m low-shed side door, tower platform guardrails and source-visible wing windows are included. Rear count is owner-confirmed; dimensions, style/alignment and exact shed placement are estimated. All front forty panel transforms remain valid. Complete untruncated validation: H:/ChatGPT/Peterborough-Facilities-20261027/qa/station1-validation.json. Rear and both side review renders are in the native model folder.
