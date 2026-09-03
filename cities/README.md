# City packages

This folder is the geographic data boundary for the emergency-response games.

## Goal

The simulator code stays shared. Each city supplies only the data that changes by place: map bounds, road data, Fire/EMS bases, hospitals, dispatch locations, and city-specific configuration.

## Package status

- `playable` — the city can be selected and launched.
- `planned` — the folder exists but required data is not complete; the launcher shows it as unavailable.

## Standard package fields

Each city folder starts with `city.json` using schema version 1. Future migration work should add city-owned files without changing the shared simulator:

```text
cities/<city-id>/
  city.json
  boundaries.geojson       # future
  roads.geojson            # future, simplified/compressed
  dispatch-locations.js    # future
  service-config.js        # future
  bases.js                 # future
  hospitals.js             # future when multiple targets are needed
```

Peterborough is currently `playable` through a `legacy-adapter`: its existing production data remains in the current shared/response-simulator locations while we migrate it incrementally. This avoids breaking the working game.

`cities/city-registry.js` is the lightweight launcher index. It is intentionally small so adding many cities does not make players download every city's road network. Only the selected city package should eventually load its heavy geographic data.
