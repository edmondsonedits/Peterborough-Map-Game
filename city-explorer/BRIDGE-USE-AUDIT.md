# Municipal bridge-use audit — 2026-09-09

## Finding and correction

The renderer previously treated every City Basedata layer 12 structure footprint as a vehicular bridge pavement polygon. The packaged `BR_USE` field contradicts that assumption: 44 Vehicular, 29 Pedestrian, 4 Railway, 26 Culvert and 4 unspecified records. Culvert polygons describe drainage structures, not a measured asphalt surface. Missing use is insufficient evidence to create a vehicle deck.

The municipal rendering pass and drivable polygon index now accept bridge records only when `BR_USE` explicitly says Vehicular (case/whitespace normalized). The original 107 source records are retained unchanged. Separate road-surface polygons, OSM road ribbons, footpaths and rail geometry are unaffected. This removes unsupported asphalt overlays; it does not create replacement detailed pedestrian or rail bridge models.

Concrete audited feature: `12/101`, facility `BR86`, OSIM `2013`, named “The Parkway bridge north of Lansdowne St W”, is explicitly Pedestrian. It no longer creates an official drivable asphalt deck. `12/99`, The Parkway bridge, is Culvert; its footprint likewise no longer becomes a road slab. The road itself continues to use separately mapped road geometry.

## Source and accuracy limits

Evidence is the existing `data/peterborough-road-surfaces.geojson`, City of Peterborough Basedata MapServer layer 12, included in the manifest generated 2026-08-12. Source service: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/12 . Packaged coordinates are EPSG:4326. Source last-edit date is unspecified. This run neither refreshes the dataset nor claims current source verification. Attribution and existing reuse terms remain in `THIRD_PARTY_NOTICES.md`.

No source coordinates, terrain, metre scale, vertical datum, or bridge heights were changed. `BR_SPAN` and `YR_BUILT` are not used to infer deck elevation. Real-world grade/clearance evidence remains a separate unresolved requirement. Unknown-use structures are omitted from this overlay pass, not declared absent from the real city.

## Verification

- Regression checks every one of the 107 packaged bridge records and confirms all 44 Vehicular records remain eligible; 63 other/unknown records are excluded.
- Existing official pavement-index, rendered-pavement/gameplay and municipal-source geometry tests pass. Source geometry validation reports 262,565 coordinates and zero invalid coordinates.
- Browser confirms 44 official bridge surfaces and exclusion counts matching the source.
- Rendered pavement triangles decrease from 308,015 to 306,343: 1,672 unsupported triangles removed.
- Mesh centroid audit after the change: 2,711 probes, zero missing hits, maximum interpolation mismatch below 1e-9 m. This tests mesh consistency, not surveyed accuracy.
- Full city loads; displayed frame rate 60 FPS on the local test browser.
- Browser driving regression: 13.216 m from the Station 1 apron onto the road, peak 30 km/h, final 0 km/h. All 90 contact samples use rendered pavement; maximum sampled ground step 0.017406 m and actor-origin clearance 0.035003 m.

No matched real/reference image score is assigned. This correction is supported by source semantics and rendered-layer counts, not a claim of photogrammetric likeness.

Next: obtain or identify reliable deck-elevation evidence for a vehicular crossing before changing its vertical profile; independently mapped non-vehicle crossings also need dedicated structural geometry if their current path/rail representation is insufficient.
