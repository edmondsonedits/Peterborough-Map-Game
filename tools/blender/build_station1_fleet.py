"""Build original Station 1 aerial platform and medical pickup. Blender 5.2.

Axes: +Y up, -Z forward. The source pumper GLB is only used to extract the
actual cab and wheel/beacon meshes; new apparatus bodies are authored here.
"""
import bpy, math, json, hashlib, sys, argparse
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'city-explorer/assets/vehicles'; SRC=ROOT/'assets-source/vehicles'
PUMPER=OUT/'generic-pumper.glb'
OUT.mkdir(parents=True,exist_ok=True); SRC.mkdir(parents=True,exist_ok=True)
RED=(.52,.012,.02,1); DARK=(.018,.025,.032,1); BLACK=(.008,.012,.016,1)
GLASS=(.018,.07,.09,1); SIL=(.63,.69,.71,1); CHROME=(.84,.88,.88,1)
RUB=(.019,.022,.026,1); WHITE=(.88,.9,.86,1); AMBER=(1,.31,.025,1)
GOLD=(.94,.63,.13,1); BLUE=(.025,.25,.66,1); MEDWHITE=(.87,.89,.88,1)

def mat(name,c,metal=0,rough=.38,em=0):
 m=bpy.data.materials.new(name);m.diffuse_color=c;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=c;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if em:p.inputs['Emission Color'].default_value=c;p.inputs['Emission Strength'].default_value=em
 return m
M={k:mat(k,c,me,ro,em) for k,c,me,ro,em in [
 ('Rescue red',RED,.18,.27,0),('Graphite',DARK,.22,.3,0),('Deep black',BLACK,.18,.3,0),('Cap Charcoal',(.014,.018,.023,1),0,.78,0),
 ('Safety glass',GLASS,.42,.16,0),('Aluminum',SIL,.72,.3,0),('Chrome',(.92,.95,.96,1),.92,.14,0),
 ('Rubber',RUB,0,.86,0),('Ivory',WHITE,.1,.28,0),('Amber',AMBER,.1,.25,.25),
 ('Rescue gold',GOLD,.3,.4,0),('Medical blue',BLUE,.16,.34,0),('Medical white',MEDWHITE,.14,.32,0),
 ('Warning red',(.88,.012,.015,1),.1,.23,.32),('Headlamp optics',(.84,.91,.96,1),.12,.18,.08),
 ('Brake lamp optics',(.84,.018,.024,1),.12,.2,.06),('Reverse lamp optics',(.84,.91,.89,1),.12,.2,.06),
 ('Hose',(.54,.46,.31,1),0,.9,0),('Deck Grip',(.038,.048,.052,1),.08,.84,0),('Reflective Gold',(.98,.64,.08,1),.12,.34,.04)]}
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

def raised_label(name, words, position, normal, size, material):
    outward=Vector(normal)
    up=Vector((0,1,0))
    right=up.cross(outward)
    basis=Matrix((xyz(right),xyz(up),xyz(outward))).transposed()
    data=bpy.data.curves.new(name,'FONT')
    data.body=words
    data.align_x='CENTER'
    data.align_y='CENTER'
    data.size=size
    data.extrude=.0009
    data.resolution_u=5
    data.materials.append(M[material])
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=xyz(position)
    obj.rotation_euler=basis.to_euler()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def rear_markings():
    # Clip opposed diagonal reflector bars to the actual rear door surround.
    vertices, faces = [], []
    for side in (-1,1):
        for start in (-.68,-.36,-.04,.28,.60,.92):
            for layer in range(8):
                t0,t1=layer/8,(layer+1)/8
                lo0,lo1=start+t0*.66,start+t1*.66
                lo0,hi0=max(.06,lo0),min(1.14,lo0+.151)
                lo1,hi1=max(.06,lo1),min(1.14,lo1+.151)
                if hi0<=lo0 and hi1<=lo1:
                    continue
                lo0,lo1=min(lo0,1.14),min(lo1,1.14)
                hi0,hi1=max(lo0,hi0),max(lo1,hi1)
                y0,y1=1.26+1.11*t0,1.26+1.11*t1
                points=[(side*lo0,y0,5.891),(side*hi0,y0,5.891),(side*hi1,y1,5.891),(side*lo1,y1,5.891)]
                i=len(vertices)
                vertices.extend(xyz(p) for p in points)
                face=tuple(range(i,i+4))
                faces.append(face if side>0 else face[::-1])
    mesh=bpy.data.meshes.new('Rear chevron marking mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(M['Reflective Gold'])
    obj=bpy.data.objects.new('Red and gold rear chevron field',mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def build_aerial(cab):
 parts=[];lamps=[]
 # Tandem rescue chassis / apparatus box, with two exposed axle openings.
 parts += [box('Tandem frame',(0,.75,.6),(2.16,.38,11.4),'Deep black'),
 box('Rescue body lower sill',(0,.9975,2.0),(2.46,.605,7.6),'Rescue red'),
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
 # A genuine open-top well replaces solid body boxes beneath the basket.
 # Fore-aft body geometry is stretched later; these boundaries are authored in final metres.
 pocket_z0=-1.12/1.09;pocket_z1=.85/1.09
 for side in (-1,1):
  parts.append(box('Stow well side locker',(side*1.025,1.95,2.0),(.43,1.30,7.6),'Rescue red'))
  parts.append(box('Stow well inner lining',(side*.805,1.955,(pocket_z0+pocket_z1)/2),(.035,1.29,pocket_z1-pocket_z0),'Graphite',.015))
  parts.append(box('Stow well alloy lip',(side*.83,2.615,(pocket_z0+pocket_z1)/2),(.10,.075,pocket_z1-pocket_z0+.12),'Aluminum',.018))
 for za,zb in [(-1.8,pocket_z0),(pocket_z1,5.8)]:
  parts.append(box('Stow well end locker',(0,1.95,(za+zb)/2),(1.62,1.30,zb-za),'Rescue red'))
 for z in (pocket_z0,pocket_z1):
  parts.append(box('Stow well end liner',(0,1.955,z),(1.60,1.29,.035),'Graphite',.015))
  parts.append(box('Stow well end rim',(0,2.615,z),(1.75,.075,.10),'Aluminum',.018))
 stow_floor=box('BasketStowFloor',(0,1.325,(pocket_z0+pocket_z1)/2),(1.58,.05,pocket_z1-pocket_z0-.04),'Deck Grip',.015)
 # Three axles receive molded half-round fender lips, leaving tire pivots clear.
 for side in (-1,1):
  for axle,z in enumerate((-3.1,2.8,4.1),1):
   fender=wheel_arch(f'Aerial fender lip {side} {axle}',side,z,cy=.64,outer=.77,inner=.58);fender.location.x+=side*.23;parts.append(fender)
  parts.append(box('Lower side reflective gold band',(side*1.242,.84,2.0),(.032,.105,7.22),'Reflective Gold',.018))
  parts.append(box('Lower side ivory pinstripe',(side*1.244,.95,2.0),(.034,.035,7.2),'Ivory',.01))
 # Textured roof walk strips flank the stored ladder without changing cradle geometry.
 for side in (-1,1):
  parts.append(box('Roof non-slip walkway',(side*1.045,2.615,2.0),(.30,.10,6.45),'Deck Grip',.025))
  for i in range(24):parts.append(box('Walkway anti-slip transverse bar',(side*1.045,2.672,-1.0+i*.26),(.265,.025,.035),'Aluminum',.008))
 # Corner bumper pads, recovery eyes, and side access tread plates finish the chassis edge.
 for side in (-1,1):
  parts += [box('Front bumper corner step',(side*1.11,.58,-5.13),(.27,.22,.40),'Graphite',.065),
   box('Rear bumper corner step',(side*1.13,.58,6.21),(.27,.22,.43),'Graphite',.065),
   box('Side access tread pad',(side*1.34,.63,.72),(.34,.09,.68),'Deck Grip',.025),
   box('Side access tread pad',(side*1.34,.63,1.58),(.34,.09,.68),'Deck Grip',.025)]
 for side in (-1,1):
  parts.append(box('Aerial headlamp housing',(side*.83,1.2,-4.78),(.34,.32,.08),'Deep black',.045))
  label='L' if side<0 else 'R'
  lamps.append(box('Aerial headlamp lens',(side*.83,1.21,-4.83),(.25,.22,.035),'Headlamp optics',.035))
  lamps[-1].name='Headlamp_'+label
  parts += [box('Crew window surround',(side*1.071,2.205,-2.11),(.051,.57,.86),'Graphite',.054),
   box('Tinted crew window',(side*1.103,2.205,-2.11),(.026,.485,.74),'Safety glass',.046),
   box('Crew door waist closeout',(side*1.066,1.63,-2.08),(.065,.60,.86),'Rescue red',.037),
   box('Crew entry pull',(side*1.118,1.77,-1.96),(.039,.065,.15),'Aluminum',.017)]
 for i in range(6):
  parts.append(box('Aerial grille horizontal bar',(0,.91+i*.105,-4.815),(1.06,.028,.026),'Chrome',.012))
 # Extracted Pump 1 cab is the entire cab shell; avoid the old overlapping box stand-in.
 # Body lockers begin behind the cab's rear axle, with side access steps and a split rear deck.
 for side in (-1,1):
  for z in [0.0,2.55,4.35]:
   parts += [box('Locker surround',(side*1.245,1.6,z),(.06,1.33,1.34),'Rescue red',.04),box('Locker roll-up',(side*1.282,1.61,z),(.025,1.2,1.18),'Aluminum',.025)]
   for j in range(10):parts.append(box('Locker slat',(side*1.3,.99+j*.13,z),(.012,.018,1.1),'Chrome',.006))
   parts += [box('Locker latch',(side*1.33,1.7,z+.51),(.025,.16,.07),'Deep black',.018),
    box('Locker pull handle',(side*1.34,1.39,z+.51),(.035,.085,.24),'Graphite',.018),
    box('Locker hinge barrel',(side*1.324,2.17,z),(.055,.09,.88),'Rescue red',.022)]
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
   box('Rear tail lamp amber',(side*1.01,1.12,6.03),(.22,.17,.07),'Amber',.03)]
  label='L' if side<0 else 'R'
  lamps.append(box('Rear tail brake lens',(side*1.01,1.43,6.03),(.22,.28,.07),'Brake lamp optics',.035))
  lamps[-1].name='BrakeLamp_'+label
  lamps.append(box('Rear reverse lens',(side*1.01,.91,6.03),(.22,.13,.07),'Reverse lamp optics',.025))
  lamps[-1].name='ReverseLamp_'+label
 # Rear-facing work lamps mount high above the warning panel, with protective bezels.
 for side in (-1,1):
  parts += [box('Rear work lamp bezel',(side*.72,2.47,5.91),(.42,.28,.09),'Graphite',.035),
   box('Rear work lamp lens',(side*.72,2.48,5.965),(.32,.18,.025),'Ivory',.02),
   box('Rear marker lamp',(side*.98,2.45,5.91),(.13,.2,.08),'Amber',.022)]
 parts.append(rear_markings())
 parts.append(box('Rear unit identification plate',(0,2.26,5.933),(.98,.211,.048),'Graphite',.024))
 parts.append(raised_label('Rear Aerial 1 identification','AERIAL 1',(0,2.255,5.962),(0,0,1),.153,'Ivory'))
 for side in (-1,1):
  parts.append(raised_label('Upper side apparatus ID','AERIAL 1',(side*1.246,2.42,1.42),(side,0,0),.198,'Ivory'))
  parts.append(raised_label('Crew agency label','FIRE RESCUE',(side*1.104,1.573,-2.12),(side,0,0),.074,'Rescue gold'))
  parts.append(box('Front warning light plinth',(side*.9,2.989,-4.0),(.38,.108,.192),'Deep black',.031))
  parts.append(box('Rear deck warning light plinth',(side*.95,2.62,4.45),(.36,.128,.192),'Deep black',.027))
 for x in [-.78,.78]:
  parts.append(box('Ladder storage cradle',(x,2.92,1.88),(.07,.1,5.5),'Chrome'))
 # Four named warning beacons; originals are also present as source-mesh extracts in cab files (source metadata).
 beaconpos=[('Beacon_L',(-.9,3.08,-4.0)),('Beacon_R',(.9,3.08,-4.0)),('Beacon_RearL',(-.95,2.7,4.45)),('Beacon_RearR',(.95,2.7,4.45))]
 # Reusable original pumper cab face/body meshes, dimension-aligned to this chassis.
 parts+=add_cab(cab,.94,.1,.88,.94)
 parts=[o for o in bpy.context.scene.objects if o.parent is None and o not in lamps and o!=stow_floor]
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
 box('Turntable base',(0,0,0),(1.55,.36,1.7),'Graphite',.08,yaw)
 box('Turntable upper deck',(0,.23,0),(1.40,.16,1.48),'Aluminum',.06,yaw)
 cyl('Slew bearing',(0,.34,0),.65,.18,'Chrome',parent=yaw,verts=40)
 cyl('Turntable gear rim',(0,.445,0),.52,.075,'Graphite',parent=yaw,verts=40)
 for bolt in range(16):
  ang=math.tau*bolt/16
  cyl('Turntable bearing bolt',(.58*math.cos(ang),.455,.58*math.sin(ang)),.032,.045,'Ivory',parent=yaw,verts=12)
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
 # An underslung knuckle carries the folded fly below the nested main ladder.
 # Rear basket yoke leaves the standing area open instead of crossing an occupant.
 for side in (-1,1):
  box('Knuckle drop bracket',(side*.43,-.235,-5.2),(.14,.65,.25),'Aluminum',.035,sec)
  rod('Knuckle bracket brace',(side*.43,-.05,-4.55),(side*.43,-.49,-5.2),.07,'Chrome',sec)
  cyl('Knuckle hinge pin',(side*.43,-.52,-5.2),.15,.21,'Chrome','X',sec)
 fold=bpy.data.objects.new('KnuckleFold',None);bpy.context.collection.objects.link(fold);fold.parent=sec;fold.location=xyz((0,-.52,-5.2))
 section4=bpy.data.objects.new('LadderSection_6',None);bpy.context.collection.objects.link(section4);section4.parent=fold
 for x in [-.3,.3]:box('Fly section rail',(x,0,-2.25),(.08,.13,4.5),'Aluminum',.02,section4)
 for j in range(17):box('Fly ladder rung',(0,0,-.12-j*.26),(.55,.05,.06),'Chrome',.01,section4)
 level=bpy.data.objects.new('BasketLevel',None);bpy.context.collection.objects.link(level);level.parent=section4;level.location=xyz((0,0,-4.5))
 transport=bpy.data.objects.new('BasketFold',None);bpy.context.collection.objects.link(transport);transport.parent=level
 basket=bpy.data.objects.new('Basket',None);bpy.context.collection.objects.link(basket);basket.parent=transport;basket.location=xyz((0,-.9,-.7))
 for side in (-1,1):
  rod('Basket rear yoke arm',(side*.36,0,0),(side*.65,-.83,-.21),.065,'Aluminum',level)
  cyl('Basket leveling hub',(side*.36,0,0),.13,.12,'Chrome','X',level)
 box('Basket rear yoke crossmember',(0,-.83,-.21),(1.30,.10,.10),'Aluminum',.025,level)
 box('Rescue basket floor',(0,0,0),(1.25,.12,1.1),'Deck Grip',.04,basket)
 for i in range(7):box('Basket floor grip bar',(0,.065,-.43+i*.14),(1.12,.018,.035),'Aluminum',.006,basket)
 box('Basket front top rail',(0,.69,-.48),(1.2,.07,.07),'Chrome',.025,basket)
 box('Basket front lower rail',(0,.16,-.48),(1.2,.06,.06),'Aluminum',.02,basket)
 for x in [-.57,-.29,0,.29,.57]:box('Basket front guard upright',(x,.43,-.48),(.045,.48,.045),'Chrome',.012,basket)
 for x in [-.58,.58]:
  if x<0:
   box('Basket side top rail',(x,.69,0),(.07,.07,1.02),'Chrome',.02,basket)
   box('Basket side lower rail',(x,.16,0),(.06,.06,1.02),'Aluminum',.018,basket)
   for z in [-.48,-.16,.16,.48]:box('Basket side guard upright',(x,.42,z),(.055,.48,.055),'Chrome',.015,basket)
  else:
   # Hinged entry side leaves a clear opening between its fixed corner posts.
   for z in [-.48,.48]:
    box('Basket gate hinge post',(x,.42,z),(.055,.48,.055),'Chrome',.015,basket)
    box('Basket gate post cap',(x,.69,z),(.09,.055,.09),'Amber',.012,basket)
 # Outboard side access gate with a visible upper latch.
 gate=bpy.data.objects.new('PlatformAccessGate',None);bpy.context.collection.objects.link(gate);gate.parent=basket;gate.location=xyz((.58,.42,0))
 box('Platform gate upper rail',(0,.27,-.02),(.055,.055,.84),'Chrome',.014,gate)
 box('Platform gate lower rail',(0,-.16,-.02),(.05,.05,.84),'Aluminum',.014,gate)
 for z in [-.36,.32]:box('Platform gate upright',(0,.055,z),(.045,.34,.045),'Chrome',.012,gate)
 box('Platform gate latch',(0,.23,.38),(.09,.10,.08),'Amber',.018,gate)
 box('Basket rear top rail',(0,.69,.49),(1.2,.07,.07),'Chrome',.02,basket)
 box('Basket rear lower rail',(0,.16,.49),(1.2,.06,.06),'Aluminum',.018,basket)
 for x in [-.57,-.29,0,.29,.57]:box('Basket rear guard upright',(x,.42,.49),(.045,.48,.045),'Chrome',.012,basket)
 # Operator controls and standing point are placed on the basket interior floor.
 basket_stand=bpy.data.objects.new('BasketStand',None);bpy.context.collection.objects.link(basket_stand);basket_stand.parent=basket;basket_stand.location=xyz((0,.075,-.02))
 box('Basket operator control housing',(.43,.37,.31),(.18,.45,.25),'Graphite',.035,basket)
 box('Basket control face',(.43,.4,.2),(.19,.3,.025),'Aluminum',.018,basket)
 box('Basket control display',(.43,.51,.178),(.14,.10,.025),'Medical blue',.014,basket)
 box('Basket control legend strip',(.43,.29,.177),(.14,.035,.02),'Ivory',.006,basket)
 box('Basket joystick guard',(.43,.39,.15),(.16,.035,.06),'Amber',.01,basket)
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
 fold.rotation_euler.x=-math.pi;level.rotation_euler.x=math.pi;transport.rotation_euler.x=0
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
 render_preview(preview/'aerial-platform-front.png',(0,7,-16),(0,1.5,-.4),13)
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
 ladder_sections=[{'node':f'LadderSection_{i}','length':5.6,'travel':0 if i==1 else 4.8} for i in range(1,6)]+[{'node':'LadderSection_6','length':4.5,'travel':0}]
 contract={'TurntableYaw':{'position':[0,2.95,4.796]},'LadderPitch':{'rest':'0 rad, ladder axis -Z'},'ladderSections':ladder_sections,'KnuckleFold':{'parent':'LadderSection_5','position':[0,-.52,-5.2],'axis':'local X','deployedRad':0,'stowedRad':-math.pi,'sectionLength':4.5},'BasketLevel':{'parent':'LadderSection_6','position':[0,0,-4.5],'compensation':'-(LadderPitch.rotation.x+KnuckleFold.rotation.x)'},'BasketFold':{'deployedRad':0,'transportRad':0},'Basket':{'parent':'BasketFold','position':[0,-.9,-.7],'alwaysLevel':True},'BasketStand':{'parent':'Basket','position':[0,.075,-.02],'feetAtFloor':True},'BasketControls':{'parent':'Basket','position':[.43,.4,.18]},'RearControls':{'node':'RearControls','position':[0,1.66,6.507],'orientation':'outward-facing from rear deck'},'RearOperator':{'node':'RearOperator','feet':[0,0,7.85],'facing':'-Z'},'MonitorYaw':{'position':[0,-.24,0],'parent':'Basket'},'MonitorPitch':{'parent':'MonitorYaw','rangeRad':[-math.pi/2,math.pi/3]},'NozzleOutlet':{'parent':'MonitorPitch','position':[0,0,-.53],'axis':'-Z','underside':True},'Outrigger_FL/FR/RL/RR':{'restX':0,'jackRestX':'sign*1.15','travelX':'sign*1.6','deployedPadX':'sign*2.75','jackNodes':'Jack_FL/FR/RL/RR','jackRestHeight':.52,'footPlateLocalY':0,'jackStroke':1.0,'ramChildCenterY':.28,'housingCenterY':-.25},'stabilizerBeamTravel':1.6,'wheelRadius':.56,'wheelbase':7.14,'jackFootSole':-.06,'ElevationRam_L/R':{'baseNodes':'Cylinder_Base_L/R','tipNodes':'Cylinder_Tip_L/R'}}
 return {'name':'Station 1 aerial platform','units':'metres','forward':'-Z','up':'+Y','dimensions':{'length':12.97,'width':2.55,'height':4.42},'stowPocket':{'min':[-.78,1.35,-1.10],'max':[.78,2.60,.83],'floorNode':'BasketStowFloor'},'bodyClearance':[{'min':[-1.23,.70,-1.96],'max':[1.23,1.30,6.32]},{'min':[-1.24,1.30,-1.96],'max':[-.81,2.60,6.32]},{'min':[.81,1.30,-1.96],'max':[1.24,2.60,6.32]},{'min':[-.81,1.30,-1.96],'max':[.81,2.60,-1.12]},{'min':[-.81,1.30,.85],'max':[.81,2.60,6.32]}],'cabClearance':{'min':[-1.18,.72,-5.254],'max':[1.18,3.05,-1.145]},'pivotContract':contract,'ladderSections':ladder_sections,'stabilizerBeamTravel':1.6,'wheelRadius':.56,'wheelCenterHeight':.62,'wheelbase':7.14,'jackFootSole':-.06,'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'lampNodes':['Headlamp_L','Headlamp_R','BrakeLamp_L','BrakeLamp_R','ReverseLamp_L','ReverseLamp_R'],'triangles':0,'drawCalls':0,'source':'Original apparatus with selectively extracted generic pumper cab faces, wheels, and beacon meshes','wheelSimplificationRatio':.3,'commercialUse':'Project-created generic geometry and source project meshes'}

def build_medi():
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from build_medi_pickup import create_medi_model

    root,metadata=create_medi_model(M,mat,box,cyl,rod,join_by_material,xyz)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'medi-pickup.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'medi-pickup.glb'),export_format='GLB',export_yup=True,export_extras=True)
    preview=ROOT/'test-artifacts'/'fleet'
    preview.mkdir(parents=True,exist_ok=True)
    render_preview(preview/'medi-pickup.png',(8,4.3,-11),(0,1.12,0),8.4)
    render_preview(preview/'medi-pickup-side.png',(12,3.05,0),(0,1.05,0),8.0)
    render_preview(preview/'medi-pickup-rear.png',(-8,4.8,9),(0,1.08,.1),8.4)
    return metadata

def main(argv=None):
 parser=argparse.ArgumentParser(description='Build original Station 1 fleet assets.')
 group=parser.add_mutually_exclusive_group()
 group.add_argument('--aerial-only',action='store_true',help='Build only the aerial platform asset and provenance.')
 group.add_argument('--medi-only',action='store_true',help='Build only the medical pickup asset and provenance.')
 args=parser.parse_args(argv if argv is not None else (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []))
 a=None;b=None
 if not args.medi_only:
  clean();cab=extract_pumper();a=build_aerial(cab)
 if not args.aerial_only:
  clean();b=build_medi()
 products=([('aerial-platform.glb',a)] if a is not None else [])+([('medi-pickup.glb',b)] if b is not None else [])
 for file,meta in products:
  raw=(OUT/file).read_bytes();gltf=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);tri=0;draw=0
  for mesh in gltf.get('meshes',[]):
   for primitive in mesh['primitives']:
    draw+=1;acc=primitive.get('indices',primitive.get('attributes',{}).get('POSITION'));count=gltf['accessors'][acc]['count'] if acc is not None else 0;tri+=count//3
  meta['triangles']=tri;meta['drawCalls']=draw;meta['glbBytes']=len(raw);(OUT/file.replace('.glb','.json')).write_text(json.dumps(meta,indent=2))
  print(file,tri,'triangles',draw,'draws',len(raw),'bytes')
 provenance_path=SRC/'fleet-provenance.json'
 provenance=json.loads(provenance_path.read_text(encoding='utf8'))
 provenance.setdefault('created','2026-11-03');provenance['updated']='2026-11-05';provenance['builder']='tools/blender/build_station1_fleet.py';provenance['source']['sha256']=hashlib.sha256(PUMPER.read_bytes()).hexdigest()

 generated=[]
 if a is not None: generated += [('assets-source/vehicles/aerial-platform.blend',SRC/'aerial-platform.blend'),('city-explorer/assets/vehicles/aerial-platform.glb',OUT/'aerial-platform.glb'),('city-explorer/assets/vehicles/aerial-platform.json',OUT/'aerial-platform.json')]
 if b is not None: generated += [('assets-source/vehicles/medi-pickup.blend',SRC/'medi-pickup.blend'),('city-explorer/assets/vehicles/medi-pickup.glb',OUT/'medi-pickup.glb'),('city-explorer/assets/vehicles/medi-pickup.json',OUT/'medi-pickup.json')]
 generated_paths={relative for relative,_ in generated}
 provenance['outputs']=[item for item in provenance.get('outputs',[]) if item.get('path') not in generated_paths]
 for relative,path in generated:
  raw=path.read_bytes();provenance['outputs'].append({'path':relative,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
 provenance['notes']=['No purchased models or external textures were added.','Generic original markings; no manufacturer identity or claim of an exact Peterborough fleet replica.','GLB geometry is authored in Blender; runtime articulation and piston tracking are controlled in Three.js.','Aerial body is 12.97 m long by measured exported bounds; axle-center wheelbase is 7.14 m. Telescoping section lengths and outrigger travel remain independent of the chassis length adjustment.','Medi is original Blender geometry based on user-provided crew-cab fire rescue pickup references. No reference photo pixels were used.']
 provenance_path.write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':
 main()
