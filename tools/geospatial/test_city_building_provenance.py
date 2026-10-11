"""Cached gap-fill filtering must retain the original municipal source count."""
import copy
import unittest
from build_peterborough_assets import filter_city_building_gap_fill


def ring(lon, lat):
    return [[lon, lat], [lon + .0001, lat], [lon + .0001, lat + .0001], [lon, lat + .0001], [lon, lat]]


class BuildingProvenanceTests(unittest.TestCase):
    def test_repeated_cached_filter_retains_source_count_and_features(self):
        overlapping = ring(-78.32, 44.3)
        gap = ring(-78.31, 44.3)
        source = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [coordinates]}}
            for coordinates in [overlapping, gap]
        ]}
        osm = {'elements': [{'type': 'way', 'tags': {'building': 'yes'},
            'geometry': [{'lon': lon, 'lat': lat} for lon, lat in overlapping]}]}
        original = copy.deepcopy(source)
        first = filter_city_building_gap_fill(source, osm)
        self.assertEqual(source, original, 'source must not be mutated')
        self.assertEqual(first['metadata']['source_feature_count'], 2)
        self.assertEqual(first['metadata']['gap_fill_feature_count'], 1)
        for _ in range(2):
            cached = filter_city_building_gap_fill(first, osm)
            self.assertEqual(cached['metadata']['source_feature_count'], 2)
            self.assertEqual(cached['metadata']['gap_fill_feature_count'], 1)
            self.assertEqual(cached['features'], first['features'])
            first = cached


if __name__ == '__main__':
    unittest.main()
