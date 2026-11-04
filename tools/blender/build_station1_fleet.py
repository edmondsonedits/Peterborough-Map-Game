"""Build original Station 1 aerial platform and medical pickup. Blender 5.2.

Axes: +Y up, -Z forward. The source pumper GLB is only used to extract the
actual cab and wheel/beacon meshes; new apparatus bodies are authored here.
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'city-explorer/assets/vehicles'; SRC=ROOT/'assets-source/vehicles'
PUMPER=OUT/'generic-pumper.glb'
OUT.mkdir(parents=True,exist_ok=True); SRC.mkdir(parents=True,exist_ok=True)
RED=(.42,.012,.018,1); DARK=(.018,.025,.032,1); BLACK=(.008,.012,.016,1)
GLASS=(.018,.07,.09,1); SIL=(.63,.69,.71,1); CHROME=(.84,.88,.88,1)
RUB=(.019,.022,.026,1); WHITE=(.88,.9,.86,1); AMBER=(1,.31,.025,1)
GOLD=(.94,.63,.13,1); BLUE=(.025,.25,.66,1); MEDWHITE=(.87,.89,.88,1)

def mat(name,c,metal=0,rough=.38,em=0):
 m=bpy.data.materials.new(name);m.diffuse_color=c;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=c;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if em:p.inputs['Emission Color'].default_value=c;p.inputs['Emission Strength'].default_value=em
 return m
M={k:mat(k,c,me,ro,em) for k,c,me,ro,em in [
 ('Rescue red',RED,.22,.32,0),('Graphite',DARK,.22,.3,0),('Deep black',BLACK,.18,.3,0),('Cap Charcoal',(.014,.018,.023,1),0,.78,0),
 ('Safety glass',GLASS,.42,.16,0),('Aluminum',SIL,.72,.3,0),('Chrome',CHROME,.85,.2,0),
 ('Rubber',RUB,0,.86,0),('Ivory',WHITE,.1,.28,0),('Amber',AMBER,.1,.25,.25),
 ('Rescue gold',GOLD,.3,.4,0),('Medical blue',BLUE,.16,.34,0),('Medical white',MEDWHITE,.14,.32,0),
 ('Warning red',(.88,.012,.015,1),.1,.23,.32),('Hose',(.54,.46,.31,1),0,.9,0)]}
SOURCE_WHEELS={};SOURCE_BEACONS={}
def xyz(p): return (p[0],-p[2],p[1]) # runtime Y-up, forward -Z -> Blender Z-up
def clean(): bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def box(n,loc,size,ma,bev=.025,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));o=bpy.context.object;o.name=n;o.dimensions=(size[0],size[2],size[1])
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bev: mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bev;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(M[ma] if isinstance(ma,str) else ma)
 if parent:o.parent=parent
 return o
def cyl(n,loc,r,depth,ma,axis='Y',parent=None,verts=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=xyz(loc));o=bpy.context.object;o.name=n
 if axis=='X':o.rotation_euler[1]=math.pi/2
 elif axis=='Z':o.rotation_euler[0]=math.pi/2
 o.data.materials.append(M[ma]);
 if parent:o.parent=parent
 return o
def rod(n,a,b,r,ma,parent=None):
 ga,gb=Vector(a),Vector(b);d=Vector(xyz(gb))-Vector(xyz(ga));o=cyl(n,(ga+gb)/2,r,d.length,ma,parent=parent,verts=12);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def wheel_arch(name,side,zcenter,cy=.64,outer=.78,inner=.54):
 # Thick painted half-round fender lip, shaped to follow the tire instead of a box cover.
 verts=[];faces=[];steps=20;thick=.085;x=side*1.0
 for xo in (x-side*thick/2,x+side*thick/2):
  for radius in (outer,inner):
   for i in range(steps+1):
    a=math.pi*i/steps;verts.append(xyz((xo,cy+radius*math.sin(a),zcenter+radius*math.cos(a))))
 ring=steps+1;layer=2*ring
 for j in range(steps):
  a=j;b=j+1;c=ring+j;d=ring+j+1
  faces += [(a,b,d,c),(layer+a,layer+c,layer+d,layer+b),(a,layer+a,layer+b,b),(c,d,layer+d,layer+c)]
 mesh=bpy.data.meshes.new(name+' shaped arch mesh');mesh.from_pydata(verts,[],faces);mesh.materials.append(M['Rescue red']);o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 for p in mesh.polygons:p.use_smooth=True
 return o
def quad(name,points,material):
 mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata([xyz(p) for p in points],[],[(0,1,2,3)]);mesh.materials.append(M[material]);o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return o
def join_by_material(objs,name):
 # Mesh groups are joined to keep draw calls low; named pivots remain separate.
 names=[o.name for o in objs if o and o.name in bpy.data.objects]
 for m in list(M.values()):
  grp=[o for obj_name in names if (o:=bpy.data.objects.get(obj_name)) is not None and o.type=='MESH' and len(o.data.materials) and o.data.materials[0]==m]
  if len(grp)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in grp:o.select_set(True)
   bpy.context.view_layer.objects.active=grp[0];bpy.ops.object.join();grp[0].name=f'{name}_{m.name.replace(" ","_")}'
def extract_pumper():
 bpy.ops.import_scene.gltf(filepath=str(PUMPER)); imported=list(bpy.context.scene.objects)
 # Actual cab surfaces are isolated from pumper material batches by front-body triangle centroid.
 cab=[]
 for ob in imported:
  if ob.name.startswith('Body_') and ob.type=='MESH':
   bm=ob.data; bm.calc_loop_triangles(); keep=[]
   for poly in bm.polygons:
    c=sum((ob.matrix_world @ bm.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
    if all((ob.matrix_world @ bm.vertices[i].co).y > 1.0 for i in poly.vertices):keep.append(poly.index)
   if keep:
    faces=[list(bm.polygons[i].vertices) for i in keep]; verts=[tuple(ob.matrix_world @ v.co) for v in bm.vertices]
    used=sorted(set(i for f in faces for i in f)); remap={v:i for i,v in enumerate(used)}
    mesh=bpy.data.meshes.new('Extracted pumper cab geometry');mesh.from_pydata([verts[i] for i in used],[],[[remap[v] for v in f] for f in faces]);mesh.materials.clear()
    for m in bm.materials:mesh.materials.append(m)
    for p,old in zip(mesh.polygons,[bm.polygons[i] for i in keep]):p.material_index=old.material_index
    ob2=bpy.data.objects.new('Reusable pumper cab geometry',mesh);cab.append(ob2)
  if ob.name in {'Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'}:
   if ob.name.startswith('Wheel_') and ob.type=='MESH':
    tmp=bpy.data.objects.new('Temporary source wheel simplification',ob.data.copy());bpy.context.collection.objects.link(tmp);tmp.matrix_world=ob.matrix_world.copy()
    dec=tmp.modifiers.new('Retain source wheel silhouette','DECIMATE');dec.ratio=.3
    bpy.ops.object.select_all(action='DESELECT');tmp.select_set(True);bpy.context.view_layer.objects.active=tmp;bpy.ops.object.modifier_apply(modifier=dec.name)
    data=tmp.data.copy();data.transform(tmp.matrix_world);center=tmp.matrix_world.translation.copy();bpy.data.objects.remove(tmp,do_unlink=True)
    for v in data.vertices:v.co-=center
    SOURCE_WHEELS[ob.name]=data
   elif ob.name.startswith('Beacon_') and ob.type=='MESH':
    data=ob.data.copy();data.transform(ob.matrix_world);lo=min((v.co for v in data.vertices),key=lambda p:p.x).copy();hi=max((v.co for v in data.vertices),key=lambda p:p.x).copy()
    for axis in range(3):
     lo[axis]=min(v.co[axis] for v in data.vertices);hi[axis]=max(v.co[axis] for v in data.vertices)
    center=(lo+hi)*.5
    for v in data.vertices:v.co-=center
    SOURCE_BEACONS[ob.name]=data
 for o in imported:bpy.data.objects.remove(o,do_unlink=True)
 return cab
def add_cab(cab,scale_z=1,shift_z=0,scale_x=1,scale_height=1):
 result=[]
 for old in cab:
  o=old.copy();o.data=old.data.copy();bpy.context.collection.objects.link(o);o.name='Reusable pumper cab shell'
  for v in o.data.vertices:v.co.x*=scale_x;v.co.y=v.co.y*scale_z-shift_z;v.co.z*=scale_height
  result.append(o)
 return result
def render_preview(path,camera_game,target_game,scale=13):
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=900;sc.render.resolution_y=600;sc.render.resolution_percentage=100
 for old in [o for o in sc.objects if o.name.startswith('Preview ')]:bpy.data.objects.remove(old,do_unlink=True)
 sc.render.image_settings.file_format='PNG';sc.render.filepath=str(path);sc.world.color=(.11,.13,.16)
 bpy.ops.mesh.primitive_plane_add(size=52,location=xyz((0,-.03,0)));floor=bpy.context.object;floor.name='Preview ground';floor.data.materials.append(M['Graphite'])
 def area(loc,power,size):
  bpy.ops.object.light_add(type='AREA',location=xyz(loc));l=bpy.context.object;l.name='Preview Light';l.data.energy=power;l.data.shape='DISK';l.data.size=size
  l.rotation_euler=(Vector(xyz((0,1,0)))-l.location).to_track_quat('-Z','Y').to_euler()
 area((8,13,-8),1800,9);area((-8,8,3),1300,8);area((1,9,11),1100,7)
 area((camera_game[0]+5,camera_game[1]+7,camera_game[2]-8),1700,10)
 if target_game[1]>10:
  area((target_game[0]+3,target_game[1]+8,target_game[2]+3),6500,8)
 bpy.ops.object.camera_add(location=xyz(camera_game));cam=bpy.context.object;cam.name='Preview Camera';cam.data.type='ORTHO';cam.data.ortho_scale=scale
 cam.rotation_euler=(Vector(xyz(target_game))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;sc.render.filepath=str(path)
 bpy.ops.render.render(write_still=True)

def build_aerial(cab):
 parts=[]
 # Tandem rescue chassis / apparatus box, with two exposed axle openings.
 parts += [box('Tandem frame',(0,.75,.6),(2.16,.38,11.4),'Deep black'),
 box('Rescue body lower',(0,1.42,2.0),(2.46,1.45,7.6),'Rescue red'),
 box('Upper locker bridge',(0,2.18,2.0),(2.48,.76,7.45),'Rescue red'),
 box('Body rear cap',(0,1.82,5.8),(2.38,1.55,.16),'Rescue red'),
 box('Body front bulkhead',(0,1.82,-1.52),(2.38,1.55,.16),'Rescue red'),
 box('Cab rear closeout',(0,1.18,-1.63),(2.25,.88,.78),'Rescue red',.11),
 box('Aerial cab roof closeout',(0,2.54,-2.68),(2.22,.13,2.14),'Rescue red',.09),
 box('Aerial hood',(0,1.17,-4.02),(2.12,.52,1.42),'Rescue red',.13),
 box('Front grille recess',(0,1.18,-4.76),(1.22,.66,.07),'Deep black',.045),
 box('Aerial front bumper',(0,.55,-5.15),(2.42,.32,.38),'Deep black',.08),
 box('Aerial bumper alloy face',(0,.65,-5.34),(1.82,.12,.11),'Aluminum',.035),
 box('Rear step bumper',(0,.55,6.25),(2.5,.32,.5),'Deep black',.08),
 box('Rear step alloy edge',(0,.72,6.27),(2.18,.08,.12),'Aluminum',.035)]
 for side in (-1,1):
  parts += [box('Aerial headlamp housing',(side*.83,1.2,-4.78),(.34,.32,.08),'Deep black',.045),
   box('Aerial headlamp lens',(side*.83,1.21,-4.83),(.25,.22,.035),'Ivory',.035)]
  parts.append(box('Aerial cab side glazing infill',(side*1.08,2.18,-2.18),(.035,.48,.68),'Safety glass',.025))
 for i in range(6):
  parts.append(box('Aerial grille horizontal bar',(0,.91+i*.105,-4.815),(1.06,.028,.026),'Chrome',.012))
 # Extracted Pump 1 cab is the entire cab shell; avoid the old overlapping box stand-in.
 # Body lockers begin behind the cab's rear axle, with side access steps and a split rear deck.
 for side in (-1,1):
  for z in [0.0,2.55,4.35]:
   parts += [box('Locker surround',(side*1.245,1.6,z),(.06,1.33,1.34),'Rescue red',.04),box('Locker roll-up',(side*1.282,1.61,z),(.025,1.2,1.18),'Aluminum',.025)]
   for j in range(10):parts.append(box('Locker slat',(side*1.3,.99+j*.13,z),(.012,.018,1.1),'Chrome',.006))
   parts.append(box('Locker latch',(side*1.33,1.7,z+.51),(.025,.16,.07),'Deep black',.018))
  parts += [box('Pump panel surround',(side*1.3,1.55,-1.2),(.06,1.1,.9),'Rescue red',.025),box('Pump panel',(side*1.34,1.55,-1.2),(.025,1.0,.8),'Deep black',.025)]
  for i in range(4):parts += [cyl('Pump gauge',(side*1.37,1.8,-1.49+i*.19),.062,.035,'Chrome','X'),cyl('Gauge face',(side*1.39,1.8,-1.49+i*.19),.045,.018,'Ivory','X')]
  parts += [box('Apparatus side step',(side*1.32,.54,1.2),(.32,.12,1.3),'Graphite',.035),box('Step reflective nosing',(side*1.33,.61,1.2),(.3,.04,1.15),'Chrome',.018)]
  # dual rear wheels and individual step/fender detail
 # Static rear controls remain distinct from the modeled basket panel, at accessible waist height.
 parts += [box('Rear control pedestal',(0,1.18,5.72),(1.48,.72,.48),'Graphite',.07),
  box('Rear control aluminum panel',(0,1.61,5.91),(1.28,.52,.08),'Aluminum',.045),
  box('Rear control dark face',(0,1.66,5.97),(1.16,.46,.035),'Deep black',.025),
  box('Rear control status display',(0,1.82,6.01),(.44,.16,.025),'Amber',.018),
  box('Rear control operator footstep',(0,.28,6.12),(1.0,.18,.38),'Aluminum',.035)]
 for i in range(5):
  parts += [cyl('Rear control selector',(-.4+i*.2,1.57,6.01),.06,.045,'Chrome','Z',verts=16),
   box('Rear control status lamp',(-.4+i*.2,1.39,6.02),(.075,.045,.025),'Amber' if i%2==0 else 'Ivory',.01)]
 for side in (-1,1):rod('Rear control handrail',(side*.76,.55,6.1),(side*.76,2.15,6.1),.045,'Chrome')
 for side in (-1,1):
  parts += [box('Rear tail lamp housing',(side*1.01,1.25,5.96),(.32,.78,.1),'Deep black',.045),
   box('Rear tail lamp red',(side*1.01,1.43,6.03),(.22,.28,.07),'Warning red',.035),
   box('Rear tail lamp amber',(side*1.01,1.12,6.03),(.22,.17,.07),'Amber',.03),
   box('Rear tail lamp reverse',(side*1.01,.91,6.03),(.22,.13,.07),'Ivory',.025)]
 for i in range(5):
  x=-1.1+i*.46
  quad('Rear safety chevron',[(x,.42,5.91),(x+.13,.42,5.91),(x+.49,1.27,5.91),(x+.36,1.27,5.91)],'Ivory' if i%2==0 else 'Warning red')
 for x in [-.78,-.52,-.26,0,.26,.52,.78]:
  parts.append(box('Ladder storage cradle',(x,2.92,1.88),(.07,.1,5.5),'Chrome'))
 # Four named warning beacons; originals are also present as source-mesh extracts in cab files (source metadata).
 beaconpos=[('Beacon_L',(-.9,3.08,-4.0)),('Beacon_R',(.9,3.08,-4.0)),('Beacon_RearL',(-.95,2.7,4.45)),('Beacon_RearR',(.95,2.7,4.45))]
 # Reusable original pumper cab face/body meshes, dimension-aligned to this chassis.
 parts+=add_cab(cab,.94,.1,.88,.94)
 parts=[o for o in bpy.context.scene.objects if o.parent is None]
 join_by_material(parts,'AerialBody')
 # separate wheel pivots (source tread mesh profile reused by shape, named wheel contract)
 for nm,x,z in [('FL',-1.13,-3.1),('FR',1.13,-3.1),('RL',-1.13,2.8),('RR',1.13,2.8),('RL2',-1.13,4.1),('RR2',1.13,4.1)]:
  pivot=bpy.data.objects.new(f'Wheel_{nm}',None);bpy.context.collection.objects.link(pivot);pivot.location=xyz((x,.62,z))
  source=SOURCE_WHEELS['Wheel_FL' if nm in ('FL','FR') else 'Wheel_RL'].copy();wheel=bpy.data.objects.new('Original pumper wheel geometry',source);bpy.context.collection.objects.link(wheel);wheel.parent=pivot
  side=-1 if x<0 else 1
  cyl('Aerial alloy wheel face',(side*.245,0,0),.31,.055,'Graphite','X',pivot,verts=32)
  cyl('Aerial wheel rim lip',(side*.278,0,0),.285,.022,'Aluminum','X',pivot,verts=32)
  cyl('Aerial wheel center hub',(side*.29,0,0),.12,.04,'Graphite','X',pivot,verts=24)
  for lug in range(10):
   aa=lug*math.tau/10;cyl('Aerial wheel lug',(side*.315,.235*math.sin(aa),.235*math.cos(aa)),.026,.025,'Chrome','X',pivot,verts=10)
  for spoke in range(5):
   aa=spoke*math.tau/5
   rod('Aerial steel wheel spoke',(side*.3,.055*math.sin(aa),.055*math.cos(aa)),(side*.3,.225*math.sin(aa),.225*math.cos(aa)),.032,'Aluminum',pivot)
  join_by_material([o for o in bpy.context.scene.objects if o.parent==pivot],f'AerialWheel{nm}')
 for name,pos in beaconpos:
  node=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(node);node.location=xyz(pos)
  mesh=SOURCE_BEACONS['Beacon_L' if name.endswith('_L') else 'Beacon_R'].copy()
  for v in mesh.vertices:v.co*=.6
  lens=bpy.data.objects.new('Original pumper beacon mesh',mesh);bpy.context.collection.objects.link(lens);lens.parent=node
 # Four actuated outriggers extend laterally; jack position is under beam near outer tip.
 for short,sgn,z in [('FL',-1,-2.2),('FR',1,-2.2),('RL',-1,5.1),('RR',1,5.1)]:
  beam=bpy.data.objects.new('Outrigger_'+short,None);bpy.context.collection.objects.link(beam);beam.location=xyz((0,1.0,z))
  box('Outrigger beam',(0,0,0),(2.3,.16,.21),'Chrome',.025,beam)
  jack=bpy.data.objects.new('Jack_'+short,None);bpy.context.collection.objects.link(jack);jack.location=xyz((sgn*1.15,-.48,0));jack.parent=beam
  cyl('Jack housing',(sgn*1.15,-.25,0),.13,.65,'Graphite',parent=beam)
  cyl('Hydraulic ram',(0,.28,0),.095,.55,'Chrome',parent=jack);box('Foot pad',(0,0,0),(.72,.12,.62),'Aluminum',.04,jack)
 # Main aerial ladder is distinct from the truck body and all pivots are explicit.
 yaw=bpy.data.objects.new('TurntableYaw',None);bpy.context.collection.objects.link(yaw);yaw.location=xyz((0,2.95,4.4))
 box('Turntable base',(0,0,0),(1.55,.36,1.7),'Aluminum',.08,yaw)
 cyl('Slew bearing',(0,.25,0),.65,.22,'Chrome',parent=yaw,verts=32)
 pitch=bpy.data.objects.new('LadderPitch',None);bpy.context.collection.objects.link(pitch);pitch.parent=yaw;pitch.location=xyz((0,.4,-.45))
 box('Ladder heel',(0,0,0),(1.05,.25,1.4),'Rescue red',.05,pitch)
 sec=pitch
 for i in range(1,6):
  node=bpy.data.objects.new(f'LadderSection_{i}',None);bpy.context.collection.objects.link(node);node.parent=sec;node.location=xyz((0,.08,-(.8 if i>1 else 0)));sec=node
  L=5.6
  rail=.42-(i-1)*.025
  for x in [-rail,rail]:box('Aluminum ladder rail',(x,.04,-L/2),(.105,.16,L),'Aluminum',.025,node)
  for j in range(21):box('Ladder rung',(0,.04,-.12-j*.265),(rail*1.82,.055,.06),'Chrome',.012,node)
  for x in [-rail*.67,rail*.67]:box('Nested ladder track',(x,.14,-L/2),(.045,.045,L-.2),'Chrome',.012,node)
  # Exposed side truss webbing ties the rail chords together along the full stage.
  for side in [-1,1]:
   for j in range(10):
    z0=-.22-j*.52;z1=z0-.52
    rod('Ladder side truss diagonal',(side*rail,-.035,z0),(side*rail,.15,z1),.025,'Chrome',node)
    rod('Ladder side truss diagonal',(side*rail,.15,z1),(side*rail,-.035,z1-.52),.025,'Chrome',node)
  join_by_material([o for o in bpy.context.scene.objects if o.parent==node],'LadderStage')
 # The central folding stow stays at the end of Stage 5; terminal fly keeps the established Section_4 name.
 fold=bpy.data.objects.new('KnuckleFold',None);bpy.context.collection.objects.link(fold);fold.parent=sec;fold.location=xyz((0,.1,-5.2))
 section4=bpy.data.objects.new('LadderSection_6',None);bpy.context.collection.objects.link(section4);section4.parent=fold
 for x in [-.3,.3]:box('Fly section rail',(x,0,-1.6),(.08,.13,3.2),'Aluminum',.02,section4)
 for j in range(12):box('Fly ladder rung',(0,0,-.12-j*.26),(.55,.05,.06),'Chrome',.01,section4)
 level=bpy.data.objects.new('BasketLevel',None);bpy.context.collection.objects.link(level);level.parent=section4;level.location=xyz((0,0,-3.2))
 transport=bpy.data.objects.new('BasketFold',None);bpy.context.collection.objects.link(transport);transport.parent=level
 basket=bpy.data.objects.new('Basket',None);bpy.context.collection.objects.link(basket);basket.parent=transport
 box('Rescue basket floor',(0,0,0),(1.25,.12,1.1),'Aluminum',.04,basket)
 box('Basket front top rail',(0,.69,-.48),(1.2,.07,.07),'Chrome',.025,basket)
 box('Basket front lower rail',(0,.16,-.48),(1.2,.06,.06),'Aluminum',.02,basket)
 for x in [-.57,-.29,0,.29,.57]:box('Basket front guard upright',(x,.43,-.48),(.045,.48,.045),'Chrome',.012,basket)
 for x in [-.58,.58]:
  box('Basket side top rail',(x,.69,0),(.07,.07,1.02),'Chrome',.02,basket)
  box('Basket side lower rail',(x,.16,0),(.06,.06,1.02),'Aluminum',.018,basket)
  for z in [-.48,-.16,.16,.48]:box('Basket side guard upright',(x,.42,z),(.055,.48,.055),'Chrome',.015,basket)
 box('Basket rear top rail',(0,.69,.49),(1.2,.07,.07),'Chrome',.02,basket)
 box('Basket rear lower rail',(0,.16,.49),(1.2,.06,.06),'Aluminum',.018,basket)
 for x in [-.57,-.29,0,.29,.57]:box('Basket rear guard upright',(x,.42,.49),(.045,.48,.045),'Chrome',.012,basket)
 # Operator controls and standing point are placed on the basket interior floor.
 basket_stand=bpy.data.objects.new('BasketStand',None);bpy.context.collection.objects.link(basket_stand);basket_stand.parent=basket;basket_stand.location=xyz((0,.075,-.02))
 box('Basket operator control housing',(.43,.37,.31),(.18,.45,.25),'Graphite',.035,basket)
 box('Basket control face',(.43,.4,.2),(.19,.3,.025),'Aluminum',.018,basket)
 for i in range(4):
  cyl('Basket joystick button',(.43,.5-i*.065,.176),.023,.02,'Amber' if i==0 else 'Deep black','Z',basket,verts=12)
 basket_panel=bpy.data.objects.new('BasketControls',None);bpy.context.collection.objects.link(basket_panel);basket_panel.parent=basket;basket_panel.location=xyz((.43,.4,.18))
 # The monitor mount/nozzle is physically beneath the floor.
 my=bpy.data.objects.new('MonitorYaw',None);bpy.context.collection.objects.link(my);my.parent=basket;my.location=xyz((0,-.24,0))
 box('Monitor pedestal',(0,-.1,0),(.3,.26,.3),'Chrome',.04,my)
 mp=bpy.data.objects.new('MonitorPitch',None);bpy.context.collection.objects.link(mp);mp.parent=my;mp.location=xyz((0,-.12,0))
 rod('Monitor barrel',(0,0,0),(0,0,-.5),.115,'Aluminum',mp)
 nozzle=bpy.data.objects.new('NozzleOutlet',None);bpy.context.collection.objects.link(nozzle);nozzle.parent=mp;nozzle.location=xyz((0,0,-.53))
 cyl('Nozzle crown',(0,0,-.53),.071,.14,'Chrome','Z',mp)
 # Export the source model in safe transport pose; runtime applies absolute angles.
 fold.rotation_euler.x=math.pi;level.rotation_euler.x=-math.pi;transport.rotation_euler.x=math.pi/2
 # Hydraulic elevation linkage: fixed chassis pins and moving upper yoke pins.
 for short,sgn in [('L',-1),('R',1)]:
  basepos=(sgn*.48,2.78,4.65);tiploc=(sgn*.48,.05,-1.05)
  base=bpy.data.objects.new('Cylinder_Base_'+short,None);bpy.context.collection.objects.link(base);base.location=xyz(basepos)
  tip=bpy.data.objects.new('Cylinder_Tip_'+short,None);bpy.context.collection.objects.link(tip);tip.parent=pitch;tip.location=xyz(tiploc)
  tipworld=(sgn*.48,3.4,3.4)
  rod('ElevationRam_'+short,basepos,tipworld,.115,'Chrome')
 # Extend the apparatus fore-aft envelope 9% around axle centerline; wheel diameters,
 # ladder-stage lengths and lateral outrigger travel remain unchanged.
 fore_aft=1.09
 for ob in list(bpy.context.scene.objects):
  if ob.parent is None and ob.type=='MESH':
   ob.location.y*=fore_aft
   for v in ob.data.vertices:v.co.y*=fore_aft
  elif ob.parent is None and (ob.name.startswith('Wheel_') or ob.name.startswith('Beacon_') or ob.name.startswith('Outrigger_') or ob.name.startswith('Cylinder_Base_') or ob.name in {'TurntableYaw','RearControls','RearOperator'}):
   ob.location.y*=fore_aft
 for tip_name in ('Cylinder_Tip_L','Cylinder_Tip_R'):
  tip=bpy.data.objects.get(tip_name)
  if tip:tip.location.y*=fore_aft
 # Vehicle model dimensions and operational bounds; assembly composed under root for export.
 rear_controls=bpy.data.objects.new('RearControls',None);bpy.context.collection.objects.link(rear_controls);rear_controls.location=xyz((0,1.66,5.97))
 rear_operator=bpy.data.objects.new('RearOperator',None);bpy.context.collection.objects.link(rear_operator);rear_operator.location=xyz((0,0,7.85))
 root=bpy.data.objects.new('AerialPlatform',None);bpy.context.collection.objects.link(root)
 for o in list(bpy.context.scene.objects):
  if o!=root and o.parent is None:o.parent=root
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'aerial-platform.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'aerial-platform.glb'),export_format='GLB',export_yup=True,export_extras=True)
 preview=ROOT/'test-artifacts'/'fleet';preview.mkdir(parents=True,exist_ok=True)
 render_preview(preview/'aerial-platform-stowed.png',(12,10,-15),(0,2,0),13)
 render_preview(preview/'aerial-platform-side.png',(20,9,0),(0,1.5,0),15)
 render_preview(preview/'aerial-platform-rear-controls.png',(11,8,14),(0,1.5,3),13)
 root.location=xyz((0,.14,0))
 for short,side in [('FL',-1),('FR',1),('RL',-1),('RR',1)]:
  bpy.data.objects['Outrigger_'+short].location.x=side*1.6
  bpy.data.objects['Jack_'+short].location=xyz((side*1.15,-1.08,0))
 render_preview(preview/'aerial-platform-outriggers.png',(16,10,-14),(0,1.4,0),17)
 pitch.rotation_euler.x=1.12
 for i in range(2,6):bpy.data.objects[f'LadderSection_{i}'].location=xyz((0,.08,-5.6))
 fold.rotation_euler.x=0;level.rotation_euler.x=-1.12;transport.rotation_euler.x=0
 for short,side,z in [('FL',-1,-2.2),('FR',1,-2.2),('RL',-1,5.1),('RR',1,5.1)]:
  beam=bpy.data.objects['Outrigger_'+short];beam.location.x=side*1.6
  jack=bpy.data.objects['Jack_'+short];jack.location.z-=1.0
 bpy.context.view_layer.update();bw=basket.matrix_world.translation
 basket_target=(bw.x,bw.z,-bw.y+.3)
 full_target=(0,(basket_target[1]+2.0)/2,basket_target[2]/2)
 render_preview(preview/'aerial-platform-deployed.png',(full_target[0]+26,full_target[1]+15,full_target[2]-15),full_target,52)
 render_preview(preview/'aerial-basket-close.png',(basket_target[0]+5,basket_target[1]+4,basket_target[2]-7),basket_target,8)
 ladder_sections=[{'node':f'LadderSection_{i}','length':5.6,'travel':0 if i==1 else 4.8} for i in range(1,6)]+[{'node':'LadderSection_6','length':3.2,'travel':0}]
 contract={'TurntableYaw':{'position':[0,2.95,4.796]},'LadderPitch':{'rest':'0 rad, ladder axis -Z'},'ladderSections':ladder_sections,'KnuckleFold':{'parent':'LadderSection_5','position':[0,.1,-5.2],'axis':'local X','deployedRad':0,'stowedRad':math.pi,'sectionLength':3.2},'BasketLevel':{'parent':'LadderSection_6','position':[0,0,-3.2],'compensation':'-(LadderPitch.rotation.x+KnuckleFold.rotation.x)'},'BasketFold':{'deployedRad':0,'transportRad':math.pi/2},'Basket':{'parent':'BasketFold'},'BasketStand':{'parent':'Basket','position':[0,.075,-.02],'feetAtFloor':True},'BasketControls':{'parent':'Basket','position':[.43,.4,.18]},'RearControls':{'node':'RearControls','position':[0,1.66,6.507],'orientation':'outward-facing from rear deck'},'RearOperator':{'node':'RearOperator','feet':[0,0,7.85],'facing':'-Z'},'MonitorYaw':{'position':[0,-.24,0],'parent':'Basket'},'MonitorPitch':{'parent':'MonitorYaw','rangeRad':[-math.pi/2,math.pi/3]},'NozzleOutlet':{'parent':'MonitorPitch','position':[0,0,-.53],'axis':'-Z','underside':True},'Outrigger_FL/FR/RL/RR':{'restX':0,'jackRestX':'sign*1.15','travelX':'sign*1.6','deployedPadX':'sign*2.75','jackNodes':'Jack_FL/FR/RL/RR','jackRestHeight':.52,'footPlateLocalY':0,'jackStroke':1.0,'ramChildCenterY':.28,'housingCenterY':-.25},'stabilizerBeamTravel':1.6,'wheelRadius':.56,'wheelbase':7.14,'jackFootSole':-.06,'ElevationRam_L/R':{'baseNodes':'Cylinder_Base_L/R','tipNodes':'Cylinder_Tip_L/R'}}
 return {'name':'Station 1 aerial platform','units':'metres','forward':'-Z','up':'+Y','dimensions':{'length':12.97,'width':2.55,'height':4.42},'cabClearance':{'min':[-1.18,.72,-5.254],'max':[1.18,3.05,-1.145]},'pivotContract':contract,'ladderSections':ladder_sections,'stabilizerBeamTravel':1.6,'wheelRadius':.56,'wheelbase':7.14,'jackFootSole':-.06,'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'triangles':0,'drawCalls':0,'source':'Original apparatus with selectively extracted generic pumper cab faces, wheels, and beacon meshes','wheelSimplificationRatio':.3,'commercialUse':'Project-created generic geometry and source project meshes'}

def build_medi(cab):
 parts=[]
 # Crew-cab rescue pickup with a shaped hood, tall grille, deep cab glass, and an integrated shell canopy.
 parts += [box('Pickup ladder frame',(0,.47,0),(1.82,.22,7.15),'Deep black'),box('Cab front bumper',(0,.48,-3.62),(2.32,.3,.4),'Deep black',.1),
  box('Front bumper alloy face',(0,.54,-3.82),(1.72,.14,.13),'Aluminum',.045),box('Front bumper corner caps',(-.96,.56,-3.7),(.32,.28,.32),'Rescue red',.1),box('Front bumper corner caps',(.96,.56,-3.7),(.32,.28,.32),'Rescue red',.1),
  box('Pickup hood',(0,1.32,-2.86),(1.95,.34,1.38),'Rescue red',.16),box('Hood center crown',(0,1.49,-2.82),(.92,.055,1.08),'Rescue red',.05),
  box('Grille black recess',(0,1.12,-3.59),(1.13,.76,.07),'Deep black',.06),box('Grille upper surround',(0,1.52,-3.62),(1.24,.09,.1),'Chrome',.035),box('Grille lower surround',(0,.75,-3.62),(1.24,.09,.1),'Chrome',.035),
  box('Lower air intake',(0,.76,-3.73),(1.05,.23,.05),'Graphite',.035),box('Pickup bed floor',(0,.72,1.7),(1.84,.18,2.95),'Deep black',.035),
  box('Pickup cab lower core',(0,1.19,-1.12),(1.92,.96,2.65),'Rescue red',.1),box('Cab roof skin',(0,2.54,-1.12),(1.96,.13,2.35),'Rescue red',.09)]
 # Sloped laminated windscreen and contrasting surround; black push bar has meaningful front depth.
 quad('Windshield inset',[(-.84,1.75,-2.45),(.84,1.75,-2.45),(.85,2.49,-1.9),(-.85,2.49,-1.9)],'Safety glass')
 for side in (-1,1):
  rod('Cab A-pillar',(side*.9,1.71,-2.48),(side*.9,2.55,-1.87),.062,'Rescue red')
  box('Pickup headlamp housing',(side*.77,1.2,-3.66),(.42,.34,.09),'Deep black',.055)
  box('Pickup LED headlamp',(side*.77,1.22,-3.72),(.31,.23,.035),'Ivory',.04)
  box('Amber front marker',(side*.99,1.15,-3.7),(.09,.15,.04),'Amber',.025)
 # Door panels read as four separate doors with black apertures, continuous beltline and chrome handles.
 for side in (-1,1):
  for idx,(zc,w) in enumerate([(-1.7,.93),(-.55,.93)]):
   parts.append(box(('Front' if idx==0 else 'Rear')+' crew door',(side*.976,1.24,zc),(.055,.82,w),'Rescue red',.045))
   z0=zc-w*.42;z1=zc+w*.42
   glass_points=[(side*1.012,1.78,z0),(side*1.012,1.78,z1),(side*1.012,2.36,z1),(side*1.012,2.36,z0)]
   if side>0:glass_points.reverse()
   quad(('Front' if idx==0 else 'Rear')+' door glass',glass_points,'Safety glass')
   box('Black window seal',(side*1.024,1.77,zc),(.026,.055,w+.05),'Deep black',.01)
   box('Upper window to roof seal',(side*1.024,2.418,zc),(.032,.116,w+.015),'Graphite',.016)
   box('Door chrome handle',(side*1.045,1.35,zc+.32),(.035,.065,.18),'Chrome',.02)
   box('Door dark belt moulding',(side*1.025,1.77,zc),(.045,.035,w+.06),'Graphite',.012)
  box('Cab B-pillar',(side*.98,2.08,-1.12),(.12,.72,.13),'Deep black',.025)
  box('Cab C-pillar',(side*.96,2.08,-.04),(.12,.72,.14),'Rescue red',.035)
  box('Cab rear window',(side*.974,2.1,-.1),(.04,.55,.77),'Safety glass',.035)
  # Integrated flared fenders wrap the tires; black arch shadow adds separation from the tire.
  for zc in (-2.02,2.05):
   parts.append(wheel_arch('Integrated sculpted wheel arch',side,zc))
   box('Wheel well dark liner',(side*.91,.58,zc),(.16,.13,.94),'Deep black',.035)
  box('Rescue rocker guard',(side*1.01,.55,-.55),(.16,.17,1.8),'Graphite',.045)
  box('Crew cab running board',(side*1.14,.39,-.55),(.3,.12,1.56),'Deep black',.04)
  for j in range(7):box('Running board tread',(side*1.14,.455,-1.18+j*.21),(.2,.018,.1),'Aluminum',.015)
  parts.append(box('Red pickup bed quarter',(side*.93,.98,1.62),(.1,.54,2.72),'Rescue red',.06))
  # Enclosed emergency canopy follows the pickup cab width and roofline, with glazed front and a useful rear door.
  box('Canopy lower shell',(side*.93,1.42,1.62),(.07,.34,2.72),'Cap Charcoal',.06)
  box('Canopy side upper wall',(side*.91,2.01,1.63),(.075,.94,2.76),'Cap Charcoal',.055)
  box('Canopy roof',(side*.47,2.46,1.63),(.92,.10,2.78),'Cap Charcoal',.045)
  box('Canopy rub rail',(side*.98,1.27,1.62),(.06,.08,2.68),'Aluminum',.025)
  box('Canopy white rescue stripe',(side*1.0,1.43,1.62),(.025,.12,2.62),'Ivory',.018)
  # One long charcoal equipment window/panel reads as a fitted cap over the red pickup box.
  box('Canopy side cap window',(side*.965,2.01,1.62),(.028,.43,2.48),'Cap Charcoal',.055)
  for zc in (.36,2.88):
   box('Canopy panel end seam',(side*.99,1.99,zc),(.025,.47,.035),'Aluminum',.012)
  box('Canopy panel rear latch',(side*.99,1.98,2.78),(.03,.15,.06),'Chrome',.018)
 # Canopy end walls leave the cab visible through a front bulkhead window and form a clear rear hatch.
 parts += [box('Canopy front bulkhead',(0,1.73,.28),(1.86,1.26,.1),'Graphite',.045),
  box('Canopy rear door',(0,1.73,3.0),(1.87,1.27,.1),'Cap Charcoal',.055),
  box('Canopy roof crown',(0,2.46,1.63),(1.9,.10,2.78),'Cap Charcoal',.045),
  box('Canopy rear window surround',(0,2.09,3.045),(1.2,.59,.035),'Graphite',.035),
  box('Canopy rear glazing',(0,2.08,3.075),(1.06,.47,.04),'Safety glass',.035),
  box('Canopy rear rescue stripe',(0,1.42,3.06),(1.65,.16,.035),'Ivory',.025),
  box('Medical cross vertical',(0,1.4,3.08),(.075,.31,.025),'Ivory',.015),box('Medical cross horizontal',(0,1.4,3.08),(.31,.075,.025),'Ivory',.015)]
 # Black push bar is independent of the grille and has upright stanchions clear of the headlamps.
 for side in (-1,1):
  rod('Push bar upright',(side*.61,.52,-3.72),(side*.61,1.61,-3.8),.05,'Deep black')
  rod('Push bar upper rail',(side*.61,1.58,-3.8),(-side*.61,1.58,-3.8),.05,'Deep black')
  rod('Push bar lower rail',(side*.61,.62,-3.83),(-side*.61,.62,-3.83),.06,'Deep black')
  box('Push bar bumper pad',(side*.68,.62,-3.86),(.26,.17,.1),'Rubber',.045)
 beaconpos=[((-.7,2.76,-1.4),'Beacon_L'),((.7,2.76,-1.4),'Beacon_R'),((-.72,2.59,2.5),'Beacon_RearL'),((.72,2.59,2.5),'Beacon_RearR')]
 for x in (-.72,.72):parts.append(box('Rear canopy beacon mount',(x,2.535,2.5),(.34,.05,.2),'Deep black',.025))
 parts += [box('LED lightbar alloy rail',(0,2.72,-1.4),(1.56,.075,.24),'Deep black',.045),box('LED lightbar red lens',(-.46,2.79,-1.4),(.5,.09,.2),'Warning red',.04),box('LED lightbar clear lens',(.46,2.79,-1.4),(.5,.09,.2),'Amber',.04)]
 parts=[o for o in bpy.context.scene.objects if o.parent is None]
 join_by_material(parts,'MediPickup')
 for nm,x,z in [('FL',-0.93,-2.02),('FR',.93,-2.02),('RL',-.93,2.05),('RR',.93,2.05)]:
  pivot=bpy.data.objects.new('Wheel_'+nm,None);bpy.context.collection.objects.link(pivot);pivot.location=xyz((x,.62,z))
  source=SOURCE_WHEELS['Wheel_FL' if nm in ('FL','FR') else 'Wheel_RL'].copy()
  for v in source.vertices:v.co*=.9
  wheel=bpy.data.objects.new('Original pumper wheel geometry scaled for pickup',source);bpy.context.collection.objects.link(wheel);wheel.parent=pivot
  side=-1 if nm.endswith('L') else 1
  hub=cyl('Pickup graphite alloy wheel face',(side*.245,0,0),.285,.055,'Graphite','X',pivot,verts=32)
  cyl('Pickup silver rim lip',(side*.275,0,0),.266,.02,'Aluminum','X',pivot,verts=32)
  cyl('Pickup center cap',(side*.29,0,0),.105,.04,'Graphite','X',pivot,verts=24)
  for i in range(8):
   a=i*math.tau/8
   cyl('Pickup wheel lug',(side*.31,.19*math.sin(a),.19*math.cos(a)),.022,.025,'Aluminum','X',pivot,verts=10)
  for spoke in range(5):
   a=spoke*math.tau/5
   rod('Pickup dark alloy spoke',(side*.3,.05*math.sin(a),.05*math.cos(a)),(side*.3,.2*math.sin(a),.2*math.cos(a)),.028,'Aluminum',pivot)
  join_by_material([o for o in bpy.context.scene.objects if o.parent==pivot],f'MediWheel{nm}')
 for pos,n in beaconpos:
  node=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(node);node.location=xyz(pos)
  mesh=SOURCE_BEACONS['Beacon_L' if n.endswith('_L') else 'Beacon_R'].copy()
  for v in mesh.vertices:v.co*=.52
  lens=bpy.data.objects.new('Original pumper beacon mesh',mesh);bpy.context.collection.objects.link(lens);lens.parent=node
 root=bpy.data.objects.new('MediPickup',None);bpy.context.collection.objects.link(root)
 for o in list(bpy.context.scene.objects):
  if o!=root and o.parent is None:o.parent=root
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'medi-pickup.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'medi-pickup.glb'),export_format='GLB',export_yup=True,export_extras=True)
 preview=ROOT/'test-artifacts'/'fleet';preview.mkdir(parents=True,exist_ok=True)
 render_preview(preview/'medi-pickup.png',(8,6,-10),(0,1,0),10)
 render_preview(preview/'medi-pickup-side.png',(15,7,0),(0,1.3,0),11)
 render_preview(preview/'medi-pickup-rear.png',(7,6,9),(0,1.2,0),11)
 return {'name':'Station 1 medical response pickup','units':'metres','forward':'-Z','up':'+Y','dimensions':{'length':7.2,'width':2.58,'height':2.90},'measuredBounds':{'length':7.2,'width':2.58,'height':2.90},'wheelbase':4.07,'cabClearance':{'min':[-1.0,.58,-3.62],'max':[1.0,2.62,.02]},'wheelRadius':.53,'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'fourDoorCab':True,'fullyEnclosedCanopy':True,'body':'Fire-red crew-cab pickup with integrated molded wheel arches, grille guard, fitted charcoal equipment canopy, light rescue stripe and panel seams','ambulance':False,'source':'Original shaped pickup cab/canopy and wheel hubs with selectively reused generic pumper wheel and beacon meshes','wheelSimplificationRatio':.3,'commercialUse':'Project-created generic geometry and source project meshes'}

def render_contact():
 # Render authored GLB scenes individually through Blender, with a clean neutral studio setup.
 # Asset previews are generated in the Blender render stage and assembled by preview utility.
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1100;scene.render.resolution_y=720;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.world.color=(.12,.14,.17);scene.render.film_transparent=False

medi_only='--medi-only' in sys.argv
a=None
if not medi_only:
 clean();cab=extract_pumper();a=build_aerial(cab)
clean();cab=extract_pumper();b=build_medi(cab)
products=([('aerial-platform.glb',a)] if a is not None else [])+[('medi-pickup.glb',b)]
for file,meta in products:
 raw=(OUT/file).read_bytes(); gltf=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);tri=0;draw=0
 for mesh in gltf.get('meshes',[]):
  for p in mesh['primitives']:
   draw+=1;acc=p.get('indices',p.get('attributes',{}).get('POSITION'));count=gltf['accessors'][acc]['count'] if acc is not None else 0;tri+=count//3
 meta['triangles']=tri;meta['drawCalls']=draw;meta['glbBytes']=len(raw);(OUT/file.replace('.glb','.json')).write_text(json.dumps(meta,indent=2))
 print(file,tri,'triangles',draw,'draws',len(raw),'bytes')

provenance_path=SRC/'fleet-provenance.json'
provenance=json.loads(provenance_path.read_text(encoding='utf8'))
provenance['created']='2026-11-03'
provenance['builder']='tools/blender/build_station1_fleet.py'
provenance['source']['sha256']=hashlib.sha256(PUMPER.read_bytes()).hexdigest()
provenance['outputs']=[]
for relative,path in [
 ('assets-source/vehicles/aerial-platform.blend',SRC/'aerial-platform.blend'),
 ('assets-source/vehicles/medi-pickup.blend',SRC/'medi-pickup.blend'),
 ('city-explorer/assets/vehicles/aerial-platform.glb',OUT/'aerial-platform.glb'),
 ('city-explorer/assets/vehicles/aerial-platform.json',OUT/'aerial-platform.json'),
 ('city-explorer/assets/vehicles/medi-pickup.glb',OUT/'medi-pickup.glb'),
 ('city-explorer/assets/vehicles/medi-pickup.json',OUT/'medi-pickup.json')]:
 raw=path.read_bytes();provenance['outputs'].append({'path':relative,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
provenance['notes']=[
 'No purchased models or external textures were added.',
 'Generic original markings; no manufacturer identity or claim of an exact Peterborough fleet replica.',
 'GLB geometry is authored in Blender; runtime articulation and piston tracking are controlled in Three.js.',
 'Aerial body is 12.97 m long by measured exported bounds; axle-center wheelbase is 7.14 m. Telescoping section lengths and outrigger travel remain independent of the chassis length adjustment.',
 'Medi is an original crew-cab pickup with fitted charcoal canopy and generated shaped wheel arches.'
]
provenance_path.write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')
