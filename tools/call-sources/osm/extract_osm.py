"""Stream one Geofabrik Ontario PBF to exact civic-address records and target municipal boundaries.
Requires osmium/shapely. No geocoding, address interpolation, or guessed access.
"""
import sys,json,re,time,hashlib,datetime
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
from shapely import wkb
from shapely.geometry import mapping
REPO=_args.repo.resolve()
PBF=_args.pbf or ROOT/'raw/ontario-latest.osm.pbf'
OUT=ROOT/'raw/civic-elements.jsonl'
norm=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
names={}
for p in (REPO/'cities').glob('*/city.json'):
 d=json.loads(p.read_text())
 if d['id']!='peterborough':names[d['id']]=d['name']
nameindex={norm(n):cid for cid,n in names.items()}
factory=osmium.geom.WKBFactory()
header=osmium.io.Reader(str(PBF)).header()
print('header', {k:header.get(k) for k in ['osmosis_replication_timestamp','osmosis_replication_sequence_number','generator']},flush=True)
records=0;boundaries=[];started=time.time();bad=0
processor=(osmium.FileProcessor(str(PBF))
 .with_locations('sparse_file_array,'+str(ROOT/'raw/node-locations.idx'))
 .with_areas(osmium.filter.TagFilter(('boundary','administrative')))
 .with_filter(osmium.filter.KeyFilter('addr:housenumber','boundary')))
with OUT.open('w') as out:
 for obj in processor:
  t=dict(obj.tags)
  if obj.is_area():
   if t.get('boundary')!='administrative':continue
   cid=next((nameindex[norm(t.get(k,''))] for k in ['name','name:en','official_name','short_name'] if norm(t.get(k,'')) in nameindex),None)
   if not cid:continue
   try:
    g=wkb.loads(factory.create_multipolygon(obj),hex=True)
    boundaries.append({'cityId':cid,'osmType':'way' if obj.from_way() else 'relation','osmId':obj.orig_id(),'tags':t,'geometry':mapping(g)})
    print('boundary',cid,obj.orig_id(),t.get('admin_level'),flush=True)
   except Exception as e:print('boundaryerror',cid,str(e),flush=True)
   continue
  if 'addr:housenumber' not in t or 'addr:street' not in t: continue
  if obj.is_relation(): continue
  try:
   if obj.is_node():
    geometry={'type':'Point','coordinates':[obj.location.lon,obj.location.lat]};lat=obj.location.lat;lng=obj.location.lon;quality='mapped-node'
   else:
    g=wkb.loads(factory.create_linestring(obj),hex=True)
    if len(obj.nodes)>3 and obj.nodes[0].ref==obj.nodes[-1].ref:
     from shapely.geometry import Polygon
     p=Polygon(g.coords)
     point=p.representative_point();quality='building-interior-point' if t.get('building') else 'site-interior-point';geometry=mapping(p)
    else:point=g.interpolate(.5,normalized=True);quality='linear-feature-midpoint';geometry=mapping(g)
    lat=point.y;lng=point.x
   rec={'osmType':'node' if obj.is_node() else 'way','osmId':obj.id,'osmVersion':obj.version,'osmTimestamp':str(obj.timestamp),'tags':t,'lat':lat,'lng':lng,'geometry':geometry,'geometryQuality':quality}
   out.write(json.dumps(rec,separators=(',',':'))+'\n');records+=1
   if records%50000==0:print('records',records,'seconds',round(time.time()-started),flush=True)
  except (osmium.InvalidLocationError,RuntimeError,ValueError) as e:bad+=1
(ROOT/'raw/municipal-boundaries.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','properties':{k:v for k,v in b.items() if k!='geometry'},'geometry':b['geometry']} for b in boundaries]},separators=(',',':')))
meta={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceUrl':'https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf','sourcePage':'https://download.geofabrik.de/north-america/canada/ontario.html','snapshotTimestamp':header.get('osmosis_replication_timestamp'),'sha256':hashlib.file_digest(PBF.open('rb'),'sha256').hexdigest(),'bytes':PBF.stat().st_size,'license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','attribution':'© OpenStreetMap contributors','copyrightUrl':'https://www.openstreetmap.org/copyright','records':records,'boundaries':len(boundaries),'geometryErrors':bad,'elapsedSeconds':round(time.time()-started)}
(ROOT/'raw/source-metadata.json').write_text(json.dumps(meta,indent=2));print(meta,flush=True)

# This native node-location index is a disposable geometry intermediate.
(ROOT/'raw/node-locations.idx').unlink(missing_ok=True)
