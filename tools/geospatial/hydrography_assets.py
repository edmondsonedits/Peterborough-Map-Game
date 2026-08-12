#!/usr/bin/env python3
"""Build Peterborough's official, browser-ready hydrography asset.

The high-resolution surface geometry and staged elevations come from Ontario's
2016-17 Peterborough lidar hydro breaklines (PolygonZ, EPSG:2958 / CGVD2013).
Ontario Hydro Network (OHN) waterbodies and watercourses fill coverage gaps,
including small ponds and Jackson Creek.  Lidar polygons always win where the
two sources overlap.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import requests
import shapefile
from pyproj import Transformer
from shapely.geometry import GeometryCollection, LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

HYDROGRAPHY_FILE = "peterborough-hydrography.geojson"
HYDRO_VALIDATION_FILE = "hydrography-validation.json"
LIDAR_BREAKLINES_URL = "https://www.publicdocs.mnr.gov.on.ca/mirb/Lidar%20DTM%20-%20Ptbo%20-%20breaklines.zip"
LIDAR_METADATA_URL = "https://www.publicdocs.mnr.gov.on.ca/mirb/Lidar%20-%20Peterborough%20-%20Additional%20Metadata.pdf"
OHN_SERVICE_ROOT = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer"
OHN_WATERBODY_LAYER = 25
OHN_WATERCOURSE_LAYER = 26
SOURCE_CRS = "EPSG:2958"
VERTICAL_DATUM = "CGVD2013"
SHORELINE_SIMPLIFY_METRES = 0.25


def _polygonal(geometry: Any) -> Polygon | MultiPolygon | None:
    if isinstance(geometry, Polygon):
        return geometry
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, GeometryCollection):
        polygons = [item for item in geometry.geoms if isinstance(item, (Polygon, MultiPolygon))]
        if polygons:
            merged = unary_union(polygons)
            return merged if isinstance(merged, (Polygon, MultiPolygon)) else None
    return None


def _iter_polygons(geometry: Polygon | MultiPolygon) -> Iterable[Polygon]:
    return (geometry,) if isinstance(geometry, Polygon) else geometry.geoms


def _source_lines(shape_record: Any) -> list[LineString]:
    source_shape = shape_record.shape
    starts = list(source_shape.parts) + [len(source_shape.points)]
    lines: list[LineString] = []
    for index in range(len(starts) - 1):
        start, end = starts[index], starts[index + 1]
        coordinates = [
            (source_shape.points[position][0], source_shape.points[position][1], source_shape.z[position])
            for position in range(start, end)
        ]
        if len(coordinates) >= 2:
            lines.append(LineString(coordinates))
    return lines


def _geometry_with_elevation(
    geometry: Polygon | MultiPolygon,
    to_wgs84: Transformer,
    elevation_at: Any,
) -> dict[str, Any]:
    def ring_coordinates(ring: Any) -> list[list[float]]:
        output: list[list[float]] = []
        for x, y in ring.coords:
            lon, lat = to_wgs84.transform(x, y)
            output.append([round(lon, 7), round(lat, 7), round(float(elevation_at(x, y)), 3)])
        return output

    def polygon_coordinates(polygon: Polygon) -> list[list[list[float]]]:
        return [ring_coordinates(polygon.exterior), *[ring_coordinates(ring) for ring in polygon.interiors]]

    if isinstance(geometry, Polygon):
        return {"type": "Polygon", "coordinates": polygon_coordinates(geometry)}
    return {"type": "MultiPolygon", "coordinates": [polygon_coordinates(polygon) for polygon in geometry.geoms]}


def _fetch_ohn_layer(session: requests.Session, layer_id: int, bbox_wgs84: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    layer_url = f"{OHN_SERVICE_ROOT}/{layer_id}"
    metadata_response = session.get(layer_url, params={"f": "json"}, timeout=60)
    metadata_response.raise_for_status()
    metadata = metadata_response.json()
    page_size = min(int(metadata.get("maxRecordCount") or 2000), 5000)
    object_id_field = metadata.get("objectIdField") or metadata.get("objectIdFieldName") or "OBJECTID"
    west, south, east, north = bbox_wgs84
    features: list[dict[str, Any]] = []
    seen: set[str] = set()
    offset = 0
    while True:
        response = session.get(
            f"{layer_url}/query",
            params={
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
                "orderByFields": f"{object_id_field} ASC",
            },
            timeout=180,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(f"OHN layer {layer_id} failed: {payload['error']}")
        page = payload.get("features") or []
        if not page:
            break
        added = 0
        for feature in page:
            properties = feature.get("properties") or {}
            identifier = str(properties.get(object_id_field) or properties.get("OGF_ID") or feature.get("id") or "")
            if not identifier:
                identifier = json.dumps(feature.get("geometry") or {}, sort_keys=True, separators=(",", ":"))
            if identifier in seen:
                continue
            seen.add(identifier)
            features.append(feature)
            added += 1
        if not added:
            break
        offset += len(page)
    return features


def _compact_ohn_properties(properties: dict[str, Any], kind: str) -> dict[str, Any]:
    fields = (
        "OGF_ID", "WATERBODY_TYPE", "WATERCOURSE_TYPE", "OFFICIAL_NAME_LABEL",
        "PERMANENCY", "FLOW_CLASSIFICATION", "LOCATION_ACCURACY", "CAPTURE_SOURCE",
    )
    output = {"source_kind": kind, "source": "Ontario Hydro Network"}
    for field in fields:
        value = properties.get(field)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ""):
            output[field.lower()] = value
    return output


def fetch_hydrography(
    session: requests.Session,
    bbox_wgs84: tuple[float, float, float, float],
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = session.get(LIDAR_BREAKLINES_URL, timeout=240)
    response.raise_for_status()
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    members = {Path(name).suffix.lower(): name for name in archive.namelist()}
    required = (".shp", ".shx", ".dbf")
    if not all(suffix in members for suffix in required):
        raise RuntimeError("Ontario lidar hydro archive is missing its shapefile components")

    reader = shapefile.Reader(
        shp=io.BytesIO(archive.read(members[".shp"])),
        shx=io.BytesIO(archive.read(members[".shx"])),
        dbf=io.BytesIO(archive.read(members[".dbf"])),
    )
    to_source = Transformer.from_crs("EPSG:4326", SOURCE_CRS, always_xy=True)
    to_wgs84 = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)
    city_source = transform(to_source.transform, box(*bbox_wgs84))
    city_wgs84 = box(*bbox_wgs84)
    features: list[dict[str, Any]] = []
    lidar_polygons: list[Polygon | MultiPolygon] = []
    lidar_entries: list[tuple[Polygon | MultiPolygon, dict[str, Any]]] = []

    for record_index, shape_record in enumerate(reader.iterShapeRecords()):
        raw_geometry = shape(shape_record.shape.__geo_interface__)
        if not raw_geometry.is_valid:
            raw_geometry = raw_geometry.buffer(0)
        if raw_geometry.is_empty or not raw_geometry.intersects(city_source):
            continue
        clipped = _polygonal(raw_geometry.intersection(city_source))
        if clipped is None or clipped.is_empty:
            continue
        simplified = _polygonal(clipped.simplify(SHORELINE_SIMPLIFY_METRES, preserve_topology=True))
        if simplified is None or simplified.is_empty:
            continue

        layer = str(shape_record.record[0]).strip()
        recorded_elevation = float(shape_record.record[1])
        lines = _source_lines(shape_record)
        line_tree = STRtree(lines) if lines else None

        if recorded_elevation > 0:
            elevation_at = lambda _x, _y, elevation=recorded_elevation: elevation
            surface_model = "constant-breakline-stage"
        else:
            def elevation_at(x: float, y: float, source_lines=lines, tree=line_tree) -> float:
                if tree is None:
                    return math.nan
                point = Point(x, y)
                line = source_lines[int(tree.nearest(point))]
                sampled = line.interpolate(line.project(point))
                return float(sampled.z)
            surface_model = "polygonz-breakline-stage"

        absolute_elevations = [
            coordinate[2]
            for polygon in _iter_polygons(simplified)
            for ring in (polygon.exterior, *polygon.interiors)
            for coordinate in _geometry_with_elevation(Polygon(ring), to_wgs84, elevation_at)["coordinates"][0]
        ]
        # Build the final geometry once more; the short elevation scan above is
        # retained because validation needs the real staged range per feature.
        geometry_3d = _geometry_with_elevation(simplified, to_wgs84, elevation_at)
        properties = {
            "source_kind": "lidar_breakline",
            "source": "Ontario Digital Terrain Model (Lidar-Derived) Peterborough hydro breaklines",
            "layer": layer,
            "surface_model": surface_model,
            "surface_elevation_min_m": round(min(absolute_elevations), 3),
            "surface_elevation_max_m": round(max(absolute_elevations), 3),
            "vertical_datum": VERTICAL_DATUM,
            "horizontal_crs": SOURCE_CRS,
            "acquisition": "2016-2017",
        }
        output_feature = {"type": "Feature", "id": f"lidar/{record_index}", "properties": properties, "geometry": geometry_3d}
        features.append(output_feature)
        lidar_polygons.append(simplified)
        lidar_entries.append((simplified, output_feature))

    lidar_coverage = unary_union(lidar_polygons) if lidar_polygons else Polygon()

    waterbodies = _fetch_ohn_layer(session, OHN_WATERBODY_LAYER, bbox_wgs84)
    for feature in waterbodies:
        geometry = shape(feature.get("geometry"))
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        geometry = _polygonal(geometry.intersection(city_wgs84))
        if geometry is None or geometry.is_empty:
            continue
        source_geometry = transform(to_source.transform, geometry)
        overlap_area = source_geometry.intersection(lidar_coverage).area
        if source_geometry.area > 0 and overlap_area / source_geometry.area >= 0.72:
            # The lidar breakline is both more detailed and vertically staged;
            # suppress an OHN duplicate instead of leaving shoreline slivers.
            official_name = str((feature.get("properties") or {}).get("OFFICIAL_NAME_LABEL") or "").strip()
            if official_name and lidar_entries:
                _, matched_feature = max(lidar_entries, key=lambda entry: entry[0].intersection(source_geometry).area)
                matched_names = matched_feature["properties"].setdefault("official_names", [])
                if official_name not in matched_names:
                    matched_names.append(official_name)
            continue
        uncovered = _polygonal(source_geometry.difference(lidar_coverage.buffer(0.35)))
        if uncovered is None or uncovered.is_empty or uncovered.area < 4:
            continue
        output_geometry = transform(to_wgs84.transform, uncovered.simplify(0.35, preserve_topology=True))
        properties = _compact_ohn_properties(feature.get("properties") or {}, "ohn_waterbody")
        features.append({
            "type": "Feature",
            "id": f"ohn-waterbody/{properties.get('ogf_id', len(features))}",
            "properties": properties,
            "geometry": output_geometry.__geo_interface__,
        })

    watercourses = _fetch_ohn_layer(session, OHN_WATERCOURSE_LAYER, bbox_wgs84)
    for feature in watercourses:
        properties = feature.get("properties") or {}
        if str(properties.get("WATERCOURSE_TYPE") or "").casefold() != "stream":
            continue
        geometry = shape(feature.get("geometry")).intersection(city_wgs84)
        if geometry.is_empty:
            continue
        compact = _compact_ohn_properties(properties, "ohn_watercourse")
        features.append({
            "type": "Feature",
            "id": f"ohn-watercourse/{compact.get('ogf_id', len(features))}",
            "properties": compact,
            "geometry": geometry.simplify(0.35, preserve_topology=True).__geo_interface__,
        })

    metadata = {
        "source": "Ontario Ministry of Natural Resources - Geospatial Ontario",
        "licence": "Open Government Licence - Ontario",
        "lidar_breaklines_url": LIDAR_BREAKLINES_URL,
        "lidar_metadata_url": LIDAR_METADATA_URL,
        "ohn_waterbody_url": f"{OHN_SERVICE_ROOT}/{OHN_WATERBODY_LAYER}",
        "ohn_watercourse_url": f"{OHN_SERVICE_ROOT}/{OHN_WATERCOURSE_LAYER}",
        "query_bbox": list(bbox_wgs84),
        "horizontal_crs": SOURCE_CRS,
        "vertical_datum": VERTICAL_DATUM,
        "shoreline_simplify_metres": SHORELINE_SIMPLIFY_METRES,
    }
    return {
        "type": "FeatureCollection",
        "name": "Peterborough official hydrography and lidar water stages",
        "bbox": list(bbox_wgs84),
        "metadata": metadata,
        "features": features,
    }, metadata


def validate_hydrography(collection: dict[str, Any]) -> dict[str, Any]:
    features = collection.get("features") or []
    counts = Counter(str((feature.get("properties") or {}).get("source_kind") or "unknown") for feature in features)
    names: set[str] = set()
    for feature in features:
        properties = feature.get("properties") or {}
        label = str(properties.get("official_name_label") or "").strip().casefold()
        if label:
            names.add(label)
        names.update(str(name).strip().casefold() for name in properties.get("official_names") or [] if str(name).strip())
    lidar = [feature for feature in features if (feature.get("properties") or {}).get("source_kind") == "lidar_breakline"]
    river_lidar = [feature for feature in lidar if str(feature["properties"].get("layer") or "").casefold() == "river"]
    lidar_min = min(float(feature["properties"]["surface_elevation_min_m"]) for feature in lidar)
    lidar_max = max(float(feature["properties"]["surface_elevation_max_m"]) for feature in lidar)
    river_min = min(float(feature["properties"]["surface_elevation_min_m"]) for feature in river_lidar)
    river_max = max(float(feature["properties"]["surface_elevation_max_m"]) for feature in river_lidar)
    required_names = ("otonabee river", "little lake", "jackson creek")
    missing_names = [name for name in required_names if name not in names]
    checks = {
        "has_lidar_breaklines": len(lidar) >= 10,
        "has_ohn_waterbodies": counts["ohn_waterbody"] >= 100,
        "has_ohn_watercourses": counts["ohn_watercourse"] >= 100,
        "named_system_complete": not missing_names,
        # Parks Canada documents a 19.8 m average lift at Lock 21. Validate the
        # connected river/canal breaklines themselves, not unrelated upland ponds.
        "lock_controlled_stage_span": river_max - river_min >= 19.0,
        "plausible_elevations": 150 <= lidar_min <= lidar_max <= 300,
    }
    return {
        "status": "pass" if all(checks.values()) else "fail",
        "feature_count": len(features),
        "source_counts": dict(sorted(counts.items())),
        "lidar_surface_min_m_cgvd2013": lidar_min,
        "lidar_surface_max_m_cgvd2013": lidar_max,
        "lidar_stage_span_m": lidar_max - lidar_min,
        "river_surface_min_m_cgvd2013": river_min,
        "river_surface_max_m_cgvd2013": river_max,
        "river_stage_span_m": river_max - river_min,
        "required_names": list(required_names),
        "missing_names": missing_names,
        "checks": checks,
    }


def load_cached_hydrography(output_dir: Path) -> dict[str, Any]:
    path = output_dir / HYDROGRAPHY_FILE
    collection = json.loads(path.read_text(encoding="utf-8"))
    if collection.get("type") != "FeatureCollection" or not collection.get("features"):
        raise RuntimeError(f"Cached hydrography is invalid: {path}")
    return collection


def fetch_or_reuse_hydrography(
    session: requests.Session,
    output_dir: Path,
    bbox_wgs84: tuple[float, float, float, float],
) -> tuple[dict[str, Any], dict[str, Any], bool, dict[str, Any]]:
    try:
        collection, metadata = fetch_hydrography(session, bbox_wgs84)
        reused = False
    except Exception as error:
        collection = load_cached_hydrography(output_dir)
        metadata = collection.get("metadata") or {}
        metadata = {**metadata, "refresh_error": str(error)}
        reused = True
    validation = validate_hydrography(collection)
    if validation["status"] != "pass":
        raise RuntimeError(f"Hydrography validation failed: {validation}")
    return collection, metadata, reused, validation


def _write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 2)
        if not compact:
            handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("city-explorer/data"))
    parser.add_argument("--bbox", nargs=4, type=float, default=(-78.405, 44.245, -78.245, 44.385))
    args = parser.parse_args()
    session = requests.Session()
    session.headers.update({"User-Agent": "Peterborough-3D-City-Explorer/1.0"})
    collection, metadata = fetch_hydrography(session, tuple(args.bbox))
    validation = validate_hydrography(collection)
    if validation["status"] != "pass":
        raise RuntimeError(f"Hydrography validation failed: {validation}")
    _write_json(args.output / HYDROGRAPHY_FILE, collection, compact=True)
    _write_json(args.output / HYDRO_VALIDATION_FILE, validation)
    print(json.dumps({"metadata": metadata, "validation": validation}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
