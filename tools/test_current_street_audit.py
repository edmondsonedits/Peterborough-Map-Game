"""Check committed audit identifies current source and eligibility bytes honestly."""
import hashlib
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class CurrentStreetAudit(unittest.TestCase):
    def test_input_and_evaluator_hashes_match(self):
        audit=json.loads((ROOT/'docs/street-audit/network-audit.json').read_text())
        for group in ('hashes','codeHashes'):
            for name,expected in audit[group].items():
                with self.subTest(path=name):
                    self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),expected)
    def test_partial_profiles_never_certify_rendered_or_current_conditions(self):
        audit=json.loads((ROOT/'docs/street-audit/network-audit.json').read_text())
        self.assertEqual(audit['summary']['eligiblePaintWays'],6)
        self.assertIsNone(audit['summary']['renderedPaintWays'])
        roads={r['osmId']:r for r in audit['roads']}
        for identity in ('250810393','250811912'):
            row=roads[identity]
            self.assertEqual(row['paintEligibility'],'eligible-not-render-verified')
            self.assertEqual(row['paintSupport'],'not-evaluated')
            self.assertIs(row['currentVerified'],False)
            self.assertTrue(row['paintCoverage']['partialAppearance'])
        self.assertEqual(roads['250811912']['paintCoverage']['from'],10)
        self.assertEqual(roads['250811912']['paintCoverage']['to'],90)
        self.assertEqual(roads['250811912']['osmLanes'],2)
        self.assertEqual(roads['250810393']['osmLanes'],4)
if __name__=='__main__':unittest.main()
