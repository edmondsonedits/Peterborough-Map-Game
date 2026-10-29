"""Expose source-mapped building entrance nodes for shortlisted exact building footprints.
An OSM entrance is normally a building/foot entrance. This does NOT verify public vehicle access.
"""
import sys,json,collections,time
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
from shapely.strtree import STRtree
entrances=[json.loads(l) for l in (ROOT/'raw/entrance-nodes.jsonl').open()]
ledger=[]
for p in sorted((ROOT/'bundles').glob('*.candidates.json')):
 data=json.loads(p.read_text());cid=data['cityId']
 rows=[r for r in data['locations'] if r['sourceGeometry']['type']=='Polygon' and r['sourceGeometryQuality']=='building-interior-point']
 geoms=[shape(r['sourceGeometry']) for r in rows];tree=STRtree(geoms);matches=collections.defaultdict(list)
 for n in entrances:
  if n['tags'].get('access') in ['private','no']:continue
  point=Point(n['lng'],n['lat'])
  for i in tree.query(point,predicate='dwithin',distance=1e-8):
   # A node lying inside a broad building polygon could belong to an interior unit.
   # Keep explicitly mapped node plus source relationship; do not claim route access.
   relation='on-source-building-boundary' if geoms[i].boundary.distance(point)<=1e-8 else 'within-source-building-footprint'
   matches[rows[i]['id']].append({**n,'sourceUrl':f'https://www.openstreetmap.org/node/{n["osmId"]}','relationship':relation,'publicVehicleAccessVerified':False,'verificationStatus':'mapped-building-entrance-only'})
 out={'cityId':cid,'sourceSnapshot':data['source']['snapshotTimestamp'],'sourceSha256':data['source']['sha256'],'entries':dict(matches),'limitations':['Building entrance nodes can be pedestrian entrances. Public vehicle access is not established.','Source node tags/access restrictions preserved; private/no entrances omitted.','No road snap, arrival point or routing claim is made.']}
 (ROOT/'bundles'/f'{cid}.entrances.json').write_text(json.dumps(out,separators=(',',':')))
 stat={'cityId':cid,'candidateBuildingFootprints':len(rows),'sitesWithMappedEntrance':len(matches),'mappedEntranceNodes':sum(len(x) for x in matches.values())};ledger.append(stat);print(stat,flush=True)
(ROOT/'bundles/entrance-coverage.json').write_text(json.dumps(ledger,indent=2))
