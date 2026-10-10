#!/usr/bin/env python3
"""Independent lane attributes plus small, licensed imagery review areas."""
import json
import math
import urllib.parse
import urllib.request
from collect_street_evidence import OUT, request, write


def city_lanes():
    url = 'https://citymaps.peterborough.ca/arcgis/rest/services/Hosted/SidewalkStrategicPlan_Public/FeatureServer/15'
    # This service is explicitly city-local. Its spatial-filter request returned
    # zero IDs; inspect the complete local dataset instead of guessing empty coverage.
    data = request(url + '/query', {'f': 'json', 'where': '1=1', 'returnIdsOnly': 'true'})
    write('city-lanes-id-response.json', data)
    ids = sorted(set(data.get('objectIds') or []))
    if not ids or len(ids) > 15000:
        raise RuntimeError('City-local lane inventory returned ' + str(len(ids)) + ' IDs')
    features = []
    for i in range(0, len(ids), 250):
        page = request(url + '/query', {'f': 'geojson', 'objectIds': ','.join(map(str, ids[i:i + 250])),
                'outFields': '*', 'outSR': 4326, 'returnGeometry': 'true'})
        if page.get('exceededTransferLimit'):
            raise RuntimeError('Truncated municipal lane page')
        features.extend(page.get('features') or [])
    if len(features) != len(ids):
        raise RuntimeError('Incomplete municipal lane export')
    write('city-road-lanes.geojson', {'type': 'FeatureCollection', 'metadata': {
        'source_url': url, 'kind': 'sidewalk-strategic-plan-road-inventory', 'observation_date': None,
        'note': 'Planning inventory is a comparison source, not verified current lane paint.'}, 'features': features})
    return {'features': len(features)}


def orn_lanes():
    from pathlib import Path
    road_data = json.loads(Path('city-explorer/data/orn-roads.geojson').read_text())
    ids = sorted({int(f['properties']['OGF_ID']) for f in road_data['features']})
    url = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/6'
    metadata = request(url, {'f': 'json'})
    write('orn-lane-records.metadata.json', metadata)
    fields = [f['name'] for f in metadata.get('fields', [])]
    field = next(f for f in fields if 'ROAD_NET_ELEMENT' in f.upper())
    oid = metadata.get('objectIdField') or 'OBJECTID'
    records = []
    for start in range(0, len(ids), 120):
        where = field + ' IN (' + ','.join(map(str, ids[start:start + 120])) + ')'
        record_ids = request(url + '/query', {'f': 'json', 'where': where, 'returnIdsOnly': 'true'})
        write('orn-lane-id-page-' + str(start) + '.json', record_ids)
        chunk_ids = sorted(set(record_ids.get('objectIds') or []))
        for i in range(0, len(chunk_ids), 300):
            chunk = chunk_ids[i:i + 300]
            payload = request(url + '/query', {'f': 'json', 'objectIds': ','.join(map(str, chunk)),
                'outFields': '*', 'returnGeometry': 'false'})
            rows = [f['attributes'] for f in payload.get('features') or []]
            if len(rows) != len(chunk) or payload.get('exceededTransferLimit'):
                raise RuntimeError('Incomplete ORN lane attribute page')
            records.extend(rows)
    write('orn-lane-records.json', {'source_url': url, 'foreign_key': field, 'road_ids_requested': len(ids), 'records': records})
    return {'requested_roads': len(ids), 'lane_records': len(records), 'fields': fields}


def imagery():
    url = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer'
    sites = [
        ('sherbrooke-station', 44.30074, -78.3221),
        ('george-downtown', 44.3027, -78.3191),
        ('water-downtown', 44.3040, -78.3175),
        ('lansdowne', 44.2890, -78.3390),
        ('parkhill', 44.3145, -78.3380),
        ('residential-rubidge', 44.3032, -78.3260),
        ('chemong', 44.3250, -78.3334),
        ('ashburnham', 44.2960, -78.3037),
    ]
    results = []
    for name, lat, lon in sites:
        dx = 100 / (111320 * math.cos(math.radians(lat)))
        dy = 75 / 110540
        bbox = [lon - dx, lat - dy, lon + dx, lat + dy]
        params = {'f': 'image', 'bbox': ','.join(map(str, bbox)), 'bboxSR': 4326,
                  'imageSR': 3857, 'size': '1024,768', 'format': 'jpg'}
        target_url = url + '/export?' + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(target_url, timeout=45) as response:
                content = response.read()
            if not content.startswith(b'\xff\xd8'):
                raise ValueError('Server did not return a JPEG')
            (OUT / (name + '.jpg')).write_bytes(content)
            results.append({'id': name, 'lat': lat, 'lon': lon, 'bbox': bbox, 'source_url': target_url,
                'licence': 'Open Government Licence - Ontario', 'capture_date': None,
                'note': 'Reference-only; service imagery vintage must be checked. Not a full city visual inspection.'})
        except Exception as error:
            results.append({'id': name, 'error': str(error)})
    write('imagery-sources.json', results)
    return results


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    results = {}
    for name, routine in [('city-lanes', city_lanes), ('orn-lane-records', orn_lanes), ('imagery', imagery)]:
        try:
            results[name] = routine()
        except Exception as error:
            results[name] = {'error': str(error)}
        print(name, json.dumps(results[name]), flush=True)
    write('lane-collection-report.json', results)
