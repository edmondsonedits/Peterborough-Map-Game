# Aerial lower-swing deployment correction — v1.6.186

The folding fly previously used the upper half of its rotation arc, passing through the nested main ladder. A second transport hinge tipped the basket after its leveling joint. The deck beneath the stowed basket was solid.

The corrected sequence stabilizes the chassis, raises the main ladder to 0.8 radians, swings the fly down and outward using a negative X rotation, and lowers to the 0.4-radian boarding position. Stowing reverses that path. The basket remains world-level throughout, including travel and partially folded poses.

Blender changes: an underslung connected knuckle, longer fly with a rear basket yoke outside the standing area, and a genuine open center well with a recessed floor, lining, and rim. The rear of the pocket was widened after independent review to leave more stow clearance. Existing cab, wheels, lamps and stabilizers are retained.

Validation:
- Original orientation and clearance regressions failed before the fix.
- 1,287 release tests pass, including full sampled deployment/stow, basket leveling, actual GLB recess raycasts, and rejection of low or upward unfolding.
- Real runtime deploy/board/raise/rotate/extend/return/stow tests pass, including uneven supported ground.
- Touch-emulated in-game rear controls, basket water controls, return/stow and closed-door reverse recovery pass.
- Browser renders inspected at stow, raised, downward swing, outward swing and boarding.
- Independent reviewer found no blocking issue after reviewing the rig, controller and geometry.

The runtime clearance check uses per-mesh bounds and a conservative fly centerline check; it is not a general rigid-body solver. Physical phone hardware was not tested.
