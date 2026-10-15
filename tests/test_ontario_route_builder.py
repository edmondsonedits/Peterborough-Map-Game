"""Topology/admission/provenance regressions for the Ontario OSM route builder."""
import base64
import gzip
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest

BUILDER = Path(__file__).resolve().parents[1] / 'tools/geospatial/build_ontario_route_networks.py'
spec = importlib.util.spec_from_file_location('ontario_builder', BUILDER)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class Member:
    def __init__(self, kind, ref, role):
        self.type, self.ref, self.role = kind, ref, role


class Relation:
    id = 900
    tags = {'type': 'restriction', 'restriction': 'no_left_turn', 'restriction:conditional': 'no_left_turn @ (Mo-Fr 07:00-09:00)', 'except': 'bicycle;emergency'}
    members = [Member('w', 10, 'from'), Member('n', 2, 'via'), Member('w', 20, 'to')]


class RouteBuilderTests(unittest.TestCase):
    def test_rdp_retains_shared_nodes_even_on_straight_road(self):
        ids, points = builder.simplify([1, 2, 3, 4], [[-79, 44], [-78.99999, 44], [-78.99998, 44], [-78.99997, 44]], {2})
        self.assertEqual(ids, [1, 2, 4])
        self.assertEqual(len(ids), len(points))

    def test_rdp_keeps_controls_and_restriction_vias(self):
        ids, _ = builder.simplify([1, 2, 3, 4], [[-79, 44], [-78.99999, 44], [-78.99998, 44], [-78.99997, 44]], {2, 3})
        self.assertEqual(ids, [1, 2, 3, 4])

    def test_rdp_retains_real_curve_at_1_9_metres(self):
        ids, _ = builder.simplify([1, 2, 3], [[-79, 44], [-78.9999, 44.00005], [-78.9998, 44]], set())
        self.assertEqual(ids, [1, 2, 3])

    def test_rdp_cannot_invent_coordinate_junction(self):
        a, _ = builder.simplify([11, 12], [[0, 0], [1, 1]], set())
        b, _ = builder.simplify([21, 22], [[0, 1], [1, 0]], set())
        self.assertFalse(set(a) & set(b))

    def test_service_composite_parking_aisle_is_excluded(self):
        for service in ('parking_aisle', 'alley;parking_aisle', 'drive-through;alley', 'drive_through'):
            self.assertIsNone(builder.way_admission({'highway': 'service', 'service': service}, [[-79, 44], [-78.999, 44]], []))

    def test_emergency_exception_keeps_original_service_tags(self):
        tags = {'highway': 'service', 'service': 'parking_aisle;alley', 'emergency': 'yes', 'access': 'private'}
        self.assertEqual(builder.way_admission(tags, [[-79, 44], [-78.999, 44]], []), 'road')
        self.assertEqual(tags['access'], 'private')

    def test_driveway_requires_active_base_near_any_segment(self):
        coords = [[-79, 44], [-78.99, 44]]
        tags = {'highway': 'service', 'service': 'driveway;alley'}
        self.assertEqual(builder.way_admission(tags, coords, [{'lat': 44.0005, 'lng': -78.995}]), 'base-only')
        self.assertIsNone(builder.way_admission(tags, coords, [{'lat': 44.01, 'lng': -78.995}]))

    def test_full_way_crossing_bounds_is_selected_without_inside_vertex(self):
        self.assertTrue(builder.intersects([[-2, 0], [2, 0]], [-1, -1, 1, 1]))
        self.assertFalse(builder.intersects([[-2, 2], [2, 2]], [-1, -1, 1, 1]))

    def test_via_node_restriction_preserves_conditional_and_exceptions(self):
        record = builder.parse_restriction(Relation())[0]
        self.assertEqual(record['viaNodeId'], 2)
        self.assertEqual(record['fromWayId'], 10)
        self.assertEqual(record['toWayId'], 20)
        self.assertEqual(record['restriction:conditional'], Relation.tags['restriction:conditional'])
        self.assertEqual(record['except'], 'bicycle;emergency')

    def test_via_way_restriction_keeps_order(self):
        relation = Relation()
        relation.members = [Member('w', 10, 'from'), Member('w', 30, 'via'), Member('w', 40, 'via'), Member('w', 20, 'to')]
        self.assertEqual(builder.parse_restriction(relation)[0]['viaWayIds'], [30, 40])

    def test_island_policy_is_limited_to_named_asphalt_service_roads(self):
        tags = {'highway': 'service', 'name': 'Cibola Avenue', 'surface': 'asphalt', 'access': 'private'}
        access = builder.island_emergency_access(tags, [[-79.38, 43.62], [-79.379, 43.62]])
        self.assertTrue(access['verified'])
        self.assertEqual(access['maxspeedKph'], 30)
        self.assertFalse(access['stationExitVerified'])
        self.assertEqual(tags['access'], 'private')
        for change in ({'highway': 'footway'}, {'surface': 'wood'}, {'bridge': 'yes'}, {'name': 'South Boardwalk'}, {'surface': ''}):
            self.assertIsNone(builder.island_emergency_access({**tags, **change}, [[-79.38, 43.62], [-79.379, 43.62]]))

    def test_standalone_node_access_and_physical_controls_are_collected(self):
        self.assertTrue({'vehicle', 'motor_vehicle', 'motorcar', 'emergency', 'locked', 'maxheight', 'maxwidth', 'maxweight', 'maxaxleload'} <= builder.CONTROL_KEYS)

    def test_all_33_configs_have_canonical_active_base_seeds(self):
        configs = builder.extract_config(BUILDER.parents[2])
        self.assertEqual(len(configs), 33)
        self.assertEqual(len(configs['peterborough']['bases']), 5)
        self.assertEqual(len(configs['belleville']['bases']), 7)
        self.assertEqual(len(configs['scarborough']['bases']), 29)
        self.assertTrue(all(base.get('status') != 'planned' for value in configs.values() for base in value['bases']))

    def test_generated_assets_have_complete_topology_and_provenance(self):
        root = BUILDER.parents[2]
        city_ids = list(builder.extract_config(root))
        if not all((root / 'cities' / city / 'route-network.js').exists() for city in city_ids):
            self.skipTest('All-city generated assets not present yet')
        for city in city_ids:
            with self.subTest(city=city):
                source = (root / 'cities' / city / 'route-network.js').read_text()
                encoded = re.search(r"const encoded='([^']+)'", source)[1]
                payload = json.loads(gzip.decompress(base64.b64decode(encoded)))
                self.assertEqual(payload['cityId'], city)
                self.assertEqual(payload['graphVersion'], builder.GRAPH_VERSION)
                self.assertEqual(payload['source']['sha256'], builder.SOURCE_SHA256)
                self.assertEqual(payload['source']['snapshot'], builder.SNAPSHOT)
                self.assertGreater(len(payload['features']), 100)
                ways = {}
                node_locations = {}
                for feature in payload['features']:
                    props = feature['properties']
                    coords = feature['geometry']['coordinates']
                    ids = props['nodeIds']
                    self.assertEqual(len(ids), len(coords))
                    self.assertGreaterEqual(len(ids), 2)
                    ways[props['osm_id']] = feature
                    for node_id, coord in zip(ids, coords):
                        self.assertIsInstance(node_id, int)
                        self.assertGreater(node_id, 0)
                        if node_id in node_locations:
                            self.assertEqual(node_locations[node_id], coord)
                        node_locations[node_id] = coord
                    service = builder.tokens(props.get('service'))
                    if service & {'parking_aisle', 'drive-through', 'drive_through'}:
                        self.assertTrue(builder.emergency_explicit(props) or props.get('restrictionMemberOnly'))
                    if 'driveway' in service:
                        self.assertEqual(props['routeAccess'], 'base-only')
                    if props.get('emergencyAccess'):
                        self.assertEqual(props['surface'], 'asphalt')
                        self.assertEqual(props['highway'], 'service')
                        self.assertIn(props.get('bridge'), (None, 'no'))
                for node_id in payload['controls']:
                    self.assertIn(int(node_id), node_locations)
                for restriction in payload['turnRestrictions']:
                    self.assertIn(restriction['fromWayId'], ways)
                    self.assertIn(restriction['toWayId'], ways)
                    for way_id in restriction.get('viaWayIds', []):
                        self.assertIn(way_id, ways)
                    if 'viaNodeId' in restriction:
                        self.assertIn(restriction['viaNodeId'], node_locations)

    def test_province_edge_supplement_requires_snapshot_compatible_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / 'supplements').mkdir()
            path = cache / 'supplements/way-55.osm'
            xml = '<osm><node id="1" version="2" timestamp="2020-01-01T00:00:00Z" lon="-79" lat="44"><tag k="barrier" v="gate"/></node><node id="2" version="1" timestamp="2020-01-01T00:00:00Z" lon="-78.999" lat="44"/><way id="55" version="3" timestamp="2026-10-06T00:00:00Z"><nd ref="1"/><nd ref="2"/><tag k="highway" v="secondary"/><tag k="access" v="no"/></way></osm>'
            path.write_text(xml)
            payload, evidence, controls = builder.supplement_missing_way(55, cache)
            self.assertEqual(payload['nodeIds'], [1, 2])
            self.assertEqual(payload['tags']['access'], 'no')
            self.assertEqual(evidence['wayVersion'], 3)
            self.assertEqual(controls[1]['barrier'], 'gate')
            path.write_text(xml.replace('2020-01-01T00:00:00Z', '2026-10-15T00:00:00Z', 1))
            with self.assertRaises(ValueError):
                builder.supplement_missing_way(55, cache)
            path.write_text(xml.replace('2026-10-06T00:00:00Z', '2026-10-15T00:00:00Z'))
            with self.assertRaises(ValueError):
                builder.supplement_missing_way(55, cache)

    def test_native_location_index_preserves_node_identity_and_controls(self):
        import osmium
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fixture.osm'
            source.write_text('<osm version="0.6"><node id="1" lat="44" lon="-79"><tag k="highway" v="stop"/></node><node id="2" lat="44" lon="-78.999"><tag k="vehicle:conditional" v="no @ (snow)"/></node><node id="3" lat="44" lon="-78.998"/><way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/></way></osm>')
            observed = {'controls': {}, 'ways': []}
            class Handler(osmium.SimpleHandler):
                def node(self, node):
                    observed['controls'][int(node.id)] = dict(node.tags)
                def way(self, way):
                    observed['ways'].append(([int(n.ref) for n in way.nodes], [[n.location.lon, n.location.lat] for n in way.nodes]))
            index = osmium.index.create_map(f'sparse_file_array,{directory}/index')
            locations = osmium.NodeLocationsForWays(index)
            reader = osmium.io.Reader(str(source))
            osmium.apply(reader, locations, osmium.filter.KeyFilter(*sorted(builder.CONTROL_KEYS)), Handler())
            reader.close()
            self.assertEqual(observed['ways'][0][0], [1, 2, 3])
            self.assertEqual(observed['ways'][0][1][1], [-78.999, 44.0])
            self.assertEqual(observed['controls'][2], {'vehicle:conditional': 'no @ (snow)'})

    def test_gzip_js_round_trip_preserves_metadata(self):
        payload = {'type': 'FeatureCollection', 'schemaVersion': 1, 'cityId': 'test', 'graphVersion': builder.GRAPH_VERSION, 'features': []}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'route-network.js'
            builder.write_asset(path, payload)
            source = path.read_text()
            encoded = re.search(r"const encoded='([^']+)'", source)[1]
            self.assertEqual(json.loads(gzip.decompress(base64.b64decode(encoded))), payload)
            self.assertIn('window.PTBO_ROUTE_NETWORK_READY', source)
            self.assertIn('window.PTBO_ROUTE_NETWORK=network', source)
            self.assertIn("new DecompressionStream('gzip')", source)


if __name__ == '__main__':
    unittest.main()
