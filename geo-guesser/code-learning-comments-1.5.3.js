/* =========================================================
   PETERBOROUGH GEO GUESSER — BEGINNER CODE MAP (v1.5.3)

   THIS FILE IS COMMENT-ONLY.
   It explains the larger geo-guesser/index.html source without changing the
   game. The browser ignores all text in this file.
   ========================================================= */

/* =========================================================
   1. WHAT THE GAME DOES
   =========================================================

   The player chooses a mode and starting fire station, reads a dispatch, moves
   the map so the centre reticle marks a guess, confirms, and reviews the actual
   target. Random Shift and The City Ten measure total time plus distance-based
   penalties. Open Drill continues with practice feedback and no time penalty.

   The same page also contains:
   - call-type filters saved in localStorage;
   - local score history;
   - a developer-only location/radius editor;
   - desktop and responsive mobile layouts.
*/

/* =========================================================
   2. IMPORTANT DATA
   =========================================================

   stations
   The three starting stations. Their coordinates determine the opening map view
   and influence which calls count as local to each station district.

   locations
   Dispatch records. Each record contains:
   main, sub, name, addr, lat, lng, radius, district, cityTen.

   radius
   Acceptable target radius in metres. A guess inside it receives no distance
   penalty. A larger radius is more forgiving; a smaller radius requires greater
   map precision.

   cityTenStarter
   Names used to initialize the ten featured locations when old data has no
   explicit cityTen flag.

   map / editorMap
   Separate Leaflet maps for normal guessing and developer editing.

   targets
   Ordered calls selected for the current drill.

   index / target
   Current position in targets and the active call record.

   elapsed / interval / timerStartedAt
   Timer memory. performance.now() provides stable elapsed time.

   history
   One result object per confirmed guess. Used to build the final breakdown.

   processing
   Prevents double confirmation while the answer review is active.

   gameMode
   'random', 'city-ten', or 'open'. This changes call selection, timer, progress,
   completion rules, and feedback wording.
*/

/* =========================================================
   3. CALL SELECTION FUNCTIONS
   ========================================================= */

/*
FUNCTION: nearestDistrict

WHAT THE CODE DOES:
Measures a location's distance to all three stations and returns the number of
the closest station.

WHY IT EXISTS:
Records without a valid district can be assigned automatically, and Random Shift
can favour calls local to the chosen station.
*/

/*
FUNCTION: initializeDistricts

WHAT THE CODE DOES:
Repairs missing district values and missing cityTen flags before a game/editor
uses the records.

WHY IT EXISTS:
Older saved data may not contain fields introduced by newer versions. Adding safe
defaults lets it remain compatible.
*/

/*
FUNCTION: pickRandom

WHAT THE CODE DOES:
Removes and returns one random entry from a supplied array.

WHY REMOVE IT:
A call selected once cannot be selected again during the same drill.
*/

/*
FUNCTION: chooseCalls

WHAT THE CODE DOES:
Builds a list of unique calls. It usually prefers the chosen station's district
but can select calls elsewhere so the drill is not completely predictable.

IMPORTANT VALUE:
Math.random() < .75 means approximately 75% local preference when local calls are
available. Raising .75 makes drills more station-specific; lowering it spreads
calls more evenly across the city.
*/

/* =========================================================
   4. SCREEN AND VISUAL FUNCTIONS
   ========================================================= */

/*
FUNCTION: show

WHAT THE CODE DOES:
Hides every .screen section, reveals the requested one, and asks Leaflet to
recalculate size when a map screen becomes visible.

WHY invalidateSize:
A hidden Leaflet map cannot correctly measure its container. It must recalculate
after being shown or tiles and centre can appear wrong.
*/

/*
FUNCTION: callStyle / applyCallTheme

WHAT THE CODE DOES:
Maps call types to a visual family and icon: water, MVC, medical, or fire. It then
applies matching classes and symbols to dispatch/header elements.

PLAYER CONNECTION:
Colour and icon provide a quick visual category before reading all text.
*/

/*
FUNCTION: drawProgress

WHAT THE CODE DOES:
Builds one progress dot per target. Finished dots, current dot, and future dots
receive different classes. Open Drill hides fixed-length progress.
*/

/* =========================================================
   5. CALL FILTER FUNCTIONS
   ========================================================= */

/*
FUNCTION: filterGroups

WHAT THE CODE DOES:
Collects unique Fire and Medical subcategories directly from location data.

WHY IT EXISTS:
The filter interface stays synchronized when call types are added to the data.
*/

/*
FUNCTION: enabledCallTypes

WHAT THE CODE DOES:
Reads selected types from localStorage, validates them against current data, and
falls back to every type if storage is missing or invalid.

SAFE EDITING:
Keep the storage data as an array of exact subcategory strings. Dispatch matching
uses exact equality.
*/

/*
FUNCTION: saveCallFilters / renderCallFilters / setAllFilters / resetCallFilters

WHAT THE CODE DOES:
Saves checkbox choices, creates the filter HTML, bulk-selects values, or removes
the saved override and restores all types.

PLAYER CONNECTION:
Only enabled subcategories can appear in Random Shift or Open Drill.
*/

/* =========================================================
   6. GAME FLOW FUNCTIONS
   ========================================================= */

/*
FUNCTION: selectMode

WHAT THE CODE DOES:
Stores the requested mode and advances to station selection.
*/

/*
FUNCTION: cityTenCalls

WHAT THE CODE DOES:
Filters records marked cityTen, sorts them in the intended teaching order, and
limits the result to ten.
*/

/*
FUNCTION: start

WHAT THE PLAYER EXPERIENCES:
The selected drill opens at the chosen station with a prepared first dispatch.

WHAT THE CODE DOES:
Validates filters/mode requirements, chooses targets, resets timers/history/review
state, creates Leaflet once if necessary, and calls prepareDispatch().

VALIDATION RULES:
- Random Shift requires at least ten eligible calls.
- The City Ten requires exactly ten marked records.
- Empty filters return the player to Call Filters.
*/

/*
FUNCTION: drawTimer

WHAT THE CODE DOES:
Writes mode/call progress and elapsed time. Open Drill displays call number but no
competitive timer.
*/

/*
FUNCTION: loadCall

WHAT THE CODE DOES:
Copies the current target into visible header fields, applies its theme, resets
the map to the station at zoom 15, and refreshes timer/progress.
*/

/*
FUNCTION: prepareDispatch

WHAT THE PLAYER EXPERIENCES:
A dispatch card appears before guessing begins.

WHAT THE CODE DOES:
Sets the active target and station view, writes call/mode details, shows the
card, and hides reticle/confirm controls until Start is pressed.
*/

/*
FUNCTION: startDispatch

WHAT THE CODE DOES:
Hides the dispatch card, shows guessing controls, loads the call, and starts a
100 ms timer interval for competitive modes.
*/

/*
FUNCTION: meters

WHAT THE CODE DOES:
Uses the haversine formula to calculate curved-earth distance between two
latitude/longitude positions in metres.

WHY NOT SIMPLE PIXEL DISTANCE:
Map zoom changes screen distance, while geographic distance remains consistent.
*/

/*
FUNCTION: confirmGuess

WHAT THE PLAYER EXPERIENCES:
The guess locks, actual location/radius appear, a line joins guess to target, map
fits both, and distance/penalty feedback is shown until Next Call.

WHAT THE CODE DOES:
1. Prevents duplicate confirmation.
2. Stops the timer.
3. Reads the map centre as the guess.
4. Calculates metres, feet, target radius, and distance outside the radius.
5. Adds a time penalty in competitive modes.
6. Stores a history record.
7. Builds a review LayerGroup containing line, target circle, and labelled points.
8. Calls fitBounds with padding so overlays do not cover important points.

PENALTY FORMULA:
Math.min(60, outsideFeet / 10).
Every 10 feet outside adds one second, capped at 60 seconds.
*/

/*
FUNCTION: clearReviewLayers

WHAT THE CODE DOES:
Removes the temporary answer line, circles, and labels together.

WHY A LayerGroup:
The full review can be cleared with one operation when Next Call is pressed.
*/

/*
FUNCTION: continueAfterReview

WHAT THE CODE DOES:
Clears answer review, advances the call index, adds a newly chosen call for Open
Drill, then prepares the next dispatch or ends the session.
*/

/*
FUNCTION: endOpenDrill / returnToMenu / endGame

WHAT THE CODE DOES:
Stops timing and review safely, updates session state, navigates to the correct
screen, and builds the final result breakdown from history.
*/

/* =========================================================
   7. LOCAL SCORE FUNCTIONS
   ========================================================= */

/*
FUNCTION: saveScore

WHAT THE CODE DOES:
Reads existing local scores, adds the player's name/time/mode, sorts fastest
first, saves the array, and opens the score screen.

IMPORTANT LIMITATION:
These scores belong to one browser/device. They are not an online leaderboard.
*/

/*
FUNCTION: showScores

WHAT THE CODE DOES:
Safely reads local score data and creates ranked HTML. escapeHtml is used before
player-controlled text is inserted.
*/

/*
FUNCTION: escapeHtml

WHAT THE CODE DOES:
Lets the browser convert plain text into safe HTML entities.

WHY IT EXISTS:
Names and addresses may contain symbols that must not be interpreted as markup.
*/

/* =========================================================
   8. DEVELOPER LEVEL EDITOR FUNCTIONS
   ========================================================= */

/*
FUNCTION: openEditor

WHAT THE CODE DOES:
Checks developer mode, creates the editor Leaflet map once, lets map clicks add
records, and renders draggable markers.

SECURITY/PRODUCT NOTE:
The editor is hidden behind a local developer-mode setting, not server-side
authorization. It is suitable for controlling normal UI access, not protecting
sensitive data.
*/

/*
FUNCTION: renderEditor

WHAT THE CODE DOES:
Rebuilds draggable markers from location records and writes moved coordinates and
nearest district after drag.
*/

/*
FUNCTION: openEdit / previewRadius

WHAT THE CODE DOES:
Loads a record into form fields and draws a temporary circle showing the selected
target radius.
*/

/*
FUNCTION: applyEdit / deleteEdit / closeEdit

WHAT THE CODE DOES:
Writes form values back to the record, removes a record, or clears temporary
editing state and radius preview.
*/

/*
FUNCTION: exportData

WHAT THE CODE DOES:
Serializes the current location array as source code, copies it when clipboard
permission exists, and also displays it in a prompt as a fallback.
*/

/* =========================================================
   9. SAFE TEST CHECKLIST
   =========================================================

   AFTER CALL-SELECTION CHANGES:
   Test all three modes, all stations, limited filters, empty filters, fewer than
   ten eligible records, and exactly ten City Ten records.

   AFTER SCORING CHANGES:
   Test inside radius, just outside radius, very distant guess, 60-second cap,
   final total, Open Drill no-penalty wording, and local score sorting.

   AFTER MAP/REVIEW CHANGES:
   Test reticle centre, persistent feedback, line and labels, fitBounds on mobile,
   Next Call cleanup, and map size after changing screens.

   AFTER EDITOR CHANGES:
   Test adding, dragging, editing type/name/address/district/radius, City Ten count,
   deleting, exporting, cancelling, and reopening the normal game.
*/
