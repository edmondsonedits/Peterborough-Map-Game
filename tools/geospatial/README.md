# Peterborough geospatial build pipeline

The deployment pipeline creates a browser-ready Peterborough map cache and independently checks its public street geometry against Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

## Build stages

1. `build_peterborough_assets.py`
   - downloads one bounded OpenStreetMap extract from Overpass
   - caches the Terrarium elevation tiles used by the browser
   - discovers the current public ORN ArcGIS service
   - writes the initial manifest and source files
2. `road_alignment.py`
   - downloads the complete ORN result through object-ID pagination
   - joins ORN Official Street Name records to road elements
   - excludes driveways, parking aisles, tracks and explicitly private roads from the authoritative public-road test
   - projects both networks to NAD83 / UTM zone 17N
   - samples centrelines in both directions approximately every 15 metres
   - writes positional metrics, name agreement and a manual-review list

Using object-ID pagination matters because ArcGIS can reach a geometry transfer limit before a response reaches its advertised record count. A single spatial page can therefore look complete while silently omitting roads.

## Local build

```bash
python -m pip install -r tools/geospatial/requirements.txt
python tools/geospatial/build_peterborough_assets.py \
  --output city-explorer/data \
  --report city-explorer/ROAD-VALIDATION.md
python tools/geospatial/road_alignment.py \
  --data-dir city-explorer/data \
  --report city-explorer/ROAD-VALIDATION.md \
  --strict
```

Generated assets include the cached OSM extract, complete ORN comparison layer, public-road comparison layer, Terrarium tiles, manifest, machine-readable metrics and `city-explorer/ROAD-VALIDATION.md`.

The GitHub Actions workflow rebuilds these files when the pipeline changes, on demand and monthly. A failed alignment threshold blocks the refresh and preserves a diagnostic workflow artifact.
