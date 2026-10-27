# Location reports with centre and radius suggestions

The user approved the structured reporting recommendation and explicitly asked to implement optional correction of both a call circle's location and radius. This authorizes implementation without another design approval round. It does not authorize unrelated audit fixes, live dataset replacement or publishing.

## Behavior

Start with Geo Guesser's revealed/correct/incorrect result card. A compact “Report a problem with this location” action opens the existing private feedback dialog. It captures the original question/result immediately, including stable call/result IDs, city/service/base, displayed name/address/cross streets, difficulty, app/dataset identity, original circle, guess and distance. Missing dataset revision stays explicitly unknown; captured context is player-reported, not authenticated catalog truth.

The player chooses a neutral reason, may add a note, and may enable a correction preview. The preview shows the original circle and an independently movable proposed circle. Drag its centre or use an explicit map-placement control; drag its edge or enter a radius in metres. Suggested radii range from 5 to 2000 metres. Reset restores the original geometry; turning correction off removes the suggestion. Numeric centre fields provide a keyboard fallback. No current game target, score, call pool or shared dataset changes.

Send creates a private conversation (Map correction for location details, Bug for scoring) containing the immutable original snapshot and optional proposed centre/radius. Empty notes produce a useful generated first message. Retry retains the same payload and IDs; edited submissions receive new IDs. Received is shown only after server acknowledgement. Close/reopen on the same result preserves the page-session draft. Account changes clear private drafts. Gameplay remains usable if reporting or map loading fails.

The developer can inspect the original/proposed circles and exact context, use existing status/priority/notes/replies, and group similar loaded reports without merging owners or exposing reports to other players. Suggestions require developer review before any published correction.

## Approach and constraints

Extend the committed private-feedback implementation at 5843c37 (v1.6.133), in an isolated feature worktree. Add one optional immutable locationReport field to feedback threads; preserve old threads/messages and strict server ownership/custom-claim checks. Do not introduce a separate inbox, public issue collection or email destination. Use the existing Leaflet vendor and approved Geo map-provider policy; never fall back to public tiles when deployment policy blocks them.

The repository's feedback configuration remains disabled until a real dedicated Firebase project is connected and its rules/indexes/admin claim are deployed. Test with local emulators; do not turn on a misleading local-only delivery path. Firebase is available as an unconnected plugin and was already suggested in the current project. Do not repeat installation suggestions or deploy unrelated root analytics rules.

Increment this update from the feedback branch's 1.6.133 to 1.6.134. A new feature branch/PR preserves concurrent work. No live update claim without deployment verification.

Alternatives considered: generic text-only feedback lacks reproducible circle context; public issue submission exposes player conversations; automatic player edits permit unverified changes. The approved structured private-report approach provides reviewable evidence while retaining existing conversation permissions.
