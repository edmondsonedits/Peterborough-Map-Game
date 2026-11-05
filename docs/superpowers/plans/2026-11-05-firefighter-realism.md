# Firefighter realism implementation plan

Goal: improve the existing firefighter's appearance and make walk/run visibly human in the existing City Explorer.
Architecture: retain the original turnout geometry and CC0 MakeHuman anatomy, build a weighted Blender skeleton with authored in-place Idle/Walk/Run clips, use Three.js AnimationMixer with speed-matched, phase-aligned blending.
Tech stack: existing Blender 5.2, glTF 2, Three.js r180, Node tests, Playwright.

Design choices (implementation decisions): preserve identity, outfit, controls and geographic/vehicle work; keep fully local assets, existing fallbacks and provenance. A new external character would lose the existing design; isolated rigid-limb tweaks cannot supply knee or elbow deformation. A weighted rig is the selected approach. Work is authorized by the user's request to research and apply improvements; no publication is requested.

- [x] Build reproducible v3 asset from preserved v2 GLB, adding articulated skeleton, smooth weights, material refinement and separate Idle/Walk/Run loops. Keep below existing 120k triangle / 45 drawable / 9 MB budgets.
- [x] Validate actual skin deformation, embedded textures, animation loop continuity and dimensions; replace runtime loading only after complete validation.
- [x] Blend speed-calibrated cycles, settle at idle, derive motion from actual post-collision displacement. Use plausible 1.6 m/s walk and 3.8 m/s run.
- [x] Test transitions at different frame rates, loading failure fallback, and gameplay controls. Render front/side/back and animation phases in browser, then exercise actual simulator at desktop and phone viewport.
- [x] Record evidence, sources, remaining limitations, and exact modified files. Leave changes local for review.

Review focus: joint collapse/popping, sole ground penetration, unintended head/eye separation, stopped feet continuing to slide, outfit detail unreadable in game lighting. Verify model and animation together rather than accepting data assertions alone.

Publication authorized by the user on 2026-11-05. Release v1.6.183 is prepared in an isolated checkout from current main, retaining the newer v1.6.181 scenery/geospatial changes and excluding concurrent vehicle edits from the working source checkout.

Research read 2026-11-05:
- https://github.com/ahujasid/mcp-for-blender : LLM-assisted Blender workflow and programmatic scene inspection. Existing background Blender scripts already supply the required integration.
- https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html : clean centered humanoid topology and neutral pose; Mixamo is an option for authored motion but not used/downloaded in this change.
- https://threejs.org/docs/pages/AnimationAction.html : effective weights, playback speeds and synchronized action blending.
- https://threejs.org/examples/webgl_animation_skinning_morph.html : looping skeletal base states and smooth transitions.
- https://www.makehumancommunity.org/about/license.html : graphical asset provenance; existing CC0 source records remain authoritative for assets already shipped.
