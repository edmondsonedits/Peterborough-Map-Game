# Peterborough street appearance audit — 2026-10-10

## Scope and evidence status

This is a complete **data audit** of the packaged motor-drivable OSM ways and a bounded visual/renderer correction. It is **not a claim that every city street has been inspected in current street-level imagery**. Existing controls, dispatch, OSM coordinates, municipal pavement boundaries and terrain assets are retained.

The snapshot contains 5,961 drivable ways. Of those, 5,331 intersect the City of Peterborough boundary, spanning 798 distinct normalized named streets. Ways are map segments, not distinct streets; some intersecting ways extend outside the city. Service roads, parking aisles and private driveways remain in the audit rather than being hidden from its denominator.

Independent Ontario Road Network (ORN) lane attributes: 3,213 linear-referenced records for 3,179 requested road IDs. At interior stations, matching requires compatible names, bearing within 25 degrees, separation at most 8 m and the applicable FROM/TO measures. A divided one-way OSM carriageway is not equated to a whole two-way ORN road. Inventory observation dates are retained and may be old; download time is not observation time.

| City-intersecting way status | Count |
|---|---:|
| Mapped lane count agrees with matched ORN inventory | 1,797 |
| Lane-count conflict requiring individual review | 138 |
| ORN count available, OSM count absent | 50 |
| Only partial match or changing inventory along the way | 54 |
| No safe inventory match | 3,292 |
| **Total** | **5,331** |

2,608 city-intersecting ways have a mapped motor-lane count; 20 identify a shared centre lane. Unmatched does not mean geometrically wrong. It includes unnamed/private/service geometry outside the public inventory's coverage.

The audit script writes every way to JSON and CSV with original geometry hash, mapped and inventory counts, matching coverage, original source dates, sidewalk/parking/cycle tags and unresolved flags. No inventory-conflict count is silently converted into a renderer override.

## Confirmed renderer defects and changes

- Shared centre-turn lanes were missing from directional lane totals. Both sides now receive yellow boundaries instead of an erroneous white/yellow split.
- Odd two-way lane counts without a supported directional allocation no longer produce an arbitrary lane split. Explicit directional turn-lane tags can provide that allocation.
- A separate cycle track, shoulder or sharrow is no longer interpreted as a painted bike lane. A side-specific `no` overrides a generic cycle-lane tag.
- A legal overtaking-permission tag is no longer treated as evidence that the physical yellow stripe is dashed.
- Asymmetric lane dividers and turn arrows now use the renderer's actual left-positive road frame; combined arrows retain the mapped choices.
- One-lane motorway ramps retain edge markings. Divided-road left edges use the opposing-direction colour convention rather than the former all-white edge rule.
- Junction trimming counts distinct road arms with elevation/layer separation, rather than inferring a junction from street-name changes.
- Paint is generated **after** the final municipal pavement and Station 1 reconciliation. Its footprint is clipped to the same Float32 triangles used for vehicle ground queries and sits 6 mm above those planes. This replaces long road-centreline-height boxes that can float, sink or cross traffic-island holes.
- Mitered road edge stations are shared with the asphalt mesh so adjacent stripes connect on bends. Longitudinal dash phase uses road chainage, not a new pattern at every segment.
- Triangle instances remain attached to the original OSM road's editor registry; this is paint-only geometry, not a new collision or routing system.

Line widths and standard dash rhythms use Ontario Traffic Manual Book 11 conventions. These are explicitly **convention-based defaults**, not proof that every road currently has that exact paint. Single/double/broken exceptions need road-specific observations.

## Reviewed Sherbrooke correction

Appearance-only overrides are limited to OSM ways **460581459** and **650896572**, in the reviewed downtown Sherbrooke corridor. The 2023 Ontario orthophoto already packaged in this repository shows opposing travel lanes and roadside parking, not four marked travel lanes. Matched ORN lane records corroborate a two-lane count (records can predate the image). The source OSM `lanes=4` previously caused extra parallel white travel-lane dividers.

The correction changes the **marking interpretation** to two travel lanes with a single centre divider and no additional white travel-lane dividers. It does not narrow the surveyed pavement or remove parking. It is guarded by the source way ID, street name and original lane count. Original OSM tags and geospatial files are unmodified. This 2023 observation is not certification of current 2026 repainting or construction.

The remaining 136 inventory-conflict ways are not automatically changed. In particular, Water Street, Lansdowne and multi-lane approaches require distinguishing current layouts, one-way carriageways, turning pockets and old inventory records.

## Curbs and sidewalks: preserve real differences

City Basedata road polygons and curb-edge XY lines remain authoritative. The published curb service describes raised, level and gravel edges, but the exposed feature fields do not provide the described `CURBTYPE`. Consequently, a claim to have individually corrected every curb to raised/flush is unsupported. Existing unclassified curb treatments remain explicitly inferred.

A sidewalk does not universally touch the asphalt: boulevard/grass separation, driveways, shoulders and separate paths must be preserved where mapped. This pass does not move all sidewalks to road edges to produce a cosmetically uniform city.

## Validation

Local test-driven checks reproduced incorrect shared-lane counting, cycle classification, directional paint and missing triangle projection before correction. The resulting 16 focused street-marking tests pass, including transformed Three.js instance geometry and editor ownership. Road/source preservation, full packaged terrain clearance and existing rendered pavement tests pass.

The standard source tree has release-cache mismatches before the normal release-normalization step. Running the production normalization on an isolated copy followed by all `tests/*.cjs` and `tests/*.mjs` gives **167/167 passed**. The editor release test now accepts a valid versioned bootstrap instead of hard-coding an obsolete cache string and traverses 57 local modules successfully.

The separate `tools/test_site_surface_materials.mjs` fails its pre-existing `STATION_VIEWS` finite-value assertion on both the baseline and candidate; unrelated camera presets were not changed. This failure is not hidden or attributed to the new road code.

Browser results are recorded separately by `tools/check-street-visuals.cjs` under `artifacts/street-evidence/`. It captures matched baseline/candidate views at actual named OSM coordinates, inspects paint-to-pavement height and preserves screenshots and errors. Desktop capability is explicitly emulated so a two-core CI runner cannot silently test only the lighter OSM fallback. These are software-rendered CI observations, not physical-phone benchmarks.

## Repeatable commands

```sh
python tools/geospatial/collect_street_evidence.py
python tools/geospatial/collect_lane_records.py
python tools/geospatial/audit_street_appearance.py --evidence artifacts/street-evidence --out artifacts/street-audit
node --input-type=module --check < city-explorer/app.js
node tools/test_street_marking_fidelity.mjs
node tools/test_city_detail_rules.mjs
node tools/test_rendered_pavement.mjs
node tools/test_city_editor_release.mjs
node tools/geospatial/test_road_network.mjs
node tools/geospatial/test_road_terrain_clearance.mjs
```

## Source references

- ORN lane inventory: https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/6
- City boundary and curb edges: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer
- Ontario imagery: https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer
- Dated reference: `city-explorer/data/survey/station-one-district-orthophoto-2023.jpg` and its source metadata in the survey files.
- OSM lane semantics: https://wiki.openstreetmap.org/wiki/Key:lanes and https://wiki.openstreetmap.org/wiki/Key:lanes:both_ways
- Ontario MTO pavement conventions: https://www.ontario.ca/document/official-mto-drivers-handbook/pavement-markings
- Ontario Traffic Manual Book 11, Ministry of Transportation, March 2000, Figures 3 and 34 (primary publication, public mirror): https://www.atstraffic.ca/wp-content/uploads/2022/03/Book-11-Pavement-Hazard-and-Delineation-Markings.pdf

OSM and Ontario/City data retain their existing attribution. No Google Street View images are redistributed. New source collection is bounded and preserves unavailable/partial responses instead of inventing evidence.
