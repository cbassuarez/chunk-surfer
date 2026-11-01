"""Cell-fractures the false Ellery that falls with the player in Earthfall.

Blender with the Cell Fracture extension (extensions.blender.org, cell_fracture):
  blender --online-mode -c extension install --enable cell_fracture
Run by tools/chunk_surfer/build-earthfall-fracture.mjs, which supplies the
retained Source elevation as JSON and encodes what this writes.

Two levels, both from deterministic seed points: the building into chunks,
then every chunk into fragments. Cut faces take the fracture-core material.
Coordinates stay in the input's glTF Y-up metres; nothing is rescaled.
"""
import argparse, json, random, sys
import addon_utils, bmesh, bpy

argv = sys.argv[sys.argv.index('--') + 1:]
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True); parser.add_argument('--output', required=True)
parser.add_argument('--chunks', type=int, default=28); parser.add_argument('--fragments', type=int, default=4)
parser.add_argument('--seed', type=int, default=2019)
args = parser.parse_args(argv)

module = next((m.__name__ for m in addon_utils.modules() if m.__name__.endswith('cell_fracture')), None)
if not module:
    raise RuntimeError('Cell Fracture is not installed: blender --online-mode -c extension install --enable cell_fracture')
addon_utils.enable(module, default_set=True)

source = json.load(open(args.input))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials = []
for definition in source['materials']:
    material = bpy.data.materials.new(definition['name']); material.diffuse_color = definition['color']; materials.append(material)
core = bpy.data.materials.new('earthfall fracture core'); core.diffuse_color = (.19, .23, .20, 1); materials.append(core)
CORE = len(materials) - 1

vertices, faces, face_materials = [], [], []
for primitive in source['primitives']:
    base = len(vertices); p = primitive['positions']
    vertices += [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p), 3)]
    ids = primitive['indices']
    for i in range(0, len(ids), 3):
        faces.append((base + ids[i], base + ids[i + 1], base + ids[i + 2])); face_materials.append(primitive['material'])
mesh = bpy.data.meshes.new('elevation'); mesh.from_pydata(vertices, [], faces)
for material in materials: mesh.materials.append(material)
for polygon, index in zip(mesh.polygons, face_materials): polygon.material_index = index
building = bpy.data.objects.new('elevation', mesh); bpy.context.scene.collection.objects.link(building)
work = bmesh.new(); work.from_mesh(mesh); bmesh.ops.remove_doubles(work, verts=work.verts, dist=1e-4); work.to_mesh(mesh); work.free()
# Cell Fracture's cells, cut by bisection. Its own boolean step treats the
# source as a closed volume, and this elevation is open shells (panes, slates,
# single-skin linings), so the boolean kept the cells' hull faces as solid.
# Bisecting the real surfaces by each cell's planes keeps only the building;
# a cut through a wall leaves a small section loop, and only those are capped.

import importlib
from mathutils import Vector
cells_of = importlib.import_module(module + '.fracture_cell_calc').points_as_bmesh_cells
rng = random.Random(args.seed)

def seed_points(bm, count):
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    lo, hi = (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))
    return [Vector(tuple(lo[k] + (hi[k] - lo[k]) * (.08 + .84 * rng.random()) for k in range(3))) for _ in range(count)]

def cut(source, planes):
    piece = source.copy()
    for co, no in planes:
        geom = piece.verts[:] + piece.edges[:] + piece.faces[:]
        bmesh.ops.bisect_plane(piece, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
        if not piece.faces: break
    # Section caps: only small closed boundary loops (a wall's thickness).
    boundary = [e for e in piece.edges if e.is_boundary]
    if boundary:
        filled = bmesh.ops.holes_fill(piece, edges=boundary, sides=12)
        for face in filled['faces']:
            face.material_index = CORE
    # Cutting splits long flat faces along every cell boundary they cross.
    # Merge what stayed coplanar back together, never across materials.
    if piece.faces:
        bmesh.ops.dissolve_limit(piece, angle_limit=.0035, use_dissolve_boundaries=False,
            verts=piece.verts[:], edges=piece.edges[:], delimit={'MATERIAL'})
    return piece

def fracture(source_bm, count, prefix):
    points = seed_points(source_bm, count)
    cells = cells_of([v.co for v in source_bm.verts], points, margin_bounds=.5)
    pieces = []
    for index, (centre, hull_points) in enumerate(cells):
        # Cell Fracture's cell vertices are relative to their seed.
        hull = bmesh.new()
        for co in hull_points: hull.verts.new(co + centre)
        bmesh.ops.convex_hull(hull, input=hull.verts[:])
        hull.normal_update()
        # Every plane faces away from this cell's own seed, whatever the hull's
        # winding, so clear_outer keeps the cell and removes its neighbours.
        planes = []
        for f in hull.faces:
            co, no = f.calc_center_median(), f.normal.copy()
            if (co - centre).dot(no) < 0: no.negate()
            planes.append((co, no))
        hull.free()
        piece = cut(source_bm, planes)
        if len(piece.faces) < 4: piece.free(); continue
        pieces.append(piece)
    return pieces

def to_object(bm, name):
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh)
    for material in materials: mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    centre = sum((v.co for v in mesh.vertices), Vector()) / max(1, len(mesh.vertices))
    mesh.transform(__import__('mathutils').Matrix.Translation(-centre)); obj.location = centre
    return obj

source_bm = bmesh.new(); source_bm.from_mesh(mesh)
def export(obj):
    data = obj.data; data.calc_loop_triangles()
    groups = {}
    for triangle in data.loop_triangles:
        group = groups.setdefault(triangle.material_index, {'material': triangle.material_index, 'positions': [], 'normals': []})
        normal = triangle.normal
        for vertex in triangle.vertices:
            co = data.vertices[vertex].co
            group['positions'] += [round(co.x, 5), round(co.y, 5), round(co.z, 5)]
            group['normals'] += [round(normal.x, 5), round(normal.y, 5), round(normal.z, 5)]
    return {'pivot': [round(v, 5) for v in obj.location], 'groups': list(groups.values()), 'triangles': len(data.loop_triangles)}

pieces = []
chunk_bms = fracture(source_bm, args.chunks, 'chunk')
for index, chunk_bm in enumerate(chunk_bms):
    chunk = to_object(chunk_bm, f'chunk_{index:02d}')
    pieces.append({'name': f'chunk_{index:02d}', 'level': 1, 'parent': None, **export(chunk)})
    for k, fragment_bm in enumerate(fracture(chunk_bm, args.fragments, f'fragment_{index:02d}')):
        fragment = to_object(fragment_bm, f'fragment_{index:02d}_{k}')
        pieces.append({'name': f'fragment_{index:02d}_{k}', 'level': 2, 'parent': f'chunk_{index:02d}', **export(fragment)})
        fragment_bm.free()
    chunk_bm.free()
chunks = [p for p in pieces if p['level'] == 1]
json.dump({'materials': [m.name for m in materials], 'core': CORE, 'seed': args.seed, 'pieces': pieces}, open(args.output, 'w'))
print('EARTHFALL_FRACTURE', len(chunks), 'chunks', sum(1 for p in pieces if p['level'] == 2), 'fragments')
