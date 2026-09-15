"""Original reference-inspired turnout firefighter, Blender 5.2 LTS.
Metres; Blender Z up/+Y forward; GLB Y up/-Z forward. Rigid limb pivots
preserve the simulator's existing gait. No photo pixels are embedded.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'city-explorer/assets/characters';SOURCE=ROOT/'assets-source/characters'
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,c,rough=.8,metal=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
cloth=mat('Charcoal turnout fabric',(.026,.032,.041));seam=mat('Stitched edges',(.065,.069,.07))
yellow=mat('Safety yellow',(.72,.64,.018),.52);reflect=mat('Silver reflective tape',(.5,.56,.54),.38,.3)
leather=mat('Black gloves boots and harness',(.012,.014,.016),.65);metal=mat('Equipment metal',(.36,.39,.4),.28,.72)
skin=mat('Warm skin',(.49,.28,.19),.65);lip=mat('Lips',(.27,.105,.08));hair=mat('Brown hair',(.035,.017,.009))
eye=mat('Eye white',(.59,.59,.53),.3);iris=mat('Hazel eyes',(.048,.055,.035),.25);pupil=mat('Pupils',(.004,.005,.006),.2)
parts={k:[] for k in ['Body','LeftArm','RightArm','LeftLeg','RightLeg']};active='Body'
def xyz(p):return (p[0],-p[2],p[1])
def finish(o,n,m):o.name=n;o.data.materials.append(m);parts[active].append(o);return o
def sphere(n,p,s,m,segments=20,rings=12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return finish(o,n,m)
def box(n,p,s,m,b=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if b:
  mod=o.modifiers.new('Soft edge','BEVEL');mod.width=b;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,n,m)
def rod(n,a,b,r,m):
 a,b=Vector(xyz(a)),Vector(xyz(b));d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return finish(o,n,m)
def loft(n,rings,m,segments=24,fold=0):
 # Rings: x,y,z centre and horizontal/depth radii. Gentle deterministic folds.
 v=[]
 for j,(x,y,z,rx,rz) in enumerate(rings):
  for i in range(segments):
   a=i*math.tau/segments;f=1+fold*math.sin(i*2.7+j*1.8)
   v.append(xyz((x+rx*math.cos(a)*f,y,z+rz*math.sin(a)*f)))
 faces=[]
 for j in range(len(rings)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 if 'tape' not in n.lower() and 'band' not in n.lower():
  faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))])
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(v,[],[tuple(reversed(f)) for f in faces]);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 for f in mesh.polygons:f.use_smooth=len(f.vertices)==4
 return finish(o,n,m)
def label(n,body,p,size,back=False):
 bpy.ops.object.text_add(location=xyz(p));o=bpy.context.object;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size;o.data.extrude=.0004
 normal=Vector((0,-1 if back else 1,0));up=Vector((0,0,1));o.rotation_euler=Matrix((up.cross(normal),up,normal)).transposed().to_euler();bpy.ops.object.convert(target='MESH');return finish(bpy.context.object,n,reflect)
def band(n,x,y,z,rx,rz,h):
 rx+=.007;rz+=.007
 loft(n,[(x,y-h/2,z,rx,rz),(x,y+h/2,z,rx,rz)],yellow)
 loft(n+' silver centre',[(x,y-h*.13,z,rx+.001,rz+.001),(x,y+h*.13,z,rx+.001,rz+.001)],reflect)

# A layered turnout coat with a raised collar, front placket and sewn pockets.
loft('Coat',[(0,.84,0,.225,.143),(0,.95,0,.222,.15),(0,1.13,0,.208,.143),(0,1.3,0,.233,.15),(0,1.46,0,.257,.143),(0,1.54,0,.20,.12)],cloth,fold=.014)
band('Lower coat reflective band',0,.9,0,.228,.154,.068)
band('Chest reflective band',0,1.25,0,.235,.156,.065)
loft('High collar',[(0,1.51,0,.124,.103),(0,1.59,0,.109,.094)],cloth)
box('Front coat placket',(0,1.23,-.16),(.045,.5,.017),cloth)
for y in [.99,1.11,1.35,1.45]:sphere('Coat snap',(0,y,-.172),(.009,.009,.004),metal,12,8)
box('Duty belt',(0,1.035,-.158),(.43,.053,.029),leather)
box('Back belt',(0,1.035,.149),(.42,.055,.026),leather)
box('Belt buckle',(0,1.035,-.178),(.063,.059,.012),metal)
box('Buckle inset',(0,1.035,-.185),(.043,.037,.008),leather)
for x in [-.135,.135]:
 box('Chest pocket',(x,1.375,-.145),(.105,.13,.035),cloth)
 box('Pocket flap',(x,1.427,-.168),(.113,.035,.013),seam)
 rod('Front harness',(x,1.5,-.127),(x*.95,1.13,-.17),.019,leather)
 rod('Rear harness',(x,1.5,.117),(x*.95,1.34,.154),.019,leather)
 box('Harness adjuster',(x,1.43,-.158),(.048,.045,.012),metal)
box('Back identity patch',(0,1.397,.15),(.275,.18,.017),leather)
label('Generic back fire','FIRE',(0,1.439,.162),.065,True);label('Generic back rescue','RESCUE',(0,1.374,.162),.055,True)
box('Radio microphone',(-.145,1.418,-.195),(.064,.083,.036),leather)
for y in range(5):box('Microphone grille',(-.145,1.393+y*.011,-.216),(.046,.004,.005),metal,.001)
for i in range(17):
 a=i/16;b=(i+1)/16
 rod('Radio cable',(-.19+.012*math.sin(a*math.tau*5),1.39-a*.22,-.182),(-.19+.012*math.sin(b*math.tau*5),1.39-b*.22,-.182),.0035,leather)
box('Hip utility pouch',(.235,1.035,-.01),(.067,.16,.115),leather)
for a,b in [((.24,.99,-.1),(.27,.94,-.1)),((.27,.94,-.1),(.23,.88,-.1)),((.23,.88,-.1),(.205,.91,-.1)),((.205,.91,-.1),(.24,.99,-.1))]:rod('Carabiner',a,b,.007,metal)

# Bare head, as in the reference. Face proportions are original approximations.
loft('Neck',[(0,1.51,0,.075,.072),(0,1.64,0,.075,.073)],skin)
loft('Head',[(0,1.6,-.018,.056,.069),(0,1.64,-.01,.078,.084),(0,1.7,0,.101,.091),(0,1.79,.003,.104,.097),(0,1.88,.01,.099,.087),(0,1.93,.012,.073,.066),(0,1.951,.012,.018,.027)],skin,32)
for side in [-1,1]:
 sphere('Ear',(side*.105,1.768,.002),(.019,.037,.023),skin)
 sphere('Ear inner',(side*.117,1.769,-.009),(.006,.02,.012),lip)
 sphere('Cheek',(side*.058,1.737,-.061),(.036,.032,.013),skin)
 sphere('Eye socket',(side*.044,1.803,-.074),(.027,.014,.01),skin)
 sphere('Eye',(side*.044,1.804,-.081),(.018,.006,.005),eye)
 sphere('Iris',(side*.044,1.804,-.085),(.006,.0055,.002),iris,16,8)
 sphere('Pupil',(side*.044,1.804,-.087),(.0025,.003,.001),pupil,12,8)
 rod('Eyebrow',(side*.025,1.823,-.09),(side*.066,1.825,-.08),.006,hair)
 sphere('Nostril wing',(side*.013,1.755,-.103),(.013,.009,.012),skin)
 sphere('Nostril',(side*.012,1.749,-.112),(.005,.003,.002),lip,12,8)
loft('Nose',[(0,1.75,-.094,.016,.013),(0,1.767,-.107,.018,.022),(0,1.823,-.087,.01,.01)],skin,16)
sphere('Upper lip',(0,1.705,-.091),(.032,.006,.007),lip)
sphere('Lower lip',(0,1.695,-.091),(.029,.007,.008),skin)
sphere('Chin',(0,1.668,-.069),(.045,.023,.024),skin)
# Fitted hair crown and directional swept locks; no floating full sphere cap.
loft('Hair crown',[(0,1.875,.025,.101,.079),(0,1.926,.019,.1,.084),(0,1.966,.012,.068,.063),(0,1.979,.01,.012,.023)],hair,28)
# Closely fitted hairline descends at the back rather than round side patches.
verts=[];faces=[]
for j in range(2):
 for i in range(32):
  a=i*math.tau/32;z=.012+.09*math.sin(a);x=.103*math.cos(a)
  y=1.925 if j else 1.839-.051*math.sin(a)
  verts.append(xyz((x,y,z)))
for i in range(32):faces.append((i,(i+1)%32,(i+1)%32+32,i+32))
me=bpy.data.meshes.new('Fitted hairline');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Fitted hairline',me);bpy.context.collection.objects.link(o)
for f in me.polygons:f.use_smooth=True
finish(o,'Fitted hairline',hair);hair.use_backface_culling=False
for i in range(17):
 x=-.081+i*.0095
 for j in range(3):
  a=(x,1.917+j*.016,-.054+j*.028);b=(x+.015,1.962+j*.002,-.018+j*.029)
  rod('Swept hair strand',a,b,.004,hair)

for side,armname,legname in [(-1,'LeftArm','LeftLeg'),(1,'RightArm','RightLeg')]:
 active=armname;x=side*.287
 sphere('Rounded shoulder',(x,1.47,0),(.103,.092,.11),cloth)
 loft('Turnout sleeve',[(x,1.495,0,.102,.108),(x+side*.025,1.39,0,.097,.10),(x+side*.04,1.23,-.006,.081,.082),(x+side*.053,1.1,-.027,.077,.08),(x+side*.06,.99,-.04,.065,.073)],cloth,fold=.027)
 band('Upper sleeve tape',x+side*.027,1.367,0,.099,.105,.064)
 band('Cuff tape',x+side*.057,1.055,-.032,.078,.084,.06)
 loft('Glove cuff',[(x+side*.06,.98,-.04,.066,.072),(x+side*.065,.935,-.045,.064,.067)],leather)
 sphere('Glove palm',(x+side*.065,.903,-.052),(.063,.068,.045),leather)
 box('Glove knuckle pad',(x+side*.065,.919,-.092),(.092,.039,.01),seam)
 for f in range(4):sphere('Glove finger',(x+side*.065+(f-1.5)*.025,.859,-.054),(.015,.034,.03),leather,12,8)
 sphere('Glove thumb',(x+side*.012,.903,-.081),(.023,.039,.025),leather,12,8)
 active=legname;x=side*.113
 loft('Turnout trousers',[(x,.91,0,.113,.129),(x,.77,0,.112,.12),(x,.59,0,.101,.108),(x,.47,-.012,.096,.108),(x,.3,0,.089,.102),(x,.14,0,.09,.098)],cloth,fold=.025)
 box('Cargo pocket',(x+side*.094,.73,0),(.036,.2,.145),cloth)
 box('Cargo pocket flap',(x+side*.117,.806,0),(.016,.047,.152),seam)
 sphere('Reinforced knee',(x,.478,-.097),(.08,.096,.022),leather)
 band('Trouser reflective tape',x,.23,0,.095,.106,.07)
 sphere('Boot upper',(x,.107,-.035),(.101,.096,.139),leather)
 box('Boot sole',(x,.027,-.062),(.207,.051,.306),leather,.018)
 sphere('Boot toe',(x,.083,-.159),(.101,.056,.075),leather)
 for z in [-.055,-.083,-.111]:rod('Boot lace',(x-.046,.137,z),(x+.046,.137,z-.014),.004,seam)
 for z in [-.18,-.13,-.08,-.03,.02]:box('Sole tread',(x,.013,z),(.213,.022,.021),seam,.003)

# A compact helmet carried beside the left glove, attached to the arm pivot.
active='LeftArm';hx=-.46;hy=.91;hz=.055
sphere('Carried helmet shell',(hx,hy,hz),(.139,.13,.158),leather)
sphere('Helmet brim',(hx,hy-.077,hz),(.18,.014,.199),leather)
for dx in [-.085,.085]:box('Helmet yellow panel',(hx+dx,hy+.053,hz-.122),(.041,.074,.018),yellow)
box('Helmet front shield',(hx,hy+.01,hz-.154),(.105,.113,.025),leather)
label('Helmet generic fire','FIRE',(hx,hy+.035,hz-.171),.027)
label('Helmet generic rescue','RESCUE',(hx,hy-.005,hz-.171),.017)

# Combine each articulated part by material; retain one parent pivot per limb.
origins={'Body':(0,0,0),'LeftArm':(-.27,1.49,0),'RightArm':(.27,1.49,0),'LeftLeg':(-.113,.89,0),'RightLeg':(.113,.89,0)}
for name,objects in parts.items():
 parent=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(parent);parent.location=xyz(origins[name])
 groups={}
 for o in objects:groups.setdefault(o.data.materials[0].name,[]).append(o)
 for material,group in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0]
  if len(group)>1:bpy.ops.object.join()
  o=bpy.context.object;o.name=name+'_'+material.replace(' ','_');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  if material=='Warm skin':
   mod=o.modifiers.new('Continuous sculpted face','REMESH');mod.mode='VOXEL';mod.voxel_size=.003;bpy.ops.object.modifier_apply(modifier=mod.name)
   mod=o.modifiers.new('Soften facial transitions','SMOOTH');mod.factor=1.2;mod.iterations=5;bpy.ops.object.modifier_apply(modifier=mod.name)
   mod=o.modifiers.new('Game face topology','DECIMATE');mod.ratio=.28;bpy.ops.object.modifier_apply(modifier=mod.name)
   for poly in o.data.polygons:poly.use_smooth=True
  matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
scene=bpy.context.scene;scene['notes']='Original reference-inspired firefighter, generic markings, no image textures. Rigid shoulder/hip animation, not a facial or skeletal rig.'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'firefighter.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'firefighter.glb'),export_format='GLB',export_yup=True,export_extras=True)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH')
(OUT/'firefighter.json').write_text(json.dumps({'name':'Generic turnout firefighter','source':'Original Blender geometry using supplied image as visual reference only','triangles':triangles,'units':'metres','up':'+Y','forward':'-Z','rig':'Rigid shoulder and hip groups; existing procedural gait','commercialUse':'Project-created geometry and generic markings, no third-party assets or photo pixels','limitations':['Stylized facial likeness, not a photorealistic scan','No facial, finger or elbow animation','Helmet carried as part of left arm']},indent=2))
print('FIREFIGHTER EXPORTED',triangles,'triangles')
