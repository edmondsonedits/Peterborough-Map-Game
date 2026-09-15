import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[2]
roads=json.loads((root/'city-explorer/data/osm-public-roads.geojson').read_text())['features']
target=[f for f in roads if 'sherbrooke' in f['properties'].get('name','').lower()]
sx=111320*math.cos(math.radians(44.3091))
def xy(p):return ((p[0]+78.3197)*sx,-(p[1]-44.3091)*110540)
segments=[(xy(a),xy(b)) for f in target for a,b in zip(f['geometry']['coordinates'],f['geometry']['coordinates'][1:])]
def dist(p,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz or 1)));return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)
def near(p,r=65):return min(dist(xy(p),a,b) for a,b in segments)<r
near_roads=[f for f in roads if any(near(p,100) for p in f['geometry']['coordinates'])]
osm=json.loads((root/'city-explorer/data/peterborough-osm.json').read_text())['elements']
buildings=[]
for e in osm:
 if e['type']=='way' and e.get('tags',{}).get('building') and e.get('geometry'):
  ring=[[p['lon'],p['lat']] for p in e['geometry']]
  if any(near(p) for p in ring[::max(1,len(ring)//3)]):buildings.append({'id':'way/'+str(e['id']),'ring':ring})
def compact(f):return {'id':str(f['properties']['osm_id']),'tags':f['properties'],'line':f['geometry']['coordinates']}
data={'schema':1,'evidence':'Nine user-supplied Gemini-altered Sherbrooke references; illustrative placements. Full mapped street extension is inferred, not photographed.','roads':[compact(f) for f in target],'clearanceRoads':[compact(f) for f in near_roads],'buildings':buildings}
out=root/'city-explorer/sherbrooke-source.js';out.write_text('// Generated from existing local GIS by tools/streetscape/build_sherbrooke_source.py.\nexport const SHERBROOKE_SOURCE = '+json.dumps(data,separators=(',',':'))+';\n')
print(len(target),'target roads',len(near_roads),'clearance roads',len(buildings),'building footprints',out.stat().st_size,'bytes')
