"""Build city road extracts and sourced EMS care-home catalogs.

Run with PyOsmium 4.3.1. Inputs: reviewed city descriptors, Ontario PBF,
and Ontario MOHSERLO Long-Term Care Home GeoJSON. Source files stay external.
"""
import argparse
import gzip
import hashlib
import json
import re
from pathlib import Path

ROAD_TYPES = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link',
              'secondary','secondary_link','tertiary','tertiary_link','unclassified',
              'residential','living_street','service','road'}
COMMUNITIES = {
    'clarington': {'bowmanville','courtice','newcastle','orono'},
    'chatham-kent': {'chatham','wallaceburg','blenheim','ridgetown','dresden','tilbury','bothwell','thamesville'},
    'greater-sudbury': {'sudbury','val caron','chelmsford','lively','capreol'},
    'vaughan': {'maple','woodbridge','kleinburg'},
    'markham': {'unionville'}, 'belleville': {'cannifton'},
    'ottawa': {'nepean','kanata','gloucester','stittsville','vanier','metcalfe','sarsfield'},
    'hamilton': {'dundas','ancaster','stoney creek','waterdown'},
    'toronto': {'scarborough','north york','etobicoke','east york','york'},
}
MOH_URL='https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/26'

def drivable(tags):
    access = next((tags[k] for k in ('motor_vehicle','vehicle','access') if k in tags), 'yes')
    return tags.get('highway') in ROAD_TYPES and access not in {'no','private','agricultural','forestry'} and tags.get('area') != 'yes'

def in_bounds(point, bounds, pad=0):
    lng, lat = point
    return bounds[0][0]-pad <= lat <= bounds[1][0]+pad and bounds[0][1]-pad <= lng <= bounds[1][1]+pad

def belongs(feature, city):
    normalize=lambda value: re.sub(r'[^a-z0-9]+','',value.lower())
    allowed = {normalize(value) for value in {city['name']} | COMMUNITIES.get(city['id'], set())}
    return normalize(feature['properties']['COMMUNITY']) in allowed and in_bounds(feature['geometry']['coordinates'],city['bounds'])

def main():
    import osmium
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cities',type=Path,required=True)
    parser.add_argument('--pbf',type=Path,required=True)
    parser.add_argument('--homes',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--only',help='Optional comma-separated city IDs')
    args=parser.parse_args()
    cities=json.loads(args.cities.read_text(encoding='utf-8'))
    if args.only: cities=[city for city in cities if city['id'] in args.only.split(',')]
    homes=json.loads(args.homes.read_text(encoding='utf-8'))['features']
    header=osmium.io.Reader(str(args.pbf)); timestamp=header.header().get('osmosis_replication_timestamp'); header.close()
    digest=hashlib.file_digest(args.pbf.open('rb'),'sha256').hexdigest()
    road_cities=[city for city in cities if city['id']!='peterborough']
    roads={city['id']:[] for city in road_cities}
    props=('highway','name','ref','oneway','junction','bridge','layer','access','vehicle','motor_vehicle','maxspeed')
    class Extract(osmium.SimpleHandler):
        def way(self, way):
            tags=dict(way.tags)
            if not drivable(tags): return
            coords=[[node.lon,node.lat] for node in way.nodes if node.location.valid()]
            if len(coords)!=len(way.nodes) or len(coords)<2: return
            minx=min(p[0] for p in coords);maxx=max(p[0] for p in coords)
            miny=min(p[1] for p in coords);maxy=max(p[1] for p in coords)
            feature={'type':'Feature','id':'way/'+str(way.id),'properties':{k:tags[k] for k in props if k in tags},'geometry':{'type':'LineString','coordinates':coords}}
            for city in road_cities:
                (s,w),(n,e)=city['bounds'];pad=.025
                if maxx>=w-pad and minx<=e+pad and maxy>=s-pad and miny<=n+pad:
                    roads[city['id']].append(feature)
    if road_cities: Extract().apply_file(str(args.pbf),locations=True,idx='flex_mem')
    for city in cities:
        folder=args.output/city['id'];folder.mkdir(parents=True,exist_ok=True)
        care=[]
        for f in homes:
            if not belongs(f,city): continue
            p=f['properties'];lng,lat=f['geometry']['coordinates']
            care.append({'id':'moh-ltc-'+p['MOH_SERVICE_PROVIDER_IDENT'],'name':p['ENGLISH_NAME'],
                'addr':p['ADDRESS_LINE_1'],'lat':lat,'lng':lng,'radius':65,'facilityType':'long-term-care',
                'main':'Medical','sub':'Medical Assistance','recognitionDifficulty':'medium','custom':False,
                'incidentProfiles':{'fire':{'sub':'Structure Fire'},'ems':{'sub':'Medical Assistance'}},
                'sources':[MOH_URL+'?where=OGF_ID%3D'+str(p['OGF_ID'])],
                'providerId':p['MOH_SERVICE_PROVIDER_IDENT'],'community':p['COMMUNITY']})
        if not care: raise ValueError(city['id']+': no verified care homes')
        result={'schemaVersion':1,'id':city['id'],'name':city['name'],'careHomes':care,
            'careSource':{'url':MOH_URL,'dataset':'Ontario Ministry of Health Service Provider Locations','filter':"SERVICE_TYPE = 'Long-Term Care Home'",'retrievedAt':'2026-10-16','license':'Open Government Licence - Ontario','sha256':hashlib.file_digest(args.homes.open('rb'),'sha256').hexdigest()},
            'roadSource':{'url':'https://download.geofabrik.de/north-america/canada/ontario.html','timestamp':timestamp,'sha256':digest,'license':'ODbL-1.0','attribution':'OpenStreetMap contributors'},
            'bounds':city['bounds'],'center':city['center'],
            'roadsUrl':'city-explorer/data/osm-public-roads.geojson' if city['id']=='peterborough' else 'cities/'+city['id']+'/roads.geojson.gz'}
        if city['id']=='peterborough':
            result['roadSource']={'url':'https://www.openstreetmap.org/copyright',
                'metadataUrl':'city-explorer/data/manifest.json',
                'rawDataUrl':'city-explorer/data/peterborough-osm.json',
                'license':'ODbL-1.0','attribution':'OpenStreetMap contributors',
                'note':'Existing public-road extract maintained by the Peterborough geospatial workflow; source timestamp and query metadata accompany that asset.'}
        else:
            features=roads[city['id']]
            if not features:raise ValueError(city['id']+': empty roads')
            data=json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')).encode('utf-8')
            compressed=gzip.compress(data,mtime=0)
            (folder/'roads.geojson.gz').write_bytes(compressed)
            result['roadFeatureCount']=len(features)
            result['roadDataSha256']=hashlib.sha256(data).hexdigest()
        (folder/'training-data.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(city['id'],len(care),'homes',len(roads.get(city['id'],[])),'roads',flush=True)

if __name__=='__main__':main()
