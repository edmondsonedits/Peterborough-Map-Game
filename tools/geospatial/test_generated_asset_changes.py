"""Fail-safe staged-blob regression tests for the narrow timestamp-churn guard."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('classify_generated_asset_changes.py')
MANIFEST = 'city-explorer/data/manifest.json'
VALIDATION = 'city-explorer/data/road-validation.json'
REPORT = 'city-explorer/ROAD-VALIDATION.md'
OLD = '2026-10-11T19:09:22+00:00'
NEW = '2026-10-11T20:02:43+00:00'

class GeneratedChangesTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'production staged-asset classifier must exist')
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git('init', '-q')
        self.write(MANIFEST, json.dumps({'generated_at':OLD,'geometry':[1,2],'nested':{'generated_at':OLD}}))
        self.write(VALIDATION, json.dumps({'generated_at':OLD,'status':'PASS','count':12}))
        self.write(REPORT, '# Peterborough Road Alignment Validation\n\nGenerated: '+OLD+'\n\n**Result: PASS**\n')
        self.write('city-explorer/data/other.json', json.dumps({'generated_at':OLD}))
        self.git('add','.'); self.git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','fixture')
    def git(self,*args):
        return subprocess.check_output(['git','-C',str(self.root),*args])
    def write(self,name,text):
        target=self.root/name; target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    def change(self,name,old=OLD,new=NEW):
        path=self.root/name; path.write_text(path.read_text().replace(old,new))
    def classify(self):
        result=subprocess.run([sys.executable,str(SCRIPT),'--repo',str(self.root)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)
    def test_timestamp_only_known_three_file_diff_is_suppressed(self):
        for name in [MANIFEST,VALIDATION,REPORT]: self.change(name)
        # Nested timestamp is semantic and must not be suppressed.
        self.change(MANIFEST, '"nested": {"generated_at": "'+NEW+'"}', '"nested": {"generated_at": "'+OLD+'"}')
        self.git('add','.')
        self.assertEqual(self.classify()['classification'],'timestamp-only')
        self.assertNotEqual(self.git('diff','--cached','--name-only'),b'', 'guard must not discard staged timestamps')
    def test_no_changes_are_reported_as_unchanged(self):
        self.assertEqual(self.classify()['classification'],'unchanged')
    def test_geometry_audit_unknown_fields_and_nested_timestamp_remain_meaningful(self):
        cases=[{'generated_at':NEW,'geometry':[1,3],'nested':{'generated_at':OLD}},
               {'generated_at':NEW,'geometry':[1,2],'nested':{'generated_at':NEW}},
               {'generated_at':NEW,'geometry':[1,2],'nested':{'generated_at':OLD},'new_field':True},
               {'generated_at':NEW,'geometry':[1,2]},
               {'generated_at':NEW,'geometry':[True,2],'nested':{'generated_at':OLD}}]
        for value in cases:
            self.write(MANIFEST,json.dumps(value));self.git('add',MANIFEST)
            self.assertTrue(self.classify()['meaningful_changes'],value)
        self.change(VALIDATION,'PASS','FAIL');self.git('add',VALIDATION)
        self.assertTrue(self.classify()['meaningful_changes'])
    def test_added_deleted_renamed_and_unknown_files_remain_meaningful(self):
        self.change('city-explorer/data/other.json');self.git('add','.')
        self.assertTrue(self.classify()['meaningful_changes'])
        self.git('reset','--hard','-q','HEAD');self.write('city-explorer/data/new.json',json.dumps({'generated_at':NEW}));self.git('add','.')
        self.assertTrue(self.classify()['meaningful_changes'])
        self.git('reset','--hard','-q','HEAD');(self.root/MANIFEST).unlink();self.git('add','-u')
        self.assertTrue(self.classify()['meaningful_changes'])
        self.git('reset','--hard','-q','HEAD');self.git('mv',MANIFEST,'city-explorer/data/renamed.json')
        self.assertTrue(self.classify()['meaningful_changes'])
    def test_missing_added_or_nonstring_timestamp_is_meaningful(self):
        for value in [None,123,False,{},'not-a-timestamp']:
            data={'generated_at':value,'geometry':[1,2],'nested':{'generated_at':OLD}}
            self.write(MANIFEST,json.dumps(data));self.git('add',MANIFEST)
            self.assertTrue(self.classify()['meaningful_changes'])
        self.write(MANIFEST,json.dumps({'geometry':[1,2],'nested':{'generated_at':OLD}}));self.git('add',MANIFEST)
        self.assertTrue(self.classify()['meaningful_changes'])
        self.git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','missing timestamp baseline')
        self.write(MANIFEST,json.dumps({'generated_at':NEW,'geometry':[1,2],'nested':{'generated_at':OLD}}));self.git('add',MANIFEST)
        self.assertTrue(self.classify()['meaningful_changes'])
    def test_markdown_only_exact_single_generated_line_value_is_ignored(self):
        baseline=(self.root/REPORT).read_text()
        for text in [baseline.replace(OLD,NEW).replace('PASS','FAIL'),baseline.replace('Generated:','Generated at:'),baseline.replace(OLD,NEW)+'Generated: '+NEW+'\n',baseline.replace(OLD,'invalid'),baseline.replace('Generated: '+OLD+'\n',''),baseline.replace(OLD,NEW)+'\n']:
            self.write(REPORT,text);self.git('add',REPORT);self.assertTrue(self.classify()['meaningful_changes'])
    def test_malformed_duplicate_keys_and_nonfinite_json_are_not_suppressed(self):
        for text in ['{broken', '{"generated_at":"'+NEW+'","count":NaN}', '{"generated_at":"'+OLD+'","generated_at":"'+NEW+'"}', '[1,2]', 'null']:
            self.write(MANIFEST,text);self.git('add',MANIFEST);self.assertTrue(self.classify()['meaningful_changes'])
    def test_mixed_substantive_batch_keeps_all_staged_changes(self):
        self.change(REPORT);self.change(VALIDATION);self.change(MANIFEST,'[1, 2]','[1, 9]');self.git('add','.')
        before=self.git('diff','--cached','--binary');self.assertTrue(self.classify()['meaningful_changes'])
        self.assertEqual(before,self.git('diff','--cached','--binary'))
    def test_staged_blobs_not_working_tree_determine_result(self):
        self.change(REPORT);self.git('add',REPORT);self.change(REPORT,'PASS','FAIL')
        self.assertFalse(self.classify()['meaningful_changes'])
        self.git('add',REPORT);self.write(REPORT,'Generated: '+NEW+'\n')
        self.assertTrue(self.classify()['meaningful_changes'])
    def test_file_mode_change_is_meaningful(self):
        self.change(REPORT);self.git('add',REPORT);self.git('update-index','--chmod=+x',REPORT)
        self.assertTrue(self.classify()['meaningful_changes'])
    def test_json_formatting_and_untracked_work_are_not_timestamp_replacements(self):
        data=json.loads((self.root/MANIFEST).read_text());data['generated_at']=NEW
        self.write(MANIFEST,json.dumps(data,indent=2));self.git('add',MANIFEST)
        self.assertTrue(self.classify()['meaningful_changes'])
        self.git('reset','--hard','-q','HEAD');self.change(REPORT)
        self.assertEqual(self.classify()['classification'],'unchanged')
    def test_github_output_and_git_errors_fail_safe(self):
        output=self.root/'output.txt'
        result=subprocess.run([sys.executable,str(SCRIPT),'--repo',str(self.root),'--github-output',str(output)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(output.read_text(),'meaningful_changes=false\n')
        self.change(VALIDATION,'PASS','FAIL');self.git('add',VALIDATION)
        result=subprocess.run([sys.executable,str(SCRIPT),'--repo',str(self.root),'--github-output',str(output)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertTrue(output.read_text().endswith('meaningful_changes=true\n'))
        before=output.read_bytes()
        result=subprocess.run([sys.executable,str(SCRIPT),'--repo',str(self.root/'missing'),'--github-output',str(output)],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertEqual(output.read_bytes(),before)
    def test_workflow_keeps_validation_and_only_gates_commit(self):
        workflow=SCRIPT.parents[2]/'.github/workflows/build-peterborough-assets.yml'
        text=workflow.read_text()
        self.assertIn('python tools/geospatial/test_generated_asset_changes.py',text)
        self.assertIn('steps.asset_changes.outputs.meaningful_changes',text)
        self.assertLess(text.index('Validate generated JSON and JavaScript'),text.index('classify_generated_asset_changes.py'))
        self.assertLess(text.index('git add city-explorer/data city-explorer/ROAD-VALIDATION.md'),text.index('classify_generated_asset_changes.py'))
        self.assertIn("git commit -m 'Refresh Peterborough geospatial assets [skip ci]'",text)

if __name__=='__main__': unittest.main()
