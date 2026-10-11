#!/usr/bin/env python3
"""Plot actual exported Float32 historical meshes; no basemap or image source."""
import argparse,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
p=argparse.ArgumentParser();p.add_argument('geometry');p.add_argument('output');a=p.parse_args()
d=json.load(open(a.geometry));fig,axs=plt.subplots(1,2,figsize=(9,7))
for ax,(id,name) in zip(axs,[('way/250810393:0','Medical Drive'),('way/250811912:0','Hospital Drive')]):
 triangles=[]
 for r in d['paint']:
  if r['id']!=id:continue
  v=r['positions']
  triangles.extend([[(v[i+j],-v[i+j+2]) for j in (0,3,6)] for i in range(0,len(v),9)])
 origin=[min(p[0] for t in triangles for p in t),min(p[1] for t in triangles for p in t)]
 local=[[(x-origin[0],y-origin[1]) for x,y in t] for t in triangles]
 ax.add_collection(PolyCollection(local,facecolors='#b98200',edgecolors='none'));ax.autoscale();ax.set_aspect('equal');ax.set_title(name);ax.set_xlabel('Local east (m)');ax.set_ylabel('Local north (m)');ax.grid(alpha=.15)
fig.suptitle(('Low-power' if d['lowPower'] else 'Desktop')+' actual production-order historical meshes\nFinal Float32 coordinates; no imagery; microscopic seam patches not visible at this scale')
fig.tight_layout();fig.savefig(a.output,dpi=160)
