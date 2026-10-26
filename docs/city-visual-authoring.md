# City visual authoring

Use the local workshop at `city-explorer/material-preview.html` to inspect the shared procedural material library beside a metre-scale facade assembled from the production appearance resolver and facade-component planner. It is an authoring aid, not a final visual review or a performance result. Drag to orbit and scroll to zoom. The facade selector resolves residential, storefront, apartment, industrial, or civic presets; the detail selector switches full and lite component/shader detail.

The preview accepts the same comparison query values as the explorer: `?visuals=legacy` disables the procedural material shader detail while retaining the shared appearance and component helpers; `?visuals=lite` selects reduced detail. Use these to isolate material detail from the shared building layout. They do not change source profiles, geometry, GIS, or collision.

## Add a reusable material

1. Add a named entry to `CITY_MATERIALS` in `city-explorer/city-material-library.js`. Set an intended use, metre-based scale values, roughness, metalness, and a conservative base-render fallback. Keep procedural detail restrained so it supports the base color rather than replacing it.
2. Add a shader effect only when it can use the existing world-position/normal projection and the library's full/lite strength. Keep shader edits bounded, deterministic, and free of image downloads. Give the pattern a real-world scale: brick units, joints, seams, and weathering spacing must correspond to metres.
3. Add palette aliases to `CITY_PALETTE_SURFACES` only when a shared city palette needs the material. Record the material's origin and scope in `city-explorer/data/city-visual-sources.json`. Code-generated surfaces are original procedural work; do not label them CC0 or imply a broader licence than the repository grants.
4. Open the workshop and inspect the corresponding metre-scale sample in full and lite modes. Include a plain material fallback when shader anchors are unavailable. Avoid adding a texture solely to make the preview busier.

## Add or tune a building preset

Edit the appropriate entry in `CONSERVATIVE_BUILDING_PRESETS` in `city-explorer/building-appearance.js`. Keep dimensions in metres and use conservative values that fit common footprints. Add or adjust classification from actual building tags in `resolveBuildingAppearance`; do not rewrite feature identity, mapped footprint, or massing. Tune windows, doors, sills, cornices, and floor/column limits in the preset. `facadeComponentPlan` bounds output per wall and removes some trim in lite mode; keep additions within those bounds. Choose the matching archetype in the workshop and confirm the panel plan stays within the wall and still reads when lite mode is selected.

## Add a building-specific profile

Put reviewed facade overrides in the existing profile/override source rather than hardcoding a preview-only example. Tie the override to the stable feature id, keep it limited to appearance, and record the evidence and confidence there. Preserve the existing source profile as the authority for footprint, dimensions, and identity. A web photo may inform visual research only when reuse rights are unknown; use the project notes in `docs/web-storefront-references.md` and do not package those reference photographs into runtime assets.

## Prepare an external texture

Before adding any external map, retain its source, author, exact licence and permitted uses, acquisition date, attribution text, and original file checksum. Get redistribution permission for the project and its intended distribution; public availability does not grant it. Keep reference-only photographs outside the runtime. For textures that are cleared for use:

- Prepare albedo/base color in sRGB. Prepare normal and roughness data in linear space; do not apply an sRGB transform to data maps.
- Use the renderer's tangent-space normal convention (OpenGL/+Y). If an input uses the opposite green-channel orientation, convert it once during preparation and record that change.
- Record physical repeat scale in metres and set UVs or projection so the sample has that scale in world space. Avoid stretching one faÃ§ade's unique photo across unrelated buildings.
- Store each delivered texture's SHA-256 and dimensions with the source entry. Record every derived crop or color adjustment and preserve the source checksum separately.
- Use a GPU-friendly compressed format supported by the project runtime. Generate mipmaps for minified surfaces and check that distant brick, seams, and window frames do not shimmer. Record compressed size, decoded/mipmap estimate, and contribution to the material budget before broad use.
- Set finite per-material and city-wide byte budgets before promotion. Include albedo, normal, roughness, mip levels, and expected simultaneous residency. Prefer the procedural fallback when the texture exceeds its budget or has uncertain rights.

`city-explorer/data/city-visual-sources.json` records the ten original procedural materials, the six existing Sherbrooke user-footage frontage assets with output and source hashes, and a pointer to the web-reference evidence. The footage manifest's provenance says that geometry and crop were reviewed and dimensions are not surveyed. This record is provenance, not a new redistribution grant.


## Game integration and adding the next photographed building

The game uses the library through its shared material palette and preserves shader hooks when cloning batched building and road materials. Full and lite rendering use the same stable appearance rules. Existing landmark/photo overrides take precedence. Generic facade detail remains budgeted, with per-tile limits and deterministic coverage; it does not add unique meshes or shader programs for every building. A building may receive the shared surface upgrade without additional facade geometry.

Use `city-explorer/?visuals=legacy` to restore the previous game material, lighting, generic facade and photo-depth paths. Use `city-explorer/?visuals=lite` for lighter visual materials and no reflection texture; `?lite=1` additionally enables the existing lightweight renderer. The workshop's legacy button only compares plain surface shading against the shared component layout.

For a photo that needs edge cleanup, add an explicit entry in `REVIEWED_PHOTO_APPEARANCES` in `reviewed-photo-appearance.js`. Keep the original file and hash unchanged. `silhouette` contains a convex polygon in normalized image UV coordinates (origin bottom-left). Validate it against the visible source roof/wall edge and inspect both frontage orientations. Record which crop was inspected, confidence and remaining uncertainty. Do not infer hidden features from missing pixels.

Porch depth remains visible over a loaded photo only when width fraction, height and depth are explicitly supplied. Optional `porchPostImageFractions` positions posts in source-image coordinates; `balconyWidthFraction` controls the supported balcony width. These are appearance estimates, not surveyed dimensions. Unmeasured generic porch defaults stay hidden when a photo loads, and the procedural fallback remains available if the photo fails.

The first such display override is 219 Sherbrooke (way/1006575704, S03). It clips roof/background remnants, matches the side-wall palette more closely, and aligns a shallow porch/balcony to the crop. Lower vegetation, photographic perspective and baked lighting remain; sharper source footage and individual wall rectification are future source-specific work.

## Concrete texture delivery recipe

The current library has no external image maps, so there is nothing to recompress for this release. For the next licensed tileable texture, prepare a 1024 Ã— 1024 master set for full quality and a 512 Ã— 512 set for lite. Do not enlarge a smaller source merely to hit those dimensions. Preserve aspect ratio for unique facade photos instead of forcing them square. Record the real-world width and height represented by one tile separately from pixel dimensions.

1. Preserve the cleared source outside the shipped asset folder with its URL, author, licence text, attribution and SHA-256. Work from a copy. Straighten only the supported wall plane; remove baked directional lighting where reliable and reject crops with unresolved foreground objects.
2. Export color to WebP quality 85, or JPEG quality 90 when the existing loader requires it. Check brick joints and sign lettering at the actual viewing distance, then lower dimensions before accepting excessive byte cost. Keep alpha only when the silhouette needs it. These image formats reduce download size, not decoded GPU memory.
3. Keep normal and roughness masters lossless (PNG). Normal maps are tangent-space +Y/OpenGL. For a confirmed DirectX/-Y source, invert only the green channel once and record the conversion. Do not use lossy color compression on normal/data maps. Set base-color maps to sRGB and normal/roughness maps to linear/no-color-space in Three.js.
4. Use mipmaps, trilinear minification, linear magnification, and bounded anisotropy (up to 8 full, 2 lite, capped by renderer support). Use repeat wrapping only for proven seamless surfaces. Set repeats from metres covered / metres per tile; clamp unique facade photographs at their edges.
5. A 1024Â² RGBA8 map with a complete mip chain is about 5.33 MiB; 512Â² is about 1.33 MiB. Add all resident maps, not just downloaded bytes, to the budget. If this exceeds the pilot budget, use a smaller map, omit a low-value map, or keep the original procedural fallback. Introduce KTX2/Basis only after confirming the existing loader/transcoder path and a visual check; this release does not add that pipeline.
6. Record exact export dimensions, settings, byte counts, source/output hashes, color space, normal convention and physical repeat scale in `city-visual-sources.json`. Recheck full/lite, oblique views and distant shimmer before making the material a shared default.

See [the measured local verification report](city-visual-verification-2026-10-25.md) for baseline comparisons, coverage and current limitations.

## Easy polish: photographed porch overlaps

For a reviewed photo whose front posts/beam/railings already appear in the pixels, set `hidePhotoDuplicatedMembers: true` in its `REVIEWED_PHOTO_APPEARANCES` entry. This is currently enabled only for S03, 219 Sherbrooke. The helper separates those generated members from the retained porch/balcony slabs and hides them only after the photo successfully loads. Loading, failed-photo, unreviewed/default and legacy paths retain their existing usable fallback behavior.

Inspect front and oblique views before opting in another building: a photograph must actually cover the members being hidden. This does not repair perspective or reconstruct the porch. Leave the flag unset when useful side-view geometry would be lost. Disabling the S03 flag restores this pass's previous overlay behavior without removing the earlier roof-boundary cleanup.

The same polish pass replaces abrupt coarse ground patches with the existing smooth procedural noise at the recorded metre scales. Asphalt, concrete and grass retain restrained contrast, deterministic placement and lite strength; no maps or geometry are added. Their visual change is subtle. Existing colours, window settings and facade budgets were preserved after comparison showed no new defect there.


## Applying the located driving photographs

The October 25 recording pass uses `recording-appearance.js` to layer display settings over source profiles without mutating their identities, endpoints, heights, roofs or collision. `?recordingReferences=off` restores the exact prior profile/helper behavior for this pass; `?visuals=legacy` also opts out. It does not roll back unrelated concurrent work.

- Add source-backed wall/sign crops to `recording-photo-profiles.js`. `frontageIndex: 0` (or omitted) means the primary wall; `1` means `additionalFrontages[0]`. Never assume an image of a corner belongs on the primary wall. The Commerce sign is explicitly on its Water Street return.
- Use `facadePhoto.keepProceduralDetails: true` for small patches so surrounding glazing, trim and signs remain. Existing complete-facade photos retain their previous replacement behavior. A failed photo retains the procedural frontage. Partial crops can be as narrow as 1% of a reviewed facade; preserve the crop aspect when converting width fraction and height into metres.
- Add evidence-backed material/layout changes to `recording-reference-appearances.js` and record their observations in `data/recording-reference-evidence.json`. Existing safe-setback gardens accept optional `pathColor` and `drivewayColor`; explicit profile values take precedence over recording defaults. These change only surface appearance, not clipping or bounds. Missing fields retain the previous colors.
- Preparation is reproducible: run `python tools/streetscape/build_recording_frontages.py --references H:/ChatGPT/Peterborough-Building-References-20261024` with the existing Pillow/NumPy environment. `assets/recording-frontages/recipes.json` records the source root, exact quadrilaterals, output dimensions, JPEG settings and target dimensions. The builder preserves originals and writes hashes, byte totals and RGBA8+mipmap estimates to `manifest.json`. Inspect every exported crop: browser/image viewers may scale the source preview, so do not mistake display coordinates for original pixel coordinates.
- Ship only the prepared small crops, not contact sheets, whole-route photographs or original video. These are sRGB color maps with mipmaps, clamp edges, linear filtering and anisotropy 2 through the existing loader; no normal maps are added. This pass adds no public-domain claim or new external-photo rights.

Verify the intended wall from front and oblique cameras at 2.6 m, then check narrow lite and failed-photo behavior. The No Frills wall uses a procedural yellow panel because the full photograph contains a traffic pole and foreground objects. Lawns, deep porches, parking lots and unlocated imagery remain references until their geometry/site match supports a concrete addition. See `docs/recording-visual-verification-2026-10-25.md` and `test-artifacts/recording-visuals-20261025/comparison.html` for this pass's measured scope.

A clear crop is not automatically suitable permanent signage. The reviewed 364 Water address strip came from a sale/lease board and was rejected; only the building's observed stone pier was retained. Keep temporary advertising out unless reproducing that dated state is explicitly intended.


## Completing the recording reference collection

`corridor-recording-appearances.js` contains the compact, immutable runtime additions from the complete corridor review. Its audit is `data/corridor-recording-review.json`; the large audit is not downloaded by the game. Add only display fields to the helper allowlist. Existing explicit values win; `windowOverrides` merge by zero-based `(level, column)` slot and stable `referenceId`, so a manual override cannot be duplicated or overwritten. Keep every source path, hash and observation in the audit and cross-check the compact runtime entries in the focused test.

Use `archedWindowLevels: [2]` only when every window on the reviewed top floor is arched. For a single opening, use `windowOverrides: [{level: 1, column: 1, shape: 'arch', widthMetres: 1.8, heightMetres: 2.2, referenceId: 'source-frame-and-opening'}]`. Omitting `bottomMetres` keeps the normal floor centre; setting it explicitly measures from the wall base. `skip: true` suppresses that slot. An override replaces its default opening. Inspect adjoining bays and additional frontages: a neighbouring building's arches must not propagate across a whole footprint. Rectangular height overrides can enlarge a glazed opening while retaining masonry between bays. Dimensions remain visual estimates, not surveys.

`recording-surface-appearance.js` centralizes conservative parking, path and vegetation colours. It changes only the known previous defaults; custom colours, geometry, surface placement and shader settings stay intact. Reference photos under baked sunlight support an approximate palette, not calibrated albedo or new ground boundaries.

Use `?recordingExpansion=off` to restore the appearance before this continuation while keeping the first eight-site photo/garden pass. `?recordingReferences=off` disables both recording passes, and `?visuals=legacy` retains the earlier broad visual fallback. No new photographs ship in this continuation.

Before adding an unmatched house, establish its exact footprint using a readable address or another reliable image-to-map tie. `data/outer-recording-review.json` separates the confirmed Cricket/Driscoll route anchor from provisional house IDs and the separate October 19 two-pass collection. A clear, flattened image is useful evidence even when it cannot yet be assigned. Repeated near-identical frames are not distinct building matches.

The current completion comparison and limitations are in `docs/recording-completion-verification-2026-10-25.md` and `test-artifacts/recording-complete-20261025/comparison.html`. The full collection is not labelled complete while house matching and obscured elevations remain unresolved.


## Confirmed Cricket Place reference appearances

`cricket-recording-appearances.js` demonstrates adding a reference-backed house without taking over its massing. The compact registry adds 22 and 24 Cricket Place only when no existing same-ID profile is present. Every entry has `appearanceOnly: true` and `preserveMappedMassing: true`; runtime integration keeps the previous footprint simplification, wall dimensions, roof material/geometry and collision. Do not put `height`, `eaveHeight`, `roof`, `roofRise` or `massing` fields in these profiles. This is deliberately insufficient to reconstruct the source gables.

To add the next house: establish its exact source footprint first, inspect perspective-export pixels, record the original relative image path/hash and what it actually supports, then add a small immutable profile with `frontLatLon`, colour, opening and porch fields. Keep existing explicit profile overrides authoritative. The official parcel and user-confirmed route supporting the current entries are recorded in `data/outer-recording-review.json`; neighbour proximity alone is insufficient for an uncertain match.

`porchRoofColor` now colours the existing shallow porch canopy independently of the posts/slab/trim. Omit it to preserve the old trim-colour default. It changes no component dimensions and adds no image map. The trial Cricket front gardens were removed: the existing fixed-depth helper produced rectangular grass patches and paths ending mid-lawn. A safety-clipped strip is not proof of a sidewalk endpoint or lot boundary. Keep ground unchanged until the reference and mapped boundaries support a continuous treatment. Leave hidden driveways and planting locations unassigned.

Use `?cricketReferences=off` to compare only this continuation. The broader `recordingExpansion=off`, `recordingReferences=off` and `visuals=legacy` switches also suppress these additions. Reuse the matched 2.6 m cameras and desktop/lite capture recipe under `test-artifacts/cricket-visuals-20261025`; preserve the original baseline directory. See `docs/cricket-visual-verification-2026-10-25.md` for the measured local scope and remaining work.

## Hunter / Ashburnham Bridge

The Hunter treatment is deliberately source-scoped, rather than a new citywide bridge style. `hunter-bridge-source.js` carries the exact existing municipal BR60 polygon for the lite fallback. `hunter-bridge-surface.js` joins OSM ways 33954231 and 177049271 into one bank-anchored deck and blends the immediate approaches while preserving adjoining junction elevations. This is an inferred driving profile, not a surveyed engineering elevation. It fails closed if the expected topology is unavailable.

`hunter-bridge-appearance.js` adds source-aligned concrete panels, green ornaments, sidewalk/curb detail and lamp piers. It consumes corrected road segments and the municipal polygon, shares geometry batches, and adds no texture downloads or new collision. Its documented dimensions are visual estimates from the recording. See [the reference audit](hunter-bridge-references-2026-10-25.md) before changing those estimates. Under-deck arches need further support-location evidence; do not fill that gap with guessed structure.

Use `?hunterBridge=legacy` to restore the old bridge treatment locally. Keep that flag separate from city material quality and preserve lite mode. For another bridge, collect its source IDs, exact polygon, reference observations and approach continuity evidence first; do not apply Hunter's dimensions or bank profile by name matching.

The repeatable Hunter capture and scripted truck crossing are in `test-artifacts/hunter-bridge-20261025/capture.cjs`. Run `final` first, then `matched-baseline`: the latter uses the legacy flag and the same saved corrected-deck camera positions, daylight, viewport and quality. Original pre-edit captures remain in `baseline`. A deck-height correction necessarily changes eye height relative to the old road, so keep both fixed-world comparisons and explicitly identified 2.6 m final street views.

## Shared road appearance

The 2026-10-25 pass centralizes asphalt and intersection-mouth behavior. See [paired evidence and limitations](city-road-verification-2026-10-25.md).

- `city-material-library.js`: asphalt fine scale 0.08 m and broad patches, derivative/distance filtering; `asphaltStyle: 'legacy'` preserves previous shader. Material clone metadata preserves the style. Flat `roadEdge` foundations use asphalt; actual `curbConcrete` remains concrete. No external asset preparation or new licences are required.
- `app.js`: common paved-road base colour and `roadAppearance=legacy` comparison switch; default generated-curb and paint mouths use at most 18 m of source-chain trim. Treat this as bounded inferred appearance, not a surveyed stop-line location.
- `road-appearance-rules.js`: `createRoadMarkingContext`, `roadMarkingIntervals` and `roadCurbIntervals`. Build context once per batch, preserve source `lineId`, `chainStart`, source-node flags, widths, layer and height. Paint requires three public arms; service access only opens the facing curb. A T retains its far curb. Do not add arbitrary arrows/signals from road width alone.
- `road-network.js`: road contact chooses containing pavement before nearby edges; explicit stacked levels retain vertical selection. Changing this requires actual road-contact/underpass checks, not only screenshots.

To improve another road, first inspect its source tags and matched street/oblique view. Correct verified paint evidence through existing scoped profiles; tune shared rules only for reproducible cross-city defects. Keep municipal footprints, source positions and lane information intact. Run the road-appearance, road-curb, road-surface-selection and material tests plus relevant street/station/bridge checks. Reuse `test-artifacts/city-roads-20261025/capture.cjs` with a local server on port 8893; baseline/final modes share saved `views-full.json` and `views-lite.json`. Never overwrite the retained baseline for a future pass: copy the harness into a new dated evidence directory. `PTBO_VISUAL_ONLY=1` is only for an appearance-only recheck with explicitly preserved contact evidence. Profile full/lite sequentially; report physical-device testing separately.

## Roadside lights and signal masts

`roadside-furniture-placement.js` owns derived display anchors; `roadside-furniture-geometry.js` owns the nine shared instanced batches. All mapped lamps and signals use them in both full and lite mode. Build these after municipal/fallback pavement is available. Keep source coordinates and IDs in the editor registry: moving a display pole must not move a mapped road, intersection or source feature.

The resolver checks the whole pavement union with 0.7 m pole clearance, nearby building footprints and previously placed poles. Near a public street, lamps prefer that street over an adjacent parking aisle. Roadside arm endpoints must sample pavement; when a short arm cannot reach, search a nearer safe anchor. Typical heights are 7.4 m for lamps and 8 m for signals, with extra height where necessary to keep the hanging signal at least 5.3 m above its sampled road. Maximum arms are 5.5 m and 11 m respectively. These are conservative visual defaults, not surveyed pole locations or engineering specifications.

Area/path lamps well away from motor roads retain their mapped anchors with a short arm. Existing source-backed Hunter ornamental lamps retain their appearance outside the traffic width. Sherbrooke utility-pole lamps keep their GLB models but use the same safe anchors and roadward lamp targets; their connected wires follow any anchor correction. The pure `sherbrooke-pole-placement.js` helper leaves pole yaw intact and supplies separate lamp direction/reach. The editor's explicitly authored streetlight positions remain authored. The optional legacy street-name signposts reuse the pavement-edge resolver; default street names now use the floating intersection layer described below.

All signal lenses are static and non-emissive; there are no new dynamic lights, traffic rules, collision shapes, texture downloads or external asset licences. If you add geometry, include every instance in `lampParts`/`signalParts` so editor hide/restore remains complete. Keep all new type names in the existing near-streetscape LOD set.

Run `node --test tests/roadside-furniture-placement.test.mjs tests/roadside-furniture-geometry.test.mjs` for corner clearance, wider surveyed pavement, building avoidance, signal direction, short-arm reach, public-street selection and editor part membership. Reuse the sequential full/lite capture in `test-artifacts/roadside-lights-20261025/capture.cjs`; `baseline-matched` intercepts the saved pre-change app only in the test browser, while `final` uses current runtime code. Save future baselines in a new directory. Inspect actual street views as well as the all-pole audit; do not equate an off-road base with a correctly aimed lamp head.


## Floating intersection street names

`intersection-hologram-rules.js` derives all eligible named junctions from source road endpoints, keeping mapped names, layer and elevation separation. It does not change the source roads. The road axis closest to travel heading is the current street; the other name(s) appear on the hologram. A 0.08 alignment margin holds the previous choice around the angular midpoint, preventing jitter. On a right-angle turn this switches at about 48 degrees. Opposite headings on the same street keep the same crossing name. Multiway junctions retain all other street names; unnamed roads are not assigned invented names.

`intersection-holograms.js` owns `INTERSECTION_HOLOGRAM_STYLE`: hover height 9.6 m, nominal width 18 m, and 110 m selection radius. Text is drawn locally on transparent navy panels with cyan brackets. The screen-width cap keeps long names within a narrow display. Tune this shared style instead of adding per-intersection meshes. The fixed pool contains three Three.js Sprites in full mode or two in lite, with reused 1024×256 or 512×128 canvases. Textures update only when the displayed names change, use sRGB/linear filtering without mipmaps, and require no downloaded image or new attribution. Depth testing remains enabled so labels do not reveal streets through buildings. Nearby labels that overlap on screen are suppressed in favour of the nearest.

The group lives outside frozen static city transforms. In driving mode, `app.js` supplies the truck's heading for street selection and the active camera for billboard orientation; looking around alone never selects another street. On foot it uses the actor heading, and fly mode uses the camera heading. Map mode and cameras at least 90 m above terrain hide the holograms; existing map labels are unchanged. Labels have no collision, lighting or traffic-control effect. They can pass overhead and leave the field of view when you drive directly beneath them.

The default is holographic labels. Append `streetLabels=legacy` to restore the previous physical boards or `streetLabels=off` to hide intersection labels. These comparison switches leave other street furniture intact. Keep any future hologram tuning within the fixed pool and preserve both switches.

Run `node --test tests/intersection-hologram-rules.test.mjs tests/intersection-holograms.test.mjs`. The fresh baseline, matched desktop/narrow comparisons and heading/lookaround/night checks are under `test-artifacts/intersection-holograms-20261025`. The local capture scripts expect the existing development server on port 8893; run GPU captures sequentially. Preserve the saved baseline when preparing the next pass. Coverage means eligible junctions in the loaded road data, not surveyed confirmation of every sign or every street in Peterborough.
