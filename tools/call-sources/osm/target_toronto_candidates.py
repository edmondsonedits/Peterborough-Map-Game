"""Mine explicit cached civic source points for Toronto Station51 and approved island roads.
No geocoding, new civic numbers, road connections, station ownership or vehicle access inferred.
"""
import argparse,json,sys,math,re,hashlib,collections,time
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',type=Path,required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--station-radius-metres',type=float,default=1500);p.add_argument('--island-road-radius-metres',type=float,default=300);a=p.parse_args();ROOT=a.cache.resolve();REPO=a.repo.resolve();sys.path.insert(0,str(ROOT/'deps'))
from shapely.geometry import Point,LineString
from shapely.strtree import STRtree
city=json.loads((REPO/'cities/toronto/geo-data.json').read_text());bases={b['id']:b for b in city['bases']};base=bases['toronto-ems-3311745'];training=json.loads((REPO/'cities/toronto/training-data.json').read_text());selected={r['id'] for r in training.get('sharedLocations',[])}
for relative in ['call-locations.json']:
 f=REPO/'cities/toronto'/relative
 if f.exists():selected.update(r['id'] for r in json.loads(f.read_text()).get('sharedLocations',[]))
old=json.loads((ROOT/'bundles/toronto.candidates.json').read_text());selected.update(r['id'] for r in old['locations'])
roadsPath=REPO/'cities/toronto/emergency-access-roads.geojson';roadraw=roadsPath.read_bytes();roads=json.loads(roadraw);features=roads['features'];assert len(features)==33 and all(f['properties'].get('trainingEmergencyAccess') is True for f in features)
assert 'way/1082514126' not in {f['id'] for f in features}
# Fixed local equirectangular coordinates for short-distance screening; production graph independently decides access/ownership.
scaleX=111195*math.cos(math.radians(43.63));scaleY=111195
project=lambda lng,lat:Point(lng*scaleX,lat*scaleY)
roadGeoms=[LineString([(c[0]*scaleX,c[1]*scaleY) for c in f['geometry']['coordinates']]) for f in features];tree=STRtree(roadGeoms)
source=json.loads((ROOT/'raw/source-metadata.json').read_text());stationRows={};islandRows={};started=time.time();originCivics={}
from osm_reviews import load_reviews,apply_review
independent_reviews=load_reviews(ROOT) or load_reviews(Path(__file__).resolve().parent)
normalize=lambda s:re.sub(r'[^a-z0-9]','',s.lower()).replace('avenue','ave').replace('drive','dr')
for bid in ['toronto-ems-3311745','toronto-ems-3311713','toronto-fire-335','toronto-ems-4173463']:
 originCivics[normalize(bases[bid]['address'].split(',')[0])]=bid

def choose(store,r,rank):
 key=normalize(r['address']);prev=store.get(key)
 if prev is None or rank<prev[0]:store[key]=(rank,r)
for line in (ROOT/'bundles/toronto.jsonl').open():
 r=json.loads(line);lat=r['lat'];lng=r['lng'];civic=normalize(r['address'])
 apply_review(r,independent_reviews)
 if r['id'] in independent_reviews:r['sources']=list(dict.fromkeys(r.get('sources',[])+independent_reviews[r['id']]['sourceUrls']))
 if civic in originCivics:continue
 nearStation=abs(lat-base['lat'])<.014 and abs(lng-base['lng'])<.021
 nearIsland=43.60<lat<43.637 and -79.43<lng<-79.34
 if not nearStation and not nearIsland:continue
 novel=r['id'] not in selected;named=bool(r['tags'].get('name'))
 if nearStation:
  dy=(lat-base['lat'])*111195;dx=(lng-base['lng'])*111195*math.cos(math.radians(base['lat']));distance=math.hypot(dx,dy)
  if distance<=a.station_radius_metres:
   sameApproach=normalize(r['tags']['addr:street'])==normalize('Toryork Drive')
   row=dict(r);row['selectionPurpose']={'target':'Station51 local civic source enrichment','targetBaseIds':['toronto-ems-3311745'],'method':'Explicit source civic point within1500m of exact official base point; same Toryork approach street and named sites prioritized','distanceToOfficialBaseMetres':round(distance,1),'officialBaseAddress':base['address'],'officialBaseSource':'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1/query?objectIds=3311745&outFields=*&outSR=4326&f=pjson','sameApproachStreetName':sameApproach,'notInInitialShortlistOrCurrentSelectedIds':novel,'assignmentOrDirectedReachabilityVerified':False}
   choose(stationRows,row,(not sameApproach,not novel,not named,distance,-r['priorityScore'],r['id']))
 if nearIsland:
  pt=project(lng,lat);near=tree.query(pt,predicate='dwithin',distance=a.island_road_radius_metres)
  if len(near):
   close=sorted(((pt.distance(roadGeoms[i]),int(i)) for i in near),key=lambda v:v[0]);nearestGap,nearestIndex=close[0];nearest=features[nearestIndex]
   row=dict(r);row['selectionPurpose']={'target':'Toronto Island source civic enrichment','targetBaseIds':['toronto-fire-335','toronto-ems-4173463'],'method':'Explicit source civic point within300m of one of33 already-approved emergency-access road ways; no roads added','nearestApprovedRoadGapMetres':round(nearestGap,1),'nearestApprovedRoadId':nearest['id'],'nearestApprovedRoadName':nearest['properties'].get('name'),'nearbyApprovedRoadIds':[features[i]['id'] for _,i in close[:5]],'sourceCivicStreetMatchesNearestApprovedRoadName':normalize(r['tags']['addr:street'])==normalize(nearest['properties'].get('name','')),'approvedRoadsPath':'cities/toronto/emergency-access-roads.geojson','approvedRoadsSha256':hashlib.sha256(roadraw).hexdigest(),'approvedRoadsCount':33,'policyUrl':'https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/','privateAccessRestrictionPreserved':True,'notInInitialShortlistOrCurrentSelectedIds':novel,'assignmentOrDirectedReachabilityVerified':False,'noMainlandOrFerryConnectionAdded':True}
   choose(islandRows,row,(not novel,not named,nearestGap,-r['priorityScore'],r['id']))
station=[r for _,r in sorted(stationRows.values(),key=lambda x:x[0])];island=[r for _,r in sorted(islandRows.values(),key=lambda x:x[0])]
locations=station+island
out={'schemaVersion':1,'cityId':'toronto','name':'Toronto','source':source,'locations':locations,'limitations':['Source civic points and complete tags/geometries retained; no civic numbers invented or source points moved','Local proximity only selects research candidates and does not establish station response ownership or reachable arrivals','Island emergency access applies only to exact33 already-approved road IDs; every other private way remains restricted','No ferry, water crossing, bridge or mainland connector created']}
p=ROOT/'bundles/toronto.targeted-candidates.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(out,separators=(',',':')));tmp.replace(p)
report={'station51Candidates':len(station),'station51SameToryorkApproachStreet':sum(r['selectionPurpose']['sameApproachStreetName'] for r in station),'station51NovelIds':sum(r['selectionPurpose']['notInInitialShortlistOrCurrentSelectedIds'] for r in station),'station51NamedSites':sum(bool(r['tags'].get('name')) for r in station),'station51StreetCounts':dict(collections.Counter(r['tags']['addr:street'] for r in station)),'islandCandidates':len(island),'islandNovelIds':sum(r['selectionPurpose']['notInInitialShortlistOrCurrentSelectedIds'] for r in island),'islandNamedSites':sum(bool(r['tags'].get('name')) for r in island),'islandStreetCounts':dict(collections.Counter(r['tags']['addr:street'] for r in island)),'islandWithin80mApprovedRoad':sum(r['selectionPurpose']['nearestApprovedRoadGapMetres']<=80 for r in island),'islandWithin80mSameSourceStreetName':sum(r['selectionPurpose']['nearestApprovedRoadGapMetres']<=80 and r['selectionPurpose']['sourceCivicStreetMatchesNearestApprovedRoadName'] for r in island),'initialShortlistAndCurrentSelectedIdsUsedForNovelty':len(selected),'total':len(locations),'elapsedSeconds':round(time.time()-started),'outputSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(ROOT/'bundles/toronto-targeted-coverage.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
