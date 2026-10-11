"""One-time merge resolution for the exact conflicts inspected in CI logs."""
import re, subprocess
from pathlib import Path
result = subprocess.run(['git','merge','--no-commit','--no-ff','origin/main'])
if result.returncode:
    conflicts = subprocess.check_output(['git','diff','--name-only','--diff-filter=U'],text=True).splitlines()
    allowed = {'city-explorer/app.js','city-explorer/index.html','city-explorer/road-orientation-fix.js'}
    if not conflicts or not set(conflicts) <= allowed:
        subprocess.run(['git','diff','--cc'])
        raise RuntimeError('Unreviewed merge conflicts: '+repr(conflicts))
    for name in conflicts:
        if name == 'city-explorer/app.js':
            p=Path(name);source=p.read_text()
            pattern=r'^<<<<<<< HEAD\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> origin/main\n'
            found=list(re.finditer(pattern,source,re.M))
            if len(found)!=1: raise RuntimeError('Unexpected number of app conflicts')
            ours,theirs=found[0].group(1).strip().splitlines(),found[0].group(2).strip().splitlines()
            helper="import { reviewedPaintTags, drapePaintStrip } from './street-paint.js?v=street-evidence-1';"
            prefix="import { OfficialDrivableSurfaceIndex, RenderedPavementIndex, officialSurfaceStatusActive, officialBridgeIsVehicular } from './official-road-surfaces.js?v="
            if len(ours)!=2 or ours[0]!=helper or not ours[1].startswith(prefix) or len(theirs)!=1 or not theirs[0].startswith(prefix):
                raise RuntimeError('App conflict differs from reviewed import-only conflict')
            source=source[:found[0].start()]+helper+'\n'+theirs[0]+'\n'+source[found[0].end():]
            if '<<<<<<<' in source or '>>>>>>>' in source: raise RuntimeError('Unresolved app conflict')
            p.write_text(source)
        else:
            subprocess.run(['git','checkout','--theirs','--',name],check=True)
        subprocess.run(['git','add',name],check=True)
