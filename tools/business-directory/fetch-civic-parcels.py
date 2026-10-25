"""Fetch only public civic addresses and parcel geometry for directory addresses."""
import json,re,hashlib,datetime,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(r'H:\ChatGPT\Peterborough-Building-References-20261024\business-signs')
API='https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4/query'
def get(data):
 request=urllib.request.Request(API+'?'+urllib.parse.urlencode(data),headers={'User-Agent':'PeterboroughMapGame/1.0'})
 with urllib.request.urlopen(request,timeout=50) as response:result=json.load(response)
 if result.get('error'):raise RuntimeError(result['error'])
 return result
def main():
 rows=json.loads((ROOT/'businesses-combined.json').read_text(encoding='utf-8'))['businesses'];prefixes=set()
 for row in rows:
  if row.get('sourceKind')=='osm':continue
  address=re.sub(r',?\s*\b(?:unit|suite|#)\s*[a-z0-9-]+\b','',row.get('address',''),flags=re.I).strip(' ,')
  match=re.match(r"(\d+[A-Za-z]?)\s+([A-Za-z'-]+)",address)
  if match:prefixes.add((match[1]+' '+match[2]).upper())
 ordered=sorted(prefixes);signature=hashlib.sha256(json.dumps(ordered).encode()).hexdigest();cache=ROOT/'city-directory-civic-parcels.geojson'
 if cache.exists():
  existing=json.loads(cache.read_text(encoding='utf-8'))
  if existing.get('inputSignature')==signature:print(json.dumps({'civicQueries':len(ordered),'parcels':len(existing['features']),'cached':True}),flush=True);return
 ids=set()
 for begin in range(0,len(ordered),20):
  where=' OR '.join("ADDRESS LIKE '"+prefix.replace("'","''")+" %'" for prefix in ordered[begin:begin+20]);result=get({'f':'json','where':where,'returnIdsOnly':'true'});ids.update(result.get('objectIds',[]))
  if len(ids)>3000:raise RuntimeError('Civic address query exceeded bounded scope')
 features=[];ids=sorted(ids)
 for begin in range(0,len(ids),100):
  result=get({'f':'geojson','objectIds':','.join(map(str,ids[begin:begin+100])),'outFields':'OBJECTID,ADDRESS','returnGeometry':'true','outSR':'4326'})
  if len(result.get('features',[]))>100:raise RuntimeError('Civic parcel object ID filter was not applied')
  features.extend(result.get('features',[]))
 cache.write_text(json.dumps({'type':'FeatureCollection','sourceUrl':API,'inputSignature':signature,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'features':features},ensure_ascii=False),encoding='utf-8');print(json.dumps({'civicQueries':len(ordered),'parcels':len(features),'cached':False}),flush=True)
if __name__=='__main__':main()
