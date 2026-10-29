import sys,pathlib,zipfile,csv,json,re,collections,sqlite3,math,hashlib,datetime
from official_common import configuration
CFG=configuration('Normalize licensed official facility snapshots; no business stage.')
B=CFG.output_dir; CACHE=CFG.cache_dir
from official_reviews import load_reviews, apply_review
REVIEWS=load_reviews(CFG.package_dir)

from shapely import wkb,wkt
from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Transformer
REPO=CFG.repo_root
TX=Transformer.from_crs(3347,4326,always_xy=True).transform
OGL='https://open.canada.ca/open-government-licence-canada'
MAN={x['dataset']:x for x in json.load(open(CFG.package_dir/'download-manifest.json'))}
CAT={k:v['catalogueUrl'] for k,v in MAN.items()}
OUT=B/'normalized';OUT.mkdir(exist_ok=True)
CITIES={}
for p in (REPO/'cities').glob('*/city.json'):
 d=json.load(open(p));cid=p.parent.name
 if cid=='peterborough':continue
 bounds=d.get('map',{}).get('bounds')
 for f in ['geo-data.json','training-data.json']:
  if not bounds and (p.parent/f).exists():
   tr=json.load(open(p.parent/f));bounds=tr.get('map',{}).get('bounds') or tr.get('bounds')
 CITIES[cid]={'name':d['name'],'bounds':bounds,'csd':'Greater Sudbury / Grand Sudbury' if cid=='greater-sudbury' else d['name']}

def clean(s):return str(s or '').strip()
def missing(s):return clean(s) in ('','..','None','null')
def norm(s):return re.sub(r'[^a-z0-9]','',clean(s).lower())
def civic(s):
 s=clean(s)
 return bool(re.match(r'^\s*\d+[A-Za-z]?(?:\s|[-/])',s)) and not bool(re.search(r'\b(?:P\.?\s*O\.?\s*Box|RR\s*\d)',s,re.I))
def inside(c,lat,lng):
 bb=c['bounds'];return not bb or bb[0][0]<=lat<=bb[1][0] and bb[0][1]<=lng<=bb[1][1]

def citymatch(csd,local,lat,lng):
 matches=[]
 for cid,c in CITIES.items():
  if cid=='scarborough':
   if norm(local)=='scarborough' and inside(c,lat,lng):matches.append((cid,'locality-and-game-bounds'))
   elif norm(csd)=='toronto' and inside(c,lat,lng):matches.append((cid,'toronto-csd-and-scarborough-game-bounds-review-required'))
  elif norm(csd)==norm(c['csd']) and inside(c,lat,lng):matches.append((cid,'census-subdivision-and-game-bounds'))
 return matches

sources={}
z=zipfile.ZipFile(CACHE/'ODEF_v3.0.zip')
sch_sources=list(csv.DictReader(z.read('ODEF_v3.0.1/source_list.csv').decode('utf-8-sig').splitlines()))
sources['odef']=sch_sources
z=zipfile.ZipFile(CACHE/'odhf_v2_geojson.zip');sources['odhf']=list(csv.DictReader(z.read('odhf_v2_data_sources.csv').decode('utf-8-sig').splitlines()))
sources['odsrf']=list(csv.DictReader(open(CACHE/'odsrf'/'odsrf_v2_data_sources.csv',encoding='utf-8-sig')))
(B/'source-registries.json').write_text(json.dumps(sources,indent=2,ensure_ascii=False))
rows=[];rejected=collections.Counter()

def add(dataset,uid,name,address,geom,csd,local,provider,sourceid,category,raw,geometry_crs=4326):
 if missing(name) or not civic(address):rejected[dataset+':missing-name-or-civic-address']+=1;return
 if geom is None or geom.is_empty:rejected[dataset+':missing-geometry']+=1;return
 if geometry_crs!=4326:geom=transform(TX,geom)
 method='source-point' if geom.geom_type=='Point' else 'representative-point-from-source-'+geom.geom_type.lower()
 pt=geom if geom.geom_type=='Point' else geom.representative_point();lng,lat=pt.x,pt.y
 if not math.isfinite(lat) or not math.isfinite(lng) or not (-90<lat<90 and -180<lng<180):rejected[dataset+':invalid-coordinate']+=1;return
 city_matches=citymatch(csd,local,lat,lng)
 if not city_matches:rejected[dataset+':no-target-city-match']+=1;return
 if dataset=='odef':src=[s for s in sources[dataset] if s['source_id']==str(sourceid)]
 elif dataset=='odbus':src=[s for s in sources[dataset] if norm(s.get('City'))==norm(provider.replace('City of ','').replace('Regional Municipality of ',''))]
 else:src=[s for s in sources[dataset] if s['Provider']==provider]
 surls=[]
 for s in src:
  for k in ['reference','Dataset URL','dataset_url','Data Source URL','Data source','Data Sources','Link','URL','Link to Dataset']:
   if k in s and str(s[k]).startswith('http'):surls.append(s[k])
 for cid,basis in city_matches:
  status='candidate-official-open-data'
  flags=['source-currentness-not-individually-checked','cross-streets-not-derived','district-not-derived']
  if 'review-required' in basis:flags.append('scarborough-game-rectangle-not-legal-boundary')
  if dataset=='odbus':flags+=['business-dataset-2022-source-currentness-review-required','source-geocoding-can-be-incorrect','business-site-scale-not-individually-verified']
  if method!='source-point':flags.append('geometry-representative-point-not-entrance')
  rows.append({'id':f'{cid}-{dataset}-{uid}','cityId':cid,'name':clean(name),'addr':clean(address),'lat':lat,'lng':lng,'category':category,'dataset':dataset,'sourceFeatureId':(raw.get('school_id') if dataset=='odef' else str(sourceid)) if not missing(raw.get('school_id') if dataset=='odef' else sourceid) else None,'datasetRecordId':str(uid),'sourceProvider':provider,'sourceUrls':list(dict.fromkeys([CAT[dataset],MAN[dataset]['downloadUrl']]+surls)),'sourceRegistryMatches':src,'retrievedAt':MAN[dataset]['retrievedAt'],'licence':{'name':'Open Government Licence – Canada','url':OGL,'commercialUsePermitted':True,'attribution':f'Contains information from {dataset.upper()} ({provider}) licensed under the Open Government Licence – Canada.'},'coordinateMethod':method,'coordinateCrs':'EPSG:4326','cityMatchBasis':basis,'validationStatus':status,'reviewFlags':flags,'rawSourceRecord':raw})

z=zipfile.ZipFile(CACHE/'ODEF_v3.0.zip')
for r in csv.DictReader(z.read('ODEF_v3.0.1/odef_v3_0_1.csv').decode('utf-8-sig').splitlines()):
 if r['province_code']!='ON':continue
 geom=wkt.loads(r['geometry']) if r['geometry'] else None
 add('odef',r['unique_id'],r['facility_name'],r['streetAddress'],geom,r['csdname'],r['addressLocality'],r['provider'],r['source_id'],'school' if r['facility_type'] not in ['University','Junior College','Technical and Vocational','Private Institution'] else 'post-secondary',r)
print('schools done',len(rows),flush=True)
z=zipfile.ZipFile(CACHE/'odhf_v2_geojson.zip')
for f in json.loads(z.read('odhf_v2.geojson'))['features']:
 r=f['properties']
 if r.get('prov_terr')!='ON':continue
 typ=r.get('type','')
 cat='hospital' if typ=='Hospital' else 'care-home' if typ=='Nursing And Residential Care Facilities' else 'healthcare'
 add('odhf',r['id'],r.get('name'),r.get('address',''),shape(f['geometry']) if f['geometry'] else None,r.get('csdname'),'',r.get('provider'),r.get('source_id'),cat,r,3347)
print('health done',len(rows),flush=True)
c=sqlite3.connect(CACHE/'odsrf'/'odsrf_v2.gpkg');c.row_factory=sqlite3.Row
for sq in c.execute("select * from odsrf_v2 where prov_terr='ON'"):
 r=dict(sq);blob=r.pop('geom');fid=r.pop('fid');g=None
 if blob:
  env=(blob[3]>>1)&7;off=8+{0:0,1:32,2:48,3:48,4:64}[env];g=wkb.loads(blob[off:])
 add('odsrf',r['id'],r.get('name'),r.get('address',''),g,r.get('csdname'),'',r.get('provider'),r.get('source_id'),'recreation',r,3347)
print('recreation done',len(rows),flush=True)
# Preserve cross-source duplicates for provenance; create conservative exact-name+address deduplicated bundle separately.
per=collections.defaultdict(list)
for r in rows:
 apply_review(r,REVIEWS)
 per[r['cityId']].append(r)
summary={}
for cid,c in CITIES.items():
 rs=per[cid];(OUT/(cid+'.json')).write_text(json.dumps(rs,ensure_ascii=False,separators=(',',':')))
 summary[cid]={'count':len(rs),'byDataset':dict(collections.Counter(r['dataset'] for r in rs)),'byCategory':dict(collections.Counter(r['category'] for r in rs))}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2))
(OUT/'rejected-summary.json').write_text(json.dumps(dict(rejected),indent=2))
print(json.dumps(summary,indent=2))
