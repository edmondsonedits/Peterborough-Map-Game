# Feedback corrections and assisted Route Mapping

## Authorization and intent
The user approved the preceding review and explicitly requested making the changes live and publishing them. Implement the 16 new Peterborough location corrections, the Ravenwood replacement, and the older Route Mapping practice proposal. Check the existing Richmond Hill Dispatch demo. This document records the approved review and implementation decisions; it does not create another approval gate.

## Scope and design
- Apply the submitted centres and radii to the named targets; Thomas A. Stewart supplies only radius 96 m, retaining its existing centre unless verified otherwise. The original export stays outside the repository because it contains private account and browser data.
- Replace the 1140 Lansdowne exercise with Quality Inn, 1074 Lansdowne St W, using submitted centre and radius 65 m. Reconcile the existing Quality Inn record so the catalogue contains one Quality Inn. Prefer using the separate Canadian Tire retail store at 1200 Lansdowne St W for the redundant slot if that address is not already present and its coordinates can be verified. Keep 200 unique addresses and the 100 easy / 50 medium / 50 hard counts.
- Replace 1030 Water St with Peterborough Retirement Residence, 1039 Water St, after verifying coordinates and cross streets. Label Canadian Tire at 1050 Lansdowne as a gas station. Add Mall to Lansdowne Place.
- Replace 1757 Ravenwood with a verified real address near the middle between its named cross streets; investigate the proposed 1735 Ravenwood. Use real address coordinates and a 60 m radius, consistent with the later proposal. This is one shared call across modes.
- Share canonical corrected locations across Fire, EMS, GeoGuesser, Dispatch and Route Mapping. Preserve road access and appropriate arrival tolerance when large landmark recognition areas are used. Rebuild the generated production dataset and migrate cached unedited records while preserving deliberate user edits.
- Add Show route (practice) during Route Mapping before completion, reusing the existing reference route. Show the street sequence. Provide Try again and Next Call. Once revealed, that call remains assisted/unscored on retries and cannot affect hidden skill, decision learning or progression. Next Call starts a fresh normal attempt. If no route exists, explain this and retain retry/next.
- Keep the current drawing, undo, incomplete-submit and normal scored-completion behavior. Make the practice controls usable on phone and desktop without covering the map unnecessarily.
- Verify the already-configured Richmond Hill dispatch demo; repair a reproducible issue if found. Do not interpret the old demo request as authorization to send a message to another person.

## Approach
Use the existing vanilla JavaScript shared catalogue, route state, renderer, and build scripts. A one-off override would leave caches and modes inconsistent. Separate mode-specific copies would violate the shared-pool requirement. Reusing these boundaries keeps the change maintainable.

## Publication
Increment the current public source version by exactly 0.0.1 at release integration, normalize version tokens, run required checks, preserve concurrent main changes, publish to GitHub, and verify the public files and affected gameplay. Follow the documented multiplayer compatibility gate. Do not mark feedback resolved or claim live publication without evidence.
