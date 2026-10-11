"""OSM endpoint failover must never replace newer reviewed data with stale data."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import build_peterborough_assets as assets

OLD='2026-07-15T15:22:01Z'
CACHED='2026-10-11T12:48:21Z'
FRESH='2026-10-11T20:22:01Z'

def payload(timestamp=CACHED,marker=1):
    return {'version':0.6,'osm3s':{'timestamp_osm_base':timestamp},'elements':[{'type':'node','id':marker,'lat':44.3,'lon':-78.3}]}

class Session:
    def __init__(self, replies): self.replies=list(replies);self.calls=[]
    def post(self, endpoint, **kwargs):
        self.calls.append(endpoint)
        result=self.replies.pop(0)
        if isinstance(result,Exception): raise result
        class Response:
            def raise_for_status(self): pass
            def json(self): return copy.deepcopy(result)
        return Response()

class FreshnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
    def cache(self,value): (self.root/'peterborough-osm.json').write_text(json.dumps(value))
    def fetch(self,replies):
        session=Session(replies)
        with patch.object(assets,'OVERPASS_ENDPOINTS',[f'endpoint-{i}' for i in range(len(replies))]):
            result=assets.fetch_or_reuse_osm(session,self.root)
        return result,session
    def test_stale_first_endpoint_does_not_hide_fresh_later_endpoint(self):
        self.cache(payload());result,session=self.fetch([payload(OLD,2),payload(FRESH,3)])
        self.assertEqual(result['elements'][0]['id'],3);self.assertEqual(len(session.calls),2)
    def test_primary_failure_and_stale_fallback_preserve_exact_cached_payload(self):
        cached=payload();self.cache(cached);before=(self.root/'peterborough-osm.json').read_bytes()
        result,session=self.fetch([RuntimeError('504 Gateway Timeout'),payload(OLD,2)])
        self.assertEqual(result,cached);self.assertEqual(len(session.calls),2)
        self.assertEqual((self.root/'peterborough-osm.json').read_bytes(),before)
    def test_valid_equal_timestamp_remote_is_allowed(self):
        self.cache(payload());result,_=self.fetch([payload(CACHED,2)])
        self.assertEqual(result['elements'][0]['id'],2)
    def test_equivalent_aware_timestamp_comparison_and_fractional_precision(self):
        self.cache(payload());result,session=self.fetch([payload('2026-10-11T08:48:20.999-04:00',2),payload('2026-10-11T08:48:21-04:00',3)])
        self.assertEqual(result['elements'][0]['id'],3);self.assertEqual(len(session.calls),2)
    def test_later_local_date_can_still_be_an_older_utc_snapshot(self):
        self.cache(payload())
        result,session=self.fetch([payload('2026-10-12T00:30:00+14:00',2),payload(FRESH,3)])
        self.assertEqual(result['elements'][0]['id'],3);self.assertEqual(len(session.calls),2)
    def test_missing_malformed_naive_or_nonstring_remote_dates_are_rejected(self):
        self.cache(payload())
        for timestamp in [None,'','invalid','2026-99-99T00:00:00Z','2026-10-11T20:00:00',123,'2026-10-11','2026-10-11T20:00:00+00:99']:
            result,_=self.fetch([payload(timestamp,2)])
            self.assertEqual(result,payload(),repr(timestamp))
        missing=payload();del missing['osm3s']['timestamp_osm_base'];result,_=self.fetch([missing]);self.assertEqual(result,payload())
    def test_empty_or_structurally_invalid_payloads_do_not_replace_cache(self):
        self.cache(payload())
        for value in [None,[],{'osm3s':{'timestamp_osm_base':FRESH},'elements':[]},{'osm3s':{'timestamp_osm_base':FRESH},'elements':'not a list'},{'osm3s':{'timestamp_osm_base':FRESH},'elements':[{}]},dict(payload(FRESH,2),remark='runtime error: Query timed out')]:
            result,_=self.fetch([value]);self.assertEqual(result,payload())
    def test_invalid_cache_is_not_used_as_a_fallback(self):
        for timestamp in [None,'bad','2026-10-11T12:00:00',99]:
            self.cache(payload(timestamp))
            with self.assertRaises(RuntimeError): self.fetch([payload(None,2),RuntimeError('offline')])
            with self.assertRaises(RuntimeError): assets.load_cached_osm(self.root)
    def test_valid_remote_can_replace_missing_or_invalid_cache(self):
        for cached in [None,payload('bad')]:
            if cached is not None:self.cache(cached)
            result,_=self.fetch([payload(FRESH,2)]);self.assertEqual(result['elements'][0]['id'],2)
    def test_no_cache_and_no_verified_remote_fails(self):
        with self.assertRaises(RuntimeError):self.fetch([payload(None),RuntimeError('offline')])
    def test_malformed_cache_bytes_cannot_mask_valid_remote_or_enable_unverified_fallback(self):
        (self.root/'peterborough-osm.json').write_text('{broken')
        result,_=self.fetch([payload(FRESH,2)]);self.assertEqual(result['elements'][0]['id'],2)
        with self.assertRaises(RuntimeError):self.fetch([payload(None,2)])

if __name__=='__main__': unittest.main()
