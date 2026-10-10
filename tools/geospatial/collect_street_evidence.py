#!/usr/bin/env python3
"""Read-only evidence collection. Never treats planning metadata as current paint surveys."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

OUT = Path('artifacts/street-evidence')
BBOX = '-78.405,44.245,-78.245,44.385'
SOURCES = {
    'city-road-lanes': 'https://citymaps.peterborough.ca/arcgis/rest/services/Hosted/SidewalkStrategicPlan_Public/FeatureServer/15',
    'city-boundary': 'https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/5',
    'city-cycle-routes': 'https://citymaps.peterborough.ca/arcgis/rest/services/eMaps2_0_Operational/MapServer/36',
    'orn-composite': 'https://services1.arcgis.com/TJH5KDher0W13Kgo/arcgis/rest/services/Ontario_Road_Network_Composite_Service_GeoHub_View_EN/FeatureServer/5',
}


def request(url, params=None):
    suffix = '?' + urllib.parse.urlencode(params) if params else ''
    last = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url + suffix, headers={'User-Agent': 'Peterborough-Map-Game/street-evidence-audit'})
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.load(response)
            if isinstance(data, dict) and data.get('error'):
                raise RuntimeError(str(data['error']))
            return data
        except Exception as error:
            last = error
            if attempt == 0:
                time.sleep(1)
    raise RuntimeError(f'{url}: {last}')


def write(name, value):
    target = OUT / name
    target.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return hashlib.sha256(target.read_bytes()).hexdigest()


def collect(name, url):
    metadata = request(url, {'f': 'json'})
    write(name + '.metadata.json', metadata)
    params = {'f': 'json', 'where': '1=1', 'geometry': BBOX, 'geometryType': 'esriGeometryEnvelope',
              'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'returnIdsOnly': 'true'}
    ids_payload = request(url + '/query', params)
    ids = sorted(set(ids_payload.get('objectIds') or []))
    if not ids or len(ids) > 30000:
        raise ValueError(f'{name}: unsafe or empty bounded count: {len(ids)}')
    oid = ids_payload.get('objectIdFieldName') or metadata.get('objectIdField') or 'OBJECTID'
    features = []
    seen = set()
    for start in range(0, len(ids), 250):
        chunk = ids[start:start + 250]
        data = request(url + '/query', {'f': 'geojson', 'objectIds': ','.join(map(str, chunk)),
                                      'outFields': '*', 'outSR': 4326, 'returnGeometry': 'true'})
        for feature in data.get('features') or []:
            prop = feature.get('properties') or {}
            ident = next((v for k, v in prop.items() if k.lower() == oid.lower()), feature.get('id'))
            if ident is None or ident in seen:
                raise ValueError(f'{name}: missing or duplicate identity {ident}')
            seen.add(ident)
            features.append(feature)
        if data.get('exceededTransferLimit'):
            raise ValueError(f'{name}: transfer limit returned a partial chunk')
    if set(map(str, ids)) != set(map(str, seen)):
        raise ValueError(f'{name}: incomplete: {len(seen)}/{len(ids)}')
    result = {'type': 'FeatureCollection', 'metadata': {'source_url': url, 'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'record_count': len(ids), 'source_editing_info': metadata.get('editingInfo'),
              'note': 'Source lane inventory; retrieval time does not establish observation date or pavement marking style.'}, 'features': features}
    digest = write(name + '.geojson', result)
    return {'status': 'complete', 'features': len(features), 'sha256': digest,
            'fields': [f.get('name') for f in metadata.get('fields') or []]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'bbox': BBOX, 'sources': {}}
    for name, url in SOURCES.items():
        try:
            report['sources'][name] = collect(name, url)
        except Exception as error:
            report['sources'][name] = {'status': 'unavailable', 'error': str(error)}
        print(name, json.dumps(report['sources'][name]), flush=True)
    for name, url in {
        'ontario-orthophoto-service': 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer',
        'city-curb-schema': 'https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/8',
    }.items():
        try:
            result = request(url, {'f': 'json'})
            write(name + '.json', result)
            report['sources'][name] = {'status': 'metadata-only', 'layers': result.get('layers'),
                                       'fields': [f.get('name') for f in result.get('fields') or []]}
        except Exception as error:
            report['sources'][name] = {'status': 'unavailable', 'error': str(error)}
    write('collection-report.json', report)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
