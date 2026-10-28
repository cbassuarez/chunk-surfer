"""Bounded hall pair proof, derived from the shipped CC0 chandelier.

Run through build-hall-chandelier.mjs. This imports the approved runtime body,
preserves its UVs/positions, separates existing bulb faces, and supplies the
missing suspension. No other prop pack is rebuilt or written.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def gltf_co(co):
    return (float(co.x), float(co.z), -float(co.y))


def blender_co(co):
    return (co[0], -co[2], co[1])


def bounds(points):
    return {
        "min": [min(p[k] for p in points) for k in range(3)],
        "max": [max(p[k] for p in points) for k in range(3)],
    }


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def components(mesh):
    """Weld only for classification; never weld or alter the shipped surface."""
    parent = list(range(len(mesh.vertices)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(a, b):
        parent[root(a)] = root(b)

    positions = {}
    for vertex in mesh.vertices:
        key = tuple(round(value, 5) for value in gltf_co(vertex.co))
        join(vertex.index, positions.setdefault(key, vertex.index))
    for face in mesh.polygons:
        for index in face.vertices[1:]:
            join(face.vertices[0], index)
    groups = defaultdict(list)
    for face in mesh.polygons:
        groups[root(face.vertices[0])].append(face.index)
    result = []
    for faces in groups.values():
        vertices = sorted({v for f in faces for v in mesh.polygons[f].vertices})
        result.append({"faces": faces, "vertices": vertices,
                       **bounds([gltf_co(mesh.vertices[i].co) for i in vertices])})
    return result


def copy_faces(source, name, face_indices, translate_y=0.0):
    """Copy exact shipped polygon corners, material slots and UV loops."""
    mesh = source.data
    faces = [mesh.polygons[index] for index in sorted(face_indices)]
    used = sorted({index for face in faces for index in face.vertices})
    remap = {old: new for new, old in enumerate(used)}
    coordinates = []
    for index in used:
        co = list(gltf_co(mesh.vertices[index].co))
        co[1] += translate_y
        coordinates.append(blender_co(co))
    output = bpy.data.meshes.new(name)
    output.from_pydata(coordinates, [], [[remap[v] for v in f.vertices] for f in faces])
    for material in mesh.materials:
        output.materials.append(material)
    for old, new in zip(faces, output.polygons):
        new.material_index = old.material_index
        new.use_smooth = old.use_smooth
    for layer in mesh.uv_layers:
        uv = output.uv_layers.new(name=layer.name)
        for old, new in zip(faces, output.polygons):
            for old_loop, new_loop in zip(old.loop_indices, new.loop_indices):
                uv.data[new_loop].uv = layer.data[old_loop].uv
    output.update()
    if hasattr(output, "normals_split_custom_set"):
        output.normals_split_custom_set([tuple(mesh.corner_normals[loop].vector)
                                         for face in faces for loop in face.loop_indices])
    obj = bpy.data.objects.new(name, output)
    bpy.context.scene.collection.objects.link(obj)
    return obj, {old.index: new.index for old, new in zip(faces, output.polygons)}


def material(name, color, metallic, roughness, role, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 1
    mat["chandelierRole"] = role
    mat.diffuse_color = (*color, 1)
    return mat


def chain_mesh(name, source, canopy, upper_shackle, chain_bounds, west=False):
    # Move the complete ceiling junction, including its small connecting
    # shackle. Leaving that shackle at the old mount would strand it mid-chain.
    obj, _ = copy_faces(source, name, canopy["faces"] + upper_shackle["faces"],
                        translate_y=2.8)
    old = material(f"{name} original dusty iron", (.125, .115, .087), .72, .77,
                   "old-suspension")
    new = material(f"{name} replacement lower links", (.225, .235, .215), .82, .45,
                   "replacement-suspension") if west else None
    obj.data.materials.append(old)
    old_index = len(obj.data.materials) - 1
    if new:
        obj.data.materials.append(new)
    new_index = len(obj.data.materials) - 1
    points = [gltf_co(v.co) for v in obj.data.vertices]
    faces = [tuple(p.vertices) for p in obj.data.polygons]
    indices = [p.material_index for p in obj.data.polygons]
    smooth_values = [p.use_smooth for p in obj.data.polygons]
    normal_values = [[tuple(obj.data.corner_normals[i].vector) for i in p.loop_indices]
                     for p in obj.data.polygons]
    uv_values = [[tuple(obj.data.uv_layers.active.data[i].uv) for i in p.loop_indices]
                 for p in obj.data.polygons]
    axis = [(chain_bounds["min"][k] + chain_bounds["max"][k]) / 2 for k in (0, 2)]
    bottom = chain_bounds["min"][1]
    # Retain the source chain/shackle overlap at the translated junction.
    top = 2.8 + chain_bounds["max"][1]
    # Local radius 1.65mm becomes a 9.9mm wire DIAMETER at instance scale 3.
    wire = .00165
    radius_y = .030
    radius_x = .014
    # Match a taut chain: the inner top of a lower link rests on the inner
    # bottom of the next. Solve the half-height from the fixed attachment span,
    # rather than leaving a cumulative air gap between load-bearing links.
    count = round((top - bottom - 2 * (radius_y + wire)) / (2 * radius_y - 2 * wire)) + 1
    stocks = [.0019 if west and i < 6 else wire for i in range(count)]
    radius_y = (top - bottom + 2 * sum(stocks[1:-1])) / (2 * count)
    centers = [bottom + radius_y + stocks[0]]
    for i in range(1, count):
        centers.append(centers[-1] + 2 * radius_y - stocks[i - 1] - stocks[i])
    assert abs(centers[-1] + radius_y + stocks[-1] - top) < 1e-9
    step = (centers[-1] - centers[0]) / (count - 1)
    links = []
    for link in range(count):
        replacement = west and link < 6
        stock = stocks[link]
        rx = radius_x + (.0015 if replacement else 0)
        major = 10 if replacement else 8
        minor = 3
        center_y = centers[link]
        start = len(points)
        for i in range(major):
            theta = 2 * math.pi * i / major
            # Alternating vertical ring planes make a real interlinked path.
            for j in range(minor):
                phi = 2 * math.pi * j / minor
                outward = stock * math.cos(phi)
                across = stock * math.sin(phi)
                horizontal = (rx + outward) * math.cos(theta)
                y = center_y + (radius_y + outward) * math.sin(theta)
                x, z = (horizontal, across) if link % 2 == 0 else (across, horizontal)
                points.append((axis[0] + x, y, axis[1] + z))
        for i in range(major):
            for j in range(minor):
                a = start + i * minor + j
                b = start + ((i + 1) % major) * minor + j
                c = start + ((i + 1) % major) * minor + (j + 1) % minor
                d = start + i * minor + (j + 1) % minor
                faces.append((a, d, c, b) if link % 2 else (a, b, c, d))
                indices.append(new_index if replacement else old_index)
                smooth_values.append(False)
                normal_values.append([(0.0, 0.0, 0.0)] * 4)
                uv_values.append([(i / major, j / minor), ((i + 1) / major, j / minor),
                                  ((i + 1) / major, (j + 1) / minor),
                                  (i / major, (j + 1) / minor)])
        links.append({"index": link, "center": [axis[0], center_y, axis[1]],
                      "replacement": replacement, "plane": "xy" if link % 2 == 0 else "yz",
                      "wireRadius": stock, "halfWidth": rx, "halfHeight": radius_y})
    materials = list(obj.data.materials)
    output = bpy.data.meshes.new(name)
    output.from_pydata([blender_co(p) for p in points], [], faces)
    for mat in materials:
        output.materials.append(mat)
    uv = output.uv_layers.new(name="UVMap")
    for face, material_index, smooth, values in zip(output.polygons, indices, smooth_values, uv_values):
        face.material_index = material_index
        # Retain the source junction shading; the new chain has broad facets.
        face.use_smooth = smooth
        for loop, value in zip(face.loop_indices, values):
            uv.data[loop].uv = value
    output.update()
    if hasattr(output, "normals_split_custom_set"):
        output.normals_split_custom_set([normal for values in normal_values for normal in values])
    previous = obj.data
    obj.data = output
    bpy.data.meshes.remove(previous)
    output.name = name
    obj["chandelierRole"] = "suspension"
    obj["maintenanceHistory"] = "six replacement lower links" if west else "original dusty links"
    return obj, {"links": links, "canopyTranslationY": 2.8, "chainBottom": bottom,
                 "chainTop": top, "linkPitch": step}


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source, import_pack_images=True)
    source = next(obj for obj in bpy.context.scene.objects
                  if obj.type == "MESH" and (obj.name == "chandelier_03" or obj.data.name == "chandelier_03"))
    select_only([source])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    points = [gltf_co(v.co) for v in source.data.vertices]
    source_bounds = bounds(points)
    assert abs(source_bounds["max"][1]) < .0001, source_bounds
    assert abs(source_bounds["min"][1] + 1.041) < .0001, source_bounds
    for obj in list(bpy.data.objects):
        if obj != source:
            bpy.data.objects.remove(obj, do_unlink=True)
    source.name = "SOURCE_chandelier_03_shipped"
    groups = components(source.data)
    canopy = next(g for g in groups if g["max"][1] > -.0001 and g["min"][1] > -.10)
    upper_shackle = next(g for g in groups if -.101 < g["min"][1] < -.095
                         and -.09 < g["max"][1] < -.08)
    chain = next(g for g in groups if -.49 < g["min"][1] < -.47
                 and -.11 < g["max"][1] < -.09)
    lamps = []
    for g in groups:
        size = [g["max"][k] - g["min"][k] for k in range(3)]
        if size[0] < .04 and size[2] < .04 and size[1] > .10 and g["min"][1] < -.5:
            lamps.append(g)
    assert len(lamps) == 18, len(lamps)
    removed = set(canopy["faces"] + upper_shackle["faces"] + chain["faces"])
    body_faces = set(range(len(source.data.polygons))) - removed
    body, face_map = copy_faces(source, "hall_chandelier_body", body_faces)
    emitter = material("hall chandelier existing bulb glass", (.62, .53, .38), 0, .32,
                       "lamp", emission=(1, .66, .32))
    body.data.materials.append(emitter)
    lamp_index = len(body.data.materials) - 1
    lamp_records = []
    for index, group in enumerate(sorted(lamps, key=lambda g: (g["max"][1], g["min"][0], g["min"][2]))):
        # Only the existing upper envelope emits. The lower socket remains metal.
        cut = group["min"][1] + .35 * (group["max"][1] - group["min"][1])
        emitted = []
        for source_index in group["faces"]:
            original = source.data.polygons[source_index]
            center = sum(gltf_co(source.data.vertices[v].co)[1] for v in original.vertices) / len(original.vertices)
            if center >= cut:
                body.data.polygons[face_map[source_index]].material_index = lamp_index
                emitted.append(source_index)
        emitter_points = [gltf_co(source.data.vertices[v].co)
                          for f in emitted for v in source.data.polygons[f].vertices]
        lamp_records.append({"index": index, "center": [(group["min"][k] + group["max"][k]) / 2 for k in range(3)],
                             "emitterCenter": [(min(p[k] for p in emitter_points) + max(p[k] for p in emitter_points)) / 2 for k in range(3)],
                             "sourceBounds": {"min": group["min"], "max": group["max"]},
                             "emitterBounds": bounds(emitter_points), "emitterTriangles": len(emitted),
                             "emitterCutY": cut, "ring": "inner" if group["max"][1] > -.62 else "outer"})
    body["chandelierRole"] = "body"
    body["sourceMesh"] = "chandelier_03"
    body["lampCount"] = 18
    west, west_report = chain_mesh("hall_chandelier_support_west", source, canopy, upper_shackle, chain, west=True)
    east, east_report = chain_mesh("hall_chandelier_support_east", source, canopy, upper_shackle, chain, west=False)
    built = [body, west, east]
    source.hide_render = True
    source.hide_set(True)
    source["sourcePurpose"] = "Unmodified imported shipped topology, editable comparison; not exported"
    # Save one editable project with the source, the material separation and both histories.
    for image in bpy.data.images:
        if image.source == "FILE" and image.has_data:
            try:
                image.pack()
            except RuntimeError:
                pass
    bpy.data.orphans_purge(do_recursive=True)
    select_only(built)
    # The editable project opens with one complete installation visible, with
    # the east suspension as a hidden selectable alternative at the same origin.
    east.hide_set(True)
    east.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, check_existing=False)
    select_only(built)
    east.hide_render = False
    bpy.ops.export_scene.gltf(filepath=args.output, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_texcoords=True,
                              export_normals=True, export_tangents=False, export_materials="EXPORT",
                              export_image_format="AUTO", export_animations=False,
                              export_skins=False, export_morph=False, export_lights=False,
                              export_cameras=False, export_extras=True)
    report = {
        "revision": "hall-pair-construction-v1", "sourceMesh": "chandelier_03",
        "sourceBounds": source_bounds, "removedSourceTriangles": len(removed),
        "retainedBodyTriangles": len(body_faces), "existingLampCount": len(lamps),
        "lamps": lamp_records, "support": {"west": west_report, "east": east_report},
        "placementContract": {"scale": 3, "originWorldY": 7.1, "ceilingWorldY": 15.5,
                              "ceilingLocalY": 2.8, "lampMaterialRole": "lamp"},
        "approximations": ["Opaque textured glass; no transmission, refraction or caustics",
                           "Upper source bulb faces receive emission; sockets keep their original metal",
                           "Static linked suspension; no continuous motion or new sound",
                           "Chain stock and replacement finish are project-authored proposals, not measured historical claims"],
    }
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print("HALL CHANDELIER: editable source and three proof meshes exported")


if __name__ == "__main__":
    main()
