#!/usr/bin/env python3
"""Build Peterborough's browser terrain from Ontario's official lidar DTM.

The script deliberately has no third-party dependencies.  ArcGIS exports an
uncompressed, single-band Float32 GeoTIFF; this module validates and decodes
that small TIFF subset, quantizes elevations to the lossless Terrarium wire
format (1/256 metre), and writes a colour-profile-free RGB PNG.  Keeping the
conversion here prevents a display renderer or an image colour ramp from ever
being mistaken for elevation data.
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import math
import os
import struct
import sys
import tempfile
import urllib.parse
import urllib.request
import zlib
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

SERVICE_URL = (
    "https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/"
    "Elevation/Ontario_DTM_LidarDerived/ImageServer"
)
ARCGIS_ITEM_ID = "776819a7a0de42f3b75e40527cc36a0a"
PROJECT = "DEDSFM Central East 2025"
BBOX_WGS84 = (-78.405, 44.245, -78.245, 44.385)
DEFAULT_WIDTH = 1536
WEB_MERCATOR_RADIUS = 6378137.0
WEB_MERCATOR_LIMIT = 85.0511287798066
TERRARIUM_OFFSET = 32768.0
TERRARIUM_SCALE = 256.0
NODATA_F32 = 3.4028234663852886e38


def lon_to_web_mercator(lon: float) -> float:
    if not math.isfinite(lon) or lon < -180 or lon > 180:
        raise ValueError(f"invalid longitude: {lon}")
    return WEB_MERCATOR_RADIUS * math.radians(lon)


def lat_to_web_mercator(lat: float) -> float:
    if not math.isfinite(lat) or abs(lat) > WEB_MERCATOR_LIMIT:
        raise ValueError(f"latitude is outside Web Mercator: {lat}")
    radians = math.radians(lat)
    return WEB_MERCATOR_RADIUS * math.log(math.tan(math.pi / 4 + radians / 2))


def project_bounds(bounds: Sequence[float]) -> tuple[float, float, float, float]:
    west, south, east, north = map(float, bounds)
    if west >= east or south >= north:
        raise ValueError("bounds must be ordered west,south,east,north")
    return (
        lon_to_web_mercator(west),
        lat_to_web_mercator(south),
        lon_to_web_mercator(east),
        lat_to_web_mercator(north),
    )


def export_dimensions(bounds_3857: Sequence[float], width: int) -> tuple[int, int]:
    if width < 2:
        raise ValueError("width must be at least 2")
    xmin, ymin, xmax, ymax = map(float, bounds_3857)
    height = round(width * (ymax - ymin) / (xmax - xmin))
    return width, max(2, height)


def terrarium_code(elevation_metres: float) -> int:
    if not math.isfinite(elevation_metres):
        raise ValueError("Terrarium cannot encode a non-finite elevation")
    code = round((elevation_metres + TERRARIUM_OFFSET) * TERRARIUM_SCALE)
    if code < 0 or code > 0xFFFFFF:
        raise ValueError(f"elevation is outside Terrarium range: {elevation_metres}")
    return code


def encode_terrarium(elevation_metres: float) -> tuple[int, int, int]:
    code = terrarium_code(elevation_metres)
    return code >> 16, (code >> 8) & 255, code & 255


def decode_terrarium(red: int, green: int, blue: int) -> float:
    for channel in (red, green, blue):
        if not isinstance(channel, int) or not 0 <= channel <= 255:
            raise ValueError("Terrarium channels must be integers from 0 to 255")
    return red * 256.0 + green + blue / 256.0 - TERRARIUM_OFFSET


_TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8}


def _tiff_values(data: memoryview, endian: str, entry: tuple[int, int, int, int, int]):
    _tag, value_type, count, value_or_offset, entry_offset = entry
    unit = _TYPE_SIZES.get(value_type)
    if unit is None:
        raise ValueError(f"unsupported TIFF field type {value_type}")
    byte_count = unit * count
    offset = entry_offset + 8 if byte_count <= 4 else value_or_offset
    if offset < 0 or offset + byte_count > len(data):
        raise ValueError("TIFF field points outside the file")
    if value_type == 2:
        return bytes(data[offset : offset + byte_count]).rstrip(b"\0").decode("ascii")
    formats = {1: "B", 3: "H", 4: "I", 5: "II", 11: "f", 12: "d"}
    fmt = formats[value_type]
    values = []
    cursor = offset
    for _ in range(count):
        if value_type == 5:
            numerator, denominator = struct.unpack_from(endian + fmt, data, cursor)
            values.append(numerator / denominator)
        else:
            values.append(struct.unpack_from(endian + fmt, data, cursor)[0])
        cursor += unit
    return values


def decode_float32_geotiff(payload: bytes) -> dict:
    """Decode the strict, uncompressed Float32 TIFF returned by the service."""
    data = memoryview(payload)
    if len(data) < 16 or bytes(data[:2]) not in (b"II", b"MM"):
        raise ValueError("not a classic TIFF")
    endian = "<" if bytes(data[:2]) == b"II" else ">"
    if struct.unpack_from(endian + "H", data, 2)[0] != 42:
        raise ValueError("BigTIFF and non-TIFF payloads are unsupported")
    ifd_offset = struct.unpack_from(endian + "I", data, 4)[0]
    entry_count = struct.unpack_from(endian + "H", data, ifd_offset)[0]
    tags = {}
    cursor = ifd_offset + 2
    for _ in range(entry_count):
        tag, value_type, count, value_or_offset = struct.unpack_from(endian + "HHII", data, cursor)
        tags[tag] = (tag, value_type, count, value_or_offset, cursor)
        cursor += 12

    def numbers(tag: int, default=None):
        if tag not in tags:
            return default
        return _tiff_values(data, endian, tags[tag])

    def scalar(tag: int, default=None):
        values = numbers(tag)
        return default if values is None else values[0]

    width, height = int(scalar(256)), int(scalar(257))
    if scalar(258) != 32 or scalar(259, 1) != 1 or scalar(277, 1) != 1:
        raise ValueError("expected uncompressed, one-band, 32-bit TIFF")
    if scalar(339, 1) != 3:
        raise ValueError("expected IEEE Float32 TIFF samples")
    if scalar(274, 1) != 1 or scalar(284, 1) != 1:
        raise ValueError("unsupported TIFF orientation or planar layout")

    heights = array("f", [math.nan]) * (width * height)
    tile_offsets, tile_byte_counts = numbers(324), numbers(325)
    if tile_offsets is not None:
        tile_width, tile_height = int(scalar(322)), int(scalar(323))
        tiles_across = math.ceil(width / tile_width)
        tiles_down = math.ceil(height / tile_height)
        if len(tile_offsets) != tiles_across * tiles_down or len(tile_byte_counts) != len(tile_offsets):
            raise ValueError("invalid TIFF tile table")
        for tile_index, (offset, byte_count) in enumerate(zip(tile_offsets, tile_byte_counts)):
            if byte_count < tile_width * tile_height * 4 or offset + byte_count > len(data):
                raise ValueError("invalid TIFF tile payload")
            tile_x, tile_y = tile_index % tiles_across, tile_index // tiles_across
            copy_width = min(tile_width, width - tile_x * tile_width)
            copy_height = min(tile_height, height - tile_y * tile_height)
            for local_y in range(copy_height):
                source = offset + local_y * tile_width * 4
                destination = (tile_y * tile_height + local_y) * width + tile_x * tile_width
                row = struct.unpack_from(endian + f"{copy_width}f", data, source)
                heights[destination : destination + copy_width] = array("f", row)
    else:
        strip_offsets, strip_byte_counts = numbers(273), numbers(279)
        rows_per_strip = int(scalar(278, height))
        if strip_offsets is None or strip_byte_counts is None or len(strip_offsets) != len(strip_byte_counts):
            raise ValueError("TIFF has neither a valid tile table nor strip table")
        for strip_index, (offset, byte_count) in enumerate(zip(strip_offsets, strip_byte_counts)):
            first_row = strip_index * rows_per_strip
            row_count = min(rows_per_strip, height - first_row)
            sample_count = row_count * width
            if byte_count < sample_count * 4 or offset + byte_count > len(data):
                raise ValueError("invalid TIFF strip payload")
            values = struct.unpack_from(endian + f"{sample_count}f", data, offset)
            heights[first_row * width : (first_row + row_count) * width] = array("f", values)

    pixel_scale, tiepoint = numbers(33550), numbers(33922)
    if not pixel_scale or len(pixel_scale) < 2 or not tiepoint or len(tiepoint) < 6:
        raise ValueError("GeoTIFF is missing pixel scale or tie point")
    scale_x, scale_y = float(pixel_scale[0]), float(pixel_scale[1])
    xmin = float(tiepoint[3]) - float(tiepoint[0]) * scale_x
    ymax = float(tiepoint[4]) + float(tiepoint[1]) * scale_y
    bounds = (xmin, ymax - height * scale_y, xmin + width * scale_x, ymax)
    nodata = NODATA_F32
    if 42113 in tags:
        raw_nodata = _tiff_values(data, endian, tags[42113])
        try:
            nodata = float(raw_nodata)
        except (TypeError, ValueError):
            pass
    return {
        "width": width,
        "height": height,
        "heights": heights,
        "bounds": bounds,
        "pixel_size": (scale_x, scale_y),
        "nodata": nodata,
    }


def _paeth(left: int, above: int, upper_left: int) -> int:
    prediction = left + above - upper_left
    distance_left = abs(prediction - left)
    distance_above = abs(prediction - above)
    distance_upper_left = abs(prediction - upper_left)
    if distance_left <= distance_above and distance_left <= distance_upper_left:
        return left
    return above if distance_above <= distance_upper_left else upper_left


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)


def encode_terrarium_png(width: int, height: int, heights: Sequence[float]) -> tuple[bytes, dict]:
    if width < 1 or height < 1 or len(heights) != width * height:
        raise ValueError("height grid dimensions do not match")
    previous = bytearray(width * 3)
    scanlines = bytearray()
    minimum, maximum, total = math.inf, -math.inf, 0.0
    max_error = 0.0
    for y in range(height):
        raw = bytearray(width * 3)
        for x in range(width):
            elevation = float(heights[y * width + x])
            if not math.isfinite(elevation) or elevation >= NODATA_F32 * 0.99:
                raise ValueError(f"no-data elevation at pixel {x},{y}")
            red, green, blue = encode_terrarium(elevation)
            offset = x * 3
            raw[offset : offset + 3] = bytes((red, green, blue))
            decoded = decode_terrarium(red, green, blue)
            max_error = max(max_error, abs(decoded - elevation))
            minimum, maximum, total = min(minimum, elevation), max(maximum, elevation), total + elevation
        # Paeth is consistently compact for smooth elevation rasters and avoids
        # five full filter trials per row during CI regeneration.
        filtered = bytearray(len(raw))
        for index, value in enumerate(raw):
            left = raw[index - 3] if index >= 3 else 0
            above = previous[index]
            upper_left = previous[index - 3] if index >= 3 else 0
            filtered[index] = (value - _paeth(left, above, upper_left)) & 255
        scanlines.append(4)
        scanlines.extend(filtered)
        previous = raw
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    compressed = zlib.compress(bytes(scanlines), level=9)
    png = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", compressed) + _png_chunk(b"IEND", b"")
    return png, {
        "minimumMetres": minimum,
        "maximumMetres": maximum,
        "meanMetres": total / len(heights),
        "maximumQuantizationErrorMetres": max_error,
    }


def _request_json(url: str, parameters: dict | None = None, timeout: int = 180) -> dict:
    if parameters:
        url += "?" + urllib.parse.urlencode(parameters)
    request = urllib.request.Request(url, headers={"User-Agent": "PeterboroughExplorerTerrainBuilder/1.5.5"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(f"ArcGIS error: {payload['error']}")
    return payload


def _request_bytes(url: str, timeout: int = 300) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "PeterboroughExplorerTerrainBuilder/1.5.5"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(payload)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def build(output_png: Path, output_metadata: Path, width: int = DEFAULT_WIDTH) -> dict:
    requested_3857 = project_bounds(BBOX_WGS84)
    export_width, export_height = export_dimensions(requested_3857, width)
    service = _request_json(SERVICE_URL, {"f": "json"})
    if service.get("pixelType") != "F32" or service.get("heightModelInfo", {}).get("heightUnit") != "meter":
        raise RuntimeError("official service no longer exposes Float32 metric heights")

    geometry = {
        "xmin": BBOX_WGS84[0], "ymin": BBOX_WGS84[1],
        "xmax": BBOX_WGS84[2], "ymax": BBOX_WGS84[3],
        "spatialReference": {"wkid": 4326},
    }
    catalog = _request_json(SERVICE_URL + "/query", {
        "f": "json", "where": f"Project='{PROJECT}'",
        "geometry": json.dumps(geometry, separators=(",", ":")),
        "geometryType": "esriGeometryEnvelope", "spatialRel": "esriSpatialRelIntersects",
        "inSR": "4326", "outFields": (
            "OBJECTID,Project,TileName,Resolution_m,AcqMethod,HorizontalAccuracy_m,"
            "VerticalAccuracyClass,StartYear,EndYear"
        ),
        "returnGeometry": "false", "orderByFields": "OBJECTID", "resultRecordCount": "1000",
    })
    if catalog.get("exceededTransferLimit") or not catalog.get("features"):
        raise RuntimeError("official Central East catalog query was empty or incomplete")
    attributes = [feature["attributes"] for feature in catalog["features"]]
    if any(item.get("Project") != PROJECT for item in attributes):
        raise RuntimeError("catalog returned an unexpected lidar project")

    mosaic_rule = {
        "mosaicMethod": "esriMosaicNorthwest", "where": f"Project = '{PROJECT}'",
        "ascending": True, "mosaicOperation": "MT_FIRST",
    }
    export_parameters = {
        "f": "json", "bbox": ",".join(f"{value:.12f}" for value in requested_3857),
        "bboxSR": "3857", "imageSR": "3857", "size": f"{export_width},{export_height}",
        "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
        "renderingRule": json.dumps({"rasterFunction": "None"}, separators=(",", ":")),
        "mosaicRule": json.dumps(mosaic_rule, separators=(",", ":")),
        "noDataInterpretation": "esriNoDataMatchAny", "adjustAspectRatio": "false",
    }
    export = _request_json(SERVICE_URL + "/exportImage", export_parameters)
    geotiff_bytes = _request_bytes(export["href"])
    raster = decode_float32_geotiff(geotiff_bytes)
    if (raster["width"], raster["height"]) != (export_width, export_height):
        raise RuntimeError("export dimensions changed unexpectedly")
    returned_extent = export["extent"]
    export_bounds = (
        returned_extent["xmin"], returned_extent["ymin"],
        returned_extent["xmax"], returned_extent["ymax"],
    )
    if max(abs(a - b) for a, b in zip(raster["bounds"], export_bounds)) > 0.02:
        raise RuntimeError("GeoTIFF georeferencing does not match export response")

    png_bytes, elevation_stats = encode_terrarium_png(export_width, export_height, raster["heights"])
    center_latitude = (BBOX_WGS84[1] + BBOX_WGS84[3]) / 2
    pixel_x = (export_bounds[2] - export_bounds[0]) / export_width
    pixel_y = (export_bounds[3] - export_bounds[1]) / export_height
    identity_rows = [f"{item['OBJECTID']}:{item['TileName']}" for item in attributes]
    unique = lambda field: sorted({item.get(field) for item in attributes if item.get(field) is not None})
    metadata = {
        "schemaVersion": 1,
        "asset": output_png.name,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "encoding": {
            "name": "Mapzen Terrarium RGB", "formulaMetres": "R*256 + G + B/256 - 32768",
            "verticalStepMetres": 1 / TERRARIUM_SCALE, "pngColorType": "truecolour RGB",
            "rowOrder": "north-to-south", "pixelReference": "pixel area; bounds describe outer edges",
        },
        "dimensions": {"width": export_width, "height": export_height},
        "bounds": {
            "wgs84Epsg4326": {"west": BBOX_WGS84[0], "south": BBOX_WGS84[1], "east": BBOX_WGS84[2], "north": BBOX_WGS84[3]},
            "webMercatorEpsg3857": {"xmin": export_bounds[0], "ymin": export_bounds[1], "xmax": export_bounds[2], "ymax": export_bounds[3]},
        },
        "resolution": {
            "exportWebMercatorMetresPerPixel": {"x": pixel_x, "y": pixel_y},
            "approximateLocalGroundMetresPerPixelAtCenterLatitude": {
                "x": pixel_x * math.cos(math.radians(center_latitude)),
                "y": pixel_y * math.cos(math.radians(center_latitude)),
            },
            "officialCatalogNativeMetres": unique("Resolution_m"),
            "resampling": "ArcGIS bilinear interpolation from the official Float32 DTM",
        },
        "elevation": {**elevation_stats, "unit": "metre", "verticalDatum": "CGVD2013 height", "verticalCrsWkid": 6647},
        "source": {
            "publisher": "Ontario Ministry of Natural Resources - Geospatial Ontario",
            "dataset": "Ontario Digital Terrain Model (Lidar-Derived)",
            "project": PROJECT, "service": SERVICE_URL,
            "arcgisItemId": ARCGIS_ITEM_ID,
            "arcgisItemUrl": f"https://www.arcgis.com/home/item.html?id={ARCGIS_ITEM_ID}",
            "sourcePixelType": service.get("pixelType"), "sourcePixelSizeMetres": service.get("pixelSizeX"),
            "heightModelInfo": service.get("heightModelInfo"),
            "catalog": {
                "intersectingRasterCount": len(attributes),
                "selectionSha256": hashlib.sha256("\n".join(identity_rows).encode()).hexdigest(),
                "acquisitionMethods": unique("AcqMethod"), "startYears": unique("StartYear"), "endYears": unique("EndYear"),
                "horizontalAccuracyMetres": unique("HorizontalAccuracy_m"),
                "verticalAccuracyClassCentimetres": unique("VerticalAccuracyClass"),
            },
            "mosaicRule": mosaic_rule, "renderingRule": {"rasterFunction": "None"},
            "sourceGeoTiffSha256": hashlib.sha256(geotiff_bytes).hexdigest(),
        },
        "integrity": {"pngSha256": hashlib.sha256(png_bytes).hexdigest(), "pngBytes": len(png_bytes)},
    }
    _atomic_write(output_png, png_bytes)
    _atomic_write(output_metadata, (json.dumps(metadata, indent=2) + "\n").encode())
    return metadata


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--output", type=Path, default=Path("city-explorer/data/terrain/peterborough-dtm-2025-terrarium.png"))
    parser.add_argument("--metadata", type=Path, default=Path("city-explorer/data/terrain/peterborough-dtm-2025.json"))
    args = parser.parse_args(argv)
    metadata = build(args.output, args.metadata, args.width)
    print(json.dumps({
        "status": "pass", "asset": str(args.output), "metadata": str(args.metadata),
        "dimensions": metadata["dimensions"], "pngBytes": metadata["integrity"]["pngBytes"],
        "elevation": metadata["elevation"], "resolution": metadata["resolution"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
