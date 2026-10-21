"""Rebuild small facade JPEGs from owner footage. Requires Pillow + NumPy; never edits originals."""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance
parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=Path, required=True, help='Directory containing ordered left/right folders')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
out = root / 'city-explorer/assets/sherbrooke-frontages'
config = json.loads((out/'recipes.json').read_text(encoding='utf-8'))
records=[]
for recipe in config['recipes']:
    side = '01 - Left side - ordered' if 'LEFT' in recipe['frame'] else '02 - Right side - ordered'
    source = args.frames/side/recipe['frame']
    original = Image.open(source).convert('RGB')
    w,h = recipe['size']; rows=[]; rhs=[]
    for (x,y),(u,v) in zip([(0,0),(w,0),(w,h),(0,h)],recipe['quad']):
        rows.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        rhs.extend([u,v])
    coeff = np.linalg.solve(np.array(rows),np.array(rhs))
    image = original.transform((w,h),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
    image = ImageEnhance.Brightness(image).enhance(recipe['brightness'])
    target=out/(recipe['label'].lower()+'.jpg')
    image.save(target,quality=87,optimize=True,progressive=True,subsampling=0)
    records.append({**recipe,'file':target.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,
        'sourceSize':list(original.size),'method':'single-plane perspective rectification and bounded brightness adjustment; no generative fill',
        'provenance':'User-owned footage; geometry and crop review, not surveyed dimensions'})
manifest={'schemaVersion':1,'records':records,'totalBytes':sum(r['bytes'] for r in records),
    'decodedTextureBytesWithMipmaps':sum(r['size'][0]*r['size'][1]*4*4//3 for r in records)}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'textures':len(records),'bytes':manifest['totalBytes'],'textureMemoryBytes':manifest['decodedTextureBytesWithMipmaps']}))
