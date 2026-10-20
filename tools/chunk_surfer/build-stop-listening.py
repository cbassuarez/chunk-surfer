"""Blender-side builder for the ear room (data/stop-listening.js).

Everything in the pack is made here, in Blender, from nothing but this file and
the vendored fonts: the ears, the heaps they are piled in, the paint on the
walls, and the take sheet, whose reading image is rendered in the same pass as
the mesh that carries it, so the sheet on the floor and the sheet in his hands
are one picture.

Modelled in Blender's own Z-up frame and exported +Y up, so runtime (x, y, z) is
Blender (x, z, -y). Every object is applied to identity before export; the Node
wrapper (build-stop-listening.mjs) enforces that and the runtime's glTF subset.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / 'assets' / 'fonts'
CM = 0.01
MM = 0.001


def parse_args():
    raw = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--output', required=True)
    p.add_argument('--report', required=True)
    p.add_argument('--sheet', required=True)
    p.add_argument('--work', required=True)
    p.add_argument('--blend', default='')
    return p.parse_args(raw)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h, a=1.0):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


def link(obj, scene=None):
    (scene or bpy.context.scene).collection.objects.link(obj)
    return obj


def material(name, rgba, roughness, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    m.diffuse_color = rgba
    return m


def evaluated_mesh(obj, name):
    deps = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(deps), preserve_all_data_layers=False, depsgraph=deps)
    mesh.name = name
    return mesh


def flip(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()


def tri_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def remove(obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0:
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)


# ── materials ────────────────────────────────────────────────────────────────
# Wet: every surface in this room is glossy. The display reserves red for the
# emergency circuit, so the wound and the floor stain will come out as dark
# glossy grey, not red; they are authored red anyway, because that is what they
# are, and because the torch's warmth survives where a reservation does not bite.
MAT = {}


def make_materials():
    MAT['skin'] = material('stop listening ear skin', hex_linear('#D8BBA9'), 0.30)
    MAT['deep'] = material('stop listening ear deep', hex_linear('#A06A5E'), 0.26)
    MAT['wound'] = material('stop listening ear wound', hex_linear('#4A0F0C'), 0.16)
    MAT['wet'] = material('stop listening floor wet', hex_linear('#24120F'), 0.05)
    MAT['paint_dark'] = material('stop listening paint dark', hex_linear('#2B0E0B'), 0.14)
    MAT['paint_pale'] = material('stop listening paint pale', hex_linear('#C9BFA6'), 0.20)


# ── the ear ──────────────────────────────────────────────────────────────────
# A right ear seen from the side, anterior toward -x, in centimetres. Lying face
# up means its lateral surface faces +Z, which is how every one of them lies:
# turned up, open to the room.
EAR_OUTLINE = [(-1.0, 4.2), (-0.6, 5.4), (0.2, 6.1), (1.2, 6.2), (2.0, 5.7), (2.5, 4.8), (2.6, 3.6),
               (2.4, 2.4), (2.0, 1.4), (1.4, 0.6), (0.7, 0.1), (0.0, 0.0), (-0.5, 0.4), (-0.7, 1.1),
               (-0.9, 1.8), (-1.2, 2.5), (-1.2, 3.4)]
HELIX = [(-0.9, 3.9), (-0.75, 4.9), (-0.2, 5.65), (0.6, 5.95), (1.4, 5.85), (2.05, 5.3), (2.35, 4.5),
         (2.4, 3.5), (2.2, 2.5), (1.85, 1.6), (1.45, 1.0)]
ANTIHELIX = [(0.75, 1.55), (1.2, 2.4), (1.5, 3.3), (1.45, 4.1), (1.15, 4.85)]
INFERIOR_CRUS = [(1.45, 3.6), (0.9, 4.05), (0.25, 4.25), (-0.25, 4.2)]
HELIX_CRUS = [(-0.75, 3.9), (-0.2, 3.62), (0.3, 3.45)]


def plate_object(outline, thickness):
    bm = bmesh.new()
    verts = [bm.verts.new((x * CM, y * CM, 0.0)) for x, y in outline]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    if face.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=[face])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, thickness * CM))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('ear-plate')
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new('ear-plate', mesh))


def ellipsoid(center, radii, segments=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=tuple(r * CM for r in radii), verts=bm.verts)
    bmesh.ops.translate(bm, vec=tuple(c * CM for c in center), verts=bm.verts)
    mesh = bpy.data.meshes.new('ear-part')
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new('ear-part', mesh))


def tube(points, z, radius, radii=None, sides=2):
    curve = bpy.data.curves.new('ear-tube', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius * CM
    curve.bevel_resolution = sides
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for i, (x, y) in enumerate(points):
        spline.points[i].co = (x * CM, y * CM, z * CM, 1)
        spline.points[i].radius = radii[i] if radii else 1.0
    obj = link(bpy.data.objects.new('ear-tube', curve))
    mesh = evaluated_mesh(obj, 'ear-tube-mesh')
    remove(obj)
    return link(bpy.data.objects.new('ear-tube', mesh))


def cylinder(center, radius, depth):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=radius * CM, radius2=radius * CM, depth=depth * CM)
    bmesh.ops.translate(bm, vec=tuple(c * CM for c in center), verts=bm.verts)
    mesh = bpy.data.meshes.new('ear-cutter')
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new('ear-cutter', mesh))


def join(objects, name):
    bm = bmesh.new()
    for obj in objects:
        part = bmesh.new()
        part.from_mesh(obj.data)
        part.transform(obj.matrix_world)
        tmp = bpy.data.meshes.new('tmp')
        part.to_mesh(tmp)
        part.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def build_ear(name, p, target_tris):
    """One ear, fused from cartilage parts by a voxel remesh, then decimated."""
    rnd = random.Random(name)
    sx, sy = p['width'], p['height']
    outline = [(x * sx, y * sy) for x, y in EAR_OUTLINE]
    plate = plate_object(outline, 0.5)
    concha = ellipsoid((0.25 * sx, 2.6 * sy, 0.62), (1.0 * sx, 1.25 * sy, 0.55))
    canal = cylinder((-0.25 * sx, 2.35 * sy, 0.4), 0.22, 2.0)
    for cutter in (concha, canal):
        mod = plate.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
    carved = link(bpy.data.objects.new('ear-carved', evaluated_mesh(plate, 'ear-carved')))
    for obj in (plate, concha, canal):
        remove(obj)
    s = lambda pts: [(x * sx, y * sy) for x, y in pts]
    curl = p['curl']
    parts = [
        carved,
        tube(s(HELIX), 0.45, 0.33 * curl, radii=[.55, .85, 1, 1, 1, 1, 1, .95, .9, .85, .75]),
        tube(s(ANTIHELIX), 0.42, 0.26),
        tube(s(INFERIOR_CRUS), 0.40, 0.21, radii=[1, .95, .8, .6]),
        tube(s(HELIX_CRUS), 0.40, 0.22, radii=[1, .8, .5]),
        ellipsoid((-0.85 * sx, 2.15 * sy, 0.55), (0.42, 0.62, 0.35)),            # tragus
        ellipsoid((0.35 * sx, 1.35 * sy, 0.50), (0.45, 0.32, 0.30)),             # antitragus
        ellipsoid((0.55 * sx, 0.7 * sy, 0.25), (0.9 * p['lobe'], 0.8 * p['lobe'], 0.32)),  # lobe
    ]
    fused = join(parts, 'ear-fused')
    for obj in parts:
        remove(obj)
    rm = fused.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.00055
    rm.adaptivity = 0
    sm = fused.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.55
    sm.iterations = 5
    tex = bpy.data.textures.new(f'{name}-flesh', 'CLOUDS')
    tex.noise_scale = 0.006
    tex.noise_depth = 2
    dp = fused.modifiers.new('flesh', 'DISPLACE')
    dp.texture = tex
    dp.texture_coords = 'LOCAL'
    dp.strength = 0.0005
    dp.mid_level = 0.5
    dense = evaluated_mesh(fused, 'ear-dense')
    remove(fused)
    bpy.data.textures.remove(tex)

    # Materials by where the face is on the ear, decided on the dense surface so
    # the decimation keeps the borders smooth: the anterior edge is where it was
    # cut from the head, and the bowl is deep.
    for m in (MAT['skin'], MAT['deep'], MAT['wound']):
        dense.materials.append(m)
    cx, cy = 0.25 * sx * CM, 2.6 * sy * CM
    for poly in dense.polygons:
        c = poly.center
        bowl = ((c.x - cx) / (1.0 * sx * CM)) ** 2 + ((c.y - cy) / (1.25 * sy * CM)) ** 2
        if c.x < -0.95 * sx * CM and 0.9 * sy * CM < c.y < 4.4 * sy * CM:
            poly.material_index = 2
        elif bowl < 0.72 and c.z < 0.40 * CM:
            poly.material_index = 1
        else:
            poly.material_index = 0
        poly.use_smooth = True
    holder = link(bpy.data.objects.new('ear-dense', dense))
    dec = holder.modifiers.new('budget', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = min(1.0, target_tris / max(1, tri_count(dense)))
    mesh = evaluated_mesh(holder, name)
    remove(holder)
    for poly in mesh.polygons:
        poly.use_smooth = True

    # Centre on the footprint, then the variant's own pose.
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    mesh.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, 0)))
    if p['mirror']:
        mesh.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        flip(mesh)
    if p['tilt']:
        mesh.transform(Matrix.Rotation(math.radians(p['tilt']), 4, 'Y'))
    zs = [v.co.z for v in mesh.vertices]
    mesh.transform(Matrix.Translation((0, 0, -min(zs) + 0.0004)))
    rnd.random()
    return mesh


EAR_VARIANTS = {
    'stop_listening_ear_a': dict(width=1.00, height=1.00, lobe=1.00, curl=1.00, mirror=False, tilt=0),
    'stop_listening_ear_b': dict(width=0.96, height=0.94, lobe=0.85, curl=0.95, mirror=True, tilt=0),
    'stop_listening_ear_c': dict(width=1.04, height=1.06, lobe=1.10, curl=1.05, mirror=False, tilt=22),
    'stop_listening_ear_d': dict(width=0.86, height=0.88, lobe=0.80, curl=0.90, mirror=False, tilt=-8),
    'stop_listening_ear_e': dict(width=1.00, height=1.02, lobe=0.70, curl=1.10, mirror=True, tilt=-18),
    'stop_listening_ear_f': dict(width=1.08, height=1.10, lobe=1.20, curl=1.00, mirror=True, tilt=6),
}


def puddle(bm_target, radius, rnd, z=0.0012, material_index=3, points=64):
    """An irregular wet stain on the floor, under whatever is lying in it."""
    phase = [rnd.random() * math.tau for _ in range(3)]
    ring = []
    for i in range(points):
        a = i / points * math.tau
        r = radius * (1 + .20 * math.sin(3 * a + phase[0]) + .12 * math.sin(5 * a + phase[1]) + .08 * math.sin(11 * a + phase[2]) + .05 * rnd.uniform(-1, 1))
        ring.append(bm_target.verts.new((math.cos(a) * r, math.sin(a) * r * .8, z)))
    centre = bm_target.verts.new((0, 0, z))
    for i in range(points):
        f = bm_target.faces.new((centre, ring[i], ring[(i + 1) % points]))
        f.material_index = material_index
        f.smooth = False


def add_mesh(bm, mesh, matrix):
    tmp = mesh.copy()
    tmp.transform(matrix)
    if matrix.determinant() < 0:
        flip(tmp)
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def smeared(name, ear):
    rnd = random.Random(f'{name}-smear')
    bm = bmesh.new()
    bm.from_mesh(ear)
    puddle(bm, rnd.uniform(.042, .058), rnd, z=0.0008, material_index=3, points=36)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in (MAT['skin'], MAT['deep'], MAT['wound'], MAT['wet']):
        mesh.materials.append(m)
    return mesh


HEAPS = {
    'stop_listening_heap_a': dict(count=42, radius=0.115, stretch=1.0),
    'stop_listening_heap_b': dict(count=26, radius=0.085, stretch=1.0),
    'stop_listening_heap_c': dict(count=34, radius=0.09, stretch=2.3),
}


def build_heap(name, spec, ears):
    """A pile: each ear rests on whatever is already under it, leaning, turned up."""
    rnd = random.Random(name)
    bm = bmesh.new()
    placed = []
    names = list(ears)
    for i in range(spec['count']):
        for _ in range(40):
            r = spec['radius'] * math.sqrt(rnd.random())
            a = rnd.random() * math.tau
            x, y = math.cos(a) * r * spec['stretch'], math.sin(a) * r
            if all(math.hypot(x - px, y - py) > 0.012 for px, py, _ in placed[-4:]):
                break
        # Rest on what is already there. Nearer the middle the pile is taller.
        under = [top for px, py, top in placed if math.hypot(x - px, y - py) < 0.03]
        base = (max(under) * 0.82 if under else 0.0) + (0.002 * len(under) ** .5)
        # Lower in the pile they lie flatter; higher up they lean on each other.
        lean = rnd.uniform(5, 18) + (min(60, 900 * base) if under else 0)
        axis = Vector((math.cos(rnd.random() * math.tau), math.sin(rnd.random() * math.tau), 0)).normalized()
        scale = rnd.uniform(0.9, 1.1)
        m = (Matrix.Translation((x, y, base)) @ Matrix.Rotation(math.radians(lean), 4, axis)
             @ Matrix.Rotation(rnd.random() * math.tau, 4, 'Z') @ Matrix.Scale(scale, 4))
        add_mesh(bm, ears[names[rnd.randrange(len(names))]], m)
        placed.append((x, y, base + 0.011 * scale))
    puddle(bm, spec['radius'] * 1.12 * max(1, spec['stretch'] * .7), rnd)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in (MAT['skin'], MAT['deep'], MAT['wound'], MAT['wet']):
        mesh.materials.append(m)
    return mesh


# ── the hand ─────────────────────────────────────────────────────────────────
# One stroke alphabet for both hands in this room — the brush on the walls and
# the biro on the sheet — because it is one hand. Unit letter height, each glyph
# a list of polylines and an advance width. Only the letters these words need.
GLYPHS = {
    'S': (0.72, [[(0.70, 0.88), (0.52, 1.0), (0.24, 0.96), (0.08, 0.80), (0.14, 0.62), (0.40, 0.51),
                  (0.64, 0.42), (0.74, 0.24), (0.62, 0.05), (0.36, 0.0), (0.06, 0.12)]]),
    'T': (0.74, [[(0.0, 1.0), (0.74, 1.0)], [(0.37, 1.0), (0.37, 0.0)]]),
    'O': (0.78, [[(0.39 + 0.37 * math.cos(a), 0.5 + 0.5 * math.sin(a))
                  for a in [math.pi / 2 + i * math.tau / 18 for i in range(19)]]]),
    'P': (0.66, [[(0.05, 0.0), (0.05, 1.0), (0.42, 1.0), (0.60, 0.90), (0.64, 0.75), (0.56, 0.60), (0.36, 0.52), (0.05, 0.52)]]),
    'L': (0.58, [[(0.05, 1.0), (0.05, 0.0), (0.56, 0.0)]]),
    'I': (0.20, [[(0.10, 1.0), (0.10, 0.0)]]),
    'N': (0.74, [[(0.05, 0.0), (0.05, 1.0), (0.68, 0.0), (0.68, 1.0)]]),
    'E': (0.62, [[(0.60, 1.0), (0.05, 1.0), (0.05, 0.0), (0.60, 0.0)], [(0.05, 0.52), (0.46, 0.52)]]),
    'G': (0.78, [[(0.74, 0.85), (0.52, 1.0), (0.24, 0.95), (0.06, 0.70), (0.05, 0.34), (0.19, 0.06),
                  (0.47, 0.0), (0.71, 0.12), (0.76, 0.42), (0.46, 0.42)]]),
    'M': (0.88, [[(0.05, 0.0), (0.10, 1.0), (0.44, 0.34), (0.78, 1.0), (0.83, 0.0)]]),
    ' ': (0.42, []),
}
GAP = 0.16


def resample(points, step):
    out = [points[0]]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for k in range(1, n + 1):
            t = k / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def hand_strokes(text, h, rnd, *, slant=0.12, wobble=0.035, drift=0.0, rotation=0.0, size_jitter=0.08, step=0.18):
    """Strokes in metres for one line of text, baseline at y=0, from x=0.
    Returns (strokes, width); each stroke is a list of (x, y)."""
    strokes, x = [], 0.0
    base_noise = [rnd.uniform(-1, 1) for _ in range(len(text) + 2)]
    for i, ch in enumerate(text):
        adv, glyph = GLYPHS[ch]
        size = h * (1 + rnd.uniform(-size_jitter, size_jitter))
        lift = base_noise[i] * h * 0.06 + drift * x
        tilt = rnd.uniform(-0.05, 0.05)
        for line in glyph:
            pts = []
            for gx, gy in resample(line, step):
                gx += rnd.uniform(-wobble, wobble)
                gy += rnd.uniform(-wobble, wobble)
                px = x + (gx + slant * gy) * size
                py = gy * size + lift
                # The glyph turns a little about its own baseline.
                px, py = x + (px - x) * math.cos(tilt) - py * math.sin(tilt), (px - x) * math.sin(tilt) + py * math.cos(tilt)
                pts.append((px, py))
            strokes.append(pts)
        x += (adv + GAP) * h * (1 + rnd.uniform(-0.05, 0.05))
    width = x - GAP * h
    if rotation:
        c, s = math.cos(rotation), math.sin(rotation)
        strokes = [[(px * c - py * s, px * s + py * c) for px, py in st] for st in strokes]
    return strokes, width


def strokes_curve(name, strokes, radius, plane='XZ', radii_fn=None, resolution=1, depth_z=0.0):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    curve.use_fill_caps = True
    for si, st in enumerate(strokes):
        if len(st) < 2:
            continue
        sp = curve.splines.new('POLY')
        sp.points.add(len(st) - 1)
        for i, (a, b) in enumerate(st):
            co = (a, 0.0, b, 1) if plane == 'XZ' else (a, b, depth_z, 1)
            sp.points[i].co = co
            sp.points[i].radius = radii_fn(si, i, len(st)) if radii_fn else 1.0
    return curve


# ── the walls ────────────────────────────────────────────────────────────────
WRITING = {
    'stop_listening_writing_line': dict(lines=['STOP LISTENING TO ME'], h=0.30, pitch=0.0, brush=0.022, drips=14),
    'stop_listening_writing_block': dict(lines=['STOP LISTENING TO ME'] * 4, h=0.17, pitch=0.24, brush=0.0135, drips=20),
    'stop_listening_writing_scrawl': dict(lines=['STOP LISTENING'] * 6, h=0.12, pitch=0.15, brush=0.009, drips=16),
}


def build_writing(name, spec):
    rnd = random.Random(name)
    strokes, widths = [], []
    for li, text in enumerate(spec['lines']):
        line, width = hand_strokes(text, spec['h'], rnd, slant=rnd.uniform(.05, .2), wobble=.03,
                                   drift=rnd.uniform(-.02, .02), rotation=math.radians(rnd.uniform(-2.5, 2.5)))
        dx = rnd.uniform(-.06, .06) * spec['h'] * 4 - width / 2
        dy = -li * spec['pitch'] + rnd.uniform(-.2, .2) * spec['pitch'] * .3
        strokes += [[(x + dx, y + dy) for x, y in st] for st in line]
        widths.append(width)
    # Painted twice where the brush ran dry: a thinner second pass, a little off.
    repaint = [[(x + rnd.uniform(.002, .006), y - rnd.uniform(.0, .004)) for x, y in st]
               for st in strokes if rnd.random() < .3]
    # Drips run straight down from the low points and from wherever paint pooled.
    drips = []
    bottoms = sorted(strokes, key=lambda st: min(p[1] for p in st))
    for st in rnd.sample(strokes, min(len(strokes), spec['drips'])) + bottoms[:4]:
        low = min(p[1] for p in st)
        # Paint runs from where it pooled, which is the bottom of a stroke.
        candidates = [p for p in st if p[1] <= low + spec['h'] * .45]
        x, y = min(st, key=lambda p: p[1]) if rnd.random() < .6 else candidates[rnd.randrange(len(candidates))]
        length = spec['h'] * rnd.uniform(.2, .95)
        drips.append([(x + rnd.uniform(-.002, .002) * (k / 6), y - length * k / 6) for k in range(7)])
    taper = lambda si, i, n: 1.0 - 0.25 * abs((i / max(1, n - 1)) * 2 - 1) ** 2
    drip_taper = lambda si, i, n: 0.95 - 0.55 * (i / max(1, n - 1)) + (0.5 if i == n - 1 else 0)
    parts = []
    for label, group, radius, fn in (('main', strokes, spec['brush'], taper), ('repaint', repaint, spec['brush'] * .65, taper),
                                     ('drips', drips, spec['brush'] * .55, drip_taper)):
        if not group:
            continue
        obj = link(bpy.data.objects.new(f'{name}-{label}', strokes_curve(f'{name}-{label}', group, radius, radii_fn=fn)))
        parts.append(obj)
    mesh_objs = [link(bpy.data.objects.new(o.name + '-mesh', evaluated_mesh(o, o.name + '-mesh'))) for o in parts]
    for o in parts:
        remove(o)
    fused = join(mesh_objs, name)
    for o in mesh_objs:
        remove(o)
    mesh = fused.data
    # Paint is a film, not a pipe: press the strokes flat against the wall (-y is
    # the room side; the back sits at y = 0 on the wall face).
    relief = max(0.0025, spec['brush'] * 0.32)
    ys = [v.co.y for v in mesh.vertices]
    span = max(1e-6, max(ys) - min(ys))
    for v in mesh.vertices:
        v.co.y = -(v.co.y - min(ys)) / span * relief
    xs = [v.co.x for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    mesh.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, 0, -min(zs))))
    for poly in mesh.polygons:
        poly.use_smooth = True
    fused.data = bpy.data.meshes.new(name)  # detach so the mesh can be named and reused
    remove(fused)
    mesh.name = name
    return mesh


# ── the take sheet ───────────────────────────────────────────────────────────
# The W. ELLERY / WORKS room-tone take sheet, set out as the paper pipeline sets
# it (scripts/build-paper-assets.mjs, template take-sheet) and measured off a
# baked one. Millimetres from the top-left corner of an A4 sheet.
SHEET_W, SHEET_H = 210.0, 297.0
INK_SLATE = '#2E3B4E'
INK_GREY = '#55534D'
BIRO = '#1F3958'
BIRO_HEAVY = '#15253C'


def font(kind, face='Regular'):
    path = FONTS / f'Nimbus{kind}-{face}.otf'
    if not path.exists():
        raise RuntimeError(f'vendored face missing: {path}')
    return bpy.data.fonts.load(str(path), check_existing=True)


def sheet_xy(xmm, ymm):
    return ((xmm - SHEET_W / 2) * MM, (SHEET_H / 2 - ymm) * MM)


def flat_material(name, hexcolor):
    m = material(name, hex_linear(hexcolor), 1.0)
    return m


def sheet_text(scene, body, xmm, ymm, size_mm, mat, *, kind='Roman', face='Regular', align='LEFT', tracking=0.0):
    curve = bpy.data.curves.new('sheet-text', 'FONT')
    curve.body = body
    curve.font = font(kind, face)
    curve.size = size_mm * MM
    curve.align_x = align
    curve.space_character = 1.0 + tracking
    curve.materials.append(mat)
    obj = bpy.data.objects.new('sheet-text', curve)
    x, y = sheet_xy(xmm, ymm)
    obj.location = (x, y, 0.0002)
    return link(obj, scene)


def sheet_rule(scene, x0, x1, ymm, width_mm, mat):
    bm = bmesh.new()
    a, b = sheet_xy(x0, ymm - width_mm / 2), sheet_xy(x1, ymm + width_mm / 2)
    vs = [bm.verts.new((a[0], a[1], 0.0001)), bm.verts.new((b[0], a[1], 0.0001)),
          bm.verts.new((b[0], b[1], 0.0001)), bm.verts.new((a[0], b[1], 0.0001))]
    bm.faces.new(vs)
    mesh = bpy.data.meshes.new('sheet-rule')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return link(bpy.data.objects.new('sheet-rule', mesh), scene)


def sheet_ring(scene, cxmm, cymm, rmm, width_mm, mat):
    bm = bmesh.new()
    n = 72
    outer, inner = [], []
    for i in range(n):
        a = i / n * math.tau
        for r, ring in ((rmm + width_mm / 2, outer), (rmm - width_mm / 2, inner)):
            x, y = sheet_xy(cxmm + math.cos(a) * r, cymm + math.sin(a) * r)
            ring.append(bm.verts.new((x, y, 0.0001)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    mesh = bpy.data.meshes.new('sheet-ring')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return link(bpy.data.objects.new('sheet-ring', mesh), scene)


def biro_line(rnd, text, x0, x1, ybase, h, *, slant, wobble, drift=0.0, rotation=0.0, repeat=True):
    """Fill x0..x1 (mm) with text, repeated, cut at the end of the field like a
    hand that ran out of room and did not stop. Returns strokes in mm."""
    out, x = [], x0
    while x < x1:
        line, width = hand_strokes(text, h, rnd, slant=slant, wobble=wobble, drift=drift, size_jitter=.1, step=.22)
        for st in line:
            pts = [(x + px, ybase - py) for px, py in st]
            if pts[0][0] > x1 + h * .3:
                continue
            out.append(pts)
        x += width + h * rnd.uniform(.55, .9)
        if not repeat:
            break
    if rotation:
        cx, cy = x0, ybase
        c, s = math.cos(rotation), math.sin(rotation)
        out = [[(cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c) for px, py in st] for st in out]
    return out


def sheet_ink(rnd):
    """Every field and every margin. The hand gets larger, harder and less
    careful the further down it goes."""
    light, heavy = [], []
    phrase = 'STOP LISTENING '
    light += biro_line(rnd, phrase, 47, 194, 42.6, 3.9, slant=.18, wobble=.035)
    light += biro_line(rnd, 'STOP', 36, 60, 52.9, 3.8, slant=.18, wobble=.035, repeat=False)
    light += biro_line(rnd, 'LISTENING', 79, 104, 52.9, 3.4, slant=.2, wobble=.04, repeat=False)
    light += biro_line(rnd, 'STOP', 121, 148, 52.9, 3.8, slant=.18, wobble=.035)
    light += biro_line(rnd, 'LISTENING', 170, 196, 52.9, 3.0, slant=.22, wobble=.04, repeat=False)
    light += biro_line(rnd, phrase, 57, 195, 62.0, 3.9, slant=.2, wobble=.04)
    rules = [86.1 + i * 6.35 for i in range(28)]
    for i, y in enumerate(rules[:27]):
        t = i / 26
        h = 3.7 + 1.6 * t
        target = heavy if t > .55 else light
        target += biro_line(rnd, phrase, 17 - 4 * t * rnd.random(), 194 + 6 * t, y - .5 + rnd.uniform(-.4, .4) * (1 + 4 * t),
                            h, slant=.15 + .2 * t, wobble=.035 + .05 * t, drift=rnd.uniform(-.01, .01) * (1 + 6 * t),
                            rotation=math.radians(rnd.uniform(-1, 1) * 4 * t))
        if t > .62:
            heavy.extend(biro_line(rnd, phrase, 15 + rnd.uniform(0, 30), 198, y + 3.1 + rnd.uniform(-1, 1),
                                   h * rnd.uniform(1.0, 1.35), slant=.32, wobble=.09,
                                   rotation=math.radians(rnd.uniform(-6, 6))))
        if t > .82:
            heavy.extend(biro_line(rnd, 'STOP LISTENING STOP ', 12, 200, y + rnd.uniform(-2, 2), h * 1.5, slant=.4,
                                   wobble=.12, rotation=math.radians(rnd.uniform(-9, 9))))
    light += biro_line(rnd, phrase, 46, 92, 270.6, 3.8, slant=.25, wobble=.05)
    light += biro_line(rnd, 'STOP', 136, 165, 270.6, 3.8, slant=.25, wobble=.05)
    # The margins, up the left edge and down the right, and the top.
    left = biro_line(rnd, phrase, 0, 270, 0, 3.4, slant=.2, wobble=.05)
    heavy += [[(9.0 + py, 282 - px) for px, py in st] for st in left]
    right = biro_line(rnd, phrase, 0, 270, 0, 3.2, slant=.2, wobble=.05)
    light += [[(201.0 - py, 18 + px) for px, py in st] for st in right]
    light += biro_line(rnd, phrase, 40, 190, 6.0, 2.6, slant=.15, wobble=.04)
    heavy += biro_line(rnd, phrase, 20, 196, 293.5, 3.0, slant=.3, wobble=.07)
    return light, heavy


def smooth_noise(gen, coarse, size):
    """Gaussian noise on a coarse grid, bilinearly upsampled: paper mottle
    without the blocks a nearest-neighbour upsample prints."""
    grid = gen.normal(0, 1, coarse).astype(np.float32)
    h, w = size
    ys = np.linspace(0, coarse[0] - 1, h, dtype=np.float32)
    xs = np.linspace(0, coarse[1] - 1, w, dtype=np.float32)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, coarse[0] - 1), np.minimum(x0 + 1, coarse[1] - 1)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    top = grid[y0][:, x0] * (1 - fx) + grid[y0][:, x1] * fx
    bottom = grid[y1][:, x0] * (1 - fx) + grid[y1][:, x1] * fx
    return top * (1 - fy) + bottom * fy


def render_sheet(out_png, work):
    scene = bpy.data.scenes.new('take-sheet')
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'FLAT'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.render_aa = '16'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = 2048, 2896
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    cam_data = bpy.data.cameras.new('sheet-camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = SHEET_H * MM
    cam = bpy.data.objects.new('sheet-camera', cam_data)
    cam.location = (0, 0, 1)
    link(cam, scene)
    scene.camera = cam

    slate = flat_material('sheet slate', INK_SLATE)
    grey = flat_material('sheet grey', INK_GREY)
    rule = flat_material('sheet rule', '#9C9A93')
    faint = flat_material('sheet faint rule', '#CFCDC5')
    # Header, exactly as the works prints it.
    sheet_ring(scene, 24, 12.8, 7.0, .35, slate)
    sheet_text(scene, 'WE', 24, 14.3, 4.4, slate, face='Bold', align='CENTER')
    sheet_text(scene, 'WORKS', 24, 17.4, 1.3, slate, align='CENTER', tracking=.1)
    sheet_text(scene, 'W. ELLERY / WORKS', 34, 11.7, 6.2, slate, face='Bold')
    sheet_text(scene, 'ACOUSTIC RECORDING · TECHNICAL SERVICES', 34, 16.8, 3.0, slate)
    sheet_text(scene, 'Calder Works, Bradford Road', 193, 9.8, 2.4, grey, align='RIGHT')
    sheet_text(scene, 'Brighouse, West Yorkshire  HD6 4AA', 193, 13.8, 2.4, grey, align='RIGHT')
    sheet_text(scene, 'Telephone 01484 214 417   Fax 01484 214 418', 193, 17.7, 2.4, grey, align='RIGHT')
    sheet_rule(scene, 16.8, 193, 22.9, .3, rule)
    sheet_text(scene, 'ROOM TONE / TAKE SHEET', 17, 32.7, 4.6, slate, face='Bold')
    sheet_text(scene, 'JOB 4417-C', 193, 29.9, 2.0, grey, kind='MonoPS', align='RIGHT')
    sheet_text(scene, 'ROOM', 17, 43.0, 3.5, slate)
    sheet_rule(scene, 44.8, 193, 44.1, .22, rule)
    for label, x, (u0, u1) in (('TAKE', 17, (35, 59.5)), ('START', 60, (78.9, 103.8)),
                               ('END', 103.8, (120.9, 147.7)), ('RETAKE', 148, (169.9, 193))):
        sheet_text(scene, label, x, 53.2, 3.5, slate)
        sheet_rule(scene, u0, u1, 54.1, .22, rule)
    sheet_text(scene, 'NOISE / CONDITION', 17, 62.3, 3.5, slate)
    sheet_rule(scene, 55, 193, 63.2, .22, rule)
    sheet_text(scene, 'REMARKS / CONTAMINATION', 17, 77.0, 3.5, slate)
    sheet_rule(scene, 16.8, 193, 79.1, .3, rule)
    for i in range(27):
        sheet_rule(scene, 16.8, 193, 86.1 + i * 6.35, .18, faint)
    sheet_text(scene, 'ENGINEER', 18.9, 272.0, 3.5, slate)
    sheet_rule(scene, 44.8, 91, 272.0, .22, rule)
    sheet_text(scene, 'INITIALS', 108, 272.0, 3.5, slate)
    sheet_rule(scene, 134.9, 164, 272.0, .22, rule)
    sheet_rule(scene, 16.8, 193, 282.0, .22, rule)
    sheet_text(scene, 'W. ELLERY / WORKS · JOB 4417-C', 17, 286.5, 2.0, grey)
    sheet_text(scene, 'SHEET 1 OF 1', 193, 286.5, 2.0, grey, align='RIGHT')

    rnd = random.Random('stop-listening-take-sheet')
    light, heavy = sheet_ink(rnd)
    to_m = lambda strokes: [[sheet_xy(x, y) for x, y in st] for st in strokes]
    for label, strokes, radius, hexcolor in (('light', light, .23, BIRO), ('heavy', heavy, .36, BIRO_HEAVY)):
        curve = strokes_curve(f'biro-{label}', to_m(strokes), radius * MM, plane='XY', depth_z=0.0004,
                              radii_fn=lambda si, i, n: .8 + .4 * math.sin(i * .9 + si))
        curve.materials.append(flat_material(f'biro {label}', hexcolor))
        link(bpy.data.objects.new(f'biro-{label}', curve), scene)
    # Where it went through: the pen tore the sheet in the last third.
    tear = flat_material('sheet tear', '#0B0B0C')
    tears = []
    for _ in range(9):
        x, y = rnd.uniform(25, 185), rnd.uniform(205, 262)
        a, length = rnd.uniform(-.25, .25), rnd.uniform(3, 9)
        tears.append([(x + math.cos(a) * length * t / 6, y + math.sin(a) * length * t / 6 + rnd.uniform(-.2, .2)) for t in range(7)])
    tcurve = strokes_curve('sheet-tears', to_m(tears), .38 * MM, plane='XY', depth_z=0.0006,
                           radii_fn=lambda si, i, n: .3 + .9 * math.sin(math.pi * i / max(1, n - 1)))
    tcurve.materials.append(tear)
    link(bpy.data.objects.new('sheet-tears', tcurve), scene)

    ink_png = Path(work) / 'take-sheet-ink.png'
    scene.render.filepath = str(ink_png)
    bpy.ops.render.render(write_still=True, scene=scene.name)

    # The stock: Ellery letterhead, uncoated, gone damp where it lay. Composited
    # under the render here so the sheet is one finished image.
    ink = bpy.data.images.load(str(ink_png))
    w, h = ink.size
    px = np.empty(w * h * 4, dtype=np.float32)
    ink.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)  # rows bottom to top
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, 1 - yy / h  # v from the top
    gen = np.random.default_rng(4417)
    stock = np.ones((h, w, 3), dtype=np.float32) * np.array([0xF2, 0xF0, 0xE8], dtype=np.float32) / 255
    mottle = smooth_noise(gen, (37, 26), (h, w)) + .5 * smooth_noise(gen, (110, 78), (h, w))
    stock *= (1 + .012 * mottle)[..., None]
    stock *= (1 + .018 * gen.normal(0, 1, (h, w)).astype(np.float32))[..., None]
    damp = np.zeros((h, w), dtype=np.float32)
    for cx, cy, r, s in ((.22, .82, .30, .55), (.72, .66, .17, .35), (.48, .93, .22, .5)):
        d = np.hypot((u - cx) * .707, v - cy) / r
        damp += s * np.clip(1 - d, 0, 1) ** 1.6
    # A ring where something wet was set down on it: a tide line, darker at the edge.
    d = np.hypot((u - .63) * .707, v - .41) / .062
    damp += .45 * np.exp(-((d - 1) / .06) ** 2) + .12 * np.clip(1 - d, 0, 1)
    damp = np.clip(damp, 0, 1)
    stock *= (1 - .17 * damp)[..., None] * np.array([1.0, .975, .93], dtype=np.float32)
    # The two folds of a sheet carried in a pocket.
    for fold in (99 / 297, 198 / 297):
        stock *= (1 - .05 * np.exp(-((v - fold) * h / 2.2) ** 2))[..., None]
    a = px[..., 3:4]
    rgb = px[..., :3] * (1 - .25 * damp[..., None])
    out = stock * (1 - a) + rgb * a
    final = np.concatenate([np.clip(out, 0, 1), np.ones((h, w, 1), dtype=np.float32)], axis=2)
    img = bpy.data.images.new('stop-listening-take-sheet', w, h, alpha=False)
    img.pixels.foreach_set(final.ravel())
    img.filepath_raw = str(out_png)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(ink)
    tex = img.copy()
    tex.name = 'stop-listening-take-sheet-texture'
    tex.scale(512, 724)
    tex_path = Path(work) / 'take-sheet-texture.png'
    tex.filepath_raw = str(tex_path)
    tex.file_format = 'PNG'
    tex.save()
    tex.filepath = str(tex_path)
    bpy.data.scenes.remove(scene)
    return tex


def build_sheet_mesh(texture):
    """A4 on the floor: bowed, folded once, a corner lifted, crinkled where wet."""
    bm = bmesh.new()
    nx, ny = 14, 20
    rnd = random.Random('stop-listening-sheet-mesh')
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = (u - .5) * SHEET_W * MM, (v - .5) * SHEET_H * MM
            z = .0025 * math.sin(math.pi * u) * math.sin(math.pi * v)
            z += .006 * math.exp(-((1 - v - 99 / 297) * 12) ** 2)  # the fold stands up
            z += .016 * max(0, (u - .72) / .28) ** 2 * max(0, (.22 - v) / .22) ** 2  # lifted corner
            z += rnd.uniform(-.0006, .0006) * (1 if v < .45 else .3)
            row.append(bm.verts.new((x, y, max(.0006, z))))
        grid.append(row)
    uv = bm.loops.layers.uv.new('UVMap')
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv].uv = (a / nx, b / ny)
            f.smooth = True
    mesh = bpy.data.meshes.new('stop_listening_take_sheet')
    bm.to_mesh(mesh)
    bm.free()
    mat = bpy.data.materials.new('stop listening take sheet')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .82
    node = nodes.new('ShaderNodeTexImage')
    node.image = texture
    mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(mat)
    # Two-sided by construction: an underside a hair below, so the lifted corner
    # never shows the floor through itself.
    obj = link(bpy.data.objects.new('sheet-tmp', mesh))
    sol = obj.modifiers.new('thickness', 'SOLIDIFY')
    sol.thickness = .0004
    sol.offset = -1
    solid = evaluated_mesh(obj, 'stop_listening_take_sheet')
    remove(obj)
    return solid


# ── assembly ─────────────────────────────────────────────────────────────────
def runtime_bounds(mesh):
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    rt = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    return {'min': [round(float(v), 4) for v in rt.min(axis=0)], 'max': [round(float(v), 4) for v in rt.max(axis=0)]}


def main():
    a = parse_args()
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    meshes = {}
    for name, p in EAR_VARIANTS.items():
        meshes[name] = build_ear(name, p, target_tris=420)
    ears = {k: meshes[k] for k in EAR_VARIANTS}
    # A scattered ear lies in its own wet smear. On a lit floor the halftone has
    # nothing to draw between a pale ear and pale tile; the smear is the edge.
    singles = {name: smeared(name, mesh) for name, mesh in ears.items()}
    meshes.update(singles)
    for name, spec in HEAPS.items():
        meshes[name] = build_heap(name, spec, ears)
    # The heaps were built from the bare ears; the pack ships the smeared ones
    # under the same names, so the bare meshes give their names back.
    for mesh in ears.values():
        bpy.data.meshes.remove(mesh)
    for name, spec in WRITING.items():
        dark = build_writing(name, spec)
        dark.materials.clear()
        dark.materials.append(MAT['paint_dark'])
        pale = dark.copy()
        pale.name = f'{name}_pale'
        pale.materials.clear()
        pale.materials.append(MAT['paint_pale'])
        meshes[name] = dark
        meshes[f'{name}_pale'] = pale
    texture = render_sheet(Path(a.sheet), work)
    meshes['stop_listening_take_sheet'] = build_sheet_mesh(texture)

    scene = bpy.context.scene
    objects = []
    for name, mesh in meshes.items():
        mesh.name = name
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        objects.append(obj)
    bpy.context.view_layer.update()
    for obj in scene.objects:
        obj.select_set(obj in objects)
    bpy.context.view_layer.objects.active = objects[0]
    report = {
        'meshes': {name: {'triangles': tri_count(mesh), 'bounds': runtime_bounds(mesh),
                          'materials': [m.name for m in mesh.materials]} for name, mesh in meshes.items()},
    }
    report['triangles'] = sum(m['triangles'] for m in report['meshes'].values())
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.blend).resolve()))
    bpy.ops.export_scene.gltf(filepath=str(Path(a.output).resolve()), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials='EXPORT', export_image_format='AUTO',
                              export_animations=False, export_skins=False, export_morph=False, export_lights=False,
                              export_cameras=False, export_extras=False)
    Path(a.report).write_text(json.dumps(report, indent=2) + '\n')
    print('STOP LISTENING', report['triangles'], 'triangles across', len(meshes), 'meshes')


if __name__ == '__main__':
    main()
