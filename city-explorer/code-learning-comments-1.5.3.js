/* =========================================================
   PETERBOROUGH 3D CITY EXPLORER — BEGINNER CODE MAP (v1.5.3)

   THIS FILE IS COMMENT-ONLY.
   It explains the developer-only 3D explorer and changes no runtime behaviour.
   ========================================================= */

/* =========================================================
   1. WHAT THIS PROJECT AREA IS
   =========================================================

   The City Explorer is a Three.js-based low-poly/voxel visualization of
   Peterborough. It uses open building, road, land-cover, and elevation data to
   create a navigable 3D city. It supports flight controls, map mode, search,
   landmarks, time-of-day appearance, optional sound, touch movement, status,
   feature count, FPS, and altitude.

   It is currently developer-only. city-explorer/index.html redirects to the main
   launcher unless the local developer-mode setting is enabled.
*/

/* =========================================================
   2. FILE MAP
   =========================================================

   index.html
   - Creates the canvas and all HUD controls/dialogs.
   - Defines a Three.js import map.
   - Loads the version marker, data-loader, osmtogeojson, and orientation fix.

   styles.css
   - Positions the canvas, HUD panels, dialogs, touch controls, loading screen,
     responsive layouts, and visual states.

   data-loader.js
   - Prefers deployment-cached OpenStreetMap and terrain assets.
   - Falls back to the explorer's original live services when cached files are
     unavailable.

   road-orientation-fix.js
   - Contains the main Three.js world/application logic and road/building
     orientation corrections used by the current deployment.

   data/manifest.json
   - Describes prepared deployment assets and their filenames.

   data/terrain/...
   - Locally cached Terrarium elevation tiles organized by zoom/x/y.

   tools/geospatial
   - Offline scripts that download, prepare, validate, or refresh city/road data.
*/

/* =========================================================
   3. HTML INTERFACE AREAS
   =========================================================

   city-canvas
   WebGL drawing surface where Three.js renders the city.

   brand-panel
   Small title identifying Peterborough and the live exploration mode.

   control-panel
   Fly mode, Map, Search, Landmarks, Dusk/time, and Sound controls.

   location-panel
   Current named area, coordinates, and world-loading/ready status.

   help-panel
   Context-sensitive control instructions.

   stats-bar
   Data attribution plus feature count, FPS, and altitude above ground level.

   loading-screen
   Blocks interaction and displays progress while terrain and city geometry build.

   search-dialog
   Local landmark search first; address search can use OpenStreetMap Nominatim.

   landmarks-dialog
   Quick-travel list for known Peterborough points.

   touch-controls
   On-screen WASD-style movement plus up/down controls for touch devices.

   toast
   Temporary status or error feedback.
*/

/* =========================================================
   4. THREE.JS CONCEPTS TO EXPECT
   =========================================================

   Scene
   Container holding lights, terrain, buildings, roads, water, vegetation, and
   other 3D objects.

   Camera
   The player's viewpoint. Fly mode changes camera position/orientation; map mode
   raises and reorients it for an overhead city view.

   Renderer
   Converts the scene and camera into pixels on city-canvas, usually every frame.

   Geometry
   Vertex/triangle shape data. Roads may be strips, buildings may be extruded
   footprints, and terrain may be a displaced grid.

   Material
   Controls visible surface colour, lighting response, transparency, and texture.

   Mesh
   A geometry combined with a material and placed in the scene.

   Group
   A parent object that lets many related meshes be moved or hidden together.

   Raycaster
   Casts an invisible line from the camera/mouse into the scene to determine what
   the player points at or clicks.

   Animation loop
   Repeated requestAnimationFrame work that reads input, updates movement, renders,
   and refreshes counters.
*/

/* =========================================================
   5. COORDINATE CONVERSION
   =========================================================

   Open geographic data uses latitude/longitude. Three.js uses local X/Y/Z units.
   The explorer must choose one geographic origin near Peterborough and convert:

   longitude difference -> local east/west X
   latitude difference  -> local north/south Z
   elevation            -> local vertical Y

   WHY AN ORIGIN IS USED:
   Large global coordinate numbers reduce graphics precision. Working near zero
   produces smoother rendering and camera movement.

   SAFE EDITING:
   Every buildings/roads/landmarks/search/camera system must use the same origin,
   scale, axis direction, and latitude correction. A sign error can mirror or
   rotate the whole city while individual geometry still appears valid.
*/

/* =========================================================
   6. DEPLOYMENT DATA LOADER
   =========================================================

   cachedAssetPromise
   Starts loading data/manifest.json immediately. If the manifest names a prepared
   OSM file, that file is read once and stored with the manifest.

   nativeFetch
   Original browser fetch saved before the page overrides window.fetch.

   WHY SAVE IT:
   The custom fetch function still needs a way to perform ordinary requests
   without recursively calling itself.

   Custom window.fetch
   Watches for the explorer's POST request to /api/interpreter. When prepared OSM
   text is available, it returns a synthetic successful Response from local data.
   Every other request is passed to nativeFetch unchanged.

   PLAYER CONNECTION:
   The world can start from versioned deployment assets rather than waiting for a
   live Overpass/interpreter service on every visit.

   HTMLImageElement src interception
   Watches image URLs ending in /terrarium/z/x/y.png. It first tries the matching
   local data/terrain/z/x/y.png file. If that local image errors, it restores the
   original remote URL.

   WHY THIS PATTERN:
   Local terrain is faster and more predictable, while the remote URL preserves a
   fallback for missing tiles instead of leaving holes in the city surface.
*/

/* =========================================================
   7. MOVEMENT SETTINGS — GENERAL EFFECTS
   =========================================================

   normal movement speed
   HIGHER: cross the city faster, but fine street/landmark inspection becomes
   harder and low frame rates produce larger jumps.
   LOWER: precise exploration, but long travel takes more time.

   boost multiplier (Shift)
   HIGHER: quick traversal; increases clipping/overshoot risk.
   LOWER: boost feels less distinct from normal flight.

   look sensitivity
   HIGHER: smaller mouse/touch movement rotates the camera more.
   LOWER: steadier view, but turning around takes more movement.

   vertical speed (Q/E or touch +/-)
   HIGHER: altitude changes quickly, with greater ground/ceiling overshoot risk.
   LOWER: more controlled elevation, slower transitions to map-like views.

   damping/smoothing
   HIGHER damping: movement stops sooner and feels controlled.
   LOWER damping: longer glide and more momentum.

   camera near/far clipping planes
   Near too large: close objects disappear.
   Far too small: distant city disappears.
   Far too large: can reduce depth precision and cause surface flicker.
*/

/* =========================================================
   8. DATA-TO-GEOMETRY FLOW
   =========================================================

   1. Load manifest and/or live OpenStreetMap response.
   2. Convert OSM structure to GeoJSON using osmtogeojson.
   3. Separate features by tags/geometry: buildings, roads, water, parks, etc.
   4. Convert every coordinate to local Three.js coordinates.
   5. Request/sample terrain elevation where needed.
   6. Build low-poly geometry and materials.
   7. Add meshes/groups to the scene.
   8. Update loading progress and feature count.
   9. Position the camera at a safe starting location.
   10. Hide the loading screen and enable exploration.

   WHY BUILD OFFLINE ASSETS:
   Open geospatial queries can be large, slow, rate-limited, or temporarily
   unavailable. Prepared assets make deployment repeatable while keeping fallback
   behaviour for development.
*/

/* =========================================================
   9. ROAD ORIENTATION PROBLEM
   =========================================================

   A road line has direction between points but no built-in surface width. To draw
   a road strip, code calculates a perpendicular vector on each side of the centre
   line. Coordinate-axis conventions determine which perpendicular is left/right.

   COMMON FAILURE:
   Swapping latitude/longitude, X/Z, or perpendicular signs can rotate, mirror, or
   offset roads relative to buildings.

   WHY AN ORIENTATION FIX MAY BE SEPARATE:
   Keeping corrections in a focused module allows generated upstream city code to
   remain intact while deployment-specific road geometry is repaired and tested.
*/

/* =========================================================
   10. SEARCH AND LANDMARKS
   =========================================================

   Local landmarks
   Known names and coordinates stored with the project. They respond instantly and
   do not need a network request.

   Address search
   Can use Nominatim, an OpenStreetMap geocoding service, to turn text into
   coordinates.

   SAFE/RESPONSIBLE EDITING:
   - Follow service usage policies and identify the application when required.
   - Debounce input or search only on submit; do not send a request per keystroke.
   - Clearly handle no result, rate limit, offline, and invalid response cases.
   - Convert returned coordinates with the same world-origin math as local data.
*/

/* =========================================================
   11. PERFORMANCE AND QUALITY
   =========================================================

   FPS counter
   Approximate frames rendered per second. Sustained drops usually mean too many
   draw calls, overly detailed geometry, excessive shadows, or expensive per-frame
   calculations.

   object/feature count
   Useful for comparing data builds and detecting missing or unexpectedly duplicated
   geometry.

   instancing
   Many repeated objects can share geometry/material in one draw call. Useful for
   trees, lights, or similar props.

   merging geometry
   Static features sharing a material can be combined to reduce draw calls, at the
   cost of making individual editing/culling harder.

   level of detail
   Use simpler geometry at distance. This improves performance but requires smooth
   transitions to avoid visible popping.

   frustum culling
   Renderer skips objects outside the camera's view. Incorrect bounding volumes can
   cause visible objects to disappear early.

   pixel ratio
   High phone pixel ratios sharply increase rendered pixels. Capping renderer pixel
   ratio can improve mobile FPS while slightly reducing sharpness.
*/

/* =========================================================
   12. SAFE TEST CHECKLIST
   =========================================================

   DATA:
   - Prepared manifest/OSM loads.
   - Missing prepared data falls back to live service.
   - Local terrain loads; missing local tile falls back remotely.
   - Loading progress reaches completion without hanging.

   GEOMETRY:
   - Roads align with buildings and terrain.
   - Bridges/water/parks are not vertically buried or floating unexpectedly.
   - City is not mirrored or rotated relative to known landmarks.

   CONTROLS:
   - Pointer-look capture and release.
   - WASD, Q/E, Shift.
   - Touch movement and altitude buttons release correctly.
   - Fly and Map modes transition safely.

   INTERFACE:
   - Search known landmark, unknown place, and network failure.
   - Landmark quick travel.
   - Dusk/time appearance.
   - Sound toggle.
   - Dialog close controls and keyboard accessibility.

   PERFORMANCE:
   - Desktop and mobile FPS.
   - Browser resize/orientation.
   - Device pixel ratio.
   - Long flight across dataset edges.
   - No runaway object creation after mode/search changes.
*/
