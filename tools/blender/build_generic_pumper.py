"""Original reference-inspired pumper. Blender 5.x --background --python this_file.
Game coordinates: metres, Y up, forward -Z. Source Blender: Z up, forward +Y.
No reference pixels, manufacturer insignia, or department marks are embedded.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'city-explorer/assets/vehicles'
SOURCE = ROOT / 'assets-source/vehicles'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, rgb, metal=0, rough=.4, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*rgb,1); p.inputs['Emission Strength'].default_value=emission
    return m
red=material('Rescue red',(.4,.008,.014),.25,.3)
black=material('Cab black',(.009,.013,.017),.2,.28)
glass=material('Blue black glazing',(.008,.023,.03),.38,.16)
silver=material('Brushed aluminum',(.57,.63,.66),.72,.3)
chrome=material('Polished metal',(.8,.85,.86),.88,.18)
rubber=material('Tire rubber',(.018,.021,.025),0,.86)
gold=material('Generic gold lettering',(.94,.65,.15),.35,.4)
white=material('White lamps and gauge faces',(.85,.9,.85),.1,.3)
lamp=material('Red warning lenses',(.85,.015,.018),.1,.23,.35)
amber=material('Amber markers',(.95,.35,.02),.1,.3,.3)
hose=material('Woven hose',(.47,.42,.3),0,.95)
static=[]; animated=[]
def xyz(p): return (p[0],-p[2],p[1])
def finish(o,n,m,parts):
    o.name=n; o.data.materials.append(m); parts.append(o); return o
def box(n,p,s,m,bevel=.015,parts=None):
    parts=static if parts is None else parts
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p)); o=bpy.context.object; o.dimensions=(s[0],s[2],s[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Manufactured edge','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,n,m,parts)
def rod(n,a,b,r,m,parts=None,vertices=12):
    parts=static if parts is None else parts
    a,b=Vector(xyz(a)),Vector(xyz(b)); d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return finish(o,n,m,parts)
def text(n,body,p,size,side=0):
    bpy.ops.object.text_add(location=xyz(p)); o=bpy.context.object; o.name=n
    o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size;o.data.extrude=.001
    # Text local normal points outward, local up is world Z.
    normal=Vector((side,0,0)) if side else Vector((0,1,0))
    up=Vector((0,0,1)); right=up.cross(normal)
    from mathutils import Matrix
    o.rotation_euler=Matrix((right,up,normal)).transposed().to_euler()
    bpy.ops.object.convert(target='MESH');finish(bpy.context.object,n,gold,static)
def join(parts,name,origin=(0,0,0)):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=xyz(origin);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

# Cab is assembled around actual wheel openings, rather than burying wheels in a solid box.
box('Chassis',(0,.66,.05),(2.12,.27,9.5),black)
box('Cab lower central',(0,1.18,-2.75),(2.32,.7,3.65),red)
box('Cab upper',(0,2.3,-2.75),(2.4,1.18,3.65),black,.05)
box('Red cab brow',(0,2.98,-2.75),(2.48,.2,3.77),red,.055)
box('Cab front',(0,1.37,-4.59),(2.43,1.2,.14),red)
box('Front bumper',(0,.64,-4.95),(2.65,.27,.46),chrome,.055)
box('Bumper tread',(0,.795,-4.93),(2.59,.04,.44),silver)
box('Grille surround',(0,1.25,-4.7),(1.03,1.02,.075),chrome)
box('Grille inset',(0,1.25,-4.75),(.92,.92,.025),black,0)
for x in range(15): box('Grille vertical',(x*.059-.413,1.25,-4.774),(.015,.91,.012),silver,0)
for y in range(10): box('Grille mesh cross',(0,.83+y*.092,-4.78),(.91,.012,.012),silver,0)
for side in [-1,1]:
    box('Windshield seal',(side*.59,2.31,-4.595),(1.14,1.08,.05),black)
    box('Split windshield',(side*.59,2.33,-4.63),(1.065,.95,.025),glass,.035)
    rod('Wiper',(side*.35,1.92,-4.66),(side*.72,2.48,-4.665),.017,black)
    box('Headlamp surround',(side*.94,1.12,-4.71),(.43,.49,.065),chrome)
    for y in [.99,1.23]:box('Headlight',(side*.94,y,-4.758),(.32,.14,.025),white)
    # Crew cab lower door panels and upper glazing.
    for z,w in [(-3.85,1.1),(-1.65,1.24)]:
        box('Red cab door',(side*1.215,1.45,z),(.045,.61,w),red)
        box('Door seam',(side*1.242,1.7,z+w/2),(.009,1.7,.012),silver,0)
        box('Cab window seal',(side*1.219,2.33,z),(.045,.91,w-.13),black)
        box('Cab side glass',(side*1.25,2.34,z),(.022,.8,w-.22),glass,.028)
        box('Door handle',(side*1.27,1.57,z+.25),(.07,.075,.23),chrome)
        rod('Grab rail',(side*1.29,1.57,z-.4),(side*1.29,2.06,z-.4),.021,chrome)
    box('Cab rear skirt',(side*1.2,.9,-1.42),(.15,.4,.83),red)
    box('Cab front skirt',(side*1.2,.9,-4.16),(.15,.4,.68),red)
    box('Cab rear entry step',(side*1.26,.7,-1.4),(.29,.1,.8),silver)
    rod('Mirror arm',(side*1.22,2.2,-4.25),(side*1.51,2.2,-4.35),.022,chrome)
    box('Mirror housing',(side*1.51,2.38,-4.35),(.16,.43,.13),black)
    box('Mirror face',(side*1.51,2.38,-4.27),(.13,.37,.018),chrome)
    text('Generic door text','FIRE RESCUE',(side*1.247,1.29,-1.66),.13,side)
    # An original simple crossed-bar badge; no department crest.
    box('Generic cross vertical',(side*1.252,1.37,-3.88),(.015,.27,.085),gold,0)
    box('Generic cross horizontal',(side*1.254,1.37,-3.88),(.015,.085,.27),gold,0)
text('Generic front title','FIRE RESCUE',(0,1.855,-4.687),.13)

# Exposed pump bay between cab and lockers.
box('Pump body',(0,1.48,-.35),(2.34,1.65,1.04),silver)
for side in [-1,1]:
    box('Pump recessed board',(side*1.18,1.6,-.35),(.035,1.28,.92),black)
    box('Pump control plate',(side*1.207,1.6,-.35),(.035,1.23,.87),silver)
    for row in range(2):
        for col in range(4):
            z=-.67+col*.21;y=1.83+row*.26
            rod('Gauge bezel',(side*1.22,y,z),(side*1.26,y,z),.067,chrome)
            rod('Gauge face',(side*1.263,y,z),(side*1.27,y,z),.05,white)
            rod('Gauge needle',(side*1.278,y-.025,z-.018),(side*1.278,y+.023,z+.009),.006,black,vertices=6)
    for col in range(3):
        z=-.65+col*.3
        rod('Outlet collar',(side*1.22,1.15,z),(side*1.34,1.15,z),.1,chrome)
        rod('Outlet dark cap',(side*1.34,1.15,z),(side*1.35,1.15,z),.073,black)
        box('Valve lever',(side*1.3,1.39,z),(.035,.045,.13),red)
    box('Pump running board',(side*1.22,.68,-.35),(.3,.08,1.05),silver)
    for i in range(3):box('Folded crosslay',(side*.84,2.5,-.67+i*.24),(.58,.17,.18),hose)

# Aluminum locker body, upper hose bed and open wheel clearances.
box('Rear body spine',(0,1.44,2.6),(2.15,1.34,4.93),red)
box('Upper locker bridge',(0,2.09,2.6),(2.48,.79,4.93),red)
for side in [-1,1]:
    for z,w,bottom,top in [(1.04,1.54,.78,2.43),(2.82,1.7,1.64,2.43),(4.41,1.24,.78,2.43)]:
        box('Locker frame',(side*1.223,(top+bottom)/2,z),(.065,top-bottom,w),chrome)
        box('Rollup door',(side*1.265,(top+bottom)/2,z),(.025,top-bottom-.09,w-.1),silver)
        for i in range(int((top-bottom)/.09)):
            box('Rollup seam',(side*1.281,bottom+.065+i*.09,z),(.008,.008,w-.12),chrome,0)
        box('Locker latch',(side*1.3,bottom+.16,z),(.04,.04,w*.65),chrome)
        box('Reflective dark stripe',(side*1.286,max(bottom+.27,1.01),z),(.012,.1,w-.11),black,0)
    box('Hose bed sidewall',(side*1.13,2.71,2.75),(.11,.39,4.45),red)
    for z in [.61,1.72,2.83,3.94,4.94]:box('Bed reinforcement',(side*1.195,2.73,z),(.025,.32,.065),red)
    rod('Suction hose',(side*.95,2.5,.7),(side*.95,2.5,4.8),.105,black,vertices=16)
    for z in [.71,4.79]:rod('Suction coupling',(side*.95,2.5,z-.055),(side*.95,2.5,z+.055),.129,chrome)
    for z in [1,3.9]:box('Hose retaining bracket',(side*.95,2.49,z),(.28,.25,.065),silver)
    for z in [-2.83,2.82]:
        # Upper semi-circular fender outlines, leaving the lower wheel visible.
        for i in range(16):
            a=i*math.pi/16;b=(i+1)*math.pi/16
            rod('Wheel arch',(side*1.29,.62+.65*math.sin(a),z+.65*math.cos(a)),(side*1.29,.62+.65*math.sin(b),z+.65*math.cos(b)),.047,chrome)
    for z in [-2.83,2.82]:box('Mud flap',(side*1.12,.39,z+.66),(.3,.55,.045),rubber,0)
for x in [-.52,-.26,0,.26,.52]:
    for y in [2.43,2.55]:box('Packed hose bed',(x,y,2.75),(.22,.11,4.1),hose,.04)
# Ladder on top, separate side rails, nested sliding sections and rungs.
for x in [-.38,.38]:
    box('Ladder rail',(x,3.015,2.03),(.065,.13,5.6),silver)
    box('Nested ladder rail',(x*.8,3.09,2.18),(.045,.075,4.6),chrome)
for i in range(19):box('Ladder rung',(0,3.015,-.63+i*.29),(.73,.04,.048),chrome,.008)
box('Rear face',(0,1.55,5.085),(2.43,1.72,.07),silver)
box('Rear step',(0,.66,5.05),(2.61,.18,.3),silver)
for x in [-1.03,1.03]:
    rod('Rear grab',(x,1.15,5.15),(x,2.39,5.15),.025,chrome)
    for y in [1.13,1.43]:box('Rear tail lamp',(x,y,5.14),(.13,.18,.035),lamp)
text('Rear generic title','FIRE RESCUE',(0,2.21,5.135),.17) # rotate rear inscription below
reartext=static[-1];reartext.rotation_euler.z+=math.pi
# Original rear visibility panel, access steps and upper warning lamps.
box('Rear red panel',(0,1.37,5.132),(1.69,.9,.025),red)
for side in [-1,1]:
    for i in range(5):
        # Narrow diagonal gold strips remain contained within the rear panel.
        a=(side*(.06+i*.15),1.04,5.153);b=(side*(.06+i*.15+.11),1.67,5.153)
        rod('Rear visibility stripe',a,b,.034,gold,vertices=4)
    for y in [.89,1.27,1.65]:box('Rear access step',(side*.91,y,5.17),(.23,.055,.13),chrome)
    parts=[];box('Rear warning',(side*1.03,2.28,5.145),(.16,.21,.055),lamp,.02,parts)
    animated.append(join(parts,'Beacon_Rear'+('L' if side<0 else 'R')))
for x in [-.76,.76]:
    parts=[];box('Beacon',(x,3.18,-4.04),(.5,.14,.24),lamp,.025,parts);animated.append(join(parts,'Beacon_'+('L' if x<0 else 'R')))
box('Lightbar metal base',(0,3.085,-4.04),(2.04,.055,.27),chrome)
for x in [-.38,0,.38]:box('Lightbar white module',(x,3.18,-4.04),(.28,.14,.24),white)
for x in [-.95,-.48,0,.48,.95]:box('Roof marker',(x,2.97,-4.67),(.085,.075,.055),amber)

# Join each wheel to its own centred object so browser steering/spin remains independent.
for side in [-1,1]:
    for z,axle in [(-2.83,'F'),(2.82,'R')]:
        parts=[];x=side*1.13
        rod('Tire',(x-.17,.62,z),(x+.17,.62,z),.56,rubber,parts,32)
        for i in range(32):
            a=i*math.tau/32
            p=(x,.62+.553*math.sin(a),z+.553*math.cos(a))
            o=box('Tread',p,(.35,.024,.067),rubber,.005,parts);o.rotation_euler.x=a
        rod('Rim',(side*1.29,.62,z),(side*1.315,.62,z),.375,chrome,parts,32)
        rod('Hub',(side*1.315,.62,z),(side*1.38,.62,z),.16,chrome,parts,20)
        for i in range(10):
            a=i*math.tau/10
            rod('Rim ventilation',(side*1.319,.62+.28*math.sin(a),z+.28*math.cos(a)),(side*1.323,.62+.28*math.sin(a),z+.28*math.cos(a)),.039,black,parts)
            rod('Wheel nut',(side*1.33,.62+.195*math.sin(a),z+.195*math.cos(a)),(side*1.35,.62+.195*math.sin(a),z+.195*math.cos(a)),.022,chrome,parts,6)
        animated.append(join(parts,'Wheel_'+axle+('L' if side<0 else 'R'),(x,.62,z)))

# Bake static parts into one object per material: detail without hundreds of draw calls.
groups=[(m,[o for o in static if o.data.materials[0]==m]) for m in [red,black,glass,silver,chrome,rubber,gold,white,lamp,amber,hose]]
for m,parts in groups:
    if parts:join(parts,'Body_'+m.name.replace(' ','_'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.select_set(False)
bpy.context.scene['asset_notes']='Original generic pumper; single-photo proportions approximate. Metres. Two axles. No department/manufacturer identity.'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'generic-pumper.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'generic-pumper.glb'),export_format='GLB',export_yup=True,export_extras=True)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
(OUT/'generic-pumper.json').write_text(json.dumps({'name':'Generic rescue pumper','version':1,'source':'Original Blender geometry inspired by user-provided reference; no embedded photograph or department marks','units':'metres','forward':'-Z','up':'+Y','wheelRadius':.56,'wheelbase':5.65,'triangles':triangles,'meshObjects':len(meshes),'wheelNodes':['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'],'beaconNodes':['Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'],'limitations':['Unseen rear and opposite side are plausible original designs','Dimensions estimated to retain existing simulator handling envelope'],'commercialUse':'Original project-created geometry and generic markings; no third-party model or texture dependencies'},indent=2))
print('PUMPER EXPORTED',triangles,'triangles',len(meshes),'meshes')
