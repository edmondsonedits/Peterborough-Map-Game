"""Build the Peterborough Fire Station 3 landmark from original Blender geometry.

Usage (from repository root):
  blender --background --python tools/blender/build_station_three.py

All dimensions are metres. The frontage anchor is the midpoint of OSM way
558402285's SE-facing edge. Blender axes are X east, Y north, Z up; the GLB
export is glTF Y-up (X east, Y up, Z south). The architectural interior is
an informed visual approximation because no floor plan was available.
"""
from pathlib import Path
import bpy
import json
import math
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / 'assets-source/stations'
GLB_DIR = ROOT / 'city-explorer/assets/stations'
RENDER_DIR = ROOT / 'docs/stations/renders'
SOURCE_DIR.mkdir(parents=True, exist_ok=True)
GLB_DIR.mkdir(parents=True, exist_ok=True)
RENDER_DIR.mkdir(parents=True, exist_ok=True)

ANCHOR = {'latitude': 44.28490065, 'longitude': -78.3506243}
# Tangent of OSM edge from its southwest endpoint toward northeast, resolved
# with a local metric projection at the anchor latitude.
LAT_M = 0.0002069 * 111132.0
LON_M = 0.0002048 * 111320.0 * math.cos(math.radians(ANCHOR['latitude']))
EDGE_LENGTH = math.hypot(LAT_M, LON_M)
WIDTH_E = LON_M / EDGE_LENGTH
WIDTH_N = LAT_M / EDGE_LENGTH
ROT_Z = math.atan2(WIDTH_N, WIDTH_E)  # Blender local +X to frontage tangent
OUTWARD_BEARING = (math.degrees(math.atan2(WIDTH_N, -WIDTH_E)) % 360.0)
SPAWN_LOCAL = (-0.7, 5.6, 0.0)  # exterior-left bay 01 centre, metres inward from facade
SPAWN_EAST = SPAWN_LOCAL[0] * WIDTH_E - SPAWN_LOCAL[1] * WIDTH_N
SPAWN_NORTH = SPAWN_LOCAL[0] * WIDTH_N + SPAWN_LOCAL[1] * WIDTH_E
SPAWN_GAME_HEADING_DEG = (360.0 - OUTWARD_BEARING) % 360.0

# Read the exact mapped way outline from this versioned OSM snapshot. Only its
# exterior shell is asserted; internal room divisions remain approximate.
OSM_PATH = ROOT / 'city-explorer/data/peterborough-osm.json'
OSM_DATA = json.loads(OSM_PATH.read_text(encoding='utf-8'))
OSM_WAY = next(item for item in OSM_DATA['elements'] if item.get('type') == 'way' and item.get('id') == 558402285)
OSM_OUTLINE = []
for point in OSM_WAY['geometry']:
    east = (point['lon'] - ANCHOR['longitude']) * 111320.0 * math.cos(math.radians(ANCHOR['latitude']))
    north = (point['lat'] - ANCHOR['latitude']) * 111132.0
    local_x = east * WIDTH_E + north * WIDTH_N
    local_y = -east * WIDTH_N + north * WIDTH_E
    candidate = (local_x, local_y)
    if not OSM_OUTLINE or math.dist(OSM_OUTLINE[-1], candidate) > .02:
        OSM_OUTLINE.append(candidate)
if len(OSM_OUTLINE) > 2 and math.dist(OSM_OUTLINE[0], OSM_OUTLINE[-1]) < .02:
    OSM_OUTLINE.pop()
OSM_AREA = abs(sum(OSM_OUTLINE[i][0]*OSM_OUTLINE[(i+1)%len(OSM_OUTLINE)][1] - OSM_OUTLINE[(i+1)%len(OSM_OUTLINE)][0]*OSM_OUTLINE[i][1] for i in range(len(OSM_OUTLINE))) / 2.0)
# Consistent station-scale dimensions; the mapped whole building is much
# larger than the apparatus-hall frontage, so the complete OSM outline drives
# the main roof, floor, and outer walls.
BUILDING_WIDTH = 28.2
BUILDING_DEPTH = 14.0  # clear practical truck bay depth; rear wings follow OSM
FRONT_EAVE = 6.15
ROOF_PITCH = .017
DOOR_WIDTH = 4.6
DOOR_HEIGHT = 4.2
SLAT_HEIGHT = DOOR_HEIGHT / 10.0
DOOR_CENTRES = (-0.7, 5.0, 10.7)
ENTRY_CENTRE = -9.1

# Clear the default scene so the script is repeatable.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for datablock in list(datablocks):
        if datablock.users == 0:
            datablocks.remove(datablock)


def material(name, color, roughness=0.72, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1.0)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Emission Color'].default_value = (*color, 1.0)
    shader.inputs['Emission Strength'].default_value = emission
    return mat

M = {
    'masonry': material('Station 3 | charcoal brick', (0.075, 0.085, 0.093), .9),
    'masonry_light': material('Station 3 | warm light brick', (0.22, 0.205, 0.18), .88),
    'mortar': material('Station 3 | recessed charcoal mortar', (0.035, 0.041, 0.047), .98),
    'concrete': material('Station 3 | warm grey concrete', (0.39, 0.40, 0.38), .86),
    'concrete_edge': material('Station 3 | precast edge', (0.55, 0.56, 0.52), .7),
    'red': material('Station 3 | enamel red cladding', (0.34, 0.009, 0.018), .32, .12),
    'red_dark': material('Station 3 | black panel reveals', (0.025, 0.028, 0.030), .5, .18),
    'roof': material('Station 3 | dark charcoal canopy and roof', (0.018, 0.022, 0.027), .48, .12),
    'metal': material('Station 3 | dark grey door metal', (0.12, 0.15, 0.17), .34, .52),
    'aluminum': material('Station 3 | brushed door aluminum', (0.43, 0.49, 0.51), .3, .62),
    'glass': material('Station 3 | blue grey glazing', (0.045, 0.105, 0.13), .19, .36),
    'glass_light': material('Station 3 | cool glass reflections', (0.20, 0.34, 0.38), .24, .28),
    'floor': material('Station 3 | interior sealed concrete', (0.48, 0.49, 0.46), .82),
    'wall_inside': material('Station 3 | interior painted block', (0.68, 0.69, 0.65), .9),
    'white': material('Station 3 | sign lettering', (0.90, 0.91, 0.86), .4),
    'black': material('Station 3 | equipment charcoal', (0.055, 0.065, 0.066), .58, .12),
    'yellow': material('Station 3 | safety markings', (0.91, 0.59, 0.06), .48),
    'emitter': material('Station 3 | interior LED diffuser', (0.92, 0.82, 0.58), .32, 0.0, 2.0),
    'flag_white': material('Station 3 | flag white', (0.93, 0.93, 0.89), .8),
    'flag_blue': material('Station 3 | flag blue', (0.025, 0.11, 0.30), .72),
    'flag_green': material('Station 3 | flag green', (0.035, 0.25, 0.12), .76),
    'frame_white': material('Station 3 | white aluminum frames', (0.78, 0.81, 0.80), .34, .28),
    'door_solid': material('Station 3 | pale insulated door panels', (0.57, 0.59, 0.58), .42, .20),
    'planter': material('Station 3 | planter soil and curb', (0.19, 0.18, 0.15), .9),
    'flower_red': material('Station 3 | flower red', (0.64, 0.025, 0.035), .74),
    'flower_yellow': material('Station 3 | flower yellow', (0.86, 0.46, 0.035), .72),
    'leaf': material('Station 3 | planted foliage', (0.075, 0.19, 0.075), .9),
    'leaf_light': material('Station 3 | fresh shrub foliage', (0.12, 0.27, 0.09), .9),
    'leaf_dark': material('Station 3 | deep shrub foliage', (0.045, 0.13, 0.065), .9),
}

# A single georeferenced root makes all child transforms retain the site's
# measured facade axes after glTF's Z-up to Y-up conversion.
model = bpy.data.objects.new('Station3_Model', None)
bpy.context.scene.collection.objects.link(model)
model.empty_display_type = 'PLAIN_AXES'
model.rotation_euler.z = ROT_Z
model['anchor_latitude'] = ANCHOR['latitude']
model['anchor_longitude'] = ANCHOR['longitude']
model['coordinate_contract'] = 'Blender X east, Y north, Z up; GLB X east, Y up, Z south'
model['source_geometry'] = 'Original Blender geometry; no photo textures or third-party assets'
model['floor_plan_status'] = 'Interior walls and room use are approximate; no floor plan was available'
static_parts = []
animated_slats = []


def attach_local(obj, parent=model, location=(0, 0, 0), rotation=(0, 0, 0)):
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def box(name, loc, dims, mat, bevel=0.0, parent=model, rotation=(0, 0, 0), export_static=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Small manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    attach_local(obj, parent, loc, rotation)
    if export_static:
        static_parts.append(obj)
    return obj


def custom_mesh(name, vertices, faces, materials, parent=model, location=(0, 0, 0), rotation=(0, 0, 0), export_static=True):
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.clear()
    for mat in materials:
        mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    attach_local(obj, parent, location, rotation)
    if export_static:
        static_parts.append(obj)
    return obj


def box_verts(center, size):
    x, y, z = center
    dx, dy, dz = (v / 2.0 for v in size)
    v = [(x+sx*dx, y+sy*dy, z+sz*dz) for sx, sy, sz in
         [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    f = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    return v, f


def polygon_prism(name, outline, bottom_z, top_z_fn, mat):
    points = list(outline)
    signed_area = sum(points[i][0]*points[(i+1)%len(points)][1] - points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points))) / 2
    if signed_area < 0:
        points.reverse()
    count = len(points)
    vertices = [(x, y, top_z_fn(y)) for x, y in points] + [(x, y, bottom_z) for x, y in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, count*2)))]
    for i in range(count):
        j = (i+1) % count
        faces.append((i, j, j+count, i+count))
    return custom_mesh(name, vertices, faces, [mat])


def add_box_to_mesh(vertices, faces, face_materials, center, size, material_index):
    verts, fs = box_verts(center, size)
    offset = len(vertices)
    vertices.extend(verts)
    faces.extend([tuple(idx + offset for idx in face) for face in fs])
    face_materials.extend([material_index] * len(fs))


def text_obj(name, body, loc, size, mat, parent=model):
    bpy.ops.object.text_add(location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.extrude = .006
    obj.data.bevel_depth = .001
    # Text local X is facade width, local Y is vertical, and its normal faces outward (-depth).
    basis = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed()
    text_rotation = basis.to_euler()
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    # Preserve the facade-facing rotation when the converted mesh is parented.
    attach_local(obj, parent, loc, text_rotation)
    static_parts.append(obj)
    return obj


def make_slats(door_index, center_x):
    door = bpy.data.objects.new(f'Station3_Door_{door_index:02d}', None)
    bpy.context.scene.collection.objects.link(door)
    door.empty_display_type = 'CUBE'
    door.empty_display_size = .16
    attach_local(door, model, (center_x, 0.0, 0.0))
    door['interaction'] = 'Overhead sectional door; animate its ten named child slats'
    door['opening_width_m'] = DOOR_WIDTH
    door['opening_height_m'] = DOOR_HEIGHT
    door['slat_height_m'] = SLAT_HEIGHT
    for i in range(10):
        vertices, faces, face_materials = [], [], []
        # Ten movable sections preserve the runtime animation contract. The
        # lower two form the solid insulated kick panel; upper sections read
        # as broad glazed rows with five vertical lite divisions.
        add_box_to_mesh(vertices, faces, face_materials, (0, 0, 0), (4.48, .085, SLAT_HEIGHT-.004), 0)
        glass_row = i >= 2
        row_material = 1 if glass_row else 3
        inset_width = 3.98 if glass_row else 4.12
        add_box_to_mesh(vertices, faces, face_materials, (0, -.045, 0), (inset_width, .018, SLAT_HEIGHT-.006), row_material)
        # Keep horizontal breaks understated; the photo reads as five broad
        # rows, not a tightly striped sectional shutter.
        if i in (3, 5, 7, 9):
            add_box_to_mesh(vertices, faces, face_materials, (0, -.060, -.193), (4.28, .018, .035), 2)
        for mullion_x in (-1.60, -.80, .80, 1.60):
            if glass_row:
                add_box_to_mesh(vertices, faces, face_materials, (mullion_x, -.058, 0), (.028, .016, .225), 2)
        mesh = bpy.data.meshes.new(f'Station 3 door {door_index:02d} slat {i:02d} mesh')
        mesh.from_pydata(vertices, [], faces)
        for mat in (M['metal'], M['glass'], M['aluminum'], M['door_solid']):
            mesh.materials.append(mat)
        mesh.update()
        for poly, idx in zip(mesh.polygons, face_materials):
            poly.material_index = idx
        slat = bpy.data.objects.new(f'Station3_Door_{door_index:02d}_Slat_{i:02d}', mesh)
        bpy.context.scene.collection.objects.link(slat)
        attach_local(slat, door, (0, 0, (i + .5) * SLAT_HEIGHT))
        slat['closed_local_blender'] = [0.0, 0.0, round((i + .5) * SLAT_HEIGHT, 4)]
        slat['open_local_three'] = [0.0, DOOR_HEIGHT, round(-(i + .5) * SLAT_HEIGHT, 4)]
        slat['open_rotation_x_radians'] = -math.pi / 2.0
        animated_slats.append(slat)
    return door


# Mapped whole-building floor and low-pitched roof follow OSM way 558402285.
# The small SE apron stays outside the mapped envelope and is scenery only.
polygon_prism('Station3_MappedFootprintFloor', OSM_OUTLINE, -.18, lambda y: .0, M['floor'])
# Light ceiling plane over the clear bay hall improves visibility while leaving the larger mapped roof mass intact.
box('Station3_ApproxInteriorCeilingFinish', (0, 7.0, 5.79), (BUILDING_WIDTH-.32, 14.0, .08), M['wall_inside'], .025)
box('Station3_ConcreteApron', (0, -2.15, -.10), (BUILDING_WIDTH+1.0, 4.3, .20), M['concrete'], .055)
box('Station3_EntryLanding', (ENTRY_CENTRE, -1.05, -.055), (5.25, 2.1, .11), M['concrete_edge'], .045)

# Exterior perimeter walls reproduce the mapped irregular mass. Leave the
# measured SE frontage open for the authored apparatus doors and red entry.
FRONTAGE_EDGE = None
for i, p1 in enumerate(OSM_OUTLINE):
    p2 = OSM_OUTLINE[(i+1) % len(OSM_OUTLINE)]
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    length = math.hypot(dx, dy)
    if abs(p1[1]) < .18 and abs(p2[1]) < .18 and length > 20:
        FRONTAGE_EDGE = (p1, p2)
        continue
    if length < .25:
        continue
    mid_x, mid_y = (p1[0]+p2[0])/2, (p1[1]+p2[1])/2
    top = FRONT_EAVE + .18 + ROOF_PITCH * mid_y
    wall_height = top - .08
    heading = math.atan2(dy, dx)
    box(f'Station3_MappedExteriorWall_{i+1:02d}', (mid_x, mid_y, wall_height/2), (length+.08, .34, wall_height), M['masonry'], .025, rotation=(0, 0, heading))
    trim_pitch = math.atan(ROOF_PITCH * dy / max(length, .1))
    box(f'Station3_MappedRoofEdgeTrim_{i+1:02d}', (mid_x, mid_y, top+.09), (length+.22, .20, .18), M['roof'], .025, rotation=(trim_pitch, 0, heading))
if FRONTAGE_EDGE is None:
    raise RuntimeError('Mapped Station 3 outline does not contain its measured southeast frontage')
polygon_prism('Station3_MappedLowPitchRoof', OSM_OUTLINE, FRONT_EAVE-.05, lambda y: FRONT_EAVE + ROOF_PITCH*max(y, 0), M['roof'])
box('Station3_FrontParapet_EntryWing', (-9.10, -.12, 5.43), (10.00, .36, .20), M['roof'], .035)
box('Station3_FrontParapet_BayWing', (5.00, -.12, 6.02), (18.20, .36, .28), M['roof'], .045)
box('Station3_FrontFascia_EntryWing', (-9.10, -.18, 5.28), (9.90, .20, .18), M['masonry_light'], .02)
box('Station3_FrontFascia_BayWing', (5.00, -.18, 5.77), (18.20, .20, .22), M['concrete_edge'], .025)

# Front wall is built as separate piers and lintels, leaving the three apparatus bays open.
entry_left, entry_right = ENTRY_CENTRE-1.12, ENTRY_CENTRE+1.12
bay_edges = [(c-DOOR_WIDTH/2, c+DOOR_WIDTH/2) for c in DOOR_CENTRES]
front_piers = [(-BUILDING_WIDTH/2, entry_left), (entry_right, bay_edges[0][0]),
               (bay_edges[0][1], bay_edges[1][0]), (bay_edges[1][1], bay_edges[2][0]),
               (bay_edges[2][1], BUILDING_WIDTH/2)]
for idx, (left, right) in enumerate(front_piers):
    if right-left > .12:
        box(f'Station3_FrontMasonryPier_{idx+1:02d}', ((left+right)/2, .10, 2.08), (right-left, .32, 4.16), M['masonry'], .035)
        box(f'Station3_PierBase_{idx+1:02d}', ((left+right)/2, -.10, .16), (right-left, .22, .32), M['concrete_edge'], .018)
# Continuous upper masonry band starts above the rolling-door header.
box('Station3_FrontUpperMasonry_EntryWing', (-9.10, .10, 4.80), (10.00, .32, 1.28), M['masonry'], .025)
box('Station3_FrontUpperMasonry_BayWing', (5.00, .10, 5.06), (18.20, .32, 1.84), M['masonry'], .025)
box('Station3_BayLintelBand', (5.00, -.12, 4.34), (18.2, .26, .24), M['concrete_edge'], .025)
for i, center_x in enumerate(DOOR_CENTRES):
    box(f'Station3_DoorJamb_{i+1:02d}_Left', (center_x-2.34, -.12, 2.10), (.22, .26, 4.20), M['concrete_edge'], .025)
    box(f'Station3_DoorJamb_{i+1:02d}_Right', (center_x+2.34, -.12, 2.10), (.22, .26, 4.20), M['concrete_edge'], .025)
    box(f'Station3_DoorHeader_{i+1:02d}', (center_x, -.12, 4.28), (4.48, .26, .16), M['metal'], .018)
    make_slats(i+1, center_x)

# A continuous, deep charcoal canopy is the defining horizontal silhouette of
# the apparatus wing; the pale soffit and fascia make its projection legible.
box('Station3_BayCanopyDeck', (5.00, -.82, 5.73), (18.2, 1.72, .24), M['roof'], .045)
box('Station3_BayCanopyFascia', (5.00, -1.64, 5.51), (18.2, .14, .34), M['roof'], .025)
box('Station3_BayCanopySoffit', (5.00, -.82, 5.56), (17.9, 1.56, .04), M['concrete_edge'], .008)

# Planting beds sit beside the red entry and along the driveway edge. Low curb
# geometry keeps them readable from street height without obscuring the door.
for bed_index, (cx, cy, width) in enumerate(((-13.0, -2.22, 3.65), (-6.05, -2.12, 2.55)), 1):
    box(f'Station3_Planter_{bed_index:02d}_Soil', (cx, cy, .12), (width-.16, .62, .18), M['planter'], .03)
    for side in (-1, 1):
        box(f'Station3_Planter_{bed_index:02d}_CurbSide_{side:+d}', (cx+side*(width/2-.04), cy, .16), (.10, .76, .24), M['concrete_edge'], .02)
    for end in (-1, 1):
        box(f'Station3_Planter_{bed_index:02d}_CurbEnd_{end:+d}', (cx, cy+end*.34, .16), (width, .08, .24), M['concrete_edge'], .02)
    shrub_sizes = ((.48,.40,.34), (.68,.48,.43), (.54,.44,.31), (.72,.52,.38),
                   (.45,.39,.29), (.61,.47,.40), (.52,.44,.32), (.70,.51,.42), (.46,.40,.30))
    foliage = (M['leaf'], M['leaf_light'], M['leaf_dark'])
    for plant_index, (sx, sy, sz) in enumerate(shrub_sizes):
        px = cx-width*.40 + plant_index*width*.10
        py = cy + (.06 if plant_index % 2 else -.03)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.5, location=(0, 0, 0))
        shrub = bpy.context.object
        shrub.name = f'Station3_Planter_{bed_index:02d}_Shrub_{plant_index:02d}'
        shrub.dimensions = (sx, sy, sz)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        attach_local(shrub, model, (px, py, .23 + sz/2))
        shrub.data.materials.append(foliage[(plant_index + bed_index) % len(foliage)])
        static_parts.append(shrub)
        if plant_index in (1, 4, 7):
            flower_mat = M['flower_red'] if plant_index == 1 else M['flower_yellow']
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=.5, location=(0, 0, 0))
            bloom = bpy.context.object
            bloom.name = f'Station3_Planter_{bed_index:02d}_Bloom_{plant_index:02d}'
            bloom.dimensions = (.17, .17, .11)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            attach_local(bloom, model, (px, py-.02, .23 + sz*.75))
            bloom.data.materials.append(flower_mat)
            static_parts.append(bloom)



# Brick-course reveals on exposed piers and header add scale without image textures.
for index, (left, right) in enumerate(front_piers):
    width = right-left
    if width < .6:
        continue
    for row in range(1, 7):
        z = row*.59
        if z >= 4.0:
            continue
        for offset in (-.12, .16):
            x = (left+right)/2 + offset*width
            box(f'Station3_MortarReveal_{index+1:02d}_{row:02d}_{offset:+.2f}',
                (x, -.067, z), (max(.18, width*.47), .012, .016), M['mortar'], 0.0)
# Horizontal running bond joints across upper masonry, visually subtle.
for row in range(1, 3):
    z = 4.25 + row*.48
    box(f'Station3_UpperMasonryCourse_{row:02d}', (0, -.068, z), (BUILDING_WIDTH-.2, .014, .014), M['mortar'], 0.0)
# Fine staggered vertical joints establish real brick scale across the long
# upper charcoal elevation while retaining a simple reusable material set.
for row in range(7):
    z = 4.22 + row*.245
    offset = .24 if row % 2 else 0.0
    for col in range(58):
        x = -13.82 + col*.48 + offset
        if x < 13.8 and not (x < -5.5 and z+.095 > 5.42):
            box(f'Station3_UpperBrickJoint_{row:02d}_{col:02d}', (x, -.074, z), (.012, .012, .19), M['mortar'], 0.0)

# Public entrance: a broad red cladding mass fills the mapped left facade,
# with two windows, a single glazed doorway, raised crest sign, and canopy.
# The street-facing entrance is a broad enamel-red volume with deliberately
# fine black seams between sheet-metal panels.
# Balanced red entrance section: identical windows flank a centered doorway.
ENTRY_SECTION_LEFT, ENTRY_SECTION_RIGHT = -14.1, -4.1
ENTRY_WINDOW_OFFSET = 3.10
ENTRY_WINDOW_WIDTH, ENTRY_WINDOW_HEIGHT = 1.34, 1.30
ENTRY_WINDOW_Z = 2.72
for side in (-1, 1):
    wx = ENTRY_CENTRE + side * ENTRY_WINDOW_OFFSET
    section_left, section_right = (ENTRY_SECTION_LEFT, entry_left) if side < 0 else (entry_right, ENTRY_SECTION_RIGHT)
    label = 'Left' if side < 0 else 'Right'
    box(f'Station3_Entry{label}RedBelowWindow', ((section_left+section_right)/2, -.105, 1.14), (section_right-section_left, .20, 2.08), M['red'], .025)
    box(f'Station3_Entry{label}RedAboveWindow', ((section_left+section_right)/2, -.105, 3.80), (section_right-section_left, .20, .76), M['red'], .025)
    for segment, left, right in (('Outer', section_left, wx-ENTRY_WINDOW_WIDTH/2), ('Inner', wx+ENTRY_WINDOW_WIDTH/2, section_right)):
        if right > left:
            box(f'Station3_Entry{label}Red{segment}', ((left+right)/2, -.105, ENTRY_WINDOW_Z), (right-left, .20, ENTRY_WINDOW_HEIGHT), M['red'], .012)
    box(f'Station3_Entry{label}WindowGlass', (wx, -.235, ENTRY_WINDOW_Z), (ENTRY_WINDOW_WIDTH, .035, ENTRY_WINDOW_HEIGHT), M['glass'], .012)
    for offset in (-.705, 0, .705):
        box(f'Station3_Entry{label}WindowVertical_{offset:+.3f}', (wx+offset, -.268, ENTRY_WINDOW_Z), (.075, .055, 1.46), M['frame_white'], .01)
    for z in (1.99, 3.45):
        box(f'Station3_Entry{label}WindowHorizontal_{z:.2f}', (wx, -.268, z), (1.48, .055, .075), M['frame_white'], .01)
box('Station3_EntryRedField_Header', (ENTRY_CENTRE, -.105, 3.77), (10.00, .20, .78), M['red'], .025)
box('Station3_EntrySignBand', (ENTRY_CENTRE, -.112, 4.47), (10.00, .20, .62), M['red'], .025)
# Measured repeated panel reveals create even rhythms without obscuring glazing.
for x in (ENTRY_SECTION_LEFT+.08, ENTRY_CENTRE-1.27, ENTRY_CENTRE+1.27, ENTRY_SECTION_RIGHT-.08):
    box(f'Station3_EntryCladdingSeam_{x:+.2f}', (x, -.218, 2.50), (.018, .018, 3.75), M['red_dark'], .002)
for cx in (ENTRY_CENTRE-3.10, ENTRY_CENTRE+3.10):
    for z in (.65, 1.52, 3.62, 4.49):
        box(f'Station3_EntryPanelReveal_{cx:+.2f}_{z:.2f}', (cx, -.218, z), (3.5, .018, .018), M['red_dark'], .002)
# Single glass entrance with strong white stiles and a transom; reflectivity is
# represented by a cool second pane without embedding a photograph.
box('Station3_EntryGlassLeft', (ENTRY_CENTRE-.57, -.215, 1.48), (.96, .035, 2.74), M['glass'], .012)
box('Station3_EntryGlassRight', (ENTRY_CENTRE+.57, -.215, 1.48), (.96, .035, 2.74), M['glass_light'], .012)
for x in (ENTRY_CENTRE-1.12, ENTRY_CENTRE, ENTRY_CENTRE+1.12):
    box(f'Station3_EntryMullion_{x:+.1f}', (x, -.258, 1.48), (.075, .065, 2.82), M['frame_white'], .008)
for z in (.12, 2.86):
    box(f'Station3_EntryFrameHorizontal_{z:.2f}', (ENTRY_CENTRE, -.258, z), (2.24, .065, .075), M['frame_white'], .008)
box('Station3_EntryCanopyTop', (ENTRY_CENTRE, -1.02, 3.34), (5.55, 1.82, .12), M['glass_light'], .025)
box('Station3_EntryCanopyFascia', (ENTRY_CENTRE, -1.91, 3.30), (5.55, .08, .24), M['aluminum'], .015)
box('Station3_EntryCanopyUnderside', (ENTRY_CENTRE, -.98, 3.25), (5.25, 1.68, .035), M['white'], .008)
for x in (ENTRY_CENTRE-1.85, ENTRY_CENTRE+1.85):
    box(f'Station3_EntryCanopySupport_{x:+.2f}', (x, -1.76, 1.65), (.075, .075, 3.10), M['frame_white'], .012)
# A tall silver sign frame rises above the transparent entrance canopy. The
# broad white-backed crest panel and simplified flame shield form the entry
# landmark without copying the City's protected logo artwork.
for x in (ENTRY_CENTRE-1.35, ENTRY_CENTRE+1.35):
    box(f'Station3_EntrySignPost_{x:+.2f}', (x, -.285, 4.78), (.095, .095, 3.12), M['frame_white'], .018)
box('Station3_GenericCrestPanel', (ENTRY_CENTRE, -.31, 4.90), (2.55, .14, 1.48), M['frame_white'], .035)
box('Station3_CrestPanelInset', (ENTRY_CENTRE, -.395, 4.90), (2.18, .045, 1.12), M['red'], .018)
box('Station3_CrestPanelTopRule', (ENTRY_CENTRE, -.425, 5.43), (1.86, .025, .035), M['white'], .006)
box('Station3_CrestPanelBottomRule', (ENTRY_CENTRE, -.425, 4.37), (1.86, .025, .035), M['white'], .006)
box('Station3_GenericCrestShield', (ENTRY_CENTRE, -.438, 4.90), (.72, .045, .82), M['white'], .02)
flame_shape = [(-.02,-.18),(-.12,-.09),(-.14,.015),(-.075,.09),(-.045,.21),(.015,.13),(.07,.20),(.105,.065),(.145,-.035),(.11,-.12),(.035,-.18)]
flame_vertices = [(ENTRY_CENTRE+x, -.465, 4.90+z*1.7) for x,z in flame_shape]
custom_mesh('Station3_GenericCrestFlame', flame_vertices, [tuple(range(len(flame_vertices)))], [M['red']])
text_obj('Station3_EntryTitle', 'FIRE STATION NO. 3', (-5.85, -.225, 4.26), .24, M['white'])
text_obj('Station3_EntrySubtitle', '839 CLONSILLA AVE.', (-5.85, -.225, 3.92), .18, M['white'])

# Three modest flagpoles rise over the apparatus wing, as in the city photo.
# Flags use original simple colour blocks rather than copied insignia.
for i, fx in enumerate(DOOR_CENTRES, 1):
    box(f'Station3_FlagPole_{i:02d}', (fx, -.18, 6.72), (.055, .055, 1.32), M['aluminum'], .018, rotation=(0, .12, 0))
    if i == 1:
        # Canada's 1:2 flag: equal red quarter-width bars, white half, and
        # an original eleven-point maple leaf silhouette on both faces.
        box('Station3_Flag_CanadaWhite', (fx+.52, -.22, 6.94), (1.10, .035, .55), M['flag_white'], .004)
        box('Station3_Flag_CanadaRedLeft', (fx+.1075, -.245, 6.94), (.275, .045, .55), M['red'], .002)
        box('Station3_Flag_CanadaRedRight', (fx+.9325, -.245, 6.94), (.275, .045, .55), M['red'], .002)
        leaf = [(0,.185),(-.033,.118),(-.06,.132),(-.053,.075),(-.115,.104),(-.095,.048),(-.145,.032),(-.080,-.022),(-.094,-.052),(-.025,-.044),(-.018,-.115),(.018,-.115),(.025,-.044),(.094,-.052),(.080,-.022),(.145,.032),(.095,.048),(.115,.104),(.053,.075),(.06,.132),(.033,.118)]
        front = [(fx+.52+x, -.272, 6.94+z) for x,z in leaf]
        back = [(fx+.52+x, -.198, 6.94+z) for x,z in leaf]
        custom_mesh('Station3_Flag_CanadaMapleLeaf', front+back, [tuple(range(len(leaf))), tuple(reversed(range(len(leaf),2*len(leaf))))], [M['red']])
    elif i == 2:
        # Ontario: red field, blue upper canton, and a simplified white shield.
        box('Station3_Flag_OntarioField', (fx+.52, -.22, 6.94), (1.0, .035, .55), M['red'], .006)
        box('Station3_Flag_OntarioCanton', (fx+.28, -.248, 7.055), (.48, .025, .29), M['flag_blue'], .004)
        box('Station3_Flag_OntarioShield', (fx+.70, -.248, 6.89), (.29, .025, .30), M['flag_white'], .012)
        box('Station3_Flag_OntarioShieldBand', (fx+.70, -.267, 6.88), (.22, .015, .05), M['red'], .003)
    else:
        # City flag: green field and a white central device, kept intentionally
        # simple because the source photographs do not resolve its emblem.
        box('Station3_Flag_CityGreen', (fx+.52, -.22, 6.94), (1.0, .035, .55), M['flag_green'], .006)
        box('Station3_Flag_CityWhiteBand', (fx+.52, -.248, 6.94), (.82, .025, .16), M['flag_white'], .004)
        box('Station3_Flag_CityDevice', (fx+.52, -.268, 6.94), (.16, .015, .16), M['flag_green'], .008)

# Approximate interior only: apparatus hall is open behind the three doors;
# the west/left service rooms are separated by one partition wall.
box('Station3_ApproxPartition_West', (-6.15, 7.0, 2.34), (.18, 13.5, 4.68), M['wall_inside'], .02)
box('Station3_ApproxPartition_Service', (-9.95, 3.1, 2.25), (7.5, .16, 4.5), M['wall_inside'], .02)
# A marked, inferred divider gives the three-bay apparatus hall a useful 14 m
# working depth while leaving a full-width pass-through aligned with bay 02.
box('Station3_ApproxPartition_HallRear_Left', (-5.65, 14.0, 2.55), (16.9, .18, 5.1), M['wall_inside'], .02)
box('Station3_ApproxPartition_HallRear_Right', (10.65, 14.0, 2.55), (6.7, .18, 5.1), M['wall_inside'], .02)
box('Station3_ApproxPartition_HallRear_Header', (5.0, 14.0, 5.12), (4.6, .18, .38), M['wall_inside'], .02)
# Interior swing-door-like openings are represented by simple red frames in this approximation.
for idx, (x, y) in enumerate(((-6.14, 5.8), (-10.2, 3.08)), 1):
    box(f'Station3_InteriorDoorFrame_{idx:02d}', (x, y, 1.45), (1.04, .14, 2.8), M['red_dark'], .018)
# Side windows, visible when approaching around either end of the station.
for side in (-1, 1):
    for i, y in enumerate((3.5, 6.9, 10.3), 1):
        box(f'Station3_SideWindowGlass_{side:+d}_{i:02d}', (side*(BUILDING_WIDTH/2-.052), y, 3.35), (.035, 1.75, 1.15), M['glass'], .018)
        box(f'Station3_SideWindowFrame_{side:+d}_{i:02d}', (side*(BUILDING_WIDTH/2-.075), y, 3.35), (.075, 1.86, 1.26), M['concrete_edge'], .025)
        box(f'Station3_SideWindowGlassInset_{side:+d}_{i:02d}', (side*(BUILDING_WIDTH/2-.116), y, 3.35), (.018, 1.64, 1.03), M['glass'], .01)
# Service-room lockers, benches, and station equipment stay left of the bay clear zone.
for i in range(4):
    x = -12.85 + i*.82
    box(f'Station3_ServiceLocker_{i+1:02d}', (x, 5.45, 1.03), (.66, .72, 2.06), M['black'], .025)
    box(f'Station3_ServiceLockerDoor_{i+1:02d}', (x, 5.065, 1.03), (.55, .035, 1.88), M['masonry_light'], .018)
    box(f'Station3_LockerHandle_{i+1:02d}', (x+.19, 5.025, .98), (.035, .035, .16), M['aluminum'], .008)
box('Station3_ServiceWorkbench', (-10.0, 8.7, .92), (5.25, .84, .12), M['concrete_edge'], .025)
for x in (-12.2, -10.0, -7.8):
    box(f'Station3_WorkbenchLeg_{x:+.1f}', (x, 8.7, .44), (.09, .72, .92), M['metal'], .015)
# Rear workbench and hose/equipment rails are out of the truck's 10.4 m envelope.
for x in (-30.0, -23.0, -16.0):
    box(f'Station3_RearEquipmentCabinet_{x:+.1f}', (x, 30.5, 1.45), (3.7, .42, 2.55), M['black'], .035)
    for row in range(4):
        box(f'Station3_CabinetDoor_{x:+.1f}_{row:02d}', (x, 30.26, .82+row*.4), (3.45, .05, .32), M['masonry_light'], .014)
# Safety stripes on the floor define three inferred apparatus lanes; they are markings only.
for i, center_x in enumerate(DOOR_CENTRES, 1):
    for side in (-1, 1):
        box(f'Station3_BayLaneLine_{i:02d}_{side:+d}', (center_x+side*2.12, 5.6, .012), (.045, 10.8, .024), M['yellow'], .01)
# Emissive overhead fixture strips provide readable interior illumination in unlit viewers.
for y in (3.0, 7.1, 11.0):
    for x in DOOR_CENTRES:
        box(f'Station3_InteriorLightHousing_{x:+.1f}_{y:.1f}', (x, y, 5.65), (2.05, .20, .10), M['black'], .025)
        box(f'Station3_InteriorLightDiffuser_{x:+.1f}_{y:.1f}', (x, y, 5.585), (1.86, .12, .028), M['emitter'], .012)

# Stable spawn marker for the actual runtime vehicle. It is a locator, not a truck mesh.
spawn = bpy.data.objects.new('Station3_TruckSpawn_Bay01', None)
bpy.context.scene.collection.objects.link(spawn)
spawn.empty_display_type = 'ARROWS'
spawn.empty_display_size = .6
# In station-local axes, +Z is outward; a vehicle whose local forward is -Z needs 180 degrees.
attach_local(spawn, model, SPAWN_LOCAL, (0, 0, math.pi))
spawn['vehicle_forward'] = 'local -Z'
spawn['gameplay_heading_degrees'] = round(SPAWN_GAME_HEADING_DEG, 2)
spawn['glb_position_relative_anchor_m'] = [round(SPAWN_EAST, 4), 0.0, round(-SPAWN_NORTH, 4)]
spawn['position_axes'] = 'GLB X east, Y up, Z south; negative Z is north/inward'
spawn['truck_length_m'] = 10.4
spawn['truck_width_m'] = 2.55
spawn['bay_opening_width_m'] = DOOR_WIDTH
spawn['clearances_m'] = {'side_each_with_body': round((DOOR_WIDTH-2.55)/2, 2), 'nose_to_facade_when_centered': .4, 'rear_to_back_wall_when_centered': 3.2}

# Scene-level export contract is stored with the editable model.
bpy.context.scene['station3_anchor'] = json.dumps(ANCHOR)
bpy.context.scene['station3_osm_frontage'] = 'way 558402285; edge endpoints (44.2850041,-78.3505219) to (44.2847972,-78.3507267); local metric length ~28.2 m'
bpy.context.scene['station3_door_animation'] = 'Each Door_## owns Slat_00..09. Closed Three local=(0,0.21+0.42*i,0), rotationX=0. Open Three local=(0,4.20,-(i+0.5)*0.42), rotationX=-pi/2.'
bpy.context.scene['station3_interiors'] = 'Walls and room assignments approximate; no authoritative floor plan was available.'

# Save a full-featured, editable .blend with individually labeled static parts,
# named door roots and independently movable slat mesh objects.
source_blend = SOURCE_DIR / 'station-3.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))

# Preview rig exists only in the .blend/renders, not in the GLB export.
def local_world(u, v, z):
    c, s = math.cos(ROT_Z), math.sin(ROT_Z)
    return (u*c-v*s, u*s+v*c, z)

def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()

def area_light(name, loc, power, size, target):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    aim(obj, target)
    return obj

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1800
scene.render.resolution_y = 1050
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.render.filepath = str(RENDER_DIR / 'station-3-exterior-facade.png')
scene.view_settings.view_transform = 'AgX'
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.20, .23, .25, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
area_light('Preview key', local_world(8, -16, 17), 4200, 12, local_world(0, 5, 3))
area_light('Preview facade fill', local_world(-12, -12, 9), 2600, 10, local_world(0, 1, 3))
area_light('Preview roof rim', local_world(7, 12, 15), 2800, 9, local_world(0, 7, 3))
for light_x in DOOR_CENTRES:
    area_light(f'PreviewOnly_InteriorFill_{light_x:+.1f}', local_world(light_x, 6.8, 5.25), 1100, 5.0, local_world(light_x, 6.8, 1.0))
# Ground is a preview-only plane; it never enters the station asset.
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -.23))
preview_ground = bpy.context.object
preview_ground.name = 'PreviewOnly_Ground'
preview_ground.data.materials.append(M['floor'])
bpy.ops.object.camera_add(location=local_world(10, -32, 7.5))
cam = bpy.context.object
cam.name = 'PreviewOnly_Camera'
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 34
scene.camera = cam
aim(cam, local_world(0, 1.5, 2.65))
# Save .blend again with a practical exterior camera and soft studio lights.
bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))
# Keep the first render at the initial, realistic closed-door state.
bpy.ops.render.render(write_still=True)
# A second, nearly level street view makes door, window, sign, and canopy
# proportions easy to compare against the City facade photographs.
scene.render.filepath = str(RENDER_DIR / 'station-3-street-level.png')
cam.data.ortho_scale = 31
cam.location = local_world(8, -27, 2.25)
aim(cam, local_world(0, .1, 2.25))
bpy.ops.render.render(write_still=True)
# The wide overview records the complete mapped footprint and roof geometry.
scene.render.filepath = str(RENDER_DIR / 'station-3-exterior-wide.png')
cam.data.ortho_scale = 74
cam.location = local_world(27, -36, 50)
aim(cam, local_world(-14, 17, 0.0))
bpy.ops.render.render(write_still=True)
cam.data.ortho_scale = 34
cam.location = local_world(10, -32, 7.5)
aim(cam, local_world(0, 1.5, 2.65))

# Render an open-bay interior preview, then restore closed poses before export.
for slat in animated_slats:
    i = int(slat.name.rsplit('_', 1)[1])
    slat.location = (0, (i+.5)*SLAT_HEIGHT, DOOR_HEIGHT)
    slat.rotation_euler.x = -math.pi/2
scene.render.filepath = str(RENDER_DIR / 'station-3-interior-open.png')
bpy.ops.object.camera_add(location=local_world(3.3, -2.4, 2.6))
interior_cam = bpy.context.object
interior_cam.name = 'PreviewOnly_InteriorCamera'
interior_cam.data.lens = 38
scene.camera = interior_cam
aim(interior_cam, local_world(3.3, 10.4, 3.1))
bpy.ops.render.render(write_still=True)
for slat in animated_slats:
    i = int(slat.name.rsplit('_', 1)[1])
    slat.location = (0, 0, (i+.5)*SLAT_HEIGHT)
    slat.rotation_euler = (0, 0, 0)
# Source file should open with all doors closed for a clear exterior authoring state.
scene.camera = cam
bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))

# Consolidate static scenery by material for compact runtime draw calls. The
# source .blend above remains individually editable; dynamic door slats retain
# their exact object/node names in the exported GLB.
static_by_material = {}
for obj in list(static_parts):
    if obj.name not in bpy.data.objects:
        continue
    key = obj.data.materials[0].name if obj.data.materials else 'Unassigned'
    static_by_material.setdefault(key, []).append(obj)
for key, objects in static_by_material.items():
    if len(objects) < 2:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = 'Station3_Static_' + key.replace('Station 3 | ', '').replace(' ', '_').replace('|', '')

# Remove preview-only objects from export and select only the station hierarchy.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.name.startswith('PreviewOnly_'):
        obj.hide_render = True
    elif obj.name.startswith('Station3_'):
        obj.select_set(True)
bpy.context.view_layer.objects.active = model
out_glb = GLB_DIR / 'station-3.glb'
bpy.ops.export_scene.gltf(filepath=str(out_glb), export_format='GLB', use_selection=True,
                          export_yup=True, export_extras=True, export_apply=True)

# Emit a small, source-bound provenance and transform contract.
contract = {
    'asset': 'Peterborough Fire Station 3',
    'glb': 'city-explorer/assets/stations/station-3.glb',
    'sourceBlend': 'assets-source/stations/station-3.blend',
    'buildScript': 'tools/blender/build_station_three.py',
    'anchor': ANCHOR,
    'anchorSource': 'OSM way 558402285 SE-facing frontage midpoint, supplied coordinates',
    'axes': {'blender': 'X east, Y north, Z up', 'gltf': 'X east, Y up, Z south'},
    'edgeLengthMetres': round(EDGE_LENGTH, 3),
    'facadeTangentBearingDegreesNE': round(math.degrees(math.atan2(WIDTH_E, WIDTH_N)), 2),
    'outwardBearingDegreesSE': round(OUTWARD_BEARING, 2),
    'blenderRootRotationAboutZDegrees': round(math.degrees(ROT_Z), 2),
    'footprintMetresApprox': {'mappedAreaSquareMetres': round(OSM_AREA, 1), 'mappedBoundsLocalMetres': {'minX': round(min(p[0] for p in OSM_OUTLINE),2), 'maxX': round(max(p[0] for p in OSM_OUTLINE),2), 'minY': round(min(p[1] for p in OSM_OUTLINE),2), 'maxY': round(max(p[1] for p in OSM_OUTLINE),2)}, 'apparatusHallClearDepth': BUILDING_DEPTH},
    'bayOpenings': {'count': 3, 'widthMetres': DOOR_WIDTH, 'heightMetres': DOOR_HEIGHT, 'centresAlongFacadeMetres': list(DOOR_CENTRES)},
    'truckSpawn': {
        'node': 'Station3_TruckSpawn_Bay01', 'door': 'Station3_Door_01',
        'glbPositionMetresRelativeAnchor': {'eastX': round(SPAWN_EAST, 3), 'upY': 0.0, 'southZ': round(-SPAWN_NORTH, 3)},
        'headingDegrees': round(SPAWN_GAME_HEADING_DEG, 2), 'headingRadians': round(math.radians(SPAWN_GAME_HEADING_DEG), 4),
        'forward': 'vehicle local -Z', 'truckLengthMetres': 10.4, 'truckWidthMetres': 2.55,
        'noseToThresholdMetres': .4, 'rearToBackWallMetres': 3.2,
    },
    'exteriorView': {'cameraPositionRelativeAnchorGLBMetres': {'eastX': round(DOOR_CENTRES[0]*WIDTH_E + 8*WIDTH_N, 3), 'upY': 2.0, 'southZ': round(-DOOR_CENTRES[0]*WIDTH_N + 8*WIDTH_E, 3)}, 'targetDoor': 'Station3_Door_01', 'standOffMetres': 8.0},
    'doorNodes': {
        'parents': [f'Station3_Door_{i:02d}' for i in range(1,4)],
        'slatsPerDoor': 10,
        'slatPattern': 'Station3_Door_##_Slat_00 through _09, bottom to top',
        'closedChildLocalThree': 'position=(0,0.21+0.42*i,0), rotation.x=0 radians',
        'openChildLocalThree': 'position=(0,4.20,-(i+0.5)*0.42), rotation.x=-pi/2 radians',
        'parentPivot': 'center of opening at door base; local +X follows frontage NE, local +Y is up, local +Z faces outward SE',
    },
    'provenance': {
        'reference': 'City of Peterborough Fire Services exterior reference photo supplied by user: https://www.peterborough.ca/media/55fdhfjh/peterborough-fire-services_2018_07_31_city_peterborough_2018_2.jpg',
        'secondaryReference': 'PtboCanada street photograph: https://images.squarespace-cdn.com/content/v1/50cca155e4b0c301a8212ad4/714fe747-bf30-4e88-81a8-a1c81b8804df/IMG_0347.JPG',
        'renovationEvidence': '2024 substantial-performance certificate confirms second-floor work but does not establish its facade location or layout; no second-storey exterior was inferred.',
        'photoUsage': 'Visual reference only; photo is not embedded, traced, or used as a texture.', 'mappedFootprint': 'OpenStreetMap way 558402285 from city-explorer/data/peterborough-osm.json; attribution and ODbL terms apply to derived footprint geometry.',
        'geometry': 'Original script-generated Blender geometry and procedural solid materials.',
        'interior': 'Approximate training/play space only. No floor plan was available; walls and room use are not claimed as surveyed.',
        'facadeTreatment': 'Red entrance cladding, two white-framed windows, single glazed entry, transparent canopy, tall silver crest-sign frame, compact right-side station/address lettering, stepped charcoal brick bay wing, three glazed doors with pale lower panels, broad elevated bay canopy, Canada/Ontario/city flag approximations, and varied planted beds follow visual references; dimensions remain approximate.',
    },
    'renders': ['docs/stations/renders/station-3-exterior-facade.png', 'docs/stations/renders/station-3-street-level.png', 'docs/stations/renders/station-3-exterior-wide.png', 'docs/stations/renders/station-3-interior-open.png'],
    'limitations': ['Exterior proportions and the inferred interior are approximate.', 'Apron is visual landmark scenery; GIS remains authoritative for roads, navigation, and collision.'],
}
(ROOT / 'docs/stations/station-3-asset-contract.json').write_text(json.dumps(contract, indent=2) + '\n', encoding='utf-8')
print('STATION 3 EXPORTED', out_glb, 'edge', round(EDGE_LENGTH, 2), 'm', 'bearing', round(OUTWARD_BEARING, 2), 'deg', 'spawn', round(SPAWN_EAST, 2), round(-SPAWN_NORTH, 2), 'slats', len(animated_slats))
