# Peterborough geospatial build pipeline

`build_peterborough_assets.py` creates the browser-ready Peterborough data cache and independently checks the game's OpenStreetMap road centrelines against Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

The build:

1. Downloads a bounded Peterborough OpenStreetMap extract from Overpass.
2. Extracts drivable street centrelines for validation.
3. Discovers and queries the current public ORN ArcGIS Feature Service.
4. Projects both networks to NAD83 / UTM zone 17N so offsets are measured in metres.
5. Samples each network in both directions and writes positional and street-name metrics.
6. Caches the Terrarium elevation tiles used by the browser.
7. Writes a manifest, source GeoJSON, validation JSON and Markdown report.

Run locally with:

```bash
python -m pip install -r tools/geospatial/requirements.txt
python tools/geospatial/build_peterborough_assets.py \
  --output city-explorer/data \
  --report city-explorer/ROAD-VALIDATION.md
```

The GitHub Actions workflow refreshes the generated assets monthly and whenever the geospatial pipeline changes.
