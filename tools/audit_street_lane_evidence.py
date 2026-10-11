"""Compare packaged OSM road lanes with downloaded ORN lane events.
This is a data comparison, not a survey of paint, curbs or all street imagery.
Usage: python tools/audit_street_lane_evidence.py path/to/orn-lane-events.json
Requires shapely>=2, pyproj and Node.js; does not modify geographic source data.
"""
import collections, hashlib, json, math, re, sys, subprocess
from street_lane_compatibility import direction_compatibility, comparison_review, paint_eligibility
from pathlib import Path
from shapely.geometry import LineString
from shapely.ops import transform
from shapely.strtree import STRtree
from pyproj import Transformer
ROOT = Path(__file__).resolve().parents[1]
data = ROOT/'city-explorer/data'
evidence_path = Path(sys.argv[1]).resolve()
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
eligible_paint = paint_eligibility(ROOT, [way for way in osm if way.get('type') == 'way' and str(way['id']) in rendered_ids])
# Historical visual evidence is distinct from current paint-guard applicability.
reviewed = {way_id: ('sherbrooke-park-george-reference',
    'single-solid-yellow-centre; no extra through-lane dividers in reviewed span')
    for way_id in ('739159886','737434011','650896572','460581459')}
# Do not attach historical geometry evidence to a mismatched synthetic ID.
for way_id, entry in eligible_paint.items():
    if way_id == '250811912':
        reviewed[way_id] = ('hospital-historical-shared-turn-reference',
            'bounded 10–90 m measured shared-turn trace; yellow outer solids and inner dashes; no inferred arrows or stop bars')
    elif way_id == '250810393':
        reviewed[way_id] = ('medical-historical-taper-reference',
            'measured yellow taper boundaries and generalized inset hatches; no inferred white dividers, arrows or stop bars')
rows = []
for way in osm:
    if way.get('type') != 'way' or str(way['id']) not in rendered_ids: continue
    tags = way['tags']
    line = transform(project, LineString([(p['lon'],p['lat']) for p in way['geometry']]))
    count = max(3, int(line.length/12))
    votes, road_ids, dates, maximum_distance, matched = [], set(), set(), 0, 0
    compatibility = collections.Counter()
    flows = {}
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
                candidates.append((offset,properties['OGF_ID'],next(iter(values)),covering,
                    direction_compatibility(tags, properties.get('DIRECTION_OF_TRAFFIC_FLOW'), tx*ox+tz*oz),
                    properties.get('DIRECTION_OF_TRAFFIC_FLOW')))
        candidates.sort(key=lambda c:c[0])
        if not candidates: continue
        if any(c[2]!=candidates[0][2] and c[0]<candidates[0][0]+2 for c in candidates[1:]): continue
        offset, road_id, lanes, covering, direction, flow = candidates[0]
        # Preserve raw nearest-match arithmetic. Equal counts do not resolve a
        # competing nearby candidate with different direction/carriageway semantics.
        if any(c[4] != direction and c[0] < offset+2 for c in candidates[1:]):
            direction = 'ambiguous-direction'
        compatibility[direction] += 1
        flows[str(road_id)] = flow
        votes.append(lanes); matched += 1; road_ids.add(road_id)
        maximum_distance = max(offset,maximum_distance)
        dates.update(r['EFFECTIVE_DATETIME'] for r in covering if r.get('EFFECTIVE_DATETIME'))
    values, coverage = sorted(set(votes)), matched/count
    lanes = int(tags['lanes']) if str(tags.get('lanes','')).isdigit() else None
    status = 'no-reliable-ORN-match'
    if coverage>=.9 and len(values)==1:
        status = 'lane-count-agrees' if lanes==values[0] else 'missing-OSM-count' if lanes is None else 'lane-count-conflict'
    elif matched: status = 'partial-or-varying-evidence'
    visual, pattern = reviewed.get(str(way['id']), ('not-reviewed', 'unknown'))
    paint = eligible_paint.get(str(way['id']), {})
    rows.append({'osmId':str(way['id']),'name':tags.get('name',''),'public':str(way['id']) in public_ids,
        'lengthM':round(line.length,2),'osmLanes':lanes,'ornLaneValues':values,'matchedFraction':round(coverage,3),
        'ornIds':sorted(road_ids),'maxMatchedDistanceM':round(maximum_distance,2),'ornEffectiveDates':sorted(dates),
        'status':status,'comparisonReview':comparison_review(status, compatibility),
        'matchedSamples':matched,'sampleCount':count,'directionCompatibility':dict(sorted(compatibility.items())),
        'ornTrafficFlows':flows,'paintOverride':paint.get('evidence', 'not-applied'),
        'paintEligibility':paint.get('paintEligibility', 'not-eligible'),
        'paintCoverage':paint.get('paintCoverage'), 'paintProfileId':paint.get('profileId'), 'paintSupport':'not-evaluated',
        'currentVerified':False, 'paintUncertaintyMetres':paint.get('uncertaintyMetres'),
        'paintRegistrationUncertainty':paint.get('registrationUncertainty'),
        'tags':{k:v for k,v in tags.items() if k in ['highway','oneway','source','lanes','lanes:forward','lanes:backward','lanes:both_ways','lane_markings','cycleway','cycleway:left','cycleway:right','sidewalk','parking:both','width','overtaking','surface','junction'] or k.startswith('oneway:')},
        'visualReview':visual, 'paintPattern':pattern})
summary = {'renderedWays':len(rows),'publicWays':sum(r['public'] for r in rows),
    'namedStreets':len({r['name'] for r in rows if r['name']}),
    'status':dict(collections.Counter(r['status'] for r in rows)),
    'comparisonReview':dict(collections.Counter(r['comparisonReview'] for r in rows)),
    'paintOverride':dict(collections.Counter(r['paintOverride'] for r in rows)),
    'eligiblePaintWays':len(eligible_paint), 'renderedPaintWays':None,
    'reviewedCorrectionWays':sum(r['visualReview']!='not-reviewed' for r in rows)}
try:
    baseline = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True, stderr=subprocess.DEVNULL).strip()
except (OSError, subprocess.CalledProcessError):
    baseline = None
report = {'schemaVersion':3, 'baseline':baseline,
    'baselineMeaning':'Checkout HEAD only; file hashes identify the exact inputs, including local modifications.',
    'scope':'Every packaged renderable way, including service roads. NOT photographic review of every road. ORN provides lane-count evidence, not paint pattern.',
    'method':'NAD83/UTM17N; ~12 m samples; exact normalized names, <=8 m offset, <=20 degree heading difference; >=90% coverage and one count for raw numeric comparison; interpret only after the compatibility gate. Near-parallel conflicting counts rejected; event measure ranges respected. Raw status preserves numeric comparisons; comparisonReview separately gates direction/carriageway compatibility including signed local geometry. Paint override means eligibility evaluated using the actual historical whole-source geometry and road-profile guards (or existing Sherbrooke guard). Final rendered triangle support and emitted paint are not evaluated by this data audit; eligibility is not field accuracy. No automatic OSM edits.',
    'limitations':['ORN records have historical effective dates; retrieval date is not survey date.', 'Compatible directions do not prove identical carriageways; no ORN count is divided or automatically applied.', 'Implicit or conditional OSM one-way direction is conservatively unknown; source-compatibility-review must precede lane-count interpretation.','Linear-reference projection is approximate on differently represented road geometries.','A conflict is a review candidate, not proof that OSM is wrong.','Named-street count is distinct nonblank OSM name strings, not an official municipal street inventory.','Aerial references are a dated service mosaic; no current-2026 acquisition claim.','Curb height, curb presence, shoulder and paint patterns are not established by a lane-count table.'],
    'ornReceipt':{k:v for k,v in receipt.items() if k!='events'},
    'hashes':{str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [data/'peterborough-osm.json',data/'orn-roads.geojson',data/'osm-roads.geojson',data/'osm-public-roads.geojson',ROOT/'city-explorer/street-paint.js',evidence_path]},
    'codeHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),ROOT/'tools/street_lane_compatibility.py',ROOT/'tools/evaluate_historical_paint.mjs',ROOT/'city-explorer/street-paint.js',ROOT/'city-explorer/historical-paint-profiles.js',ROOT/'city-explorer/road-network.js']},
    'summary':summary,'roads':rows}
destination = ROOT/'docs/street-audit'
destination.mkdir(parents=True,exist_ok=True)
(destination/'network-audit.json').write_text(json.dumps(report,indent=2))
# Preserve original attribute evidence, including effective dates, without imagery bytes.
(destination/'orn-lane-events.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(summary,indent=2))
