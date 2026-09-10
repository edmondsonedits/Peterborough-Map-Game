# Headless city vegetation workshop

Original deterministic `bpy` geometry for one reusable illustrative broadleaf family.
This asset is an inferred city vegetation treatment, not a measured tree, species
identification, or claim about the tree inventory of Peterborough.

Run from the repository root with the workspace portable Blender executable:

```powershell
& './tools/runtime/blender-5.2.0-windows-x64/blender.exe' --background --factory-startup --python './tools/blender/build_city_vegetation.py'
```

An existing Blender 4.5+ installation can also run this script. No pip packages or
external assets are required: Blender supplies `bpy` and its built-in glTF exporter.
Use `-- --output <directory> --seed 41073 --save-blend` to change output, seed,
or save an optional editable workshop. Default output is
`city-explorer/assets/vegetation/` with three GLBs and a provenance/metrics manifest.
Do not deploy or commit the portable runtime or downloaded archive.

The near silhouette has eight irregular crown lobes and visible branch structure;
the middle silhouette keeps the lobes with lower tessellation; the far silhouette
uses one crown. Triangle ceilings are 1200 / 250 / 60. All surfaces share one rough
vertex-color material and four linear color swatches: no image textures, leaf-card
alpha, animation, or runtime procedural mesh construction. GLBs use meters, +Y up,
and a root origin at ground contact. A nominal eight-meter tree is a design scale,
not a measured local specimen. Different LOD silhouettes trade precision for cost.

For Three.js, cache each loaded geometry and material; reuse with `InstancedMesh`
per LOD and deterministic scale/yaw per placed tree. The manifest's 85 m / 190 m
LOD switch distances are starting points requiring scene-camera tuning. Never
load or clone a GLB for each tree. Asset placement must still come from the app's
vegetation evidence rules and must not infer exact real trees from this asset.

Official portable runtime: [Blender 5.2 release directory](https://download.blender.org/release/Blender5.2/).
Windows x64 archive is 404,954,661 bytes (about 386 MiB); verify the downloaded
archive against the corresponding official `.sha256` file before extraction.
API reference: [glTF export operator](https://docs.blender.org/api/current/bpy.ops.export_scene.html).
The workshop uses `GLB`, selected objects, +Y up, normals, material export, and
custom provenance extras. Asset determinism means repeatable geometry and palette
for a fixed seed and Blender version; byte identity across Blender versions is not promised.

Verified generation with Blender 5.2.0 LTS and default seed:

| Asset | Triangles | GLB bytes | Primitives |
| --- | ---: | ---: | ---: |
| LOD0 | 816 | 86,536 | 1 |
| LOD1 | 184 | 21,180 | 1 |
| LOD2 | 36 | 4,732 | 1 |

The exported GLBs were inspected for `POSITION`, `NORMAL`, and `COLOR_0`,
one material, and zero textures. The downloaded runtime matched its official
SHA256: `2d184b626c001692c362291911293b6a297179d618d95e9e9192c3a80318adc4`.

The browser adapter `city-explorer/vegetation-assets.js` exports
`loadVegetationAssets()`. It resolves a cached `{family, provenance, lods}` object
or `null` if loading or validation fails. Each LOD exposes shared geometry/material,
distance, and measured triangle count. The adapter validates colors, finite geometry,
triangle ceilings, and Y-up ground/height bounds. It was checked with the actual
vendored GLTFLoader: Y bounds span approximately -0.006 to 7.883 m for LOD0;
all levels retain vertex colors and share one material. Offline fetch failure
resolves null. Two Blender runs produced byte-identical GLBs.

The unmodified loader was obtained from
[official Three.js r180 GLTFLoader](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/loaders/GLTFLoader.js)
and uses the existing `vendor/three-r180/LICENSE` (MIT) and BufferGeometryUtils.
