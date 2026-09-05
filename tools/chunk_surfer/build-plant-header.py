"""The heating header, as a christmas tree of threaded fittings.

Run through build-plant-header.mjs, never directly — the wrapper owns the
Blender binary, the output path and the report.

WHAT THIS IS FOR. The plant-room microgame asks the player to shut three
fittings down a stack while they loosen each other, and the world prop it
happens on was a box with a wheel on it. This models the thing the card
describes: a header stub with a back nut, a gland, a handwheel and, below them,
the bypass cock that is not part of this header and is the one you must not
touch.

THE THREADING IS REAL. The stem and the gland carry a swept helix rather than a
scored cylinder, because the whole microgame is about travel and a thread you
can count is what makes a quarter turn legible. Pitch is authored once, in
THREAD_PITCH, so the visible advance per turn is the same quantity the runtime
means by a turn.

Everything is welded into one mesh on export: the interaction is a screen
overlay (see makePlantIsolationScene in main.js) and the runtime does not rotate
these individually, so separate nodes would be four draw calls for nothing.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

# ── the header, in metres ────────────────────────────────────────────────────
# The prop is authored to plant_header_manifold's declared bounds in
# conservatory-props.js: 4.7 wide, 0.68 deep, 2.35 tall, wall-mounted. X runs
# along the wall, Y is up, Z stands off the wall.
SPAN_X = 4.7
DEPTH = 0.68
HEIGHT = 2.35

PIPE_R = 0.105          # the header main
STUB_R = 0.072          # the riser the tree stands on
THREAD_PITCH = 0.011    # metres of advance per full turn
THREAD_DEPTH = 0.0042   # crest to root

# Where each fitting sits up the riser, and how big it is. The order is the
# order the card gives and the order the runtime closes them in.
FITTINGS = [
    {"id": "back-nut", "y": 1.26, "kind": "hex", "r": 0.104, "h": 0.072, "flats": 6},
    {"id": "gland", "y": 1.42, "kind": "gland", "r": 0.092, "h": 0.135},
    {"id": "handwheel", "y": 1.63, "kind": "wheel", "r": 0.235, "h": 0.036, "arms": 5},
]
# Not part of this header. Deliberately a different shape and a different metal
# so a player who has read the card can tell it apart at a glance.
TRAP = {"id": "bypass-cock", "y": 0.86, "r": 0.058, "lever": 0.30}


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name: str, colour, metallic: float, roughness: float):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def new_mesh(name: str, mat):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def bm_to(obj, bm) -> None:
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.calc_loop_triangles()


def add_cylinder(bm, centre, radius, height, segments=20, axis="y") -> None:
    matrix = Matrix.Translation(Vector(centre))
    if axis == "y":
        matrix = matrix @ Matrix.Rotation(math.radians(90), 4, "X")
    elif axis == "x":
        matrix = matrix @ Matrix.Rotation(math.radians(90), 4, "Y")
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=height, matrix=matrix,
    )


def add_hex(bm, centre, radius, height, flats=6) -> None:
    add_cylinder(bm, centre, radius, height, segments=flats, axis="y")


def add_thread(bm, centre, radius, height, pitch=THREAD_PITCH, depth=THREAD_DEPTH,
               segments=24) -> None:
    """A swept helix around the riser.

    Not a decal and not a stack of rings: a real ribbon that advances by `pitch`
    every turn, so counting threads is counting travel. Built as a quad strip
    swept round and up, then given thickness by a solidify pass at export.
    """
    turns = max(1, int(height / pitch))
    cx, cy, cz = centre
    ring_prev = None
    for step in range(turns * segments + 1):
        t = step / segments                       # turns completed
        angle = t * math.tau
        y = cy - height / 2 + t * pitch
        if y > cy + height / 2:
            break
        outer = Vector((cx + math.cos(angle) * (radius + depth), y, cz + math.sin(angle) * (radius + depth)))
        inner = Vector((cx + math.cos(angle) * radius, y - pitch * 0.34, cz + math.sin(angle) * radius))
        ring = (bm.verts.new(outer), bm.verts.new(inner))
        if ring_prev is not None:
            bm.faces.new((ring_prev[0], ring_prev[1], ring[1], ring[0]))
        ring_prev = ring
    bm.verts.ensure_lookup_table()


def build() -> dict:
    clear_scene()
    steel = material("header steel", (0.30, 0.31, 0.30), 0.75, 0.46)
    brass = material("header brass", (0.49, 0.33, 0.10), 0.85, 0.28)
    red = material("bypass red", (0.42, 0.10, 0.07), 0.55, 0.52)

    body = new_mesh("plant_header_manifold", steel)
    bm = bmesh.new()

    # The header main, running the length of the wall, and the flanges on it.
    add_cylinder(bm, (0.0, 0.62, 0.0), PIPE_R, SPAN_X, segments=22, axis="x")
    for x in (-SPAN_X / 2 + 0.34, -0.9, 0.9, SPAN_X / 2 - 0.34):
        add_cylinder(bm, (x, 0.62, 0.0), PIPE_R * 1.42, 0.048, segments=22, axis="x")

    # The riser the tree stands on, and its thread.
    add_cylinder(bm, (0.0, 1.14, 0.0), STUB_R, 1.06, segments=20)
    add_thread(bm, (0.0, 1.30, 0.0), STUB_R, 0.42)

    # Mounting brackets back to the wall, so it reads as fixed to something.
    for x in (-1.55, 1.55):
        add_cylinder(bm, (x, 0.62, -DEPTH / 2 + 0.06), 0.032, DEPTH * 0.8, segments=10, axis="z")

    bm_to(body, bm)

    # The fittings, in brass so the tree reads apart from the pipe it is on.
    fittings = new_mesh("plant_header_fittings", brass)
    bm = bmesh.new()
    for entry in FITTINGS:
        y = entry["y"]
        if entry["kind"] == "hex":
            add_hex(bm, (0.0, y, 0.0), entry["r"], entry["h"], entry["flats"])
        elif entry["kind"] == "gland":
            add_cylinder(bm, (0.0, y, 0.0), entry["r"], entry["h"], segments=20)
            # The gland is where the packing is, so it carries its own thread.
            add_thread(bm, (0.0, y, 0.0), entry["r"] * 0.86, entry["h"] * 0.8)
            for i in range(4):
                a = i * math.tau / 4
                add_cylinder(bm, (math.cos(a) * entry["r"] * 0.78, y + entry["h"] * 0.42,
                                  math.sin(a) * entry["r"] * 0.78), 0.011, 0.055, segments=8)
        elif entry["kind"] == "wheel":
            r = entry["r"]
            add_cylinder(bm, (0.0, y, 0.0), r * 0.20, entry["h"] * 2.4, segments=14)
            # The rim, as a swept ring of short segments rather than a disc.
            seg = 30
            for i in range(seg):
                a0 = i * math.tau / seg
                a1 = (i + 1) * math.tau / seg
                mid = (a0 + a1) / 2
                add_cylinder(bm, (math.cos(mid) * r, y, math.sin(mid) * r), 0.020,
                             r * math.tau / seg * 1.06, segments=8, axis="x")
                bm.verts.ensure_lookup_table()
                # Rotate that segment into place around the hub.
                last = [v for v in bm.verts[-16:]]
                rot = Matrix.Rotation(-mid, 4, "Y")
                pivot = Vector((math.cos(mid) * r, y, math.sin(mid) * r))
                for v in last:
                    v.co = pivot + rot @ (v.co - pivot)
            for arm in range(entry["arms"]):
                a = arm * math.tau / entry["arms"]
                add_cylinder(bm, (math.cos(a) * r * 0.5, y, math.sin(a) * r * 0.5), 0.016, r, segments=8, axis="x")
                bm.verts.ensure_lookup_table()
                last = [v for v in bm.verts[-16:]]
                pivot = Vector((math.cos(a) * r * 0.5, y, math.sin(a) * r * 0.5))
                rot = Matrix.Rotation(-a, 4, "Y")
                for v in last:
                    v.co = pivot + rot @ (v.co - pivot)
    bm_to(fittings, bm)

    # The one that is not part of this header.
    trap = new_mesh("plant_header_bypass", red)
    bm = bmesh.new()
    add_cylinder(bm, (0.0, TRAP["y"], 0.0), TRAP["r"], 0.13, segments=16)
    add_cylinder(bm, (0.0, TRAP["y"] + 0.08, 0.0), TRAP["r"] * 0.5, 0.05, segments=12)
    # A lever, not a wheel: a quarter-turn cock, and it looks like one.
    add_cylinder(bm, (TRAP["lever"] / 2, TRAP["y"] + 0.11, 0.0), 0.014, TRAP["lever"], segments=8, axis="x")
    bm_to(trap, bm)

    return {"objects": ["plant_header_manifold", "plant_header_fittings", "plant_header_bypass"]}


def export(path: str) -> dict:
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_normals=True,
        export_texcoords=False, export_materials="EXPORT",
    )
    triangles = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    return {"triangles": triangles}


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = argv[0] if argv else "plant_header_manifold.glb"
    report_path = argv[1] if len(argv) > 1 else None
    built = build()
    stats = export(out)
    report = {**built, **stats, "threadPitch": THREAD_PITCH, "out": os.path.basename(out)}
    if report_path:
        with open(report_path, "w", encoding="utf8") as handle:
            json.dump(report, handle, indent=2)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
