# Station 1 Blender asset report

## Source basis and limits

The model follows the shared `city-explorer/assets/station1/layout.json` contract and the inspected owner frames `owner-0158_LEFT_SIDE.jpg`, `owner-0149_LEFT_SIDE.jpg`, and `owner-0170_LEFT_SIDE.jpg`. The front frame controls the five-door count and the dark piers, red doors, shallow canopies, bollards, polygonal watchroom, and raised rear roof. The City 2018 interior image controls the bay wall bands, trusses, door tracks, ducts, and yellow extraction hoses. The gear rack is a restrained representation of the documented storage type.

Door and height dimensions are photo-scaled estimates over the GIS footprint, not a field survey. Ancillary room adjacency remains unresolved; no full room plan was invented. The GLB uses an original procedural brick tile; no reference-photo pixels are shipped.

## Model and runtime contract

- Five red sectional doors, each 4.1 m wide by 4.5 m high, with eight independent panels and a four-lite horizontal window row at approximately 1.4 m above the slab.
- Stable nodes `Door_F{1..5}_Panel{0..7}` have identity rotation and the shared panel-centre transforms. The native export/reimport audit checked all 40 nodes.
- `Station1_TrainingTower` remains a separate parent for runtime terrain adjustment.
- The detached tower shaft, cap, and training apertures share the narrow shaft centerline; the adjacent low practice wing has a sloped roof with triangular end infill.
- The apparatus bay includes a concrete slab, mint/teal/cream walls, pale roof undersides, roof-zone-specific white joists/trusses, door tracks, split-height exhaust ducts, yellow hoses, and limited gear storage.
- Static geometry is batched by material. The GLB is 919,512 bytes (under the 2 MB target), with 157 meshes/primitives, 20 materials, and one embedded original texture.

## Outputs

- Builder: `tools/blender/build_station1.py`
- Editable scene and review images: `H:/ChatGPT/Peterborough-Station1-20261027/model/station1.blend`, `station1-exterior.png`, `station1-tower-exterior.png`, `station1-bay-interior.png`, and `station1-overhead.png`
- Runtime asset: `city-explorer/assets/station1/station1.glb`
- Original texture source: `city-explorer/assets/station1/textures/station1-warm-brick-1m.png`
- Machine-readable counts and transforms: `city-explorer/assets/station1/asset-report.json`

## Verification

The Blender build exported and reimported the GLB, then checked the 40 named panel nodes, translations, identity rotations, required root/static/tower nodes, mesh counts, triangles, and bounds. The reimport QA scene is cleared before import so its counts and review renders contain one model.

The Blender export/reimport audit confirms the 40 door pivots, required root/static/tower nodes, and one-scene mesh counts. `gltf-validator` is being rerun against this final tower revision by the integration owner. The brick texture remains embedded and used by the brick material.

Reimported Blender-space bounds are X `[-43.145, 11.990]`, Y `[-36.710, 5.420]`, and Z `[-0.240, 12.850]` metres. Z is vertical in the Blender reimport; the GLB itself is Y-up.

## SHA-256

- `station1.glb`: `02FDF2D4CC085325CD489A8672DC88F58E9D42F730FE61234D3CF216B9C1E7EC`
- `station1-warm-brick-1m.png`: `32DE2BF4AE7DCB8DE33B2E93EE15CE9736C345C6F230EC7A0B82B1D9B28FDFCE`
- `station1.blend`: `88BAFEBEE5F31DDDDC23348BFF64B13254489C6E758F1A551C8A412EB8BD74B5`
- `build_station1.py`: `8AC20B879BC93826A424613C7EA04C706F33937393C785B1A57C12078474CFB1`
