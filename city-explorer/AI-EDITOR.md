# AI editor tools

Open the existing **Editor**, then **Inspector → AI tools**. Use the feature search instead of guessing IDs or clicking distant objects. The Tools section is collapsed by default and never appears in normal driving.

An external browser agent can call `window.PTBO_CITY_EDITOR.run(command)`. `enter()` and the Editor button use the existing editor entry policy. Only `help` and `status` work before entry. Recovery prompts and active placement/transform gestures block scene commands. This is an editing interface, not an embedded AI model or a JavaScript evaluator.

The JSON input and **Run command** button provide the same interface for browser tools that cannot access page JavaScript. Results appear as selectable JSON in `[data-ai-result]`; successful results have `data-ok="true"`.

```js
await window.PTBO_CITY_EDITOR.enter();
const editor = window.PTBO_CITY_EDITOR;
const matches = editor.run({ op: 'list', query: 'Hunter', type: 'road', limit: 10 });
const id = matches.data.items[0].id;
editor.run({ op: 'select', id });
editor.run({ op: 'focus', id });
editor.run({ op: 'view.save', name: 'Hunter road before' });
const inspected = editor.run({ op: 'inspect', id });
editor.run({ op: 'edit', expectedRevision: inspected.revision,
  changes: [{ id, appearance: { color: '#777777' } }] });
editor.run({ op: 'view.restore', name: 'Hunter road before' });
// Allow rendering to settle, then capture a screenshot with your browser tool.
editor.run({ op: 'undo' });
```

Check `ok` after **every** command; empty matches are valid. Never assume a feature exists from its name alone. `list` returns total, nextOffset and at most 100 summaries, ordered by name/ID or proximity. Search covers labels, IDs, source IDs and types. To inspect a nearby area:

```json
{"op":"list","type":"building","near":{"latitude":44.305884,"longitude":-78.314833,"radius":150},"limit":20}
```

## Commands

| op | Inputs / result |
| --- | --- |
| help / status | Commands, limits, entry state, build and scene revision. |
| list | query, type, offset, limit, optional near with latitude/longitude/radius metres. |
| inspect / select / focus | id; inspect/focus default to selection. Inspect includes source properties, bounds, current override and supported edits. |
| edit | changes array of 1–50 unique IDs; optional expectedRevision. Each patch supports appearance, transform or visible. Entire batch validates before one history entry. |
| undo / redo | Uses the same history as manual controls. |
| camera | latitude, longitude, altitude metres, horizontal distance metres, bearing degrees. Looks at terrain at the target. |
| view.save / view.restore / view.delete | name. Maximum 20 named views per browser origin. Camera pose, lens and orbit target are saved; lighting is not changed. |
| view.list | Saved names and poses. A failed storage write reports persisted=false; that view remains session-only. |
| context | Units, version, profile, current camera, selected object, view definitions and renderer counts. Copy context supports sharing with an external coding agent. |
| export | Scene document plus context. Use scene with the normal repository/publication workflow. No command publishes automatically. |

## Supported changes and limits

- Read each target's capabilities. Batched roads/buildings and instances support a **colour tint only**, not opacity, textures or arbitrary material replacement. Discrete objects support `color` (#RRGGBB) and `opacity` (0–1).
- Authored appearance is stored in `properties.editorAppearance` and restored on reload. The ordinary Download/Export JSON button includes these edits.
- Authored transforms support geographic longitude/latitude, terrain-relative elevation metres, rotation x/y/z radians, scale x/y/z. Partial axis changes preserve the other axes.
- Transformable generated buildings become persistent source-clone replacements. Responses include the new ID; inspect the source to find replacementId. Edit the replacement thereafter.
- Continuous roads, instanced features and protected landmarks cannot be transformed through this interface. Rebuilding bridge arches or road geometry still requires code/model work.
- Visibility changes affect appearance, not driving collision or route data. Restore a hidden feature before adjusting its appearance. Restoring a generated feature clears its override.
- Revisions detect changes since the last command, including manual edits. A stale expectedRevision rejects the whole batch. Invalid input returns a structured error without applying earlier patches.
- Named views are separate local workspace data, included in context exports; they are not public scene edits. Screenshots still require an external browser capture tool. View restoration does not freeze sunlight or animation.
- Colour commands modify the selected feature; they do not change a globally shared material. Normal gameplay, GIS datasets and editor authorization remain unchanged.

## Verification

Run `node --test tools/test_city_editor_*.mjs` for command, camera, runtime, recovery, source-clone and existing editor checks. Physical phone layouts and WebGL screenshot comparison require browser verification; unit checks do not establish rendering performance or time savings.
