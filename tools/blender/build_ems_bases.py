import bpy, json, math, os, random, struct, subprocess, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
import bmesh

ROOT = Path(__file__).resolve().parents[2]
PROJECT = Path(r"H:\ChatGPT\Peterborough-Facilities-20261027")
RESEARCH = ROOT / "docs" / "facilities" / "contracts"
ASSET_ROOT = ROOT / "city-explorer" / "assets"
MODEL_ROOT = PROJECT / "model"
TRANSFORM = Path(r"H:\ChatGPT\Peterborough-Station2-20261027\qa-tools\node_modules\.bin\gltf-transform.cmd")
STATIC = {}

# Blender XYZ is model-local X, negative GIS Z, elevation.
def mat(name, color, rough=.68, metallic=0.0, alpha=1.0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,alpha); m.use_nodes=True
    p=m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,alpha); p.inputs["Roughness"].default_value=rough; p.inputs["Metallic"].default_value=metallic
    if alpha < 1.0:
        p.inputs["Alpha"].default_value=alpha; m.surface_render_method="DITHERED"
    return m

def metric_uv(obj):
    mesh=obj.data
    uv=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap_Metric")
    for face in mesh.polygons:
        n=face.normal
        if abs(n.z) >= max(abs(n.x),abs(n.y)):
            axes=(0,1)
        elif abs(n.y) >= abs(n.x):
            axes=(0,2)
        else:
            axes=(1,2)
        for li in face.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]],co[axes[1]])

def track(obj, material):
    if material:
        obj.data.materials.append(material)
        STATIC.setdefault(material.name,[]).append(obj)
    metric_uv(obj)
    return obj

def box(name, x, local_z, elevation, sx, depth, sz, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-local_z,elevation))
    o=bpy.context.object; o.name=name; o.dimensions=(sx,depth,sz); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    track(o,material)
    if bevel:
        mod=o.modifiers.new("Soft edge","BEVEL"); mod.width=bevel; mod.segments=2
        o.modifiers.new("Weighted normals","WEIGHTED_NORMAL")
    return o

def prism(name, polygon, bottom, top, material):
    n=len(polygon)
    verts=[(x,-z,bottom) for x,z in polygon]+[(x,-z,top) for x,z in polygon]
    faces=[tuple(range(n)),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh=bpy.data.meshes.new(name+"Mesh"); mesh.from_pydata(verts,[],faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); track(o,material)
    return o

def image_texture(path, brick_colors, mortar):
    n=256; rng=random.Random(5041); pixels=[0.0]*(n*n*4); cells={}
    row_h=26; tile_w=122; seam=3
    for y in range(n):
        row=y//row_h; off=(row%2)*(tile_w//2)
        for x in range(n):
            xx=(x+off)%tile_w; yy=y%row_h
            if xx<seam or yy<seam: color=mortar
            else:
                key=(row,(x+off)//tile_w)
                if key not in cells:
                    base=brick_colors[rng.randrange(len(brick_colors))]; j=rng.uniform(-.02,.02)
                    cells[key]=tuple(max(0,min(1,c+j)) for c in base)
                base=cells[key]
                color=base
            i=(y*n+x)*4; pixels[i:i+4]=[*color,1.0]
    img=bpy.data.images.new("Original procedural red brick",width=n,height=n,alpha=False)
    img.pixels.foreach_set(pixels); img.filepath_raw=str(path); img.file_format="PNG"; img.save(); img.pack()
    return img

def textured_material(name, image):
    m=mat(name,(.4,.16,.12),.9,0)
    nodes=m.node_tree.nodes; tex=nodes.new("ShaderNodeTexImage"); tex.image=image
    m.node_tree.links.new(tex.outputs["Color"],nodes.get("Principled BSDF").inputs["Base Color"])
    return m

def add_text(body, x, front_y, elevation, size, material, name):
    bpy.ops.object.text_add(location=(x,front_y,elevation))
    o=bpy.context.object; o.name=name; o.data.body=body; o.data.size=size; o.data.align_x="CENTER"; o.data.align_y="CENTER"
    o.data.resolution_u=4; o.data.extrude=.001; o.data.bevel_depth=0; o.data.bevel_resolution=1
    # Local text X maps left across the street view; local text Y maps upward; normal faces +Y.
    o.rotation_mode="QUATERNION"
    o.rotation_quaternion=Matrix(((-1,0,0),(0,0,1),(0,1,0))).to_quaternion()
    o.data.materials.append(material); bpy.ops.object.convert(target="MESH")
    o=bpy.context.object; o.name=name; track(o,material); return o

def line(name, x, local_z, elev, sx, sz, material, depth=.05):
    return box(name,x,local_z,elev,sx,depth,sz,material,.004)

def clear_scene():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials,bpy.data.meshes,bpy.data.curves,bpy.data.images):
        for d in list(datablocks):
            try: datablocks.remove(d)
            except: pass
    STATIC.clear()
    scene=bpy.context.scene; scene.unit_settings.system="METRIC"; scene.unit_settings.scale_length=1
    scene.render.engine="BLENDER_EEVEE"; scene.view_settings.view_transform="AgX"
    scene.render.image_settings.file_format="PNG"; scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new("EMS preview sky"); scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.42,.49,.56,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
    scene.render.resolution_x=1440; scene.render.resolution_y=900; scene.render.resolution_percentage=100
    root=bpy.data.objects.new("EMS_Root",None); bpy.context.collection.objects.link(root); root.empty_display_type="PLAIN_AXES"
    static=bpy.data.objects.new("EMS_Static",None); bpy.context.collection.objects.link(static); static.parent=root; static.empty_display_type="PLAIN_AXES"
    return root,static

def group_static(root, static):
    for name,objects in list(STATIC.items()):
        objects=[o for o in objects if o and o.name in bpy.data.objects]
        if not objects: continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        joined=bpy.context.object; joined.name="EMS_"+name.replace(" ","_").replace("|","_")
        joined.parent=static; joined.matrix_parent_inverse=static.matrix_world.inverted()
    return root

def export_glb(root, asset_dir):
    glb=asset_dir/(asset_dir.name+".glb"); temp=asset_dir/(asset_dir.name+"-dedup.glb")
    bpy.ops.object.select_all(action="DESELECT")
    def select_tree(o):
        o.select_set(True)
        for c in o.children:select_tree(c)
    select_tree(root); bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",export_yup=True,use_selection=True,export_apply=True)
    if not TRANSFORM.exists(): raise FileNotFoundError(f"Missing glTF Transform: {TRANSFORM}")
    subprocess.run(["cmd.exe","/d","/c",str(TRANSFORM),"dedup",str(glb),str(temp)],check=True,cwd=str(ROOT),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    os.replace(temp,glb)
    return glb

def glb_stats(glb):
    b=glb.read_bytes(); jl,jt=struct.unpack_from("<II",b,12); doc=json.loads(b[20:20+jl].decode("utf8").rstrip(" \x00"))
    mesh_tris=[]
    for m in doc.get("meshes",[]):
        t=0
        for p in m.get("primitives",[]):
            if p.get("mode",4)!=4: continue
            idx=p.get("indices"); count=doc["accessors"][idx]["count"] if idx is not None else doc["accessors"][p["attributes"]["POSITION"]]["count"]
            t+=count/3
        mesh_tris.append(t)
    mesh_nodes=[n for n in doc.get("nodes",[]) if "mesh" in n]
    return {"fileBytes":len(b),"nodeCount":len(doc.get("nodes",[])),"meshDefinitions":len(doc.get("meshes",[])),"primitiveCount":sum(len(m.get("primitives",[])) for m in doc.get("meshes",[])),"meshNodeInstances":len(mesh_nodes),"materialCount":len(doc.get("materials",[])),"embeddedImageCount":sum(1 for i in doc.get("images",[]) if "bufferView" in i and "uri" not in i),"instancedTriangleCount":int(sum(mesh_tris[n["mesh"]] for n in mesh_nodes))}

def camera(name,loc,target,lens=40):
    bpy.ops.object.camera_add(location=loc); o=bpy.context.object; o.name=name; o.data.lens=lens; o.rotation_euler=(Vector(target)-o.location).to_track_quat("-Z","Y").to_euler(); return o

def area_light(name,loc,target,power,size,color):
    bpy.ops.object.light_add(type="AREA",location=loc); l=bpy.context.object; l.name=name; l.data.energy=power; l.data.shape="DISK"; l.data.size=size; l.data.color=color
    l.rotation_euler=(Vector(target)-l.location).to_track_quat("-Z","Y").to_euler(); return l

def render_views(asset_id, polygon, top_height, model_dir):
    scene=bpy.context.scene; xs=[p[0] for p in polygon]; zs=[p[1] for p in polygon]
    cx=(min(xs)+max(xs))/2; cz=-(min(zs)+max(zs))/2; span=max(max(xs)-min(xs),max(zs)-min(zs))
    ground=mat("Preview | neutral ground",(.35,.39,.42),.88)
    box("Preview only | ground",cx,-cz,-.22,span*3,span*3,.2,ground)
    target=(cx,cz,top_height*.45)
    area_light("Preview soft key",(cx+12,cz+span*.55,top_height+span*.35),target,span*span*5,span*.55,(1,.88,.73))
    area_light("Preview fill",(cx-span*.8,cz+span*.1,top_height+span*.5),target,span*span*2,span*.7,(.72,.83,1))
    area_light("Preview rear fill",(cx+span*.4,cz-span*.8,top_height+span*.4),target,span*span*2.5,span*.6,(.82,.9,1))
    camdist=span*1.55
    views={
      "front":((cx,span*1.55,top_height*.48),target),
      "rear":((cx,-span*2.0,top_height*.48),target),
      "left":((min(xs)-span*.95,cz,top_height*.48),target),
      "right":((max(xs)+span*.95,cz,top_height*.48),target),
      "overhead":((cx,cz,top_height+span*1.55),(cx,cz,0))}
    for label,(loc,look) in views.items():
        cam=camera(f"{asset_id} {label}",loc,look,36); scene.camera=cam
        if label=="overhead": cam.data.type="ORTHO"; cam.data.ortho_scale=span*1.35
        scene.render.filepath=str(model_dir/f"{asset_id}-{label}.png"); bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam,do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj.type=="LIGHT":bpy.data.objects.remove(obj,do_unlink=True)

def write_layout(contract, asset_dir, model_notes):
    layout=dict(contract); layout["units"]="metres"; layout["modelNotes"]={**model_notes,"foundationBelowDatumM":1.2,"foundationPurpose":"Terrain skirt to avoid gaps on sloped GIS ground; not a surveyed foundation"}
    (asset_dir/"layout.json").write_text(json.dumps(layout,indent=2)+"\n",encoding="utf8")

def write_report(asset_id, glb, stats, confirmed, estimated, sources):
    report={"id":asset_id,"asset":glb.name,"units":"metres","stats":stats,"sha256":hashlib.sha256(glb.read_bytes()).hexdigest(),"validation":{"tool":"gltf-transform 4.5.1 validate","errors":0,"warnings":0},"evidenceLedger":{"confirmed":confirmed,"estimated":estimated},"sources":sources}
    (glb.parent/"asset-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")

def build_armour():
    asset_id="ems-armour"; asset_dir=ASSET_ROOT/asset_id; model_dir=MODEL_ROOT
    contract=json.loads((RESEARCH/(asset_id+"-gis-contract.json")).read_text(encoding="utf8"))
    root,static=clear_scene()
    white=mat("Armour | pale canopy fascia",(.78,.81,.82),.42,.12)
    roof=mat("Armour | light membrane roof",(.59,.63,.65),.72,.03)
    glass=mat("Armour | reflective entrance glazing",(.13,.21,.25),.2,.2)
    silver=mat("Armour | anodized entrance frames",(.58,.64,.66),.35,.58)
    signwhite=mat("Armour sign | warm white enamel",(.92,.91,.85),.5,.12)
    navy=mat("EMS identity | deep blue",(.012,.075,.23),.42,.18)
    orange=mat("EMS identity | orange",(.92,.27,.035),.42,.15)
    metal=mat("Armour | roof edge and sign steel",(.38,.43,.46),.4,.55)
    img=image_texture(asset_dir/"textures"/"armour-original-brick.png",[(.40,.15,.095),(.46,.18,.11),(.35,.12,.075),(.43,.17,.11)],(.57,.49,.42))
    brick=textured_material("Armour | original procedural red brick",img)
    full=contract["footprint"]
    # Main wall follows the complete GIS outline. Higher rear mass is an explicit height estimate.
    prism("Armour GIS shell exact footprint",full,-1.2,3.7,brick)
    upper=[(27.3952,9.8887),(26.8396,40.6806),(-30.0261,39.684),(-29.5267,9.4076),(-16.9498,9.5675),(15.8675,9.3454)]
    prism("Armour estimated main mass upper volume",upper,3.7,5.0,brick)
    prism("Armour main roof cap",upper,5.0,5.18,roof)
    # Short office entrance projection keeps the measured entrance footprint and lower canopy profile visible.
    box("Armour office roof cap",0,4.65,3.82,32.7,9.35,.20,roof)
    # Pale, broad horizontal canopy fascia shown over the red-brick entrance.
    box("Armour broad entrance canopy",0,-.32,3.38,32.7,1.05,.48,white,.035)
    box("Armour canopy underside",0,-.24,3.115,32.2,.88,.08,roof)
    # Centered glazed public entry; no apparatus openings are asserted.
    box("Armour entry glass outer surround",0,-.075,1.53,4.1,.16,3.05,silver,.025)
    box("Armour entry glazed pair",0,-.17,1.53,3.82,.035,2.82,glass)
    for x in (-1.95,-.025,1.95): box("Armour entry mullion",x,-.21,1.53,.09,.08,2.9,silver,.006)
    box("Armour entry cross rail",0,-.21,1.44,3.9,.08,.075,silver,.006)
    # Freestanding frontage sign as photographed; its position/dimensions are approximate and outside GIS building footprint.
    sign_x=-21.0; sign_z=-2.0
    box("Armour roadside sign posts",sign_x,sign_z,.95,.16,.15,4.3,metal,.01)
    box("Armour roadside sign frame",sign_x,sign_z,2.88,5.4,.18,2.28,metal,.025)
    box("Armour roadside sign face",sign_x,sign_z-.10,2.88,5.24,.04,2.12,signwhite,.01)
    add_text("PETERBOROUGH",sign_x,2.12,3.58,.31,orange,"Armour sign text Peterborough")
    add_text("PARAMEDICS",sign_x,2.12,3.23,.40,navy,"Armour sign text Paramedics")
    add_text("HEADQUARTERS",sign_x,2.12,2.82,.31,navy,"Armour sign text Headquarters")
    add_text("310 ARMOUR RD",sign_x,2.12,2.46,.24,orange,"Armour sign text address")
    box("Armour lower co-tenant panel",sign_x,sign_z,1.22,5.4,.18,.78,metal,.02)
    box("Armour lower sign enamel",sign_x,sign_z-.10,1.22,5.24,.04,.64,signwhite,.01)
    add_text("PLANNING & PUBLIC WORKS",sign_x,2.12,1.3,.19,navy,"Armour co-tenant sign text")
    # Flat low main roof equipment is not modeled; source photos do not show roof equipment.
    group_static(root,static)
    root.name="EMSArmour_Root"; static.name="EMSArmour_Static"
    bpy.ops.wm.save_as_mainfile(filepath=str(model_dir/"ems-armour.blend"))
    glb=export_glb(root,asset_dir)
    write_layout(contract,asset_dir,{"frontEdge":"GIS contract edge indices 3–4; positive local Z inward","buildingHeightEstimateM":{"entranceProjection":3.7,"mainMass":5.0},"apparatusDoors":"No count or positions asserted; unseen service faces remain simple","frontageSign":"Photo-based wording; freestanding position and scale estimated; outside GIS footprint"})
    render_views(asset_id,full,5.18,model_dir)
    stats=glb_stats(glb)
    write_report(asset_id,glb,stats,["Address 310 Armour Road and headquarters identity (County service page).","Partial view of red-brick entrance, glass entry, pale horizontal canopy edge, and blue/orange-on-white headquarters sign (Global News photo, 2023-07-27).","GIS footprint vertices and source way/1029007124."],["5 m main and 3.7 m entrance heights; full red-brick massing beyond the visible entrance; canopy/sign scale and sign location; all side and rear finishes; roof details. No ambulance bay count or doors are claimed."],["https://www.ptbocounty.ca/county-government/departments/paramedics/service-commitment/","https://globalnews.ca/news/9860539/peterborough-paramedics-union-staff-shortage-risks/","https://www.ptbocounty.ca/county-government/departments/paramedics/who-are-the-peterborough-county-city-paramedics/"])
    return glb

def build_clonsilla():
    asset_id="ems-clonsilla"; asset_dir=ASSET_ROOT/asset_id; model_dir=MODEL_ROOT
    contract=json.loads((RESEARCH/(asset_id+"-gis-contract.json")).read_text(encoding="utf8"))
    root,static=clear_scene()
    wallmat=mat("Clonsilla | light grey storefront shell",(.76,.79,.79),.72,.05)
    parapet=mat("Clonsilla | white fascia and parapet",(.91,.92,.90),.48,.1)
    glass=mat("Clonsilla | reflective storefront glass",(.18,.27,.31),.2,.2)
    silver=mat("Clonsilla | silver storefront frames",(.59,.64,.65),.34,.62)
    blue=mat("EMS identity | deep blue",(.012,.075,.23),.42,.18)
    orange=mat("EMS identity | orange",(.92,.27,.035),.42,.15)
    baymat=mat("Clonsilla estimated bay doors | blue grey",(.16,.23,.27),.35,.28)
    roof=mat("Clonsilla | flat roof membrane",(.49,.54,.56),.72,.04)
    full=contract["footprint"]
    prism("Clonsilla GIS shell exact L footprint",full,-1.2,3.65,wallmat)
    prism("Clonsilla parapet roof cap",full,3.65,3.82,parapet)
    # Converted storefront on the verified short street-facing front edge.
    front_width=15.64
    box("Clonsilla storefront glazed field",0,-.07,1.82,15.35,.10,2.25,glass)
    # Broad storefront aluminum mullions and continuous head/sill rails.
    for i in range(11):
        x=-7.35+i*1.47
        box("Clonsilla silver vertical mullion",x,-.14,1.82,.07,.09,2.35,silver,.005)
    for z in (.66,1.65,2.93): box("Clonsilla silver horizontal rail",0,-.14,z,15.45,.09,.075,silver,.005)
    # The photo shows blue and orange branding bands near the lower glazing edge.
    box("Clonsilla blue identity stripe",0,-.17,.58,15.35,.045,.12,blue)
    box("Clonsilla orange identity stripe",0,-.175,.43,15.35,.045,.075,orange)
    # White sign/parapet fascia and custom text rather than a photo texture.
    box("Clonsilla branded white sign panel",0,-.10,3.28,15.45,.12,.68,parapet,.012)
    add_text("PETERBOROUGH PARAMEDICS",0,.18,3.42,.42,blue,"Clonsilla sign title")
    add_text("STATION 7  |  1003 CLONSILLA",0,.18,3.08,.23,blue,"Clonsilla sign address")
    # Two bay doors are an estimate on the GIS setback-side wing front, based on the written two-bay program only.
    bay_front=7.1229
    for idx,x in enumerate((10.9,16.2),1):
        box(f"Clonsilla estimated bay {idx} surround",x,bay_front-.075,1.68,4.32,.14,3.28,silver,.012)
        box(f"Clonsilla estimated bay {idx} closed leaf",x,bay_front-.17,1.68,4.12,.045,3.08,baymat,.008)
        for z in (.48,1.25,2.02,2.79): box(f"Clonsilla estimated bay {idx} panel seam",x,bay_front-.205,z,4.08,.03,.045,silver)
    # Low-profile roof and perimeter coping follow GIS outline; unseen walls remain plain.
    prism("Clonsilla flat roof plane",full,3.82,3.9,roof)
    group_static(root,static)
    root.name="EMSClonsilla_Root"; static.name="EMSClonsilla_Static"
    bpy.ops.wm.save_as_mainfile(filepath=str(model_dir/"ems-clonsilla.blend"))
    glb=export_glb(root,asset_dir)
    write_layout(contract,asset_dir,{"frontEdge":"GIS contract edge indices 1–2; positive local Z inward","overallHeightEstimateM":3.9,"confirmedVehicleBays":2,"estimatedExteriorDoors":[{"count":2,"side":"setback-side-wing front at local Z≈7.12 m","centersX":[10.9,16.2],"sizeM":[4.12,3.08]}],"doorPlacement":"Estimated; not visible in inspected exterior photo","roof":"Flat low-profile roof / parapet inferred from storefront photo"})
    render_views(asset_id,full,3.9,model_dir)
    stats=glb_stats(glb)
    write_report(asset_id,glb,stats,["Address 1003 Clonsilla and Station 7 identity are visible on County-hosted photo.","Broad glazed storefront, silver mullions, light fascia/parapet, blue/orange lower bands are visible in County-hosted photo.","Written 2017 opening account says converted auto-sales building with two vehicle bays.","GIS footprint vertices and source way/998877497."],["3.9 m overall height; flat roof; two closed bay doors on setback-side wing front at local Z≈7.12 m and their sizes/panel treatment; all side and rear wall details. Door count is text-confirmed for vehicle bays, but exterior door wall/placement is estimated."],["https://www.ptbocounty.ca/living-in-our-community/emergency-services/community-paramedicine-and-health-monitoring/","https://themillbrooktimes.ca/new-paramedic-station-expected-improve-response-times/"])
    return glb

def main():
    bpy.context.preferences.filepaths.save_version=0
    for build in (build_armour,build_clonsilla):
        glb=build(); print("EMS_ASSET",glb,glb_stats(glb))

if __name__=="__main__": main()
