"""Blender-side mesh and material builder for the opening Yorkshire street."""

from __future__ import annotations

import argparse
import bmesh
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(raw)


def select_only(objects: list[bpy.types.Object]) -> None:
    active = bpy.context.object
    if active and active.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except RuntimeError:
            pass
    for candidate in bpy.context.view_layer.objects:
        candidate.select_set(False)
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def object_bounds(obj: bpy.types.Object) -> tuple[list[float], list[float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return ([min(point[i] for point in points) for i in range(3)], [max(point[i] for point in points) for i in range(3)])


def export_glb(path: Path, selected: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=selected,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials="EXPORT", export_image_format="AUTO",
        export_animations=False, export_skins=False, export_morph=False,
        export_lights=False, export_cameras=False, export_extras=True,
    )


def image_node(nodes, image_path: Path, non_color: bool) -> bpy.types.ShaderNodeTexImage:
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(image_path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    node.interpolation = "Linear"
    node.extension = "REPEAT"
    return node


def material_for(source: dict, texture_dir: Path, suffix: str | None = None) -> bpy.types.Material:
    role = source["role"]
    stem = f"smallTree-{suffix}" if suffix else role
    alpha = bool(source.get("alphaCutoff") is not None and (role != "smallTree" or suffix == "leaves"))
    albedo_path = texture_dir / f"{stem}-albedo.{('png' if alpha else 'jpg')}"
    normal_path = texture_dir / f"{stem}-normal.png"
    orm_path = texture_dir / f"{stem}-orm.png"
    material = bpy.data.materials.new(f"openingStreet.{role}{'.' + suffix if suffix else ''}")
    material.use_nodes = True
    material.diffuse_color = (0.62, 0.62, 0.62, 1.0)
    material["openingStreetRole"] = role
    material["openingStreetAoStrength"] = float(source.get("aoStrength", 0))
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = float(source.get("roughnessFactor", 1))
    shader.inputs["Metallic"].default_value = float(source.get("metallicFactor", 0))
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    albedo = image_node(nodes, albedo_path, False)
    material.node_tree.links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    if alpha:
        material.node_tree.links.new(albedo.outputs["Alpha"], shader.inputs["Alpha"])
        try:
            material.surface_render_method = "DITHERED"
        except AttributeError:
            material.blend_method = "CLIP"
        material.alpha_threshold = float(source.get("alphaCutoff", 0.45))
    normal = image_node(nodes, normal_path, True)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = float(source.get("normalStrength", 1))
    material.node_tree.links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    material.node_tree.links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    orm = image_node(nodes, orm_path, True)
    split = nodes.new("ShaderNodeSeparateColor")
    material.node_tree.links.new(orm.outputs["Color"], split.inputs["Color"])
    material.node_tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
    material.node_tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    return material


class MeshBuilder:
    def __init__(self, name: str, materials: dict[str, bpy.types.Material], sources: dict[str, dict]):
        self.name = name
        self.materials = materials
        self.sources = sources
        self.vertices: list[tuple[float, float, float]] = []
        self.faces: list[list[int]] = []
        self.face_uvs: list[list[tuple[float, float]]] = []
        self.face_roles: list[str] = []
        self.material_areas: dict[str, float] = {}

    def add_quad(self, role: str, points: list[tuple[float, float, float]], uvs: list[tuple[float, float]] | None = None) -> None:
        start = len(self.vertices)
        # Receiver recipes use the runtime's Y-up coordinates. Blender is
        # Z-up, and its glTF exporter maps (x, y, z) to (x, z, -y), so feed it
        # (x, -z, y) to preserve the authored runtime axes in the GLB.
        self.vertices.extend((x, -z, y) for x, y, z in points)
        self.faces.append([start, start + 1, start + 2, start + 3])
        if uvs is None:
            tile = float(self.sources[role].get("metresPerTile", 1))
            normal = (Vector(points[1]) - Vector(points[0])).cross(Vector(points[2]) - Vector(points[0]))
            if abs(normal.y) >= max(abs(normal.x), abs(normal.z)):
                uvs = [(point[0] / tile, point[2] / tile) for point in points]
            elif abs(normal.x) >= abs(normal.z):
                uvs = [(point[2] / tile, point[1] / tile) for point in points]
            else:
                uvs = [(point[0] / tile, point[1] / tile) for point in points]
        self.face_uvs.append(uvs)
        self.face_roles.append(role)
        a, b, c = Vector(points[0]), Vector(points[1]), Vector(points[2])
        d = Vector(points[3])
        area = (b - a).cross(c - a).length * .5 + (c - a).cross(d - a).length * .5
        self.material_areas[role] = self.material_areas.get(role, 0.0) + area

    def horizontal(self, role: str, cx: float, cz: float, width: float, depth: float, y: float) -> None:
        x0, x1, z0, z1 = cx - width / 2, cx + width / 2, cz - depth / 2, cz + depth / 2
        # Counter-clockwise from above: exported normals must face +Y. The old
        # order faced every road, verge and sheet roof downward, so the actual
        # renderer lit them as undersides even though their bounds were correct.
        self.add_quad(role, [(x0, y, z0), (x0, y, z1), (x1, y, z1), (x1, y, z0)])

    def wall_x(self, role: str, x: float, z0: float, z1: float, y0: float, y1: float) -> None:
        self.add_quad(role, [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)])

    def wall_z(self, role: str, z: float, x0: float, x1: float, y0: float, y1: float) -> None:
        self.add_quad(role, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)])

    def review_wall_z(self, role: str, z: float, x0: float, x1: float, y0: float, y1: float) -> None:
        # The review camera stands on the -Z side before the diagnostic instance
        # is rotated into view. Face these unplaced plates toward it; gameplay
        # receiver winding remains owned by wall_x/wall_z above.
        self.add_quad(role, [(x1, y0, z), (x0, y0, z), (x0, y1, z), (x1, y1, z)])

    def box(self, role: str, center: tuple[float, float, float], size: tuple[float, float, float]) -> None:
        cx, cy, cz = center
        sx, sy, sz = (value / 2 for value in size)
        x0, x1, y0, y1, z0, z1 = cx - sx, cx + sx, cy - sy, cy + sy, cz - sz, cz + sz
        self.add_quad(role, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)])
        self.add_quad(role, [(x1, y0, z1), (x0, y0, z1), (x0, y1, z1), (x1, y1, z1)])
        self.add_quad(role, [(x0, y0, z1), (x0, y0, z0), (x0, y1, z0), (x0, y1, z1)])
        self.add_quad(role, [(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)])
        self.add_quad(role, [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)])
        self.add_quad(role, [(x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0)])

    def finish(self) -> tuple[bpy.types.Object, dict[str, float]]:
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.materials.clear()
        roles = list(dict.fromkeys(self.face_roles))
        for role in roles:
            mesh.materials.append(self.materials[role])
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon, role, uvs in zip(mesh.polygons, self.face_roles, self.face_uvs):
            polygon.material_index = roles.index(role)
            for loop_index, uv in zip(polygon.loop_indices, uvs):
                uv_layer.data[loop_index].uv = uv
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj, {role: round(area, 4) for role, area in self.material_areas.items()}


def build_receivers(materials: dict[str, bpy.types.Material], sources: dict[str, dict]) -> tuple[list[bpy.types.Object], dict[str, dict[str, float]]]:
    reports: dict[str, dict[str, float]] = {}
    objects: list[bpy.types.Object] = []

    ground = MeshBuilder("opening_street_ground", materials, sources)
    # The carriageway remains the dominant first read, but the previously blank
    # north apron is now a small municipal park. Its cross paths use the same
    # ordinary asphalt as the street; four separated grass panels make the park
    # legible without turning the opening into a meadow.
    ground.horizontal("asphalt", 0, 2.0, 44.0, 11.0, .035)
    ground.horizontal("asphalt", 11.0, -8.25, 1.6, 7.5, .045)
    ground.horizontal("asphalt", 7.1, -8.25, 6.2, 1.4, .045)
    ground.horizontal("asphalt", 14.9, -8.25, 6.2, 1.4, .045)
    ground.horizontal("cobbles", 22.0, 13.5, 4.0, 9.0, .045)
    for x in (7.1, 14.9):
        for z in (-10.475, -6.025):
            ground.horizontal("grass", x, z, 6.2, 3.05, .04)
    ground.horizontal("grass", 23.9, 8.25, 1.2, 2.2, .04)
    ground.horizontal("grass", 24.0, 19.25, 1.0, 2.0, .04)
    obj, report = ground.finish(); objects.append(obj); reports[obj.name] = report

    frontage = MeshBuilder("opening_street_frontage", materials, sources)
    # The canonical entrance is the three-metre goods pair at world y 8.5..11.5
    # (local z 1..4). The old personnel leaf at y 7 has been retired into wall;
    # carrying the former 7.6m mouth through this skin made the loading-dock face
    # literally transparent because exterior slices intentionally omit interior
    # collision mass. These opaque receivers now close every part of the façade
    # except the one real double-door aperture.
    frontage.wall_x("roughStone", -.24, -7.5, 1.0, .04, .98)
    frontage.wall_x("roughStone", -.24, 4.0, 84.5, .04, .98)
    frontage.wall_x("brick", -.25, -4.0, 1.0, .98, 5.55)
    frontage.wall_x("brick", -.25, 1.0, 4.0, 3.42, 5.55)
    frontage.wall_x("weatheredRender", -.26, 5.0, 12.0, 1.02, 5.45)
    frontage.wall_x("weatheredRender", -.26, 72.0, 76.0, 1.02, 4.05)
    frontage.wall_x("brick", -.27, 44.5, 64.5, 1.02, 8.45)
    obj, report = frontage.finish(); objects.append(obj); reports[obj.name] = report

    service = MeshBuilder("opening_street_service_history", materials, sources)
    # The underlying 1888 stable range already supplies the rear brick mass.
    # Keep the imported brick role on the frontage only so one semantic material
    # does not create a duplicate gameplay draw across composite meshes.
    service.wall_x("corrugatedIron", -4.12, 11.0, 21.0, .12, 6.0)
    service.horizontal("corrugatedIron", 0.0, 16.0, 8.2, 10.2, 6.08)
    service.wall_z("rustyPaintedMetal", 27.0, -4.8, 1.4, .10, 3.25)
    service.box("rustyMetal03", (-5.35, .78, 7.1), (1.15, 1.5, .42))
    service.box("rustyMetal04", (-4.6, .10, 8.6), (1.1, .16, .85))
    for z in (26.15, 27.85):
        service.box("rustyMetal04", (-4.65, 1.55, z), (.16, 3.0, .16))
    service.wall_x("modernCladding", -2.12, 52.5, 65.5, .16, 5.82)
    service.horizontal("boxProfile", 4.0, 59.0, 12.0, 13.0, 6.42)
    obj, report = service.finish(); objects.append(obj); reports[obj.name] = report

    review = MeshBuilder("opening_street_review_plate", materials, sources)
    for index, role in enumerate(("asphalt", "cobbles", "grass")):
        review.horizontal(role, -5.0 + index * 5.0, 0.0, 4.0, 3.0, .04)
    for index, role in enumerate(("roughStone", "brick", "weatheredRender", "modernCladding")):
        x = -7.5 + index * 5.0
        review.review_wall_z(role, 4.0, x, x + 4.0, .05, 3.05)
    for index, role in enumerate(("corrugatedIron", "boxProfile", "rustyPaintedMetal", "rustyMetal03", "rustyMetal04")):
        x = -10.0 + index * 5.0
        review.review_wall_z(role, 8.0, x, x + 4.0, .05, 3.05)
    obj, report = review.finish(); objects.append(obj); reports[obj.name] = report
    return objects, reports


def source_material_is_leaves(material: bpy.types.Material | None) -> bool:
    if not material:
        return False
    if "leaf" in material.name.lower() or "leaves" in material.name.lower():
        return True
    if material.use_nodes and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                key = f"{node.image.name} {node.image.filepath}".lower()
                if "leaf" in key or "leaves" in key or "alpha" in key:
                    return True
    return False


def thin_leaf_faces(obj: bpy.types.Object, budget: int) -> int:
    """Deterministically remove whole leaf-card face pairs when collapse stalls.

    The source canopy is millions of disconnected alpha cards. A collapse
    modifier reaches the card boundaries and then cannot reduce further; keeping
    a stable subset preserves the authored canopy/UVs without shipping every
    duplicate leaf plane.
    """
    leaf_slots = {
        index for index, slot in enumerate(obj.material_slots)
        if slot.material and slot.material.name.endswith(".leaves")
    }
    if not leaf_slots:
        return triangle_count(obj)
    mesh = obj.data
    bm = bmesh.new(); bm.from_mesh(mesh); bm.faces.ensure_lookup_table()
    leaf_faces = [face for face in bm.faces if face.material_index in leaf_slots]
    branch_triangles = sum(max(1, len(face.verts) - 2) for face in bm.faces if face.material_index not in leaf_slots)
    leaf_triangles = sum(max(1, len(face.verts) - 2) for face in leaf_faces)
    target_leaf = max(0, budget - branch_triangles)
    if leaf_triangles <= target_leaf:
        bm.free(); return branch_triangles + leaf_triangles
    keep_ratio = max(0.0, min(1.0, target_leaf / max(1, leaf_triangles)))
    discard = []
    ordered = sorted(leaf_faces, key=lambda face: face.index)
    for pair_index in range(0, len(ordered), 2):
        pair = ordered[pair_index:pair_index + 2]
        # Knuth multiplicative hashing gives a stable spatially-unbiased subset
        # without relying on Python's process-randomised hash().
        sample = (((pair_index // 2 + 1) * 2654435761) & 0xffffffff) / 0xffffffff
        if sample > keep_ratio:
            discard.extend(pair)
    bmesh.ops.delete(bm, geom=discard, context="FACES")
    bm.to_mesh(mesh); bm.free(); mesh.update()
    return triangle_count(obj)


def prepare_tree(source: dict, work_dir: Path, texture_dir: Path) -> tuple[Path, dict]:
    blend = work_dir / "sources" / source["role"] / source["blend"]
    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("smallTree: no mesh objects")
    converted: list[bpy.types.Object] = []
    for obj in mesh_objects:
        if bpy.context.view_layer.objects.get(obj.name) is None:
            bpy.context.scene.collection.objects.link(obj)
        world = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world = world
        select_only([obj]); bpy.ops.object.convert(target="MESH"); converted.append(bpy.context.view_layer.objects.active)
    select_only(converted); bpy.context.view_layer.objects.active = converted[0]
    if len(converted) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = "opening_street_tree_small"; obj.data.name = obj.name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    branch = material_for(source, texture_dir, "branch")
    leaves = material_for(source, texture_dir, "leaves")
    for slot in obj.material_slots:
        slot.material = leaves if source_material_is_leaves(slot.material) else branch
    if not obj.material_slots:
        obj.data.materials.append(branch)
    source_triangles = triangle_count(obj)
    budget = int(source["triangleBudget"])
    current = source_triangles
    attempts = 0
    while current > budget and attempts < 4:
        modifier = obj.modifiers.new(name=f"Opening street tree budget {attempts + 1}", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(.001, min(.999, budget / current * .92))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        current = triangle_count(obj)
        attempts += 1
    if current > budget:
        current = thin_leaf_faces(obj, budget)
    if current > budget:
        raise RuntimeError(f"smallTree: {current} triangles remains above {budget}")
    low, high = object_bounds(obj)
    height = max(1e-6, high[2] - low[2])
    scale = float(source["targetHeight"]) / height
    obj.scale = (scale, scale, scale); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    low, high = object_bounds(obj)
    shift = (-(low[0] + high[0]) * .5, -(low[1] + high[1]) * .5, -low[2])
    obj.data.transform(Matrix.Translation(shift)); obj.data.update()
    low, high = object_bounds(obj)
    select_only([obj])
    tree_path = work_dir / "opening-street-tree.glb"
    export_glb(tree_path, selected=True)
    return tree_path, {
        "sourceTriangles": source_triangles,
        "triangles": triangle_count(obj),
        "budget": budget,
        "bounds": {"min": [round(float(v), 5) for v in low], "max": [round(float(v), 5) for v in high]},
    }


def main() -> None:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    sources = {entry["role"]: entry for entry in manifest["sources"]}
    work_dir, texture_dir = Path(args.work_dir), Path(args.work_dir) / "textures"
    tree_path, tree_report = prepare_tree(sources["smallTree"], work_dir, texture_dir)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = {role: material_for(source, texture_dir) for role, source in sources.items() if role != "smallTree"}
    receivers, material_areas = build_receivers(materials, sources)
    bpy.ops.import_scene.gltf(filepath=str(tree_path), import_pack_images=True)
    trees = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name.startswith("opening_street_tree_small")]
    if not trees:
        raise RuntimeError("tree re-import produced no mesh")
    tree = trees[0]; tree.name = "opening_street_tree_small"; tree.data.name = tree.name
    all_objects = receivers + [tree]
    select_only(all_objects)
    export_glb(Path(args.output), selected=True)
    Path(args.report).write_text(json.dumps({"materialAreas": material_areas, "tree": tree_report}, indent=2) + "\n")
    print(f"OPENING STREET PACK: {args.output}")


if __name__ == "__main__":
    main()
