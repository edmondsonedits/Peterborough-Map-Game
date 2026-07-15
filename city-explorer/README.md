# Peterborough 3D City Explorer

First playable milestone for a browser-based, low-poly 3D recreation of Peterborough, Ontario.

## Included in this milestone

- Live OpenStreetMap road and building-footprint loading through Overpass
- Procedurally extruded buildings using OSM height and level tags when available
- Instanced road rendering for better browser performance
- Water, park, grass, and industrial land polygons
- Free-flight navigation, overhead map mode, keyboard and touch controls
- Local landmark navigation and Peterborough-bounded address search
- Day, dusk, and night lighting
- Generated ambient sound toggle
- Automatic offline fallback city when map services are unavailable
- Responsive HUD inspired by the Manhattan voxel explorer reference

## Controls

- `W A S D`: move
- `Q / E`: descend / ascend
- `Shift`: fly faster
- Mouse: look around after clicking the city
- `M`: toggle map mode
- `F`: return to fly mode
- `/`: open search

## Next development milestones

1. Parse OpenStreetMap multipolygon relations for complete river, park, and complex-building geometry.
2. Add custom landmark models for the Lift Lock, Hunter Street Bridge, Quaker Oats, Memorial Centre, and hospital.
3. Add street-level driving physics and road-following traffic.
4. Stream city chunks instead of loading one fixed downtown radius.
5. Add building facade variation, windows, streetlights, trees, and seasonal lighting.
6. Connect the explorer to the existing dispatch-call database.

Map data © OpenStreetMap contributors. This is an unofficial fan-made project.
