"""Record the exact CC0 input data used by the v2 builder."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];vendor=root/'assets-source/firefighter-v2/vendor'
paths=['base.obj','LICENSE.md','LICENSE.ASSETS.md','caucasian-male-young.target','universal-male-young-averagemuscle-averageweight.target','universal-male-young-maxmuscle-averageweight.target','head-square.target','head-scale-vert-decr.target','skins/young_caucasian_male2/young_lightskinned_male_diffuse2.png','skins/young_caucasian_male2/young_caucasian_male2.mhmat','hair/short04/short04.obj','hair/short04/short04.mhclo','hair/short04/short04.mhmat','hair/short04/short04_diffuse.png','eyebrows/eyebrow001/eyebrow001.obj','eyebrows/eyebrow001/eyebrow001.mhclo','eyebrows/eyebrow001/eyebrow001.mhmat','eyebrows/eyebrow001/eyebrow001.png','eyes/high-poly/high-poly.obj','eyes/high-poly/high-poly.mhclo','eyes/materials/bluegreen_eye.png','eyes/materials/bluegreen.mhmat']
record={'license':'CC0-1.0','project':'MakeHuman Community graphical assets','licenseURL':'https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md','assetPackURL':'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip','assetPackSHA256':hashlib.sha256((vendor/'system-assets.zip').read_bytes()).hexdigest(),'files':[]}
for path in paths:
 if path.startswith(('skins/','hair/','eyebrows/','eyes/')):url=record['assetPackURL'];archivePath=path
 else:
  archivePath=None
  remote=path if path.startswith('LICENSE') else ('makehuman/data/3dobjs/base.obj' if path=='base.obj' else 'makehuman/data/targets/'+('head/' if path.startswith('head-') else 'macrodetails/')+path)
  url='https://raw.githubusercontent.com/makehumancommunity/makehuman/master/'+remote
 data=(vendor/path).read_bytes();record['files'].append({'path':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'url':url,'archivePath':archivePath})
out=root/'city-explorer/assets/characters/licenses/provenance.json';out.write_text(json.dumps(record,indent=2))
print('Recorded',len(paths),'source assets; CC0 graphical data only')
