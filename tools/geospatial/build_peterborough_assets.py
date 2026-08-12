#!/usr/bin/env python3
"""Build and validate deployment-time Peterborough map assets.

The script downloads one bounded OpenStreetMap extract, prepares/reuses the
official Ontario lidar terrain plus cached Terrarium fallback tiles, downloads selected official City of
Peterborough eMaps layers, discovers Ontario's authoritative Ontario Road
Network (ORN) Feature Service, and compares OSM road centrelines against ORN
in NAD83 / UTM zone 17N metres.

Generated files are deterministic apart from upstream data updates:
  city-explorer/data/manifest.json
  city-explorer/data/peterborough-osm.json
  city-explorer/data/peterborough-city-open-data.geojson
  city-explorer/data/peterborough-road-surfaces.geojson
  city-explorer/data/osm-roads.geojson
  city-explorer/data/orn-roads.geojson
  city-explorer/data/road-validation.json
  city-explorer/data/peterborough-hydrography.geojson
  city-explorer/data/hydrography-validation.json
  city-explorer/data/terrain/peterborough-dtm-2025-terrarium.png
  city-explorer/data/terrain/peterborough-dtm-2025.json
  city-explorer/data/terrain/<z>/<x>/<y>.png
  city-explorer/ROAD-VALIDATION.md
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

import requests
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box, mapping, shape
from shapely.ops import transform
from shapely.strtree import STRtree

from hydrography_assets import (
    HYDROGRAPHY_FILE,
    HYDRO_VALIDATION_FILE,
    fetch_or_reuse_hydrography,
)
from official_lidar_terrain import build as build_official_lidar_terrain

CITY_NAME = "Peterborough, Ontario"
CITY_CENTER = (44.3091, -78.3197)  # lat, lon
# Broad enough to include the full urban road network, Trent and Fleming.
BBOX = (-78.405, 44.245, -78.245, 44.385)  # west, south, east, north
TERRAIN_ZOOM = 12
TERRAIN_RADIUS = 1
OFFICIAL_TERRAIN_ASSET = Path('terrain/peterborough-dtm-2025-terrarium.png')
OFFICIAL_TERRAIN_METADATA = Path('terrain/peterborough-dtm-2025.json')
DRIVABLE_EXCLUDE = {
    "footway",
    "cycleway",
    "path",
    "steps",
    "pedestrian",
    "bridleway",
    "corridor",
    "platform",
    "proposed",
    "construction",
    "crossing",
}
PUBLIC_ROAD_EXCLUDE = DRIVABLE_EXCLUDE | {
    "service",
    "track",
    "road",
    "busway",
}
PRIVATE_ACCESS_VALUES = {"private", "no", "destination", "customers"}
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
)
ARCGIS_SEARCH_URL = "https://www.arcgis.com/sharing/rest/search"
CITY_EMAPS_SERVICE_URL = "https://citymaps.peterborough.ca/arcgis/rest/services/eMaps2_0_Operational/MapServer"
CITY_OPEN_DATA_FILE = "peterborough-city-open-data.geojson"
CITY_OPEN_DATA_LAYERS: tuple[dict[str, Any], ...] = (
    {
        "id": 13,
        "key": "bus_stops",
        "name": "Bus Stops",
        "fields": ("STOPNUM", "STOPNAME", "ROUTENAME", "ROUTETYPE", "SHELTER", "STATUS", "STREET_SIDE", "ROUTENUMBER"),
    },
    {
        "id": 29,
        "key": "points_of_interest",
        "name": "Points of Interest",
        "fields": ("STATUS", "CATEGORY", "P_Name", "Label", "ADDRESS"),
    },
    {
        "id": 30,
        "key": "recreation",
        "name": "Recreation",
        "fields": ("ADDRESS", "LOCATION_N", "BASEBALL", "SOFTBALL", "SLO_PITCH", "PLAY_AGE", "STATUS", "Type", "City_Affiliated", "Rec_URL", "Comments"),
    },
    {
        "id": 32,
        "key": "parks",
        "name": "Park",
        "fields": ("PARKNUM", "NAME", "ADDRESS", "PARK_TYPE"),
    },
    {
        "id": 33,
        "key": "major_trails",
        "name": "Major Trail",
        "fields": ("LINE_TYPE", "SIDE", "STREET_NAME", "CROSS_STREET1", "CROSS_STREET2", "CLASS", "STATUS"),
    },
    {
        "id": 35,
        "key": "sidewalks_pathways",
        "name": "Sidewalks and Pathways",
        "fields": ("LINE_TYPE", "SIDE", "STREET_NAME", "CROSS_STREET1", "CROSS_STREET2", "CLASS", "STATUS"),
    },
)
CITY_BASEDATA_SERVICE_URL = "https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer"
CITY_ROAD_SURFACES_FILE = "peterborough-road-surfaces.geojson"
CITY_BUILDINGS_FILE = "peterborough-official-buildings.geojson"
CONSTRUCTION_AUDIT_FILE = "construction-audit.json"
CITY_ROAD_SURFACE_LAYERS: tuple[dict[str, Any], ...] = (
    {
        "id": 0,
        "key": "official_streets",
        "name": "Street Names",
        "fields": ("RD_ID", "RD_CLASS", "STREET_NAME"),
    },
    {
        "id": 8,
        "key": "curb_edges",
        "name": "Curb / Edge of Pavement",
        "fields": ("STATUS",),
    },
    {
        "id": 10,
        "key": "parking_surfaces",
        "name": "Parking lots / Other surface",
        "fields": ("DRIVE_ACCESS_TYPE",),
    },
    {
        "id": 11,
        "key": "road_surfaces",
        "name": "Road Surface",
        "fields": ("STATUS", "FACILITYID"),
    },
    {
        "id": 12,
        "key": "bridges",
        "name": "Bridge",
        "fields": ("FACILITYID", "OSIM_ID", "BR_NAME", "BR_SPAN", "YR_BUILT", "OWNEDBY", "BR_USE"),
    },
)
CITY_BUILDING_LAYERS: tuple[dict[str, Any], ...] = (
    {
        "id": 6,
        "key": "official_buildings",
        "name": "Buildings",
        "fields": ("LOCATION", "STATUS"),
    },
)
TERRARIUM_ROOT = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
USER_AGENT = "Peterborough-3D-City-Explorer/1.0 (open-source geospatial build pipeline)"
WGS84_TO_UTM17 = Transformer.from_crs("EPSG:4326", "EPSG:26917", always_xy=True)
UTM17_TO_WGS84 = Transformer.from_crs("EPSG:26917", "EPSG:4326", always_xy=True)


def log(message: str) -> None:
    print(f"[peterborough-assets] {message}", flush=True)


def request_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json,*/*"})
    adapter = requests.adapters.HTTPAdapter(max_retries=3)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def atomic_write_json(path: Path, data: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        if compact:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    temporary.replace(path)


def overpass_query() -> str:
    west, south, east, north = BBOX
    bbox = f"{south},{west},{north},{east}"
    return f"""[out:json][timeout:180][maxsize:536870912];(
  nwr[\"building\"]({bbox});
  way[\"highway\"]({bbox});
  way[\"railway\"~\"^(rail|light_rail|subway|tram)$\"]({bbox});
  nwr[\"natural\"=\"water\"]({bbox});
  nwr[\"natural\"=\"wood\"]({bbox});
  node[\"natural\"=\"tree\"]({bbox});
  nwr[\"water\"]({bbox});
  nwr[\"waterway\"=\"riverbank\"]({bbox});
  nwr[\"leisure\"~\"^(park|recreation_ground|garden)$\"]({bbox});
  nwr[\"landuse\"~\"^(grass|meadow|industrial|forest|residential|commercial|retail)$\"]({bbox});
  nwr[\"amenity\"=\"parking\"]({bbox});
  node[\"highway\"=\"street_lamp\"]({bbox});
  node[\"highway\"=\"traffic_signals\"]({bbox});
  nwr[\"amenity\"~\"^(theatre|cinema|fountain|place_of_worship|arts_centre|sports_centre)$\"]({bbox});
  nwr[\"tourism\"~\"^(museum|zoo|hotel|attraction)$\"]({bbox});
  nwr[\"leisure\"~\"^(marina|playground|stadium|sports_centre)$\"]({bbox});
  nwr[\"historic\"]({bbox});
);out body geom;"""


def fetch_osm(session: requests.Session) -> dict[str, Any]:
    query = overpass_query()
    last_error: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            log(f"Downloading bounded OSM extract from {endpoint}")
            response = session.post(endpoint, data={"data": query}, timeout=210)
            response.raise_for_status()
            payload = response.json()
            if not payload.get("elements"):
                raise RuntimeError("Overpass response contained no elements")
            return payload
        except Exception as exc:  # noqa: BLE001 - endpoint failover is intentional.
            last_error = exc
            log(f"Overpass endpoint failed: {exc}")
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def clean_osm_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove update metadata while retaining every geometry/tag needed by the renderer."""
    cleaned: list[dict[str, Any]] = []
    for element in payload.get("elements", []):
        kept = {key: element[key] for key in ("type", "id", "lat", "lon", "nodes", "geometry", "members", "tags", "bounds", "center") if key in element}
        cleaned.append(kept)
    return {
        "version": payload.get("version", 0.6),
        "generator": payload.get("generator", "Overpass API"),
        "osm3s": payload.get("osm3s", {}),
        "elements": cleaned,
    }


def load_cached_osm(output_dir: Path) -> dict[str, Any]:
    cached_path = output_dir / "peterborough-osm.json"
    if not cached_path.exists():
        raise RuntimeError(f"No cached OSM extract exists at {cached_path}")
    cached = json.loads(cached_path.read_text(encoding="utf-8"))
    if not cached.get("elements"):
        raise RuntimeError(f"Cached OSM extract has no elements: {cached_path}")
    return cached


def fetch_or_reuse_osm(session: requests.Session, output_dir: Path) -> dict[str, Any]:
    """Prefer a fresh OSM extract, but keep a validated local city usable during outages."""
    try:
        return clean_osm_payload(fetch_osm(session))
    except Exception as exc:  # noqa: BLE001 - fallback is intentional and auditable.
        try:
            cached = load_cached_osm(output_dir)
        except Exception:  # noqa: BLE001
            raise exc
        log(f"OSM download unavailable; reusing cached extract from {cached.get('osm3s', {}).get('timestamp_osm_base', 'unknown date')}")
        return cached


def property_value(properties: dict[str, Any], field_name: str) -> Any:
    """Read an ArcGIS attribute without depending on upstream field-name casing."""
    target = field_name.casefold()
    return next((value for key, value in properties.items() if str(key).casefold() == target), None)


def compact_city_properties(properties: dict[str, Any], layer: dict[str, Any]) -> dict[str, Any]:
    """Keep only renderer-facing City attributes and a stable layer discriminator."""
    compact: dict[str, Any] = {"ptbo_layer": layer["key"]}
    for field_name in layer["fields"]:
        value = property_value(properties, field_name)
        if isinstance(value, str):
            value = value.strip()
        if value is None or value == "":
            continue
        compact[field_name] = value
    return compact


def simplify_city_geometry(geometry: Any, layer: dict[str, Any]) -> Any:
    """Remove ArcGIS curve densification noise while retaining survey-scale plan accuracy.

    ArcGIS expands curved parking and pavement boundaries into many sub-centimetre
    vertices when exporting GeoJSON.  Simplifying in Ontario's metre-based UTM
    projection keeps the browser asset tractable without moving a curb by more
    than the configured survey-scale tolerance.
    """
    tolerance_metres = {
        "official_streets": 0.12,
        "official_buildings": 0.08,
        "curb_edges": 0.08,
        "parking_surfaces": 0.15,
        "road_surfaces": 0.10,
        "bridges": 0.05,
    }.get(str(layer.get("key") or ""), 0.0)
    if tolerance_metres <= 0 or geometry.is_empty:
        return geometry
    metric = transform(WGS84_TO_UTM17.transform, geometry)
    simplified = metric.simplify(tolerance_metres, preserve_topology=True)
    return transform(UTM17_TO_WGS84.transform, simplified)


def fetch_city_open_data_layer(
    session: requests.Session,
    layer: dict[str, Any],
    *,
    service_url: str = CITY_EMAPS_SERVICE_URL,
    source_label: str = "City eMaps",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Download and fully paginate one public City eMaps layer as clipped GeoJSON."""
    layer_url = f"{service_url}/{layer['id']}"
    metadata_response = session.get(layer_url, params={"f": "json"}, timeout=45)
    metadata_response.raise_for_status()
    layer_metadata = metadata_response.json()
    if layer_metadata.get("error"):
        raise RuntimeError(f"City eMaps layer {layer['id']} metadata failed: {layer_metadata['error']}")

    object_id_field = str(
        layer_metadata.get("objectIdField")
        or layer_metadata.get("objectIdFieldName")
        or "OBJECTID"
    )
    requested_fields = list(dict.fromkeys((object_id_field, *layer["fields"])))
    page_size = min(int(layer_metadata.get("maxRecordCount") or 1000), 5000)
    west, south, east, north = BBOX
    city_extent = box(west, south, east, north)
    offset = 0
    features: list[dict[str, Any]] = []
    seen_feature_ids: set[str] = set()
    log(f"Querying official {source_label} layer {layer['id']}: {layer_metadata.get('name') or layer['name']}")

    while True:
        params = {
            "f": "geojson",
            "where": "1=1",
            "geometry": f"{west},{south},{east},{north}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": ",".join(requested_fields),
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "orderByFields": f"{object_id_field} ASC",
        }
        response = session.get(f"{layer_url}/query", params=params, timeout=120)
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(f"City eMaps layer {layer['id']} query failed: {payload['error']}")
        page = payload.get("features")
        if not isinstance(page, list):
            raise RuntimeError(f"City eMaps layer {layer['id']} did not return GeoJSON features")
        if not page:
            break

        new_ids_on_page = 0
        for feature in page:
            properties = feature.get("properties") or {}
            source_id = property_value(properties, object_id_field)
            if source_id is None:
                source_id = feature.get("id")
            if source_id is None:
                source_id = json.dumps(feature.get("geometry") or {}, sort_keys=True, separators=(",", ":"))
            feature_id = f"{layer['id']}/{source_id}"
            if feature_id in seen_feature_ids:
                continue
            seen_feature_ids.add(feature_id)
            new_ids_on_page += 1

            geometry_payload = feature.get("geometry")
            if not geometry_payload:
                continue
            try:
                clipped_geometry = shape(geometry_payload).intersection(city_extent)
                clipped_geometry = simplify_city_geometry(clipped_geometry, layer)
            except Exception:  # noqa: BLE001 - an invalid upstream geometry is omitted.
                continue
            if clipped_geometry.is_empty:
                continue
            features.append(
                {
                    "type": "Feature",
                    "id": feature_id,
                    "properties": compact_city_properties(properties, layer),
                    "geometry": mapping(clipped_geometry),
                }
            )

        if not new_ids_on_page:
            break
        offset += len(page)
        if offset > 100000:
            raise RuntimeError(f"City eMaps layer {layer['id']} pagination exceeded the safety limit")

    if not features:
        raise RuntimeError(f"City eMaps layer {layer['id']} returned no features inside the Peterborough bounding box")
    summary = {
        "id": layer["id"],
        "key": layer["key"],
        "name": layer_metadata.get("name") or layer["name"],
        "feature_count": len(features),
        "layer_url": layer_url,
        "last_edit_date": (layer_metadata.get("editingInfo") or {}).get("lastEditDate"),
    }
    return features, summary


def layer_counts(collection: dict[str, Any], layers: Sequence[dict[str, Any]]) -> dict[str, int]:
    counts = {layer["key"]: 0 for layer in layers}
    for feature in collection.get("features") or []:
        layer_key = str((feature.get("properties") or {}).get("ptbo_layer") or "")
        if layer_key:
            counts[layer_key] = counts.get(layer_key, 0) + 1
    return counts


def city_open_data_layer_counts(collection: dict[str, Any]) -> dict[str, int]:
    return layer_counts(collection, CITY_OPEN_DATA_LAYERS)


def fetch_city_open_data(session: requests.Session) -> tuple[dict[str, Any], dict[str, Any]]:
    """Combine the selected official municipal layers into one browser-ready file."""
    features: list[dict[str, Any]] = []
    layer_summaries: list[dict[str, Any]] = []
    for layer in CITY_OPEN_DATA_LAYERS:
        layer_features, layer_summary = fetch_city_open_data_layer(session, layer)
        features.extend(layer_features)
        layer_summaries.append(layer_summary)

    metadata = {
        "source": "City of Peterborough eMaps",
        "service_url": CITY_EMAPS_SERVICE_URL,
        "spatial_reference": "EPSG:4326",
        "query_bbox": list(BBOX),
        "layers": layer_summaries,
    }
    collection = {
        "type": "FeatureCollection",
        "name": "Peterborough City eMaps open data",
        "bbox": list(BBOX),
        "metadata": metadata,
        "features": features,
    }
    return collection, metadata


def load_cached_city_open_data(output_dir: Path) -> dict[str, Any]:
    cached_path = output_dir / CITY_OPEN_DATA_FILE
    if not cached_path.exists():
        raise RuntimeError(f"No cached City eMaps extract exists at {cached_path}")
    cached = json.loads(cached_path.read_text(encoding="utf-8"))
    if cached.get("type") != "FeatureCollection" or not cached.get("features"):
        raise RuntimeError(f"Cached City eMaps extract is not a populated FeatureCollection: {cached_path}")
    return cached


def fetch_or_reuse_city_open_data(
    session: requests.Session,
    output_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    """Prefer current municipal data, falling back atomically to the packaged cache."""
    try:
        collection, metadata = fetch_city_open_data(session)
        return collection, metadata, False
    except Exception as exc:  # noqa: BLE001 - cached municipal data keeps builds reproducible during outages.
        try:
            cached = load_cached_city_open_data(output_dir)
        except Exception:  # noqa: BLE001
            raise exc
        metadata = cached.get("metadata") or {
            "source": "City of Peterborough eMaps",
            "service_url": CITY_EMAPS_SERVICE_URL,
            "spatial_reference": "EPSG:4326",
            "query_bbox": list(BBOX),
            "layers": [],
        }
        log(f"City eMaps download unavailable; reusing cached {CITY_OPEN_DATA_FILE}: {exc}")
        return cached, metadata, True


def fetch_city_road_surfaces(session: requests.Session) -> tuple[dict[str, Any], dict[str, Any]]:
    """Download Peterborough's surveyed pavement, curb, parking, and bridge geometry."""
    features: list[dict[str, Any]] = []
    layer_summaries: list[dict[str, Any]] = []
    for layer in CITY_ROAD_SURFACE_LAYERS:
        layer_features, layer_summary = fetch_city_open_data_layer(
            session,
            layer,
            service_url=CITY_BASEDATA_SERVICE_URL,
            source_label="City Basedata",
        )
        features.extend(layer_features)
        layer_summaries.append(layer_summary)

    metadata = {
        "source": "City of Peterborough Basedata",
        "service_url": CITY_BASEDATA_SERVICE_URL,
        "spatial_reference": "EPSG:4326",
        "query_bbox": list(BBOX),
        "layers": layer_summaries,
        "usage": "Authoritative curb, pavement, parking, and bridge plan geometry",
    }
    return {
        "type": "FeatureCollection",
        "name": "Peterborough official road surfaces",
        "bbox": list(BBOX),
        "metadata": metadata,
        "features": features,
    }, metadata


def fetch_city_buildings(session: requests.Session) -> tuple[dict[str, Any], dict[str, Any]]:
    features: list[dict[str, Any]] = []
    layer_summaries: list[dict[str, Any]] = []
    for layer in CITY_BUILDING_LAYERS:
        layer_features, layer_summary = fetch_city_open_data_layer(
            session,
            layer,
            service_url=CITY_BASEDATA_SERVICE_URL,
            source_label="City Basedata",
        )
        features.extend(layer_features)
        layer_summaries.append(layer_summary)
    metadata = {
        "source": "City of Peterborough Basedata",
        "service_url": CITY_BASEDATA_SERVICE_URL,
        "spatial_reference": "EPSG:4326",
        "query_bbox": list(BBOX),
        "layers": layer_summaries,
        "usage": "Supplemental official building footprints",
    }
    return {
        "type": "FeatureCollection",
        "name": "Peterborough official building footprints",
        "bbox": list(BBOX),
        "metadata": metadata,
        "features": features,
    }, metadata


def osm_building_footprints(payload: dict[str, Any]) -> list[Polygon]:
    """Extract conservative OSM building outers for municipal gap filtering."""
    footprints: list[Polygon] = []
    for element in payload.get("elements") or []:
        tags = element.get("tags") or {}
        if not (tags.get("building") or tags.get("building:part")):
            continue
        coordinate_sets: list[list[tuple[float, float]]] = []
        if element.get("type") == "way":
            coordinate_sets.append([
                (float(vertex["lon"]), float(vertex["lat"]))
                for vertex in element.get("geometry") or []
                if vertex.get("lon") is not None and vertex.get("lat") is not None
            ])
        elif element.get("type") == "relation":
            for member in element.get("members") or []:
                if str(member.get("role") or "outer").lower() not in {"", "outer"}:
                    continue
                coordinate_sets.append([
                    (float(vertex["lon"]), float(vertex["lat"]))
                    for vertex in member.get("geometry") or []
                    if vertex.get("lon") is not None and vertex.get("lat") is not None
                ])
        for coordinates in coordinate_sets:
            if len(coordinates) < 3:
                continue
            if coordinates[0] != coordinates[-1]:
                coordinates.append(coordinates[0])
            try:
                footprint = transform(WGS84_TO_UTM17.transform, Polygon(coordinates))
                if not footprint.is_valid:
                    footprint = footprint.buffer(0)
            except Exception:  # noqa: BLE001 - malformed OSM geometry is ignored.
                continue
            if footprint.is_empty:
                continue
            if footprint.geom_type == "Polygon":
                footprints.append(footprint)
            elif footprint.geom_type == "MultiPolygon":
                footprints.extend(part for part in footprint.geoms if not part.is_empty)
    return footprints


def filter_city_building_gap_fill(
    collection: dict[str, Any],
    osm_payload: dict[str, Any],
    tolerance_m: float = 4.5,
) -> dict[str, Any]:
    """Package only municipal footprints that genuinely fill an OSM gap."""
    osm_footprints = osm_building_footprints(osm_payload)
    if not osm_footprints:
        raise RuntimeError("The cached OSM extract has no usable building footprints")
    tree = STRtree(osm_footprints)
    retained: list[dict[str, Any]] = []
    source_features = collection.get("features") or []
    for feature in source_features:
        try:
            centroid = transform(WGS84_TO_UTM17.transform, shape(feature.get("geometry")).centroid)
            nearest_index = int(tree.nearest(centroid))
            if centroid.distance(osm_footprints[nearest_index]) <= tolerance_m:
                continue
        except Exception:  # noqa: BLE001 - keep an official footprint if comparison is uncertain.
            pass
        properties = dict(feature.get("properties") or {})
        properties["ptbo_gap_fill"] = True
        retained.append({**feature, "properties": properties})

    metadata = dict(collection.get("metadata") or {})
    metadata.update({
        "usage": "Desktop municipal building gap-fill over the complete OSM building layer",
        "source_feature_count": len(source_features),
        "gap_fill_feature_count": len(retained),
        "gap_filter": {
            "comparison": "nearest projected OSM building footprint",
            "projection": "EPSG:26917",
            "centroid_tolerance_m": tolerance_m,
            "osm_footprint_count": len(osm_footprints),
        },
    })
    return {
        **collection,
        "name": "Peterborough official building footprint gap-fill",
        "metadata": metadata,
        "features": retained,
    }


def load_cached_city_road_surfaces(output_dir: Path) -> dict[str, Any]:
    cached_path = output_dir / CITY_ROAD_SURFACES_FILE
    if not cached_path.exists():
        raise RuntimeError(f"No cached City road-surface extract exists at {cached_path}")
    cached = json.loads(cached_path.read_text(encoding="utf-8"))
    if cached.get("type") != "FeatureCollection" or not cached.get("features"):
        raise RuntimeError(f"Cached City road-surface extract is not populated: {cached_path}")
    return cached


def load_cached_city_buildings(output_dir: Path) -> dict[str, Any]:
    cached_path = output_dir / CITY_BUILDINGS_FILE
    if not cached_path.exists():
        raise RuntimeError(f"No cached City building extract exists at {cached_path}")
    cached = json.loads(cached_path.read_text(encoding="utf-8"))
    if cached.get("type") != "FeatureCollection" or not cached.get("features"):
        raise RuntimeError(f"Cached City building extract is not populated: {cached_path}")
    return cached


def fetch_or_reuse_city_road_surfaces(
    session: requests.Session,
    output_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    """Prefer current surveyed road geometry while retaining an offline packaged cache."""
    try:
        collection, metadata = fetch_city_road_surfaces(session)
        return collection, metadata, False
    except Exception as exc:  # noqa: BLE001 - a validated local snapshot remains a safe fallback.
        try:
            cached = load_cached_city_road_surfaces(output_dir)
        except Exception:  # noqa: BLE001
            raise exc
        metadata = cached.get("metadata") or {
            "source": "City of Peterborough Basedata",
            "service_url": CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": "EPSG:4326",
            "query_bbox": list(BBOX),
            "layers": [],
        }
        log(f"City road-surface download unavailable; reusing cached {CITY_ROAD_SURFACES_FILE}: {exc}")
        return cached, metadata, True


def fetch_or_reuse_city_buildings(
    session: requests.Session,
    output_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    """Prefer the current municipal footprints but keep the packaged city usable offline."""
    try:
        collection, metadata = fetch_city_buildings(session)
        return collection, metadata, False
    except Exception as exc:  # noqa: BLE001 - a validated local snapshot remains a safe fallback.
        try:
            cached = load_cached_city_buildings(output_dir)
        except Exception:  # noqa: BLE001
            raise exc
        metadata = cached.get("metadata") or {
            "source": "City of Peterborough Basedata",
            "service_url": CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": "EPSG:4326",
            "query_bbox": list(BBOX),
            "layers": [],
        }
        log(f"City building download unavailable; reusing cached {CITY_BUILDINGS_FILE}: {exc}")
        return cached, metadata, True


def osm_road_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for element in payload.get("elements", []):
        if element.get("type") != "way":
            continue
        tags = element.get("tags") or {}
        highway = str(tags.get("highway", ""))
        if not highway or highway in DRIVABLE_EXCLUDE or tags.get("area") == "yes":
            continue
        coordinates = []
        for vertex in element.get("geometry") or []:
            try:
                coordinates.append([float(vertex["lon"]), float(vertex["lat"])])
            except (KeyError, TypeError, ValueError):
                continue
        if len(coordinates) < 2:
            continue
        properties = {
            "osm_id": element.get("id"),
            "name": tags.get("name") or tags.get("official_name") or tags.get("ref") or "",
            "highway": highway,
            "ref": tags.get("ref") or "",
            "oneway": tags.get("oneway") or "",
            "bridge": tags.get("bridge") or "",
            "tunnel": tags.get("tunnel") or "",
            "lanes": tags.get("lanes") or "",
            "surface": tags.get("surface") or "",
            "access": tags.get("access") or "",
            "service": tags.get("service") or "",
        }
        features.append({"type": "Feature", "id": f"way/{element.get('id')}", "properties": properties, "geometry": {"type": "LineString", "coordinates": coordinates}})
    return features


def is_public_osm_road(feature: dict[str, Any]) -> bool:
    """Return whether a rendered OSM road is a public navigable street for ORN QA.

    The city renderer intentionally includes parking/service roads, paths, and
    private circulation for visual completeness. ORN is a public-road reference,
    so comparing those two classes directly creates false large offsets.
    """
    properties = feature.get("properties") or {}
    highway = str(properties.get("highway") or "")
    access = str(properties.get("access") or "").lower()
    service = str(properties.get("service") or "").lower()
    if highway in PUBLIC_ROAD_EXCLUDE or access in PRIVATE_ACCESS_VALUES:
        return False
    if service in {"driveway", "parking_aisle", "alley", "emergency_access"}:
        return False
    return highway in {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"}


def discover_orn_service(session: requests.Session) -> tuple[str, dict[str, Any]]:
    queries = (
        'title:"Ontario Road Network (ORN) Road Net Element"',
        '"Ontario Road Network" "Road Net Element"',
        'Road Net Element owner:mnrf',
        'Ontario Road Network type:"Feature Service"',
    )
    candidates: list[dict[str, Any]] = []
    for query in queries:
        response = session.get(ARCGIS_SEARCH_URL, params={"f": "json", "num": 100, "q": query}, timeout=45)
        response.raise_for_status()
        candidates.extend(response.json().get("results", []))

    def score(item: dict[str, Any]) -> int:
        title = str(item.get("title", "")).lower()
        item_type = str(item.get("type", "")).lower()
        owner = str(item.get("owner", "")).lower()
        value = 0
        if "ontario road network" in title:
            value += 100
        if "road net element" in title:
            value += 80
        if "feature service" in item_type:
            value += 40
        if owner in {"mnrf", "lio", "ontariomnr", "ontario_mnrf"} or "mnrf" in owner:
            value += 20
        if item.get("url"):
            value += 10
        return value

    unique = {item.get("id"): item for item in candidates if item.get("id")}
    ranked = sorted(unique.values(), key=score, reverse=True)
    for item in ranked:
        if score(item) < 100:
            continue
        service_url = item.get("url")
        if service_url:
            return str(service_url).rstrip("/"), item
        item_response = session.get(f"https://www.arcgis.com/sharing/rest/content/items/{item['id']}", params={"f": "json"}, timeout=30)
        item_response.raise_for_status()
        service_url = item_response.json().get("url")
        if service_url:
            return str(service_url).rstrip("/"), item
    raise RuntimeError("Could not discover the Ontario Road Network Road Net Element Feature Service")


def choose_orn_layer(session: requests.Session, service_url: str) -> tuple[str, dict[str, Any]]:
    metadata_response = session.get(service_url, params={"f": "json"}, timeout=45)
    metadata_response.raise_for_status()
    metadata = metadata_response.json()
    layers = metadata.get("layers") or []
    if not layers and metadata.get("geometryType"):
        return service_url, metadata
    ranked = sorted(
        layers,
        key=lambda layer: (
            "road net element" in str(layer.get("name", "")).lower(),
            "road" in str(layer.get("name", "")).lower(),
            "line" in str(layer.get("name", "")).lower(),
        ),
        reverse=True,
    )
    if not ranked:
        raise RuntimeError("ORN service contained no queryable layers")
    layer_url = f"{service_url}/{ranked[0]['id']}"
    layer_response = session.get(layer_url, params={"f": "json"}, timeout=45)
    layer_response.raise_for_status()
    return layer_url, layer_response.json()


def esri_json_to_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    fields = payload.get("fields") or []
    field_names = [field.get("name") for field in fields]
    features: list[dict[str, Any]] = []
    for item in payload.get("features", []):
        attributes = item.get("attributes") or {}
        if field_names and isinstance(attributes, list):
            attributes = dict(zip(field_names, attributes))
        paths = (item.get("geometry") or {}).get("paths") or []
        geometry = {"type": "LineString", "coordinates": paths[0]} if len(paths) == 1 else {"type": "MultiLineString", "coordinates": paths}
        if not paths:
            continue
        features.append({"type": "Feature", "properties": attributes, "geometry": geometry})
    return features


def fetch_orn_features(session: requests.Session) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    service_url, item = discover_orn_service(session)
    layer_url, layer_metadata = choose_orn_layer(session, service_url)
    west, south, east, north = BBOX
    page_size = min(int(layer_metadata.get("maxRecordCount") or 2000), 5000)
    offset = 0
    features: list[dict[str, Any]] = []
    seen_feature_ids: set[str] = set()
    log(f"Querying authoritative ORN layer: {layer_url}")
    while True:
        params = {
            "f": "geojson",
            "where": "1=1",
            "geometry": f"{west},{south},{east},{north}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "*",
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        response = session.get(f"{layer_url}/query", params=params, timeout=120)
        if response.ok:
            payload = response.json()
        else:
            payload = {}
        page = payload.get("features") if isinstance(payload, dict) else None
        if page is None:
            params["f"] = "json"
            response = session.get(f"{layer_url}/query", params=params, timeout=120)
            response.raise_for_status()
            page = esri_json_to_features(response.json())
        if not page:
            break
        # Some ArcGIS MapServer GeoJSON responses omit exceededTransferLimit
        # even when more rows can be reached using resultOffset. Keep probing
        # until an empty/repeated page, guarding against servers that ignore
        # pagination and resend the same rows.
        new_features: list[dict[str, Any]] = []
        for feature in page:
            properties = feature.get("properties") or {}
            feature_id = str(properties.get("OBJECTID") or properties.get("OGF_ID") or "")
            if not feature_id:
                feature_id = json.dumps(feature.get("geometry") or {}, sort_keys=True, separators=(",", ":"))
            if feature_id in seen_feature_ids:
                continue
            seen_feature_ids.add(feature_id)
            new_features.append(feature)
        if not new_features:
            break
        features.extend(new_features)
        offset += len(page)
        if offset > 100000:
            raise RuntimeError("ORN pagination exceeded the safety limit")
    if not features:
        raise RuntimeError("ORN query returned no roads inside the Peterborough bounding box")
    source = {
        "arcgis_item_id": item.get("id"),
        "title": item.get("title"),
        "owner": item.get("owner"),
        "service_url": service_url,
        "layer_url": layer_url,
        "layer_name": layer_metadata.get("name"),
        "last_edit_date": layer_metadata.get("editingInfo", {}).get("lastEditDate"),
    }
    return features, source


def tile_xy(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    scale = 2**zoom
    x = int((lon + 180.0) / 360.0 * scale)
    radians = math.radians(max(min(lat, 85.05112878), -85.05112878))
    y = int((1.0 - math.log(math.tan(radians) + 1.0 / math.cos(radians)) / math.pi) / 2.0 * scale)
    return x, y


def cache_terrain(session: requests.Session, output_dir: Path) -> list[str]:
    center_x, center_y = tile_xy(CITY_CENTER[0], CITY_CENTER[1], TERRAIN_ZOOM)
    cached: list[str] = []
    for y in range(center_y - TERRAIN_RADIUS, center_y + TERRAIN_RADIUS + 1):
        for x in range(center_x - TERRAIN_RADIUS, center_x + TERRAIN_RADIUS + 1):
            relative = Path("terrain") / str(TERRAIN_ZOOM) / str(x) / f"{y}.png"
            destination = output_dir / relative
            url = f"{TERRARIUM_ROOT}/{TERRAIN_ZOOM}/{x}/{y}.png"
            response = session.get(url, timeout=60)
            response.raise_for_status()
            if not response.content.startswith(b"\x89PNG"):
                raise RuntimeError(f"Terrain tile was not PNG data: {url}")
            atomic_write_bytes(destination, response.content)
            cached.append(relative.as_posix())
    return cached


def prepare_official_terrain(output_dir: Path, refresh: bool = False) -> dict[str, Any]:
    """Build or integrity-check the packaged Ontario lidar terrain asset."""
    output_png = output_dir / OFFICIAL_TERRAIN_ASSET
    output_metadata = output_dir / OFFICIAL_TERRAIN_METADATA
    if refresh or not output_png.exists() or not output_metadata.exists():
        log('Building the official Ontario 2025 lidar terrain heightmap')
        metadata = build_official_lidar_terrain(output_png, output_metadata)
    else:
        metadata = json.loads(output_metadata.read_text(encoding='utf-8'))

    expected_asset = output_metadata.parent / str(metadata.get('asset') or '')
    if expected_asset.resolve() != output_png.resolve():
        raise RuntimeError('Official terrain metadata points to an unexpected asset')
    payload = output_png.read_bytes()
    integrity = metadata.get('integrity') or {}
    if len(payload) != int(integrity.get('pngBytes') or -1):
        raise RuntimeError('Official terrain PNG byte count failed integrity validation')
    if hashlib.sha256(payload).hexdigest() != integrity.get('pngSha256'):
        raise RuntimeError('Official terrain PNG SHA-256 failed integrity validation')
    bounds = ((metadata.get('bounds') or {}).get('wgs84Epsg4326') or {})
    declared = (bounds.get('west'), bounds.get('south'), bounds.get('east'), bounds.get('north'))
    if any(value is None for value in declared) or max(abs(float(a) - b) for a, b in zip(declared, BBOX)) > 1e-9:
        raise RuntimeError('Official terrain extent does not match the Peterborough build bounds')
    return metadata


def flatten_lines(
    features: Iterable[dict[str, Any]],
    transformer: Transformer,
    *,
    clip_area: Any | None = None,
) -> tuple[list[LineString], list[dict[str, Any]]]:
    lines: list[LineString] = []
    properties: list[dict[str, Any]] = []
    for feature in features:
        try:
            geometry = shape(feature.get("geometry"))
        except Exception:  # noqa: BLE001 - invalid upstream feature is skipped.
            continue
        projected = transform(transformer.transform, geometry)
        if clip_area is not None:
            projected = projected.intersection(clip_area)
        pieces: Sequence[LineString]
        if isinstance(projected, LineString):
            pieces = [projected]
        elif isinstance(projected, MultiLineString):
            pieces = list(projected.geoms)
        elif hasattr(projected, "geoms"):
            pieces = [item for item in projected.geoms if isinstance(item, LineString)]
        else:
            continue
        for line in pieces:
            if line.length < 1:
                continue
            lines.append(line)
            properties.append(feature.get("properties") or {})
    return lines, properties


def sample_line(line: LineString, spacing: float = 15.0, max_points: int = 300) -> Iterator[Point]:
    count = min(max_points, max(2, int(math.ceil(line.length / spacing)) + 1))
    for index in range(count):
        distance = line.length * index / (count - 1)
        yield line.interpolate(distance)


def percentile(values: Sequence[float], percent: float) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent / 100.0
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def normalize_name(value: Any) -> str:
    text = str(value or "").upper().strip()
    replacements = {
        "STREET": "ST",
        "ROAD": "RD",
        "AVENUE": "AVE",
        "BOULEVARD": "BLVD",
        "DRIVE": "DR",
        "LANE": "LN",
        "COURT": "CRT",
        "CRESCENT": "CRES",
        "PARKWAY": "PKWY",
        "HIGHWAY": "HWY",
        "PLACE": "PL",
        "TRAIL": "TRL",
    }
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    words = [replacements.get(word, word) for word in text.split()]
    return " ".join(words)


def orn_name(properties: dict[str, Any]) -> str:
    scored: list[tuple[int, str]] = []
    for key, value in properties.items():
        if isinstance(value, list):
            value = next((item for item in value if isinstance(item, str) and item.strip()), "")
        if not isinstance(value, str) or not value.strip():
            continue
        lowered = str(key).lower()
        score = 0
        if lowered in {"streetname", "street_name", "roadname", "road_name", "official_name", "rtename1en", "name"}:
            score += 100
        if lowered == "official_names":
            score += 100
        if "name" in lowered:
            score += 40
        if lowered in {"route", "route_name", "rte_name", "rtename"}:
            score += 20
        if score:
            scored.append((score, value.strip()))
    return max(scored, default=(0, ""))[1]


def directional_distances(
    source_lines: Sequence[LineString],
    source_properties: Sequence[dict[str, Any]],
    target_lines: Sequence[LineString],
    *,
    source_kind: str,
) -> tuple[list[float], dict[str, list[float]], list[tuple[int, float, int]]]:
    if not target_lines:
        raise RuntimeError("Cannot validate against an empty target road network")
    tree = STRtree(target_lines)
    all_distances: list[float] = []
    by_name: dict[str, list[float]] = defaultdict(list)
    nearest_records: list[tuple[int, float, int]] = []
    for line_index, (line, properties) in enumerate(zip(source_lines, source_properties)):
        line_distances: list[float] = []
        nearest_indices: list[int] = []
        for point in sample_line(line):
            target_index = int(tree.nearest(point))
            distance = float(point.distance(target_lines[target_index]))
            all_distances.append(distance)
            line_distances.append(distance)
            nearest_indices.append(target_index)
        if not line_distances:
            continue
        representative_distance = percentile(line_distances, 90)
        representative_target = statistics.mode(nearest_indices) if nearest_indices else -1
        nearest_records.append((line_index, representative_distance, representative_target))
        raw_name = properties.get("name") if source_kind == "osm" else orn_name(properties)
        normalized = normalize_name(raw_name)
        if normalized:
            by_name[normalized].extend(line_distances)
    return all_distances, by_name, nearest_records


def metric_summary(distances: Sequence[float]) -> dict[str, Any]:
    if not distances:
        return {"samples": 0}
    return {
        "samples": len(distances),
        "mean_m": round(statistics.fmean(distances), 3),
        "median_m": round(statistics.median(distances), 3),
        "p90_m": round(percentile(distances, 90), 3),
        "p95_m": round(percentile(distances, 95), 3),
        "p99_m": round(percentile(distances, 99), 3),
        "within_5m_pct": round(sum(value <= 5 for value in distances) / len(distances) * 100, 2),
        "within_10m_pct": round(sum(value <= 10 for value in distances) / len(distances) * 100, 2),
        "within_20m_pct": round(sum(value <= 20 for value in distances) / len(distances) * 100, 2),
        "within_30m_pct": round(sum(value <= 30 for value in distances) / len(distances) * 100, 2),
    }


def validate_roads(osm_features: list[dict[str, Any]], orn_features: list[dict[str, Any]]) -> dict[str, Any]:
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:26917", always_xy=True)
    west, south, east, north = BBOX
    lower_left = transformer.transform(west, south)
    upper_right = transformer.transform(east, north)
    validation_area = box(
        min(lower_left[0], upper_right[0]),
        min(lower_left[1], upper_right[1]),
        max(lower_left[0], upper_right[0]),
        max(lower_left[1], upper_right[1]),
    )
    osm_lines, osm_properties = flatten_lines(osm_features, transformer, clip_area=validation_area)
    orn_lines, orn_properties = flatten_lines(orn_features, transformer, clip_area=validation_area)
    if not osm_lines or not orn_lines:
        raise RuntimeError(f"Insufficient road geometry: OSM={len(osm_lines)} ORN={len(orn_lines)}")

    osm_distances, osm_by_name, osm_nearest = directional_distances(osm_lines, osm_properties, orn_lines, source_kind="osm")
    orn_distances, orn_by_name, _ = directional_distances(orn_lines, orn_properties, osm_lines, source_kind="orn")

    problem_streets: list[dict[str, Any]] = []
    for name, distances in osm_by_name.items():
        if len(distances) < 6:
            continue
        summary = metric_summary(distances)
        if summary.get("p90_m", 0) > 18 or summary.get("within_10m_pct", 100) < 75:
            problem_streets.append({"name": name, **summary})
    problem_streets.sort(key=lambda item: (item.get("p90_m", 0), -item.get("within_10m_pct", 100)), reverse=True)

    name_checks = 0
    name_matches = 0
    name_mismatches: list[dict[str, Any]] = []
    for osm_index, distance, orn_index in osm_nearest:
        osm_name = normalize_name(osm_properties[osm_index].get("name"))
        if not osm_name or orn_index < 0 or distance > 20:
            continue
        reference_name = normalize_name(orn_name(orn_properties[orn_index]))
        if not reference_name:
            continue
        name_checks += 1
        if osm_name == reference_name or osm_name in reference_name or reference_name in osm_name:
            name_matches += 1
        elif len(name_mismatches) < 50:
            name_mismatches.append({"osm": osm_name, "orn": reference_name, "distance_m": round(distance, 2)})

    osm_summary = metric_summary(osm_distances)
    orn_summary = metric_summary(orn_distances)
    passed = (
        osm_summary.get("median_m", math.inf) <= 8
        and osm_summary.get("within_20m_pct", 0) >= 90
        and orn_summary.get("within_20m_pct", 0) >= 85
    )
    return {
        "status": "pass" if passed else "review",
        "criteria": {
            "osm_to_orn_median_max_m": 8,
            "osm_to_orn_within_20m_min_pct": 90,
            "orn_to_osm_within_20m_min_pct": 85,
        },
        "osm_feature_count": len(osm_features),
        "orn_feature_count": len(orn_features),
        "osm_line_count": len(osm_lines),
        "orn_line_count": len(orn_lines),
        "osm_to_orn": osm_summary,
        "orn_to_osm": orn_summary,
        "name_comparison": {
            "checked_segments": name_checks,
            "matching_segments": name_matches,
            "match_pct": round(name_matches / name_checks * 100, 2) if name_checks else None,
            "sample_mismatches": name_mismatches,
        },
        "streets_requiring_review": problem_streets[:75],
        "method": "Road centrelines were projected to NAD83 / UTM zone 17N and sampled every ~15 m. Each sample was measured to the nearest line in the comparison network in both directions.",
        "limitations": [
            "Divided roads may use one centreline in one source and separate carriageways in the other.",
            "New construction can appear in one source before the other is updated.",
            "This validates centreline geometry, not curb edges, lane markings, grades, turn restrictions, or legal survey boundaries.",
        ],
    }


def report_markdown(result: dict[str, Any], orn_source: dict[str, Any], generated_at: str) -> str:
    osm = result["osm_to_orn"]
    reverse = result["orn_to_osm"]
    name = result["name_comparison"]
    name_agreement = f"{name['match_pct']:.2f}%" if isinstance(name.get("match_pct"), (int, float)) else "not available from this ORN layer"
    review_rows = result.get("streets_requiring_review") or []
    lines = [
        "# Peterborough Road Alignment Validation",
        "",
        f"Generated: {generated_at}",
        "",
        f"**Result: {result['status'].upper()}**",
        "",
        "The browser road geometry is built from the cached OpenStreetMap extract. This report compares public OSM road centrelines with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.",
        "",
        "## Source data",
        "",
        f"- Public OSM road features used for validation: **{result['osm_feature_count']:,}**",
        f"- ORN road features in the same bounding box: **{result['orn_feature_count']:,}**",
        f"- ORN item: `{orn_source.get('title') or 'Ontario Road Network'}`",
        f"- ORN owner: `{orn_source.get('owner') or 'unknown'}`",
        f"- ORN layer: `{orn_source.get('layer_name') or orn_source.get('layer_url')}`",
        "",
        "## Positional comparison",
        "",
        "| Direction | Median | 90th percentile | 95th percentile | Within 10 m | Within 20 m |",
        "|---|---:|---:|---:|---:|---:|",
        f"| OSM → ORN | {osm.get('median_m', float('nan')):.2f} m | {osm.get('p90_m', float('nan')):.2f} m | {osm.get('p95_m', float('nan')):.2f} m | {osm.get('within_10m_pct', 0):.2f}% | {osm.get('within_20m_pct', 0):.2f}% |",
        f"| ORN → OSM | {reverse.get('median_m', float('nan')):.2f} m | {reverse.get('p90_m', float('nan')):.2f} m | {reverse.get('p95_m', float('nan')):.2f} m | {reverse.get('within_10m_pct', 0):.2f}% | {reverse.get('within_20m_pct', 0):.2f}% |",
        "",
        "The two-direction check catches both displaced OSM streets and authoritative ORN streets that may be absent from the game extract.",
        "",
        "## Street-name comparison",
        "",
        f"- Segments with usable names in both sources: **{name.get('checked_segments', 0):,}**",
        f"- Normalized name agreement: **{name_agreement}**",
        "",
        "## Streets flagged for manual review",
        "",
    ]
    if review_rows:
        lines.extend(["| Street | P90 offset | Within 10 m | Samples |", "|---|---:|---:|---:|"])
        for row in review_rows[:30]:
            lines.append(f"| {row['name']} | {row.get('p90_m', 0):.2f} m | {row.get('within_10m_pct', 0):.2f}% | {row.get('samples', 0):,} |")
    else:
        lines.append("No named streets exceeded the automated review thresholds.")
    lines.extend(
        [
            "",
            "## Method and limits",
            "",
            result["method"],
            "",
            *[f"- {item}" for item in result["limitations"]],
            "",
            "A passing report means the road centrelines meet the project's automated alignment thresholds. It does not mean every curb, lane, bridge deck, driveway, or recent construction project has been field-surveyed.",
            "",
        ]
    )
    return "\n".join(lines)


def validate_projection_roundtrip() -> None:
    lat0, lon0 = CITY_CENTER
    lat_scale = 110540.0
    lon_scale = 111320.0 * math.cos(math.radians(lat0))
    reference_points = [
        CITY_CENTER,
        (44.3072, -78.3009),
        (44.3572, -78.2907),
        (44.2682, -78.3717),
    ]
    for lat, lon in reference_points:
        x = (lon - lon0) * lon_scale
        z = -(lat - lat0) * lat_scale
        rebuilt_lat = lat0 - z / lat_scale
        rebuilt_lon = lon0 + x / lon_scale
        if abs(rebuilt_lat - lat) > 1e-10 or abs(rebuilt_lon - lon) > 1e-10:
            raise AssertionError("Browser project/unproject formulas failed their round-trip test")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("city-explorer/data"))
    parser.add_argument("--report", type=Path, default=Path("city-explorer/ROAD-VALIDATION.md"))
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when alignment criteria require review")
    parser.add_argument("--allow-orn-unavailable", action="store_true", help="Generate OSM assets even when ORN discovery/query fails")
    parser.add_argument("--reuse-osm", action="store_true", help="Rebuild derived assets from the locally cached OSM extract without contacting Overpass")
    parser.add_argument("--refresh-official-terrain", action="store_true", help="Re-export the packaged Ontario lidar terrain instead of integrity-checking the current asset")
    parser.add_argument("--road-surfaces-only", action="store_true", help="Refresh only the official City pavement/curb asset and its manifest entry")
    args = parser.parse_args()

    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    args.output.mkdir(parents=True, exist_ok=True)
    validate_projection_roundtrip()
    session = request_session()

    if args.road_surfaces_only:
        city_road_surfaces, city_road_surface_source, city_road_surface_cache_reused = fetch_or_reuse_city_road_surfaces(
            session,
            args.output,
        )
        city_road_surface_counts = layer_counts(city_road_surfaces, CITY_ROAD_SURFACE_LAYERS)
        atomic_write_json(args.output / CITY_ROAD_SURFACES_FILE, city_road_surfaces, compact=True)
        city_buildings, city_building_source, city_building_cache_reused = fetch_or_reuse_city_buildings(
            session,
            args.output,
        )
        city_buildings = filter_city_building_gap_fill(city_buildings, load_cached_osm(args.output))
        city_building_counts = layer_counts(city_buildings, CITY_BUILDING_LAYERS)
        atomic_write_json(args.output / CITY_BUILDINGS_FILE, city_buildings, compact=True)
        manifest_path = args.output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {
            "schema_version": 1,
            "city": CITY_NAME,
            "center": {"lat": CITY_CENTER[0], "lon": CITY_CENTER[1]},
            "bbox": {"west": BBOX[0], "south": BBOX[1], "east": BBOX[2], "north": BBOX[3]},
        }
        manifest["generated_at"] = generated_at
        manifest["city_road_surfaces"] = {
            "file": CITY_ROAD_SURFACES_FILE,
            "feature_count": len(city_road_surfaces.get("features") or []),
            "layer_counts": city_road_surface_counts,
            "source": city_road_surface_source.get("source") or "City of Peterborough Basedata",
            "source_url": city_road_surface_source.get("service_url") or CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": city_road_surface_source.get("spatial_reference") or "EPSG:4326",
            "query_bbox": city_road_surface_source.get("query_bbox") or list(BBOX),
            "layers": city_road_surface_source.get("layers") or [],
            "cache_reused": city_road_surface_cache_reused,
            "simplification_tolerance_m": {
                "official_streets": 0.12,
                "curb_edges": 0.08,
                "parking_surfaces": 0.15,
                "road_surfaces": 0.10,
                "bridges": 0.05,
            },
        }
        manifest["city_buildings"] = {
            "file": CITY_BUILDINGS_FILE,
            "feature_count": len(city_buildings.get("features") or []),
            "layer_counts": city_building_counts,
            "source": city_building_source.get("source") or "City of Peterborough Basedata",
            "source_url": city_building_source.get("service_url") or CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": "EPSG:4326",
            "query_bbox": list(BBOX),
            "layers": city_building_source.get("layers") or [],
            "desktop_detail_layer": True,
            "source_feature_count": city_buildings.get("metadata", {}).get("source_feature_count"),
            "gap_filter": city_buildings.get("metadata", {}).get("gap_filter"),
            "cache_reused": city_building_cache_reused,
            "simplification_tolerance_m": 0.08,
        }
        manifest["current_data_audit"] = {
            "file": CONSTRUCTION_AUDIT_FILE,
            "policy": "Only authoritative completed geometry changes alter the packaged city",
        }
        atomic_write_json(manifest_path, manifest)
        log(
            f"Generated {len(city_road_surfaces.get('features') or []):,} official City road-surface features "
            f"({city_road_surface_counts})"
        )
        return 0

    if args.reuse_osm:
        osm_payload = load_cached_osm(args.output)
        log(f"Rebuilding from cached OSM extract dated {osm_payload.get('osm3s', {}).get('timestamp_osm_base', 'unknown date')}")
    else:
        osm_payload = fetch_or_reuse_osm(session, args.output)
    osm_features = osm_road_features(osm_payload)
    public_osm_features = [feature for feature in osm_features if is_public_osm_road(feature)]
    atomic_write_json(args.output / "peterborough-osm.json", osm_payload, compact=True)
    atomic_write_json(args.output / "osm-roads.geojson", {"type": "FeatureCollection", "features": osm_features}, compact=True)
    atomic_write_json(args.output / "osm-public-roads.geojson", {"type": "FeatureCollection", "features": public_osm_features}, compact=True)

    city_open_data, city_open_data_source, city_open_data_cache_reused = fetch_or_reuse_city_open_data(session, args.output)
    city_open_data_counts = city_open_data_layer_counts(city_open_data)
    atomic_write_json(args.output / CITY_OPEN_DATA_FILE, city_open_data, compact=True)

    city_road_surfaces, city_road_surface_source, city_road_surface_cache_reused = fetch_or_reuse_city_road_surfaces(
        session,
        args.output,
    )
    city_road_surface_counts = layer_counts(city_road_surfaces, CITY_ROAD_SURFACE_LAYERS)
    atomic_write_json(args.output / CITY_ROAD_SURFACES_FILE, city_road_surfaces, compact=True)

    city_buildings, city_building_source, city_building_cache_reused = fetch_or_reuse_city_buildings(
        session,
        args.output,
    )
    city_buildings = filter_city_building_gap_fill(city_buildings, osm_payload)
    city_building_counts = layer_counts(city_buildings, CITY_BUILDING_LAYERS)
    atomic_write_json(args.output / CITY_BUILDINGS_FILE, city_buildings, compact=True)

    hydrography, hydrography_source, hydrography_cache_reused, hydrography_validation = fetch_or_reuse_hydrography(
        session,
        args.output,
        BBOX,
    )
    atomic_write_json(args.output / HYDROGRAPHY_FILE, hydrography, compact=True)
    atomic_write_json(args.output / HYDRO_VALIDATION_FILE, hydrography_validation)

    official_terrain = prepare_official_terrain(args.output, args.refresh_official_terrain)
    terrain_files = cache_terrain(session, args.output)
    orn_features: list[dict[str, Any]] = []
    orn_source: dict[str, Any] = {}
    validation: dict[str, Any]
    try:
        orn_features, orn_source = fetch_orn_features(session)
        atomic_write_json(args.output / "orn-roads.geojson", {"type": "FeatureCollection", "features": orn_features}, compact=True)
        validation = validate_roads(public_osm_features, orn_features)
    except Exception as exc:  # noqa: BLE001
        if not args.allow_orn_unavailable:
            raise
        log(f"ORN validation unavailable: {exc}")
        validation = {
            "status": "unavailable",
            "error": str(exc),
            "osm_feature_count": len(public_osm_features),
            "orn_feature_count": 0,
            "limitations": ["The authoritative ORN source could not be queried during this run."],
        }

    atomic_write_json(args.output / "road-validation.json", validation)
    if validation.get("status") in {"pass", "review"}:
        args.report.write_text(report_markdown(validation, orn_source, generated_at), encoding="utf-8")
    else:
        args.report.write_text(
            "# Peterborough Road Alignment Validation\n\n"
            f"Generated: {generated_at}\n\n"
            "**Result: UNAVAILABLE**\n\n"
            f"The authoritative ORN service could not be queried: `{validation.get('error', 'unknown error')}`\n",
            encoding="utf-8",
        )

    manifest = {
        "schema_version": 1,
        "generated_at": generated_at,
        "city": CITY_NAME,
        "center": {"lat": CITY_CENTER[0], "lon": CITY_CENTER[1]},
        "bbox": {"west": BBOX[0], "south": BBOX[1], "east": BBOX[2], "north": BBOX[3]},
        "osm": {
            "file": "peterborough-osm.json",
            "road_file": "osm-roads.geojson",
            "public_road_file": "osm-public-roads.geojson",
            "element_count": len(osm_payload.get("elements", [])),
            "drivable_road_count": len(osm_features),
            "public_road_count": len(public_osm_features),
            "source": "OpenStreetMap via Overpass API",
        },
        "terrain": {
            "source": official_terrain["source"]["dataset"],
            "official": {
                "asset_file": OFFICIAL_TERRAIN_ASSET.as_posix(),
                "metadata_file": OFFICIAL_TERRAIN_METADATA.as_posix(),
                "project": official_terrain["source"]["project"],
                "vertical_datum": official_terrain["elevation"]["verticalDatum"],
                "local_ground_resolution_m": official_terrain["resolution"]["approximateLocalGroundMetresPerPixelAtCenterLatitude"],
                "generated_at": official_terrain["generatedAtUtc"],
            },
            "fallback": {
                "zoom": TERRAIN_ZOOM,
                "files": terrain_files,
                "source": "Mapzen/Tilezen Terrarium",
            },
            "zoom": TERRAIN_ZOOM,
            "files": terrain_files,
        },
        "city_open_data": {
            "file": CITY_OPEN_DATA_FILE,
            "feature_count": len(city_open_data.get("features") or []),
            "layer_counts": city_open_data_counts,
            "source": city_open_data_source.get("source") or "City of Peterborough eMaps",
            "source_url": city_open_data_source.get("service_url") or CITY_EMAPS_SERVICE_URL,
            "spatial_reference": city_open_data_source.get("spatial_reference") or "EPSG:4326",
            "query_bbox": city_open_data_source.get("query_bbox") or list(BBOX),
            "layers": city_open_data_source.get("layers") or [],
            "cache_reused": city_open_data_cache_reused,
        },
        "city_road_surfaces": {
            "file": CITY_ROAD_SURFACES_FILE,
            "feature_count": len(city_road_surfaces.get("features") or []),
            "layer_counts": city_road_surface_counts,
            "source": city_road_surface_source.get("source") or "City of Peterborough Basedata",
            "source_url": city_road_surface_source.get("service_url") or CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": city_road_surface_source.get("spatial_reference") or "EPSG:4326",
            "query_bbox": city_road_surface_source.get("query_bbox") or list(BBOX),
            "layers": city_road_surface_source.get("layers") or [],
            "cache_reused": city_road_surface_cache_reused,
            "simplification_tolerance_m": {
                "official_streets": 0.12,
                "curb_edges": 0.08,
                "parking_surfaces": 0.15,
                "road_surfaces": 0.10,
                "bridges": 0.05,
            },
        },
        "city_buildings": {
            "file": CITY_BUILDINGS_FILE,
            "feature_count": len(city_buildings.get("features") or []),
            "layer_counts": city_building_counts,
            "source": city_building_source.get("source") or "City of Peterborough Basedata",
            "source_url": city_building_source.get("service_url") or CITY_BASEDATA_SERVICE_URL,
            "spatial_reference": "EPSG:4326",
            "query_bbox": list(BBOX),
            "layers": city_building_source.get("layers") or [],
            "desktop_detail_layer": True,
            "source_feature_count": city_buildings.get("metadata", {}).get("source_feature_count"),
            "gap_filter": city_buildings.get("metadata", {}).get("gap_filter"),
            "cache_reused": city_building_cache_reused,
            "simplification_tolerance_m": 0.08,
        },
        "current_data_audit": {
            "file": CONSTRUCTION_AUDIT_FILE,
            "policy": "Only authoritative completed geometry changes alter the packaged city",
        },
        "hydrography": {
            "file": HYDROGRAPHY_FILE,
            "validation_file": HYDRO_VALIDATION_FILE,
            "feature_count": len(hydrography.get("features") or []),
            "source_counts": hydrography_validation.get("source_counts") or {},
            "status": hydrography_validation.get("status"),
            "source": hydrography_source.get("source") or "Ontario Ministry of Natural Resources - Geospatial Ontario",
            "vertical_datum": hydrography_source.get("vertical_datum") or "CGVD2013",
            "lidar_breaklines_url": hydrography_source.get("lidar_breaklines_url"),
            "ohn_waterbody_url": hydrography_source.get("ohn_waterbody_url"),
            "ohn_watercourse_url": hydrography_source.get("ohn_watercourse_url"),
            "cache_reused": hydrography_cache_reused,
        },
        "orn": {**orn_source, "file": "orn-roads.geojson" if orn_features else None, "feature_count": len(orn_features)},
        "road_validation": {
            "file": "road-validation.json",
            "report": "../ROAD-VALIDATION.md",
            "status": validation.get("status"),
            "osm_to_orn": validation.get("osm_to_orn"),
            "orn_to_osm": validation.get("orn_to_osm"),
        },
    }
    atomic_write_json(args.output / "manifest.json", manifest)
    log(
        f"Generated {len(osm_payload.get('elements', [])):,} OSM elements, "
        f"{len(osm_features):,} rendered roads, {len(public_osm_features):,} public OSM roads, "
        f"{len(city_open_data.get('features') or []):,} official City eMaps features, "
        f"{len(city_road_surfaces.get('features') or []):,} official City road-surface features, "
        f"{len(hydrography.get('features') or []):,} official hydro features, "
        f"and {len(orn_features):,} ORN roads"
    )
    log(f"Road validation status: {validation.get('status')}")

    if args.strict and validation.get("status") != "pass":
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
