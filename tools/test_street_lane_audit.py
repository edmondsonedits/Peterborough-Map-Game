"""Run with python -m unittest discover -s tools -p 'test_street_lane_audit.py'."""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.find_spec('street_lane_compatibility')
if SPEC:
    import street_lane_compatibility as audit

class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(SPEC, 'direction-aware audit helper is missing')

    def test_oneway_both_is_incompatible_even_when_counts_agree(self):
        for oneway in ('yes', '1', 'true', '-1'):
            self.assertEqual(audit.direction_compatibility({'oneway': oneway}, 'Both', 1), 'carriageway-mismatch')

    def test_relative_orientation_and_reverse_oneway(self):
        for oneway, flow, dot in [('yes','Positive',1), ('yes','Negative',-1), ('-1','Positive',-1), ('-1','Negative',1)]:
            with self.subTest(oneway=oneway, flow=flow, dot=dot):
                self.assertEqual(audit.direction_compatibility({'oneway':oneway}, flow, dot), 'compatible')
                self.assertEqual(audit.direction_compatibility({'oneway':oneway}, flow, -dot), 'opposite-direction')

    def test_two_way_and_unknown(self):
        self.assertEqual(audit.direction_compatibility({}, 'Both', 1), 'compatible')
        self.assertEqual(audit.direction_compatibility({'oneway':'no'}, 'Positive', 1), 'carriageway-mismatch')
        for tags, flow in [({'oneway':'reversible'}, 'Both'), ({},None), ({'junction':'roundabout'},'Both'), ({'highway':'motorway'},'Both'), ({'oneway:conditional':'yes @ (Mo-Fr)'},'Both')]:
            self.assertNotEqual(audit.direction_compatibility(tags, flow, 1), 'compatible')

    def test_review_preserves_raw_discrepancies(self):
        for status in ('lane-count-conflict','lane-count-agrees','missing-OSM-count','partial-or-varying-evidence'):
            self.assertEqual(audit.comparison_review(status, {'carriageway-mismatch':3}), 'source-compatibility-review')
        self.assertEqual(audit.comparison_review('lane-count-conflict', {'compatible':3}), 'lane-count-review')
        self.assertEqual(audit.comparison_review('lane-count-agrees', {'compatible':3}), 'count-agrees-not-field-verified')
        self.assertEqual(audit.comparison_review('lane-count-agrees', {'compatible':2,'opposite-direction':1}), 'source-compatibility-review')
        self.assertEqual(audit.comparison_review('no-reliable-ORN-match', {}), 'insufficient-evidence')

    def test_paint_is_runtime_evaluated_and_separate(self):
        rows = audit.paint_overrides(Path(__file__).resolve().parents[1], [
            {'id':739159886,'tags':{'name':'Sherbrooke Street','lanes':'4'}},
            {'id':737434011,'tags':{'name':'Sherbrooke Street','lanes':'4','oneway':'yes'}},
            {'id':650896572,'tags':{'name':'Sherbrooke Street','lanes':'4','lane_markings':'no'}},
            {'id':460581459,'tags':{'name':'Different Street','lanes':'4'}},
            {'id':123,'tags':{'name':'Sherbrooke Street','lanes':'4'}}])
        self.assertEqual(rows, {'739159886':'sherbrooke-park-george'})

    def test_historical_profiles_require_whole_geometry_and_runtime_road_guards(self):
        import json, copy
        root = Path(__file__).resolve().parents[1]
        osm = json.loads((root/'city-explorer/data/peterborough-osm.json').read_text())['elements']
        for way_id in (250810393, 250811912):
            original = next(w for w in osm if w.get('type') == 'way' and w['id'] == way_id)
            result = audit.paint_eligibility(root, [original])[str(way_id)]
            self.assertEqual(result['paintEligibility'], 'eligible-not-render-verified')
            self.assertFalse(result['currentVerified'])
            self.assertEqual(result['paintSupport'], 'not-evaluated')
            self.assertGreater(result['paintCoverage']['sourceLength'], 40)
            self.assertTrue(result['paintCoverage']['partialAppearance'])
            self.assertEqual(result['profileId'], result['evidence'])
            self.assertIn('generalized', ' '.join(result['paintCoverage']['limitations']))
            self.assertEqual(result['paintCoverage']['longitudinalPartial'], way_id == 250811912)
            if way_id == 250811912:
                self.assertEqual(result['paintCoverage']['from'], 10)
                self.assertEqual(result['paintCoverage']['to'], 90)
                self.assertTrue(result['paintCoverage']['partial'])
            for delta in ({'bridge':'yes'}, {'tunnel':'yes'}, {'bridge:conditional':'yes @ (Mo)'},
                          {'tunnel:conditional':'yes @ (Mo)'}, {'lanes:forward':'1'},
                          {'turn:lanes:forward':'through'}, {'surface':'gravel'}):
                changed = copy.deepcopy(original)
                changed['tags'].update(delta)
                self.assertEqual(audit.paint_eligibility(root, [changed]), {}, delta)
            changed = copy.deepcopy(original)
            changed['geometry'][1]['lat'] += .000001
            self.assertEqual(audit.paint_eligibility(root, [changed]), {})
            changed = copy.deepcopy(original)
            changed['geometry'].append({'lat':None,'lon':None})
            self.assertEqual(audit.paint_eligibility(root, [changed]), {})
            changed = copy.deepcopy(original)
            changed['geometry'].reverse()
            self.assertIn(str(way_id), audit.paint_eligibility(root, [changed]))
        synthetic = {'id':250811912, 'tags':{'name':'Hospital Drive','lanes':'2','highway':'tertiary'},
                     'geometry':[{'lat':44.3,'lon':-78.32},{'lat':44.3,'lon':-78.319}]}
        self.assertEqual(audit.paint_eligibility(root, [synthetic]), {})

class AuditIntegrationTests(unittest.TestCase):
    def test_cli_preserves_raw_conflict_and_classifies_direction(self):
        import json, shutil, subprocess, sys, tempfile
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp)
            (fixture/'tools').mkdir()
            for name in ('audit_street_lane_evidence.py','street_lane_compatibility.py','evaluate_historical_paint.mjs'):
                shutil.copy(root/'tools'/name, fixture/'tools'/name)
            (fixture/'city-explorer').mkdir()
            for name in ('street-paint.js','historical-paint-profiles.js','road-network.js'):
                shutil.copy(root/'city-explorer'/name, fixture/'city-explorer'/name)
            data = fixture/'city-explorer/data'
            data.mkdir(exist_ok=True)
            coordinates = [[-78.32,44.3],[-78.319,44.3]]
            properties = {'OGF_ID':4460288,'official_names':['Medical Drive'],'DIRECTION_OF_TRAFFIC_FLOW':'Both'}
            feature = {'type':'Feature','properties':properties,'geometry':{'type':'LineString','coordinates':coordinates}}
            (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature]}))
            way = {'type':'way','id':250806638,'tags':{'name':'Medical Drive','lanes':'1','oneway':'yes'},'geometry':[{'lon':x,'lat':y} for x,y in coordinates]}
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
            for name in ('osm-roads.geojson','osm-public-roads.geojson'):
                (data/name).write_text(json.dumps({'features':[{'properties':{'osm_id':250806638}}]}))
            receipt = fixture/'receipt.json'
            receipt.write_text(json.dumps({'events':[{'ORN_ROAD_NET_ELEMENT_ID':4460288,'FROM_MEASURE':0,'TO_MEASURE':1000,'NUMBER_OF_LANES':2}]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            report = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())
            row = report['roads'][0]
            self.assertEqual(row['status'], 'lane-count-conflict')
            self.assertEqual(row.get('comparisonReview'), 'source-compatibility-review')
            self.assertEqual(row['directionCompatibility'], {'carriageway-mismatch':row['matchedSamples']})
            self.assertEqual(row['paintOverride'], 'not-applied')
            self.assertNotEqual(report.get('baseline'), '3a9f333270bd8d832e5651d6b4cda4125e90d32c')
            self.assertEqual(len(report['hashes']), 6)
            self.assertEqual(set(report['codeHashes']), {'tools/audit_street_lane_evidence.py','tools/street_lane_compatibility.py','tools/evaluate_historical_paint.mjs','city-explorer/street-paint.js','city-explorer/historical-paint-profiles.js','city-explorer/road-network.js'})
            way['tags']['lanes'] = '2'
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            row = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())['roads'][0]
            self.assertEqual(row['status'], 'lane-count-agrees')
            self.assertEqual(row['comparisonReview'], 'source-compatibility-review')
            way['tags']['lanes'] = '1'
            # Exercise the matcher, not just the pure signed-direction function.
            for oneway, flow, reverse, expected in [
                ('yes','Positive',False,'compatible'),
                ('yes','Negative',True,'compatible'),
                ('-1','Positive',True,'compatible'),
                ('-1','Negative',False,'compatible'),
                ('yes','Negative',False,'opposite-direction'),
                ('no','Positive',False,'carriageway-mismatch')]:
                with self.subTest(oneway=oneway, flow=flow, reverse=reverse):
                    way['tags']['oneway'] = oneway
                    properties['DIRECTION_OF_TRAFFIC_FLOW'] = flow
                    feature['geometry']['coordinates'] = coordinates[::-1] if reverse else coordinates
                    (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature]}))
                    (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
                    subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
                    row = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())['roads'][0]
                    self.assertEqual(row['status'], 'lane-count-conflict')
                    self.assertEqual(row['directionCompatibility'], {expected:row['matchedSamples']})
            # Equal lane counts from competing semantic matches must stay ambiguous.
            import copy
            feature['geometry']['coordinates'] = coordinates
            properties['DIRECTION_OF_TRAFFIC_FLOW'] = 'Positive'
            other = copy.deepcopy(feature)
            other['properties']['DIRECTION_OF_TRAFFIC_FLOW'] = 'Both'
            way['tags']['oneway'] = 'yes'
            (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature,other]}))
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            row = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())['roads'][0]
            self.assertEqual(row['directionCompatibility'], {'ambiguous-direction':row['matchedSamples']})
            properties['DIRECTION_OF_TRAFFIC_FLOW'] = 'Both'
            way['id'] = 739159886
            way['tags'] = {'name':'Sherbrooke Street','lanes':'2'}
            properties['official_names'] = ['Sherbrooke Street']
            (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature]}))
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
            for name in ('osm-roads.geojson','osm-public-roads.geojson'):
                (data/name).write_text(json.dumps({'features':[{'properties':{'osm_id':739159886}}]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            row = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())['roads'][0]
            self.assertEqual(row['visualReview'], 'sherbrooke-park-george-reference')
            self.assertEqual(row['paintOverride'], 'not-applied')
            way['id'] = 250811912
            way['tags'] = {'name':'Hospital Drive','lanes':'2'}
            properties['official_names'] = ['Hospital Drive']
            (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature]}))
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[way]}))
            for name in ('osm-roads.geojson','osm-public-roads.geojson'):
                (data/name).write_text(json.dumps({'features':[{'properties':{'osm_id':250811912}}]}))
            receipt.write_text(json.dumps({'events':[{'ORN_ROAD_NET_ELEMENT_ID':4460288,'FROM_MEASURE':0,'TO_MEASURE':1000,'NUMBER_OF_LANES':3}]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            report = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())
            row = report['roads'][0]
            self.assertEqual(row['visualReview'], 'not-reviewed')
            self.assertEqual(row['paintOverride'], 'not-applied')
            self.assertEqual(row['paintEligibility'], 'not-eligible')
            self.assertIsNone(row['paintCoverage'])
            self.assertFalse(row['currentVerified'])
            self.assertEqual(row['status'], 'lane-count-conflict')
            self.assertEqual(row['comparisonReview'], 'lane-count-review')
            self.assertEqual(row['osmLanes'], 2)
            self.assertEqual(report['summary']['reviewedCorrectionWays'], 0)
            # Use the actual seven original Hospital vertices, not a fabricated ID match.
            original = next(w for w in json.loads((root/'city-explorer/data/peterborough-osm.json').read_text())['elements'] if w.get('type') == 'way' and w['id'] == 250811912)
            (data/'peterborough-osm.json').write_text(json.dumps({'elements':[original]}))
            feature['geometry']['coordinates'] = [[p['lon'],p['lat']] for p in original['geometry']]
            (data/'orn-roads.geojson').write_text(json.dumps({'features':[feature]}))
            subprocess.run([sys.executable,str(fixture/'tools/audit_street_lane_evidence.py'),str(receipt)],check=True,capture_output=True)
            report = json.loads((fixture/'docs/street-audit/network-audit.json').read_text())
            row = report['roads'][0]
            self.assertEqual(row['paintOverride'], 'hospital-historical-shared-turn')
            self.assertEqual(row['paintEligibility'], 'eligible-not-render-verified')
            self.assertEqual(row['paintSupport'], 'not-evaluated')
            self.assertEqual(row['paintCoverage']['from'], 10)
            self.assertEqual(row['paintCoverage']['to'], 90)
            self.assertAlmostEqual(row['paintCoverage']['sourceLength'], 117.79052149748662)
            self.assertTrue(row['paintCoverage']['partial'])
            self.assertFalse(row['currentVerified'])
            self.assertEqual(row['status'], 'lane-count-conflict')
            self.assertEqual(row['osmLanes'], 2)
            import hashlib
            for name, digest in report['codeHashes'].items():
                self.assertEqual(digest, hashlib.sha256((fixture/name).read_bytes()).hexdigest())

if __name__ == '__main__':
    unittest.main()
