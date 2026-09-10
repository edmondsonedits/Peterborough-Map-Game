"""Deterministic stylized broadleaf workshop; run with Blender --background --python."""
import argparse
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector


PALETTE = {
    "bark": (0.19, 0.125, 0.075, 1.0),
    "leaf_shadow": (0.075, 0.17, 0.045, 1.0),
    "leaf_mid": (0.15, 0.28, 0.075, 1.0),
    "leaf_sun": (0.25, 0.37, 0.11, 1.0),
}


def paint(obj, color, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    attr = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for entry in attr.data:
        entry.color = color
    return obj


def limb(start, end, radius, vertices, material):
    delta = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                    radius2=radius * 0.53, depth=delta.length,
                                    location=(Vector(start) + Vector(end)) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return paint(obj, PALETTE["bark"], material)


def build_lod(level, seed, material):
    rng = random.Random(seed)
    parts = [limb((0, 0, 0), (0.12, -0.04, 4.5), 0.23,
                  (10, 7, 5)[level], material)]
    lobes = []
    for index in range(7):
        angle = index * math.tau / 7 + rng.uniform(-0.17, 0.17)
        reach = rng.uniform(1.1, 1.7)
        lobes.append(((math.cos(angle) * reach, math.sin(angle) * reach,
                       rng.uniform(4.3, 5.5)),
                      (rng.uniform(1.4, 1.8), rng.uniform(1.35, 1.7), rng.uniform(1.5, 1.85))))
    lobes.append(((0.1, -0.1, 6.0), (1.8, 1.7, 1.8)))
    if level == 2:
        lobes = [((0, 0, 5.2), (2.9, 2.8, 2.6))]
    for index, (position, scale) in enumerate(lobes):
        if level == 0 and index < 7:
            parts.append(limb((0.06, -0.02, 2.8), position, 0.085, 6, material))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if level == 0 else 1,
                                             radius=1, location=position)
        obj = bpy.context.object
        obj.scale = scale
        # Vertex displacement is fixed by seed, with broad lobes rather than leaf cards.
        for vertex in obj.data.vertices:
            vertex.co *= rng.uniform(0.93, 1.07)
        shade = ("leaf_shadow", "leaf_mid", "leaf_sun")[index % 3]
        parts.append(paint(obj, PALETTE[shade], material))
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = f"Broadleaf_LOD{level}"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    # Joining equal material slots can leave duplicate slots; enforce one primitive.
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    obj.data.calc_loop_triangles()
    obj["asset_origin"] = "procedural illustrative broadleaf; not surveyed species or dimensions"
    obj["lod"] = level
    return obj


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[2] / "city-explorer/assets/vegetation")
    parser.add_argument("--seed", type=int, default=41073)
    parser.add_argument("--save-blend", action="store_true")
    options = parser.parse_args(args)
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    material = bpy.data.materials.new("CityVegetationPalette")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.95
    colors = material.node_tree.nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    material.node_tree.links.new(colors.outputs["Color"], principled.inputs["Base Color"])
    records = []
    for level, budget in enumerate((1200, 250, 60)):
        bpy.ops.object.select_all(action="DESELECT")
        obj = build_lod(level, options.seed, material)
        triangles = len(obj.data.loop_triangles)
        if triangles > budget:
            raise RuntimeError(f"LOD{level}: {triangles} triangles exceeds budget {budget}")
        path = output / f"broadleaf-lod{level}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                                  use_selection=True, export_yup=True,
                                  export_texcoords=False, export_normals=True,
                                  export_materials="EXPORT", export_animations=False,
                                  export_extras=True)
        records.append({"lod": level, "file": path.name, "mesh": obj.name,
                        "triangles": triangles, "bytes": path.stat().st_size,
                        "dimensions_xyz_blender_m": list(obj.dimensions),
                        "suggested_distance_m": (0, 85, 190)[level]})
    manifest = {"schema": 1, "family": "illustrative-broadleaf", "seed": options.seed,
                "generator": "tools/blender/build_city_vegetation.py", "blender": bpy.app.version_string,
                "provenance": "Original procedural geometry; inferred appearance, not a surveyed tree or species identification.",
                "coordinate_system": "GLB +Y up; meters; origin at trunk ground contact",
                "materials_per_lod": 1, "textures": 0,
                "palette_linear_rgba": PALETTE, "assets": records}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if options.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(output / "vegetation-workshop.blend"))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
