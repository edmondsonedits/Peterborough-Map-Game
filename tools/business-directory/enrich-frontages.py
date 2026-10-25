"""Corroborate unaddressed OSM frontages using public municipal property addresses."""
import json,re,urllib.request,urllib.parse,datetime
from pathlib import Path
ROOT=Path(r'H:\ChatGPT\Peterborough-Building-References-20261024\business-signs')
API='https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4/query'
def query(params):
 def get(data):
  req=urllib.request.Request(API+'?'+urllib.parse.urlencode(data),headers={'User-Agent':'PeterboroughMapGame/1.0'})
  with urllib.request.urlopen(req,timeout=50) as response:page=json.load(response)
  if page.get('error'):raise RuntimeError(page['error'])
  return page
 points=json.loads(params['geometry'])['points'];ids=set()
 if not points:raise RuntimeError('No source points for municipal query')
 for begin in range(0,len(points),50):
  page=get({**params,'geometry':json.dumps({'points':points[begin:begin+50],'spatialReference':{'wkid':4326}}),'f':'json','returnIdsOnly':'true'})
  ids.update(page.get('objectIds',[]))
  if len(ids)>5000:raise RuntimeError('Municipal spatial filter returned too many parcels: '+str(len(ids)))
 result=[];ordered=sorted(ids)
 for begin in range(0,len(ordered),100):
  page=get({'objectIds':','.join(map(str,ordered[begin:begin+100])),'f':'geojson','outFields':'OBJECTID,ADDRESS','returnGeometry':'true','outSR':'4326'})
  if len(page.get('features',[]))>100:raise RuntimeError('Municipal object ID filter was not applied')
  result.extend(page.get('features',[]))
 return result
def inside(point,ring):
 x,y=point;yes=False
 for a,b in zip(ring,ring[1:]+ring[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:yes=not yes
 return yes

def main():
 source=json.loads((ROOT/'businesses-combined.json').read_text(encoding='utf-8'));rows=source['businesses'];cache=ROOT/'city-business-frontage-parcels.geojson'
 if cache.exists():geo=json.loads(cache.read_text(encoding='utf-8'))
 else:
  points=[[r['lon'],r['lat']] for r in rows if r.get('sourceKind')=='osm' and not r.get('street') and isinstance(r.get('lat'),(int,float))]
  features=query({'where':'1=1','geometry':json.dumps({'points':points,'spatialReference':{'wkid':4326}}),'geometryType':'esriGeometryMultipoint','inSR':'4326','spatialRel':'esriSpatialRelIntersects'})
  geo={'type':'FeatureCollection','sourceUrl':API,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'features':features};cache.write_text(json.dumps(geo,ensure_ascii=False),encoding='utf-8')
 parcels=[]
 for f in geo['features']:
  g=f.get('geometry') or {};polygons=[g['coordinates']] if g.get('type')=='Polygon' else g.get('coordinates',[]) if g.get('type')=='MultiPolygon' else []
  for rings in polygons:
   outer=rings[0];xs=[p[0] for p in outer];ys=[p[1] for p in outer];parcels.append((f['properties'],rings,(min(xs),min(ys),max(xs),max(ys))))
 enriched=0
 for row in rows:
  if row.get('sourceKind')!='osm' or row.get('street') or not isinstance(row.get('lat'),(int,float)):continue
  p=(row['lon'],row['lat']);matches=[]
  for props,rings,b in parcels:
   if b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3] and inside(p,rings[0]) and not any(inside(p,r) for r in rings[1:]):matches.append(props)
  addresses={m.get('ADDRESS','').strip() for m in matches if m.get('ADDRESS')}
  if len(addresses)!=1:continue
  address=next(iter(addresses));street=re.sub(r'^\d+[A-Za-z]?\s+','',address).strip()
  if street==address:continue
  row['street']=street;row['parcelAddress']=address;row['frontageEvidence']='municipal-parcel-address';row['addressSourceUrl']=API+'?'+urllib.parse.urlencode({'f':'pjson','objectIds':matches[0].get('OBJECTID'),'outFields':'ADDRESS','returnGeometry':'false'});enriched+=1
 source['frontageEnrichment']={'sourceUrl':API,'parcels':len(geo['features']),'enrichedRecords':enriched,'method':'OSM source point uniquely contained by a municipal addressed property; tenant door position remains inferred'}
 (ROOT/'businesses-enriched.json').write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(source['frontageEnrichment']),flush=True)
if __name__=='__main__':main()
