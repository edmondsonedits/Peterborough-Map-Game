#!/usr/bin/env python3
"""Audit every drivable OSM way against independent, linear-referenced ORN lanes.

Matching inventory counts is not proof of current paint. No renderer or source
geometry is changed by this script. Outputs contain all ways, including gaps.
"""
from __future__ import annotations
import argparse, csv, datetime as dt, hashlib, json, math, re
from collections import Counter, defaultdict
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

EXCLUDED={'abandoned','bridleway','construction','corridor','crossing','cycleway','footway','path','pedestrian','platform','proposed','raceway','razed','steps'}
SUFFIX={'STREET':'ST','ROAD':'RD','AVENUE':'AVE','DRIVE':'DR','BOULEVARD':'BLVD','CRESCENT':'CRES','COURT':'CT','TERRACE':'TER','LANE':'LN','NORTH':'N','SOUTH':'S','EAST':'E','WEST':'W','HIGHWAY':'HWY'}
def name_key(s):
    return ' '.join(SUFFIX.get(t,t) for t in re.sub(r"[^A-Z0-9 ]",' ',str(s).upper()).split())
def count(v):
    s=str(v if v is not None else '')
    return int(s) if s.isdecimal() and 0<=int(s)<=20 else None

def run(root,evidence,out):
    data=root/'city-explorer/data';out.mkdir(parents=True,exist_ok=True)
    osm=json.loads((data/'peterborough-osm.json').read_text())
    orn=json.loads((data/'orn-roads.geojson').read_text())['features']
    lane_source=json.loads((evidence/'orn-lane-records.json').read_text())
    lane_records=defaultdict(list)
    for r in lane_source['records']:lane_records[r['ORN_ROAD_NET_ELEMENT_ID']].append(r)
    project=Transformer.from_crs(4326,26917,always_xy=True).transform
    city=unary_union([transform(project,shape(f['geometry'])) for f in json.loads((evidence/'city-boundary.geojson').read_text())['features']])
    lines=[transform(project,shape(f['geometry'])) for f in orn]
    tree=STRtree(lines)
    municipal=json.loads((data/'peterborough-road-surfaces.geojson').read_text())['features']
    pavement=[transform(project,shape(f['geometry'])) for f in municipal if f['properties'].get('ptbo_layer')=='road_surfaces']
    p_tree=STRtree(pavement)
    records=[];all_names=set();city_names=set()
    for w in osm['elements']:
        t=w.get('tags',{})
        if w.get('type')!='way' or not t.get('highway') or t['highway'] in EXCLUDED or t.get('area')=='yes' or len(w.get('geometry',[]))<2:continue
        coords=[(p['lon'],p['lat']) for p in w['geometry']]
        line=transform(project,LineString(coords));length=line.length
        if length<.05:continue
        in_city=line.intersects(city)
        mapped=count(t.get('lanes'));fwd=count(t.get('lanes:forward'));back=count(t.get('lanes:backward'));both=count(t.get('lanes:both_ways')) or 0
        if not mapped and fwd is not None and back is not None:mapped=fwd+back+both
        key=name_key(t.get('name') or t.get('ref') or '')
        if key:all_names.add(key)
        if key and in_city:city_names.add(key)
        # Interior positions reduce intersection-name confusion. At least three
        # points; never silently reduce a long way to a single nearest neighbour.
        n=max(3,min(200,math.ceil(length/15)))
        matched=[];paved=0
        for i in range(n):
            s=length*(i+.5)/n;p=line.interpolate(s)
            if any(pavement[j].covers(p) for j in p_tree.query(p)):paved+=1
            a=line.interpolate(max(0,s-3));b=line.interpolate(min(length,s+3));vx=b.x-a.x;vy=b.y-a.y;vlen=math.hypot(vx,vy)
            choices=[]
            for j in tree.query(p.buffer(10)):
                other=lines[j]
                if other.geom_type!='LineString' or other.length<.05:continue
                prop=orn[j]['properties'];names=prop.get('official_names') or []
                if not key or key not in {name_key(x) for x in names}:continue
                d=other.distance(p)
                if d>8:continue
                u=other.project(p);aa=other.interpolate(max(0,u-3));bb=other.interpolate(min(other.length,u+3));wx=bb.x-aa.x;wy=bb.y-aa.y
                alignment=abs((vx*wx+vy*wy)/max(1e-8,vlen*math.hypot(wx,wy)))
                if alignment<math.cos(math.radians(25)):continue
                # A divided carriageway should not be compared as if it were
                # the whole two-way road. Report unmatched instead of false count.
                oneway=t.get('oneway') in ('yes','1','-1')
                flow=str(prop.get('DIRECTION_OF_TRAFFIC_FLOW','')).lower()
                if oneway and flow=='both':continue
                measure=u/other.length*float(prop.get('LENGTH') or other.length)
                relevant=[r for r in lane_records.get(prop['OGF_ID'],[]) if min(r['FROM_MEASURE'],r['TO_MEASURE'])-.5<=measure<=max(r['FROM_MEASURE'],r['TO_MEASURE'])+.5]
                counts={r['NUMBER_OF_LANES'] for r in relevant if isinstance(r.get('NUMBER_OF_LANES'),int) and r['NUMBER_OF_LANES']>0}
                if len(counts)!=1:continue
                choices.append((d,j,next(iter(counts)),relevant))
            if choices:
                d,j,lanes,rows=min(choices,key=lambda a:a[0]);matched.append((lanes,d,int(orn[j]['properties']['OGF_ID']),rows))
        votes=Counter(m[0] for m in matched);coverage=len(matched)/n
        observed=set(votes);status='unmatched'
        if coverage>=.8 and len(observed)==1:status='inventory-agreement' if mapped in observed else 'inventory-conflict' if mapped else 'inventory-only'
        elif matched:status='partial-or-varying-inventory'
        flags=[]
        if mapped is None:flags.append('lane-count-not-mapped')
        if status=='inventory-conflict':flags.append('lane-count-source-conflict')
        if len(observed)>1:flags.append('lane-count-varies-along-way')
        if mapped and not t.get('oneway') and mapped%2 and fwd is None and back is None and not both:flags.append('directional-split-unknown')
        if fwd is not None and back is not None and mapped and fwd+back+both!=mapped:flags.append('inconsistent-directional-lanes')
        if not t.get('lane_markings'):flags.append('paint-style-not-surveyed')
        if both:flags.append('shared-centre-lane')
        if any(t.get(k) in ('track','shoulder','shared_lane') for k in ('cycleway','cycleway:left','cycleway:right')):flags.append('cycle-facility-is-not-painted-lane')
        effective=sorted({r.get('EFFECTIVE_DATETIME') for m in matched for r in m[3] if r.get('EFFECTIVE_DATETIME')})
        rec={'osm_way':str(w['id']),'street':t.get('name') or t.get('ref') or '', 'highway':t['highway'],'in_city':in_city,
          'length_m':round(length,2),'mapped_lanes':mapped,'forward':fwd,'backward':back,'shared':both,'oneway':t.get('oneway','no'),
          'lane_markings_tag':t.get('lane_markings'),'orn_lane_counts':sorted(observed),'orn_match_fraction':round(coverage,3),'orn_ids':sorted({m[2] for m in matched}),
          'orn_effective_dates':[dt.datetime.fromtimestamp(v/1000,dt.timezone.utc).date().isoformat() for v in effective],
          'inventory_status':status,'pavement_centre_coverage':round(paved/n,3),'sidewalk_tags':{k:v for k,v in t.items() if k.startswith('sidewalk')},
          'parking_tags':{k:v for k,v in t.items() if k.startswith('parking')},'cycle_tags':{k:v for k,v in t.items() if k.startswith('cycleway')},
          'flags':flags,'paint_verified':False,'geometry_sha256':hashlib.sha256(json.dumps(coords,separators=(',',':')).encode()).hexdigest()}
        records.append(rec)
    city_records=[r for r in records if r['in_city']]
    summary={'osm_snapshot':osm.get('osm3s',{}).get('timestamp_osm_base'), 'orn_lane_source':lane_source['source_url'],
      'orn_lane_records':len(lane_source['records']),'orn_road_ids_requested':lane_source['road_ids_requested'],
      'all_drivable_ways':len(records),'ways_intersecting_city':len(city_records),'named_streets_intersecting_city':len(city_names),
      'status_city':dict(Counter(r['inventory_status'] for r in city_records)),'mapped_lanes_city':sum(r['mapped_lanes'] is not None for r in city_records),
      'shared_lane_ways_city':sum(bool(r['shared']) for r in city_records),
      'limitations':['Automated inventory audit, NOT a visual inspection of every road.','ORN effective dates may be old; inventory conflicts require imagery or municipal review.',
        'Matching uses names, local bearing, <=8m separation and linear-referenced lane events.','City-intersecting ways may extend beyond the municipal boundary.',
        'Lane count does not determine single/double/solid/broken paint or actual curb height.']}
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    (out/'all-road-segments.json').write_text(json.dumps({'summary':summary,'roads':records},separators=(',',':')))
    keys=['osm_way','street','highway','in_city','length_m','mapped_lanes','forward','backward','shared','oneway','orn_lane_counts','orn_match_fraction','inventory_status','orn_effective_dates','pavement_centre_coverage','flags']
    with (out/'all-road-segments.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=keys);writer.writeheader()
        for r in records:writer.writerow({k:json.dumps(r[k]) if isinstance(r[k],list) else r[k] for k in keys})
    print(json.dumps(summary,indent=2))
    return records

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('.'));parser.add_argument('--evidence',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();run(args.root,args.evidence,args.out)
