import json,pathlib,re,collections,math
from official_common import configuration
CFG=configuration('Validate candidate contract and flag coordinate discrepancies; does not verify vehicle entrances.')
B=CFG.output_dir;P=B/'site-deduped';errors=[];counts=collections.Counter();seen=set();conflicts=[]
required=['id','cityId','name','addr','lat','lng','category','dataset','sourceFeatureId','datasetRecordId','sourceUrls','retrievedAt','licence','coordinateMethod','cityMatchBasis','reviewFlags']
for f in P.glob('*.json'):
 if f.name=='summary.json':continue
 rows=json.load(open(f));prov={r['id']:r for r in json.load(open(B/'facility-provenance'/f.name))}
 for r in rows:
  for k in required:
   if k not in r:errors.append([r.get('id'),'missing',k])
  if r['id'] in seen:errors.append([r['id'],'duplicate-id'])
  seen.add(r['id'])
  if not math.isfinite(r['lat']) or not math.isfinite(r['lng']) or not (41<r['lat']<51 and -90<r['lng']<-74):errors.append([r['id'],'coordinate'])
  if not r['sourceUrls'] or not all(x.startswith('https://') or x.startswith('http://') for x in r['sourceUrls']):errors.append([r['id'],'sourceUrls'])
  merged=[prov[x] for x in r.get('mergedSourceRecordIds',[])]
  sep=max([math.hypot((a['lat']-r['lat'])*111320,(a['lng']-r['lng'])*111320*math.cos(r['lat']*math.pi/180)) for a in merged] or [0])
  if sep>200:
   r['reviewFlags']=list(dict.fromkeys(r['reviewFlags']+['same-address-source-coordinate-conflict-over-200m']));r['maxSameAddressCoordinateSeparationMeters']=round(sep);conflicts.append({'id':r['id'],'addr':r['addr'],'separationMeters':round(sep),'records':[x['id'] for x in merged]})
  counts[r['category']]+=1
 f.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
result={'cityCount':len([f for f in P.glob('*.json') if f.name!='summary.json']),'uniqueCityAddressSiteCount':len(seen),'categories':dict(counts),'errors':errors,'coordinateConflictCount':len(conflicts),'contractFields':required}
(B/'bundle-validation.json').write_text(json.dumps(result,indent=2));(B/'same-address-coordinate-conflicts.json').write_text(json.dumps(conflicts,indent=2));print(json.dumps(result,indent=2))
assert not errors
