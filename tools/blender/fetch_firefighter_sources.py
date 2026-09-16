"""Restore the exact CC0 inputs. Refuses changed data; does not execute it."""
import hashlib,json,urllib.request,zipfile,io
from pathlib import Path
root=Path(__file__).resolve().parents[2];manifest=json.loads((root/'city-explorer/assets/characters/licenses/provenance.json').read_text());vendor=(root/'assets-source/firefighter-v2/vendor').resolve();vendor.mkdir(parents=True,exist_ok=True);archive=None
for entry in manifest['files']:
 target=(vendor/entry['path']).resolve()
 if not target.is_relative_to(vendor):raise ValueError('Unsafe source path')
 if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256']:continue
 if entry['archivePath']:
  if archive is None:
   data=urllib.request.urlopen(manifest['assetPackURL'],timeout=120).read()
   if hashlib.sha256(data).hexdigest()!=manifest['assetPackSHA256']:raise ValueError('Asset pack changed; review new provenance before using')
   archive=zipfile.ZipFile(io.BytesIO(data))
  data=archive.read(entry['archivePath'])
 else:data=urllib.request.urlopen(entry['url'],timeout=30).read()
 if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Source changed: '+entry['path'])
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
print('Verified all CC0 firefighter source data')
