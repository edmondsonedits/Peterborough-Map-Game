# Fire Station 1 — local Blender integration

Station 1 at 210 Sherbrooke Street is reconstructed as an original Blender asset and integrated into the existing Three.js simulator. This local feature branch is based on published v1.6.141. Station 1 has not been published by this task.

## Play

Preview: http://127.0.0.1:4182/city-explorer/?station=1

The truck starts in the second bay from the right when facing the front of the building. All five front doors start closed. Five matching rear doors and the rear shed side door are modelled closed as scenery. Use **G** or **Open bay door** to operate the door aligned with the truck, **E** to enter or leave the truck, and **W/S/A/D** to drive. **Start in truck** resets the truck to its bay and closes the doors. Touch controls provide the same door operation.

The doors use eight independently animated sections following vertical, curved and horizontal tracks. Closed openings and station walls block the truck's complete footprint; an occupied doorway reverses a closing door. The separate rear training tower follows the terrain beneath its actual footprint.

## Research and model

See [sources.md](sources.md) for the inspected images, documents and evidence limits, [research-and-design.md](research-and-design.md) for placement and gameplay decisions, and [asset-report.md](asset-report.md) for export counts and hashes.

The current exterior follows the owner's street footage: five red overhead doors with small window rows, dark frames, buff brick, yellow bollards, a projecting glazed watchroom, stepped clerestory roof, side wing and detached training tower. City bay photographs guide the mint/teal/cream walls, pale roof structure, inner door faces, tracks, extraction hoses and services. No complete publicly accessible dimensioned floor plan was retrieved. Ancillary rooms are represented by exterior volumes; the model does not claim an accurate hidden room layout.

- Editable Blender scene: `H:/ChatGPT/Peterborough-Station1-20261027/model/station1.blend`
- Builder: `tools/blender/build_station1.py`
- Shipped model: `city-explorer/assets/station1/station1.glb`
- Shared dimensions/placement: `city-explorer/assets/station1/layout.json`
- Preserved source documents, photos and QA: `H:/ChatGPT/Peterborough-Station1-20261027/`

The builder uses Blender's background Python interface. From the game root, run Blender with `--background --python tools/blender/build_station1.py`. It regenerates the native scene, GLB, original texture, audit JSON and review renders in the paths above. The GLB is 1,972,316 bytes and contains 40 independent door panels, 200 mesh primitives, 20 materials and one embedded original texture. Reference photos are not shipped as textures.

## Verification

- Second-bay and hose revision: four focused station tests passed; full/lite browser checks passed for the second-bay spawn, entry, keyboard/button/touch door controls, blocked closed door, drive-out, reverse-in, reset and obstruction reopening. Final finer-rib hose export also passed asset validation and a refreshed preview check. Receipts are in the external project's qa/second-bay-hoses folder.

- Baseline complete Node regression suite: **816 passed, zero failed** after the editor-restore and rotated-truck obstruction fixes. Final GLB contract and editor tests also passed.
- Blender export/reimport: one model, correct panel origins and rotations, separate tower parent, measured bounds, 55,134 imported mesh polygons/triangles reported by the builder.
- Independent glTF validator: **zero errors, zero warnings**. All 194 informational messages are unused UV attributes on untextured mesh primitives; the validation was not truncated.
- Full/lite desktop and touch emulation: closed startup, single aligned door operation, truck entry, blocked closed door, drive-out, reversing into the bay, reset and occupied-door reopening.
- Missing GLB and valid GLB with the wrong node contract: original scenery and safe apron spawn retained, new collisions disabled, driving and reset usable.
- Station 2 and Station 3 browser movement preserved; Station 2 GLB hash unchanged.
- Delayed published editor loading retains exact main-station/tower suppression. Focused direct-restore tests additionally cover the editor's Restore action and pre-load behavior.
- Existing driving QA and all 38 mobile-control assertions passed. The portrait HUD now clears the touch action button, and the indoor camera stays below the trusses. Station accuracy, station pavement, station road detail, gameplay, rendered pavement and fallback-junction scripts passed. Independent code review's two findings were fixed and reviewed again.

Browser touch emulation is not a physical-phone performance test. Detailed QA receipts and screenshots are in the external project's `qa/` folder.

## All-elevation revision

The owner confirmed five rear apparatus doors and one side bay door on the rear shed. Rear door style/alignment, shed door dimensions (3 x 3 m) and precise placement are estimates. The rear wall now has five closed sectional doors, the low shed has its side door, the tower has guardrails, and the visible wing has its photo-referenced windows. Front controls and second-from-right spawn are preserved. Complete asset validation reports 0 errors, 0 warnings and 194 unused-UV informational messages, with no truncation.
