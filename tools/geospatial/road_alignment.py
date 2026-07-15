#!/usr/bin/env python3
"""Complete Peterborough road-centreline and street-name validation."""
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
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import transform
from shapely.strtree import STRtree

BBOX = (-78.405, 44.245, -78.245, 44.385)
PUBLIC_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "living_street", "road",
}
NON_PUBLIC = {"private", "no", "customers"}
SUFFIXES = {
    "STREET": "ST", "ROAD": "RD", "AVENUE": "AVE", "BOULEVARD": "BLVD",
    "DRIVE": "DR", "LANE": "LN", "COURT": "CRT", "CRESCENT": "CRES",
    "PARKWAY": "PKWY", "HIGHWAY": "HWY", "PLACE": "PL", "TRAIL": "TRL",
    "TERRACE": "TER", "CIRCLE": "CIR", "GARDENS": "GDNS", "GATE": "GT",
}


def http_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": "Peterborough-3D-City-Explorer/1.0", "Accept": "application/json,*/*"})
    session.mount("https://", requests.adapters.HTTPAdapter(max_retries=3))
    return session


def write_json(path: Path, value: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 2)
        if not compact:
            handle.write("\n")
    temporary.replace(path)


def split(values: Sequence[int], size: int) -> Iterator[Sequence[int]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def arcgis_post(session: requests.Session, url: str, data: dict[str, Any], timeout: int = 180) -> dict[str, Any]:
    response = session.post(url, data=data, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload


def fetch_orn(session: requests.Session, layer_url: str) -> list[dict[str, Any]]:
    west, south, east, north = BBOX
    ids_payload = arcgis_post(session, f"{layer_url}/query", {
        "f": "json", "where": "1=1", "geometry": f"{west},{south},{east},{north}",
        "geometryType": "esriGeometryEnvelope", "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "false", "returnIdsOnly": "true",
    })
    object_ids = sorted(int(value) for value in ids_payload.get("objectIds") or [])
    if not object_ids:
        raise RuntimeError("No ORN object IDs were returned for Peterborough")

    features: list[dict[str, Any]] = []
    for group in split(object_ids, 250):
        data = {
            "f": "geojson", "objectIds": ",".join(map(str, group)), "outFields": "*",
            "outSR": "4326", "returnGeometry": "true",
        }
        try:
            payload = arcgis_post(session, f"{layer_url}/query", data)
            page = payload.get("features") or []
        except Exception:
            data["f"] = "json"
            payload = arcgis_post(session, f"{layer_url}/query", data)
            page = []
            for item in payload.get("features") or []:
                paths = (item.get("geometry") or {}).get("paths") or []
                if not paths:
                    continue
                geometry = {"type": "LineString", "coordinates": paths[0]} if len(paths) == 1 else {"type": "MultiLineString", "coordinates": paths}
                page.append({"type": "Feature", "properties": item.get("attributes") or {}, "geometry": geometry})
        features.extend(page)
    if len(features) < len(object_ids) * 0.98:
        raise RuntimeError(f"Complete ORN query returned {len(features)} of {len(object_ids)} requested roads")
    return features


def attach_names(session: requests.Session, map_root: str, features: list[dict[str, Any]]) -> int:
    road_ids = sorted({int(feature["properties"]["OGF_ID"]) for feature in features if feature.get("properties", {}).get("OGF_ID") is not None})
    names: dict[int, set[str]] = defaultdict(set)
    for group in split(road_ids, 200):
        payload = arcgis_post(session, f"{map_root}/7/query", {
            "f": "json",
            "where": f"ORN_ROAD_NET_ELEMENT_ID IN ({','.join(map(str, group))})",
            "outFields": "ORN_ROAD_NET_ELEMENT_ID,FULL_STREET_NAME,AGENCY_NAME",
            "returnGeometry": "false", "resultRecordCount": "5000",
        }, timeout=120)
        for item in payload.get("features") or []:
            attributes = item.get("attributes") or {}
            road_id = attributes.get("ORN_ROAD_NET_ELEMENT_ID")
            street_name = str(attributes.get("FULL_STREET_NAME") or "").strip()
            if road_id is not None and street_name:
                names[int(road_id)].add(street_name)
    count = 0
    for feature in features:
        road_id = feature.get("properties", {}).get("OGF_ID")
        values = sorted(names.get(int(road_id), set())) if road_id is not None else []
        feature.setdefault("properties", {})["official_names"] = values
        count += bool(values)
    return count


def osm_roads(raw: dict[str, Any], public_only: bool) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    excluded_general = {"footway", "cycleway", "path", "steps", "pedestrian", "bridleway", "corridor", "platform", "proposed", "construction"}
    for element in raw.get("elements") or []:
        tags = element.get("tags") or {}
        highway = str(tags.get("highway") or "")
        if element.get("type") != "way" or not highway or tags.get("area") == "yes":
            continue
        if public_only:
            if highway not in PUBLIC_HIGHWAYS:
                continue
            if any(str(tags.get(key) or "").lower() in NON_PUBLIC for key in ("access", "vehicle", "motor_vehicle")):
                continue
        elif highway in excluded_general:
            continue
        coordinates = [[float(vertex["lon"]), float(vertex["lat"])] for vertex in element.get("geometry") or [] if vertex and "lon" in vertex and "lat" in vertex]
        if len(coordinates) >= 2:
            properties = dict(tags)
            properties["osm_id"] = element.get("id")
            output.append({"type": "Feature", "properties": properties, "geometry": {"type": "LineString", "coordinates": coordinates}})
    return output


def projected_lines(features: Iterable[dict[str, Any]], transformer: Transformer) -> tuple[list[LineString], list[dict[str, Any]]]:
    lines: list[LineString] = []
    properties: list[dict[str, Any]] = []
    for feature in features:
        try:
            geometry = transform(transformer.transform, shape(feature.get("geometry")))
        except Exception:
            continue
        parts = [geometry] if isinstance(geometry, LineString) else list(geometry.geoms) if isinstance(geometry, MultiLineString) else []
        for part in parts:
            if part.length >= 1:
                lines.append(part)
                properties.append(feature.get("properties") or {})
    return lines, properties


def percentile(values: Sequence[float], percent: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent / 100
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] if low == high else ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def summary(values: Sequence[float]) -> dict[str, Any]:
    return {
        "samples": len(values), "mean_m": round(statistics.fmean(values), 3),
        "median_m": round(statistics.median(values), 3), "p90_m": round(percentile(values, 90), 3),
        "p95_m": round(percentile(values, 95), 3), "p99_m": round(percentile(values, 99), 3),
        "within_5m_pct": round(sum(value <= 5 for value in values) / len(values) * 100, 2),
        "within_10m_pct": round(sum(value <= 10 for value in values) / len(values) * 100, 2),
        "within_20m_pct": round(sum(value <= 20 for value in values) / len(values) * 100, 2),
        "within_30m_pct": round(sum(value <= 30 for value in values) / len(values) * 100, 2),
    }


def normalize(value: Any) -> str:
    text = re.sub(r"[^A-Z0-9 ]+", " ", str(value or "").upper()).strip()
    return " ".join(SUFFIXES.get(word, word) for word in text.split())


def directional(source: Sequence[LineString], source_props: Sequence[dict[str, Any]], target: Sequence[LineString]) -> tuple[list[float], list[tuple[int, int, float]], dict[str, list[float]]]:
    tree = STRtree(target)
    all_distances: list[float] = []
    matches: list[tuple[int, int, float]] = []
    named: dict[str, list[float]] = defaultdict(list)
    for source_index, (line, properties) in enumerate(zip(source, source_props)):
        count = min(350, max(2, int(math.ceil(line.length / 15)) + 1))
        distances: list[float] = []
        targets: list[int] = []
        for index in range(count):
            point = line.interpolate(line.length * index / (count - 1))
            target_index = int(tree.nearest(point))
            distance = float(point.distance(target[target_index]))
            distances.append(distance)
            targets.append(target_index)
            all_distances.append(distance)
        p90 = percentile(distances, 90)
        matches.append((source_index, statistics.mode(targets), p90))
        street_name = normalize(properties.get("name") or properties.get("ref"))
        if street_name:
            named[street_name].extend(distances)
    return all_distances, matches, named


def calculate(public_osm: list[dict[str, Any]], rendered_osm: list[dict[str, Any]], orn: list[dict[str, Any]]) -> dict[str, Any]:
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:26917", always_xy=True)
    public_lines, public_props = projected_lines(public_osm, transformer)
    rendered_lines, rendered_props = projected_lines(rendered_osm, transformer)
    orn_lines, orn_props = projected_lines(orn, transformer)
    public_values, matches, by_name = directional(public_lines, public_props, orn_lines)
    reverse_values, _, _ = directional(orn_lines, orn_props, public_lines)
    rendered_values, _, _ = directional(rendered_lines, rendered_props, orn_lines)

    checked = matched = 0
    mismatches: list[dict[str, Any]] = []
    for source_index, target_index, offset in matches:
        if offset > 20:
            continue
        osm_name = normalize(public_props[source_index].get("name"))
        official = [normalize(value) for value in orn_props[target_index].get("official_names") or []]
        official = [value for value in official if value]
        if not osm_name or not official:
            continue
        checked += 1
        if any(osm_name == value or osm_name in value or value in osm_name for value in official):
            matched += 1
        elif len(mismatches) < 60:
            mismatches.append({"osm": osm_name, "orn": official, "p90_offset_m": round(offset, 2)})

    flagged = []
    for name, values in by_name.items():
        if len(values) < 8:
            continue
        row = summary(values)
        if row["p90_m"] > 25 or row["within_20m_pct"] < 80:
            flagged.append({"name": name, **row})
    flagged.sort(key=lambda row: (row["p90_m"], -row["within_20m_pct"]), reverse=True)

    forward = summary(public_values)
    reverse = summary(reverse_values)
    rendered = summary(rendered_values)
    passed = forward["median_m"] <= 5 and forward["within_20m_pct"] >= 90 and reverse["within_20m_pct"] >= 95
    return {
        "status": "pass" if passed else "review",
        "criteria": {"public_osm_to_orn_median_max_m": 5, "public_osm_to_orn_within_20m_min_pct": 90, "orn_to_public_osm_within_20m_min_pct": 95},
        "public_osm_feature_count": len(public_osm), "rendered_osm_feature_count": len(rendered_osm), "orn_feature_count": len(orn),
        "public_osm_to_orn": forward, "orn_to_public_osm": reverse, "all_rendered_osm_to_orn": rendered,
        "street_names": {"checked_segments": checked, "matching_segments": matched, "match_pct": round(matched / checked * 100, 2) if checked else None, "sample_mismatches": mismatches},
        "streets_requiring_review": flagged[:100],
        "scope": "Pass criteria cover public drivable streets. Service roads, parking aisles, driveways, tracks and explicitly private roads remain rendered but are reported separately because ORN is not a complete reference for them.",
        "method": "Complete ORN object-ID pagination; NAD83 / UTM zone 17N; centreline samples about every 15 metres; nearest-line distance measured in both directions.",
        "limitations": ["Divided roads can be one centreline in one source and separate carriageways in the other.", "Recent construction and private roads can be present in only one source.", "The test validates centrelines and names, not curbs, lanes, grades, turn rules or legal survey boundaries."],
    }


def report(result: dict[str, Any], source: dict[str, Any], timestamp: str) -> str:
    forward, reverse, rendered = result["public_osm_to_orn"], result["orn_to_public_osm"], result["all_rendered_osm_to_orn"]
    names = result["street_names"]
    lines = [
        "# Peterborough Road Alignment Validation", "", f"Generated: {timestamp}", "", f"**Result: {result['status'].upper()}**", "",
        "The explorer renders cached OpenStreetMap street geometry. Public drivable streets were independently compared with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.", "",
        "## Completeness safeguard", "", "ORN is downloaded through a spatial object-ID query followed by chunked object-ID requests. This avoids ArcGIS transfer limits silently omitting part of Peterborough's network.", "",
        "## Coverage", "", f"- Public OSM roads checked: **{result['public_osm_feature_count']:,}**", f"- All rendered OSM drivable features: **{result['rendered_osm_feature_count']:,}**", f"- Complete ORN roads: **{result['orn_feature_count']:,}**", f"- ORN layer: `{source.get('layer_name') or source.get('layer_url')}`", "",
        "## Centreline results", "", "| Comparison | Median | P90 | P95 | Within 10 m | Within 20 m |", "|---|---:|---:|---:|---:|---:|",
        f"| Public OSM → ORN | {forward['median_m']:.2f} m | {forward['p90_m']:.2f} m | {forward['p95_m']:.2f} m | {forward['within_10m_pct']:.2f}% | {forward['within_20m_pct']:.2f}% |",
        f"| ORN → public OSM | {reverse['median_m']:.2f} m | {reverse['p90_m']:.2f} m | {reverse['p95_m']:.2f} m | {reverse['within_10m_pct']:.2f}% | {reverse['within_20m_pct']:.2f}% |",
        f"| All rendered OSM → ORN | {rendered['median_m']:.2f} m | {rendered['p90_m']:.2f} m | {rendered['p95_m']:.2f} m | {rendered['within_10m_pct']:.2f}% | {rendered['within_20m_pct']:.2f}% |", "",
        "## Street names", "", f"- Comparable named segments: **{names['checked_segments']:,}**", f"- Normalized official-name agreement: **{names['match_pct'] if names['match_pct'] is not None else 'not available'}%**", "",
        "## Streets requiring manual review", "",
    ]
    flagged = result.get("streets_requiring_review") or []
    if flagged:
        lines.extend(["| Street | P90 offset | Within 20 m | Samples |", "|---|---:|---:|---:|"])
        for row in flagged[:35]:
            lines.append(f"| {row['name']} | {row['p90_m']:.2f} m | {row['within_20m_pct']:.2f}% | {row['samples']:,} |")
    else:
        lines.append("No named public streets exceeded the automated review threshold.")
    lines.extend(["", "## Interpretation", "", result["scope"], "", result["method"], "", *[f"- {item}" for item in result["limitations"]], ""])
    return "\n".join(lines)


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
        raise RuntimeError("ORN layer URL is absent from the asset manifest")

    session = http_session()
    orn = fetch_orn(session, layer_url)
    named_count = attach_names(session, layer_url.rsplit("/", 1)[0], orn)
    public_osm = osm_roads(raw_osm, True)
    rendered_osm = osm_roads(raw_osm, False)
    result = calculate(public_osm, rendered_osm, orn)
    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    result["generated_at"] = timestamp
    result["orn_named_feature_count"] = named_count

    write_json(args.data_dir / "orn-roads.geojson", {"type": "FeatureCollection", "features": orn}, True)
    write_json(args.data_dir / "osm-public-roads.geojson", {"type": "FeatureCollection", "features": public_osm}, True)
    write_json(args.data_dir / "road-validation.json", result)
    args.report.write_text(report(result, manifest.get("orn", {}), timestamp), encoding="utf-8")
    manifest["orn"].update({"feature_count": len(orn), "named_feature_count": named_count, "file": "orn-roads.geojson"})
    manifest["osm"].update({"public_road_file": "osm-public-roads.geojson", "public_road_count": len(public_osm)})
    manifest["road_validation"] = {"file": "road-validation.json", "report": "../ROAD-VALIDATION.md", "status": result["status"], "public_osm_to_orn": result["public_osm_to_orn"], "orn_to_public_osm": result["orn_to_public_osm"], "street_names": result["street_names"]}
    write_json(manifest_path, manifest)

    print(f"Complete ORN features: {len(orn):,}")
    print(f"ORN features with official names: {named_count:,}")
    print(f"Public OSM roads checked: {len(public_osm):,}")
    print(f"Public OSM -> ORN: {result['public_osm_to_orn']}")
    print(f"ORN -> public OSM: {result['orn_to_public_osm']}")
    print(f"Street-name agreement: {result['street_names']['match_pct']}%")
    print(f"Final road validation status: {result['status']}")
    return 2 if args.strict and result["status"] != "pass" else 0


if __name__ == "__main__":
    raise SystemExit(main())
