import bpy, math, json, os, random, struct
from mathutils import Vector, Matrix

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PROJECT = r'H:\ChatGPT\Peterborough-Station1-20261027'
ASSET = os.path.join(GAME, 'city-explorer', 'assets', 'station1')
MODEL = os.path.join(PROJECT, 'model')
LAYOUT_PATH = os.path.join(ASSET, 'layout.json')
GLB_PATH = os.path.join(ASSET, 'station1.glb')
REPORT_PATH = os.path.join(ASSET, 'asset-report.json')
BLEND_PATH = os.path.join(MODEL, 'station1.blend')
W, H, PANEL_N = 4.1, 4.5, 8
PANEL_H = H / PANEL_N
mats, static_by_mat, dynamics = {}, {}, []

def material(name, color, rough=.72, metallic=0, alpha=1):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,alpha); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,alpha); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metallic
    if alpha<1:
        p.inputs['Alpha'].default_value=alpha; m.surface_render_method='DITHERED'
    mats[name]=m; return m

brick=material('Warm orange-buff brick',(.49,.285,.16),.92)
darkbrick=material('Dark brown brickwork and reveals',(.075,.038,.022),.88)
red=material('Deep fire red sectional doors',(.48,.012,.045),.42,.10)
rededge=material('Door section ribs and perimeter',(.28,.012,.027),.48,.15)
glass=material('Smoked ribbon glazing',(.035,.075,.083),.18,.22)
window=material('Door window glazing',(.13,.24,.25),.20,.12)
metal=material('Graphite painted steel',(.065,.060,.055),.52,.38)
roof=material('Dark warm roof membrane',(.105,.085,.072),.82)
paleRoof=material('Pale insulated roof underside',(.72,.71,.66),.84)
yellow=material('Safety bollard yellow',(.98,.61,.045),.48,.05)
concrete=material('Concrete slab',(.42,.43,.41),.83)
mint=material('Bay wall lower mint block',(.43,.65,.59),.90)
teal=material('Bay wall dark teal belt',(.055,.24,.24),.82)
cream=material('Bay wall upper cream block',(.70,.61,.48),.91)
white=material('White trusses and services',(.81,.80,.75),.7,.05)
steel=material('Galvanized tracks and ductwork',(.42,.46,.45),.42,.46)
hose=material('Yellow exhaust extraction hose',(.91,.55,.045),.65)
gear=material('Turnout gear dark tan',(.24,.14,.075),.84)
reflect=material('Turnout reflective bands',(.88,.70,.28),.46,.12)
foliage=material('Tower exterior muted masonry',(.35,.285,.22),.91)

def create_brick_texture():
    os.makedirs(os.path.join(ASSET,'textures'),exist_ok=True)
    n=512; row_h=64; brick_w=128; mortar=5; rng=random.Random(170158)
    pixels=[0.0]*(n*n*4); tones=[(.47,.265,.145),(.51,.30,.17),(.45,.25,.14),(.55,.33,.19),(.49,.285,.16)]
    blocks={}
    for y in range(n):
        row=y//row_h; offset=(row%2)*(brick_w//2)
        for x in range(n):
            xx=(x+offset)%brick_w; yy=y%row_h
            if xx<mortar or yy<mortar: color=(.30,.245,.19)
            else:
                key=(row,(x+offset)//brick_w)
                if key not in blocks:
                    base=tones[rng.randrange(len(tones))]; v=rng.uniform(-.018,.018); blocks[key]=tuple(max(0,min(1,c+v)) for c in base)
                base=blocks[key]; noise=rng.uniform(-.007,.007); color=tuple(max(0,min(1,c+noise)) for c in base)
            i=(y*n+x)*4; pixels[i:i+4]=[*color,1.0]
    img=bpy.data.images.new('Station 1 original warm brick tile',width=n,height=n,alpha=False)
    img.pixels.foreach_set(pixels); img.filepath_raw=os.path.join(ASSET,'textures','station1-warm-brick-1m.png'); img.file_format='PNG'; img.save(); img.pack()
    nodes=brick.node_tree.nodes; bsdf=nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(1,1,1,1)
    tex=nodes.new('ShaderNodeTexImage'); tex.image=img; tex.extension='REPEAT'; tex.interpolation='Linear'; brick.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])

create_brick_texture()

# Source-style mapping: game Z into bay is negative Blender Y; Blender exports to glTF Y-up.
def uv_metric(o):
    mesh=o.data; layer=mesh.uv_layers.active or mesh.uv_layers.new(name='UVMap'); layer.name='UVMap'
    for p in mesh.polygons:
        n=p.normal
        axes=(0,1) if abs(n.z)>=abs(n.x) and abs(n.z)>=abs(n.y) else ((0,2) if abs(n.y)>=abs(n.x) else (1,2))
        for li in p.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co; layer.data[li].uv=(co[axes[0]],co[axes[1]])

def cube(name, center, size, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center); o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); uv_metric(o)
    if mat: o.data.materials.append(mat)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name if mat else 'unassigned',[]).append(o)
    return o

def wall(name,x,z,y,sx,sz,sy,mat,parent=None): return cube(name,(x,-z,y),(sx,sz,sy),mat,parent)
def bar(name,a,b,r,mat,verts=12,parent=None):
    mid=(Vector(a)+Vector(b))/2; d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=mid)
    o=bpy.context.object; o.name=name; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
    o.data.materials.append(mat)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name,[]).append(o)
    return o

def mesh_prism(name, outline_xz, y_front, y_back, low, high, mat, parent=None):
    # Vertical prism from a footprint in game X/Z; Blender Z is elevation.
    n=len(outline_xz); verts=[]
    for h in (low,high): verts += [(x,-z,h) for x,z in outline_xz]
    faces=[]
    for i in range(n):
        j=(i+1)%n; faces.append((i,j,n+j,n+i))
    faces.append(tuple(n+i for i in range(n)))
    faces.append(tuple(i for i in reversed(range(n))))
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],faces); me.materials.append(mat); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); uv_metric(o)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name,[]).append(o)
    return o

def setup():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for d in list(bpy.data.collections):
        if d.name=='Collection' and not d.objects and not d.children: bpy.data.collections.remove(d)
    scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
    scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1600; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Station 1 review sky'); scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.30,.37,.45,1); scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.52
    bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,0,0)); root=bpy.context.object; root.name='Station1_Root'; root.empty_display_size=.42
    bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,0,0)); stat=bpy.context.object; stat.name='Station1_Static'; stat.parent=root; stat.empty_display_size=.3
    tower=bpy.data.objects.new('Station1_TrainingTower',None); bpy.context.collection.objects.link(tower); tower.empty_display_type='PLAIN_AXES'; tower.empty_display_size=.35; tower.parent=root; tower.matrix_parent_inverse=Matrix.Identity(4)
    return root,stat,tower

def make_roof_slope(name,x0,x1,z0,z1,y0,y1,mat,parent=None):
    # rectangular sloped surface between elevation endpoints along game Z.
    verts=[(x,-z,y) for z,y in ((z0,y0),(z1,y1)) for x in (x0,x1)]
    faces=[(0,1,3,2)]
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],faces); me.materials.append(mat); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name,[]).append(o)
    return o

def make_roof_end_infill(name,x,front_z,rear_z,base_height,front_roof_height,mat,parent=None):
    verts=[(x,-front_z,base_height),(x,-front_z,front_roof_height),(x,-rear_z,base_height)]
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],[(0,1,2)]); me.materials.append(mat); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name,[]).append(o)
    return o

def make_ribbed_hose(name, control_points, mat, parent=None):
    # Arc-length-sampled Catmull-Rom centerline prevents corrugation aliasing.
    pts=[Vector(p) for p in control_points]; coarse=[]
    for i in range(len(pts)-1):
        p0=pts[max(0,i-1)]; p1=pts[i]; p2=pts[i+1]; p3=pts[min(len(pts)-1,i+2)]
        for step in range(10):
            t=step/10; t2=t*t; t3=t2*t
            coarse.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
    coarse.append(pts[-1]); cumulative=[0.0]
    for i in range(1,len(coarse)): cumulative.append(cumulative[-1]+(coarse[i]-coarse[i-1]).length)
    total=cumulative[-1]; count=max(1,math.ceil(total/.008)); path=[]; seg=0
    for k in range(count+1):
        d=total*k/count
        while seg<len(cumulative)-2 and cumulative[seg+1]<d: seg+=1
        span=cumulative[seg+1]-cumulative[seg]; t=(d-cumulative[seg])/span if span else 0
        path.append(coarse[seg].lerp(coarse[seg+1],t))
    rings=[]; length=0.0
    for i,c in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized()
        ref=Vector((0,1,0)) if abs(tangent.y)<.92 else Vector((1,0,0))
        u=tangent.cross(ref).normalized(); v=tangent.cross(u).normalized()
        if i: length+=(c-path[i-1]).length
        radius=.075+.007*math.cos(2*math.pi*length/.048)
        ring=[c+radius*(u*math.cos(2*math.pi*j/12)+v*math.sin(2*math.pi*j/12)) for j in range(12)]
        rings.append(ring)
    verts=[tuple(p) for ring in rings for p in ring]; faces=[]; sides=12
    faces.append(tuple(reversed(range(sides))))
    for i in range(len(rings)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple((len(rings)-1)*sides+j for j in range(sides)))
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],faces); me.materials.append(mat); me.update()
    for poly in me.polygons: poly.use_smooth=True
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    if parent: o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4)
    else: static_by_mat.setdefault(mat.name,[]).append(o)
    return o

def build(layout):
    root,stat,tower=setup(); bay=layout['bay']; xs=[-11.959,11.959]; rear=20.35
    wall('Continuous bay slab',0,10.175,-.12,23.918,20.35,.24,concrete)
    # closed ancillary wing as simple source-grounded volume; room plan deliberately omitted.
    wall('West service wing mass',-20.697,11.0,2.825,17.476,18.7,5.65,brick)
    wall('Service wing roof parapet',-20.697,11.0,5.82,17.72,19.0,.34,roof)
    # The source facade carries a long, high ribbon window with a deep vertical recess.
    wall('West wing upper ribbon glazing',-20.7,1.52,4.35,13.2,.16,.78,glass)
    wall('West wing ribbon dark sill',-20.7,1.60,3.94,13.5,.32,.12,darkbrick)
    wall('West wing vertical entry recess',-12.8,1.56,2.55,1.35,.22,4.8,darkbrick)
    # Bay sidewalls layered with the documented colour bands.
    for side in (-11.82,11.82):
        wall(f'Bay lower mint wall {side}',side,10.175,1.05,.278,20.35,2.1,mint)
        wall(f'Bay teal belt wall {side}',side,10.175,2.25,.28,20.35,.30,teal)
        wall(f'Bay upper cream wall {side}',side,10.175,3.94,.28,20.35,3.08,cream)
        wall(f'Bay top lintel {side}',side,10.175,5.59,.34,20.35,.22,brick)
        wall(f'Raised roof side clerestory closure {side}',side,13.925,6.38,.20,12.85,1.42,glass)
    # rear end wall in matching bands
    for yy,hh,cy,mat in [(2.1,2.1,1.05,mint),(.3,.3,2.25,teal),(3.08,3.08,3.94,cream)]: wall(f'Rear bay colour band {mat.name}',0,rear,cy,23.918,.28,hh,mat)
    # Five facade openings; the door leaves occupy the exact shared centers and height.
    centers=layout['frontDoorCenters']; half=layout['doorWidth']/2
    intervals=[]; cursor=-11.959
    for c in centers:
        a,b=c-half,c+half
        if a>cursor: intervals.append((cursor,a))
        cursor=b
    if cursor<11.959: intervals.append((cursor,11.959))
    for i,(a,b) in enumerate(intervals): wall(f'Front dark-brown structural pier {i+1}',(a+b)/2,0,2.6,b-a,.42,5.2,darkbrick)
    for i,c in enumerate(centers,1):
        wall(f'Fire door header {i}',c,0,4.78,4.1,.46,.44,brick)
        # dark brown jamb / shallow canopy reads as the deep structural frame in source photo
        for dx in (-2.12,2.12): wall(f'Door {i} structural jamb {dx}',c+dx,0,2.48,.18,.66,4.96,darkbrick)
        wall(f'Door {i} shallow canopy',c,-.20,5.04,4.48,.90,.20,metal)
    # Main fire-engine red frame over the five openings and the dark overhead rail band.
    wall('Continuous door head rail',0,0,5.12,23.918,.64,.30,metal)
    wall('Front roof fascia',0,-.28,5.48,23.918,.98,.42,roof)
    # independent 8-section moving door nodes, origin at every panel center, no node rotation
    for index,c in enumerate(centers,1):
        for panel in range(PANEL_N):
            pname=f'Door_F{index}_Panel{panel}'
            pivot=bpy.data.objects.new(pname,None); bpy.context.collection.objects.link(pivot)
            pivot.location=(c,-layout['doorTrack']['closedZ'],(panel+.5)*PANEL_H); pivot.empty_display_type='PLAIN_AXES'; pivot.empty_display_size=.09; dynamics.append(pivot)
            cube(pname+'_red_section',(0,0,0),(4.1,.14,PANEL_H-.012),red,pivot)
            cube(pname+'_inner_white',(0,-.09,0),(4.06,.04,PANEL_H-.04),white,pivot)
            # horizontal rolling ribs across each section, narrow and shallow
            for local_z in (-PANEL_H*.32,PANEL_H*.32): cube(pname+'_emboss',(0,.076,local_z),(4.00,.035,.028),rededge,pivot)
            # four tiny windows on the top section, matching the photographed low horizontal row
            if panel==2:
                for wx in (-1.40,-.47,.47,1.40): cube(pname+'_window',(wx,.085,0),(.38,.025,.18),window,pivot)
    # Yellow protective bollards outside doors; mounting plates + simple cylinders.
    for i,c in enumerate(centers,1):
        for dx in (-2.18,):
            x=c+dx
            wall(f'Bollard plate {i}_{dx}',x,-.8,.035,.32,.32,.07,metal)
            bar(f'Yellow bollard {i}_{dx}',(x,.80,.07),(x,.80,.87),.075,yellow,12)
    # Projecting polygonal glazed watchroom follows its measured GIS outline.
    outline=layout['watchroom']['outline']; points=[(p[0],p[1]) for p in outline]
    # six-sided raised brick base, window band, upper brick parapet as shallow polygon solids
    mesh_prism('Polygonal watchroom base',points,.02,4.35,0,1.12,brick)
    mesh_prism('Polygonal watchroom upper crown',points,.02,4.35,2.62,4.38,brick)
    # glazing segments approximated by slim ribbons on each polygon side
    for i,(a,b) in enumerate(zip(points,points[1:]+points[:1])):
        dx,dz=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dz)
        if L<.5: continue
        cx,cz=(a[0]+b[0])/2,(a[1]+b[1])/2
        # cube along side in XY plane mapped to ground XZ; derive Blender yaw around vertical
        bpy.ops.mesh.primitive_cube_add(size=1,location=(cx,-cz,1.88)); o=bpy.context.object; o.name=f'Watchroom smoked window {i+1}'; o.dimensions=(L,.085,1.48); o.rotation_euler[2]=math.atan2(-dz,dx); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(glass); static_by_mat.setdefault(glass.name,[]).append(o)
        # slim dark mullions / corner piers
        bar(f'Watchroom corner post {i+1}',(a[0],-a[1],1.1),(a[0],-a[1],2.65),.055,metal)
    mesh_prism('Polygonal watchroom cap',points,.02,4.35,4.38,4.66,roof)
    # raised rear roof deck and sloped clerestory / roof shell
    wall('Main front roof slab',0,3.10,5.78,23.918,6.20,.24,roof)
    wall('Main roof pale underside',0,3.10,5.64,23.72,6.02,.025,paleRoof)
    wall('Raised rear roof slab',-8.738,13.925,7.18,41.394,12.85,.24,roof)
    wall('Raised roof pale underside',-8.738,13.925,7.04,41.20,12.65,.025,paleRoof)
    make_roof_slope('Sloped clerestory glazing roof',-29.435,11.959,6.2,7.5,5.9,7.25,glass)
    wall('Rear parapet cap',-8.738,20.35,7.12,41.394,.42,.26,metal)
    # glazing supports along the long slope
    for x in (-28,-23,-18,-13,-8,-3,2,7,11):
        bar(f'Clerestory sloped mullion {x}',(x,-6.2,5.95),(x,-7.5,7.26),.045,metal)
    # roof rails, antenna mast and rooftop services, restrained to source silhouette
    for x in (-29,-8,10.8):
        bar(f'Roof guardrail post {x}',(x,-18.9,7.2),(x,-18.9,8.25),.045,metal)
    for y in (-18.9,-17.9): bar(f'Roof guardrail rail {y}',(-29,y,8.0),(10.8,y,8.0),.035,metal)
    bar('Radio mast',(3,-16.0,7.3),(3,-16.0,11.0),.045,metal)
    for h in (8.2,9.0,9.8,10.6): bar(f'Mast antenna crosspiece {h}',(2.45,-16.0,h),(3.55,-16.0,h),.022,metal)
    for x in (-20,5):
        wall(f'Rooftop HVAC plinth {x}',x,15.0,7.25,2.4,2.0,.45,metal)
        wall(f'Rooftop HVAC casing {x}',x,15.0,7.70,1.8,1.5,.48,steel)
    # Low flat-zone joists stay entirely below the front roof slab.
    for z in (2.4,4.5):
        bar(f'Front roof white joist {z}',(-11.5,-z,5.38),(11.5,-z,5.38),.075,white)
    # Higher trusses sit only under the raised rear roof, below its underside.
    for z in (8.0,11.5,15.0,18.5):
        bar(f'Raised roof truss lower chord {z}',(-11.5,-z,5.30),(11.5,-z,5.30),.075,white)
        bar(f'Raised roof truss left web {z}',(-11.5,-z,5.30),(0,-z,6.72),.055,white)
        bar(f'Raised roof truss right web {z}',(0,-z,6.72),(11.5,-z,5.30),.055,white)
        for x in (-9,-6,-3,3,6,9): bar(f'Raised truss vertical {z}_{x}',(x,-z,5.30),(x,-z,5.55+1.0*(1-abs(x)/11.5)),.035,white)
    # door tracks tuck near the ceiling, and service rails do not cross the truck footprint.
    for c in centers:
        for dx in (-2.0,2.0):
            x=c+dx; bar(f'Overhead track vertical {c}_{dx}',(x,-.12,4.52),(x,-.12,5.75),.035,steel)
            bar(f'Overhead track horizontal {c}_{dx}',(x,-.12,5.75),(x,-5.5,5.75),.035,steel)
    for x in (-8,0,8):
        # Front runs sit below the 5.9 m flat roof; rear runs sit below the 7.25 m raised roof.
        bar(f'Front exhaust duct {x}',(x,-.8,5.42),(x,-6.0,5.42),.15,steel,16)
        bar(f'Rear exhaust duct {x}',(x,-7.5,6.62),(x,-19.0,6.62),.15,steel,16)
    # One stowed, flexible extraction assembly sits along the offside of each bay.
    for i,c in enumerate(centers):
        x=c+1.88; z=10.0+.28*i; trunk=min((-8,0,8),key=lambda tx:abs(tx-x))
        bar(f'Exhaust branch {i+1}',(trunk,-z,6.62),(x,-z,6.62),.075,steel,12)
        bar(f'Exhaust elbow drop {i+1}',(x,-z,6.62),(x,-z,6.48),.085,steel,12)
        bar(f'Hose ceiling balancer line {i+1}',(x+.22,-z,7.08),(x+.22,-z,6.34),.022,steel,8)
        bar(f'Hose balancer cross pin {i+1}',(x+.13,-z,6.36),(x+.31,-z,6.36),.035,metal,10)
        path=[(x,-z,6.43),(x,-z-.06,6.30),(x+.02,-z-.16,6.02),(x+.10,-z-.36,5.73),
              (x+.15,-z-.64,5.40),(x+.15,-z-.91,5.06),(x+.09,-z-1.16,4.72),
              (x+.01,-z-1.34,4.39),(x-.04,-z-1.39,4.08)]
        make_ribbed_hose(f'Flexible exhaust hose {i+1}',path,hose)
        bar(f'Hose inlet coupling {i+1}',(x,-z,6.49),(x,-z,6.30),.095,metal,12)
        bar(f'Hose nozzle collar {i+1}',(x-.04,-z-1.39,4.08),(x-.04,-z-1.39,3.94),.09,steel,12)
        bar(f'Hose nozzle mouth {i+1}',(x-.04,-z-1.39,3.96),(x-.04,-z-1.39,3.84),.075,metal,12)
    # restrained gear rack and coats on rear left wall; represent only documented storage type.
    for rack_x in (-10.7,-8.9):
        wall(f'Gear rack upright {rack_x}',rack_x,18.1,2.15,.07,.10,3.8,steel)
        bar(f'Gear rack hanger bar {rack_x}',(rack_x,-17.0,3.65),(rack_x,-19.2,3.65),.035,steel)
        for coat_i in range(4):
            z=17.3+coat_i*.48; x=rack_x
            wall(f'Turnout jacket {rack_x}_{coat_i}',x,18.05,2.65,.42,.34,.83,gear)
            wall(f'Turnout reflective torso band {rack_x}_{coat_i}',x,18.05,2.55,.44,.36,.09,reflect)
            wall(f'Turnout reflective cuff {rack_x}_{coat_i}',x,18.05,2.28,.44,.36,.07,reflect)
    # rear service facade above bay opening
    wall('Rear bay upper brick lintel',0,rear,6.38,23.918,.42,1.50,brick)
    # Separate rear training tower parent (runtime sets its world Y to sampled terrain).
    t=layout['trainingTower']; tx=(t['minX']+t['maxX'])/2; tz=(t['frontZ']+t['rearZ'])/2; tw=t['maxX']-t['minX']; td=t['rearZ']-t['frontZ']
    shaft_x=(t['shaftMinX']+t['shaftMaxX'])/2; shaft_w=t['shaftMaxX']-t['shaftMinX']
    practice_x=(t['shaftMaxX']+t['maxX'])/2; practice_w=t['maxX']-t['shaftMaxX']
    wall('Training tower base',tx,tz,t['baseHeight']/2,tw,td,t['baseHeight'],foliage,parent=tower)
    wall('Training tower shaft',shaft_x,tz,(t['baseHeight']+t['towerHeight'])/2,shaft_w,td,t['towerHeight']-t['baseHeight'],brick,parent=tower)
    wall('Training tower shaft cap',shaft_x,tz,t['towerHeight']+.10,shaft_w+.45,td+.4,.30,roof,parent=tower)
    # Low practice bay occupies the footprint east of the shaft and carries its own sloped roof.
    wall('Training tower practice volume',practice_x,tz,t['baseHeight']/2,practice_w,td,t['baseHeight'],foliage,parent=tower)
    make_roof_slope('Training tower practice sloping roof',t['shaftMaxX'],t['maxX'],t['frontZ'],t['rearZ'],t['baseHeight']+1.05,t['baseHeight'],roof,parent=tower)
    make_roof_end_infill('Training tower practice roof west infill',t['shaftMaxX'],t['frontZ'],t['rearZ'],t['baseHeight'],t['baseHeight']+1.05,foliage,parent=tower)
    make_roof_end_infill('Training tower practice roof east infill',t['maxX'],t['frontZ'],t['rearZ'],t['baseHeight'],t['baseHeight']+1.05,foliage,parent=tower)
    front=t['frontZ']
    for floor in (5.2,7.8,10.4):
        wall(f'Tower training aperture {floor}',shaft_x,front-.08,floor,2.5,.16,.92,glass,parent=tower)
        wall(f'Tower dark lintel {floor}',shaft_x,front-.18,floor+.51,2.9,.32,.16,metal,parent=tower)
        wall(f'Tower sill {floor}',shaft_x,front-.18,floor-.51,2.9,.32,.16,metal,parent=tower)
    # join all dynamic piece geometry by material, preserving standalone pivots
    for pivot in dynamics:
        groups={}
        for child in list(pivot.children):
            if child.type=='MESH': groups.setdefault(child.data.materials[0].name if child.data.materials else 'unassigned',[]).append(child)
        for key,objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1: bpy.ops.object.join()
            joined=bpy.context.object; joined.name=pivot.name+'_mesh_'+key.replace(' ','_'); joined.parent=pivot; joined.matrix_parent_inverse=Matrix.Identity(4)
        pivot.parent=root; pivot.matrix_parent_inverse=Matrix.Identity(4)
    # Merge static geometry per material, then separate tower children stay under tower parent.
    for mat_name,objects in list(static_by_mat.items()):
        valid=[o for o in objects if o and o.name in bpy.data.objects]
        if not valid: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in valid:o.select_set(True)
        bpy.context.view_layer.objects.active=valid[0]
        if len(valid)>1: bpy.ops.object.join()
        joined=bpy.context.object; joined.name='Static_'+mat_name.replace(' ','_').replace('|','').replace('/','_'); joined.parent=stat; joined.matrix_parent_inverse=Matrix.Identity(4)
    # Keep tower's meshes in its separate top-level parent rather than static batch.
    tower.parent=root; tower.matrix_parent_inverse=Matrix.Identity(4)
    return root

def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def camera(name,loc,target,lens=42):
    bpy.ops.object.camera_add(location=loc); o=bpy.context.object; o.name=name; aim(o,target); o.data.lens=lens; return o
def area(loc,target,energy,size,color=(1,1,1)):
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.data.energy=energy; o.data.shape='DISK'; o.data.size=size; o.data.color=color; aim(o,target)

def render_views():
    scene=bpy.context.scene; scene.render.resolution_x=1600; scene.render.resolution_y=1000
    # preview floor is excluded from selection/export by not parenting to root
    wall('Review ground',0,0,-.20,160,160,.12,concrete)
    area((10,18,18),(-3,0,3),18000,18,(1,.82,.67)); area((-22,12,14),(-8,0,3),11000,16,(.78,.87,1)); area((0,-10,10),(0,-12,3),6500,15,(1,.91,.77))
    cam=camera('Review exterior',(24,40,8.5),(-7,0,3.2),44); scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station1-exterior.png'); bpy.ops.render.render(write_still=True)
    cam.location=(-8,-67,16); aim(cam,(-39,-33,5)); cam.data.lens=50; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station1-tower-exterior.png'); bpy.ops.render.render(write_still=True)
    cam.location=(6,-2,3.3); aim(cam,(-2,-16,5)); cam.data.lens=32; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station1-bay-interior.png'); bpy.ops.render.render(write_still=True)
    cam.location=(1,-5.5,3.4); aim(cam,(-2.8,-11.4,5.0)); cam.data.lens=35; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station1-exhaust-detail.png'); bpy.ops.render.render(write_still=True)
    cam.location=(6,18,100); aim(cam,(-16,-17,1)); cam.data.lens=30; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station1-overhead.png'); bpy.ops.render.render(write_still=True)

def export_validate():
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    root=bpy.data.objects['Station1_Root']; bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(root); bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=GLB_PATH,export_format='GLB',export_yup=True,use_selection=True,export_apply=True)
    with open(GLB_PATH,'rb') as f: data=f.read()
    jl,jt=struct.unpack_from('<II',data,12); gltf=json.loads(data[20:20+jl].decode('utf-8').rstrip(' \x00')); nodes={n.get('name'):n for n in gltf.get('nodes',[])}
    expected=['Station1_Root','Station1_Static','Station1_TrainingTower']+[f'Door_F{d}_Panel{p}' for d in range(1,6) for p in range(8)]
    missing=[n for n in expected if n not in nodes]
    valid_transforms=True
    for d,c in enumerate(json.load(open(LAYOUT_PATH))['frontDoorCenters'],1):
        for p in range(PANEL_N):
            n=nodes.get(f'Door_F{d}_Panel{p}',{}); t=n.get('translation',[0,0,0]); q=n.get('rotation',[0,0,0,1]); e=[c,(p+.5)*PANEL_H,.06]
            valid_transforms &= len(t)==3 and all(abs(t[i]-e[i])<.003 for i in range(3)) and len(q)==4 and abs(q[0])+abs(q[1])+abs(q[2])<.002 and abs(q[3]-1)<.002
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False); bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    mesh_names={o.name for o in bpy.context.scene.objects}; imported=sum(1 for o in bpy.context.scene.objects if o.type=='MESH')
    meshes=len(gltf.get('meshes',[])); primitives=sum(len(m.get('primitives',[])) for m in gltf.get('meshes',[])); mats_n=len(gltf.get('materials',[])); embedded=sum('bufferView' in i and 'uri' not in i for i in gltf.get('images',[]))
    verts=[]
    for o in bpy.context.scene.objects:
        if o.type=='MESH': verts.extend(o.matrix_world@Vector(v) for v in o.bound_box)
    mins=[min(v[i] for v in verts) for i in range(3)]; maxs=[max(v[i] for v in verts) for i in range(3)]
    report={'format':'glTF 2.0 binary','file':'station1.glb','fileBytes':len(data),'units':'metres','orientation':'Y up; front -Z; bay +Z','fiveDoorCount':5,'sectionPanelCount':40,'dynamicPanelTransformsValid':bool(valid_transforms),'missingRequiredNodes':missing,'towerSeparateParent':nodes.get('Station1_TrainingTower',{}).get('children') is not None,'glbMeshCount':meshes,'drawPrimitiveCount':primitives,'materialCount':mats_n,'embeddedImageCount':embedded,'reimportObjectCount':len(mesh_names),'reimportMeshObjectCount':imported,'reimportTriangleCount':sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'boundsReimported':{'min':mins,'max':maxs},'notes':['original procedural materials only; no reference-photo pixels included','front opening dimensions and building heights are photo-scaled estimates, not a survey','ancillary room layout is unresolved and not invented','tower is separate for terrain-adjusted runtime placement']}
    report['exhaustAssemblyCount']=5
    os.makedirs(os.path.dirname(REPORT_PATH),exist_ok=True)
    with open(REPORT_PATH,'w') as f: json.dump(report,f,indent=2)
    if missing or not valid_transforms or report['fiveDoorCount']!=5 or report['sectionPanelCount']!=40: raise RuntimeError('GLB node contract validation failed')
    if len(data)>2_000_000: print('NOTE: GLB exceeds preferred 2 MB web target')
    render_views(); print(json.dumps(report,indent=2))

def main():
    with open(LAYOUT_PATH) as f: layout=json.load(f)
    if len(layout['frontDoorCenters'])!=5: raise RuntimeError('Expected five source-confirmed front doors')
    build(layout); export_validate()
if __name__=='__main__': main()
