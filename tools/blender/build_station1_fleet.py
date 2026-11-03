"""Build original Station 1 aerial platform and medical pickup. Blender 5.2.

Axes: +Y up, -Z forward. The source pumper GLB is only used to extract the
actual cab and wheel/beacon meshes; new apparatus bodies are authored here.
"""
import bpy, math, json
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
 ('Rescue red',RED,.22,.32,0),('Graphite',DARK,.22,.3,0),('Deep black',BLACK,.18,.3,0),
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
 sc.render.image_settings.file_format='PNG';sc.render.filepath=str(path);sc.world.color=(.11,.13,.16)
 bpy.ops.mesh.primitive_plane_add(size=36,location=xyz((0,-.03,0)));floor=bpy.context.object;floor.name='Preview ground';floor.data.materials.append(M['Graphite'])
 def area(loc,power,size):
  bpy.ops.object.light_add(type='AREA',location=xyz(loc));l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size
  l.rotation_euler=(Vector(xyz((0,1,0)))-l.location).to_track_quat('-Z','Y').to_euler()
 area((8,13,-8),1800,9);area((-8,8,3),1300,8);area((1,9,11),1100,7)
 bpy.ops.object.camera_add(location=xyz(camera_game));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=scale
 cam.rotation_euler=(Vector(xyz(target_game))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;sc.render.filepath=str(path)
 bpy.ops.render.render(write_still=True)

def build_aerial(cab):
 parts=[]
 # Tandem rescue chassis / apparatus box, with two exposed axle openings.
 parts += [box('Tandem frame',(0,.75,.0),(2.16,.38,11.8),'Deep black'),
 box('Rescue body lower',(0,1.42,1.85),(2.46,1.45,5.45),'Rescue red'),
 box('Upper locker bridge',(0,2.18,1.9),(2.48,.76,5.35),'Rescue red'),
 box('Cab bumper',(0,.63,-5.05),(2.62,.3,.42),'Chrome'),
 box('Aerial grille',(0,1.22,-4.89),(1.12,.84,.08),'Chrome'),
 box('Windshield',(0,2.32,-4.3),(2.06,.92,.045),'Safety glass')]
 parts += [box('Aerial cab lower',(0,1.28,-2.72),(2.24,.78,3.45),'Rescue red'),
           box('Aerial cab roof',(0,2.29,-2.79),(2.28,1.24,2.53),'Graphite'),
           box('Aerial hood',(0,1.12,-3.91),(2.15,.55,1.25),'Rescue red'),
           box('Aerial windshield',(0,2.28,-4.08),(1.94,.83,.045),'Safety glass'),
           box('Aerial grille mesh',(0,1.1,-4.55),(.9,.56,.05),'Deep black')]
 for side in (-1,1):
  for z,w in [(-3.48,.72),(-2.58,.76),(-1.65,.7)]:
   parts += [box('Crew door',(side*1.13,1.43,z),(.04,.68,w),'Rescue red'),box('Crew glazing',(side*1.145,2.3,z),(.03,.78,w-.1),'Safety glass'),box('Crew handle',(side*1.17,1.54,z+.23),(.06,.07,.17),'Chrome')]
  for z in [-2.8,2.45,4.18]:
   parts += [box('Locker surround',(side*1.245,1.6,z),(.06,1.33,1.22),'Chrome'),box('Locker roll-up',(side*1.282,1.61,z),(.025,1.2,1.1),'Aluminum')]
   for j in range(10):parts.append(box('Locker slat',(side*1.3,.99+j*.13,z),(.012,.018,1.04),'Chrome',.004))
  parts += [box('Pump panel',(side*1.3,1.55,-.35),(.06,1.1,.9),'Aluminum')]
  for i in range(4):parts += [cyl('Pump gauge',(side*1.34,1.8,-.64+i*.19),.062,.035,'Chrome','X'),cyl('Gauge face',(side*1.362,1.8,-.64+i*.19),.045,.018,'Ivory','X')]
  # dual rear wheels and individual step/fender detail
 for x in [-.78,-.52,-.26,0,.26,.52,.78]:
  parts.append(box('Ladder storage cradle',(x,2.92,1.88),(.07,.1,5.5),'Chrome'))
 # Four named warning beacons; originals are also present as source-mesh extracts in cab files (source metadata).
 beaconpos=[('Beacon_L',(-.9,3.08,-4.0)),('Beacon_R',(.9,3.08,-4.0)),('Beacon_RearL',(-.95,2.7,4.45)),('Beacon_RearR',(.95,2.7,4.45))]
 # Reusable original pumper cab face/body meshes, dimension-aligned to this chassis.
 parts+=add_cab(cab,.94,.1,.88,.94)
 join_by_material(parts,'AerialBody')
 # separate wheel pivots (source tread mesh profile reused by shape, named wheel contract)
 for nm,x,z in [('FL',-1.13,-3.1),('FR',1.13,-3.1),('RL',-1.13,2.2),('RR',1.13,2.2),('RL2',-1.13,3.55),('RR2',1.13,3.55)]:
  pivot=bpy.data.objects.new(f'Wheel_{nm}',None);bpy.context.collection.objects.link(pivot);pivot.location=xyz((x,.62,z))
  source=SOURCE_WHEELS['Wheel_FL' if nm in ('FL','FR') else 'Wheel_RL'].copy();wheel=bpy.data.objects.new('Original pumper wheel geometry',source);bpy.context.collection.objects.link(wheel);wheel.parent=pivot
 for name,pos in beaconpos:
  node=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(node);node.location=xyz(pos)
  mesh=SOURCE_BEACONS['Beacon_L' if name.endswith('_L') else 'Beacon_R'].copy()
  for v in mesh.vertices:v.co*=.6
  lens=bpy.data.objects.new('Original pumper beacon mesh',mesh);bpy.context.collection.objects.link(lens);lens.parent=node
 # Four actuated outriggers extend laterally; jack position is under beam near outer tip.
 for short,sgn,z in [('FL',-1,-3.75),('FR',1,-3.75),('RL',-1,3.45),('RR',1,3.45)]:
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
 for i in range(1,4):
  node=bpy.data.objects.new(f'LadderSection_{i}',None);bpy.context.collection.objects.link(node);node.parent=sec;node.location=xyz((0,.08,-(.8 if i>1 else 0)));sec=node
  L=5.6
  for x in [-.42,.42]:box('Aluminum ladder rail',(x,.04,-L/2),(.105,.16,L),'Aluminum',.025,node)
  for j in range(21):box('Ladder rung',(0,.04,-.12-j*.265),(.78,.055,.06),'Chrome',.012,node)
  for x in [-.28,.28]:
   box('Nested ladder track',(x,.14,-L/2),(.045,.045,L-.2),'Chrome',.012,node)
 # Foldable terminal fly section hinges at last 5.2 m of section 3, returns basket to z=0 stowed.
 fold=bpy.data.objects.new('KnuckleFold',None);bpy.context.collection.objects.link(fold);fold.parent=sec;fold.location=xyz((0,.1,-5.2))
 section4=bpy.data.objects.new('LadderSection_4',None);bpy.context.collection.objects.link(section4);section4.parent=fold
 for x in [-.3,.3]:box('Fly section rail',(x,0,-1.6),(.08,.13,3.2),'Aluminum',.02,section4)
 for j in range(12):box('Fly ladder rung',(0,0,-.12-j*.26),(.55,.05,.06),'Chrome',.01,section4)
 level=bpy.data.objects.new('BasketLevel',None);bpy.context.collection.objects.link(level);level.parent=section4;level.location=xyz((0,0,-3.2))
 transport=bpy.data.objects.new('BasketFold',None);bpy.context.collection.objects.link(transport);transport.parent=level
 basket=bpy.data.objects.new('Basket',None);bpy.context.collection.objects.link(basket);basket.parent=transport
 box('Rescue basket floor',(0,0,0),(1.25,.12,1.1),'Aluminum',.04,basket)
 box('Basket front lip',(0,.25,-.47),(1.2,.48,.07),'Aluminum',.025,basket)
 for x in [-.58,.58]:
  box('Basket side rail',(x,.42,0),(.07,.84,1.02),'Aluminum',.025,basket)
  for j in range(1,5):box('Basket guard upright',(x,.42,-.5+j*.25),(.055,.8,.055),'Chrome',.015,basket)
 box('Basket back rail',(0,.42,.49),(1.2,.84,.06),'Aluminum',.02,basket)
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
 # Vehicle model dimensions and operational bounds; assembly composed under root for export.
 root=bpy.data.objects.new('AerialPlatform',None);bpy.context.collection.objects.link(root)
 for o in list(bpy.context.scene.objects):
  if o!=root and o.parent is None:o.parent=root
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'aerial-platform.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'aerial-platform.glb'),export_format='GLB',export_yup=True,export_extras=True)
 preview=ROOT/'test-artifacts'/'fleet';preview.mkdir(parents=True,exist_ok=True)
 render_preview(preview/'aerial-platform-stowed.png',(12,10,-15),(0,2,0),13)
 pitch.rotation_euler.x=.72;section2=bpy.data.objects.get('LadderSection_2');section3=bpy.data.objects.get('LadderSection_3')
 section2.location=xyz((0,.08,-5.6));section3.location=xyz((0,.08,-5.6));fold.rotation_euler.x=0;level.rotation_euler.x=-.72;transport.rotation_euler.x=0
 render_preview(preview/'aerial-platform-deployed.png',(18,14,-22),(0,5,-6),22)
 return {'name':'Station 1 aerial platform','units':'metres','forward':'-Z','up':'+Y','dimensions':{'length':11.8,'width':2.55,'height':4.28},'pivotContract':{'TurntableYaw':{'position':[0,2.95,4.4]},'LadderPitch':{'rest':'0 rad, ladder axis -Z'},'LadderSection_1..3':{'restOffsetsZ':[0,-.8,-.8],'length':5.6,'maxStageShift':4.8},'KnuckleFold':{'parent':'LadderSection_3','position':[0,.1,-5.2],'axis':'local X','deployedRad':0,'stowedRad':math.pi,'sectionLength':3.2},'LadderSection_4':{'parent':'KnuckleFold','length':3.2},'BasketLevel':{'parent':'LadderSection_4','position':[0,0,-3.2],'compensation':'-(LadderPitch.rotation.x+KnuckleFold.rotation.x)'},'BasketFold':{'deployedRad':0,'transportRad':math.pi/2},'Basket':{'parent':'BasketFold'},'MonitorYaw':{'position':[0,-.24,0],'parent':'Basket'},'MonitorPitch':{'parent':'MonitorYaw','rangeRad':[-math.pi/2,math.pi/3]},'NozzleOutlet':{'parent':'MonitorPitch','position':[0,0,-.53],'axis':'-Z','underside':True},'Outrigger_FL/FR/RL/RR':{'restX':0,'jackRestX':'sign*1.15','travelX':'sign*1.6','deployedPadX':'sign*2.75','jackNodes':'Jack_FL/FR/RL/RR','jackRestHeight':.52,'footPlateLocalY':0,'jackStroke':1.0,'ramChildCenterY':.28,'housingCenterY':-.25},'ElevationRam_L/R':{'baseNodes':'Cylinder_Base_L/R','tipNodes':'Cylinder_Tip_L/R'}},'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'triangles':0,'drawCalls':0,'source':'Original apparatus with selectively extracted generic pumper cab faces, wheels, and beacon meshes','wheelSimplificationRatio':.3,'commercialUse':'Project-created generic geometry and source project meshes; no external assets'}

def build_medi(cab):
 parts=[]
 # Cab shell from actual pumper and true 4-door pickup dimensions.
 # The pickup uses an original shorter crew-cab envelope, while aerial uses the extracted pumper cab geometry.
 parts += [box('Pickup frame',(0,.48,0),(1.72,.24,6.5),'Deep black'),box('Cab front bumper',(0,.57,-3.18),(2.15,.27,.38),'Chrome'),
 box('Grille',(0,1.08,-3.02),(.85,.62,.06),'Chrome'),box('Pickup bed floor',(0,.9,1.66),(1.75,.18,2.4),'Deep black')]
 parts += [box('Pickup hood',(0,1.04,-2.43),(1.88,.48,1.5),'Rescue red'),
           box('Pickup four-door cabin',(0,1.2,-1.02),(1.9,.85,1.95),'Rescue red'),
           box('Pickup cab roof',(0,2.48,-1.02),(1.94,.12,1.78),'Graphite'),
           box('Pickup windshield',(0,2.03,-2.02),(1.68,.75,.04),'Safety glass'),
           box('Pickup lower grille',(0,1.1,-3.2),(.72,.4,.04),'Deep black'),
           box('Pickup headlamp',(-.68,1.1,-3.215),(.3,.22,.025),'Ivory'),box('Pickup headlamp',(.68,1.1,-3.215),(.3,.22,.025),'Ivory')]
 for side in [-1,1]:
  for z,w in [(-1.56,.7),(-.68,.72)]:
   parts += [box('Pickup front door',(side*.96,1.2,z),(.04,.78,w),'Rescue red'),box('Pickup side glass',(side*.985,2.05,z),(.03,.7,w-.1),'Safety glass'),box('Pickup door handle',(side*1.01,1.27,z+.22),(.04,.06,.14),'Chrome')]
  parts += [box('Canopy side',(side*.91,1.57,1.55),(.08,1.38,2.55),'Medical white'),box('Canopy upper',(side*.45,2.27,1.55),(.95,.12,2.55),'Medical white'),
   box('Canopy roll-up locker',(side*.96,1.68,1.58),(.025,.9,1.8),'Aluminum'),box('Red rescue stripe',(side*.97,1.77,1.56),(.02,.17,2.3),'Rescue red'),
   box('Canopy rear door',(side*.12,1.55,2.84),(1.65,1.28,.09),'Medical white')]
  for z in [.62,1.2,1.8,2.42]:parts.append(box('Canopy storage door seam',(side*.985,1.6,z),(.02,.018,.95),'Chrome',.005))
  # Full enclosed hard shell with separate cab canopy partition, no open bed.
 parts += [box('Canopy roof',(0,2.31,1.73),(1.82,.12,2.91),'Medical white'),box('Canopy front',(0,1.59,.29),(1.82,1.42,.08),'Medical white'),box('Canopy rear', (0,1.59,3.22),(1.82,1.42,.08),'Medical white'),
 box('Rear window',(0,2.03,3.27),(1.05,.42,.025),'Safety glass'),box('Rear rescue stripe',(0,1.48,3.28),(.85,.16,.035),'Rescue red'),
 box('Medical cross vertical',(0,1.48,3.31),(.07,.26,.025),'Rescue gold'),box('Medical cross horizontal',(0,1.48,3.31),(.25,.07,.025),'Rescue gold')]
 # Powered enclosed-wheel pickup details and authentic four independent source-profile wheels.
 for side in [-1,1]:
  for z,nm in [(-2.02,'F'),(2.05,'R')]:
   parts += [box('Pickup wheel arch',(side*1.0,.76,z),(.1,1.08,1.15),'Medical white'),cyl('Wheelnut',(side*1.06,.62,z),.3,.06,'Chrome','X')]
 beaconpos=[((-.7,2.7,-1.35),'Beacon_L'),((.7,2.7,-1.35),'Beacon_R'),((-.7,2.6,2.55),'Beacon_RearL'),((.7,2.6,2.55),'Beacon_RearR')]
 # Roof lightbar and functional side access steps.
 parts += [box('LED lightbar base',(0,2.6,-1.35),(1.6,.08,.25),'Chrome'),box('Pickup side step',(-1.03,.55,-.56),(.3,.12,1.5),'Aluminum'),box('Pickup side step',(1.03,.55,-.56),(.3,.12,1.5),'Aluminum')]
 join_by_material(parts,'MediPickup')
 for nm,x,z in [('FL',-0.93,-2.02),('FR',.93,-2.02),('RL',-.93,2.05),('RR',.93,2.05)]:
  pivot=bpy.data.objects.new('Wheel_'+nm,None);bpy.context.collection.objects.link(pivot);pivot.location=xyz((x,.62,z))
  source=SOURCE_WHEELS['Wheel_FL' if nm in ('FL','FR') else 'Wheel_RL'].copy()
  for v in source.vertices:v.co*=.9
  wheel=bpy.data.objects.new('Original pumper wheel geometry scaled for pickup',source);bpy.context.collection.objects.link(wheel);wheel.parent=pivot
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
 return {'name':'Station 1 medical response pickup','units':'metres','forward':'-Z','up':'+Y','dimensions':{'length':6.7,'width':2.1,'height':2.6},'measuredBounds':{'length':6.7,'width':2.36,'height':2.59},'wheelbase':4.07,'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'fourDoorCab':True,'fullyEnclosedCanopy':True,'body':'Fire-red four-door pickup cab with a white enclosed equipment canopy and roll-up side lockers','ambulance':False,'source':'Original pickup cab/canopy with selectively reused generic pumper wheel and beacon meshes','wheelSimplificationRatio':.3,'commercialUse':'Project-created generic geometry and source project meshes; no external assets'}

def render_contact():
 # Render authored GLB scenes individually through Blender, with a clean neutral studio setup.
 # Asset previews are generated in the Blender render stage and assembled by preview utility.
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1100;scene.render.resolution_y=720;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.world.color=(.12,.14,.17);scene.render.film_transparent=False

clean();cab=extract_pumper();a=build_aerial(cab)
clean();cab=extract_pumper();b=build_medi(cab)
for file,meta in [('aerial-platform.glb',a),('medi-pickup.glb',b)]:
 raw=(OUT/file).read_bytes(); gltf=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);tri=0;draw=0
 for mesh in gltf.get('meshes',[]):
  for p in mesh['primitives']:
   draw+=1;acc=p.get('indices',p.get('attributes',{}).get('POSITION'));count=gltf['accessors'][acc]['count'] if acc is not None else 0;tri+=count//3
 meta['triangles']=tri;meta['drawCalls']=draw;meta['glbBytes']=len(raw);(OUT/file.replace('.glb','.json')).write_text(json.dumps(meta,indent=2))
 print(file,tri,'triangles',draw,'draws',len(raw),'bytes')
