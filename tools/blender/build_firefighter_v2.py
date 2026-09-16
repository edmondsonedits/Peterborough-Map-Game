"""Detailed second pass. Keeps v1 reproducible; replaces its primitive head and
adds continuous folded garments and portable PBR textures. Blender 5.2 LTS.
"""
import bpy, math, sys, numpy as np
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from firefighter_anatomy import add_anatomy
ROOT=HERE.parents[1];VENDOR=ROOT/'assets-source/firefighter-v2/vendor'
source=(HERE/'build_firefighter.py').read_text()
# The existing factory and limb pivots are retained; obsolete head is replaced.
start=source.index('# Bare head');end=source.index('for side,armname,legname',start)
source=source[:start]+source[end:]
source=source.replace("sphere('Rounded shoulder',(x,1.47,0),(.103,.092,.11),cloth)","pass")
source=source.replace("[(x,1.495,0,.102,.108)","[(x,1.535,0,.035,.04),(x,1.515,0,.072,.08),(x,1.475,0,.102,.108)")
source=source.replace("(.026,.032,.041)","(.043,.046,.051)")
source=source.replace('(0,1.54,0,.20,.12)', '(0,1.54,0,.20,.12),(0,1.567,0,.122,.095)')
source=source.replace('rx+=.007;rz+=.007','rx+=.016;rz+=.016')
source=source.replace("rod('Front harness',(x,1.5,-.127),(x*.95,1.13,-.17),.019,leather)","box('Front woven harness',(x,1.315,-.173),(.035,.37,.012),leather,.004)")
source=source.replace("sphere('Reinforced knee',(x,.478,-.097),(.08,.096,.022),leather)","box('Reinforced knee panel',(x,.478,-.104),(.15,.18,.016),leather,.024)")
source=source.replace("sphere('Boot upper',(x,.107,-.035),(.101,.096,.139),leather)","box('Boot upper',(x,.095,-.06),(.176,.13,.258),leather,.037)")
source=source.replace("sphere('Boot toe',(x,.083,-.159),(.101,.056,.075),leather)","box('Stitched toe cap',(x,.08,-.155),(.177,.09,.096),leather,.028)")
source=source.replace('(.207,.051,.306)','(.185,.045,.30)').replace('(.213,.022,.021)','(.19,.019,.021)')
# Add subdivisions and UVs to the actual garment surfaces, not to accessories.
needle=" # Rings: x,y,z centre and horizontal/depth radii. Gentle deterministic folds."
replacement="""
 global lastClothRings
 # Higher resolution cloth surface with irregular compression folds.
 if m==cloth:
  dense=[]
  for a,b in zip(rings,rings[1:]):
   steps=max(3,int(abs(a[1]-b[1])*170))
   for k in range(steps):
    t=k/steps;dense.append(tuple(a[j]*(1-t)+b[j]*t for j in range(5)))
  dense.append(rings[-1]);rings=dense;segments=48;lastClothRings=list(rings)
"""
source=source.replace(needle,replacement)
source=source.replace("a=i*math.tau/segments;f=1+fold*math.sin(i*2.7+j*1.8)","""a=i*math.tau/segments;f=1
   if m==cloth or 'tape' in n.lower() or 'band' in n.lower():
    # Low-amplitude broad fabric folds with localized elbow/knee compression.
    compression=math.exp(-((y-.49)/.09)**2)+math.exp(-((y-1.19)/.095)**2)
    f+=.009*math.sin(a*5+y*18)+.005*math.sin(a*10-y*21)
    f+=(.004+.035*compression)*math.sin(y*50+2*math.sin(a*2))
   elif fold:f+=fold*math.sin(i*2.7+j*1.8)""")
needle=" for f in mesh.polygons:f.use_smooth=len(f.vertices)==4"
replacement="""
 layer=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  poly.use_smooth=len(poly.vertices)==4
  ids=[mesh.loops[li].vertex_index for li in poly.loop_indices]
  seam_wrap=any(idx%segments==0 for idx in ids) and any(idx%segments==segments-1 for idx in ids)
  for li,idx in zip(poly.loop_indices,ids):
   u=(idx%segments)/segments
   if seam_wrap and u==0:u=1
   layer.data[li].uv=(u*2,rings[min(idx//segments,len(rings)-1)][1]*3)
"""
source=source.replace(needle,replacement)
# Material images are generated procedurally, so the browser gets the same
# fabric appearance as Blender rather than losing shader-only noise on export.
insert="""
def cloth_texture(material):
 size=512;yy,xx=np.mgrid[0:size,0:size];rng=np.random.default_rng(17)
 broad=(np.sin(xx*.039+np.cos(yy*.024))+np.sin(yy*.056+np.sin(xx*.037)))*.009
 weave=(np.sin(xx*math.pi/2)*np.sin(yy*math.pi/2))*.018
 noise=rng.normal(0,.017,(size,size));shade=np.clip(.48+broad+weave+noise,.27,.7)
 rgba=np.ones((size,size,4),dtype=np.float32)
 for k,c in enumerate([.055,.06,.07]):rgba[:,:,k]=shade*c
 texdir=ROOT/'assets-source/firefighter-v2/textures';texdir.mkdir(parents=True,exist_ok=True)
 def image(name,pixels):
  im=bpy.data.images.new(name,width=size,height=size);im.pixels.foreach_set(pixels.ravel());im.filepath_raw=str(texdir/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
 imagecolor=image('turnout-fabric-color',rgba)
 h=weave+noise*.18;dy,dx=np.gradient(h);normal=np.ones((size,size,4),dtype=np.float32);normal[:,:,0]=.5-dx*2;normal[:,:,1]=.5-dy*2;normal[:,:,2]=1
 normalmap=image('turnout-fabric-normal',normal);normalmap.colorspace_settings.name='Non-Color'
 nodes=material.node_tree.nodes;links=material.node_tree.links;p=nodes.get('Principled BSDF')
 tex=nodes.new('ShaderNodeTexImage');tex.image=imagecolor;links.new(tex.outputs['Color'],p.inputs['Base Color'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=normalmap;n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.55;links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],p.inputs['Normal'])
cloth_texture(cloth)
def band(n,x,y,z,rx,rz,h):
 profile=sorted(lastClothRings,key=lambda r:r[1])
 def fitted(height):
  for a,b in zip(profile,profile[1:]):
   if a[1]<=height<=b[1]:
    t=(height-a[1])/max(.000001,b[1]-a[1]);r=[a[i]*(1-t)+b[i]*t for i in range(5)];r[3]+=.001;r[4]+=.001;return tuple(r)
  return (x,height,z,rx,rz)
 loft(n,[fitted(y-h/2+i*h/6) for i in range(7)],yellow,48)
 stripe=[]
 for i in range(4):
  r=list(fitted(y-h*.13+i*h*.26/3));r[3]+=.0005;r[4]+=.0005;stripe.append(tuple(r))
 loft(n+' silver centre',stripe,reflect,48)
"""
source=source.replace('# A layered turnout coat',insert+'\n# A layered turnout coat')
details="""
# Double stitched seams, shaped flaps, boot welt, glove ribs and helmet rails.
active='Body'
for side in [-1,1]:
 for row in range(37):
  y=.94+row*.014
  box('Placket topstitch',(side*.028,y,-.172),(.003,.005,.002),seam,.001)
 for y in [.955,1.285]:
  for i in range(34):
   a=math.tau*i/34
   box('Reflective tape topstitch',(.241*math.cos(a),y,.169*math.sin(a)),(.003,.004,.003),seam,.001)
 # Hip coat patch pockets, folded flap, seam and metal closure.
 box('Coat cargo pocket',(side*.145,.982,-.155),(.13,.12,.025),cloth,.011)
 box('Coat pocket flap',(side*.145,1.025,-.174),(.141,.04,.013),cloth,.007)
 sphere('Pocket snap',(side*.145,1.026,-.182),(.005,.005,.002),metal,12,8)
for side,part in [(-1,'LeftArm'),(1,'RightArm')]:
 active=part;x=side*.352
 for f in range(4):
  for y in [.897,.881]:box('Glove finger reinforcement',(x+(f-1.5)*.025,y,-.085),(.019,.009,.012),seam,.003)
 for i in range(12):box('Glove seam',(x-.048+i*.008,.948,-.091),(.004,.003,.002),metal,.001)
for side,part in [(-1,'LeftLeg'),(1,'RightLeg')]:
 active=part;x=side*.113
 for i in range(15):
  y=.56+i*.015
  box('Cargo pocket stitching',(x+side*.115,y,-.068),(.004,.004,.004),seam,.001)
 for i in range(20):
  a=i*math.tau/20
  sphere('Boot welt stitch',(x+.099*math.cos(a),.05,-.06+.142*math.sin(a)),(.003,.002,.003),seam,8,6)
active='LeftArm'
for dx in [-.09,0,.09]:
 for i in range(12):
  a=-1.0+i*.15;b=a+.15
  rod('Helmet reinforced ridge',(hx+dx,hy+.127*math.cos(a),hz+.146*math.sin(a)),(hx+dx,hy+.127*math.cos(b),hz+.146*math.sin(b)),.003,metal)
"""
source=source.replace('# Combine each articulated part',details+'\n# Combine each articulated part')
source=source.replace("scene=bpy.context.scene;", "add_anatomy(VENDOR,bpy.data.objects['Body'])\nscene=bpy.context.scene;")
source=source.replace('bpy.ops.wm.save_as_mainfile(', 'bpy.ops.file.pack_all()\nbpy.ops.wm.save_as_mainfile(')
optimize="""
# The editable BLEND retains full-resolution geometry/textures. Only the GLB
# gets this browser reduction, after the editable source has been saved.
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH' and ('turnout_fabric' in obj.name or obj.name=='Anatomical head and neck'):
  bpy.context.view_layer.objects.active=obj
  mod=obj.modifiers.new('Browser mesh reduction','DECIMATE');mod.ratio=.48 if 'turnout' in obj.name else .7
  bpy.ops.object.modifier_apply(modifier=mod.name)
for im in bpy.data.images:
 if im.source!='VIEWER' and max(im.size)>1024:
  ratio=1024/max(im.size);im.scale(int(im.size[0]*ratio),int(im.size[1]*ratio));im.pack()
"""
source=source.replace('bpy.ops.export_scene.gltf(',optimize+'\nbpy.ops.export_scene.gltf(')
source=source.replace("'Original reference-inspired firefighter, generic markings, no image textures. Rigid shoulder/hip animation, not a facial or skeletal rig.'","'Detailed turnout firefighter with CC0 MakeHuman head/eyes/hair and skin; original folded uniform and accessories. Shoulder/hip gait. Source licenses retained.'")
source=source.replace("'Original Blender geometry using supplied image as visual reference only'","'Original turnout gear plus CC0 MakeHuman anatomical head, eyes, brows, hair and skin; user sheet is visual reference'")
source=source.replace("'Project-created geometry and generic markings, no third-party assets or photo pixels'","'Original gear; CC0 MakeHuman assets, license and provenance retained in assets-source/firefighter-v2/vendor'")
exec(compile(source,str(HERE/'build_firefighter.py'),'exec'),globals())
