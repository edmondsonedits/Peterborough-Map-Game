"""Build researched city-building assets from metric footprint contracts.

This pipeline deliberately separates authoritative GIS geometry from facade
observations. The contracts command needs no Blender; Blender mode consumes a
per-building model-spec.json created only after the evidence record is reviewed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "docs" / "building-reconstruction" / "batch-001-input.json"
ASSET_ROOT = ROOT / "city-explorer" / "assets" / "building-reconstruction" / "batch-001"
MODEL_ROOT = Path(r"H:\ChatGPT\Peterborough-Building-Reconstruction-20261101\models")
EARTH_RADIUS_M = 6371008.8
PROJECT_REFERENCE_LAT = 44.3091
PROJECT_METRES_PER_LON_DEGREE = 111320 * math.cos(math.radians(PROJECT_REFERENCE_LAT))
PROJECT_METRES_PER_LAT_DEGREE = 110540


def _asset_id(source_id: str) -> str:
    return source_id.replace("/", "-")


def _ring_local(ring, lat0, lon0):
    points = []
    for lon, lat in ring:
        # Match the city game's projection exactly (X east, local Z south).
        # The datum cancels around an origin, but the fixed reference latitude
        # and per-degree scales must remain identical to project(lat, lon).
        x = (lon - lon0) * PROJECT_METRES_PER_LON_DEGREE
        z = -(lat - lat0) * PROJECT_METRES_PER_LAT_DEGREE
        point = [round(x, 4), round(z, 4)]
        if not points or point != points[-1]:
            points.append(point)
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    return points


def footprint_contract(building):
    source_id = building["id"]
    ring = _ring_local(building["ring"], building["latitude"], building["longitude"])
    if len(ring) < 3:
        raise ValueError(f"{source_id}: footprint must have at least 3 distinct vertices")
    xs, zs = [p[0] for p in ring], [p[1] for p in ring]
    return {
        "id": _asset_id(source_id),
        "rootName": f"CityBuilding_{_asset_id(source_id)}_Root",
        "assetUrl": f"./assets/building-reconstruction/batch-001/{_asset_id(source_id)}/{_asset_id(source_id)}.glb",
        "sourceIds": [source_id],
        "origin": {"lat": building["latitude"], "lon": building["longitude"], "yawDegrees": 0},
        "footprint": ring,
        "groundSampleBounds": {"minX": min(xs), "maxX": max(xs), "frontZ": min(zs), "rearZ": max(zs)},
        "floorOffset": 0.06,
        "foundationDepth": 4.0,
        "maxHeight": max(25, round(float(building.get("estimatedHeightM", 10)) * 2)),
        "boundsTolerance": 2.0,
        "units": "metres",
        "site": {
            "name": building["name"], "address": building.get("address", ""),
            "sourceId": source_id, "areaM2": building.get("areaM2"),
            "estimatedHeightM": building.get("estimatedHeightM"),
            "sourceTags": building.get("tags", {}),
            "footprintSource": "batch-001-input.json OSM ring, locally projected from geographic coordinates",
        },
    }


def write_contracts():
    batch = json.loads(INPUT.read_text(encoding="utf-8"))
    for building in batch["buildings"]:
        contract = footprint_contract(building)
        asset_dir = ASSET_ROOT / contract["id"]
        asset_dir.mkdir(parents=True, exist_ok=True)
        (asset_dir / "footprint-contract.json").write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(batch['buildings'])} metric footprint contracts to {ASSET_ROOT}")


def build_with_blender(asset_id):
    import bpy
    import bmesh
    from mathutils import Vector

    asset_dir = ASSET_ROOT / asset_id
    contract = json.loads((asset_dir / "footprint-contract.json").read_text(encoding="utf-8"))
    spec_path = asset_dir / "model-spec.json"
    if not spec_path.exists():
        raise FileNotFoundError(f"Missing reviewed {spec_path}; no generic facade will be invented")
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    if spec.get("sourceId") != contract["sourceIds"][0]:
        raise ValueError("model-spec sourceId must match the footprint contract")

    def material(name, color, roughness=0.78, metallic=0):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        return mat

    def authored_tile(key):
        texture_dir = asset_dir / "materials"
        texture_dir.mkdir(exist_ok=True)
        path = texture_dir / f"{key}.png"
        size = 256
        rng = random.Random(24681 if key == "brick-red" else 1937)
        colors = [(0.34, 0.12, 0.085), (0.42, 0.16, 0.11), (0.48, 0.20, 0.14), (0.37, 0.145, 0.11)]
        mortar = (0.67, 0.64, 0.59)
        pixels = [0.0] * (size * size * 4)
        cells = {}
        for py in range(size):
            for px in range(size):
                if key == "brick-red":
                    row = py // 32
                    shifted = (px + (64 if row % 2 else 0)) % 128
                    is_mortar = py % 32 < 3 or shifted < 4
                    if is_mortar:
                        color = mortar
                    else:
                        cell = (row % 2, ((px + (64 if row % 2 else 0)) // 128) % 2)
                        if cell not in cells:
                            base = colors[rng.randrange(len(colors))]
                            cells[cell] = tuple(max(0, min(1, c + rng.uniform(-.025, .025))) for c in base)
                        color = cells[cell]
                        variation = 0.006 * math.sin(2 * math.pi * px / size) + 0.005 * math.sin(2 * math.pi * py / size)
                        color = tuple(max(0, min(1, c + variation)) for c in color)
                else:
                    wave = 0.006 * math.sin(2 * math.pi * px / size) + 0.006 * math.sin(2 * math.pi * py / size) + 0.004 * math.sin(2 * math.pi * (px + py) / 128)
                    noise = wave
                    color = tuple(max(0, min(1, c + noise)) for c in (.72, .69, .62))
                i = (py * size + px) * 4
                pixels[i:i+4] = [*color, 1.0]
        image = bpy.data.images.new(f"Original procedural {key} tile", width=size, height=size, alpha=False)
        image.pixels.foreach_set(pixels)
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        image.pack()
        return image, path

    def material_from_spec(defn):
        mat = material(defn["name"], tuple(defn["color"]), defn.get("roughness", .78), defn.get("metallic", 0))
        texture = defn.get("texture")
        if texture:
            image, _ = authored_tile(texture)
            nodes = mat.node_tree.nodes
            tex = nodes.new("ShaderNodeTexImage")
            tex.name = "Original reusable facade tile"
            tex.image = image
            mat.node_tree.links.new(tex.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
            mat["authoredTexture"] = texture
        return mat

    def prism(name, polygon, bottom, top, mat):
        n = len(polygon)
        verts = [(x, -z, bottom) for x, z in polygon] + [(x, -z, top) for x, z in polygon]
        faces = [tuple(range(n)), tuple(range(n, 2*n))]
        faces.extend((i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n))
        mesh = bpy.data.meshes.new(name + "Mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        if mat.get("authoredTexture"):
            uv = mesh.uv_layers.new(name="UVMap_Metric")
            loops = list(mesh.polygons[0].loop_indices)
            for loop_index in loops:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = (vertex.x, -vertex.y)
            loops = list(mesh.polygons[1].loop_indices)
            for loop_index in loops:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = (vertex.x, -vertex.y)
            for edge_index in range(n):
                edge = mesh.polygons[edge_index + 2]
                a, b = polygon[edge_index], polygon[(edge_index + 1) % n]
                length = math.hypot(b[0] - a[0], b[1] - a[1])
                uv_values = [(0, bottom), (length, bottom), (length, top), (0, top)]
                for loop_index, uv_value in zip(edge.loop_indices, uv_values):
                    uv.data[loop_index].uv = uv_value
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mat)
        return obj

    def gable_panel(defn):
        tangent = Vector((defn["tangentX"], -defn["tangentZ"], 0)).normalized()
        normal = Vector((defn["normalX"], -defn["normalZ"], 0)).normalized()
        center = Vector((defn["x"], -defn["z"], 0))
        half_depth = float(defn.get("depth", .3)) / 2
        width = float(defn["width"])
        profile = [(-width/2, defn["bottomY"]), (width/2, defn["bottomY"]),
                   (width/2, defn["eaveY"]), (0, defn["peakY"]), (-width/2, defn["eaveY"])]
        front = [center + tangent*s + normal*half_depth + Vector((0, 0, y)) for s, y in profile]
        back = [center + tangent*s - normal*half_depth + Vector((0, 0, y)) for s, y in profile]
        vertices = [tuple(v) for v in front + back]
        faces = [tuple(range(5)), tuple(range(9, 4, -1))]
        faces.extend((i, (i+1)%5, (i+1)%5+5, i+5) for i in range(5))
        mesh = bpy.data.meshes.new(defn["name"] + "Mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(defn["name"], mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(palette[defn["material"]])
        obj.parent = root
        return obj

    def round_panel(defn):
        normal = Vector((defn["normalX"], -defn["normalZ"], 0)).normalized()
        location = (defn["x"], -defn["z"], defn["y"])
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=defn["radius"], depth=defn.get("depth", .12), location=location)
        obj = bpy.context.object
        obj.name = defn["name"]
        obj.rotation_euler = normal.to_track_quat("Z", "Y").to_euler()
        obj.data.materials.append(palette[defn["material"]])
        obj.parent = root
        return obj

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for data in list(datablocks):
            if data.users == 0:
                datablocks.remove(data)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    root = bpy.data.objects.new(contract["rootName"], None)
    bpy.context.collection.objects.link(root)
    root["sourceId"] = contract["sourceIds"][0]
    root["assetRole"] = "city-building-reconstruction"

    palette = {m["name"]: material_from_spec(m) for m in spec["materials"]}
    footprint = contract["footprint"]
    foundation_depth = float(spec.get("foundationDepth", contract.get("foundationDepth", 4.0)))
    if foundation_depth > 0:
        foundation = prism("Footprint-matched terrain skirt", footprint, -foundation_depth, 0,
                           palette[spec["volumes"][0]["material"]])
        foundation.parent = root
    for panel in spec.get("gablePanels", []):
        gable_panel(panel)
    for panel in spec.get("roundPanels", []):
        round_panel(panel)
    for volume in spec["volumes"]:
        poly = volume.get("footprint", footprint)
        obj = prism(volume["name"], poly, float(volume.get("baseY", 0)), float(volume["topY"]), palette[volume["material"]])
        obj.parent = root
    for box in spec.get("boxes", []):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(box["x"], -box["z"], box["y"]))
        obj = bpy.context.object
        obj.name = box["name"]
        obj.dimensions = (box["width"], box.get("depth", .1), box["height"])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if box.get("rotationRad") is not None:
            obj.rotation_euler[2] = float(box["rotationRad"])
        obj.data.materials.append(palette[box["material"]])
        obj.parent = root
    for label in spec.get("texts", []):
        bpy.ops.object.text_add(location=(label["x"], -label["z"], label["y"]))
        obj = bpy.context.object
        obj.name = label["name"]
        obj.data.body = label["text"]
        obj.data.size = float(label["size"])
        obj.data.extrude = float(label.get("extrude", .012))
        obj.data.offset = float(label.get("offset", 0))
        obj.data.resolution_u = int(label.get("resolutionU", 2))
        obj.data.render_resolution_u = int(label.get("renderResolutionU", 2))
        obj.data.bevel_resolution = 1
        obj.data.align_x = label.get("alignX", "CENTER")
        # Screen X is the wall tangent, screen Y is vertical, and text normal
        # points out from the wall. The fields are authored in local X/Z.
        tangent = Vector((label["tangentX"], -label["tangentZ"], 0)).normalized()
        normal = Vector((label["normalX"], -label["normalZ"], 0)).normalized()
        up = Vector((0, 0, 1))
        # Blender text is right-handed: tangent x up must point out of the wall.
        if tangent.cross(up).dot(normal) < 0:
            tangent.negate()
        from mathutils import Matrix
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Matrix((tangent, up, normal)).transposed().to_quaternion()
        obj.data.materials.append(palette[label["material"]])
        bpy.ops.object.convert(target="MESH")
        bpy.context.object.parent = root

    # Join objects by material to keep the shipped asset within a small draw budget.
    bpy.context.view_layer.update()
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        obox = (min(p.x for p in points), max(p.x for p in points), -max(p.y for p in points), -min(p.y for p in points))
        if obox[0] < min(p[0] for p in footprint)-2 or obox[1] > max(p[0] for p in footprint)+2 or obox[2] < min(p[1] for p in footprint)-2 or obox[3] > max(p[1] for p in footprint)+2:
            print("PREJOIN_OUTSIDE", obj.name, tuple(round(v, 2) for v in obox))
    by_material = {}
    for obj in list(root.children):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        by_material.setdefault(obj.data.materials[0].name, []).append(obj)
    for mat_name, objects in by_material.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            # Bake each child’s world transform before joining. Joining a
            # parented text mesh into a large footprint shell can otherwise
            # expand the exported bounds unpredictably.
            world_matrix = obj.matrix_world.copy()
            obj.parent = None
            obj.data.transform(world_matrix)
            obj.location = (0, 0, 0)
            obj.rotation_euler = (0, 0, 0)
            obj.rotation_quaternion = (1, 0, 0, 0)
            obj.scale = (1, 1, 1)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"CityBuilding_{asset_id}_{mat_name.replace(' ', '_')}"
        joined.parent = root

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    blend_path = MODEL_ROOT / f"{asset_id}.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()
    world_points = [obj.matrix_world @ Vector(corner) for obj in root.children_recursive if obj.type == "MESH" for corner in obj.bound_box]
    bounds = {
        "minX": min(p.x for p in world_points), "maxX": max(p.x for p in world_points),
        "minY": min(p.z for p in world_points), "maxY": max(p.z for p in world_points),
        "minZ": -max(p.y for p in world_points), "maxZ": -min(p.y for p in world_points),
    }
    xs, zs = [p[0] for p in contract["footprint"]], [p[1] for p in contract["footprint"]]
    tolerance = float(contract["boundsTolerance"])
    if bounds["minX"] < min(xs) - tolerance or bounds["maxX"] > max(xs) + tolerance or bounds["minZ"] < min(zs) - tolerance or bounds["maxZ"] > max(zs) + tolerance:
        outside = []
        for obj in root.children_recursive:
            if obj.type != "MESH":
                continue
            points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
            box = (min(p.x for p in points), max(p.x for p in points), -max(p.y for p in points), -min(p.y for p in points))
            if box[0] < min(xs)-tolerance or box[1] > max(xs)+tolerance or box[2] < min(zs)-tolerance or box[3] > max(zs)+tolerance:
                outside.append((obj.name, tuple(round(v,2) for v in box)))
        raise ValueError(f"Model exceeds footprint bounds tolerance: {bounds}; offenders={outside[:6]}")
    if bounds["minY"] < -5 or bounds["maxY"] > float(contract["maxHeight"]):
        raise ValueError(f"Model elevation violates layout limits: {bounds}")
    bounds = {k: round(v, 4) for k, v in bounds.items()}
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    glb = asset_dir / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True, export_apply=True)
    reimport = reimport_validate(glb, contract, bounds)
    write_model_outputs(asset_id, contract, spec, glb, blend_path, bounds, reimport)
    render_review(asset_id, contract, spec)
    print(f"CITY_BUILDING_ASSET {asset_id} {glb.stat().st_size} bytes")


def render_review(asset_id, contract, spec):
    import bpy
    from mathutils import Vector
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new(f"{asset_id} review world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.39, .46, .55, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .7
    footprint = contract["footprint"]
    xs, zs = [p[0] for p in footprint], [p[1] for p in footprint]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    span = max(max(xs) - min(xs), max(zs) - min(zs))
    height = max(float(v["topY"]) for v in spec["volumes"])
    review = spec.get("reviewView", {})
    overview = bool(review.get("overview"))
    target = Vector((cx, -cz, height * .35)) if overview else Vector((float(review.get("centerX", cx)), -float(review.get("centerZ", cz)), float(review.get("targetY", height * .42))))
    nx, nz = float(review.get("normalX", .65)), float(review.get("normalZ", -.76))
    distance = span * (1.0 if overview else .62)
    elevation = span * (.65 if overview else .20)
    bpy.ops.object.camera_add(location=(target.x + nx * distance, target.y - nz * distance, target.z + elevation))
    camera = bpy.context.object
    camera.name = f"{asset_id}_review_camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = span * (1.24 if overview else float(review.get("orthoScaleFactor", .37)))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(cx + span * .25, -cz - span * .15, height + span * .55))
    key = bpy.context.object
    key.data.energy = max(1000, span * span * 1.6)
    key.data.shape = "DISK"
    key.data.size = span * .55
    key.rotation_euler = (target - key.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(MODEL_ROOT / f"{asset_id}-beauty.png")
    bpy.ops.mesh.primitive_plane_add(size=span * 2.2, location=(cx, -cz, -.08))
    ground = bpy.context.object
    ground.name = f"{asset_id}_review_ground_only"
    ground_mat = bpy.data.materials.new(f"{asset_id} neutral render ground")
    ground_mat.diffuse_color = (.10, .13, .15, 1)
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.10, .13, .15, 1)
    ground.data.materials.append(ground_mat)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(ground, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.objects.remove(key, do_unlink=True)
    bpy.ops.object.camera_add(location=(cx, -cz, height + span * .85))
    overhead = bpy.context.object
    overhead.name = f"{asset_id}_overhead_camera"
    overhead.data.type = "ORTHO"
    overhead.data.ortho_scale = span * 1.18
    overhead.rotation_euler = (Vector((cx, -cz, 0)) - overhead.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = overhead
    bpy.ops.object.light_add(type="AREA", location=(cx, -cz, height + span * .6))
    overhead_light = bpy.context.object
    overhead_light.data.energy = max(1200, span * span * 1.2)
    overhead_light.data.shape = "DISK"
    overhead_light.data.size = span * .8
    overhead_light.rotation_euler = (Vector((cx, -cz, 0)) - overhead_light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(MODEL_ROOT / f"{asset_id}-overhead.png")
    bpy.ops.render.render(write_still=True)


def _glb_stats(glb):
    data = glb.read_bytes()
    json_len, _ = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20:20 + json_len].decode("utf8").rstrip(" \x00"))
    tris = 0
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor = primitive.get("indices", primitive["attributes"].get("POSITION"))
            tris += doc["accessors"][accessor]["count"] / 3
    return {"fileBytes": len(data), "triangleCount": int(tris), "materialCount": len(doc.get("materials", [])),
            "embeddedImageCount": len(doc.get("images", [])), "meshCount": len(doc.get("meshes", [])), "nodeCount": len(doc.get("nodes", []))}


def reimport_validate(glb, contract, authored_bounds):
    import bpy
    from mathutils import Vector
    before = {obj.as_pointer() for obj in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(glb))
    imported = [obj for obj in bpy.data.objects if obj.as_pointer() not in before]
    root = next((obj for obj in imported if obj.name == contract["rootName"] or obj.name.startswith(contract["rootName"] + ".")), None)
    if root is None:
        raise ValueError(f"GLB reimport is missing root {contract['rootName']}; imported {[o.name for o in imported[:8]]}")
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in [root, *root.children_recursive] if obj.type == "MESH" for corner in obj.bound_box]
    bounds = {"minX": min(p.x for p in points), "maxX": max(p.x for p in points),
              "minY": min(p.z for p in points), "maxY": max(p.z for p in points),
              "minZ": -max(p.y for p in points), "maxZ": -min(p.y for p in points)}
    delta = max(abs(bounds[key] - authored_bounds[key]) for key in bounds)
    if delta > .01:
        raise ValueError(f"GLB reimport bounds differ from authored model by {delta:.4f} m")
    meshes = [obj for obj in [root, *root.children_recursive] if obj.type == "MESH"]
    materials = {mat.name for obj in meshes for mat in obj.data.materials if mat}
    return {"rootName": root.name, "meshCount": len(meshes), "materialCount": len(materials),
            "bounds": {key: round(value, 4) for key, value in bounds.items()}, "maxAuthoredBoundsDeltaM": round(delta, 5)}


def write_model_outputs(asset_id, contract, spec, glb, blend_path, bounds, reimport):
    evidence = spec.get("evidenceRecord", f"docs/building-reconstruction/batch-001/{asset_id}.json")
    layout = dict(contract)
    layout.update({"assetFile": glb.name, "evidenceRecord": evidence,
                   "foundationDepth": float(spec.get("foundationDepth", contract.get("foundationDepth", 4.0))),
                   "observedElements": spec.get("observedElements", []),
                   "estimatedElements": spec.get("estimatedElements", [])})
    (glb.parent / "layout.json").write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
    stats = _glb_stats(glb)
    report = {"sourceId": contract["sourceIds"][0], "asset": glb.name, "sourceBlend": str(blend_path),
              "sha256": hashlib.sha256(glb.read_bytes()).hexdigest(), "units": "metres", "stats": stats, "bounds": bounds,
              "budget": {"maxTriangles": 6000, "maxMaterials": 6, "maxBytes": 1000000},
              "packedOriginalTextures": [f"materials/{m['texture']}.png" for m in spec["materials"] if m.get("texture")],
              "foundationDepth": float(spec.get("foundationDepth", contract.get("foundationDepth", 4.0))),
              "evidenceRecord": evidence,
              "observedElements": spec.get("observedElements", []),
              "estimatedElements": spec.get("estimatedElements", []),
              "validation": {"footprintContract": "all mesh bounds inside projected OSM-ring bounds plus configured tolerance",
                             "configuredBoundsToleranceM": contract["boundsTolerance"], "elevationRangeM": [bounds["minY"], bounds["maxY"]],
                             "glbReimport": reimport, "errors": 0, "warnings": []}}
    (glb.parent / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--contracts-only", action="store_true")
    parser.add_argument("--id", help="asset directory id, for example way-77772361")
    # Blender passes its own flags before the `--` separator.
    blender_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(blender_args)
    if args.contracts_only:
        write_contracts()
        return
    asset_id = args.id or os.environ.get("CITY_BUILDING_ID")
    if not asset_id:
        parser.error("Blender mode requires --id <asset-id>")
    build_with_blender(asset_id)


if __name__ == "__main__":
    main()
