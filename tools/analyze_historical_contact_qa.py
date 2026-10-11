"""Independent planar union accounting of actual Float32 paint triangles.
Requires Shapely >=2. Input is the authored actual-source regression QA JSON.
"""
import json, math, sys
from pathlib import Path
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

def polygons(values):
    return [Polygon([(values[i+k],values[i+k+2]) for k in (0,3,6)]) for i in range(0,len(values),9)]

def analyze(source):
    data=json.loads(Path(source).read_text());rows=[]
    for p in data['profiles']:
        eligible=unary_union(polygons(p['eligible']));emitted=unary_union(polygons(p['emitted']))
        missing=eligible.difference(emitted);components=[g for g in getattr(missing,'geoms',[missing]) if g.area>1e-12]
        spans=[]
        for g in components:
            c=list(g.minimum_rotated_rectangle.exterior.coords)
            sides=[math.dist(c[i],c[i+1]) for i in range(len(c)-1)]
            spans.append({'areaM2':g.area,'shortSpanM':min(sides),'longSpanM':max(sides)})
        centerline_gaps=[]
        for stroke in p['profile']['strokes']:
            hit=missing.intersection(LineString([(v['x'],v['z']) for v in stroke['points']]))
            for part in getattr(hit,'geoms',[hit]):
                if part.geom_type=='LineString' and part.length>1e-8:centerline_gaps.append(part.length)
        rows.append({'id':p['id'],'lowPower':data['lowPower'],'eligibleUnionAreaM2':eligible.area,
                     'emittedUnionAreaM2':emitted.area,'missingUnionAreaM2':missing.area,
                     'outsideReferenceAreaM2':emitted.difference(eligible).area,
                     'missingEquivalentLengthAt013mM':missing.area/.13,
                     'maxStrokeCenterlineGapM':max(centerline_gaps,default=0),'totalStrokeCenterlineGapM':sum(centerline_gaps),'missingComponents':len(components),'maxComponentShortSpanM':max([g['shortSpanM'] for g in spans],default=0),
                     'maxComponentLongSpanM':max([g['longSpanM'] for g in spans],default=0),
                     'notes':'Union accounting includes quantization slivers and local contact omissions; reference uses same intersection exclusions. Component span is not a full-width break.'})
    return rows
if __name__=='__main__':
    result=analyze(sys.argv[1]);text=json.dumps(result,indent=2)+'\n'
    if len(sys.argv)>2:Path(sys.argv[2]).write_text(text)
    print(text,end='')
