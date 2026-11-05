"""Rig the retained, self-contained v2 asset and author grounded locomotion.

Blender 5.2: blender -b --python tools/blender/build_firefighter_v3.py
Input: assets-source/characters/firefighter-v2.glb (immutable v2 source).
No external downloads or runtime shader dependencies. Blender Z-up/+Y forward.
"""
import bpy
import math
import json
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/characters'
OUT = ROOT / 'city-explorer/assets/characters'
SEED = SOURCE / 'firefighter-v2.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SEED))
scene = bpy.context.scene
scene.render.fps = 50

# Preserve world geometry and its source grouping before replacing rigid pivots.
meshes = [o for o in scene.objects if o.type == 'MESH']
parts = {}
for obj in meshes:
    parents = []
    p = obj.parent
    while p:
        parents.append(p.name)
        p = p.parent
    parts[obj.name] = next((n for n in parents if n in ['LeftArm', 'RightArm', 'LeftLeg', 'RightLeg']), 'Body')
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(world)
    obj.matrix_world = Matrix.Identity(4)
for obj in list(scene.objects):
    if obj.type != 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)

def smooth(a, b, x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3-2*t)

# Seat sleeve cuffs over the glove gauntlets. The v2 rigid assembly had a
# centimetre gap which opens conspicuously once the wrist starts articulating.
for obj in meshes:
    if parts[obj.name].endswith('Arm') and any('turnout' in m.name.lower() for m in obj.data.materials):
        for v in obj.data.vertices:
            v.co.z -= .028*(1-smooth(1.0, 1.06, v.co.z))

# More legible charcoal cloth, fine woven relief, varied matte material response.
# Modify embedded pixels so the material survives portable GLB export.
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    nodes = material.node_tree.nodes
    shader = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        continue
    if 'turnout' in material.name.lower():
        shader.inputs['Roughness'].default_value = .88
        shader.inputs['Metallic'].default_value = 0
        shader.inputs['Specular IOR Level'].default_value = .27
        for node in nodes:
            if node.type == 'TEX_IMAGE' and node.image and ('color' in node.image.name.lower()):
                import numpy as np
                im = node.image
                px = np.empty(len(im.pixels), dtype=np.float32)
                im.pixels.foreach_get(px)
                px = px.reshape((-1, 4))
                variation = px[:, :3].mean(axis=1)
                variation = variation / max(float(variation.mean()), .0001)
                # PNG color is sRGB: the v2 bitmap averaged only 7/255,
                # which erased all garment structure under daylight.
                px[:, :3] = np.clip(variation[:, None] * np.array([.22, .235, .26]), 0, 1)
                # A newly named image forces the exporter to encode the new
                # pixels instead of reusing the imported GLB's packed PNG.
                revised = bpy.data.images.new('turnout-fabric-v3-color', width=im.size[0], height=im.size[1])
                revised.pixels.foreach_set(px.ravel())
                revised.pack()
                node.image = revised
        for node in nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = .32
    elif 'Safety yellow' in material.name:
        shader.inputs['Base Color'].default_value = (.56, .52, .055, 1)
        shader.inputs['Roughness'].default_value = .68
    elif 'Silver reflective' in material.name:
        shader.inputs['Base Color'].default_value = (.39, .44, .43, 1)
        shader.inputs['Metallic'].default_value = .25
        shader.inputs['Roughness'].default_value = .43
    elif 'Black gloves' in material.name:
        shader.inputs['Base Color'].default_value = (.023, .027, .031, 1)
        shader.inputs['Roughness'].default_value = .74
    elif material.name == 'Anatomical skin':
        shader.inputs['Roughness'].default_value = .58
        shader.inputs['Specular IOR Level'].default_value = .3
    elif material.name == 'short04':
        shader.inputs['Roughness'].default_value = .86

# Eyes and short hair occupy few screen pixels; retain 1K facial skin while
# avoiding multi-megabyte eye/hair textures for a single browser character.
for material in bpy.data.materials:
    if material.name in ['high-poly', 'short04', 'eyebrow001'] and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and max(node.image.size) > 512:
                im = node.image
                im.scale(512, 512)
                im.pack()

arm_data = bpy.data.armatures.new('FirefighterSkeleton')
rig = bpy.data.objects.new('FirefighterRig', arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
definitions = {}
def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    # Consistent local X: all sagittal bends share the same lateral axis.
    b.align_roll(Vector((0, -1, 0)))
    if parent:
        b.parent = arm_data.edit_bones[parent]
    definitions[name] = (Vector(head), Vector(tail), parent)

bone('Hips', (0, 0, .94), (0, 0, 1.06))
bone('Spine', (0, 0, 1.06), (0, 0, 1.27), 'Hips')
bone('Chest', (0, 0, 1.27), (0, 0, 1.51), 'Spine')
bone('Neck', (0, 0, 1.51), (0, 0, 1.63), 'Chest')
bone('Head', (0, 0, 1.63), (0, 0, 1.85), 'Neck')
for side, prefix in [(-1, 'Left'), (1, 'Right')]:
    bone(prefix+'Arm', (side*.27, 0, 1.49), (side*.327, .006, 1.19), 'Chest')
    bone(prefix+'ForeArm', (side*.327, .006, 1.19), (side*.348, .04, .98), prefix+'Arm')
    bone(prefix+'Hand', (side*.348, .04, .98), (side*.352, .052, .86), prefix+'ForeArm')
    bone(prefix+'Leg', (side*.113, 0, .94), (side*.113, .012, .50), 'Hips')
    bone(prefix+'Shin', (side*.113, .012, .50), (side*.113, 0, .13), prefix+'Leg')
    bone(prefix+'Foot', (side*.113, 0, .13), (side*.113, .11, .075), prefix+'Shin')
    bone(prefix+'Toe', (side*.113, .11, .075), (side*.113, .20, .065), prefix+'Foot')
bpy.ops.object.mode_set(mode='OBJECT')

for obj in meshes:
    part = parts[obj.name]
    groups = {name: obj.vertex_groups.new(name=name) for name in definitions}
    for v in obj.data.vertices:
        x, forward, height = v.co
        if part.endswith('Leg'):
            prefix = part[:-3]
            thigh = smooth(.43, .56, height)
            foot = 1-smooth(.14, .22, height)
            toe = smooth(.075, .15, forward) * foot
            weights = {prefix+'Leg': thigh, prefix+'Shin': (1-thigh)*(1-foot), prefix+'Foot': foot-toe, prefix+'Toe': toe}
        elif part.endswith('Arm'):
            prefix = part[:-3]
            upper = smooth(1.13, 1.25, height)
            hand = 1-smooth(.96, 1.02, height)
            shoulder = smooth(1.40, 1.50, height)
            weights = {prefix+'Arm': upper*(1-shoulder), 'Chest': shoulder, prefix+'ForeArm': (1-upper)*(1-hand), prefix+'Hand': hand}
        elif obj.name in ['Anatomical head and neck', 'high-poly', 'eyebrow001', 'short04']:
            head = smooth(1.53, 1.63, height) if obj.name == 'Anatomical head and neck' else 1
            weights = {'Neck': 1-head, 'Head': head}
        else:
            spine = smooth(1.00, 1.17, height)
            chest = smooth(1.22, 1.38, height)
            weights = {'Hips': 1-spine, 'Spine': spine*(1-chest), 'Chest': chest}
        total = sum(weights.values())
        for name, weight in weights.items():
            if weight > .00001:
                groups[name].add([v.index], weight/total, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Weighted cloth and anatomy', 'ARMATURE')
    mod.object = rig
    mod.use_deform_preserve_volume = False  # glTF uses linear skinning too.

rest = {name: b.matrix_local.copy() for name, b in arm_data.bones.items()}
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
rig.animation_data_create()
AXIS_X = Vector((1, 0, 0))

def pose_matrix(name, matrix):
    rig.pose.bones[name].matrix = matrix
    bpy.context.view_layer.update()

def segment(name, start, end):
    original = definitions[name][1]-definitions[name][0]
    rot = original.rotation_difference(end-start)
    pose_matrix(name, Matrix.Translation(start) @ rot.to_matrix().to_4x4() @ rest[name].to_quaternion().to_matrix().to_4x4())

def local_pose(name, rx=0, ry=0, rz=0):
    pb = rig.pose.bones[name]
    # Express rotations in armature axes, retaining the parent's posed transform.
    parent = definitions[name][2]
    parent_delta = rig.pose.bones[parent].matrix @ rest[parent].inverted() if parent else Matrix.Identity(4)
    pivot = definitions[name][0]
    motion = Matrix.Translation(pivot) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    pose_matrix(name, parent_delta @ motion @ rest[name])

def foot_path(phase, running):
    stance = .32 if running else .60
    travel = .76 if running else .78
    if phase < stance:
        t = phase/stance
        forward = travel*(.5-t)
        height = 0
        # Heel contact, flat mid-stance, then toe-off.
        pitch = .16*(1-smooth(0, .23, t)) - (.34 if running else .24)*smooth(.68, 1, t)
    else:
        t = (phase-stance)/(1-stance)
        m = -travel*(1-stance)/stance
        forward = -travel/2 + travel*t*t*(3-2*t) + m*(2*t*t*t-3*t*t+t)
        height = (.29 if running else .125)*math.sin(math.pi*t)**1.4
        pitch = (-.34 if running else -.24)*(1-smooth(0, .3, t)) + .16*smooth(.63, 1, t)
    # Ankle follows heel/toe support so the sole does not pass through the floor.
    lift = max(.08*math.sin(pitch), -.21*math.sin(pitch), 0)
    return forward, .13+height+lift, pitch

def solve_leg(prefix, phase, running):
    hip_local = definitions[prefix+'Leg'][0]
    parent_delta = rig.pose.bones['Hips'].matrix @ rest['Hips'].inverted()
    hip = parent_delta @ hip_local
    forward, height, pitch = foot_path(phase, running)
    foot = Vector((hip_local.x, forward, height))
    upper = (definitions[prefix+'Leg'][1]-hip_local).length
    lower = (definitions[prefix+'Shin'][1]-definitions[prefix+'Shin'][0]).length
    d = foot-hip
    distance = min(d.length, upper+lower-.002)
    unit = d.normalized()
    # Reach limiting bends the knee slightly instead of snapping at full extension.
    foot = hip + unit*distance
    along = (upper*upper-lower*lower+distance*distance)/(2*distance)
    bend = math.sqrt(max(0, upper*upper-along*along))
    pole = Vector((0, -unit.z, unit.y)).normalized()
    knee = hip + unit*along + pole*bend
    segment(prefix+'Leg', hip, knee)
    segment(prefix+'Shin', knee, foot)
    q = Quaternion(AXIS_X, pitch)
    toe_root = foot + q @ (definitions[prefix+'Foot'][1]-definitions[prefix+'Foot'][0])
    segment(prefix+'Foot', foot, toe_root)
    segment(prefix+'Toe', toe_root, toe_root + q @ (definitions[prefix+'Toe'][1]-definitions[prefix+'Toe'][0]))

def animate(name, duration):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    count = round(duration*scene.render.fps)
    for frame in range(count+1):
        scene.frame_set(frame)
        p = frame/count
        wave = math.sin(p*math.tau)
        running = name == 'Run'
        idle = name == 'Idle'
        for pb in rig.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        if idle:
            hips_z = .0015*wave
            sway = .002*wave
            twist = .006*wave
        else:
            # Lower the pelvis during loading so the stance leg can actually
            # reach the ground at heel contact, then rise through push-off.
            hips_z = (-.08-.04*math.cos((p-.10)*math.tau*2)) if running else (-.055-.03*math.cos(p*math.tau*2))
            sway = (.011 if running else .016)*wave
            twist = (.06 if running else .035)*wave
        root_motion = Matrix.Translation((sway, 0, hips_z)) @ Matrix.Translation(definitions['Hips'][0]) @ Euler((0, .018*wave if not idle else 0, twist), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-definitions['Hips'][0])
        pose_matrix('Hips', root_motion @ rest['Hips'])
        local_pose('Spine', -.085 if running else -.026 if not idle else -.008, 0, -twist*.6)
        local_pose('Chest', -.055 if running else -.017 if not idle else .006*wave, 0, -twist*.75)
        local_pose('Neck', .04 if running else .013, 0, twist*.35)
        local_pose('Head', .045 if running else .018, 0, twist*.4)
        for side, prefix, offset in [(-1, 'Left', 0), (1, 'Right', .5)]:
            phase = (p+offset)%1
            leg_wave = math.cos(phase*math.tau)
            arm_swing = 0 if idle else -leg_wave*(.57 if running else .28)
            # Soft elbow flex at walk; tucked forearms at run, opposite the legs.
            local_pose(prefix+'Arm', arm_swing, -side*(.04 if running else .025), 0)
            local_pose(prefix+'ForeArm', (1.13+.15*math.sin(phase*math.tau)) if running else .22+.06*wave if not idle else .14, 0, 0)
            local_pose(prefix+'Hand', -.07 if running else -.035, 0, 0)
            if idle:
                local_pose(prefix+'Leg')
                local_pose(prefix+'Shin')
                local_pose(prefix+'Foot')
                local_pose(prefix+'Toe')
            else:
                solve_leg(prefix, phase, running)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location', frame=frame, group=pb.name)
            pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
            pb.keyframe_insert('scale', frame=frame, group=pb.name)
    return action

for name, duration in [('Idle', 3), ('Walk', .86), ('Run', .64)]:
    animate(name, duration)
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
scene.frame_set(0)
bpy.context.view_layer.update()
scene['notes'] = 'Original firefighter v3: weighted 19-joint rig, authored contact/swing locomotion, embedded PBR textures. Not motion capture.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'firefighter-v3.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'firefighter.glb'), export_format='GLB', export_yup=True, export_extras=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_anim_slide_to_zero=True, export_optimize_animation_size=True)
triangles = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
metadata = {
    'name': 'Generic turnout firefighter', 'source': 'Original turnout gear and retained CC0 MakeHuman anatomical head, eyes, brows, hair and skin',
    'triangles': triangles, 'units': 'metres', 'up': '+Y', 'forward': '-Z',
    'rig': '19-joint weighted skeleton: pelvis, spine, chest, neck, head, shoulders, elbows, wrists, hips, knees, ankles and toes',
    'animations': [{'name':'Idle','duration':3}, {'name':'Walk','duration':.86,'referenceSpeed':1.51}, {'name':'Run','duration':.64,'referenceSpeed':3.71}],
    'motionSource': 'Original authored cycles using analytical two-bone leg IK and heel/sole/toe contact targets, baked to glTF keyframes',
    'baseAssetSHA256': hashlib.sha256(SEED.read_bytes()).hexdigest(),
    'commercialUse': 'Original gear and animations; CC0 MakeHuman assets with retained licenses/provenance under licenses/',
    'limitations': ['Not a photorealistic scan or motion capture', 'No facial or finger animation', 'In-place flat-ground cycles; no per-foot terrain IK'],
}
(OUT/'firefighter.json').write_text(json.dumps(metadata, indent=2)+'\n')
print('FIREFIGHTER_V3', triangles, 'triangles;', len(arm_data.bones), 'bones;', (OUT/'firefighter.glb').stat().st_size, 'bytes')
