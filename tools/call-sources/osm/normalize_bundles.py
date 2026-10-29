"""Assign explicit OSM civic elements by source administrative geometry and export reproducible pools.
Does not assess road access, route difficulty, actual entrance or cross streets.
"""
import sys,json,re,collections,datetime,time,math,hashlib
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
from shapely.prepared import prep
REPO=_args.repo.resolve()
main_ids={'niagara-falls':2388057,'guelph':7486148}
features=json.loads((ROOT/'raw/municipal-boundaries.geojson').read_text())['features']
selected={}
for f in features:
 p=f['properties'];cid=p['cityId']
 if cid in main_ids and p['osmId']!=main_ids[cid]:continue
 if cid not in selected or int(p['tags']['admin_level'])<int(selected[cid]['properties']['tags']['admin_level']):selected[cid]=f
citynames={cid:json.loads((REPO/'cities'/cid/'city.json').read_text())['name'] for cid in selected}
cids=list(sorted(selected));geoms=[shape(selected[c]['geometry']) for c in cids];tree=STRtree(geoms)
source=json.loads((ROOT/'raw/source-metadata.json').read_text())
from osm_reviews import load_reviews,apply_review
independent_reviews=load_reviews(ROOT) or load_reviews(Path(__file__).resolve().parent)
files={cid:(ROOT/'bundles'/f'{cid}.jsonl').open('w') for cid in cids}
counts={cid:collections.Counter() for cid in cids};priority={cid:[] for cid in cids};residential={cid:{} for cid in cids};quarantine=collections.Counter()
seen={cid:set() for cid in cids}
normal=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
tagcitylookup={normal(n):c for c,n in citynames.items()}
def score(t):
 a=t.get('amenity','');b=t.get('building','');l=t.get('leisure','');s=0
 if a in ['hospital','university','college','school','townhall','community_centre','arts_centre','theatre','cinema','library','place_of_worship','bus_station','courthouse']:s+=70
 if t.get('healthcare') in ['hospital','nursing_home','rehabilitation'] or a=='nursing_home' or t.get('social_facility') in ['nursing_home','assisted_living']:s+=75
 if l in ['sports_centre','stadium','ice_rink','swimming_pool','recreation_ground']:s+=65
 if t.get('shop') in ['mall','supermarket','department_store'] or t.get('tourism') in ['hotel','museum','attraction']:s+=55
 if b in ['apartments','commercial','industrial','retail','school','hospital','university','hotel','public']:s+=25
 if t.get('name'):s+=20
 if t.get('amenity') or t.get('shop') or t.get('office') or t.get('craft'):s+=8
 if t.get('entrance') in ['main','yes']:s+=5
 return s
start=time.time()
for line in (ROOT/'raw/civic-elements.jsonl').open():
 r=json.loads(line);t=r['tags'];point=Point(r['lng'],r['lat'])
 possible=tree.query(point,predicate='within')
 if not len(possible):continue
 house=t.get('addr:housenumber','').strip();street=t.get('addr:street','').strip()
 # A range, list or interpolation cannot establish an individual civic destination.
 ambiguous=bool(re.search(r'[;,]|\d\s*[-–]\s*\d',house))
 inactive=any(t.get(k) in ['yes','true','1'] for k in ['abandoned','disused','demolished','razed']) or t.get('building') in ['construction','ruins']
 if ambiguous or inactive:
  quarantine['ambiguous-address' if ambiguous else 'inactive-site']+=1;continue
 if not re.match(r'^\d',house) or not street or len(street)<3:quarantine['invalid-address']+=1;continue
 for idx in possible:
  cid=cids[idx];boundary=selected[cid]['properties'];tagcity=t.get('addr:city','');sc=score(t)
  tagcityid=tagcitylookup.get(normal(tagcity))
  if tagcityid and tagcityid!=cid and {tagcityid,cid}!={'toronto','scarborough'}:
   counts[cid]['conflictingMunicipalityTag']+=1;continue
  address=f'{house} {street}'
  # Keep source civic string unchanged; municipal display is established independently by polygon.
  key=normal(address)
  if key in seen[cid]:counts[cid]['duplicateCivicElements']+=1
  seen[cid].add(key)
  rec={'id':f'{cid}-osm-{r["osmType"]}-{r["osmId"]}','sourceCanonicalId':f'osm-{r["osmType"]}-{r["osmId"]}','cityId':cid,'name':t.get('name') or address,'address':address,'addr':f'{address}, {citynames[cid]}, ON','lat':r['lat'],'lng':r['lng'],'tags':t,'sources':[f'https://www.openstreetmap.org/{r["osmType"]}/{r["osmId"]}',source['sourcePage']], 'provenance':{'dataset':'OpenStreetMap via Geofabrik Ontario extract','sourceUrl':source['sourceUrl'],'sourceElementUrl':f'https://www.openstreetmap.org/{r["osmType"]}/{r["osmId"]}','osmType':r['osmType'],'osmId':r['osmId'],'osmVersion':r['osmVersion'],'osmTimestamp':r['osmTimestamp'],'snapshotTimestamp':source['snapshotTimestamp'],'retrievedAt':source['retrievedAt'],'sourceSha256':source['sha256'],'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors'},'municipalityEvidence':{'method':'point-within-osm-administrative-boundary','osmRelationId':boundary['osmId'],'sourceUrl':f'https://www.openstreetmap.org/relation/{boundary["osmId"]}','adminLevel':boundary['tags'].get('admin_level'),'sourceName':boundary['tags'].get('name'),'addressCityTag':tagcity or None,'confidence':'source-boundary-with-warning' if boundary['tags'].get('fixme') else 'osm-boundary','warning':boundary['tags'].get('fixme') or boundary['tags'].get('note') or None},'sourceGeometry':r['geometry'],'sourceGeometryQuality':r['geometryQuality'],'locationPointRole':'mapped-entrance-node' if t.get('entrance') and r['osmType']=='node' else r['geometryQuality'],'accessVerification':{'status':'not-assessed','reason':'Source geometry is the site/address point. Public vehicle entrance and road arrival target must be checked against the production road graph; no entrance inferred.'},'priorityScore':sc,'verificationStatus':'source-documented-civic-address-and-location','crossStreets':[]}
  apply_review(rec,independent_reviews)
  if rec['id'] in independent_reviews:rec['sources']=list(dict.fromkeys(rec['sources']+independent_reviews[rec['id']]['sourceUrls']))
  files[cid].write(json.dumps(rec,separators=(',',':'))+'\n')
  counts[cid]['records']+=1;counts[cid]['namedSites']+=bool(t.get('name'));counts[cid]['prioritySites']+=sc>=65;counts[cid]['entranceNodes']+=bool(t.get('entrance') and r['osmType']=='node')
  if sc>=20:priority[cid].append(rec)
  else:
   grid=(math.floor(r['lat']/.004),math.floor(r['lng']/.004),normal(street))
   prior=residential[cid].get(grid)
   if prior is None or (r['geometryQuality']=='mapped-node' and prior['sourceGeometryQuality']!='mapped-node'):residential[cid][grid]=rec
for f in files.values():f.close()
ledger=[]
for cid in cids:
 priority[cid].sort(key=lambda r:(-r['priorityScore'],r['id']))
 # Root gets broad named and spatially varied address pools without needing to load province-scale raw JSONL.
 unique=[];keys=set()
 for r in priority[cid]+sorted(residential[cid].values(),key=lambda r:hashlib.sha256(r['id'].encode()).hexdigest()):
  key=normal(r['address'])
  if key in keys:continue
  keys.add(key);unique.append(r)
 named=[r for r in unique if r['tags'].get('name')];ordinary=[r for r in unique if not r['tags'].get('name')]
 # 1500 named plus 1500 distributed exact addresses is a candidate cap, not a coverage claim.
 shortlist=named[:1500]+ordinary[:1500]
 (ROOT/'bundles'/f'{cid}.candidates.json').write_text(json.dumps({'schemaVersion':1,'cityId':cid,'name':citynames[cid],'source':source,'locations':shortlist,'limitations':['OSM source evidence, not independent field verification','No public vehicle entrance or road arrival target assigned','No route difficulty or cross streets inferred','Municipal membership does not establish Fire or EMS response district']},separators=(',',':')))
 stats={'cityId':cid,**dict(counts[cid]),'uniqueCivicAddresses':len(seen[cid]),'candidateShortlist':len(shortlist),'namedShortlist':len(named[:1500]),'ordinaryShortlist':len(ordinary[:1500]),'boundaryRelationId':selected[cid]['properties']['osmId'],'boundaryWarning':selected[cid]['properties']['tags'].get('fixme') or selected[cid]['properties']['tags'].get('note')}
 ledger.append(stats);print(stats,flush=True)
(ROOT/'bundles/coverage.json').write_text(json.dumps({'source':source,'cities':ledger,'quarantine':dict(quarantine),'elapsedSeconds':round(time.time()-start)},indent=2))
(ROOT/'bundles/selected-boundaries.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[selected[c] for c in cids]},separators=(',',':')))
