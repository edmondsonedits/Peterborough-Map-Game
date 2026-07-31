/* =========================================================
   SHARED DISPATCH EDITOR — BEGINNER CODE MAP (v1.5.3)

   THIS FILE IS COMMENT-ONLY.
   It explains dispatch-editor/index.html and changes no runtime behaviour.
   ========================================================= */

/* =========================================================
   1. PURPOSE AND PLAYER/EDITOR EXPERIENCE
   =========================================================

   This developer-only tool manages one dispatch-location database used by the
   response simulator and Geo Guesser. It can search/filter calls, hide records
   already confirmed, select a marker, drag it, edit fields, add a call by tapping
   the map, delete a call, mark accuracy confirmed, and export permanent source.

   IMPORTANT IDEA:
   The editor works on a shared record shape. A change must remain compatible with
   every game that reads main, sub, name, addr, lat, lng, radius, district,
   cityTen, confirmed, custom, sources, and id.
*/

/* =========================================================
   2. ACCESS CHECK
   =========================================================

   The small script in <head> checks localStorage for
   ptbo-emergency-developer-mode === 'enabled'. Otherwise it returns to the main
   launcher.

   WHY IT EXISTS:
   Normal players should not accidentally open data-management controls.

   LIMITATION:
   localStorage is a user-interface gate, not secure server authorization. The
   repository and public data remain inspectable because the game is client-side.
*/

/* =========================================================
   3. IMPORTANT STATE
   =========================================================

   locations
   Working copy of every dispatch record currently loaded from the shared store.

   markers
   A Map keyed by record id. Each entry points to its Leaflet marker.

   selectedId
   Id of the record currently open in the edit form.

   preview
   Temporary Leaflet circle showing the selected target radius.

   placing
   True after Add Call/Add on Map and before the next map click.

   saveTimer
   Timeout used to return the temporary save-status message to the number of
   records still awaiting confirmation.

   map
   Leaflet map used to view, add, and drag locations.

   layer
   One LayerGroup containing all currently visible record markers.

   subcategories
   Allowed call-type strings grouped under Fire and Medical. Exact text must
   match the games' filter values and dispatch records.
*/

/* =========================================================
   4. GEOGRAPHIC HELPERS
   ========================================================= */

/*
FUNCTION: distance

WHAT THE CODE DOES:
Uses the haversine formula to calculate metres between two coordinate pairs.

WHY IT EXISTS:
Geographic coordinates are on a curved earth. The result is used for station
assignment rather than relying on screen pixels or current map zoom.
*/

/*
FUNCTION: nearestDistrict

WHAT THE CODE DOES:
Measures a location against all stations and returns the closest station number.

PLAYER CONNECTION:
New or moved calls receive a sensible default station district automatically.

SAFE EDITING:
The station array order currently corresponds to district numbers 1, 2, and 3.
*/

/* =========================================================
   5. SMALL INTERFACE HELPERS
   ========================================================= */

/*
FUNCTION: status

WHAT THE CODE DOES:
Shows a temporary save/action message, then after 2.4 seconds returns to a summary
of unconfirmed records.

WHY clearTimeout:
A new action should replace the older scheduled message instead of several
messages changing the status out of order.
*/

/*
FUNCTION: icon

WHAT THE CODE DOES:
Creates a small Leaflet DivIcon whose colour shows Fire or Medical and whose
outline shows confirmed accuracy.
*/

/*
FUNCTION: activeSubs

WHAT THE CODE DOES:
Returns allowed subcategories for one division or collects unique subcategories
from the current database when no division is selected.
*/

/*
FUNCTION: updateSubSelect

WHAT THE CODE DOES:
Rebuilds a select menu from valid subcategories and preserves a requested value
when it is still available.
*/

/*
FUNCTION: escapeHtml

WHAT THE CODE DOES:
Converts data text into safe HTML entities before inserting it into generated
list/option markup.
*/

/* =========================================================
   6. FILTERING AND RENDERING
   ========================================================= */

/*
FUNCTION: filtered

WHAT THE CODE DOES:
Returns records matching four independent controls:
- hide confirmed;
- selected main division;
- selected subcategory;
- text found in name, address, main, or sub.

WHY ONE FUNCTION:
The list, marker layer, count, and Show Visible button must all use the same
interpretation of “visible.”
*/

/*
FUNCTION: refreshFilters

WHAT THE CODE DOES:
Rebuilds the Call Type filter after Division changes and preserves the previous
subcategory only if it remains valid.
*/

/*
FUNCTION: render

WHAT THE PLAYER/EDITOR EXPERIENCES:
The sidebar list and map markers always match active filters and current data.

WHAT THE CODE DOES:
1. Clears old markers and marker references.
2. Calculates visible, pending, and confirmed counts.
3. Builds safe HTML for every visible call.
4. Creates draggable markers with status-aware icons/tooltips.
5. Connects marker clicks to select().
6. On drag, updates coordinates/district, resets confirmation, commits, and
   refreshes an open editor.
7. Connects sidebar buttons to the same select() function.

WHY confirmation RESETS AFTER DRAG:
Moving coordinates invalidates the earlier accuracy check. The editor requires a
new review instead of keeping a misleading confirmed flag.
*/

/* =========================================================
   7. RECORD SELECTION AND EDITING
   ========================================================= */

/*
FUNCTION: select

WHAT THE CODE DOES:
Finds one record by id, fills every form field, opens the editor, draws a radius
preview, optionally pans/zooms to the location, and refreshes active highlighting.

WHY id INSTEAD OF ARRAY INDEX:
Filtering and deleting can change array positions. Stable ids continue to point
to the intended record.
*/

/*
FUNCTION: closeEditor

WHAT THE CODE DOES:
Clears selectedId, hides the form, removes the temporary radius circle, and
rerenders list/markers without an active selection.
*/

/*
FUNCTION: commit

WHAT THE CODE DOES:
Passes the full working array through store.replaceAll(), accepts the normalized
returned data, rerenders, and shows a status message.

WHY IT MATTERS:
This is the central save path. Both games read the same shared-store output, so
editing functions should call commit rather than maintaining separate copies.
*/

/* =========================================================
   8. ADDING A CALL ON THE MAP
   ========================================================= */

/*
FUNCTION: beginPlacement

WHAT THE CODE DOES:
Enables placement mode, highlights the Add on Map button, shows instructions, and
updates status.
*/

/*
FUNCTION: endPlacement

WHAT THE CODE DOES:
Clears placement mode and its visual indicators.
*/

/*
FUNCTION: addAt

WHAT THE CODE DOES:
Creates a complete default Fire/Structure Fire record at the clicked coordinates,
rounds coordinates to six decimals, assigns nearest district, creates a stable id,
adds it, commits, exits placement mode, and opens the new record.

WHY confirmed STARTS FALSE:
A newly clicked point has not yet been checked against an authoritative location.
*/

/* =========================================================
   9. FORM SUBMISSION
   =========================================================

   The editor submit handler:
   1. Prevents normal page navigation.
   2. Finds the selected record.
   3. Creates an “original signature” of location-defining fields.
   4. Copies form values into the record.
   5. Clamps radius to at least 10 metres.
   6. Rejects invalid latitude/longitude.
   7. Creates a new signature.
   8. Determines whether confirmation should remain/reset.
   9. Commits and either closes a now-hidden confirmed record or reselects it.

   SIGNATURE PURPOSE:
   It provides a simple way to detect whether meaningful location information
   changed without comparing each field in a long condition.

   SAFE EDITING:
   If a new field affects real-world accuracy, include it in both signatures so
   editing it can require reconfirmation.
*/

/* =========================================================
   10. DELETING AND EXPORTING
   =========================================================

   Delete Call:
   - asks for confirmation containing the selected name;
   - removes the matching id;
   - commits the entire array;
   - closes the editor.

   FUNCTION: downloadSource
   - requests export text from the shared store;
   - creates a JavaScript Blob;
   - creates a temporary object URL;
   - clicks a temporary download link;
   - revokes the URL after use.

   Copy Source:
   - uses the Clipboard API when permitted;
   - falls back to a prompt when clipboard access fails.

   WHY EXPORT EXISTS:
   Browser storage can preserve local edits, but a permanent project update needs
   source data that can be reviewed and committed to GitHub.
*/

/* =========================================================
   11. STARTUP
   =========================================================

   store.ready()
   Waits for the shared dispatch store to load and combine its data sources.

   On success:
   - copies records into editor-owned objects;
   - normalizes confirmed to Boolean;
   - fills missing district from nearest station;
   - refreshes filters and rendering;
   - shows pending count;
   - fits the map to visible calls.

   On failure:
   - logs the error;
   - displays the error message in the persistent status bubble.
*/

/* =========================================================
   12. SAFE TEST CHECKLIST
   =========================================================

   - Developer mode redirects correctly when off and opens when enabled.
   - Search works for name, address, division, and call type.
   - Division/subcategory filters remain synchronized.
   - Hide Confirmed updates list, markers, counts, selection, and map fit.
   - Add Call and Add on Map enter/exit placement correctly.
   - Dragging updates coordinates/district and resets confirmation.
   - Radius preview follows form changes.
   - Saving updates both games through the shared store.
   - Invalid coordinates are rejected.
   - Confirmed records visibly change and can be hidden.
   - Delete removes exactly one intended id.
   - Download and copy export complete current data.
   - Desktop sidebar and mobile bottom-sheet layouts remain usable.
*/
