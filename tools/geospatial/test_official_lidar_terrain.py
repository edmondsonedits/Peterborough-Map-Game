#!/usr/bin/env python3
"""Pure, offline tests for the official Peterborough terrain converter."""

import binascii
import math
import struct
import unittest
import zlib

from official_lidar_terrain import (
    BBOX_WGS84,
    decode_float32_geotiff,
    decode_terrarium,
    encode_terrarium,
    encode_terrarium_png,
    export_dimensions,
    project_bounds,
)


def stripped_float_tiff(width, height, values, xmin=10.0, ymax=30.0, scale=2.0):
    """Create the minimal uncompressed Float32 GeoTIFF our decoder accepts."""
    entries = []
    extras = bytearray()
    ifd_offset = 8
    entry_count = 15
    extras_offset = ifd_offset + 2 + entry_count * 12 + 4

    def add(tag, kind, count, value):
        nonlocal extras_offset
        if isinstance(value, bytes):
            offset = extras_offset + len(extras)
            extras.extend(value)
            entries.append((tag, kind, count, offset))
        else:
            entries.append((tag, kind, count, value))

    pixel_bytes = struct.pack("<" + "f" * len(values), *values)
    add(256, 4, 1, width)
    add(257, 4, 1, height)
    add(258, 3, 1, 32)
    add(259, 3, 1, 1)
    add(262, 3, 1, 1)
    strip_offset_index = len(entries)
    add(273, 4, 1, 0)
    add(274, 3, 1, 1)
    add(277, 3, 1, 1)
    add(278, 4, 1, height)
    add(279, 4, 1, len(pixel_bytes))
    add(284, 3, 1, 1)
    add(339, 3, 1, 3)
    add(33550, 12, 3, struct.pack("<3d", scale, scale, 0))
    add(33922, 12, 6, struct.pack("<6d", 0, 0, 0, xmin, ymax, 0))
    nodata = b"3.4028234663852886e38\0"
    add(42113, 2, len(nodata), nodata)
    entries.sort()
    pixel_offset = extras_offset + len(extras)
    for index, entry in enumerate(entries):
        if entry[0] == 273:
            entries[index] = (entry[0], entry[1], entry[2], pixel_offset)
    header = b"II" + struct.pack("<HIH", 42, ifd_offset, entry_count)
    directory = b"".join(struct.pack("<HHII", *entry) for entry in entries) + struct.pack("<I", 0)
    return header + directory + extras + pixel_bytes


class OfficialTerrainTests(unittest.TestCase):
    def test_web_mercator_extent_and_dimensions(self):
        bounds = project_bounds(BBOX_WGS84)
        self.assertAlmostEqual(bounds[0], -8728004.675646614, places=5)
        self.assertAlmostEqual(bounds[1], 5503435.110430013, places=5)
        self.assertAlmostEqual(bounds[2], -8710193.557119692, places=5)
        self.assertAlmostEqual(bounds[3], 5525216.417374323, places=5)
        self.assertEqual(export_dimensions(bounds, 1536), (1536, 1878))
        self.assertLess((bounds[2] - bounds[0]) / 1536, 15)
        self.assertLess((bounds[3] - bounds[1]) / 1878, 15)

    def test_terrarium_round_trip_and_limits(self):
        for elevation in (-32768.0, -4.898, 0, 186.125, 32767.99609375):
            rgb = encode_terrarium(elevation)
            self.assertLessEqual(abs(decode_terrarium(*rgb) - elevation), 1 / 512)
        self.assertEqual(encode_terrarium(0), (128, 0, 0))

    def test_float_geotiff_decode_and_georeference(self):
        payload = stripped_float_tiff(2, 2, [100.25, 101.5, 99.0, 98.75])
        raster = decode_float32_geotiff(payload)
        self.assertEqual((raster["width"], raster["height"]), (2, 2))
        self.assertEqual(tuple(raster["heights"]), (100.25, 101.5, 99.0, 98.75))
        self.assertEqual(raster["bounds"], (10.0, 26.0, 14.0, 30.0))

    def test_png_is_rgb_and_preserves_codes(self):
        png, stats = encode_terrarium_png(2, 2, [100.25, 101.5, 99.0, 98.75])
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        ihdr_length = struct.unpack(">I", png[8:12])[0]
        self.assertEqual(ihdr_length, 13)
        width, height, depth, colour = struct.unpack(">IIBB", png[16:26])
        self.assertEqual((width, height, depth, colour), (2, 2, 8, 2))
        self.assertLessEqual(stats["maximumQuantizationErrorMetres"], 1 / 512)
        # Confirm the PNG has valid CRCs and inflates to filter+RGB scanlines.
        cursor, idat = 8, bytearray()
        while cursor < len(png):
            length = struct.unpack(">I", png[cursor:cursor + 4])[0]
            kind = png[cursor + 4:cursor + 8]
            body = png[cursor + 8:cursor + 8 + length]
            crc = struct.unpack(">I", png[cursor + 8 + length:cursor + 12 + length])[0]
            self.assertEqual(crc, binascii.crc32(kind + body) & 0xFFFFFFFF)
            if kind == b"IDAT":
                idat.extend(body)
            cursor += 12 + length
        self.assertEqual(len(zlib.decompress(idat)), 2 * (1 + 2 * 3))


if __name__ == "__main__":
    unittest.main(verbosity=2)
