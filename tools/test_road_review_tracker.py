"""Test real tracker generation, validation, provenance, and CLI staleness."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('build_road_review_tracker.py')

class TrackerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.audit = {'schemaVersion': 2, 'hashes': {}, 'codeHashes': {}, 'roads': [
            {'osmId': '2', 'name': '=HYPERLINK("evil")', 'status': 'lane-count-conflict', 'comparisonReview': 'lane-count-review', 'osmLanes': 4, 'ornLaneValues': [2], 'tags': {'lanes': '4'}},
            {'osmId': '1', 'name': 'Ordinary', 'status': 'lane-count-agrees', 'comparisonReview': 'count-agrees-not-field-verified', 'osmLanes': 2, 'ornLaneValues': [2], 'tags': {'lanes': '2'}}]}
        self.ledger = {'schemaVersion': 1, 'reviews': []}
    def write(self):
        (self.root/'audit.json').write_text(json.dumps(self.audit))
        (self.root/'ledger.json').write_text(json.dumps(self.ledger))
    def run_tool(self, *extra):
        self.write()
        return subprocess.run([sys.executable,str(SCRIPT),'--root',str(self.root),'--audit','audit.json','--ledger','ledger.json','--json','queue.json','--csv','queue.csv',*extra],capture_output=True,text=True)
    def review(self):
        row = self.audit['roads'][0]
        return {'osmId': '2', 'expectedAudit': {k:row[k] for k in ('status','comparisonReview','osmLanes','ornLaneValues')}, 'reviewDate':'2026-10-11', 'sourceURLs':['https://example.org/evidence'], 'acquisitionUncertainty':'Date unknown', 'confidenceBasis':'Historical source comparison only', 'nextCheck':'Verify carriageway in field', 'reviewCoverage':'documented-historical-evidence', 'evidenceKind':'historical-documentation', 'finding':'Sources conflict; no numeric correction justified.', 'flagged':True, 'currentConditionsVerified':False}
    def test_deterministic_full_queue_preserves_raw_values_and_absent_review(self):
        result = self.run_tool(); self.assertEqual(result.returncode,0,result.stderr)
        first = (self.root/'queue.json').read_bytes(); csv = (self.root/'queue.csv').read_bytes()
        result = self.run_tool('--check'); self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(first,(self.root/'queue.json').read_bytes()); self.assertEqual(csv,(self.root/'queue.csv').read_bytes())
        output=json.loads(first); self.assertEqual([r['osmId'] for r in output['rows']],['1','2'])
        self.assertFalse(output['rows'][0]['flagged']); self.assertFalse(output['rows'][0]['ledgerPresent']); self.assertEqual(output['rows'][0]['reviewCoverage'],'unreviewed')
        self.assertEqual(output['rows'][1]['auditEvidence'], self.audit['roads'][0]); self.assertFalse(output['rows'][1]['sourceConflictResolved']); self.assertTrue(all(r['currentConditionsVerified'] is False for r in output['rows']))
        self.assertIn(b"'=HYPERLINK",csv); self.assertEqual(set(output['inputHashes']),{'audit','ledger','generator'})
    def test_curated_entry_does_not_resolve_raw_conflict(self):
        self.ledger['reviews']=[self.review()]; result=self.run_tool(); self.assertEqual(result.returncode,0,result.stderr)
        row=json.loads((self.root/'queue.json').read_text())['rows'][1]; self.assertTrue(row['ledgerPresent']); self.assertFalse(row['sourceConflictResolved']); self.assertEqual(row['auditEvidence']['osmLanes'],4)
    def test_schema_three_partial_profile_retains_unknowns(self):
        self.audit['schemaVersion']=3
        review=dict(self.review(),reviewCoverage='partial-historical-paint-profile',paintCoverage={'partialAppearance':True,'from':10,'to':90})
        self.ledger['reviews']=[review]
        result=self.run_tool(); self.assertEqual(result.returncode,0,result.stderr)
        row=json.loads((self.root/'queue.json').read_text())['rows'][1]
        self.assertEqual(row['review']['paintCoverage'],review['paintCoverage'])
        self.assertFalse(row['currentConditionsVerified']); self.assertFalse(row['sourceConflictResolved'])
    def test_duplicate_and_unknown_review_ids_rejected(self):
        for reviews in ([self.review(),self.review()],[dict(self.review(),osmId='99')]):
            self.ledger['reviews']=reviews; self.assertNotEqual(self.run_tool().returncode,0)
    def test_stale_expected_audit_rejected(self):
        review=self.review(); review['expectedAudit']['osmLanes']=3; self.ledger['reviews']=[review]; result=self.run_tool(); self.assertNotEqual(result.returncode,0); self.assertIn('stale',result.stderr)
    def test_missing_evidence_fields_and_current_certification_rejected(self):
        for field in ('sourceURLs','reviewDate','acquisitionUncertainty','confidenceBasis','nextCheck','expectedAudit'):
            row=self.review(); del row[field]; self.ledger['reviews']=[row]; self.assertNotEqual(self.run_tool().returncode,0,field)
        self.ledger['reviews']=[dict(self.review(),currentConditionsVerified=True)]; self.assertNotEqual(self.run_tool().returncode,0)
    def test_duplicate_audit_ids_rejected(self):
        self.audit['roads'].append(copy.deepcopy(self.audit['roads'][0])); self.assertNotEqual(self.run_tool().returncode,0)
    def test_check_detects_modified_json_csv_and_ledger(self):
        self.assertEqual(self.run_tool().returncode,0)
        for name in ('queue.json','queue.csv'):
            (self.root/name).write_text('stale'); self.assertNotEqual(self.run_tool('--check').returncode,0); self.assertEqual(self.run_tool().returncode,0)
        self.ledger['notes']='new ledger bytes'; self.assertNotEqual(self.run_tool('--check').returncode,0)
    def test_generator_hash_change_makes_check_fail(self):
        self.assertEqual(self.run_tool().returncode,0)
        copied=self.root/'changed-generator.py'
        copied.write_bytes(SCRIPT.read_bytes()+b'\n# changed generator bytes\n')
        result=subprocess.run([sys.executable,str(copied),'--root',str(self.root),'--audit','audit.json','--ledger','ledger.json','--json','queue.json','--csv','queue.csv','--check'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0); self.assertIn('stale',result.stderr)
    def test_audit_change_makes_check_fail_without_mutating_artifacts(self):
        self.assertEqual(self.run_tool().returncode,0)
        before=(self.root/'queue.json').read_bytes()
        self.audit['roads'][1]['name']='Updated name'
        self.assertNotEqual(self.run_tool('--check').returncode,0)
        self.assertEqual((self.root/'queue.json').read_bytes(),before)
    def test_source_and_evaluator_drift_reported_and_check_fails(self):
        self.audit['hashes']={'source.json':'0'*64}; self.audit['codeHashes']={'evaluator.py':'1'*64}
        result=self.run_tool(); self.assertEqual(result.returncode,0,result.stderr)
        output=json.loads((self.root/'queue.json').read_text()); self.assertEqual(len(output['auditHashDrift']),2)
        result=self.run_tool('--check'); self.assertNotEqual(result.returncode,0); self.assertIn('drift',result.stderr)

if __name__ == '__main__': unittest.main()
