"""Additional exact civic candidates whose OSM street matches a packaged primary/secondary street.
No difficulty acceptance, proximity, access or route claim is made here: the production builder checks those.
"""
import argparse,json,re,gzip,hashlib,math,collections,time
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--cache',type=Path,required=True);ap.add_argument('--cities',nargs='*');ap.add_argument('--limit',type=int,default=2000);args=ap.parse_args();ROOT=args.cache;REPO=args.repo
suffix={'st':'street','rd':'road','ave':'avenue','av':'avenue','blvd':'boulevard','dr':'drive','ct':'court','crt':'court','hwy':'highway','pkwy':'parkway','pky':'parkway','trl':'trail','ter':'terrace','terr':'terrace','cir':'circle','cres':'crescent','n':'north','s':'south','e':'east','w':'west'}
def streetnorm(s):return ' '.join(suffix.get(x,x) for x in re.findall(r'[a-z0-9]+',s.lower()))
def keyhash(s):return hashlib.sha256(s.encode()).hexdigest()
def civicnorm(s):return re.sub(r'[^a-z0-9]','',s.lower())
source=json.loads((ROOT/'raw/source-metadata.json').read_text());ledger=[];started=time.time()
from osm_reviews import load_reviews,apply_review
independent_reviews=load_reviews(ROOT) or load_reviews(Path(__file__).resolve().parent)
cityids=args.cities or sorted(p.name.removesuffix('.candidates.json') for p in (ROOT/'bundles').glob('*.candidates.json'))
for cid in cityids:
 d=json.loads((ROOT/'bundles'/f'{cid}.candidates.json').read_text());existing={civicnorm(r['address']) for r in d['locations']};training=json.loads((REPO/'cities'/cid/'training-data.json').read_text());roadpath=REPO/training['roadsUrl']
 with gzip.open(roadpath,'rt') if roadpath.suffix=='.gz' else roadpath.open() as f:roads=json.load(f)
 names=collections.defaultdict(lambda:{'classes':set(),'names':set()})
 for feat in roads['features']:
  p=feat['properties'];h=p.get('highway');n=p.get('name','')
  if h not in ['primary','secondary'] or not n or p.get('access') in ['no','private'] or p.get('vehicle')=='no' or p.get('motor_vehicle')=='no' or p.get('tunnel')=='yes' or str(p.get('layer','0')) not in ['','0']:continue
  k=streetnorm(n);names[k]['classes'].add(h);names[k]['names'].add(n)
 del roads
 roadsha=hashlib.file_digest(roadpath.open('rb'),'sha256').hexdigest()
 buckets={};matched=0;seen=set()
 for line in (ROOT/'bundles'/f'{cid}.jsonl').open():
  r=json.loads(line);apply_review(r,independent_reviews);key=streetnorm(r['tags']['addr:street'])
  if r['id'] in independent_reviews:r['sources']=list(dict.fromkeys(r.get('sources',[])+independent_reviews[r['id']]['sourceUrls']))
  if key not in names:continue
  civic=civicnorm(r['address'])
  if civic in seen:continue
  seen.add(civic);matched+=1
  # One initial destination per street and ~100m grid cell prevents long adjacent-house runs.
  grid=(key,math.floor(r['lat']/.001),math.floor(r['lng']/.001))
  named=bool(r['tags'].get('name'));novel=civic not in existing
  rank=(not novel,not named,-r['priorityScore'],keyhash(r['id']))
  prior=buckets.get(grid)
  if prior is None or rank<prior[0]:buckets[grid]=(rank,r)
 groups=collections.defaultdict(list)
 for grid,(rank,r) in buckets.items():groups[grid[0]].append((rank,r))
 for rows in groups.values():rows.sort(key=lambda x:x[0])
 orderedstreets=sorted(groups,key=keyhash);out=[];cursor=0
 # Round-robin across streets; within each street prefer new named/site candidates and then distributed exact addresses.
 while len(out)<args.limit:
  added=False
  for sk in orderedstreets:
   if cursor>=len(groups[sk]):continue
   r=groups[sk][cursor][1];r['majorRoadEvidence']={'method':'exact-normalized-source-street-name-match-to-packaged-road','roadClasses':sorted(names[sk]['classes']),'roadNames':sorted(names[sk]['names']),'roadFile':training['roadsUrl'],'roadFileSha256':roadsha,'streetNormalization':'case/punctuation and standard street suffix expansion; compass direction tokens preserved','sampling':'one destination per street/~100m grid cell; round-robin across streets; prefer previously unselected and named sites','proximityAndAccessVerified':False};out.append(r);added=True
   if len(out)>=args.limit:break
  if not added:break
  cursor+=1
 payload={'schemaVersion':1,'cityId':cid,'name':d['name'],'source':source,'locations':out,'limitations':['Exact civic street is documented in OSM and name matches a packaged primary/secondary street','Production road graph must independently validate actual matching segment, <=80m gap, ground level, public access and safe arrival side','Source geometry is unchanged; no entry or difficulty accepted here','Spatial sampling avoids repeated adjacent civic addresses; this is a source supplement, not a coverage claim']}
 dest=ROOT/'bundles'/f'{cid}.major-road-candidates.json';tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(payload,separators=(',',':')));tmp.replace(dest)
 stat={'cityId':cid,'packagedPrimarySecondaryStreetNames':len(names),'matchingUniqueCivicAddresses':matched,'streetSpatialCells':len(buckets),'supplementCandidates':len(out),'newCivicCandidates':sum(civicnorm(r['address']) not in existing for r in out),'namedCandidates':sum(bool(r['tags'].get('name')) for r in out),'representedStreets':len(set(streetnorm(r['tags']['addr:street']) for r in out))};ledger.append(stat);print(stat,flush=True)
(ROOT/'bundles/major-road-coverage.json').write_text(json.dumps({'cities':ledger,'elapsedSeconds':round(time.time()-started)},indent=2))
