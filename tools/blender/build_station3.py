import bpy, math, json, os, random, struct, hashlib
from mathutils import Vector, Matrix

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PROJECT = r'H:\ChatGPT\Peterborough-Facilities-20261027'
ASSET = os.path.join(GAME, 'city-explorer', 'assets', 'station3')
MODEL = os.path.join(PROJECT, 'model')
CONTRACT = os.path.join(GAME, 'docs', 'facilities', 'contracts', 'station3-gis-contract.json')
LAYOUT = os.path.join(ASSET, 'layout.json')
GLB = os.path.join(ASSET, 'station3.glb')
REPORT = os.path.join(ASSET, 'asset-report.json')
BLEND = os.path.join(MODEL, 'station3.blend')
materials = {}; static = {}


def mat(name, color, rough=.7, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    materials[name]=m; return m

brick=mat('Charcoal grey brick | original procedural',(.19,.205,.215),.91)
brick_light=mat('Entry charcoal brick',(.25,.27,.28),.88)
red=mat('Station red architectural panels',(.56,.015,.035),.42,.12)
red_trim=mat('Red showroom trim',(.48,.012,.028),.42,.15)
siding=mat('Opaque pale vertical metal siding',(.70,.715,.71),.7,.12)
roof=mat('Graphite metal roof and fascia',(.035,.043,.048),.46,.32)
roof_under=mat('Canopy underside',(.11,.12,.12),.78,.08)
frame=mat('Light silver door and canopy frames',(.72,.75,.74),.33,.58)
white=mat('White entrance frames',(.88,.89,.86),.38,.12)
glass=mat('Smoked glazing',(.045,.095,.11),.2,.24)
glass_lite=mat('Canopy glass',(.28,.40,.42),.18,.08)
concrete=mat('Concrete',(.43,.44,.43),.88)
flag_red=mat('Flag red',(.72,.018,.035),.68)
flag_white=mat('Flag white',(.88,.89,.86),.75)
flag_green=mat('Flag green',(.08,.39,.20),.7)
flag_blue=mat('Flag blue',(.08,.20,.47),.7)
flag_gold=mat('Flag gold',(.92,.68,.12),.7)


def make_brick_texture():
    os.makedirs(os.path.join(ASSET,'textures'),exist_ok=True)
    n=256; row=32; width=128; mortar=4; rng=random.Random(558402285)
    tones=[(.18,.195,.205),(.205,.22,.23),(.225,.235,.24),(.175,.19,.20),(.24,.25,.255)]
    blocks={}; pixels=[0.0]*(n*n*4)
    for y in range(n):
        r=y//row; off=(r%2)*(width//2)
        for x in range(n):
            xx=(x+off)%width; yy=y%row
            if xx<mortar or yy<mortar: c=(.12,.135,.145)
            else:
                key=(r,(x+off)//width)
                if key not in blocks:
                    b=tones[rng.randrange(len(tones))]; v=rng.uniform(-.012,.012); blocks[key]=tuple(max(0,min(1,k+v)) for k in b)
                b=blocks[key]; grain=rng.uniform(-.003,.003); c=tuple(max(0,min(1,k+grain)) for k in b)
            i=(y*n+x)*4; pixels[i:i+4]=[*c,1.0]
    img=bpy.data.images.new('Station 3 original charcoal brick tile',width=n,height=n,alpha=False)
    img.pixels.foreach_set(pixels); img.filepath_raw=os.path.join(ASSET,'textures','station3-charcoal-brick-1m.png'); img.file_format='PNG'; img.save(); img.pack()
    bs=brick.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(1,1,1,1)
    tex=brick.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=img; tex.extension='REPEAT'; tex.interpolation='Linear'; brick.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])

make_brick_texture()


def uv_metric(o):
    me=o.data; layer=me.uv_layers.active or me.uv_layers.new(name='UVMap'); layer.name='UVMap'
    for p in me.polygons:
        n=p.normal
        axes=(0,1) if abs(n.z)>=abs(n.x) and abs(n.z)>=abs(n.y) else ((0,2) if abs(n.y)>=abs(n.x) else (1,2))
        for li in p.loop_indices:
            co=me.vertices[me.loops[li].vertex_index].co; layer.data[li].uv=(co[axes[0]],co[axes[1]])


def box(name,x,z,elev,sx,sz,sy,material,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,elev)); o=bpy.context.object; o.name=name; o.dimensions=(sx,sz,sy)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); uv_metric(o); o.data.materials.append(material)
    if parent:
        o.parent=parent; o.matrix_parent_inverse=bpy.context.scene.objects[parent.name].matrix_world.inverted()
    else: static.setdefault(material.name,[]).append(o)
    return o


def wall(name,x,z,elev,sx,sz,sy,material): return box(name,x,z,elev,sx,sz,sy,material)


def bar(name,a,b,r,material,vertices=12):
    v0,v1=Vector(a),Vector(b); d=v1-v0
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(v0+v1)*.5)
    o=bpy.context.object; o.name=name; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y'); o.data.materials.append(material); static.setdefault(material.name,[]).append(o); return o


def oriented_wall(name,a,b,elev,height,thickness,material):
    # Segment in footprint X/Z; make a vertical wall box along the exact edge.
    x0,z0=a; x1,z1=b; dx=x1-x0; dz=z1-z0; length=math.hypot(dx,dz)
    cx=(x0+x1)/2; cz=(z0+z1)/2
    o=box(name,cx,cz,elev,length,thickness,height,material)
    # Blender Y=-game Z. Rotate the local X axis to edge direction.
    o.rotation_euler[2]=math.atan2(-dz,dx); bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.transform_apply(location=False,rotation=True,scale=False); uv_metric(o)
    return o


def poly_prism(name,outline,low,high,material):
    n=len(outline); verts=[]
    for h in (low,high): verts.extend((x,-z,h) for x,z in outline)
    faces=[]
    for i in range(n):
        j=(i+1)%n; faces.append((i,j,n+j,n+i))
    faces.extend([tuple(n+i for i in range(n)),tuple(reversed(range(n)))])
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],faces); me.materials.append(material); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); uv_metric(o); static.setdefault(material.name,[]).append(o); return o


def poly_slab(name,outline,top,thickness,material): return poly_prism(name,outline,top-thickness,top,material)


def setup():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        if c.name=='Collection' and not c.objects and not c.children: bpy.data.collections.remove(c)
    scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
    scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1600; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Station 3 review sky'); scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.33,.40,.48,1); scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.48
    bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,0,0)); root=bpy.context.object; root.name='Station3_Root'; root.empty_display_size=.55
    bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,0,0)); stat=bpy.context.object; stat.name='Station3_Static'; stat.parent=root; stat.matrix_parent_inverse=Matrix.Identity(4); stat.empty_display_size=.35
    return root,stat


def create_sectional_door(index,cx,width,height):
    # Static source-faithful glazing above a solid silver lower section; no invented animation contract.
    zfront=0.04
    wall(f'Door {index} silver outer backing',cx,0,height/2,width,.10,height,frame)
    wall(f'Door {index} solid bottom panel',cx,0,.48,width-.16,.12,.86,frame)
    x0=cx-width/2+.12; x1=cx+width/2-.12
    low=.98; top=height-.18; rows=5; cols=4; gap=.09
    pane_w=(x1-x0-(cols-1)*gap)/cols; pane_h=(top-low-(rows-1)*gap)/rows
    for r in range(rows):
        for c in range(cols):
            px=x0+c*(pane_w+gap)+pane_w/2; pz=low+r*(pane_h+gap)+pane_h/2
            wall(f'Door {index} glass pane {r}_{c}',px,-.08,pz,pane_w,.035,pane_h,glass)
    # Anodized framing is drawn as a fine gridded surface facing the street.
    for c in range(cols+1):
        x=x0-.025+c*(pane_w+gap)
        wall(f'Door {index} vertical frame {c}',x,-.12,zfront+.01,.055,.065,top-low+.10,frame)
    for r in range(rows+1):
        z=low-.035+r*(pane_h+gap)
        wall(f'Door {index} horizontal frame {r}',cx,-.12,z,width-.15,.065,.055,frame)
    wall(f'Door {index} top frame',cx,-.10,height-.05,width,.10,.10,frame)


def add_text(name,text,loc,size,material):
    cu=bpy.data.curves.new(name,'FONT'); cu.body=text; cu.size=size; cu.extrude=.003; cu.bevel_depth=.0008; cu.align_x='CENTER'; cu.align_y='CENTER'
    o=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(o); o.location=loc
    # Local front is Blender +Y. This orientation makes the text upright with front-facing normals.
    o.rotation_euler=(math.radians(90),0,0); o.scale.x=-1; cu.materials.append(material)
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o=bpy.context.object; o.name=name
    for poly in o.data.polygons: poly.flip()
    o.data.update(); uv_metric(o); static.setdefault(material.name,[]).append(o); return o


def polygon_face_xz(name,cx,y,cz,shape,material):
    verts=[(cx+x,y,cz+z) for x,z in shape]; me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts,[],[tuple(reversed(range(len(verts))))]); me.materials.append(material); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); static.setdefault(material.name,[]).append(o); return o

def add_flags():
    # Simple, source-appropriate geometric approximations; no flag photos or coat-of-arms textures.
    for i,x in enumerate((-5.8,-1.5,2.8)):
        root=(x,.28,6.12); tip=(x+.30,2.35,7.70)
        bar(f'Flag pole {i+1}',root,tip,.035,frame,10)
        fx=x+.43; y=2.18; game_z=-y; cz=7.12; w=1.25; h=.82
        if i==2:
            # Canadian tricolour with a simple red maple-leaf silhouette centered in white.
            wall('Canadian flag white centre',fx,game_z,cz,w*.58,.025,h,flag_white)
            wall('Canadian flag red hoist',fx-w*.39,game_z,cz,w*.22,.025,h,flag_red)
            wall('Canadian flag red fly',fx+w*.39,game_z,cz,w*.22,.025,h,flag_red)
            leaf=[(-.18,.04),(-.11,.07),(-.14,.23),(-.035,.17),(0,.35),(.04,.18),(.15,.26),(.12,.09),(.21,.12),(.10,-.005),(.15,-.08),(.035,-.07),(.025,-.22),(-.025,-.22),(-.035,-.07),(-.15,-.065),(-.10,.005)]
            polygon_face_xz('Canadian flag maple emblem',fx,y+.025,cz,leaf,flag_red)
        elif i==1:
            # Ontario Red Ensign: navy canton, Union Jack-style bars/diagonals, compact navy shield.
            wall('Ontario ensign red field',fx,game_z,cz,w,.025,h,flag_red)
            canton_x=fx-w*.30; canton_z=cz+h*.26; cw=w*.40; ch=h*.48; canton_y=y+.022
            wall('Ontario ensign navy canton',canton_x,game_z-.025,canton_z,cw,.02,ch,flag_blue)
            wall('Ontario canton white vertical',canton_x,game_z-.05,canton_z,cw*.18,.02,ch,flag_white)
            wall('Ontario canton white horizontal',canton_x,game_z-.05,canton_z,cw,.02,ch*.20,flag_white)
            wall('Ontario canton red vertical',canton_x,game_z-.07,canton_z,cw*.075,.02,ch,flag_red)
            wall('Ontario canton red horizontal',canton_x,game_z-.07,canton_z,cw,.02,ch*.08,flag_red)
            for k,sign in enumerate((-1,1)):
                bar(f'Ontario canton diagonal white {k}',(canton_x-cw*.43, canton_y, canton_z+sign*ch*.43),(canton_x+cw*.43,canton_y,canton_z-sign*ch*.43),.024,flag_white,8)
            shield=[(-.16,.16),(.16,.16),(.14,-.07),(0,-.22),(-.14,-.07)]
            polygon_face_xz('Ontario ensign shield',fx+w*.20,y+.035,cz,shield,flag_blue)
        else:
            # Peterborough city-colour approximation: green field and understated blue/white river band.
            wall('Peterborough city flag green field',fx,game_z,cz,w,.025,h,flag_green)
            wall('Peterborough flag white river band',fx,game_z-.025,cz-.12,w*.82,.02,.10,flag_white)
            wall('Peterborough flag blue river band',fx,game_z-.03,cz-.24,w*.82,.02,.10,flag_blue)
            polygon_face_xz('Peterborough flag gold civic mark',fx, y+.04,cz+.16,[(-.09,.10),(.09,.10),(.07,-.07),(0,-.13),(-.07,-.07)],flag_gold)
def clip_x(poly,xcut):
    # Sutherland-Hodgman clip of footprint polygon to x >= xcut.
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=a[0]>=xcut; inb=b[0]>=xcut
        if ina and inb: out.append(b)
        elif ina and not inb:
            t=(xcut-a[0])/(b[0]-a[0]); out.append((xcut,a[1]+t*(b[1]-a[1])))
        elif not ina and inb:
            t=(xcut-a[0])/(b[0]-a[0]); out.append((xcut,a[1]+t*(b[1]-a[1]))); out.append(b)
    return out


def build(layout):
    root,stat=setup(); outline=[tuple(p) for p in layout['footprint']]
    # Exact GIS footprint foundation; wall elevations/roof heights are photo-scaled.
    poly_slab('Station 3 footprint slab | exact GIS outline',outline,0,1.0,concrete)
    # Conservative perimeter walls for unavailable rear and side views. Front edge is modeled explicitly below.
    for i,(a,b) in enumerate(zip(outline,outline[1:]+outline[:1])):
        if abs(a[1])<.02 and abs(b[1])<.02: continue
        if i in (10,11): continue  # photo-visible exhibit glazing replaces the opaque wing front/return wall
        length=math.hypot(a[0]-b[0],a[1]-b[1])
        # Upper opaque siding only on the documented high apparatus block's end/rear.
        elev=4.65
        oriented_wall(f'Unverified perimeter brick wall {i+1}',a,b,elev/2,elev,.25,brick)
    # Close the high bay rear and entry returns just below their roof/parapet lines.
    for i in (4,6,9):
        a,b=outline[i],outline[(i+1)%len(outline)]
        top=5.95 if i in (4,9) else 7.28
        color=red if i in (4,9) else siding
        oriented_wall(f'Upper closure at local roof edge {i}',a,b,(4.65+top)/2,top-4.65,.25,color)
    # Main apparatus roof plate and deep dark overhang over all three bays.
    bay_outline=[(-14.65,-.35),(3.75,-.35),(3.75,21.4),(-14.65,21.4)]
    poly_slab('Main bay roof slab',bay_outline,7.55,.32,roof)
    box('Main bay front overhang fascia',-5.15,-.95,7.30,20.4,2.15,.62,roof)
    box('Main bay canopy underside',-5.15,-.82,6.96,19.9,1.95,.10,roof_under)
    # Red entry mass is source visible at viewer-left of bay block; estimate height/extent from front image.
    box('Red entrance wall mass',8.82,11.9,2.95,10.45,24.0,5.90,red)
    box('Red entrance roof',8.82,11.9,6.18,10.95,24.3,.26,roof)
    box('Red entry front canopy fascia',8.85,-.55,3.65,6.7,1.35,.28,roof)
    # Bay front piers between the three documented glazed sectional doors.
    door_centers=(-11.05,-5.25,.55); door_w=4.95; door_h=4.42
    wall('Bay front left end pier',-13.60,0,2.48,.90,.48,4.96,brick)
    wall('Bay front central pier 1',(-8.575-7.725)/2,0,2.48,.85,.48,4.96,brick)
    wall('Bay front central pier 2',(-2.775-1.925)/2,0,2.48,.85,.48,4.96,brick)
    wall('Bay front right end pier',3.16,0,2.48,.88,.48,4.96,brick)
    for i,c in enumerate(door_centers,1):
        create_sectional_door(i,c,door_w,door_h)
        wall(f'Bay door charcoal header {i}',c,0,4.68,door_w+.28,.52,.56,brick)
        wall(f'Bay door dark jamb left {i}',c-door_w/2-.04,0,2.35,.12,.52,4.7,roof)
        wall(f'Bay door dark jamb right {i}',c+door_w/2+.04,0,2.35,.12,.52,4.7,roof)
    # Continuous opaque light-grey vertical metal siding, not a glass clerestory.
    wall('Opaque upper bay siding band',-5.15,0,5.92,18.4,.32,1.96,siding)
    for x in [i*.48-14.1 for i in range(39)]:
        if -14.1<=x<=4.05: wall(f'Upper siding standing seam {x:.2f}',x,-.205,5.93,.025,.035,1.9,frame)
    # Continuous dark fascia and roof lip on the high bay end.
    wall('Bay front graphite fascia',-5.15,-.55,7.19,20.8,1.32,.58,roof)
    # Side high louver documented in image 44 on exposed apparatus end wall.
    oriented_wall('Exposed bay end upper opaque siding',(-14.0465,0),(-14.6512,20.5097),5.98,2.62,.25,siding)
    wall('Exposed end wall high louver surround',-14.52,9.2,6.15,.22,2.6,.98,frame)
    wall('Exposed end wall high louver dark core',-14.66,9.2,6.15,.06,2.25,.68,roof)
    for k in range(8):
        wall(f'End wall louver blade {k+1}',-14.71,9.2,5.83+k*.095,.04,2.05,.035,frame)
    # Red entrance panel elevation and white framed windows/door; no room layout implied.
    # Three openings visible in the photo-scaled front block.
    for name,cx,w,h,sill in [('Entrance picture window left',5.45,2.25,2.05,.48),('Entrance glazed door',8.55,1.62,2.55,.10),('Entrance picture window right',11.55,2.05,2.05,.48)]:
        zc=sill+h/2
        wall(name+' glass',cx,-.12,zc,w,.055,h,glass)
        for dx in (-w/2-.045,w/2+.045): wall(name+' vertical white frame',cx+dx,-.19,zc,.09,.12,h+.18,white)
        for dz in (-h/2-.045,h/2+.045): wall(name+' horizontal white frame',cx,-.19,zc+dz,w+.18,.12,.09,white)
        if 'window' in name: wall(name+' center mullion',cx,-.20,zc,.055,.13,h,white)
        if 'door' in name:
            wall('Entrance door center stile',cx,-.22,zc,.07,.13,h,white)
            box('Entrance door pull',cx+.48,-.23,zc,.06,.06,.82,frame)
    # Raised red sign / address lettering, source-backed text only.
    add_text('Station identification lettering','Fire Station No. 3',(8.55,.25,5.00),.52,white)
    add_text('Civic address lettering','839 Clonsilla Ave.',(8.55,.25,4.47),.31,white)
    # Tall silver standards and a simple glass crest panel reproduce the entrance sign silhouette.
    for x in (4.15,7.65): wall(f'Entrance crest sign silver post {x}',x,-.78,3.8,.15,.16,7.6,frame)
    box('Entrance glass crest panel',5.90,-.82,6.45,3.35,.14,1.72,glass_lite)
    polygon_face_xz('Entrance crest gold shield backing',5.90,.91,6.45,[(-.52,.60),(.52,.60),(.42,-.16),(0,-.61),(-.42,-.16)],flag_gold)
    polygon_face_xz('Entrance crest blue shield',5.90,.94,6.45,[(-.40,.47),(.40,.47),(.33,-.13),(0,-.47),(-.33,-.13)],flag_blue)
    for z in (6.30,6.42,6.54): wall(f'Entrance crest white wave {z}',5.90,-.96,z,.48,.025,.035,flag_white)
    # Entrance canopy: pale steel portal, translucent panes, and support rods.
    canopy_z=3.12; canopy_front=-2.65; canopy_back=-.30
    for x in (6.0,11.2):
        bar(f'Canopy front upright {x}',(x,-canopy_front,.15),(x,-canopy_front,canopy_z),.055,white)
        bar(f'Canopy diagonal brace {x}',(x,-canopy_front,canopy_z-.15),(x,-canopy_back,canopy_z+.12),.045,frame)
    box('Glass entry canopy',8.6,1.47,canopy_z,6.05,2.72,.10,glass_lite)
    for x in (5.55,7.08,8.61,10.14,11.67): bar(f'Canopy cross frame {x}',(x,-canopy_back,canopy_z+.07),(x,-canopy_front,canopy_z+.07),.035,frame)
    bar('Canopy front cross beam',(5.55,-canopy_front,canopy_z),(11.67,-canopy_front,canopy_z),.055,frame)
    # Three approximated municipal flags from the source photo.
    add_flags()
    # Low legacy wing: exact clipped GIS outline; conservative roof and charcoal masonry.
    wing=clip_x(outline,14.0)
    if len(wing)>=3:
        poly_slab('Legacy exhibit wing roof | clipped GIS outline',wing,4.72,.30,roof)
    # Photo-visible glazed exhibit frontage wraps the low wing corner; dimensions are estimates.
    a=(14.3,3.0); b=(38.35,3.95)
    oriented_wall('Legacy exhibit glazed front',a,b,1.9,3.0,.10,glass)
    front_dx=b[0]-a[0]; front_dz=b[1]-a[1]; front_length=math.hypot(front_dx,front_dz)
    front_nx=front_dz/front_length; front_nz=-front_dx/front_length
    for i in range(1,16):
        t=i/16; x=a[0]+front_dx*t+front_nx*.11; z=a[1]+front_dz*t+front_nz*.11
        oriented_wall(f'Legacy glazing mullion {i}',(x,z-.035),(x,z+.035),1.9,3.05,.09,frame)
    oriented_wall('Legacy glazing sill',a,b,.38,.16,.16,frame)
    oriented_wall('Legacy red corner trim',a,b,3.62,.22,.25,red_trim)
    # Glass wraps the visible corner for a short side return.
    oriented_wall('Legacy exhibit glazed return',(38.36,3.95),(41.44,7.35),1.9,3.0,.10,glass)
    return_a=(38.36,3.95); return_b=(41.44,7.35)
    dx=return_b[0]-return_a[0]; dz=return_b[1]-return_a[1]; length=math.hypot(dx,dz)
    nx=-dz/length; nz=dx/length
    for i in range(1,3):
        t=i/3; x=return_a[0]+dx*t; z=return_a[1]+dz*t
        oriented_wall(f'Legacy glazing return mullion {i}',(x-nx*.055,z-nz*.055),(x+nx*.055,z+nz*.055),1.9,3.05,.10,frame)
    # Review ground is deliberately outside the Station3 root and never enters the GLB.
    return root,stat


def aim(o,target): o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def area(loc,target,energy,size,color=(1,1,1)):
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.data.energy=energy; o.data.shape='DISK'; o.data.size=size; o.data.color=color; aim(o,target)
def camera(loc,target,lens=35):
    bpy.ops.object.camera_add(location=loc); o=bpy.context.object; o.name='Station3 review camera'; o.data.lens=lens; aim(o,target); return o


def merge_static(stat):
    for key,objs in list(static.items()):
        objs=[o for o in objs if o and o.name in bpy.data.objects]
        if not objs: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1: bpy.ops.object.join()
        joined=bpy.context.object; joined.name='Static_'+key.replace(' ','_').replace('|','').replace('/','_'); joined.parent=stat; joined.matrix_parent_inverse=Matrix.Identity(4); static[key]=[joined]


def render_views():
    os.makedirs(MODEL,exist_ok=True); scene=bpy.context.scene
    # Ground is only a review prop, unparented from export root.
    box('Review ground',0,15,-.23,150,130,.15,concrete)
    area((8,35,24),(0,-7,3),34000,22,(1.0,.82,.68)); area((-28,10,18),(-5,-3,3),24000,20,(.79,.88,1)); area((15,-18,13),(16,-18,2),15000,16,(1,.92,.80))
    cam=camera((14,78,25),(9,-19,3.1),42); scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station3-front.png'); bpy.ops.render.render(write_still=True)
    cam.location=(14,-88,23); aim(cam,(12,-21,3.0)); cam.data.lens=42; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station3-rear.png'); bpy.ops.render.render(write_still=True)
    cam.location=(-48,-10,11); aim(cam,(-14.5,-10.2,4.2)); cam.data.lens=38; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station3-left.png'); bpy.ops.render.render(write_still=True)
    cam.location=(65,-17,14); aim(cam,(10,-17,2.8)); cam.data.lens=40; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station3-right.png'); bpy.ops.render.render(write_still=True)
    cam.location=(8,-8,110); aim(cam,(14,-19,0)); cam.data.lens=34; scene.camera=cam; scene.render.filepath=os.path.join(MODEL,'station3-overhead.png'); bpy.ops.render.render(write_still=True)


def make_layout(contract):
    return {
      'schemaVersion':1,'id':'station3','stationNumber':3,'rootName':'Station3_Root','name':contract['name'],'address':contract['address'],'sourceIds':contract['sourceIds'],
      'units':'metres','status':'source-grounded front; exact GIS footprint; rear and side facade details unverified','origin':contract['origin'],
      'coordinateSystem':contract['coordinates'],'origin':contract['origin'],'footprint':contract['footprint'],'frontEdge':contract['frontEdge'],
      'buildingMasses':{'apparatusBay':{'minX':-14.0465,'maxX':3.6841,'frontZ':0,'rearZ':20.5097,'estimatedHeight':7.55,'doorCount':3},'redEntry':{'minX':3.5965,'maxX':14.2613,'frontZ':0,'rearZ':24.8699,'estimatedHeight':6.31},'legacyExhibitWing':{'minX':14.0,'maxX':43.6051,'frontZ':2.8899,'rearZ':37.9524,'estimatedHeight':4.72}},
      'frontDoorCenters':[-11.05,-5.25,0.55],'doorWidth':4.95,'doorHeight':4.42,'frontDoorType':'static glazed sectional appearance; no runtime panel pivots',
      'materials':{'brick':'#34383c','upperSiding':'#b3b6b5','doorFrames':'#b8bfbd','doorGlazing':'#0b181c','entry':'#8f111c','fascia':'#090b0c'},
      'evidence':contract['evidence'],'rear':'No verified rear view; closed conservative perimeter surfaces only, no rear apparatus-door count or openings inferred.',
      'dimensions':'Footprint copied from fire-station-gis-contract.json; all wall heights, openings, and door dimensions are photo-scaled estimates.'
    }


def export_audit(root,contract,layout):
    os.makedirs(ASSET,exist_ok=True); os.makedirs(MODEL,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(root); bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=GLB,export_format='GLB',export_yup=True,use_selection=True,export_apply=True)
    data=open(GLB,'rb').read(); checksum=hashlib.sha256(data).hexdigest()
    jl,jt=struct.unpack_from('<II',data,12); gltf=json.loads(data[20:20+jl].decode('utf-8').rstrip(' \x00'))
    nodes={n.get('name'):n for n in gltf.get('nodes',[])}
    required=['Station3_Root','Station3_Static']; missing=[n for n in required if n not in nodes]
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=GLB)
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH']; verts=[]
    for o in objs: verts.extend(o.matrix_world@Vector(v) for v in o.bound_box)
    bounds={'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]}
    meshes=gltf.get('meshes',[]); primitives=sum(len(m.get('primitives',[])) for m in meshes)
    report={'format':'glTF 2.0 binary','file':'station3.glb','fileBytes':len(data),'sha256':checksum,'units':'metres','orientation':'Y up; front -Z; local footprint coordinates preserved','sourceId':contract['sourceIds'][0],'anchor':contract['origin'],'footprintVertexCount':len(contract['footprint']),'footprintExactFromGIS':True,'rootNode':'Station3_Root','staticNode':'Station3_Static','missingRequiredNodes':missing,'dynamicDoorPivots':0,'frontStaticDoorCount':3,'rearDoorCount':None,'meshCount':len(meshes),'drawPrimitiveCount':primitives,'materialCount':len(gltf.get('materials',[])),'embeddedImageCount':sum(1 for i in gltf.get('images',[]) if 'bufferView' in i and 'uri' not in i),'reimportObjectCount':len(bpy.context.scene.objects),'reimportMeshObjectCount':len(objs),'reimportTriangleCount':sum(len(o.data.polygons) for o in objs),'boundsReimported':bounds,'reviewImages':['station3-front.png','station3-rear.png','station3-left.png','station3-right.png','station3-overhead.png'],'evidenceConfidence':{'front':'City July 2018 photos 2 and 44','rear':'unverified; generic closed perimeter','sides':'only photo-visible exposed high louver and glazed exhibit corner modeled; remaining side surfaces conservative'},'notes':['No reference-photo pixels included; all materials and flags are original procedural geometry/texture.','Three glazed front sectional doors and entrance facade are photo-grounded; dimensions are estimates.','No rear door count or layout is inferred because no verified rear view is available.','GIS outline and anchor/yaw are copied without adjustment.']}
    os.makedirs(ASSET,exist_ok=True)
    with open(REPORT,'w',encoding='utf-8') as f: json.dump(report,f,indent=2)
    with open(LAYOUT,'w',encoding='utf-8') as f: json.dump(layout,f,indent=2)
    if missing: raise RuntimeError('Required Station3 GLB root/static nodes missing: '+str(missing))
    if len(data)>2_000_000: print('NOTICE: GLB exceeds 2 MB target')
    return report


def main():
    with open(CONTRACT,encoding='utf-8') as f: contract=json.load(f)
    layout=make_layout(contract)
    root,stat=build(layout); merge_static(stat)
    render_views(); report=export_audit(root,contract,layout)
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
