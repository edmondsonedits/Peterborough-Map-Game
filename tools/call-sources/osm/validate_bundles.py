import sys,json,re,math,collections,datetime
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
from shapely.geometry import shape,Point
boundaries={f['properties']['cityId']:shape(f['geometry']) for f in json.loads((ROOT/'bundles/selected-boundaries.geojson').read_text())['features']}
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':['32 configured non-Peterborough city files','unique city-scoped IDs','unique civic strings per shortlist','explicit source house number + street equality','finite source coordinates','actual source geometry covers point','source administrative polygon strictly contains point','source element URL identity','retained ODbL attribution/checksum','entrance uncertainty explicitly retained'],'cities':[],'failures':[]}
norm=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
for p in sorted((ROOT/'bundles').glob(_args.pattern)):
 d=json.loads(p.read_text());cid=d['cityId'];ids=set();addresses=set();n=0
 for r in d['locations']:
  def check(condition,msg):
   if not condition:report['failures'].append({'id':r['id'],'reason':msg})
  check(r['id'] not in ids,'duplicate ID');ids.add(r['id'])
  check(norm(r['address']) not in addresses,'duplicate civic address');addresses.add(norm(r['address']))
  check(r['cityId']==cid,'city mismatch')
  check(r['address']==r['tags']['addr:housenumber'].strip()+' '+r['tags']['addr:street'].strip(),'civic string differs from source')
  check(all(math.isfinite(r[k]) for k in ['lat','lng']),'nonfinite coordinate')
  point=Point(r['lng'],r['lat']);check(boundaries[cid].contains(point),'point outside municipal boundary')
  check(shape(r['sourceGeometry']).distance(point)<1e-9,'point outside source geometry')
  check(r['provenance']['sourceElementUrl']==f'https://www.openstreetmap.org/{r["provenance"]["osmType"]}/{r["provenance"]["osmId"]}','source identity URL mismatch')
  check(r['provenance']['license']=='ODbL-1.0' and len(r['provenance']['sourceSha256'])==64,'license/checksum absent')
  check(r['accessVerification']['status']=='not-assessed','source point falsely accepted as vehicle entrance')
  n+=1
 report['cities'].append({'cityId':cid,'validatedCandidates':n})
if len(report['cities'])!=32:report['failures'].append({'reason':f'Expected32cities, got{len(report["cities"])}'})
report['totalCandidates']=sum(c['validatedCandidates'] for c in report['cities']);report['passed']=not report['failures']
(ROOT/'bundles'/_args.report).write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
raise SystemExit(0 if report['passed'] else 1)
