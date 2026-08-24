"""Blender-side builder for the shared hero vegetation pack."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1 :])


def select_only(objects: list[bpy.types.Object]) -> None:
    active = bpy.context.object
    if active and active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="AUTO",
        export_lights=False, export_cameras=False, export_extras=True,
    )


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def object_bounds(obj: bpy.types.Object) -> tuple[list[float], list[float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return ([min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)])


def join_parts(parts: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not parts:
        raise RuntimeError(f"{name}: no parts")
    select_only(parts)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def duplicate(obj: bpy.types.Object, name: str | None = None) -> bpy.types.Object:
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.animation_data_clear()
    bpy.context.scene.collection.objects.link(copy)
    if name:
        copy.name = name
        copy.data.name = name
    return copy


def centre_and_floor(obj: bpy.types.Object, target_height: float | None = None) -> None:
    low, high = object_bounds(obj)
    if target_height is not None:
        height = max(1e-6, high[2] - low[2])
        scale = target_height / height
        obj.scale = (scale, scale, scale)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        low, high = object_bounds(obj)
    shift = (-(low[0] + high[0]) * .5, -(low[1] + high[1]) * .5, -low[2])
    obj.data.transform(Matrix.Translation(shift))
    obj.data.update()


def source_material_is_leaves(material: bpy.types.Material | None) -> bool:
    if not material:
        return False
    key = material.name.lower()
    if "leaf" in key or "leaves" in key:
        return True
    if material.use_nodes and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                image_key = f"{node.image.name} {node.image.filepath}".lower()
                if "leaf" in image_key or "leaves" in image_key or "alpha" in image_key:
                    return True
    return False


def face_slots(obj: bpy.types.Object, names: set[str]) -> set[int]:
    return {index for index, slot in enumerate(obj.material_slots) if slot.material and slot.material.name in names}


def thin_material_faces(obj: bpy.types.Object, budget: int, material_names: set[str], seed: int = 0) -> int:
    current = triangle_count(obj)
    if current <= budget:
        return current
    slots = face_slots(obj, material_names)
    if not slots:
        return current
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    candidates = [face for face in bm.faces if face.material_index in slots]
    fixed = sum(max(1, len(face.verts) - 2) for face in bm.faces if face.material_index not in slots)
    candidate_tris = sum(max(1, len(face.verts) - 2) for face in candidates)
    target = max(0, budget - fixed)
    if candidate_tris <= target:
        bm.free()
        return current
    keep_ratio = max(0.0, min(1.0, target / max(1, candidate_tris)))
    discard = []
    ordered = sorted(candidates, key=lambda face: face.index)
    pairs = [ordered[index : index + 2] for index in range(0, len(ordered), 2)]
    # At the source tree's million-card scale a probability test can retain no
    # cards at all at very low ratios. Keep an exact, evenly distributed number
    # of pairs instead; the seed rotates the selection without changing count.
    keep_count = max(1, min(len(pairs), round(len(pairs) * keep_ratio)))
    phase = (seed * 0.61803398875) % 1.0
    keep = {min(len(pairs) - 1, int(((index + phase) / keep_count) * len(pairs))) for index in range(keep_count)}
    for pair_index, pair in enumerate(pairs):
        if pair_index not in keep:
            discard.extend(pair)
    bmesh.ops.delete(bm, geom=discard, context="FACES")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return triangle_count(obj)


def apply_budget(obj: bpy.types.Object, budget: int, seed: int = 0) -> int:
    leaf_names = {"__tree_leaf__", "vegetation.live", "vegetation.deadLeaf"}
    slots = face_slots(obj, leaf_names)
    fixed = sum(max(1, len(face.vertices) - 2) for face in obj.data.polygons if face.material_index not in slots)
    # When the woody skeleton alone is above a lower LOD budget, decimate the
    # complete mesh so the lower tier keeps a proportional crown instead of
    # deleting every leaf before simplifying the branches.
    current = triangle_count(obj)
    if fixed < budget:
        current = thin_material_faces(obj, budget, leaf_names, seed)
    if current > budget:
        select_only([obj])
        modifier = obj.modifiers.new(name=f"Vegetation budget {budget}", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(.01, min(.99, budget / current * .96))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        current = triangle_count(obj)
    return current


def transform_uvs(obj: bpy.types.Object, material_names: set[str], cell: tuple[int, int]) -> None:
    if not obj.data.uv_layers:
        return
    slots = face_slots(obj, material_names)
    ox, oy = cell[0] * .5, cell[1] * .5
    uv = obj.data.uv_layers.active.data
    for polygon in obj.data.polygons:
        if polygon.material_index not in slots:
            continue
        for loop_index in polygon.loop_indices:
            uv[loop_index].uv.x = ox + uv[loop_index].uv.x * .5
            uv[loop_index].uv.y = oy + uv[loop_index].uv.y * .5


def image_node(nodes, image_path: Path, non_color: bool) -> bpy.types.ShaderNodeTexImage:
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(image_path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def textured_material(name: str, texture_dir: Path, prefix: str, *, alpha: bool, base=(1, 1, 1, 1)) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    albedo_path = texture_dir / f"{prefix}-albedo.{'png' if alpha else 'jpg'}"
    albedo = image_node(nodes, albedo_path, False)
    material.node_tree.links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    if alpha:
        material.node_tree.links.new(albedo.outputs["Alpha"], shader.inputs["Alpha"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        elif hasattr(material, "blend_method"):
            material.blend_method = "CLIP"
        material.alpha_threshold = .42
    normal = image_node(nodes, texture_dir / f"{prefix}-normal.png", True)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = .48
    material.node_tree.links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    material.node_tree.links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    orm = image_node(nodes, texture_dir / f"{prefix}-orm.png", True)
    split = nodes.new("ShaderNodeSeparateColor")
    material.node_tree.links.new(orm.outputs["Color"], split.inputs["Color"])
    material.node_tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
    material.node_tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    return material


def solid_material(name: str, color: tuple[float, float, float, float], roughness: float = .96) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0
    return material


def build_materials(texture_dir: Path) -> dict[str, bpy.types.Material]:
    live = textured_material("vegetation.live", texture_dir, "foliage", alpha=True)
    branch = textured_material("vegetation.branch", texture_dir, "branch", alpha=False)
    dead_leaf = textured_material("vegetation.deadLeaf", texture_dir, "dead-leaf", alpha=True)
    return {
        "live": live,
        "blade": solid_material("vegetation.blade", (.085, .15, .075, 1)),
        "branch": branch,
        "stem": solid_material("vegetation.stem", (.105, .072, .042, 1)),
        "deadStem": solid_material("vegetation.deadStem", (.10, .075, .055, 1)),
        "deadLeaf": dead_leaf,
        "soil": solid_material("vegetation.soil", (.095, .072, .052, 1)),
        "stone": solid_material("vegetation.stone", (.30, .31, .29, 1), .88),
    }


def add_box(name: str, location: tuple[float, float, float], size: tuple[float, float, float], material: bpy.types.Material, bevel: float = 0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new(name="weathered edges", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def tapered_beam(name: str, start: tuple[float, float, float], end: tuple[float, float, float], radius_a: float, radius_b: float, material: bpy.types.Material, sides: int = 7) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius_a, radius2=radius_b, depth=delta.length, location=(a + b) * .5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)
    return obj


def leaf_cards(name: str, count: int, extent: tuple[float, float], material: bpy.types.Material, *, height: float = .018, upright: float = .08, seed: int = 0) -> bpy.types.Object:
    vertices, faces, uvs = [], [], []
    for index in range(count):
        hx = ((index * 37 + seed * 11) % 101) / 100
        hy = ((index * 61 + seed * 17) % 103) / 102
        x = (hx - .5) * extent[0]
        y = (hy - .5) * extent[1]
        angle = (index * 1.618 + seed * .37) % math.tau
        length = .13 + (index % 5) * .018
        width = .055 + (index % 3) * .012
        ux, uy = math.cos(angle) * length, math.sin(angle) * length
        vx, vy = -math.sin(angle) * width, math.cos(angle) * width
        z0 = height + (index % 4) * .002
        base = len(vertices)
        vertices.extend([
            (x - ux - vx, y - uy - vy, z0), (x + ux - vx, y + uy - vy, z0 + upright),
            (x + ux + vx, y + uy + vy, z0 + upright), (x - ux + vx, y - uy + vy, z0),
        ])
        faces.append((base, base + 1, base + 2, base + 3))
        uvs.extend([(0, 0), (1, 0), (1, 1), (0, 1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for offset, loop_index in enumerate(polygon.loop_indices):
            uv_layer.data[loop_index].uv = uvs[polygon.index * 4 + offset]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def grass_blades(name: str, count: int, material: bpy.types.Material, seed: int = 0) -> bpy.types.Object:
    vertices, faces, uvs = [], [], []
    for index in range(count):
        x = (((index * 31 + seed * 7) % 97) / 96 - .5) * 2.7
        y = (((index * 47 + seed * 13) % 89) / 88 - .5) * .75
        height = .20 + (index % 7) * .035
        width = .018 + (index % 3) * .006
        angle = (index * 2.19 + seed) % math.tau
        dx, dy = math.cos(angle) * width, math.sin(angle) * width
        base = len(vertices)
        vertices.extend([(x - dx, y - dy, 0), (x + dx, y + dy, 0), (x + dx * .18, y + dy * .18, height)])
        faces.append((base, base + 1, base + 2))
        uvs.extend([(0, 0), (1, 0), (.5, 1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for offset, loop_index in enumerate(polygon.loop_indices):
            uv_layer.data[loop_index].uv = uvs[polygon.index * 3 + offset]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def prepare_tree_source(source: dict, work_dir: Path) -> tuple[Path, dict]:
    blend = work_dir / "sources" / source["role"] / source["blend"]
    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    # The source blend contains the assembled LOD objects *and* their component
    # leaf collections. Joining every mesh duplicates the crown and makes the
    # fixed branch budget consume the whole target, leaving no alpha cards.
    # The assembled LOD0 is the authoritative source silhouette.
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name == "tree_small_02_LOD0"]
    if not mesh_objects:
        mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name.endswith("LOD0")]
    if not mesh_objects:
        raise RuntimeError("smallTree: no mesh objects")
    converted = []
    for obj in mesh_objects:
        if bpy.context.view_layer.objects.get(obj.name) is None:
            bpy.context.scene.collection.objects.link(obj)
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        select_only([obj])
        bpy.ops.object.convert(target="MESH")
        converted.append(bpy.context.view_layer.objects.active)
    select_only(converted)
    bpy.context.view_layer.objects.active = converted[0]
    if len(converted) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    leaf = bpy.data.materials.new("__tree_leaf__")
    branch = bpy.data.materials.new("__tree_branch__")
    for slot in obj.material_slots:
        slot.material = leaf if source_material_is_leaves(slot.material) else branch
    source_triangles = triangle_count(obj)
    cooked = apply_budget(obj, 7800, 19)
    centre_and_floor(obj, 4.6)
    obj.name = "tree_source"
    obj.data.name = obj.name
    tree_path = work_dir / "tree-source.glb"
    export_glb(tree_path, [obj])
    low, high = object_bounds(obj)
    return tree_path, {"sourceTriangles": source_triangles, "triangles": cooked, "bounds": {"min": low, "max": high}}


def import_gltf(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=True)
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def prepare_live_prototype(obj: bpy.types.Object, material: bpy.types.Material, cell: tuple[int, int], height: float, budget: int, seed: int) -> bpy.types.Object:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    select_only([obj])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for slot in obj.material_slots:
        slot.material = material
    if not obj.material_slots:
        obj.data.materials.append(material)
    transform_uvs(obj, {material.name}, cell)
    centre_and_floor(obj, height)
    apply_budget(obj, budget, seed)
    return obj


def hedge_mesh(name: str, shrub: bpy.types.Object, materials: dict[str, bpy.types.Material], variant: int, lod: int) -> bpy.types.Object:
    count = (8, 7, 6)[lod]
    parts = []
    for index in range(count):
        source_index = round(index * 7 / max(1, count - 1))
        part = duplicate(shrub)
        y = -5.15 + source_index * 1.47
        wave = math.sin((source_index + 1) * (1.41 + variant * .17))
        crown = 1.76 + math.sin(source_index * .83 + variant) * .17
        if variant == 1:
            crown = 1.55 + math.sin(source_index * .66) * .10
        if variant == 2:
            crown += .12 if source_index > 4 else -.08
        # Keep the crown inside the canonical two-metre gameplay footprint.
        # The source shrub is naturally much wider than it is tall, so only
        # its cross-run axis is compressed; the longitudinal overlap remains.
        part.scale = (.56 + (source_index % 3) * .025, 1.12, crown)
        part.location = (wave * .12, y, .40 if variant != 1 else .24)
        part.rotation_euler[2] = wave * .04
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(part)
    stem_step = (1.05, 1.55, 2.25)[lod]
    cursor = -5.0
    stem_index = 0
    while cursor <= 5.05:
        lean = math.sin(stem_index * 1.7 + variant) * .12
        parts.append(tapered_beam(f"{name}-stem", (lean * .2, cursor, .02), (lean, cursor + math.sin(stem_index) * .06, 1.12), .052, .025, materials["stem"], 6))
        cursor += stem_step
        stem_index += 1
    parts.append(add_box(f"{name}-soil", (0, 0, .025), (1.78, 10.95, .05), materials["soil"]))
    if lod < 2:
        parts.append(leaf_cards(f"{name}-fall", 24 if lod == 0 else 10, (1.58, 10.6), materials["deadLeaf"], height=.052, upright=.025, seed=variant + lod * 17))
    return join_parts(parts, name)


def laurel_mesh(name: str, shrub: bpy.types.Object, materials: dict[str, bpy.types.Material], lod: int) -> bpy.types.Object:
    placements = [(-.72, -.38, .96), (.58, -.28, 1.05), (-.18, .56, 1.12), (.68, .54, .92)]
    parts = []
    for index, (x, y, size) in enumerate(placements[: (4, 3, 2)[lod]]):
        part = duplicate(shrub)
        # This is a specimen clump, not another hedge run.  Its four crowns
        # fit the existing compact park footprint while retaining overlap.
        part.scale = (size * .58, size * .58, size * 1.64)
        part.location = (x, y, .25)
        part.rotation_euler[2] = index * .61
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(part)
    for index, (x, y, _) in enumerate(placements[: (4, 3, 2)[lod]]):
        parts.append(tapered_beam(f"{name}-stem", (x * .45, y * .45, .02), (x, y, 1.02), .06, .025, materials["stem"], 6))
    parts.append(leaf_cards(f"{name}-fall", (16, 8, 3)[lod], (2.7, 2.2), materials["deadLeaf"], seed=31 + lod))
    return join_parts(parts, name)


def tree_variant(name: str, source: bpy.types.Object, target: int, seed: int, shape: tuple[float, float, float]) -> bpy.types.Object:
    obj = duplicate(source, name)
    sx, sy, crown_shift = shape
    for vertex in obj.data.vertices:
        z = vertex.co.z
        height_weight = max(0.0, min(1.0, z / 4.6))
        vertex.co.x = vertex.co.x * sx + crown_shift * height_weight * height_weight
        vertex.co.y = vertex.co.y * sy + math.sin(z * 1.7 + seed) * .025 * height_weight
    obj.data.update()
    apply_budget(obj, target, seed)
    obj.name = name
    obj.data.name = name
    return obj


def plant_cluster(
    name: str,
    prototypes: list[bpy.types.Object],
    lod: int,
    seed: int,
    horizontal_scale: float = 1.0,
    vertical_scale: float = 1.0,
    spread_scale: float = 1.0,
) -> bpy.types.Object:
    counts = (4, 2, 1)
    parts = []
    for index in range(counts[lod]):
        part = duplicate(prototypes[(index + seed) % len(prototypes)])
        angle = (index * 2.21 + seed * .73) % math.tau
        part.location = (
            math.cos(angle) * (.34 + index * .11) * spread_scale,
            math.sin(angle) * (.22 + index * .08) * spread_scale,
            0,
        )
        part.rotation_euler[2] = angle + .41
        scale = .72 + ((index + seed) % 4) * .10
        part.scale = (
            scale * horizontal_scale,
            scale * horizontal_scale,
            scale * vertical_scale * (1.0 + (index % 2) * .14),
        )
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(part)
    return join_parts(parts, name)


def academic_planter(name: str, materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    parts = [
        add_box(f"{name}-base", (0, 0, .12), (3.92, 1.92, .24), materials["stone"], .045),
        add_box(f"{name}-west", (-1.82, 0, .42), (.28, 1.92, .60), materials["stone"], .04),
        add_box(f"{name}-east", (1.82, 0, .42), (.28, 1.92, .60), materials["stone"], .04),
        add_box(f"{name}-north", (0, -.82, .42), (3.42, .28, .60), materials["stone"], .04),
        add_box(f"{name}-south", (0, .82, .42), (3.42, .28, .60), materials["stone"], .04),
        add_box(f"{name}-soil", (0, 0, .64), (3.36, 1.36, .18), materials["soil"]),
        leaf_cards(f"{name}-leaves", 28, (3.18, 1.18), materials["deadLeaf"], height=.74, upright=.025, seed=73),
    ]
    return join_parts(parts, name)


def academic_tree(name: str, materials: dict[str, bpy.types.Material], lod: int, variant: int) -> bpy.types.Object:
    branch_counts = (10, 7, 4)[lod]
    parts = [tapered_beam(f"{name}-trunk", (0, 0, 0), (.08, -.03, 3.55), .17, .065, materials["deadStem"], 8 if lod == 0 else 6)]
    endpoints = [
        (-1.18, .13, 2.55), (1.32, -.08, 2.92), (-.82, -.32, 3.46), (.75, .30, 3.68),
        (-1.42, -.18, 3.02), (1.08, .22, 3.40), (-.42, .18, 3.88), (.40, -.20, 3.94),
        (-1.02, .34, 2.22), (.92, -.30, 2.42),
    ]
    for index, endpoint in enumerate(endpoints[:branch_counts]):
        side = -1 if index % 2 == 0 else 1
        start = (.04 * side, .01 * side, 1.62 + (index % 4) * .36)
        ex, ey, ez = endpoint
        ex = ex * (-1 if variant else 1) + math.sin(index + variant) * .08
        parts.append(tapered_beam(f"{name}-branch-{index}", start, (ex, ey, ez), .065, .018, materials["deadStem"], 6))
    if lod < 2:
        leaves = leaf_cards(f"{name}-leaves", 12 if lod == 0 else 5, (2.65, .65), materials["deadLeaf"], height=2.52, upright=.22, seed=variant * 19 + lod)
        leaves.rotation_euler[2] = .12 + variant * .31
        parts.append(leaves)
    return join_parts(parts, name)


def academic_litter(name: str, materials: dict[str, bpy.types.Material], lod: int, seed: int) -> bpy.types.Object:
    parts = [leaf_cards(f"{name}-cards", (54, 24, 8)[lod], (2.85, 1.72), materials["deadLeaf"], height=.016, upright=.035, seed=seed)]
    if lod < 2:
        parts.append(add_box(f"{name}-soil", (0, 0, .006), (2.72, 1.54, .012), materials["soil"]))
    return join_parts(parts, name)


def build_scene(manifest: dict, work_dir: Path, tree_path: Path) -> tuple[list[bpy.types.Object], dict]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = build_materials(work_dir / "textures")

    tree_objects = import_gltf(tree_path)
    tree_source = tree_objects[0]
    for slot in tree_source.material_slots:
        slot.material = materials["live"] if slot.material and slot.material.name.startswith("__tree_leaf__") else materials["branch"]
    transform_uvs(tree_source, {"vegetation.live"}, (0, 0))
    tree_source.name = "tree-prototype"

    source_prototypes: dict[str, list[bpy.types.Object]] = {}
    cell_by_role = {"shrub": (1, 0), "nettle": (0, 1), "weed": (1, 1)}
    source_by_role = {source["role"]: source for source in manifest["sources"]}
    for role in ("shrub", "nettle", "weed"):
        source = source_by_role[role]
        imported = import_gltf(work_dir / "sources" / role / source["primary"])
        prepared = []
        for index, obj in enumerate(imported):
            prepared.append(prepare_live_prototype(obj, materials["live"], cell_by_role[role], 1.0, 1500 if role == "shrub" else 520, index + len(role)))
        source_prototypes[role] = prepared

    outputs: list[bpy.types.Object] = []
    report = {"meshes": {}, "sourceVariants": {role: len(items) for role, items in source_prototypes.items()}}

    shrub_lods = []
    for lod, budget in enumerate((1450, 470, 115)):
        proto = duplicate(source_prototypes["shrub"][0], f"shrub-lod-{lod}")
        apply_budget(proto, budget, 101 + lod)
        shrub_lods.append(proto)
    for base, variant in (("yard_hedge_run", 0), ("yard_hedge_dense", 1), ("yard_hedge_corner", 2)):
        for lod in range(3):
            name = base if lod == 0 else f"{base}_lod{lod}"
            outputs.append(hedge_mesh(name, shrub_lods[lod], materials, variant, lod))
    for lod in range(3):
        name = "opening_park_laurel" if lod == 0 else f"opening_park_laurel_lod{lod}"
        outputs.append(laurel_mesh(name, shrub_lods[lod], materials, lod))

    for base, seed, shape in (
        ("opening_street_tree_small", 11, (.96, 1.03, -.06)),
        ("opening_street_tree_small_b", 23, (1.10, .88, .20)),
        ("opening_street_tree_small_c", 37, (.84, 1.05, -.22)),
    ):
        for lod, budget in enumerate((7600, 3400, 1050)):
            name = base if lod == 0 else f"{base}_lod{lod}"
            outputs.append(tree_variant(name, tree_source, budget, seed + lod * 17, shape))

    for base, role, seed, horizontal_scale, vertical_scale, spread_scale in (
        ("vegetation_nettle_cluster", "nettle", 5, 1.0, 1.0, 1.0),
        # Weed Plant 02 has a broad horizontal habit after height
        # normalisation; compress the cluster to its sparse kerb-edge role.
        ("vegetation_weed_cluster", "weed", 9, .32, .70, .38),
    ):
        for lod in range(3):
            name = base if lod == 0 else f"{base}_lod{lod}"
            outputs.append(plant_cluster(
                name,
                source_prototypes[role],
                lod,
                seed,
                horizontal_scale,
                vertical_scale,
                spread_scale,
            ))
    for lod, count in enumerate((48, 22, 8)):
        name = "vegetation_grass_edge" if lod == 0 else f"vegetation_grass_edge_lod{lod}"
        outputs.append(grass_blades(name, count, materials["blade"], 41 + lod))
    for lod, count in enumerate((42, 18, 6)):
        name = "vegetation_leaf_scatter" if lod == 0 else f"vegetation_leaf_scatter_lod{lod}"
        outputs.append(leaf_cards(name, count, (2.75, 1.28), materials["deadLeaf"], height=.012, upright=.028, seed=53 + lod))

    outputs.append(academic_planter("academic_planter", materials))
    for base, variant in (("academic_dead_tree", 0), ("academic_dead_tree_b", 1)):
        for lod in range(3):
            name = base if lod == 0 else f"{base}_lod{lod}"
            outputs.append(academic_tree(name, materials, lod, variant))
    for lod in range(3):
        name = "academic_leaf_litter" if lod == 0 else f"academic_leaf_litter_lod{lod}"
        outputs.append(academic_litter(name, materials, lod, 89 + lod))

    for obj in outputs:
        low, high = object_bounds(obj)
        report["meshes"][obj.name] = {"triangles": triangle_count(obj), "bounds": {"min": [round(v, 4) for v in low], "max": [round(v, 4) for v in high]}}
    return outputs, report


def main() -> None:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    work_dir = Path(args.work_dir)
    tree_source = next(source for source in manifest["sources"] if source["role"] == "smallTree")
    tree_path, tree_report = prepare_tree_source(tree_source, work_dir)
    outputs, report = build_scene(manifest, work_dir, tree_path)
    report["treeSource"] = tree_report
    export_glb(Path(args.output), outputs)
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(f"VEGETATION PACK: {args.output}")


if __name__ == "__main__":
    main()
