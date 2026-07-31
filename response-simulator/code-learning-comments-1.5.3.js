/* =========================================================
   RESPONSE SIMULATOR — BEGINNER CODE MAP (v1.5.3)

   THIS FILE IS INTENTIONALLY COMMENT-ONLY.
   It runs no instructions and changes no gameplay. It is a readable map of the
   simulator's larger source files, important variables, functions, settings,
   dependencies, and player effects.
   ========================================================= */

/* =========================================================
   1. FILE MAP
   =========================================================

   index.html
   - Builds the desktop interface and Options panel.
   - Creates the Leaflet map and truck marker.
   - Contains the original dispatch records used as a fallback.
   - Runs the base movement loop.
   - Starts dispatches, measures arrival distance, and completes calls.

   mobile/index.html
   - Embeds index.html inside an iframe.
   - Adds touch steering, gas, reverse, stations, siren, sound, Options, and
     Recenter controls above the embedded simulator.
   - Waits for startup verification before removing the loading cover.

   vehicle-instruments.js
   - Startup loader for steering-related modules.
   - Retries the required steering core and gracefully handles optional modules.

   vehicle-instruments-core.js
   - Translates keyboard or analog input into shared steering state.
   - Calculates display speed from the base simulator's movement value.
   - Exposes a public API used by the mobile wrapper and handling systems.

   arcade-handling-1.5.1.js
   - Contains Classic, Tight City, Heavy Truck, and Custom handling values.
   - Changes steering response based on speed.
   - Applies cornering speed assistance.
   - Adds live tuning controls to Options and saves them in the browser.
   - The filename remains at its original feature version for compatibility.

   directional-steering-tuning.js
   - Supports a direction-pointing thumbstick mode.
   - Converts finger position into a target compass heading.
   - Holds the chosen heading when the player releases the stick.

   road-collision.js
   - Loads prepared road geometry.
   - Finds nearby road segments.
   - Detects whether the truck is leaving valid road space.
   - Applies boundary resistance and optional lane-centre assistance.

   arcade-mobile-camera-1.5.3.js
   - Mobile-only whole-number speed zoom.
   - Uses speed bands, delays, and extra tile buffering to prevent flicker.

   settings-menu-compact-1.5.3.js
   - Moves the existing incident checkboxes into a collapsed section.
   - Preserves the original checkbox elements read by dispatch selection.

   simulator-readiness-1.4.5.js
   - Keeps loading active until map, steering, roads, settings, and mobile camera
     systems are ready.
   - The filename is retained for compatibility; its internal release is v1.5.3.

   route-compare-1.4.2.js
   - Records the player's route while responding.
   - Requests or builds a suggested route.
   - Draws both paths and prepares comparison information.

   route-review-ui-1.4.3.js
   - Creates the Compare Route button, legend, compact mobile review layout, and
     exit behaviour after a completed dispatch.
*/

/* =========================================================
   2. MAIN GAME STATE — THE SIMULATOR'S MEMORY
   =========================================================

   simulationState
   Stores the current stage of the emergency response:
   INACTIVE -> ENROUTE -> ONSCENE -> INSERVICE.

   PLAYER CONNECTION:
   This stage decides what the main button says, whether the timer runs, whether
   arrival is checked, and whether the next call can begin.

   simLat / simLng
   The truck's current latitude and longitude.

   PLAYER CONNECTION:
   Changing these numbers moves the truck marker across Peterborough.

   velocity
   The truck's signed movement amount.
   Positive = forward. Negative = reverse. Zero = stopped.

   currentHeading
   Compass direction in degrees.
   0 = north, 90 = east, 180 = south, 270 = west.

   keys
   Remembers which keyboard directions are currently held. The mobile wrapper
   can send equivalent events, so the same base movement code works on phones.

   lastTimestamp
   Time of the previous animation frame. Used to understand elapsed time and to
   prevent frame-rate differences from changing game feel in newer modules.

   mapInstance
   The Leaflet map object. It owns zoom, centre, layers, controls, distance
   calculations, events, and conversion between coordinates and screen pixels.

   vehicleMarker
   The Leaflet marker containing the fire-truck SVG.

   tileLayerInstance
   The active set of raster map tiles, such as OpenStreetMap or CartoDB.

   activeIncident
   The dispatch record currently assigned to the player.

   incidentCircleMarker
   The visible arrival circle around the active call.

   dispatchStartedAt / elapsedMilliseconds / stopwatchInterval
   Values used to time the response and update the HUD.

   totalTrackedCalls
   Number of completed calls saved in localStorage on the current device.

   allLocationsLayerGroup / allLocationsVisible
   State for the optional map overlay that displays every dispatch location.
*/

/* =========================================================
   3. DISPATCH RECORD FORMAT
   =========================================================

   A dispatch record resembles:

   {
     main: "Fire",
     sub: "Structure Fire",
     name: "Example Building",
     addr: "123 Example St",
     lat: 44.000000,
     lng: -78.000000
   }

   main
   Broad family used for visual colouring and organization.

   sub
   Exact incident type matched against the Options checkboxes.

   name
   Place or property name shown in the HUD and spoken dispatch.

   addr
   Address or intersection shown and spoken to the player.

   lat / lng
   Exact map destination used to draw the arrival circle and calculate distance.

   SAFE EDITING:
   Do not rename these fields in only one file. The simulator, Geo Guesser,
   dispatch editor, shared data store, markers, speech, and route tools all rely
   on the same record shape.
*/

/* =========================================================
   4. BASE SETTINGS IN index.html
   =========================================================

   Chassis Base Scale (sld-size)
   Controls the truck marker's displayed size.

   INCREASE:
   Truck is easier to see but may cover more streets and intersections.

   DECREASE:
   Truck obstructs less map detail but becomes harder to see on a phone.

   Max Speed Handling (sld-speed)
   Feeds the older base movement model's maximum speed and acceleration.

   INCREASE:
   Faster acceleration and higher possible speed. Corners become harder and
   collision/lane-assist systems have more work to do.

   DECREASE:
   Slower, easier driving with longer response times.

   Emergency Flashing Matrix (chk-siren)
   Adds the siren-active class that starts red/blue SVG light animations.

   Lock Camera Focus to Chassis (chk-camera)
   When enabled, the map follows the moving truck.

   Map Layer (layer-select)
   Changes only the source and appearance of map tiles. It does not change road
   geometry, truck coordinates, dispatch locations, scoring, or boundaries.
*/

/* =========================================================
   5. MAIN FUNCTIONS IN index.html
   ========================================================= */

/*
FUNCTION: initializeSimulator

WHAT THE PLAYER EXPERIENCES:
The Peterborough map appears with the truck, scale control, and chosen basemap.

WHAT THE CODE DOES:
Creates Leaflet with starting coordinates and zoom limits, positions controls,
connects map orientation events, loads tiles, creates the truck, starts the
animation loop, and later asks Leaflet to verify its visible size.

WHY IT EXISTS:
Every later function assumes a valid map and truck marker already exist.

SAFE EDITING:
Test desktop and mobile cold starts, map controls, station spawning, and the
readiness loading cover after changing initialization order.
*/

/*
FUNCTION: toggleHeadingUp

WHAT THE CODE DOES:
Forces heading-up mode off in the current production base and refreshes visual
orientation.

WHY IT EXISTS:
Older camera experiments used rotating-map behaviour. Keeping one controlled
entry point avoids stale UI calling missing logic.
*/

/*
FUNCTION: updateMapOrientation

WHAT THE CODE DOES:
Finds the map pane, calculates map rotation from currentHeading when enabled,
places the rotation pivot at the truck's current screen point, and rotates the
compass needle by the same amount.

WHY IT EXISTS:
The truck, map, and compass must agree about direction.

TECHNICAL NOTE:
latLngToLayerPoint converts geographic coordinates into the map pane's internal
pixel coordinates. Rotation origin must be in that same coordinate system.
*/

/*
FUNCTION: togglePanel

WHAT THE PLAYER EXPERIENCES:
Options slides into or out of view and the button changes between Options Menu
and Close Options.

WHAT THE CODE DOES:
Toggles a CSS class, updates button text, and calls map.invalidateSize() after
the panel transition.

WHY invalidateSize IS NEEDED:
Leaflet caches its visible dimensions. A side panel changes available width; the
map must recalculate or tiles/centre can appear offset.
*/

/*
FUNCTION: changeBasemap

WHAT THE CODE DOES:
Removes the existing tile layer, selects a provider configuration, creates a new
Leaflet tile layer, applies buffering/native-zoom rules, and adds it to the map.

PLAYER CONNECTION:
This changes visual style only.

SAFE EDITING:
A provider URL must support the requested zooms and attribution requirements.
Mobile camera code reapplies tile optimizations after the layer changes.
*/

/*
FUNCTION: toggleAllLocations

WHAT THE PLAYER EXPERIENCES:
Every dispatch location appears as a coloured draggable dot, or the overlay is
removed.

WHAT THE CODE DOES:
Creates or clears one LayerGroup, loops through dispatch records, creates marker
icons, binds informational popups, and writes moved coordinates back after drag.

WHY A LayerGroup:
One group lets the game show/hide hundreds of markers with a single map action.

EDITING WARNING:
This is an editing/diagnostic feature. Accidentally dragging a marker changes the
in-memory record until the page is reloaded or data is exported.
*/

/*
FUNCTION: updateVehiclePhysics

WHAT THE CODE DOES:
Refreshes the visible numeric label beside the speed slider.

IMPORTANT LIMITATION:
The actual base movement loop reads the slider directly each frame. This helper
updates presentation; it does not independently calculate vehicle physics.
*/

/*
FUNCTION: teleportToStation

WHAT THE PLAYER EXPERIENCES:
The truck instantly moves to the chosen station and stops.

WHAT THE CODE DOES:
Replaces coordinates, clears velocity, updates telemetry and marker position,
recentres/invalidate the map, and rechecks incident distance if responding.

WHY velocity IS RESET:
Without clearing it, a newly teleported truck would immediately continue moving
in the direction and speed held before teleporting.
*/

/*
FUNCTION: recordCurrentLocation

WHAT THE CODE DOES:
Prompts for incident family, subcategory, name, and address; combines those values
with the truck's current coordinates; and appends a record to the database.

PLAYER CONNECTION:
The truck becomes a map-positioning cursor for creating a new dispatch.

SAFE EDITING:
Prompts can return null when cancelled. Every step checks for cancellation before
creating incomplete data.
*/

/*
FUNCTION: exportUpdatedDatabase

WHAT THE CODE DOES:
Turns current dispatch records into formatted source text or a downloadable data
representation so coordinate edits can be preserved outside the running page.

WHY IT EXISTS:
Browser memory is temporary. Export converts live editing work into maintainable
source data.
*/

/*
FUNCTION: updateVehicleChassis

WHAT THE PLAYER EXPERIENCES:
Truck size and emergency-light animation update immediately.

WHAT THE CODE DOES:
Reads size/siren controls, generates the inline SVG and CSS classes, creates a
Leaflet DivIcon, then creates or updates vehicleMarker.

TECHNICAL TERM — DivIcon:
A Leaflet marker whose visual content is HTML/SVG instead of a fixed image file.
*/

/*
FUNCTION: simulationLoop

WHAT THE PLAYER EXPERIENCES:
Acceleration, braking, steering, reverse steering, truck movement, map following,
telemetry, and continuous arrival checking.

WHAT THE CODE DOES EACH FRAME:
1. Reads the speed slider.
2. Calculates maximum speed, acceleration, friction, and base turn rate.
3. Applies forward/reverse input.
4. Applies friction and stops tiny movement values.
5. Chooses a turn rate based on movement speed and direction.
6. Changes heading from left/right input.
7. Converts heading to latitude/longitude movement.
8. Rotates and moves the truck marker.
9. Follows the truck when camera lock is enabled.
10. Updates arrival distance and telemetry.
11. Requests the next animation frame.

IMPORTANT MATH:
cos(heading) controls north/south movement.
sin(heading) controls east/west movement.
Longitude is divided by cos(latitude) because longitude degrees become physically
narrower away from the equator.

SAFE EDITING:
This older loop is also wrapped or corrected by road-collision and arcade
handling modules. Test those dependencies before removing apparently duplicated
steering or movement work.
*/

/*
FUNCTION: releaseDrivingInput

WHAT THE CODE DOES:
Clears every keyboard direction and sets velocity to zero when the page loses
focus or becomes hidden.

WHY IT EXISTS:
A keyup event can be missed during app switching. Without this reset, the truck
could continue driving after the player returns.
*/

/*
FUNCTION: playDispatchAudioText

WHAT THE CODE DOES:
Cancels previous browser speech, creates a SpeechSynthesisUtterance, adjusts rate
and pitch, and speaks the dispatch phrase.

FALLBACK:
The try/catch prevents unavailable or failing speech synthesis from stopping the
dispatch itself.
*/

/*
FUNCTION: triggerDispatchWorkflow

WHAT THE CODE DOES:
Starts a random call only when the simulator is INACTIVE or back INSERVICE.

WHY IT EXISTS:
It is a small gate between the HUD button and the larger dispatch function,
preventing a new incident from replacing an active response.
*/

/*
FUNCTION: fireRandomIncidentDispatch

WHAT THE PLAYER EXPERIENCES:
A selected call type, destination, timer, map circle, and spoken dispatch begin.

WHAT THE CODE DOES:
1. Reads checked incident filters.
2. Refuses to start when none are enabled.
3. Filters the database by exact subcategory text.
4. Randomly selects one matching record.
5. Removes the previous incident circle and draws the new one.
6. Changes state to ENROUTE and starts timing.
7. Rebuilds HUD text and disables the Start button.
8. Speaks the dispatch.

DEPENDENCY WARNING:
Checkbox data-sub values must exactly match dispatch record sub values.
*/

/*
FUNCTION: executeIncidentArrivalProcedures

WHAT THE PLAYER EXPERIENCES:
The timer stops, the HUD confirms arrival, the incident marker turns green, and
after a delay the crew becomes available for Next Call.

WHAT THE CODE DOES:
Stops timing, stores final elapsed time, changes state to ONSCENE, updates visual
feedback, then changes to INSERVICE and increments the saved completion count.

WHY THE DELAY:
The player receives a visible on-scene confirmation before the interface changes
to the next-call state.
*/

/*
FUNCTION: evaluateDistanceToTarget

WHAT THE CODE DOES:
Uses Leaflet's geographic distance calculation between truck and active incident,
updates telemetry, and completes the call at 40 metres or less.

INCREASE ARRIVAL RADIUS:
Easier completion and less exact positioning, but may mark arrival on a nearby
street or property.

DECREASE ARRIVAL RADIUS:
More precise navigation, but can frustrate players when map coordinates or road
boundaries prevent reaching the exact point.
*/

/* =========================================================
   6. ARCADE HANDLING SETTINGS
   =========================================================

   responseMs
   Milliseconds used to smooth steering response.
   LOWER: faster, sharper response.
   HIGHER: heavier and more delayed response.

   lowSpeedTurnRate
   Maximum degrees per second near low speed.
   HIGHER: tighter station exits and city corners.
   LOWER: wider, slower low-speed steering.

   highSpeedTurnRate
   Degrees per second near the configured high-speed reference.
   HIGHER: more ability to turn fast, with greater crash risk.
   LOWER: safer/stabler highways but harder emergency corrections.

   highSpeedReferenceKmh
   Speed at which steering has fully transitioned to highSpeedTurnRate.
   LOWER: steering becomes heavy sooner.
   HIGHER: low-speed sharpness remains longer.

   steeringCurve
   Shapes partial analog input.
   BELOW 1: small movements become stronger.
   ABOVE 1: centre movement becomes gentler; full input still reaches maximum.

   cornerAssist
   Percentage strength of automatic speed damping during demanding fast turns.
   HIGHER: easier corners, more automatic slowing.
   LOWER: more manual skill and more overshoot risk.

   zoomOutLevels
   Maximum number of wider camera levels at speed.
   HIGHER: more road visible, more tile/data use.
   LOWER: closer truck view, less route preview.

   cameraLookAheadMeters
   Older camera centre offset. Hidden on mobile v1.5.3 because the stable mobile
   camera avoids per-frame look-ahead movement.
*/

/* =========================================================
   7. ROAD COLLISION AND LANE ASSIST — CONCEPTUAL FLOW
   =========================================================

   PREPARED ROAD DATA:
   Offline geospatial tools turn road lines into smaller segments with widths,
   intersection information, and search data. The browser should not perform all
   of that expensive preparation during gameplay.

   NEARBY-SEGMENT SEARCH:
   Only road segments around the truck are considered. Checking every road in
   Peterborough every frame would waste processing time.

   CLOSEST-POINT CALCULATION:
   For each nearby line segment, the code finds the point on that line nearest to
   the truck. Distance to this point estimates lane/road position.

   ROAD BOUNDARY:
   Road width plus intersection smoothing determines how far the truck may move
   from a road centreline before resistance or correction applies.

   LANE ASSIST:
   Adds a gentle direction toward the valid road area. A stronger value makes
   driving easier but can feel like the truck is being pulled.

   ROUNDED INTERSECTIONS:
   Intersections need extra valid space because two or more road corridors meet.
   Without smoothing, a truck can be rejected while correctly turning through a
   corner.

   SAFE EDITING:
   Test narrow roads, wide arterials, diagonal roads, T intersections, four-way
   intersections, station driveways, reverse movement, and high-speed entry.
*/

/* =========================================================
   8. MOBILE CAMERA — WHY THE SPEED BANDS WORK
   =========================================================

   PROBLEM:
   Raster maps are collections of image tiles. Continuously changing fractional
   zoom can force Leaflet to rescale old tiles, request new tiles, replace tile
   containers, and reveal the map background between loads. Mobile graphics and
   slower connections make that visible as lag or black flicker.

   SOLUTION:
   - whole-number zoom levels;
   - separate enter and exit speeds;
   - speed must stay in a band before changing;
   - minimum interval between changes;
   - animations disabled for these changes;
   - extra off-screen tile buffer;
   - matching temporary map background;
   - old fractional camera pass suppressed.

   RESULT:
   The camera still widens with speed, but expensive tile-level changes are rare
   and predictable rather than occurring during nearly every acceleration frame.
*/

/* =========================================================
   9. ROUTE REVIEW — CONCEPTUAL FLOW
   =========================================================

   RECORDING:
   While ENROUTE, truck positions are sampled and stored as the player's path.

   CLEANUP:
   Very close consecutive points can be omitted so the route does not contain
   thousands of visually identical coordinates.

   SUGGESTED ROUTE:
   A routing service or prepared route logic produces an efficient road path from
   the chosen station/start to the active incident.

   DRAWING:
   Player and suggested paths are drawn as separate polylines with low opacity so
   streets remain readable beneath them.

   FITTING:
   Leaflet fitBounds chooses a map view that includes both routes.

   MOBILE REVIEW:
   Driving controls are hidden temporarily so route information has enough screen
   space and accidental input cannot move the truck during review.

   SAFE EDITING:
   Complete a full call before testing. Check Compare Route visibility, both line
   colours, opacity, map fitting, close/exit, and Next Call restoration.
*/

/* =========================================================
   10. STARTUP DEPENDENCY ORDER
   =========================================================

   BASE HTML LOADS
       ↓
   Leaflet creates mapInstance and simulationLoop exists
       ↓
   simulator-readiness loads vehicle-instruments + road-collision + compact menu
       ↓
   vehicle-instruments loads steering core
       ↓
   optional directional steering + arcade handling + mobile camera load
       ↓
   road data finishes and wraps the original movement loop
       ↓
   mobile wrapper confirms touch steering connection
       ↓
   all readiness checks resolve
       ↓
   loading cover disappears

   WHY THIS MATTERS:
   A file appearing in the page does not guarantee its setup completed. The game
   checks actual public methods, state flags, and wrapped-loop references before
   allowing play.
*/

/* =========================================================
   11. SAFE CHANGE CHECKLIST
   =========================================================

   AFTER STEERING CHANGES:
   - Desktop arrow keys and WASD.
   - Mobile analog wheel.
   - Directional thumbstick if enabled.
   - Forward and reverse steering direction.
   - Release, cancel, blur, and app switching.
   - Tight low-speed corner and high-speed correction.

   AFTER SPEED/PHYSICS CHANGES:
   - Acceleration, braking, friction, full speed.
   - Corner assist.
   - Road-boundary behaviour.
   - Speedometer conversion.
   - Mobile camera thresholds.

   AFTER MAP/CAMERA CHANGES:
   - Desktop and mobile.
   - Every basemap.
   - Manual zoom while stopped.
   - Recenter.
   - Speed up and slow down repeatedly.
   - Options open/close resize.
   - No black gaps or alternating camera centres.

   AFTER DISPATCH-DATA CHANGES:
   - Incident filter exact matches.
   - Spoken phrase.
   - Marker/circle position.
   - Arrival radius.
   - Geo Guesser and editor compatibility.
   - Shared-store persistence and export.

   AFTER STARTUP CHANGES:
   - Normal reload.
   - First/cold load.
   - Slow network simulation.
   - Failed module and Refresh recovery.
   - Version badges.
   - No duplicated scripts or event listeners.
*/
