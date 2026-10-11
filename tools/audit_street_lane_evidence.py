"""Compare packaged OSM road lanes with downloaded ORN lane events.
This is a data comparison, not a survey of paint, curbs or all street imagery.
Usage: python tools/audit_street_lane_evidence.py path/to/orn-lane-events.json
Requires shapely and pyproj; does not modify geographic source data.
"""
import collections, hashlib, json, math, re, sys
from pathlib import Path
from shapely.geometry import LineString
from shapely.ops import transform
from shapely.strtree import STRtree
from pyproj import Transformer
ROOT = Path(__file__).resolve().parents[1]
data = ROOT/'city-explorer/data'
evidence_path = Path(sys.argv[1])
receipt = json.loads(evidence_path.read_text())
orn = json.loads((data/'orn-roads.geojson').read_text())['features']
osm = json.loads((data/'peterborough-osm.json').read_text())['elements']
project = Transformer.from_crs(4326, 26917, always_xy=True).transform
public_ids = {str(f['properties']['osm_id']) for f in json.loads((data/'osm-public-roads.geojson').read_text())['features']}
rendered_ids = {str(f['properties']['osm_id']) for f in json.loads((data/'osm-roads.geojson').read_text())['features']}
events = collections.defaultdict(list)
for record in receipt['events']: events[record['ORN_ROAD_NET_ELEMENT_ID']].append(record)
geometries = [transform(project, LineString(f['geometry']['coordinates'])) for f in orn]
tree = STRtree(geometries)
def normalize(value):
    value = re.sub('[^A-Z0-9 ]', '', value.upper())
    aliases = {'STREET':'ST','ROAD':'RD','WEST':'W','EAST':'E','NORTH':'N','SOUTH':'S','AVENUE':'AVE','BOULEVARD':'BLVD','CRESCENT':'CRES','DRIVE':'DR','COURT':'CRT'}
    return ' '.join(aliases.get(word, word) for word in value.split())
def tangent(line, distance):
    a, b = line.interpolate(max(0, distance-1)), line.interpolate(min(line.length, distance+1))
    x, z = b.x-a.x, b.y-a.y
    length = max(math.hypot(x,z), 1e-8)
    return x/length, z/length
reviewed = {'739159886','737434011','650896572','460581459'}
rows = []
for way in osm:
    if way.get('type') != 'way' or str(way['id']) not in rendered_ids: continue
    tags = way['tags']
    line = transform(project, LineString([(p['lon'],p['lat']) for p in way['geometry']]))
    count = max(3, int(line.length/12))
    votes, road_ids, dates, maximum_distance, matched = [], set(), set(), 0, 0
    for i in range(count):
        distance = line.length*(i+.5)/count
        point = line.interpolate(distance)
        tx,tz = tangent(line,distance)
        candidates = []
        for k in tree.query(point.buffer(10)):
            properties = orn[k]['properties']
            if not tags.get('name') or normalize(tags['name']) not in map(normalize,properties.get('official_names',[])): continue
            offset = geometries[k].distance(point)
            if offset > 8: continue
            projected = geometries[k].project(point)
            ox,oz = tangent(geometries[k],projected)
            if abs(tx*ox+tz*oz) < .94: continue
            measure = projected/geometries[k].length*float(properties.get('LENGTH') or geometries[k].length)
            covering = [r for r in events[properties['OGF_ID']] if min(r['FROM_MEASURE'],r['TO_MEASURE'])-.3 <= measure <= max(r['FROM_MEASURE'],r['TO_MEASURE'])+.3]
            values = {r['NUMBER_OF_LANES'] for r in covering}
            if len(values)==1 and next(iter(values))>0:
                candidates.append((offset,properties['OGF_ID'],next(iter(values)),covering))
        candidates.sort(key=lambda c:c[0])
        if not candidates: continue
        if any(c[2]!=candidates[0][2] and c[0]<candidates[0][0]+2 for c in candidates[1:]): continue
        offset, road_id, lanes, covering = candidates[0]
        votes.append(lanes); matched += 1; road_ids.add(road_id)
        maximum_distance = max(offset,maximum_distance)
        dates.update(r['EFFECTIVE_DATETIME'] for r in covering if r.get('EFFECTIVE_DATETIME'))
    values, coverage = sorted(set(votes)), matched/count
    lanes = int(tags['lanes']) if str(tags.get('lanes','')).isdigit() else None
    status = 'no-reliable-ORN-match'
    if coverage>=.9 and len(values)==1:
        status = 'lane-count-agrees' if lanes==values[0] else 'missing-OSM-count' if lanes is None else 'lane-count-conflict'
    elif matched: status = 'partial-or-varying-evidence'
    visual = str(way['id']) in reviewed
    rows.append({'osmId':str(way['id']),'name':tags.get('name',''),'public':str(way['id']) in public_ids,
        'lengthM':round(line.length,2),'osmLanes':lanes,'ornLaneValues':values,'matchedFraction':round(coverage,3),
        'ornIds':sorted(road_ids),'maxMatchedDistanceM':round(maximum_distance,2),'ornEffectiveDates':sorted(dates),
        'status':status,'tags':{k:v for k,v in tags.items() if k in ['highway','oneway','source','lanes','lanes:forward','lanes:backward','lanes:both_ways','lane_markings','cycleway','cycleway:left','cycleway:right','sidewalk','parking:both','width','overtaking','surface']},
        'visualReview':'sherbrooke-park-george-reference' if visual else 'not-reviewed',
        'paintPattern':'single-solid-yellow-centre; no extra through-lane dividers in reviewed span' if visual else 'unknown'})
summary = {'renderedWays':len(rows),'publicWays':sum(r['public'] for r in rows),
    'namedStreets':len({r['name'] for r in rows if r['name']}),
    'status':dict(collections.Counter(r['status'] for r in rows)),
    'reviewedCorrectionWays':sum(r['visualReview']!='not-reviewed' for r in rows)}
report = {'baseline':'3a9f333270bd8d832e5651d6b4cda4125e90d32c',
    'scope':'Every packaged renderable way, including service roads. NOT photographic review of every road. ORN provides lane-count evidence, not paint pattern.',
    'method':'NAD83/UTM17N; ~12 m samples; exact normalized names, <=8 m offset, <=20 degree heading difference; >=90% coverage and one count for definitive comparison. Near-parallel conflicting matches rejected; event measure ranges respected. No automatic OSM edits.',
    'limitations':['ORN records have historical effective dates; retrieval date is not survey date.','Linear-reference projection is approximate on differently represented road geometries.','A conflict is a review candidate, not proof that OSM is wrong.','Named-street count is distinct nonblank OSM name strings, not an official municipal street inventory.','Aerial references are a dated service mosaic; no current-2026 acquisition claim.','Curb height, curb presence, shoulder and paint patterns are not established by a lane-count table.'],
    'ornReceipt':{k:v for k,v in receipt.items() if k!='events'},
    'hashes':{str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [data/'peterborough-osm.json',data/'orn-roads.geojson',evidence_path]},
    'summary':summary,'roads':rows}
destination = ROOT/'docs/street-audit'
destination.mkdir(parents=True,exist_ok=True)
(destination/'network-audit.json').write_text(json.dumps(report,indent=2))
# Preserve original attribute evidence, including effective dates, without imagery bytes.
(destination/'orn-lane-events.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(summary,indent=2))
