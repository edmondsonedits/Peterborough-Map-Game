# Station 2 asset build report

## Delivered

- `city-explorer/assets/station2/station2.glb` — embedded-texture GLB, 1,158,344 bytes after glTF Transform deduplication.
- `city-explorer/assets/station2/layout.json` — shared geometry, door, tower, and side-annex bounds; `sideAnnex` is consumed by runtime collision.
- `city-explorer/assets/station2/asset-report.json` — hierarchy, transforms, bounds, opening rays, textures, and primitive-count checks.
- `city-explorer/assets/station2/textures/` — original generated 1 m tiled grey masonry, honey timber, and pale timber PNGs; all three are embedded in the GLB.
- `tools/blender/build_station2.py` — reproducible Blender 5.2 build, export, reimport validation, and preview rendering. Paths derive from the script location.
- `model/station2.blend` — editable source grouped as Station 2 | Structure and Station 2 | Animated Doors.
- `model/station2-exterior.png` — final 1920×1280 preview rendered from the reimported Blender export.
- `model/station2-bay-interior.png` and `model/station2-rear.png` — 1440×960 previews rendered from the reimported Blender export.

## Build and validation

From the project root, run Blender 5.2 in background mode:

    blender.exe -b --python H:\ChatGPT\Peterborough-Station2-20261027\game\tools\blender\build_station2.py

From the game project root, run the optional deduplication pass after each fresh Blender export:

    ..\qa-tools\node_modules\.bin\gltf-transform.cmd dedup city-explorer\assets\station2\station2.glb city-explorer\assets\station2\station2-dedup.glb
    Copy-Item city-explorer\assets\station2\station2-dedup.glb city-explorer\assets\station2\station2.glb -Force

Keep the Blender source and original tiled texture PNGs. The final report records 32 unique GLB meshes/primitives instantiated by 76 mesh-node instances, 12 materials, 3 embedded images, and 23,236 scene triangles. Deduplication reduced the GLB from 1,667,476 bytes to 1,158,344 bytes (509,132 bytes, 30.5%). The twelve front hinge nodes remain independent children of Station2_Root. All fourteen rear section panel nodes remain individually addressable.

The tower occupies x=9–12.2 m and z=17–21 m; the shaft is 9.4 m tall with the cap reaching about 9.66 m. The side annex occupies x=9–12.2 m and z=1–8 m with a 3.2 m top. Runtime collision reads these bounds from `layout.json` (`tower` and `sideAnnex`). The wing frontage has one tall window beneath the vertical timber accent near the bay and a full-height glazed public entry with projecting canopy at the far end. Forty-five static-geometry ray samples across the three front and two rear apparatus openings found zero obstructions. The optimized GLB passed Khronos glTF Validator with zero errors and zero warnings.

## Modeling limits

Each of the three front assemblies has four red vertical leaves with eight glazing lites. The upper side clerestory uses actual openings above the masonry and timber lining. Rear sectional doors have seven panels each and occupy the inferred rear elevation. The tower sign is an extruded typographic numeral 2, not a reproduced or verified crest.

Non-door dimensions are estimates from completed project photos and the City site presentation. Rear door placement is inferred because a clear rear elevation was not located. Exact room adjacency and full as-built dimensions remain unverified. No apron is exported; the runtime supplies the GIS-aligned ground transition.