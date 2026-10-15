#!/usr/bin/env python3
"""Reproducible OSM road packs; raw PBF/index/cache remain outside tracked assets.

pip install osmium
python tools/geospatial/build_ontario_route_networks.py --download

Full OSM ways are retained (never clipped or joined by coordinate proximity).
A native NodeLocationsForWays handler and sparse file index avoid per-node Python
callbacks. The second way scan completes turn-restriction member closure.
"""
from __future__ import annotations
import argparse
import base64
from collections import Counter
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import sys
import time
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = 'https://download.geofabrik.de/north-america/canada/ontario-261014.osm.pbf'
SOURCE_BYTES = 1032610327
SOURCE_SHA256 = '0d678aa80c806b7637cee747e40c9dbaa800847a8c021397740813a8dcb0f333'
SNAPSHOT = '2026-10-14T20:21:12Z'
GRAPH_VERSION = 'ontario-osm-2026-10-14-v2'
ISLAND_POLICY = 'https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/'
HIGHWAYS = set('motorway trunk primary secondary tertiary unclassified residential living_street service road track busway escape motorway_link trunk_link primary_link secondary_link tertiary_link'.split())
CONTROL_KEYS = {'barrier', 'ford', 'traffic_signals', 'crossing', 'railway', 'traffic_calming', 'highway', 'access', 'vehicle', 'motor_vehicle', 'motorcar', 'emergency', 'maxheight', 'maxwidth', 'maxweight', 'maxaxleload', 'locked', 'bollard'}
ISLAND_NAMES = {'cibola avenue', 'lakeshore avenue', 'the mall', 'lagoon road', 'beach road', 'terry kimball lane', 'withrow street', 'pontiac avenue'}


def log(message):
    print(time.strftime('%H:%M:%S'), message, flush=True)


def compact(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)


def tokens(value):
    return {part.strip().lower() for part in str(value or '').split(';') if part.strip()}


def emergency_explicit(tags):
    return bool(tokens(tags.get('emergency')) & {'yes', 'designated', 'official', 'permissive'})


def point_segment_distance(point, a, b):
    """Local metric distance, suitable for simplification and short base driveways."""
    coslat = math.cos(math.radians((point[1] + a[1] + b[1]) / 3))
    sx, sy = 111320 * coslat, 111320
    dx, dy = (b[0] - a[0]) * sx, (b[1] - a[1]) * sy
    px, py = (point[0] - a[0]) * sx, (point[1] - a[1]) * sy
    t = max(0, min(1, (px * dx + py * dy) / (dx * dx + dy * dy))) if dx or dy else 0
    return math.hypot(px - t * dx, py - t * dy)


def near_base(coords, bases, radius=300):
    for base in bases:
        point = [float(base['lng']), float(base['lat'])]
        if any(point_segment_distance(point, a, b) <= radius for a, b in zip(coords, coords[1:])):
            return True
    return False


def way_admission(tags, coords, bases):
    """Return routeAccess; None means omit the way. Original tags stay untouched."""
    if tags.get('highway') not in HIGHWAYS:
        return None
    service = tokens(tags.get('service'))
    if service & {'parking_aisle', 'drive-through', 'drive_through'} and not emergency_explicit(tags):
        return None
    if 'driveway' in service:
        return 'base-only' if near_base(coords, bases) else None
    return 'road'


def segment_intersects_box(a, b, box):
    west, south, east, north = box
    t0, t1 = 0.0, 1.0
    dx, dy = b[0] - a[0], b[1] - a[1]
    for p, q in ((-dx, a[0] - west), (dx, east - a[0]), (-dy, a[1] - south), (dy, north - a[1])):
        if p == 0:
            if q < 0:
                return False
        else:
            t = q / p
            if p < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return False
    return True


def intersects(coords, box):
    return any(segment_intersects_box(a, b, box) for a, b in zip(coords, coords[1:]))


def simplify(node_ids, coords, protected, epsilon=1.9):
    """RDP between every protected OSM node; no topology is inferred from geometry."""
    keep = {0, len(coords) - 1}
    keep.update(i for i, node_id in enumerate(node_ids) if node_id in protected)
    anchors = sorted(keep)
    stack = list(zip(anchors, anchors[1:]))
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        index, distance = max(((i, point_segment_distance(coords[i], coords[start], coords[end])) for i in range(start + 1, end)), key=lambda pair: pair[1])
        if distance > epsilon:
            keep.add(index)
            stack.extend(((start, index), (index, end)))
    indexes = sorted(keep)
    return [node_ids[i] for i in indexes], [coords[i] for i in indexes]


def island_emergency_access(tags, coords):
    """Narrow verified asphalt road policy; never changes original access/limits."""
    if tags.get('highway') != 'service' or tags.get('surface') != 'asphalt':
        return None
    name = tags.get('name', '').lower().strip()
    for short, full in ((' ave', ' avenue'), (' rd', ' road'), (' ln', ' lane'), (' st', ' street')):
        if name.endswith(short):
            name = name[:-len(short)] + full
    if name not in ISLAND_NAMES or not all(-79.43 <= x <= -79.33 and 43.60 <= y <= 43.65 for x, y in coords):
        return None
    if tags.get('bridge') not in (None, 'no'):
        return None  # A bridge's apparatus suitability needs its own verified limits.
    return {'allowed': True, 'verified': True, 'sourceUrl': ISLAND_POLICY, 'maxspeedKph': 30,
            'schoolAreaMaxspeedKph': 15, 'scope': 'Toronto Island mapped asphalt service road',
            'apparatusDimensionsVerified': False, 'stationExitVerified': False}


def parse_restriction(relation):
    tags = dict(relation.tags)
    if tags.get('type') != 'restriction' or not any(key == 'restriction' or key.startswith('restriction:') for key in tags):
        return None
    members = [(m.type, int(m.ref), m.role) for m in relation.members]
    from_ids = [ref for kind, ref, role in members if kind == 'w' and role == 'from']
    to_ids = [ref for kind, ref, role in members if kind == 'w' and role == 'to']
    via_nodes = [ref for kind, ref, role in members if kind == 'n' and role == 'via']
    via_ways = [ref for kind, ref, role in members if kind == 'w' and role == 'via']
    if not from_ids or not to_ids or not (via_nodes or via_ways):
        return None
    # Multi-from/to relations remain explicit records rather than losing members.
    result = []
    for from_id in from_ids:
        for to_id in to_ids:
            item = {**tags, 'osm_id': int(relation.id), 'fromWayId': from_id, 'toWayId': to_id}
            if via_nodes:
                item['viaNodeId'] = via_nodes[0]
                if len(via_nodes) > 1:
                    item['viaNodeIds'] = via_nodes
            else:
                item['viaWayIds'] = via_ways
            result.append(item)
    return result


def extract_config(root, bases_path=None):
    configs = {}
    for path in sorted((root / 'cities').glob('*/city.json')):
        data = json.loads(path.read_text())
        city_id = data['id']
        package = path.with_name('package.js')
        text = package.read_text() if package.exists() else ''
        geo_path = path.with_name('geo-data.json')
        geo = json.loads(geo_path.read_text()) if geo_path.exists() else {}
        bounds = geo.get('map', {}).get('bounds') or data.get('map', {}).get('bounds')
        match = re.search(r'bounds:\[\[([\d.\-]+),\s*([\d.\-]+)\],\[([\d.\-]+),\s*([\d.\-]+)\]\]', text)
        if not bounds and match:
            s, w, n, e = map(float, match.groups())
            bounds = [[s, w], [n, e]]
        if not bounds:
            raise ValueError(f'No configured bounds for {city_id}')
        (south, west), (north, east) = bounds
        lat_pad = 8000 / 111320
        lng_pad = lat_pad / math.cos(math.radians((south + north) / 2))
        bases = [{'lat': float(lat), 'lng': float(lng)} for lat, lng in re.findall(r'\blat:\s*([\d.\-]+)\s*,\s*lng:\s*([\d.\-]+)', text)]
        # Canonical curated data supersedes preview fallbacks when available.
        if isinstance(geo.get('bases'), list):
            bases = [base for base in geo['bases'] if base.get('active', True) and base.get('status') not in ('planned', 'closed', 'inactive') and base.get('selectionEligible', True)]
        configs[city_id] = {'bounds': bounds, 'bufferedBounds': [west - lng_pad, south - lat_pad, east + lng_pad, north + lat_pad], 'bases': bases}
    if bases_path:
        explicit = json.loads(Path(bases_path).read_text())
        for city_id, bases in explicit.items():
            configs[city_id]['bases'] = [base for base in bases if base.get('active', True) and base.get('status') not in ('planned', 'closed', 'inactive')]
    return configs


def write_asset(path, payload):
    encoded = base64.b64encode(gzip.compress(compact(payload).encode(), compresslevel=9, mtime=0)).decode()
    source = "/* OpenStreetMap contributors, ODbL 1.0; generated by build_ontario_route_networks.py. */\n(() => {\n'use strict';\nconst encoded='" + encoded + "';\nwindow.PTBO_ROUTE_NETWORK_READY=(async()=>{\nif(typeof DecompressionStream!=='function')throw new Error('This browser needs gzip DecompressionStream for route maps.');\nconst bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));\nconst stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));\nconst network=JSON.parse(await new Response(stream).text());\nwindow.PTBO_ROUTE_NETWORK=network;\nwindow.dispatchEvent(new CustomEvent('ptbo-route-network-ready',{detail:{cityId:network.cityId,graphVersion:network.graphVersion}}));\nreturn network;\n})();\n})();\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source)
    return len(source.encode())


def verify_source(path):
    if path.stat().st_size != SOURCE_BYTES:
        raise ValueError(f'PBF size is {path.stat().st_size}, expected {SOURCE_BYTES}')
    digest = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f'PBF SHA-256 mismatch: {digest}')
    return digest


def build(args):
    import osmium
    root = Path(args.root).resolve()
    cache_dir = Path(args.cache_dir).resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    pbf = Path(args.pbf).resolve() if args.pbf else cache_dir / 'ontario-261014.osm.pbf'
    if args.download and not pbf.exists():
        log('Downloading the dated Geofabrik Ontario snapshot')
        urllib.request.urlretrieve(SOURCE_URL, pbf)
    log('Verifying the official snapshot SHA-256')
    digest = verify_source(pbf)
    configs = extract_config(root, args.bases_json)
    if args.cities:
        requested = set(args.cities.split(','))
        configs = {key: value for key, value in configs.items() if key in requested}
    if not configs:
        raise ValueError('No cities selected')
    db_path = cache_dir / 'route-ways.sqlite'
    if not args.resume:
        db_path.unlink(missing_ok=True)
    db = sqlite3.connect(db_path)
    db.execute('CREATE TABLE IF NOT EXISTS ways (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)')
    metadata_path = cache_dir / 'extraction-metadata.json'
    if args.resume:
        metadata = json.loads(metadata_path.read_text())
        if metadata['sourceSha256'] != digest or metadata['configs'] != configs:
            raise ValueError('Resume cache does not match source/configuration; rebuild without --resume')
        city_ways = {city: set(ids) for city, ids in metadata['cityWays'].items()}
        restrictions = metadata['restrictions']
        controls = {int(key): value for key, value in metadata['controls'].items()}
    else:
        city_ways = {city: set() for city in configs}
        restrictions = {city: [] for city in configs}
        controls = {}
        all_restrictions = []
        selected = set()
        pending = []
        class Extractor(osmium.SimpleHandler):
            def node(self, node):
                if not node.tags:
                    return
                tags = dict(node.tags)
                if not (set(tags) & CONTROL_KEYS):
                    return
                # Every tagged candidate control keeps all its original tags.
                controls[int(node.id)] = tags
            def way(self, way):
                tags = dict(way.tags)
                if tags.get('highway') not in HIGHWAYS:
                    return
                refs = list(way.nodes)
                if len(refs) < 2 or any(not node.location.valid() for node in refs):
                    return
                coords = [[round(node.location.lon, 7), round(node.location.lat, 7)] for node in refs]
                matches = [city for city, config in configs.items() if intersects(coords, config['bufferedBounds']) and way_admission(tags, coords, config['bases'])]
                if not matches:
                    return
                way_id = int(way.id)
                selected.add(way_id)
                for city in matches:
                    city_ways[city].add(way_id)
                pending.append((way_id, zlib.compress(compact({'id': way_id, 'tags': tags, 'nodeIds': [int(node.ref) for node in refs], 'coords': coords}).encode(), 1)))
                if len(pending) >= 2000:
                    db.executemany('INSERT OR REPLACE INTO ways VALUES (?, ?)', pending)
                    pending.clear()
            def relation(self, relation):
                parsed = parse_restriction(relation)
                if parsed:
                    all_restrictions.extend(parsed)
        index_path = cache_dir / 'node-locations.idx'
        index_path.unlink(missing_ok=True)
        index = osmium.index.create_map(f'sparse_file_array,{index_path}')
        locations = osmium.NodeLocationsForWays(index)
        locations.ignore_errors()
        handler = Extractor()
        log('Scanning nodes/ways with native NodeLocationsForWays + sparse_file_array')
        reader = osmium.io.Reader(str(pbf))
        osmium.apply(reader, locations, osmium.filter.KeyFilter(*sorted(CONTROL_KEYS | {'restriction', 'restriction:conditional', 'type'})), handler)
        reader.close()
        if pending:
            db.executemany('INSERT OR REPLACE INTO ways VALUES (?, ?)', pending)
            pending.clear()
        db.commit()
        # Closure is per city and transitive across restrictions touching a newly
        # included member. This retains complete via-way chains at the boundary.
        for city, ids in city_ways.items():
            changed = True
            chosen = set()
            while changed:
                changed = False
                for ordinal, restriction in enumerate(all_restrictions):
                    members = {restriction['fromWayId'], restriction['toWayId'], *restriction.get('viaWayIds', [])}
                    if ordinal not in chosen and members & ids:
                        chosen.add(ordinal)
                        ids.update(members)
                        changed = True
            restrictions[city] = [all_restrictions[i] for i in sorted(chosen)]
        missing = set().union(*city_ways.values()) - selected
        log(f'Initial selected ways: {len(selected):,}; restriction closure needs {len(missing):,} additional ways')
        if missing:
            class Complete(osmium.SimpleHandler):
                def way(self, way):
                    if int(way.id) not in missing:
                        return
                    refs = list(way.nodes)
                    if len(refs) < 2 or any(not node.location.valid() for node in refs):
                        return
                    payload = {'id': int(way.id), 'tags': dict(way.tags), 'nodeIds': [int(node.ref) for node in refs], 'coords': [[round(node.location.lon, 7), round(node.location.lat, 7)] for node in refs]}
                    pending.append((int(way.id), zlib.compress(compact(payload).encode(), 1)))
                    missing.discard(int(way.id))
            reader = osmium.io.Reader(str(pbf), osmium.osm.WAY)
            osmium.apply(reader, locations, Complete())
            reader.close()
            if pending:
                db.executemany('INSERT OR REPLACE INTO ways VALUES (?, ?)', pending)
                pending.clear()
            db.commit()
        if missing:
            raise ValueError(f'Missing restriction member ways: {sorted(missing)[:20]}')
        metadata = {'sourceSha256': digest, 'configs': configs, 'cityWays': {city: sorted(ids) for city, ids in city_ways.items()}, 'restrictions': restrictions, 'controls': controls}
        metadata_path.write_text(compact(metadata))
        del index, locations
    report = {'graphVersion': GRAPH_VERSION, 'sourceUrl': SOURCE_URL, 'sourceBytes': SOURCE_BYTES, 'sourceSha256': digest, 'snapshot': SNAPSHOT, 'bufferMetres': 8000, 'simplificationMetres': 1.9, 'cities': {}}
    priority = {'peterborough': 0, 'oshawa': 1, 'belleville': 2, 'scarborough': 3}
    for city, ids in sorted(city_ways.items(), key=lambda item: (priority.get(item[0], 10), item[0])):
        log(f'Building {city}: {len(ids):,} complete source ways')
        ways = [json.loads(zlib.decompress(db.execute('SELECT payload FROM ways WHERE id=?', (way_id,)).fetchone()[0])) for way_id in sorted(ids)]
        counts = Counter(node_id for way in ways for node_id in way['nodeIds'])
        city_controls = {node_id: tags for node_id, tags in controls.items() if node_id in counts}
        protected = {node_id for node_id, count in counts.items() if count > 1} | set(city_controls)
        for restriction in restrictions[city]:
            if 'viaNodeId' in restriction:
                protected.add(restriction['viaNodeId'])
            protected.update(restriction.get('viaNodeIds', []))
            for via_id in restriction.get('viaWayIds', []):
                # All via-way nodes are retained, making ordered restriction traversal explicit.
                protected.update(node_id for way in ways if way['id'] == via_id for node_id in way['nodeIds'])
        features = []
        raw_nodes = 0
        for way in ways:
            raw_nodes += len(way['nodeIds'])
            node_ids, coords = simplify(way['nodeIds'], way['coords'], protected)
            properties = {**way['tags'], 'osm_id': way['id'], 'nodeIds': node_ids}
            if 'driveway' in tokens(way['tags'].get('service')):
                properties['routeAccess'] = 'base-only'
                if not near_base(way['coords'], configs[city]['bases']):
                    properties['restrictionMemberOnly'] = True
            emergency = island_emergency_access(way['tags'], way['coords'])
            if emergency:
                properties['emergencyAccess'] = emergency
            features.append({'type': 'Feature', 'properties': properties, 'geometry': {'type': 'LineString', 'coordinates': coords}})
        payload = {'type': 'FeatureCollection', 'schemaVersion': 1, 'cityId': city, 'graphVersion': GRAPH_VERSION,
                   'source': {'url': SOURCE_URL, 'snapshot': SNAPSHOT, 'sha256': digest, 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/'},
                   'bounds': configs[city]['bounds'], 'bufferMetres': 8000, 'simplificationMetres': 1.9,
                   'features': features, 'controls': city_controls, 'turnRestrictions': restrictions[city]}
        network_dir = cache_dir / 'networks'
        network_dir.mkdir(exist_ok=True)
        (network_dir / f'{city}.json').write_text(compact(payload))
        asset_bytes = write_asset(root / 'cities' / city / 'route-network.js', payload)
        result = {'ways': len(features), 'rawNodeReferences': raw_nodes, 'nodeReferences': sum(len(f['properties']['nodeIds']) for f in features), 'uniqueNodes': len({node_id for feature in features for node_id in feature['properties']['nodeIds']}), 'controls': len(city_controls), 'turnRestrictions': len(restrictions[city]), 'assetBytes': asset_bytes, 'uncompressedBytes': len(compact(payload).encode()), 'islandPolicyWays': sum('emergencyAccess' in f['properties'] for f in features), 'activeBaseSeeds': len(configs[city]['bases'])}
        report['cities'][city] = result
        log(f'{city}: {result["uniqueNodes"]:,} nodes; {asset_bytes:,} JS bytes; {result["turnRestrictions"]:,} restrictions')
    db.close()
    (cache_dir / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
    report_path = root / 'docs' / 'research' / 'route-network-build-report.md'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    rows = ['# Route network build report', '', f'Snapshot: {SNAPSHOT}; graph: `{GRAPH_VERSION}`.', '', '| City | Ways | Unique nodes | Node references | JS bytes | Controls | Restrictions |', '|---|---:|---:|---:|---:|---:|---:|']
    rows.extend(f'| {city} | {value["ways"]} | {value["uniqueNodes"]} | {value["nodeReferences"]} | {value["assetBytes"]} | {value["controls"]} | {value["turnRestrictions"]} |' for city, value in report['cities'].items())
    report_path.write_text('\n'.join(rows) + '\n')
    log(f'Completed {len(report["cities"])} city packs')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default=str(ROOT))
    parser.add_argument('--cache-dir', default=str(ROOT / 'outputs' / 'ontario-route-source'))
    parser.add_argument('--pbf')
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Reuse verified extraction cache; config must match')
    parser.add_argument('--cities', help='Comma-separated city IDs; default all city packages')
    parser.add_argument('--bases-json', help='City ID → active base coordinate list, superseding package fallbacks')
    args = parser.parse_args()
    build(args)


if __name__ == '__main__':
    main()
