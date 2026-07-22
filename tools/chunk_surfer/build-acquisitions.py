"""Blender-side builder for the conservatory acquisition prop pack.

The checked-in Node wrapper verifies and sanitises the resulting GLB. This
script owns the operations that need Blender: opening the supplied .blend
archives, applying modifiers, reducing geometry, resizing source textures, and
normalising model anchors before combining the thirteen assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import zipfile

import bpy
from mathutils import Matrix


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            target = (destination / item.filename).resolve()
            if target != root and root not in target.parents:
                raise RuntimeError(f"unsafe archive member: {item.filename}")
        bundle.extractall(destination)


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
    corners = [obj.matrix_world @ type(obj.location)(corner) for corner in obj.bound_box]
    low = [min(point[axis] for point in corners) for axis in range(3)]
    high = [max(point[axis] for point in corners) for axis in range(3)]
    return low, high


def clear_emission() -> None:
    for material in bpy.data.materials:
        if not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            for name in ("Emission Color", "Emission"):
                socket = node.inputs.get(name)
                if socket and hasattr(socket, "default_value"):
                    socket.default_value = (0.0, 0.0, 0.0, 1.0)
            strength = node.inputs.get("Emission Strength")
            if strength:
                strength.default_value = 0.0


def clean_image_name(name: str) -> str:
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-.")
    return stem or "texture"


def resize_images(asset: dict, obj: bpy.types.Object, destination: Path) -> list[dict]:
    destination.mkdir(parents=True, exist_ok=True)
    limit = int(asset["textureSize"])
    report: list[dict] = []
    used_names: set[str] = set()
    bpy.context.scene.render.image_settings.quality = 82

    referenced: set[bpy.types.Image] = set()
    for slot in obj.material_slots:
        material = slot.material
        if not material or not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                referenced.add(node.image)

    for image in referenced:
        if image.name in {"Render Result", "Viewer Node"} or image.source not in {"FILE", "GENERATED"}:
            continue
        try:
            if not image.has_data:
                image.reload()
        except (RuntimeError, OSError):
            continue
        width, height = (int(image.size[0]), int(image.size[1]))
        if width <= 0 or height <= 0:
            continue
        scale = min(1.0, limit / max(width, height))
        out_width = max(1, round(width * scale))
        out_height = max(1, round(height * scale))
        if (out_width, out_height) != (width, height):
            image.scale(out_width, out_height)

        key = f"{image.name} {image.filepath}".lower()
        alpha_texture = any(token in key for token in ("alpha", "opacity", "mask", "glass"))
        # Normal maps are the dominant transfer cost when encoded as noisy PNG
        # data (a single 1024 map can exceed 4 MiB). High-quality JPEG remains
        # eight-bit RGB, which is exactly what this runtime samples; masks and
        # scalar material channels stay lossless.
        data_texture = any(token in key for token in ("rough", "metal", "mask", "alpha", "opacity"))
        extension = ".png" if data_texture or alpha_texture else ".jpg"
        base = clean_image_name(Path(image.filepath or image.name).stem)
        candidate = base
        suffix = 2
        while candidate.lower() in used_names:
            candidate = f"{base}-{suffix}"
            suffix += 1
        used_names.add(candidate.lower())
        output = destination / f"{candidate}{extension}"

        image.filepath_raw = str(output)
        image.file_format = "PNG" if extension == ".png" else "JPEG"
        image.save()
        report.append(
            {
                "name": image.name,
                "width": out_width,
                "height": out_height,
                "format": image.file_format,
            }
        )
    return report


def apply_decimation(obj: bpy.types.Object, budget: int) -> tuple[int, int]:
    source = triangle_count(obj)
    current = source
    attempts = 0
    while current > budget and attempts < 3:
        ratio = max(0.02, min(0.999, (budget / current) * 0.98))
        modifier = obj.modifiers.new(name=f"Acquisition budget {attempts + 1}", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        current = triangle_count(obj)
        attempts += 1
    return source, current


def normalise_object(obj: bpy.types.Object, asset: dict) -> tuple[list[float], list[float]]:
    yaw = math.radians(float(asset.get("yawDegrees", 0)))
    if yaw:
        obj.rotation_euler.z += yaw
    select_only([obj])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    low, high = object_bounds(obj)
    height = max(1e-6, high[2] - low[2])
    scale = float(asset["targetHeight"]) / height
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    low, high = object_bounds(obj)
    centre_x = (low[0] + high[0]) * 0.5
    centre_y = (low[1] + high[1]) * 0.5
    centre_z = (low[2] + high[2]) * 0.5
    anchor = asset["anchor"]
    shift_x = -centre_x
    shift_y = -centre_y
    shift_z = -low[2]
    if anchor == "ceiling":
        shift_z = -high[2]
    elif anchor == "wall":
        shift_z = -centre_z
        shift_y = -high[1] if asset.get("wallBackAxis", "positiveY") == "positiveY" else -low[1]
    obj.data.transform(Matrix.Translation((shift_x, shift_y, shift_z)))
    obj.data.update()
    return object_bounds(obj)


def export_glb(path: Path, selected: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=selected,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
    )


def prepare_asset(asset: dict, archive: Path, root: Path) -> tuple[Path, dict]:
    extracted = root / "source"
    safe_extract(archive, extracted)
    blend = extracted / asset["blend"]
    if not blend.is_file():
        raise RuntimeError(f"{asset['mesh']}: missing {asset['blend']} in {archive.name}")

    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"{asset['mesh']}: no mesh objects")
    # Some Poly Haven files keep component collections excluded in the saved
    # view layer. Link those same datablocks at the scene root so headless
    # conversion can select them without changing their world transform.
    for obj in mesh_objects:
        if bpy.context.view_layer.objects.get(obj.name) is None:
            bpy.context.scene.collection.objects.link(obj)
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world

    # Convert each object separately so evaluated modifiers survive the join.
    converted: list[bpy.types.Object] = []
    for obj in mesh_objects:
        select_only([obj])
        bpy.ops.object.convert(target="MESH")
        converted.append(bpy.context.view_layer.objects.active)
    select_only(converted)
    bpy.context.view_layer.objects.active = converted[0]
    if len(converted) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = asset["mesh"]
    obj.data.name = asset["mesh"]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    source_triangles, triangles = apply_decimation(obj, int(asset["triangleBudget"]))
    low, high = normalise_object(obj, asset)
    clear_emission()
    images = resize_images(asset, obj, root / "textures")
    select_only([obj])
    model_glb = root / f"{asset['mesh']}.glb"
    export_glb(model_glb)
    return model_glb, {
        "mesh": asset["mesh"],
        "archive": asset["archive"],
        "sourceTriangles": source_triangles,
        "triangles": triangles,
        "triangleBudget": int(asset["triangleBudget"]),
        "bounds": {
            "min": [round(float(value), 6) for value in low],
            "max": [round(float(value), 6) for value in high],
        },
        "anchor": asset["anchor"],
        "textures": images,
    }


def combine_assets(models: list[tuple[dict, Path]], output: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    combined: list[bpy.types.Object] = []
    for asset, model_path in models:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(model_path), import_pack_images=True)
        imported = [obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH"]
        if not imported:
            raise RuntimeError(f"{asset['mesh']}: individual GLB re-import produced no mesh")
        if len(imported) > 1:
            select_only(imported)
            bpy.context.view_layer.objects.active = imported[0]
            bpy.ops.object.join()
            imported = [bpy.context.view_layer.objects.active]
        obj = imported[0]
        obj.name = asset["mesh"]
        obj.data.name = asset["mesh"]
        combined.append(obj)
    select_only(combined)
    export_glb(output)


def main() -> None:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    source_dir = Path(args.source_dir)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    prepared: list[tuple[dict, Path]] = []
    report: list[dict] = []

    for asset in manifest["sources"]:
        archive = source_dir / asset["archive"]
        if not archive.is_file():
            raise RuntimeError(f"missing acquisition archive: {archive}")
        actual = sha256(archive)
        if actual != asset["sha256"]:
            raise RuntimeError(f"{archive.name}: sha256 {actual} != manifest {asset['sha256']}")
        asset_root = work_dir / asset["mesh"]
        model_glb, details = prepare_asset(asset, archive, asset_root)
        prepared.append((asset, model_glb))
        report.append(details)
        print(f"ACQUISITION {asset['mesh']}: {details['sourceTriangles']} -> {details['triangles']} triangles")

    combine_assets(prepared, Path(args.output))
    Path(args.report).write_text(json.dumps({"meshes": report}, indent=2) + "\n")
    print(f"ACQUISITION PACK: {args.output}")


if __name__ == "__main__":
    main()
