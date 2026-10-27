# Station 2 implementation ledger

Base scenery and local game integration are saved in commit e2ab7f8. The editable Blender source, source research, optimized GLB and visual evidence remain in the accompanying model/research/qa folders.

Current requested behavior: the truck spawns in the rightmost bay as viewed from outside facing the station, facing out toward the street. All front and rear doors start closed. The front door aligned with the truck can be opened immediately using G or the desktop/touch button. Reset and Start in truck restore that spawn and close all doors.

The building appearance, shared GIS transform, floor/foundation, exact obsolete-arena suppression, and load-failure fallback remain in place. The full internal room plan and surveyed non-door dimensions remain unverified. The user authorized publication. Version 1.6.141 integrates the current main branch, retaining its Station 3 correction and geospatial refresh; deployment and live verification receipts are collected in ../qa.

Completed and verified: right-hand spawn, five closed doors, immediate G/button/touch operation, closed-door collision, drive-out, reset, obstruction reopening, and clear desktop/touch/driving cameras. Focused station and gameplay tests pass; browser runs report no uncaught JavaScript errors. Evidence is in ../qa/right-bay-result.json and ../qa/right-bay-camera-result.json.
