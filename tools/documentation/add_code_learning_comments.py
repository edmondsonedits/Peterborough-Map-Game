#!/usr/bin/env python3
"""Build the v1.5.3 beginner-friendly code-learning edition."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD = "1." + "5.2"
NEW = "1.5.3"
MARKER = "BEGINNER CODE GUIDE"
TEXT_EXT = {".html", ".js", ".css", ".py", ".md", ".json", ".yml", ".yaml", ".txt"}
SOURCE_EXT = {".html", ".js", ".css", ".py"}
SKIP = {".git", "node_modules", "vendor", "dist", "build", "__pycache__"}

PURPOSE = {
    "index.html": ("Main launcher for the Peterborough training games.", "The player chooses a game and sees the current release."),
    "city-explorer/index.html": ("Unscored map used to study Peterborough streets and landmarks.", "The player freely pans and zooms around the city."),
    "dispatch-editor/index.html": ("Editor for the shared emergency-call database.", "Call locations can be added, corrected, confirmed, filtered, or removed."),
    "geo-guesser/index.html": ("Desktop location-guessing game.", "The player reads a dispatch, places a guess, and receives distance and score feedback."),
    "geo-guesser/mobile/index.html": ("Touch-friendly Geo Guesser wrapper.", "The same game receives larger controls and a compact mobile layout."),
    "response-simulator/index.html": ("Core dispatch and fire-truck driving simulator.", "The player receives a call, drives from a station, reaches the incident, and reviews the route."),
    "response-simulator/mobile/index.html": ("Mobile control shell around the response simulator.", "Touch steering, pedals, station shortcuts, audio, and recenter controls operate the embedded game."),
    "shared/build-version.js": ("Shared production release label and error recorder.", "The visible badge identifies the build currently running."),
    "shared/dispatch-locations.js": ("Shared emergency address and coordinate records.", "These records determine which calls can appear."),
    "shared/stations.js": ("Shared fire-station names and coordinates.", "Desktop and mobile station buttons start at the same locations."),
    "response-simulator/arcade-handling-1.5.1.js": ("Arcade steering presets, turn rates, corner assist, and camera tuning.", "The truck feels responsive at low speed and controllable at high speed."),
    "response-simulator/vehicle-instruments.js": ("Loader connecting the steering core to optional handling and camera modules.", "Required controls are prepared before play begins."),
    "response-simulator/vehicle-instruments-core.js": ("Shared keyboard and analog steering-input system.", "Different control methods become one steering value used by the truck."),
    "response-simulator/directional-steering-tuning.js": ("Directional-thumbstick heading control.", "The player can point toward a desired direction instead of holding left or right."),
    "response-simulator/road-collision.js": ("Road boundaries and lane assistance.", "The truck is resisted or redirected when leaving mapped road space."),
    "response-simulator/route-compare-1.4.2.js": ("Records and compares driven and suggested routes.", "The player can review route efficiency after a call."),
    "response-simulator/route-review-ui-1.4.3.js": ("Post-call route-review interface.", "Readable controls and labels explain the two route lines."),
    "response-simulator/simulator-readiness-1.4.5.js": ("Startup gate for the map, steering, roads, settings, and mobile camera.", "The loading screen remains until required systems are ready."),
    "response-simulator/settings-menu-compact-1.5.3.js": ("Collapsible incident-type settings.", "The player can see filter status without keeping the long list open."),
    "response-simulator/arcade-mobile-camera-1.5.3.js": ("Stable mobile speed-camera controller.", "The map shows more road at speed without repeatedly flashing black."),
}

EXACT = {
    "initializeSimulator": ("Creates the Leaflet map, loads tiles, adds the truck, and starts the animation loop.", "It gathers separate systems into a playable simulator."),
    "simulationLoop": ("Runs every animation frame to read controls, change speed and heading, move the truck, and refresh the map.", "It is the simulator's heartbeat."),
    "changeBasemap": ("Replaces the current map tiles with the style selected in Options.", "Map appearance can change without restarting gameplay."),
    "updateMapOrientation": ("Keeps map rotation and the compass synchronized with truck heading.", "The map and truck must not appear to point in different directions."),
    "togglePanel": ("Opens or closes Options and asks Leaflet to recalculate map size.", "The map remains correctly drawn after the panel moves."),
    "fireRandomIncidentDispatch": ("Filters enabled call types, chooses one incident, marks it, starts timing, and speaks the dispatch.", "Filter choices become the next emergency assignment."),
    "executeIncidentArrivalProcedures": ("Stops timing, marks the crew on scene, updates feedback, and records completion.", "The player receives success feedback after reaching the call."),
    "evaluateDistanceToTarget": ("Measures truck-to-incident distance and triggers arrival inside the allowed radius.", "It decides when the response is complete."),
    "teleportToStation": ("Moves the truck to a station, stops motion, and recentres the map.", "Station shortcuts reset the starting position."),
    "loadSettings": ("Reads saved options and falls back to safe defaults when data is missing or invalid.", "Preferences survive refreshes without allowing broken values."),
    "sanitizeSettings": ("Converts settings to numbers and clamps them to tested limits.", "Extreme saved values cannot make the truck unusable."),
    "saveSettings": ("Stores current options in browser storage.", "Future sessions reuse the player's handling choices."),
    "applyPreset": ("Copies a complete tested group of handling values into active settings.", "One choice switches between classic, tight, and heavy driving styles."),
    "applyMobileArcadeSteering": ("Shapes touch input and converts it into a speed-sensitive heading change.", "Mobile steering stays responsive without becoming too twitchy at speed."),
    "applyDesktopArcadeSteering": ("Reads keyboard steering and applies the selected arcade turn-rate curve.", "Desktop and mobile handling remain comparable."),
    "applyDirectionalArcadeSteering": ("Rotates along the shortest path toward the thumbstick target and limits each frame's turn.", "The truck turns smoothly instead of snapping."),
    "applyCorneringAssist": ("Detects sharp steering at excessive speed and gently reduces velocity.", "The truck can make city corners while the player keeps control."),
    "applySpeedCamera": ("Calculates a speed-based camera target under controlled timing rules.", "The player sees farther ahead without constant camera movement."),
    "installVersionBadge": ("Creates or refreshes the small version label in Options.", "A tester can confirm which build is loaded."),
    "injectScript": ("Loads another JavaScript module once and reports success or failure.", "Large systems can start in stages without failing silently."),
    "waitForValue": ("Checks repeatedly for a required game object until it appears or times out.", "The game waits for asynchronous systems without freezing forever."),
    "selectedFilters": ("Returns every incident-type checkbox.", "Counting and bulk changes use one shared list."),
    "updateCount": ("Counts enabled incident filters and writes the summary beside the collapsed heading.", "Filter status is visible without opening the list."),
    "setAll": ("Turns every incident filter on or off and dispatches normal change events.", "Select All and Clear All remain compatible with other listeners."),
    "refreshPage": ("Adds a fresh cache value and reloads the simulator.", "A stalled mobile startup can recover without clearing browser data."),
    "releaseAll": ("Releases held steering and pedals when focus is lost.", "The truck cannot remain accelerating after an interrupted touch."),
}

PREFIX = {
    "initialize": "Prepares starting objects, values, and event connections.",
    "install": "Adds an optional feature after required page elements are available.",
    "load": "Retrieves saved data or another resource.",
    "fetch": "Requests information from a file, service, or shared store.",
    "read": "Looks up a current value without intentionally changing the game.",
    "save": "Stores a value for later use.",
    "write": "Updates a value where the rest of the game expects it.",
    "update": "Refreshes data or visuals to match current state.",
    "sync": "Makes related controls or values agree.",
    "render": "Builds or refreshes something visible.",
    "draw": "Creates visual map or interface elements.",
    "apply": "Uses current settings and input to change behaviour.",
    "calculate": "Combines current values to produce a game result.",
    "compute": "Performs a calculation without directly changing the interface.",
    "evaluate": "Checks whether the current situation meets a rule.",
    "check": "Tests a condition before another action continues.",
    "handle": "Responds to input, a browser event, or a game event.",
    "toggle": "Switches a feature between two states.",
    "set": "Changes a controlled value and performs required follow-up work.",
    "start": "Begins a timed process, state, animation, or action.",
    "stop": "Ends an active process safely.",
    "reset": "Returns a system to a known starting condition.",
    "create": "Builds and returns a new object or interface element.",
    "build": "Assembles smaller values or elements into a result.",
    "bind": "Connects a control or event to its response function.",
    "fire": "Creates and starts an emergency dispatch.",
    "trigger": "Starts the next action after a required condition.",
    "execute": "Performs the full sequence for a larger game event.",
    "teleport": "Moves the vehicle directly to a known station.",
    "record": "Captures current information for review or export.",
    "export": "Converts game data into a savable format.",
    "change": "Replaces a selection and refreshes dependent systems.",
    "show": "Makes a hidden map or interface element visible.",
    "hide": "Removes a temporary element from view.",
    "open": "Displays a panel or review mode.",
    "close": "Leaves a panel or review mode and restores play.",
    "play": "Starts audio, animation, or feedback.",
    "release": "Clears held input so no control remains active.",
    "move": "Changes an object's position while respecting rules.",
    "rotate": "Changes a heading or visual angle.",
    "compare": "Examines two routes or values and prepares a useful difference.",
}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def skip(path: Path) -> bool:
    return any(part in SKIP for part in path.parts)


def purpose(path: Path) -> tuple[str, str]:
    name = rel(path)
    if name in PURPOSE:
        return PURPOSE[name]
    if name.startswith("response-simulator/"):
        return (f"Supporting response-simulator module ({path.name}).", "Its output affects driving, dispatch, maps, route review, or reliability.")
    if name.startswith("geo-guesser/"):
        return (f"Supporting Geo Guesser file ({path.name}).", "It affects prompts, map guesses, scoring, or mobile presentation.")
    if name.startswith("shared/"):
        return (f"Shared resource used by multiple games ({path.name}).", "The games stay consistent about stations, calls, and versions.")
    if name.startswith("tools/"):
        return (f"Developer maintenance tool ({path.name}), not normal gameplay.", "It prepares or validates data consumed by browser games.")
    return (f"Source file in the Peterborough Emergency Games project ({path.name}).", "It supports the launcher, a game, shared data, or maintenance.")


def header(path: Path) -> str:
    file_purpose, player = purpose(path)
    if path.suffix == ".html":
        opening, lead, closing = "<!--", "     ", "-->"
    elif path.suffix == ".py":
        opening, lead, closing = '"""', "", '"""'
    else:
        opening, lead, closing = "/*", "   ", "*/"
    lines = [opening, f"{lead}=========================================================", f"{lead}{MARKER} — {rel(path)}", f"{lead}", f"{lead}PURPOSE:", f"{lead}{file_purpose}", f"{lead}", f"{lead}WHAT THE PLAYER EXPERIENCES:", f"{lead}{player}", f"{lead}", f"{lead}HOW TO READ THIS FILE:", f"{lead}- Constants are fixed settings or reference values.", f"{lead}- State variables are the game's changing memory.", f"{lead}- Functions group instructions that perform one complete job.", f"{lead}- Event listeners connect player/browser actions to functions.", f"{lead}", f"{lead}SAFE EDITING:", f"{lead}Comments are ignored by the browser. Change executable lines only after", f"{lead}checking the nearby explanation and dependent systems.", f"{lead}=========================================================", closing, ""]
    return "\n".join(lines)


def add_header(path: Path, text: str) -> str:
    if MARKER in text[:5000]:
        return text
    block = header(path)
    if text.startswith("#!"):
        first, rest = text.split("\n", 1)
        return first + "\n" + block + rest
    if path.suffix == ".html" and text.lstrip().lower().startswith("<!doctype"):
        lead = text[:len(text)-len(text.lstrip())]
        first, rest = text.lstrip().split("\n", 1)
        return lead + first + "\n" + block + rest
    return block + text


def words(name: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name).replace("_", " ").lower()


def explain(name: str):
    if name in EXACT:
        return EXACT[name]
    lower = name.lower()
    for prefix, sentence in PREFIX.items():
        if lower.startswith(prefix):
            return (f"{sentence} The function name describes this specific job as “{words(name)}.”", "Keeping one job in one function makes the behaviour easier to test and change without touching unrelated systems.")
    return None


def edit_note(path: Path) -> str:
    name = rel(path)
    if any(word in name for word in ("collision", "handling", "camera", "vehicle", "road")):
        return "Test desktop and mobile, low and high speed, and road edges or corners."
    if any(word in name for word in ("dispatch", "shared", "editor")):
        return "Preserve existing data fields and test both saved and default data."
    if "geo-guesser" in name:
        return "Verify a full round: start, guess, score, distance line, and next call."
    return "Test the action that calls this function and confirm nearby interface updates."


def function_comment(path: Path, name: str, indent: str) -> str:
    what, why = explain(name)
    player = purpose(path)[1]
    return "\n".join([f"{indent}/*", f"{indent}FUNCTION: {name}", f"{indent}", f"{indent}WHAT THE CODE DOES:", f"{indent}{what}", f"{indent}", f"{indent}WHY IT EXISTS:", f"{indent}{why}", f"{indent}", f"{indent}PLAYER CONNECTION:", f"{indent}{player}", f"{indent}", f"{indent}EDITING NOTE:", f"{indent}{edit_note(path)}", f"{indent}*/"])


def annotate_functions(path: Path, text: str) -> str:
    if path.suffix not in {".js", ".html"}:
        return text
    lines, out = text.splitlines(), []
    in_script = path.suffix == ".js"
    in_comment = False
    count, maximum = 0, (45 if path.name == "index.html" else 30)
    declaration = re.compile(r"^(\s*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")
    arrow = re.compile(r"^(\s*)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>")
    for line in lines:
        low = line.lower()
        if path.suffix == ".html" and "<script" in low:
            in_script = " src=" not in low and "</script>" not in low
            out.append(line); continue
        if path.suffix == ".html" and "</script>" in low:
            in_script, in_comment = False, False
            out.append(line); continue
        match = None if (not in_script or in_comment or count >= maximum) else (declaration.match(line) or arrow.match(line))
        if match and explain(match.group(2)) and f"FUNCTION: {match.group(2)}" not in "\n".join(out[-18:]):
            out.append(function_comment(path, match.group(2), match.group(1))); count += 1
        out.append(line)
        if in_script:
            stripped = line.split("//", 1)[0]
            starts, ends = stripped.count("/*"), stripped.count("*/")
            if starts > ends: in_comment = True
            elif ends > starts: in_comment = False
    return "\n".join(out) + ("\n" if text.endswith("\n") else "")


def before(text: str, anchor: str, comment: str) -> str:
    if anchor in text and comment.strip() not in text:
        return text.replace(anchor, comment + "\n" + anchor, 1)
    return text


def concepts(path: Path, text: str) -> str:
    if path.suffix not in {".js", ".html"}:
        return text
    text = before(text, f"const VERSION = '{NEW}';", """/*
RELEASE VERSION:
This identifies the running build and helps browsers request the newest files.
Changing this label alone does not change gameplay.
*/""")
    text = before(text, "const state = {", """/*
LIVE STATE:
This object is the module's changing memory while the game runs. Constants
usually stay fixed; state values change during input, movement, loading, or UI.
*/""")
    name = rel(path)
    if name == "response-simulator/arcade-handling-1.5.1.js":
        text = before(text, "const PRESETS = Object.freeze({", """/* =========================================================
   HANDLING PRESETS — PLAYER-FEEL SETTINGS
   responseMs: lower reacts faster; higher feels heavier.
   turn rates: higher turns sharper; lower makes wider turns.
   steeringCurve: below 1 strengthens small input; above 1 softens it.
   cornerAssist: higher removes more speed during sharp turns.
   camera values: higher reveals more road but may request more map tiles.
   ========================================================= */""")
    if name == "response-simulator/index.html":
        text = before(text, "        const dispatchDatabase = [", """        /*
        DISPATCH RECORDS:
        main = broad family; sub = filter category; name/address = displayed
        call information; lat/lng = exact map position used for navigation.
        */""")
        text = before(text, "        const STATES = {", """        /*
        SIMULATION STATE MACHINE:
        INACTIVE -> ENROUTE -> ONSCENE -> INSERVICE. The active stage controls
        buttons, timing, arrival behaviour, and what the next action means.
        */""")
        text = before(text, "        let velocity = 0;", """        /*
        VEHICLE MOTION MEMORY:
        Position, velocity, and heading are updated by the animation loop and
        then used to place and rotate the truck marker on the map.
        */""")
        text = before(text, "        const tileProvidersConfig = {", """        /*
        MAP TILE PROVIDERS:
        Leaflet builds the visible map from small images. Changing provider
        changes appearance, not streets, coordinates, or game rules.
        */""")
    return text


def rename_and_bump() -> None:
    for path in sorted([p for p in ROOT.rglob(f"*{OLD}*") if not skip(p)], key=lambda p: len(p.parts), reverse=True):
        destination = path.with_name(path.name.replace(OLD, NEW))
        path.rename(destination)
        print(f"renamed {rel(path)} -> {rel(destination)}")
    for path in ROOT.rglob("*"):
        if path.is_file() and not skip(path) and path.suffix.lower() in TEXT_EXT and rel(path) != "tools/documentation/add_code_learning_comments.py":
            text = path.read_text(encoding="utf-8")
            updated = text.replace(OLD, NEW)
            if updated != text:
                path.write_text(updated, encoding="utf-8")


def annotate() -> None:
    for path in sorted(p for p in ROOT.rglob("*") if p.is_file() and not skip(p) and p.suffix.lower() in SOURCE_EXT):
        text = path.read_text(encoding="utf-8")
        updated = annotate_functions(path, concepts(path, add_header(path, text)))
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            print(f"annotated {rel(path)}")


def write_guide() -> None:
    (ROOT / "CODE-LEARNING-GUIDE.md").write_text(f"""# Peterborough Emergency Games — Code Learning Guide

This is the **v{NEW} code-learning edition**. Gameplay is intended to remain the same as v{OLD}; the release adds beginner-friendly explanations inside the source and updates version/cache references.

## Hidden text

The explanations are source-code comments. Browsers ignore comments, so players never see them and the comments do not affect performance or rules.

## Project map

- `index.html`: launcher.
- `response-simulator/`: dispatches, truck motion, steering, roads, camera, arrival, and route review.
- `geo-guesser/`: dispatch guessing, map guesses, distance, scoring, and mobile layout.
- `city-explorer/`: unscored city familiarization.
- `dispatch-editor/`: adding and correcting call locations.
- `shared/`: stations, dispatch records, data loading, and release version.
- `tools/geospatial/`: developer-only road/map preparation and validation.

## Reading order

1. Read the `BEGINNER CODE GUIDE` header.
2. Treat constants as settings or fixed references.
3. Treat state variables as the game's changing memory.
4. Read each `FUNCTION:` block as one complete action.
5. Use `PLAYER CONNECTION` to link technical work to screen behaviour.
6. Read `EDITING NOTE` before changing dependent systems.

## Main simulator flow

The map starts, readiness waits for required modules, a filtered call is selected, the animation loop moves the truck, road logic constrains motion, distance detects arrival, and route review compares the driven path.

## Accuracy rule

Comments must describe the code that actually runs. When behaviour and a comment disagree, verify executable code first and then correct the explanation. An inaccurate comment is more harmful than no comment.
""", encoding="utf-8")


def verify() -> None:
    required = [ROOT / "shared/build-version.js", ROOT / "response-simulator/mobile/index.html", ROOT / "response-simulator/arcade-mobile-camera-1.5.3.js", ROOT / "response-simulator/settings-menu-compact-1.5.3.js"]
    if any(not p.exists() for p in required):
        raise RuntimeError("Required v1.5.3 files are missing")
    if f"const VERSION = '{NEW}'" not in (ROOT / "shared/build-version.js").read_text(encoding="utf-8"):
        raise RuntimeError("Production version was not updated")
    for path in [ROOT / "index.html", ROOT / "geo-guesser/index.html", ROOT / "response-simulator/index.html", ROOT / "response-simulator/mobile/index.html"]:
        if MARKER not in path.read_text(encoding="utf-8"):
            raise RuntimeError(f"Missing guide header: {rel(path)}")


def main() -> None:
    rename_and_bump(); annotate(); write_guide(); verify()
    print(f"Prepared v{NEW} code-learning edition")

if __name__ == "__main__":
    main()
