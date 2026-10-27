import bpy, math, json, os, random, struct
from mathutils import Vector

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROOT = os.path.dirname(GAME)
ASSET = os.path.join(GAME, "city-explorer", "assets", "station2")
MODEL = os.path.join(ROOT, "model")
LAYOUT_PATH = os.path.join(ASSET, "layout.json")
GLB_PATH = os.path.join(ASSET, "station2.glb")
REPORT_PATH = os.path.join(ASSET, "asset-report.json")
BLEND_PATH = os.path.join(MODEL, "station2.blend")
W, H = 4.2672, 4.2672
LEAF_W = W / 4.0
mats, static_by_mat, all_dynamic = {}, {}, []

def material(name, color, rough=0.7, metallic=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, alpha); m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF"); p.inputs["Base Color"].default_value = (*color, alpha)
    p.inputs["Roughness"].default_value = rough; p.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "DITHERED"
    mats[name] = m
    return m

masonry = material("Masonry | charcoal-grey running bond", (0.20,0.23,0.27), .9)
fascia = material("Fascia | graphite metal", (.018,.024,.030), .62, .08)
red = material("Door frames | subdued fire red", (.48,.022,.042), .34, .25)
glass = material("Glazing | cool reflective glass", (.55,.68,.72), .09, .12, .045)
rear_polycarbonate = material("Rear door glazing | dark reflective polycarbonate", (.035,.065,.09), .22, .28)
firemark_navy = material("Tower firemark | navy enamel", (.018,.045,.09), .38, .12)
firemark_gold = material("Tower firemark | warm gold", (.72,.49,.15), .42, .28)
timber = material("Interior | honey glulam and CLT", (.48,.265,.105), .68)
timber_vertical = material("Exterior | vertical honey timber", (.48,.265,.105), .68)

concrete = material("Slab | polished concrete", (.40,.42,.42), .52)
timber_light=material("Timber | pale ceiling boards",(.62,.39,.19),.62)
black=material("Window frames | black anodized",(.025,.035,.04),.32,.35)
wing_glass=material("Wing glazing | smoked grey",(.075,.125,.14),.22,.24)
white=material("Interior | service wall",(.68,.70,.68),.78)
metal=material("Service steel | galvanized",(.34,.39,.40),.28,.72)
dark=material("Drain channel | dark steel",(.075,.09,.095),.3,.6)

def create_tile_image(name, file_name, kind, light=False):
    os.makedirs(os.path.join(ASSET, "textures"), exist_ok=True)
    path=os.path.join(ASSET, "textures", file_name)
    n=512
    rng=random.Random(22418 if kind=="brick" else (611 if light else 610))
    px=[0.0]*(n*n*4)
    brick_colors=[(0.215,0.24,0.275),(0.235,0.26,0.295),(0.265,0.285,0.315),(0.225,0.25,0.285)]
    cell_colors={}
    row_h=41; tile_w=205; mortar=5
    for y in range(n):
        row=y//row_h; off=(row%2)*(tile_w//2)
        for x in range(n):
            xx=(x+off)%tile_w; yy=y%row_h
            if xx<mortar or yy<mortar:
                base=(.31,.34,.37)
            else:
                key=(row,(x+off)//tile_w)
                if key not in cell_colors:
                    b=brick_colors[rng.randrange(len(brick_colors))]
                    jitter=rng.uniform(-.018,.018)
                    cell_colors[key]=tuple(max(0,min(1,c+jitter)) for c in b)
                b=cell_colors[key]
                grain=.008*math.sin((x%tile_w)*.075)+rng.uniform(-.006,.006)
                base=tuple(max(0,min(1,c+grain)) for c in b)
            i=(y*n+x)*4
            px[i:i+4]=[base[0],base[1],base[2],1.0]
    img=bpy.data.images.new(name,width=n,height=n,alpha=False)
    img.pixels.foreach_set(px); img.filepath_raw=path; img.file_format="PNG"; img.save(); img.pack()
    return img

def create_wood_image(name, file_name, light=False):
    os.makedirs(os.path.join(ASSET, "textures"), exist_ok=True)
    path=os.path.join(ASSET, "textures", file_name); n=512
    px=[0.0]*(n*n*4)
    base=(.52,.305,.145) if not light else (.64,.405,.225)
    for y in range(n):
        for x in range(n):
            phase=(y + 5.0*math.sin(x*.022) + 1.7*math.sin(x*.071))
            grain=(.5+.5*math.sin(phase*.18))
            fine=math.sin(phase*.78)*.018 + math.sin(phase*1.43)*.008
            value=(grain-.5)*.055+fine
            i=(y*n+x)*4
            px[i:i+4]=[max(0,min(1,c+value)) for c in base]+[1.0]
    img=bpy.data.images.new(name,width=n,height=n,alpha=False)
    img.pixels.foreach_set(px); img.filepath_raw=path; img.file_format="PNG"; img.save(); img.pack()
    return img

def assign_image_material(mat, image):
    nodes=mat.node_tree.nodes; principled=nodes.get("Principled BSDF")
    tex=nodes.new("ShaderNodeTexImage"); tex.image=image; tex.extension="REPEAT"; tex.interpolation="Linear"
    principled.inputs["Base Color"].default_value=(1,1,1,1)
    mat.node_tree.links.new(tex.outputs["Color"],principled.inputs["Base Color"])

assign_image_material(masonry,create_tile_image("Station 2 original grey masonry","station2-masonry-1m.png","brick"))
wood_image=create_wood_image("Station 2 original honey timber","station2-timber-1m.png")
assign_image_material(timber,wood_image)
assign_image_material(timber_vertical,wood_image)
assign_image_material(timber_light,create_wood_image("Station 2 original pale timber","station2-timber-light-1m.png",True))
def assign_metric_uv(obj):
    mesh=obj.data
    layer=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap_Metric")
    for poly in mesh.polygons:
        n=poly.normal
        if abs(n.z)>=abs(n.x) and abs(n.z)>=abs(n.y): axes=(0,1)
        elif abs(n.y)>=abs(n.x): axes=(0,2)
        else: axes=(1,2)
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv=(co[axes[0]],co[axes[1]])
def assign_vertical_grain_uv(obj):
    mesh=obj.data
    layer=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap_VerticalWood")
    for poly in mesh.polygons:
        n=poly.normal
        if abs(n.z)>=abs(n.x) and abs(n.z)>=abs(n.y): axes=(0,1)
        elif abs(n.y)>=abs(n.x): axes=(2,0)
        else: axes=(2,1)
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv=(co[axes[0]],co[axes[1]])
def cube_obj(name, loc, size, mat, bevel=0, dynamic_parent=None, target=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name
    o.dimensions=size; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_metric_uv(o)
    if mat: o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new("Soft architectural edges","BEVEL"); mod.width=bevel; mod.segments=2
        o.modifiers.new("Weighted corner normals","WEIGHTED_NORMAL")
    if dynamic_parent: o.parent=dynamic_parent; o.matrix_parent_inverse=dynamic_parent.matrix_world.inverted()
    else:
        key=mat.name if mat else "unassigned"; static_by_mat.setdefault(key,[]).append(o)
    return o

def box_g(name,x,z,y,height,depth,mat,bevel=0): # x center, game z center, elevation center
    return cube_obj(name,(x,-z,y),(depth,depth,depth),mat) if False else cube_obj(name,(x,-z,y),(depth,depth,height),mat,bevel)
def wall(name, x,z,y, sx,sz,sy,mat,bevel=0):
    return cube_obj(name,(x,-z,y),(sx,sz,sy),mat,bevel)

def shield_mesh(name, center_x, front_y, center_z, width, height, thickness, mat):
    # Small original shield silhouette inspired by the JCB tower crest; not a traced emblem.
    profile=[(-.50,.38),(.50,.38),(.50,-.10),(0,-.50),(-.50,-.10)]
    front=[(center_x+px*width,front_y,center_z+pz*height) for px,pz in profile]
    back=[(x,front_y-thickness,z) for x,_,z in front]
    verts=front+back
    faces=[tuple(range(5)),tuple(range(9,4,-1))]
    faces.extend((i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5))
    mesh=bpy.data.meshes.new(name+"Mesh"); mesh.from_pydata(verts,[],faces); mesh.materials.append(mat); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    assign_metric_uv(obj); static_by_mat.setdefault(mat.name,[]).append(obj)
    return obj

def bar(name,a,b,r,mat,collection=None):
    mid=(Vector(a)+Vector(b))/2; d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=d.length, location=mid)
    o=bpy.context.object; o.name=name; o.rotation_mode="QUATERNION"; o.rotation_quaternion=d.to_track_quat("Z","Y")
    if mat:o.data.materials.append(mat)
    if collection is None: static_by_mat.setdefault(mat.name if mat else "unassigned",[]).append(o)
    return o

def front_door_leaf(door_index, side, kind, pivot_x, center_x, panel_min_x, direction):
    name=f"Door_F{door_index}_{side}_{kind}"
    pivot=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(pivot); pivot.location=(pivot_x,0,0); pivot.empty_display_type="PLAIN_AXES"; pivot.empty_display_size=.22
    all_dynamic.append(pivot)
    cx=pivot_x + direction * LEAF_W/2
    # leaf has real red perimeter and intermediate transom with two insulated glass lites
    child=cube_obj(f"F{door_index}_{side}_{kind}_red_stile_left",(cx-LEAF_W/2+.065,-.075,H/2),(0.13,.12,H),red,.015,pivot)
    cube_obj(f"F{door_index}_{side}_{kind}_red_stile_right",(cx+LEAF_W/2-.065,-.075,H/2),(0.13,.12,H),red,.015,pivot)
    cube_obj(f"F{door_index}_{side}_{kind}_top_rail",(cx,-.075,H-.065),(LEAF_W,.12,.13),red,.015,pivot)
    cube_obj(f"F{door_index}_{side}_{kind}_bottom_rail",(cx,-.075,.065),(LEAF_W,.12,.13),red,.015,pivot)
    cube_obj(f"F{door_index}_{side}_{kind}_mid_rail",(cx,-.078,H/2),(LEAF_W-.12,.13,.11),red,.012,pivot)
    for row, (lo,hi) in enumerate(((.19,H/2-.09),(H/2+.09,H-.19))):
        ph=hi-lo
        cube_obj(f"F{door_index}_{side}_{kind}_glass_{row+1}",(cx,-.145,(hi+lo)/2),(LEAF_W-.24,.035,ph),glass,.008,pivot)
    for z in (.24,H-.24):
        cube_obj(f"F{door_index}_{side}_{kind}_hinge",(pivot_x,-.14,z),(.09,.16,.16),metal,.02,pivot)
    # actuator/handle hardware
    cube_obj(f"F{door_index}_{side}_{kind}_operator",(cx,-.16,H*.54),(.07,.09,.42),metal,.012,pivot)
    return pivot

def setup_scene():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for d in bpy.data.collections:
        if d.name != "Collection": bpy.data.collections.remove(d)
    bpy.context.scene.unit_settings.system="METRIC"; bpy.context.scene.unit_settings.scale_length=1
    bpy.context.scene.render.engine="CYCLES" if False else "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x=1440; bpy.context.scene.render.resolution_y=960; bpy.context.scene.render.resolution_percentage=100
    bpy.context.scene.render.image_settings.file_format="PNG"; bpy.context.scene.render.film_transparent=False
    bpy.context.scene.view_settings.view_transform="AgX"
    world=bpy.context.scene.world; world.color=(.22,.26,.30); world.use_nodes=True; world.node_tree.nodes["Background"].inputs["Color"].default_value=(.28,.34,.42,1); world.node_tree.nodes["Background"].inputs["Strength"].default_value=.35
    bpy.ops.object.empty_add(type="PLAIN_AXES",location=(0,0,0)); root=bpy.context.object; root.name="Station2_Root"; root.empty_display_size=.4
    bpy.ops.object.empty_add(type="PLAIN_AXES",location=(0,0,0)); stat=bpy.context.object; stat.name="Station2_Static"; stat.parent=root; stat.empty_display_size=.3
    return root,stat

def build(layout):
    root,stat=setup_scene()
    # slab, bounded to the working station footprint; origin is finished floor
    wall("Bay slab",0,11.7,-.12,18,23.4,.24,concrete)
    wall("Office wing slab",-15.9,15.2,-.12,13.8,29.6,.24,concrete)
    # Bay perimeter walls. Side walls intentionally keep the bays open internally.
    wall("Bay left exterior wall",-8.85,11.7,2.8,.3,23.4,5.6,masonry)
    wall("Bay right exterior wall",8.85,11.7,2.8,.3,23.4,5.6,masonry)
    wall("Bay clerestory glazing left",-8.85,11.7,6.25,.16,23.4,1.25,glass)
    wall("Bay clerestory glazing right",8.85,11.7,6.25,.16,23.4,1.25,glass)
    for side_x in (-8.82,8.82):
        for gz in [1,4,7,10,13,16,19,22]:
            wall(f"Side clerestory mullion {side_x}_{gz}",side_x,gz,6.25,.18,.12,1.25,black)

    wall("Bay rear wall left pier",-5.5664,23.25,3.5,6.8672,.3,7,masonry)
    wall("Bay rear wall center pier",2.85,23.25,3.5,1.4336,.3,7,masonry)
    wall("Bay rear wall right pier",8.4168,23.25,3.5,1.1664,.3,7,masonry)
    wall("Bay rear lintel band",0,23.25,5.6336,18,.3,2.7328,masonry)
    # Front facade masonry piers and door headers; three true openings.
    centers=[-5.7,0,5.7]
    spans=[(-9,-7.8344),(-3.5656,-2.1344),(2.1344,3.5656),(7.8344,9)]
    for i,(a,b) in enumerate(spans):
        if b>a: wall(f"Front masonry pier {i+1}",(a+b)/2,0,2.12,b-a,.42,4.24,masonry)
    for i,c in enumerate(centers):
        wall(f"Door lintel {i+1}",c,0,4.51,4.2672,.42,.486,masonry)
        # jamb columns down full opening are incorporated by piers and steel channel jambs
        for dx in (-W/2-.055,W/2+.055):
            wall(f"Door reveal {i+1}",c+dx,0,2.13,.11,.52,4.26,fascia)
    # Continuous upper clerestory band with black mullions and tall dark roof canopy
    wall("Clerestory glass continuous",0,0,5.72,18,.12,1.84,glass)
    for x in [-9,-6,-3,0,3,6,9]:
        wall(f"Clerestory mullion {x}",x,0,5.72,.075,.22,1.84,black)
    wall("Clerestory sill",0,0,4.72,18,.4,.12,fascia)
    wall("Front transom fascia",0,0,6.7,18,.42,.42,fascia)
    wall("Bay roof fascia",0,11.5,7.48,19.3,24,.72,fascia,.035)
    # Timber-lined bay and substantial glulam roof structure
    wall("Bay timber left lining",-8.55,11.6,2.55,.06,22.9,5.1,timber)
    wall("Bay timber right lining",8.55,11.6,2.55,.06,22.9,5.1,timber)
    wall("Bay rear timber pier left",-5.5664,23.0,3.15,6.8672,.06,6.25,timber)
    wall("Bay rear timber pier middle",2.85,23.0,3.15,1.4336,.06,6.25,timber)
    wall("Bay rear timber pier right",8.4168,23.0,3.15,1.1664,.06,6.25,timber)
    wall("Bay rear timber header",0,23.0,5.77,18,.06,2.46,timber)
    wall("CLT roof underside",0,11.65,6.94,17.15,22.9,.16,timber_light)
    for x in [-8,-4,0,4,8]:
        wall(f"Glulam transverse beam {x}",x,11.65,6.67,.28,22.95,.46,timber)
    for z in [3.6,7.6,11.6,15.6,19.6,22.5]:
        for x in [-8.45,8.45]:
            wall(f"Timber wall post {x}_{z}",x,z,3.15,.18,.2,6.3,timber)
    # Interior slot drainage lines and unobtrusive service features
    for x in (-5.7,0,5.7):
        wall(f"Bay trench drain {x}",x,11.5,.006,.13,22.8,.012,dark)
        for n in range(36):
            z=.8+n*.6
            wall(f"Drain grate {x}_{n}",x,z,.014,.24,.018,.014,metal)
    # Warm ceiling luminaires, suspended conduits and hose drop rails
    for x in [-6,0,6]:
        for z in [3.2,9.0,15.0,21.0]:
            wall(f"LED linear fixture {x}_{z}",x,z,6.38,.09,2.4,.09,white)
        bar(f"Overhead service rail {x}",(x,-2,6.15),(x,-22,6.15),.035,metal)
        for z in (4,10,16,21):
            bar(f"Suspension hanger {x}_{z}",(x,-z,6.15),(x,-z,5.9),.024,metal)
    # Front doors: individual fourth-width leaves, independent top-level pivots.
    for index,c in enumerate(centers,1):
        left=c-W/2
        # leaf zones across opening, side/kind aligns to independently animated pivot contract
        front_door_leaf(index,"L","Outer",left,left,left,1)
        front_door_leaf(index,"L","Inner",left+LEAF_W,left,left+LEAF_W,1)
        front_door_leaf(index,"R","Inner",c+W/2-LEAF_W,c,c+W/2-2*LEAF_W,-1)
        front_door_leaf(index,"R","Outer",c+W/2,c,c+W/2-LEAF_W,-1)
    # Rear seven-section overhead doors; placement is an explicit inference from installer source.
    for di,c in enumerate((0,5.7),1):
        for i in range(7):
            zc=(i+.5)*H/7
            pname=f"Door_R{di}_Panel{i}"
            pivot=bpy.data.objects.new(pname,None); bpy.context.collection.objects.link(pivot); pivot.location=(c,-23.4,zc); pivot.empty_display_type="PLAIN_AXES"; pivot.empty_display_size=.12; all_dynamic.append(pivot)
            cube_obj(pname+"_section",(c,-23.4,zc),(3.9,.09,H/7-.025),metal,.018,pivot)
            cube_obj(pname+"_glazing",(c,-23.4-.052,zc),(3.55,.025,H/7-.13),rear_polycarbonate,.012,pivot)
            cube_obj(pname+"_stiffener",(c,-23.4-.07,zc-H/7*.34),(4.05,.045,.05),metal,.012,pivot)
    # Rear support/service massing on the left; no unverified room partitions or props.
    wall("Service support block",-5.85,18.8,1.6,5.7,8.6,3.2,white)
    wall("Service block wood accent",-5.85,14.35,2.45,5.4,.12,1.5,timber)
    # Lower office/living wing: grey masonry base, timber accent, clerestory ribbon.
    wall("Office wing outer rear", -15.9,29.85,1.9,13.8,.3,3.8,masonry)
    wall("Office wing outer left",-22.65,15.2,1.9,.3,29.6,3.8,masonry)
    # Photo 013 shows one tall glazed window and a glazed public entry at the far end.
    # Masonry is split around those actual openings rather than continued behind the glass.
    wing_front_min,wing_front_max=-22.8,-9.0
    wing_front_openings=[(-22.5,-20.3,0.0,2.7),(-12.4,-11.2,.45,2.9)]
    front_levels=sorted({0.0,3.8,*[v for opening in wing_front_openings for v in opening[2:]]})
    for band,(y0,y1) in enumerate(zip(front_levels,front_levels[1:])):
        yc=(y0+y1)/2; cursor=wing_front_min
        active=sorted((a,b) for a,b,lo,hi in wing_front_openings if lo<=yc<=hi)
        for x0,x1 in active:
            if x0>cursor:
                wall(f"Office wing front masonry band {band}_{cursor}",(cursor+x0)/2,.55,yc,x0-cursor,.3,y1-y0,masonry)
            cursor=max(cursor,x1)
        if cursor<wing_front_max:
            wall(f"Office wing front masonry band {band}_end",(cursor+wing_front_max)/2,.55,yc,wing_front_max-cursor,.3,y1-y0,masonry)
    wall("Office wing partition",-9.15,15.2,1.9,.3,29.0,3.8,masonry)
    wall("Office wing roof",-15.9,15.2,3.88,14.3,30.5,.42,fascia,.025)
    # Tall dark glazing beneath the near-bay vertical timber accent.
    wall("Wing tall window glazing",-11.8,.50,1.675,1.08,.045,2.31,wing_glass)
    for dx in (-.57,.57):
        wall(f"Wing tall window jamb {dx}",-11.8+dx,.50,1.675,.06,.10,2.45,black)
    for y in (.45,2.9):
        wall(f"Wing tall window rail {y}",-11.8,.50,y,1.2,.10,.06,black)
    panel=wall("Wing vertical timber accent",-11.8,.31,3.35,1.55,.10,.90,timber_vertical)
    assign_vertical_grain_uv(panel)
    # Far-end public entry is full-height glazing under a projecting dark canopy.
    entry_x=-21.4
    wall("Wing public entry glazing",entry_x,.50,1.35,2.06,.045,2.56,wing_glass)
    for dx in (-1.07,0,1.07):
        wall(f"Wing entry mullion {dx}",entry_x+dx,.50,1.35,.06,.10,2.70,black)
    for y in (0.0,2.70):
        wall(f"Wing entry rail {y}",entry_x,.50,y,2.2,.10,.06,black)
    wall("Wing public entry canopy",entry_x,-.10,2.94,2.8,1.05,.16,fascia,.015)
    # Tower sits back along the bay's right flank, as in the oblique exterior photo.
    tower_cfg=layout["tower"]
    tower_x=(tower_cfg["minX"]+tower_cfg["maxX"])/2
    tower_z=(tower_cfg["frontZ"]+tower_cfg["rearZ"])/2
    tower_w=tower_cfg["maxX"]-tower_cfg["minX"]
    tower_d=tower_cfg["rearZ"]-tower_cfg["frontZ"]
    tower_h=tower_cfg["height"]
    tower_front=tower_cfg["frontZ"]
    wall("Tower masonry shaft",tower_x,tower_z,tower_h/2,tower_w,tower_d,tower_h,masonry)
    wall("Tower dark cap",tower_x,tower_z,tower_h+.08,tower_w+.45,tower_d+.4,.36,fascia)
    tower_panel=wall("Tower timber accent panel",tower_cfg["minX"]+.65,tower_front-.08,2.05,1.05,.12,3.9,timber_vertical)
    assign_vertical_grain_uv(tower_panel)
    sign_y=8.76
    badge_front_y=-(tower_front-.21)
    shield_mesh("Tower firemark gold shield",tower_x,badge_front_y,sign_y,.92,1.08,.045,firemark_gold)
    shield_mesh("Tower firemark navy inset",tower_x,badge_front_y+.012,sign_y,.76,.89,.035,firemark_navy)
    # Generic gold cross mark keeps the badge legible without copying the official crest artwork.
    wall("Tower firemark vertical",tower_x,tower_front-.25,sign_y,.105,.35,.025,firemark_gold,.008)
    wall("Tower firemark crossbar",tower_x,tower_front-.25,sign_y+.03,.29,.105,.025,firemark_gold,.008)
    for i in range(7):
        wall(f"Tower louver blade {i}",tower_x,tower_front+.14,3.55+i*.14,1.3,.12,.045,metal)
    # Low timber-clad side annex links the street-side approach to the station.
    annex_cfg=layout["sideAnnex"]
    annex_x=(annex_cfg["minX"]+annex_cfg["maxX"])/2
    annex_z=(annex_cfg["frontZ"]+annex_cfg["rearZ"])/2
    annex_w=annex_cfg["maxX"]-annex_cfg["minX"]
    annex_d=annex_cfg["rearZ"]-annex_cfg["frontZ"]
    annex_h=annex_cfg["height"]
    annex=wall("Timber side annex",annex_x,annex_z,annex_h/2,annex_w,annex_d,annex_h-.16,timber_vertical)
    assign_vertical_grain_uv(annex)
    wall("Timber side annex roof",annex_x,annex_z,annex_h-.08,annex_w+.08,annex_d+.08,.16,fascia,.015)
    # roof equipment / modest solar arrays visible from high angle, original geometry.
    for i in range(8):
        x=-6.5+i*1.8
        wall(f"Solar panel {i+1}",x,9.0,7.92,1.45,3.4,.08,black,.02)
        wall(f"Solar panel sheen {i+1}",x,9.0,7.97,1.34,3.28,.012,glass)
    # downpipes at wing and bay ends
    for x,z in [(-22.3,2),(-9.25,2),(8.58,2),(tower_cfg["maxX"]-.15,tower_cfg["rearZ"]-.2)]:
        bar(f"Rainwater downpipe {x}",(x,-z,6.9),(x,-z,0.05),.055,metal)
    # Batch each moving leaf and rear panel by material, retaining independent named pivots.
    for piv in all_dynamic:
        groups={}
        for child in list(piv.children):
            if child.type=="MESH":
                key=child.data.materials[0].name if child.data.materials else "unassigned"
                groups.setdefault(key,[]).append(child)
        for key,objs in groups.items():
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objs: obj.select_set(True)
            bpy.context.view_layer.objects.active=objs[0]
            if len(objs)>1: bpy.ops.object.join()
            joined=bpy.context.object; joined.name=piv.name+"_mesh_"+key.replace(" ","_")
            joined.parent=piv; joined.matrix_parent_inverse=piv.matrix_world.inverted()
        piv.parent=root; piv.matrix_parent_inverse=root.matrix_world.inverted()
    # Static building geometry is joined once per material.
    for mat_name, objects in static_by_mat.items():
        valid=[o for o in objects if o and o.name in bpy.data.objects]
        if not valid: continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in valid: o.select_set(True)
        bpy.context.view_layer.objects.active=valid[0]
        if len(valid)>1: bpy.ops.object.join()
        joined=bpy.context.object; joined.name="Static_"+mat_name.replace(" ","_").replace("|","").replace("/","_")
        joined.parent=stat; joined.matrix_parent_inverse=stat.matrix_world.inverted()
    structure_col=bpy.data.collections.new("Station 2 | Structure"); doors_col=bpy.data.collections.new("Station 2 | Animated Doors")
    bpy.context.scene.collection.children.link(structure_col); bpy.context.scene.collection.children.link(doors_col)
    door_objects=set(all_dynamic)
    for pivot in all_dynamic: door_objects.update(pivot.children)
    for obj in list(bpy.data.objects):
        destination=doors_col if obj in door_objects else structure_col
        for collection in list(obj.users_collection): collection.objects.unlink(obj)
        destination.objects.link(obj)
    for collection in list(bpy.data.collections):
        if collection.name=="Collection" and not collection.objects and not collection.children: bpy.data.collections.remove(collection)
    return root

def aim(o, target):
    o.rotation_euler=(Vector(target)-o.location).to_track_quat("-Z","Y").to_euler()

def camera(name, loc, target, lens=42):
    bpy.ops.object.camera_add(location=loc); o=bpy.context.object; o.name=name; aim(o,target); o.data.lens=lens; return o

def add_area(loc, target, energy, size, color=(1,1,1)):
    bpy.ops.object.light_add(type="AREA",location=loc); l=bpy.context.object; l.data.energy=energy; l.data.shape="DISK"; l.data.size=size; l.data.color=color; aim(l,target); return l

def render_glb_previews():
    sc=bpy.context.scene
    sc.render.engine="BLENDER_EEVEE"; sc.render.resolution_x=1440; sc.render.resolution_y=960
    sc.render.image_settings.file_format="PNG"; sc.view_settings.view_transform="AgX"
    sc.world=bpy.data.worlds.new("Station2 preview world"); sc.world.use_nodes=True
    sc.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.38,.46,.54,1)
    sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
    wall("Preview only outside ground",0,-28,-.14,150,150,.12,concrete)
    add_area((5,24,16),(-2,0,3.5),15500,16,(1,.86,.72))
    add_area((-16,16,11),(-5,0,3.2),9500,14,(.78,.87,1))
    add_area((0,-12,7),(0,-20,3.4),4800,12,(1,.88,.70))
    add_area((-7,-20,6),(-5,-3,3.3),3000,10,(.85,.91,1))
    add_area((5,-38,15),(2,-23.4,3.5),13500,15,(.84,.90,1))
    cam=camera("GLB exterior street view",(20,39,1.75),(-3,0,3.8),42); sc.camera=cam
    sc.render.resolution_x=1920; sc.render.resolution_y=1280
    sc.render.filepath=os.path.join(MODEL,"station2-exterior.png"); bpy.ops.render.render(write_still=True)
    sc.render.resolution_x=1440; sc.render.resolution_y=960
    cam.location=(2,-20,3.15); aim(cam,(0,-.5,3.7)); cam.data.lens=22; sc.camera=cam
    sc.render.filepath=os.path.join(MODEL,"station2-bay-interior.png"); bpy.ops.render.render(write_still=True)
    cam.location=(15,-46,8); aim(cam,(2.5,-23.4,3.6)); cam.data.lens=37; sc.camera=cam
    sc.render.filepath=os.path.join(MODEL,"station2-rear.png"); bpy.ops.render.render(write_still=True)

def export_and_validate():
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    bpy.ops.object.select_all(action="DESELECT")
    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children: select_tree(child)
    root=bpy.data.objects["Station2_Root"]
    select_tree(root); bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", export_yup=True, use_selection=True, export_apply=True)
    size=os.path.getsize(GLB_PATH)
    with open(GLB_PATH,"rb") as f: binary=f.read()
    json_len,json_type=struct.unpack_from("<II",binary,12)
    gltf=json.loads(binary[20:20+json_len].decode("utf-8").rstrip(" \x00"))
    mesh_count=len(gltf.get("meshes",[]))
    primitive_count=sum(len(mesh.get("primitives",[])) for mesh in gltf.get("meshes",[]))
    embedded_images=sum(1 for img in gltf.get("images",[]) if "bufferView" in img and "uri" not in img)
    material_count=len(gltf.get("materials",[]))
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    node_map={n.get("name"):n for n in gltf.get("nodes",[])}
    rear_centers={1:0.0,2:5.7}
    panel_translations={}
    panel_translation_valid=True
    panel_bounds_valid=True
    for d,c in rear_centers.items():
        for i in range(7):
            n=f"Door_R{d}_Panel{i}"; expected_y=(i+.5)*H/7
            node=node_map.get(n,{}); t=node.get("translation",[0,0,0]); panel_translations[n]=t
            panel_translation_valid &= len(t)==3 and abs(t[0]-c)<.002 and abs(t[1]-expected_y)<.002 and abs(t[2]-23.4)<.002
            obj=bpy.data.objects.get(n)
            corners=[obj.matrix_world@Vector(v) for child in obj.children if child.type=="MESH" for v in child.bound_box] if obj else []
            if corners:
                panel_bounds_valid &= min(v.z for v in corners)>=-.02 and max(v.z for v in corners)<=H+.02
                panel_bounds_valid &= min(v.x for v in corners)>=c-W/2-.02 and max(v.x for v in corners)<=c+W/2+.02
    def static_ray_blocked(origin,direction,max_distance):
        for obj in bpy.context.scene.objects:
            if obj.type!="MESH" or not obj.name.startswith("Static_"): continue
            inv=obj.matrix_world.inverted()
            hit,_,_,_=obj.ray_cast(inv@Vector(origin),obj.matrix_world.to_3x3().inverted()@Vector(direction),distance=max_distance)
            if hit: return True
        return False
    clear_samples=0; blocked_samples=0
    for c in (-5.7,0,5.7):
        for dx in (-1.5,0,1.5):
            for elevation in (.8,2.15,3.5):
                clear_samples+=1
                blocked_samples+=int(static_ray_blocked((c+dx,-1,elevation),(0,1,0),2.0))
    for c in (0,5.7):
        for dx in (-1.4,0,1.4):
            for elevation in (.8,2.15,3.5):
                clear_samples+=1
                blocked_samples+=int(static_ray_blocked((c+dx,-22,elevation),(0,-1,0),2.0))
    names={o.name for o in bpy.context.scene.objects}
    front_expected=[f"Door_F{i}_{s}_{k}" for i in range(1,4) for s in ("L","R") for k in ("Outer","Inner")]
    rear_expected=[f"Door_R{d}_Panel{i}" for d in (1,2) for i in range(7)]
    expected=["Station2_Root","Station2_Static"]+front_expected+rear_expected
    missing=[n for n in expected if n not in names]
    fronts=[bpy.data.objects[n] for n in front_expected if n in names]
    independent=all(o.parent and o.parent.name=="Station2_Root" for o in fronts)
    bounds=[]
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            for v in o.bound_box: bounds.append(o.matrix_world@Vector(v))
    mins=[min(v[i] for v in bounds) for i in range(3)] if bounds else [0,0,0]
    maxs=[max(v[i] for v in bounds) for i in range(3)] if bounds else [0,0,0]
    report={"format":"glTF 2.0 binary","file":"station2.glb","fileBytes":size,"units":"metres","orientation":"Y up; front -Z; bay +Z","frontDoorPivotCount":len(fronts),"rearPanelTranslationsValid":panel_translation_valid,"rearPanelBoundsInsideOpenings":panel_bounds_valid,"clearOpeningSampleCount":clear_samples,"blockedStaticOpeningSamples":blocked_samples,"rearPanelGLTFTranslations":panel_translations,"frontPivotsIndependentChildren":independent,"rearSectionPanelCount":sum(1 for n in rear_expected if n in names),"missingRequiredNodes":missing,"reimportNodeCount":len(names),"reimportMeshObjectCount":sum(1 for o in bpy.context.scene.objects if o.type=="MESH"),"glbMeshCount":mesh_count,"drawPrimitiveCount":primitive_count,"materialCount":material_count,"embeddedImageCount":embedded_images,"boundsReimported":{"min":mins,"max":maxs},"reimportTriangleCount":sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=="MESH"),"notes":["original tiled masonry and timber PNG materials embedded in GLB; metric UVs","non-door dimensions estimated from completed reference photos and City site presentation","rear sectional door placement inferred","tower badge is an original generic navy-and-gold shield inspired by the photographed crest silhouette, not a verified reproduction of official arms"]}
    with open(REPORT_PATH,"w") as f: json.dump(report,f,indent=2)
    if missing or len(fronts)!=12 or not independent or report["rearSectionPanelCount"]!=14 or not panel_translation_valid or not panel_bounds_valid or blocked_samples: raise RuntimeError("Missing named door nodes or independent front pivots")
    if primitive_count>90: raise RuntimeError(f"Draw primitive budget exceeded: {primitive_count}")
    if maxs[2]-mins[2]<9.0: raise RuntimeError("Unexpected vertical bounds")
    render_glb_previews()
    print(json.dumps(report,indent=2))
def main():
    with open(LAYOUT_PATH) as f: layout=json.load(f)
    assert abs(layout["doorWidth"]-W)<1e-6 and abs(layout["doorHeight"]-H)<1e-6
    assert abs(layout["tower"]["frontZ"]-17)<1e-6 and abs(layout["tower"]["rearZ"]-21)<1e-6
    assert abs(layout["sideAnnex"]["minX"]-9)<1e-6 and abs(layout["sideAnnex"]["maxX"]-12.2)<1e-6
    assert abs(layout["sideAnnex"]["frontZ"]-1)<1e-6 and abs(layout["sideAnnex"]["rearZ"]-8)<1e-6
    assert abs(layout["sideAnnex"]["height"]-3.2)<1e-6
    build(layout); export_and_validate()
if __name__=="__main__": main()
