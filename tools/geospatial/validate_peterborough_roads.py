#!/usr/bin/env python3
"""Validate Peterborough street geometry against Ontario's ORN dataset.

This second-stage validator deliberately uses ArcGIS object-ID pagination rather
than trusting a single spatial-query page. ArcGIS may set
`exceededTransferLimit` before `maxRecordCount` is reached when a response has
large geometries, which can otherwise make major streets appear to be missing.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

import requests
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

BBOX = (-78.405, 44.245, -78.245, 44.385)
CITY_CENTER = (44.3091, -78.3197)
UTM_CRS = "EPSG:26917"
USER_AGENT = "Peterborough-3D-City-Explorer/1.0 (road-alignment validation)"
PUBLIC_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "living_street", "road",
}
NON_PUBLIC_ACCESS = {"private", "no", "customers"}
STREET_SUFFIXES = {
    "STREET": "ST", "ROAD": "RD", "AVENUE": "AVE", "BOULEVARD": "BLVD",
    "DRIVE": "DR", "LANE": "LN", "COURT": "CRT", "CRESCENT": "CRES",
    "PARKWAY": "PKWY", "HIGHWAY": "HWY", "PLACE": "PL", "TRAIL": "TRL",
    "TERRACE": "TER", "CIRCLE": "CIR", "GARDENS": "GDNS", "GATE": "GT",
}


def session() -> requests.Session:
    value = requests.Session()
    value.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json,*/*"})
    adapter = requests.adapters.HTTPAdapter(max_retries=3)
    value.mount("https://", adapter)
    return value


def write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 2)
        if not compact:
            handle.write("\n")
    temporary.replace(path)


def query_ids(http: requests.Session, layer_url: str) -> list[int]:
    west, south, east, north = BBOX
    response = http.get(
        f"{layer_url}/query",
        params={
            "f": "json",
            "where": "1=1",
            "geometry": f"{west},{south},{east},{north}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "returnGeometry": "false",
            "returnIdsOnly": "true",
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return [int(value) for value in payload.get("objectIds") or []]


def chunks(values: Sequence[int], size: int) -> Iterator[Sequence[int]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def esri_json_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for item in payload.get("features") or []:
        paths = (item.get("geometry") or {}).get("paths") or []
        if not paths:
            continue
        geometry = {"type": "LineString", "coordinates": paths[0]} if len(paths) == 1 else {"type": "MultiLineString", "coordinates": paths}
        features.append({"type": "Feature", "properties": item.get("attributes") or {}, "geometry": geometry})
    return features


def fetch_complete_orn(http: requests.Session, layer_url: str) -> list[dict[str, Any]]:
    object_ids = query_ids(http, layer_url)
    if not object_ids:
        raise RuntimeError("ORN returned no road object IDs inside the Peterborough bounding box")
    features: list[dict[str, Any]] = []
    for group in chunks(object_ids, 400):
        params = {
            "f": "geojson",
            "objectIds": ",".join(map(str, group)),
            "outFields": "*",
            "outSR": "4326",
            "returnGeometry": "true",
        }
        response = http.get(f"{layer_url}/query", params=params, timeout=180)
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            params["f"] = "json"
            fallback = http.get(f"{layer_url}/query", params=params, timeout=180)
            fallback.raise_for_status()
            page = esri_json_features(fallback.json())
        else:
            page = payload.get("features") or []
        features.extend(page)
    if len(features) < len(object_ids) * 0.98:
        raise RuntimeError(f"ORN object-ID pagination returned {len(features)} of {len(object_ids)} requested features")
    return features


def query_official_names(http: requests.Session, map_service_root: str, road_ids: Sequence[int]) -> dict[int, list[str]]:
    table_url = f"{map_service_root.rstrip('/')}/7"
    names: dict[int, set[str]] = defaultdict(set)
    unique_ids = sorted(set(int(value) for value in road_ids if value is not None))
    for group in chunks(unique_ids, 250):
        where = f"ORN_ROAD_NET_ELEMENT_ID IN ({','.join(map(str, group))})"
        response = http.get(
            f"{table_url}/query",
            params={
                "f": "json",
                "where": where,
                "outFields": "ORN_ROAD_NET_ELEMENT_ID,FULL_STREET_NAME,AGENCY_NAME",
                "returnGeometry": "false",
                "resultRecordCount": 5000,
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(payload["error"])
        for feature in payload.get("features") or []:
            attributes = feature.get("attributes") or {}
            road_id = attributes.get("ORN_ROAD_NET_ELEMENT_ID")
            street_name = str(attributes.get("FULL_STREET_NAME") or "").strip()
            if road_id is not None and street_name:
                names[int(road_id)].add(street_name)
    return {road_id: sorted(values) for road_id, values in names.items()}


def osm_features(raw: dict[str, Any], *, comparable_only: bool) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for element in raw.get("elements") or []:
        tags = element.get("tags") or {}
        highway = str(tags.get("highway") or "")
        if element.get("type") != "way" or not highway or tags.get("area") == "yes":
            continue
        if comparable_only:
            if highway not in PUBLIC_HIGHWAYS:
                continue
            if any(str(tags.get(key) or "").lower() in NON_PUBLIC_ACCESS for key in ("access", "vehicle", "motor_vehicle")):
                continue
        else:
            if highway in {"footway", "cycleway", "path", "steps", "pedestrian", "bridleway", "corridor", "platform", "proposed", "construction"}:
                continue
        coordinates = []
        for vertex in element.get("geometry") or []:
            if vertex and "lon" in vertex and "lat" in vertex:
                coordinates.append([float(vertex["lon"]), float(vertex["lat"])])
        if len(coordinates) < 2:
            continue
        properties = dict(tags)
        properties["osm_id"] = element.get("id")
        features.append({"type": "Feature", "properties": properties, "geometry": {"type": "LineString", "coordinates": coordinates}})
    return features


def flatten(features: Iterable[dict[str, Any]], transformer: Transformer) -> tuple[list[LineString], list[dict[str, Any]]]:
    lines: list[LineString] = []
    properties: list[dict[str, Any]] = []
    for feature in features:
        try:
            projected = transform(transformer.transform, shape(feature.get("geometry")))
        except Exception:
            continue
        pieces = [projected] if isinstance(projected, LineString) else list(projected.geoms) if isinstance(projected, MultiLineString) else []
        for line in pieces:
            if line.length >= 1:
                lines.append(line)
                properties.append(feature.get("properties") or {})
    return lines, properties


def sample_line(line: LineString, spacing: float = 15.0, max_points: int = 350) -> Iterator[Point]:
    count = min(max_points, max(2, int(math.ceil(line.length / spacing)) + 1))
    for index in range(count):
        yield line.interpolate(line.length * index / (count - 1))


def percentile(values: Sequence[float], percent: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return math.nan
    position = (len(ordered) - 1) * percent / 100
    lower, upper = math.floor(position), math.ceil(position)
    return ordered[lower] if lower == upper else ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def metric_summary(values: Sequence[float]) -> dict[str, Any]:
    if not values:
        return {"samples": 0}
    return {
        "samples": len(values),
        "mean_m": round(statistics.fmean(values), 3),
        "median_m": round(statistics.median(values), 3),
        "p90_m": round(percentile(values, 90), 3),
        "p95_m": round(percentile(values, 95), 3),
        "p99_m": round(percentile(values, 99), 3),
        "within_5m_pct": round(sum(value <= 5 for value in values) / len(values) * 100, 2),
        "within_10m_pct": round(sum(value <= 10 for value in values) / len(values) * 100, 2),
        "within_20m_pct": round(sum(value <= 20 for value in values) / len(values) * 100, 2),
        "within_30m_pct": round(sum(value <= 30 for value in values) / len(values) * 100, 2),
    }


def normalize_name(value: Any) -> str:
    text = re.sub(r"[^A-Z0-9 ]+", " ", str(value or "").upper()).strip()
    return " ".join(STREET_SUFFIXES.get(word, word) for word in text.split())


def nearest_distances(
    source_lines: Sequence[LineString],
    source_properties: Sequence[dict[str, Any]],
    target_lines: Sequence[LineString],
) -> tuple[list[float], list[tuple[int, int, float]], dict[str, list[float]]]:
    tree = STRtree(target_lines)
    all_values: list[float] = []
    feature_matches: list[tuple[int, int, float]] = []
    by_name: dict[str, list[float]] = defaultdict(list)
    for source_index, (line, properties) in enumerate(zip(source_lines, source_properties)):
        values: list[float] = []
        target_indexes: list[int] = []
        for point in sample_line(line):
            target_index = int(tree.nearest(point))
            distance = float(point.distance(target_lines[target_index]))
            all_values.append(distance)
            values.append(distance)
            target_indexes.append(target_index)
        if not values:
            continue
        representative_target = statistics.mode(target_indexes)
        p90 = percentile(values, 90)
        feature_matches.append((source_index, representative_target, p90))
        name = normalize_name(properties.get("name") or properties.get("ref"))
        if name:
            by_name[name].extend(values)
    return all_values, feature_matches, by_name


def validate(osm_public: list[dict[str, Any]], osm_all: list[dict[str, Any]], orn: list[dict[str, Any]]) -> dict[str, Any]:
    transformer = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
    public_lines, public_properties = flatten(osm_public, transformer)
    all_lines, all_properties = flatten(osm_all, transformer)
    orn_lines, orn_properties = flatten(orn, transformer)
    if not public_lines or not orn_lines:
        raise RuntimeError("Street validation did not receive both OSM and ORN line geometry")

    public_to_orn, public_matches, by_name = nearest_distances(public_lines, public_properties, orn_lines)
    orn_to_public, _, _ = nearest_distances(orn_lines, orn_properties, public_lines)
    rendered_to_orn, _, _ = nearest_distances(all_lines, all_properties, orn_lines)

    name_checked = 0
    name_matched = 0
    name_mismatches: list[dict[str, Any]] = []
    for source_index, target_index, p90 in public_matches:
        if p90 > 20:
            continue
        osm_name = normalize_name(public_properties[source_index].get("name"))
        official_names = [normalize_name(value) for value in orn_properties[target_index].get("official_names") or []]
        official_names = [value for value in official_names if value]
        if not osm_name or not official_names:
            continue
        name_checked += 1
        if any(osm_name == official or osm_name in official or official in osm_name for official in official_names):
            name_matched += 1
        elif len(name_mismatches) < 75:
            name_mismatches.append({"osm": osm_name, "orn": official_names, "p90_offset_m": round(p90, 2)})

    review_streets: list[dict[str, Any]] = []
    for name, values in by_name.items():
        if len(values) < 8:
            continue
        summary = metric_summary(values)
        if summary.get("p90_m", 0) > 25 or summary.get("within_20m_pct", 100) < 80:
            review_streets.append({"name": name, **summary})
    review_streets.sort(key=lambda row: (row.get("p90_m", 0), -row.get("within_20m_pct", 100)), reverse=True)

    public_summary = metric_summary(public_to_orn)
    reverse_summary = metric_summary(orn_to_public)
    rendered_summary = metric_summary(rendered_to_orn)
    passed = (
        public_summary.get("median_m", math.inf) <= 5
        and public_summary.get("within_20m_pct", 0) >= 90
        and reverse_summary.get("within_20m_pct", 0) >= 95
    )
    return {
        "status": "pass" if passed else "review",
        "criteria": {
            "public_osm_to_orn_median_max_m": 5,
            "public_osm_to_orn_within_20m_min_pct": 90,
            "orn_to_public_osm_within_20m_min_pct": 95,
        },
        "public_osm_feature_count": len(osm_public),
        "rendered_osm_feature_count": len(osm_all),
        "orn_feature_count": len(orn),
        "public_osm_to_orn": public_summary,
        "orn_to_public_osm": reverse_summary,
        "all_rendered_osm_to_orn": rendered_summary,
        "street_names": {
            "checked_segments": name_checked,
            "matching_segments": name_matched,
            "match_pct": round(name_matched / name_checked * 100, 2) if name_checked else None,
            "sample_mismatches": name_mismatches,
        },
        "streets_requiring_review": review_streets[:100],
        "method": "Full ORN object-ID pagination; NAD83 / UTM zone 17N; road centrelines sampled about every 15 metres; nearest-line distance measured in both directions.",
        "scope": "The pass criteria use public drivable OSM streets. Service roads, parking aisles, driveways, tracks and explicitly private roads remain rendered but are reported separately because ORN is not a complete reference for those features.",
        "limitations": [
            "Divided roads may be represented as one centreline in one source and separate carriageways in the other.",
            "New construction and private condominium roads can appear in one dataset before or without appearing in the other.",
            "This validates centreline placement and names, not curbs, lanes, grades, turn rules or legal survey boundaries.",
        ],
    }


def markdown(result: dict[str, Any], source: dict[str, Any], generated_at: str) -> str:
    forward = result["public_osm_to_orn"]
    reverse = result["orn_to_public_osm"]
    rendered = result["all_rendered_osm_to_orn"]
    names = result["street_names"]
    rows = result.get("streets_requiring_review") or []
    output = [
        "# Peterborough Road Alignment Validation", "", f"Generated: {generated_at}", "",
        f"**Result: {result['status'].upper()}**", "",
        "The streets rendered by the explorer come directly from the cached OpenStreetMap geometry. Public drivable streets were independently compared with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.", "",
        "## Completeness safeguard", "",
        "The ORN download uses a spatial object-ID query followed by chunked object-ID requests. This avoids ArcGIS geometry transfer limits silently returning only part of Peterborough's road network.", "",
        "## Sources", "",
        f"- Public OSM road features checked: **{result['public_osm_feature_count']:,}**",
        f"- All rendered OSM drivable features: **{result['rendered_osm_feature_count']:,}**",
        f"- ORN road features: **{result['orn_feature_count']:,}**",
        f"- ORN layer: `{source.get('layer_name') or source.get('layer_url')}`",
        f"- ORN owner: `{source.get('owner') or 'Ontario Provincial Mapping'}`", "",
        "## Centreline results", "",
        "| Comparison | Median | P90 | P95 | Within 10 m | Within 20 m |",
        "|---|---:|---:|---:|---:|---:|",
        f"| Public OSM → ORN | {forward.get('median_m', math.nan):.2f} m | {forward.get('p90_m', math.nan):.2f} m | {forward.get('p95_m', math.nan):.2f} m | {forward.get('within_10m_pct', 0):.2f}% | {forward.get('within_20m_pct', 0):.2f}% |",
        f"| ORN → public OSM | {reverse.get('median_m', math.nan):.2f} m | {reverse.get('p90_m', math.nan):.2f} m | {reverse.get('p95_m', math.nan):.2f} m | {reverse.get('within_10m_pct', 0):.2f}% | {reverse.get('within_20m_pct', 0):.2f}% |",
        f"| All rendered OSM → ORN | {rendered.get('median_m', math.nan):.2f} m | {rendered.get('p90_m', math.nan):.2f} m | {rendered.get('p95_m', math.nan):.2f} m | {rendered.get('within_10m_pct', 0):.2f}% | {rendered.get('within_20m_pct', 0):.2f}% |", "",
        "Service roads and driveways are intentionally shown separately because many do not exist in ORN.", "",
        "## Street names", "",
        f"- Close segments with names in both datasets: **{names.get('checked_segments', 0):,}**",
        f"- Normalized name agreement: **{names.get('match_pct') if names.get('match_pct') is not None else 'not available'}%**", "",
        "## Streets requiring manual review", "",
    ]
    if rows:
        output.extend(["| Street | P90 offset | Within 20 m | Samples |", "|---|---:|---:|---:|"])
        for row in rows[:35]:
            output.append(f"| {row['name']} | {row.get('p90_m', 0):.2f} m | {row.get('within_20m_pct', 0):.2f}% | {row.get('samples', 0):,} |")
    else:
        output.append("No named public streets exceeded the automated review thresholds.")
    output.extend(["", "## Interpretation", "", result["scope"], "", result["method"], "", *[f"- {item}" for item in result["limitations"]], ""])
    return "\n".join(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("city-explorer/data"))
    parser.add_argument("--report", type=Path, default=Path("city-explorer/ROAD-VALIDATION.md"))
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    manifest_path = args.data_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw_osm = json.loads((args.data_dir / manifest["osm"]["file"]).read_text(encoding="utf-8"))
    layer_url = str(manifest.get("orn", {}).get("layer_url") or "").rstrip("/")
    if not layer_url:
        raise RuntimeError("The asset manifest does not include an ORN layer URL")
    map_service_root = layer_url.rsplit("/", 1)[0]

    http = session()
    orn_features = fetch_complete_orn(http, layer_url)
    road_ids = [feature.get("properties", {}).get("OGF_ID") for feature in orn_features]
    official_names = query_official_names(http, map_service_root, road_ids)
    for feature in orn_features:
        road_id = feature.get("properties", {}).get("OGF_ID")
        feature.setdefault("properties", {})["official_names"] = official_names.get(int(road_id), []) if road_id is not None else []

    public_osm = osm_features(raw_osm, comparable_only=True)
    all_osm = osm_features(raw_osm, comparable_only=False)
    result = validate(public_osm, all_osm, orn_features)
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    result["generated_at"] = generated_at
    result["orn_named_feature_count"] = sum(bool(feature.get("properties", {}).get("official_names")) for feature in orn_features)

    write_json(args.data_dir / "orn-roads.geojson", {"type": "FeatureCollection", "features": orn_features}, compact=True)
    write_json(args.data_dir / "osm-public-roads.geojson", {"type": "FeatureCollection", "features": public_osm}, compact=True)
    write_json(args.data_dir / "road-validation.json", result)
    args.report.write_text(markdown(result, manifest.get("orn", {}), generated_at), encoding="utf-8")

    manifest["orn"]["feature_count"] = len(orn_features)
    manifest["orn"]["named_feature_count"] = result["orn_named_feature_count"]
    manifest["orn"]["file"] = "orn-roads.geojson"
    manifest["osm"]["public_road_file"] = "osm-public-roads.geojson"
    manifest["osm"]["public_road_count"] = len(public_osm)
    manifest["road_validation"] = {
        "file": "road-validation.json",
        "report": "../ROAD-VALIDATION.md",
        "status": result["status"],
        "public_osm_to_orn": result["public_osm_to_orn"],
        "orn_to_public_osm": result["orn_to_public_osm"],
        "street_names": result["street_names"],
    }
    write_json(manifest_path, manifest)

    print(f"Complete ORN features: {len(orn_features):,}")
    print(f"ORN features with official names: {result['orn_named_feature_count']:,}")
    print(f"Public OSM roads checked: {len(public_osm):,}")
    print(f"Public OSM -> ORN: {result['public_osm_to_orn']}")
    print(f"ORN -> public OSM: {result['orn_to_public_osm']}")
    print(f"Street-name agreement: {result['street_names'].get('match_pct')}%")
    print(f"Final road validation status: {result['status']}")
    return 2 if args.strict and result["status"] != "pass" else 0


if __name__ == "__main__":
    raise SystemExit(main())
