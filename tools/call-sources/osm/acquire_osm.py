#!/usr/bin/env python3
"""Reproduce civic source acquisition from one cached Geofabrik Ontario PBF.
No runtime web/geocoding dependency. Download occurs only with explicit --download when cache is missing.
"""
import argparse,datetime,json,subprocess,sys,urllib.request
from pathlib import Path
SCRIPT=Path(__file__).resolve().parent
SOURCE_URL='https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf'
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--repo',type=Path,required=True)
p.add_argument('--cache',type=Path,required=True)
p.add_argument('--pbf',type=Path)
p.add_argument('--download',action='store_true',help='Download Ontario PBF only if the requested cache file does not exist')
p.add_argument('--steps',nargs='+',choices=['extract','normalize','entrances','major-roads','validate'],default=['extract','normalize','entrances','major-roads','validate'])
a=p.parse_args();repo=a.repo.resolve();cache=a.cache.resolve();pbf=(a.pbf or cache/'raw/ontario-latest.osm.pbf').resolve()
if not (repo/'cities/city-registry.js').is_file():p.error('--repo must identify the game repository root')
(cache/'raw').mkdir(parents=True,exist_ok=True);(cache/'bundles').mkdir(exist_ok=True)
if a.download and not pbf.exists():
 pbf.parent.mkdir(parents=True,exist_ok=True);temp=pbf.with_suffix(pbf.suffix+'.part')
 request=urllib.request.Request(SOURCE_URL,headers={'User-Agent':'PeterboroughMapGame-OfflineSourceAcquisition/1.0 (https://github.com/edmondsonedits/Peterborough-Map-Game)'})
 with urllib.request.urlopen(request,timeout=120) as response,temp.open('wb') as out:
  expected=int(response.headers.get('Content-Length','0'));headers=dict(response.headers)
  while chunk:=response.read(8*1024*1024):out.write(chunk)
 if expected and temp.stat().st_size!=expected:raise RuntimeError('Incomplete source download; .part retained for diagnosis')
 temp.replace(pbf)
 (cache/'raw/download-metadata.json').write_text(json.dumps({'sourceUrl':SOURCE_URL,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bytes':pbf.stat().st_size,'headers':headers},indent=2))
 print(f'Downloaded source PBF: {pbf}',flush=True)
needs_pbf=any(x in a.steps for x in ['extract','entrances'])
if needs_pbf and not pbf.is_file():p.error('Cached PBF is missing. Supply --pbf or explicitly use --download; no download was attempted.')
common=['--repo',str(repo),'--cache',str(cache)]
def run(script,*extra):
 command=[sys.executable,str(SCRIPT/script),*common,*extra]
 print('Running '+script,flush=True);subprocess.run(command,check=True)
for step in a.steps:
 if step=='extract':run('extract_osm.py','--pbf',str(pbf))
 elif step=='normalize':run('normalize_bundles.py')
 elif step=='entrances':
  run('extract_entrances.py','--pbf',str(pbf));run('enrich_entrances.py')
 elif step=='major-roads':run('major_road_supplements.py')
 elif step=='validate':
  run('validate_bundles.py')
  if list((cache/'bundles').glob('*.major-road-candidates.json')):
   run('validate_bundles.py','--pattern','*.major-road-candidates.json','--report','major-road-validation.json')
