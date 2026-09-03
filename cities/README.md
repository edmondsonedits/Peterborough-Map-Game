# City packages

This folder is the geographic data boundary for the emergency-response games.

## Architecture

The simulator code stays shared. Each city supplies only the information that changes by place: map bounds, road configuration/data references, Fire/EMS bases, hospitals, dispatch data, and city-specific labels.

Only the selected city should load its heavy geographic assets. Adding more city folders therefore does **not** make a Peterborough player download Toronto, Oshawa, or any other city's road network.

## Package status

- `playable` — the city can be selected and launched.
- `planned` — the folder exists but required data is incomplete; the launcher shows it faded and unavailable.

## Standard package layout

```text
cities/<city-id>/
  city.json          # lightweight manifest used by tools/people
  package.js         # runtime map/service/road configuration
  dispatch-data.js   # city dispatch-data descriptor
  boundaries.geojson # optional city boundary asset
  roads.geojson      # optional city-owned/simplified road asset
```

Large geographic assets may be physically shared with another game when the exact same authoritative file is reused. In that case `city.json` and `package.js` still own the reference, so the simulator never hard-codes another feature's data path.

## Peterborough

Peterborough is the first fully integrated city package as of **v1.6.5**.

`cities/peterborough/package.js` is now the source of truth for:

- map centre, zoom limits and city bounds
- Fire stations
- EMS bases
- base-yard defaults
- Peterborough Regional Health Centre transport target
- EMS alarm-filter defaults
- road-network URL and collision projection origin
- dispatch control label
- dispatch dataset version/descriptor

Shared stores are city-aware. Base, hospital and dispatch edits are saved under city-specific browser-storage keys. Existing Peterborough edits are read from the older keys and carried forward automatically.

The current Peterborough collision-road GeoJSON and compressed dispatch payload remain physically reused from their existing production asset locations to avoid duplicating megabytes of identical data. They are now referenced through the Peterborough package rather than being the architectural source of truth.

`cities/city-registry.js` remains the lightweight launcher index. Planned cities should not be marked playable until their package, road data, services, hospital targets and dispatch dataset have been validated.
