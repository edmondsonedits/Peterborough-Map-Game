#!/usr/bin/env python3
"""Build and validate deployment-time Peterborough map assets.

The script downloads one bounded OpenStreetMap extract, caches the Terrarium
terrain tiles used by the browser, discovers Ontario's authoritative Ontario
Road Network (ORN) Feature Service, and compares OSM road centrelines against
ORN in NAD83 / UTM zone 17N metres.

Generated files are deterministic apart from upstream data updates:
  city-explorer/data/manifest.json
  city-explorer/data/peterborough-osm.json
  city-explorer/data/osm-roads.geojson
  city-explorer/data/orn-roads.geojson
  city-explorer/data/road-validation.json
  city-explorer/data/terrain/<z>/<x>/<y>.png
  city-explorer/ROAD-VALIDATION.md
"""

from __future__ import annotations

import argparse
import datetime as dt
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
from shapely.geometry import LineString, MultiLineString, Point, mapping, shape
from shapely.ops import transform
from shapely.strtree import STRtree

CITY_NAME = "Peterborough, Ontario"
CITY_CENTER = (44.3091, -78.3197)  # lat, lon
# Broad enough to include the full urban road network, Trent and Fleming.
BBOX = (-78.405, 44.245, -78.245, 44.385)  # west, south, east, north
TERRAIN_ZOOM = 12
TERRAIN_RADIUS = 1
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
}
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
)
ARCGIS_SEARCH_URL = "https://www.arcgis.com/sharing/rest/search"
TERRARIUM_ROOT = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
USER_AGENT = "Peterborough-3D-City-Explorer/1.0 (open-source geospatial build pipeline)"


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
        }
        features.append({"type": "Feature", "id": f"way/{element.get('id')}", "properties": properties, "geometry": {"type": "LineString", "coordinates": coordinates}})
    return features


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
        features.extend(page)
        if len(page) < page_size:
            break
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


def flatten_lines(features: Iterable[dict[str, Any]], transformer: Transformer) -> tuple[list[LineString], list[dict[str, Any]]]:
    lines: list[LineString] = []
    properties: list[dict[str, Any]] = []
    for feature in features:
        try:
            geometry = shape(feature.get("geometry"))
        except Exception:  # noqa: BLE001 - invalid upstream feature is skipped.
            continue
        projected = transform(transformer.transform, geometry)
        pieces: Sequence[LineString]
        if isinstance(projected, LineString):
            pieces = [projected]
        elif isinstance(projected, MultiLineString):
            pieces = list(projected.geoms)
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
        if not isinstance(value, str) or not value.strip():
            continue
        lowered = str(key).lower()
        score = 0
        if lowered in {"streetname", "street_name", "roadname", "road_name", "official_name", "rtename1en", "name"}:
            score += 100
        if "name" in lowered:
            score += 40
        if any(token in lowered for token in ("street", "road", "route", "rte")):
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
    osm_lines, osm_properties = flatten_lines(osm_features, transformer)
    orn_lines, orn_properties = flatten_lines(orn_features, transformer)
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
    review_rows = result.get("streets_requiring_review") or []
    lines = [
        "# Peterborough Road Alignment Validation",
        "",
        f"Generated: {generated_at}",
        "",
        f"**Result: {result['status'].upper()}**",
        "",
        "The browser road geometry is built from the cached OpenStreetMap extract. This report compares those drivable road centrelines with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.",
        "",
        "## Source data",
        "",
        f"- OSM drivable road features: **{result['osm_feature_count']:,}**",
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
        f"- Normalized name agreement: **{name.get('match_pct') if name.get('match_pct') is not None else 'not available'}%**",
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
    args = parser.parse_args()

    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    args.output.mkdir(parents=True, exist_ok=True)
    validate_projection_roundtrip()
    session = request_session()

    osm_payload = clean_osm_payload(fetch_osm(session))
    osm_features = osm_road_features(osm_payload)
    atomic_write_json(args.output / "peterborough-osm.json", osm_payload, compact=True)
    atomic_write_json(args.output / "osm-roads.geojson", {"type": "FeatureCollection", "features": osm_features}, compact=True)

    terrain_files = cache_terrain(session, args.output)
    orn_features: list[dict[str, Any]] = []
    orn_source: dict[str, Any] = {}
    validation: dict[str, Any]
    try:
        orn_features, orn_source = fetch_orn_features(session)
        atomic_write_json(args.output / "orn-roads.geojson", {"type": "FeatureCollection", "features": orn_features}, compact=True)
        validation = validate_roads(osm_features, orn_features)
    except Exception as exc:  # noqa: BLE001
        if not args.allow_orn_unavailable:
            raise
        log(f"ORN validation unavailable: {exc}")
        validation = {
            "status": "unavailable",
            "error": str(exc),
            "osm_feature_count": len(osm_features),
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
            "element_count": len(osm_payload.get("elements", [])),
            "drivable_road_count": len(osm_features),
            "source": "OpenStreetMap via Overpass API",
        },
        "terrain": {
            "zoom": TERRAIN_ZOOM,
            "files": terrain_files,
            "source": "Mapzen/Tilezen Terrarium",
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
    log(f"Generated {len(osm_payload.get('elements', [])):,} OSM elements, {len(osm_features):,} OSM roads and {len(orn_features):,} ORN roads")
    log(f"Road validation status: {validation.get('status')}")

    if args.strict and validation.get("status") != "pass":
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
