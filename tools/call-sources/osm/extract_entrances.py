import sys,json,time
from pathlib import Path
import argparse
_parser=argparse.ArgumentParser(description=__doc__)
_parser.add_argument('--repo', type=Path, required=True, help='Peterborough Map Game repository root')
_parser.add_argument('--cache', type=Path, required=True, help='OSM cache/output directory')
_parser.add_argument('--pbf', type=Path)
_parser.add_argument('--pattern', default='*.candidates.json')
_parser.add_argument('--report', default='validation.json')
_args=_parser.parse_args()
ROOT=_args.cache.resolve()
REPO=_args.repo.resolve()
(ROOT/'raw').mkdir(parents=True, exist_ok=True)
(ROOT/'bundles').mkdir(parents=True, exist_ok=True)
sys.path.insert(0,str(ROOT/'deps'))
import osmium
started=time.time();n=0
with (ROOT/'raw/entrance-nodes.jsonl').open('w') as out:
 for o in osmium.FileProcessor(str(_args.pbf or ROOT/'raw/ontario-latest.osm.pbf'),entities=osmium.osm.NODE).with_filter(osmium.filter.KeyFilter('entrance')):
  t=dict(o.tags)
  if t.get('entrance') in ['no','exit','emergency','service']: continue
  out.write(json.dumps({'osmType':'node','osmId':o.id,'osmVersion':o.version,'osmTimestamp':str(o.timestamp),'lat':o.location.lat,'lng':o.location.lon,'tags':t},separators=(',',':'))+'\n');n+=1
print({'entranceNodes':n,'seconds':round(time.time()-started)})
