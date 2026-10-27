# Station 2 runtime implementation

The truck starts in the rightmost front bay as viewed from outside, with all five doors closed. G and desktop/touch buttons operate the front door aligned with the truck immediately from spawn. Other doors stay closed; closing attempts reopen if the doorway is occupied. The editable Blender source retains individual components.

The runtime validates GLB bounds and all 26 independent door/panel transforms, uses one layout for model/spawn/collision, provides an opening front-bay driving lane, blocks walls and folded leaves, and blends the local slab into the GIS approach. Root added procedural concrete/asphalt paving and restrained bay lighting. The photo-based tower and side annex share the layout contract used by collision.

Selecting Station 2 loads the asset and suppresses only the obsolete building source way/1022083769. After every editor override application, suppression is reapplied because the editor restores generated batches first. A failed model keeps the generic map, enables no new station collision, and moves the player/truck to the Marina approach. Other stations retain their existing path.

The normal start is beside the truck. E enters/exits; Start in truck resets to the bay and focuses the canvas. Touch devices use mobile start and bay-door buttons, without duplicate desktop controls. Reset and Start in truck restore the right-bay position and close all doors.

Focused model, coordinate, collision and existing gameplay/station tests pass. Root's final README records browser and visual acceptance. The model is a source-informed reconstruction with explicitly estimated non-door dimensions, not an as-built twin.
