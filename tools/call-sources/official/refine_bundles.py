import pathlib,json,csv,re,zipfile,datetime,collections,hashlib,math
from official_common import configuration
CFG=configuration('Refresh schools, attach audit provenance, and deduplicate civic-address sites.')
import openpyxl
B=CFG.output_dir; R=CFG.repo_root; CACHE=CFG.cache_dir
from official_reviews import load_reviews, apply_review
REVIEWS=load_reviews(CFG.package_dir)
CORE=B/'facility-core';CORE.mkdir(exist_ok=True)
FINAL=B/'site-deduped';FINAL.mkdir(exist_ok=True)
SD={x['dataset']:x for x in json.load(open(CFG.package_dir/'ontario-school-download-manifest.json'))}
PUB=list(csv.DictReader(open(CACHE/'public_school_contact_list_september2026_en.txt',encoding='utf-8-sig'),delimiter='|'))
PRIV=list(csv.DictReader(open(CACHE/'private_school_contact_information_eng.csv',encoding='cp1252')))
def sid(x):
 x=str(x or '').strip();return x.removesuffix('.0').zfill(6) if x and x!='..' else ''
P={sid(x['School Number']):x for x in PUB};PV={sid(x['School Number']):x for x in PRIV}
def addrkey(x):
 x=str(x or '').split(',')[0].lower().replace('.','')
 return re.sub('[^a-z0-9]+',' ',re.sub(r'\b(st|rd|ave|dr|blvd|hwy|ct|crt|cres|n|s|e|w)\b',lambda m:{'st':'street','rd':'road','ave':'avenue','dr':'drive','blvd':'boulevard','hwy':'highway','ct':'court','crt':'court','cres':'crescent','n':'north','s':'south','e':'east','w':'west'}[m[0]],x)).strip()
def norm(x):return re.sub('[^a-z0-9]','',str(x or '').lower())
def civic(x):return bool(re.match(r'^\s*\d+[a-zA-Z]?(?:\s|[-/])',x or ''))
def inside(bb,lat,lng):return bb and bb[0][0]<=lat<=bb[1][0] and bb[0][1]<=lng<=bb[1][1]
C={}
for p in (R/'cities').glob('*/city.json'):
 if p.parent.name=='peterborough':continue
 d=json.load(open(p));bb=d.get('map',{}).get('bounds')
 for fn in ['geo-data.json','training-data.json']:
  if not bb and (p.parent/fn).exists():
   q=json.load(open(p.parent/fn));bb=q.get('map',{}).get('bounds') or q.get('bounds')
 C[p.parent.name]={'name':d['name'],'bounds':bb}
privateWorkbook=openpyxl.load_workbook(CACHE/'private_school_location_list_en_2.xlsx',read_only=True,data_only=True)
its=privateWorkbook.active.values;heads=next(its);privateRows=[dict(zip(heads,v)) for v in its]
z=zipfile.ZipFile(CACHE/'ODCAF_V1.0.zip');arts=list(csv.DictReader(z.read('ODCAF_V1.0/ODCAF_v1.0.csv').decode('utf-8-sig','replace').splitlines()))
artsources=list(csv.DictReader(z.read('ODCAF_V1.0/Data_Sources.csv').decode('cp1252').splitlines()))
(B/'odcaf-source-registry.json').write_text(json.dumps(artsources,ensure_ascii=False,indent=2))
coverage={};excluded=collections.Counter();evidence=[]
TURL='https://services5.arcgis.com/h9xShea49ZANgOtx/ArcGIS/rest/services/City_of_Thunder_Bay_Facilities_view_Public/FeatureServer/2'
OGL='https://open.canada.ca/open-government-licence-canada'

def school_update(r):
 raw=r.get('rawSourceRecord',{});s=sid(raw.get('school_id'));private=raw.get('source_id')=='36';match=(PV if private else P).get(s)
 if not match:
  r['reviewFlags'].append('not-matched-to-2026-school-roster');return r
 street=match['Street Address'] if private else match['Street']
 if addrkey(street)!=addrkey(r['addr']):
  excluded['school-2026-address-differs']+=1;evidence.append({'recordId':r['id'],'oldAddress':r['addr'],'currentAddress':street,'schoolNumber':s,'currentName':match['School Name']});return None
 r['name']=match['School Name'];r['addr']=street;r['sourceFeatureId']=s
 m=SD['private-school-contact-information' if private else 'ontario-public-school-contact-information']
 r['sourceUrls']+=list(dict.fromkeys([m['catalogueUrl'],m['downloadUrl']]))
 r['verifiedcurrentness']={'method':'official-2026-school-roster-school-number-and-normalized-address-match','schoolNumber':s,'rosterUrl':m['downloadUrl'],'retrievedAt':m['retrievedAt'],'coordinateSource':'ODEF v3 (2024); not re-geocoded'}
 r['reviewFlags']=[x for x in r['reviewFlags'] if x!='source-currentness-not-individually-checked']+['school-roster-current-address-confirmed-coordinate-source-2024']
 return r

for cid,city in C.items():
 allrows=json.load(open(B/'normalized'/(cid+'.json')));raws=[]
 for r in allrows:
  if r['dataset']=='odbus':continue
  if r['dataset']=='odef':r=school_update(r)
  if r is not None:raws.append(r)
 for n,pr in enumerate(privateRows,2):
  if pr.get('Address Type')!='PHYSICAL LOCATION' or pr.get('Program Type')=='Online only':continue
  try:lat=float(pr['Latitude']);lng=float(pr['Longitude'])
  except (ValueError,TypeError):continue
  local=norm(pr.get('City'));cn=norm(city['name'])
  allowed=local==cn or cid=='toronto' and local in ['scarborough','northyork','etobicoke','york','eastyork','toronto']
  if not allowed or not inside(city['bounds'],lat,lng):continue
  addr=' '.join(str(pr.get(k) or '').strip() for k in ['Street Number','Street Number Suffix','Street Name','Street Type']);addr=re.sub(r'\s+',' ',addr).strip()
  if not civic(addr):continue
  sn=sid(pr.get('School Number'));m=SD['private-school-location-list'];old=[r for r in raws if r['dataset']=='odef' and sid(r.get('sourceFeatureId'))==sn]
  if old:raws=[r for r in raws if r not in old]
  rec={'id':f'{cid}-ontario-private-school-{sn}-{n}','cityId':cid,'name':pr['School Name'],'addr':addr,'lat':lat,'lng':lng,'category':'school','dataset':'ontario-private-school-2025-26','sourceFeatureId':sn,'datasetRecordId':f'{sn}:worksheet-row-{n}','sourceUrls':[m['catalogueUrl'],m['downloadUrl']],'retrievedAt':m['retrievedAt'],'licence':{'name':m['licenceName'],'url':m['licenceUrl'],'commercialUsePermitted':True,'attribution':'Contains information licensed under the Open Government Licence – Ontario.'},'coordinateMethod':'source-point-2025-26-private-school-location-list','coordinateCrs':'EPSG:4326','cityMatchBasis':'official-school-city-locality-and-game-bounds','reviewFlags':['self-reported-private-school-location','cross-streets-not-derived','district-not-derived'],'verifiedcurrentness':{'method':'official-2025-26-school-location-list','academicYear':pr.get('NOI Year'),'schoolNumber':sn,'retrievedAt':m['retrievedAt']},'rawSourceRecord':pr}
  raws.append(rec)
 for ar in arts:
  if ar['Prov_Terr'].lower()!='on' or not civic(ar['Source_Format_Address']):continue
  try:lat=float(ar['Latitude']);lng=float(ar['Longitude'])
  except ValueError:continue
  match=norm(ar['CSD_Name'])==norm('Greater Sudbury / Grand Sudbury' if cid=='greater-sudbury' else city['name']) or cid=='scarborough' and norm(ar['City'])=='scarborough'
  if not match or not inside(city['bounds'],lat,lng):continue
  arid=ar['Index'];u='https://www150.statcan.gc.ca/n1/en/pub/21-26-0001/2020001/ODCAF_V1.0.zip'
  raws.append({'id':f'{cid}-odcaf-{arid}','cityId':cid,'name':ar['Facility_Name'],'addr':ar['Source_Format_Address'],'lat':lat,'lng':lng,'category':'cultural','dataset':'odcaf','sourceFeatureId':None,'datasetRecordId':arid,'sourceUrls':['https://www.statcan.gc.ca/en/lode/databases/odcaf',u],'retrievedAt':'2026-10-29','licence':{'name':'Open Government Licence – Canada','url':OGL,'commercialUsePermitted':True,'attribution':'Contains information licensed under the Open Government Licence – Canada.'},'coordinateMethod':'source-point','coordinateCrs':'EPSG:4326','cityMatchBasis':'census-subdivision-and-game-bounds','reviewFlags':['source-data-2020-currentness-review-required','cross-streets-not-derived','district-not-derived'],'rawSourceRecord':ar})
 if cid=='thunder-bay':
  for ft in json.load(open(CACHE/'thunder-bay-facilities-features.json'))['features']:
   a=ft['attributes'];g=ft.get('geometry');addr=a['COMPLETE'];name=a['BUILDING']
   if not g or not civic(addr) or not name or not inside(city['bounds'],g['y'],g['x']):continue
   oid=a['OBJECTID'];u=TURL+'/query?where=OBJECTID%3D'+str(oid)+'&outFields=*&outSR=4326&f=json'
   raws.append({'id':f'{cid}-municipal-facility-{oid}','cityId':cid,'name':name,'addr':addr,'lat':g['y'],'lng':g['x'],'category':'municipal-facility','dataset':'thunder-bay-municipal-facilities','sourceFeatureId':str(oid),'datasetRecordId':str(oid),'sourceUrls':['https://opendata.thunderbay.ca/datasets/9e36432d19e14496b3d0c089925e7cf1',u],'retrievedAt':'2026-10-29','licence':{'name':'Open Data Licence – The Corporation of the City of Thunder Bay','url':'https://www.thunderbay.ca/city-hall/thunder-bay-open-data/','commercialUsePermitted':True,'attribution':'Contains information licensed under the Open Data Licence – The Corporation of the City of Thunder Bay.'},'coordinateMethod':'source-point-query-outSR4326','coordinateCrs':'EPSG:4326','cityMatchBasis':'official-city-facilities-and-game-bounds','reviewFlags':['facility-service-type-needs-classification','cross-streets-not-derived','district-not-derived'],'rawSourceRecord':a})
 raws=[apply_review(r,REVIEWS) for r in raws]
 full=B/'facility-provenance';full.mkdir(exist_ok=True);(full/(cid+'.json')).write_text(json.dumps(raws,separators=(',',':'),ensure_ascii=False))
 # Exact address dedup groups subfacilities in the same civic building/site. Unit-specific rows merge.
 groups=collections.defaultdict(list)
 for r in raws:groups[addrkey(r['addr'])].append(r)
 slim=[]
 priorities={'hospital':0,'care-home':1,'school':2,'post-secondary':3,'municipal-facility':4,'cultural':5,'recreation':6,'healthcare':7}
 for key,rs in groups.items():
  rs.sort(key=lambda r:(priorities.get(r['category'],99), 'verifiedcurrentness' not in r, 'private-school' not in r['dataset'],r['name']))
  selected=dict(rs[0]);selected['mergedSourceRecordIds']=[r['id'] for r in rs];selected['sourceUrls']=list(dict.fromkeys(u for r in rs for u in r['sourceUrls']))
  selected['alternativeFacilityNames']=list(dict.fromkeys(r['name'] for r in rs[1:] if r['name']!=selected['name']))
  selected['siteDedupeBasis']='normalized-civic-address-within-city';selected['reviewFlags']=list(dict.fromkeys(selected['reviewFlags']))
  for k in ['rawSourceRecord','sourceRegistryMatches','sourceProvider','coordinateCrs','validationStatus']:selected.pop(k,None)
  slim.append(selected)
 compact=[]
 for r in raws:
  q={k:v for k,v in r.items() if k not in ['rawSourceRecord','sourceRegistryMatches','sourceProvider','coordinateCrs','validationStatus']};compact.append(q)
 (CORE/(cid+'.json')).write_text(json.dumps(compact,separators=(',',':'),ensure_ascii=False))
 (FINAL/(cid+'.json')).write_text(json.dumps(slim,separators=(',',':'),ensure_ascii=False))
 coverage[cid]={'candidates':len(raws),'uniqueAddressSites':len(slim),'currentSchoolAddressMatched':sum('verifiedcurrentness' in r for r in slim),'byCategory':dict(collections.Counter(r['category'] for r in slim))}
(B/'current-school-address-conflicts.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False))
(FINAL/'summary.json').write_text(json.dumps(coverage,indent=2))
(B/'refinement-exclusions.json').write_text(json.dumps(dict(excluded),indent=2))
print(json.dumps(coverage,indent=2))
