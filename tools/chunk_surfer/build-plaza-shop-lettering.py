"""CPU-only Blender FONT -> physical fascia ink triangles.

Run from the repository root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --threads 2 --python tools/chunk_surfer/build-plaza-shop-lettering.py

The optional --contact-sheet PNG is inspection evidence drawn directly from
these triangles, never a runtime texture or an alternate source of typography.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import struct
import sys
import zlib
from collections import Counter
from pathlib import Path
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FONT_FILE = 'assets/fonts/NimbusSans-Bold.otf'
FONT_SHA = '7f33328e6b4d4cd21b45fa625791928c9407dc702db6780e56b09ca9a3ecaa67'
LICENSE_FILE = 'assets/fonts/LICENSE.urw-base35.txt'
COPYING_FILE = 'assets/fonts/COPYING.urw-base35.txt'
WORDS = (
    'THE BINDERY', 'INSTRUMENT REPAIRS', 'SECONDHAND BOOKS',
    'MUSIC & SCORES', 'FLOWERS', 'TAILOR & ALTERATIONS',
    'TEA ROOMS', 'PRINT & COPY', 'CLOSED EARLY', 'FOR THE VIGIL',
)
MAX_TRIANGLES = 2000


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def arguments():
    raw = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='tools/chunk_surfer/generated/plaza-shop-lettering.json')
    parser.add_argument('--contact-sheet', default='')
    return parser.parse_args(raw)


def font_mesh(body, font, resolution):
    curve = bpy.data.curves.new('physical fascia / ' + body, 'FONT')
    curve.body = body
    curve.font = font
    curve.size = 1.0
    curve.align_x = 'LEFT'
    curve.align_y = 'BOTTOM_BASELINE'
    curve.space_character = 1.0
    curve.space_word = 1.0
    curve.resolution_u = resolution
    curve.dimensions = '2D'
    curve.fill_mode = 'FRONT'
    curve.extrude = 0.0
    curve.bevel_depth = 0.0
    ob = bpy.data.objects.new(curve.name, curve)
    bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.context.view_layer.update()
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    mesh = ob.data
    mesh.calc_loop_triangles()
    vertices = [[float(v.co.x), float(v.co.y)] for v in mesh.vertices]
    assert all(abs(float(v.co.z)) < 1e-9 for v in mesh.vertices), body + ': font is not flat'
    indices = []
    for triangle in mesh.loop_triangles:
        a, b, c = triangle.vertices
        pa, pb, pc = vertices[a], vertices[b], vertices[c]
        area = (pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0])
        if abs(area) < 1e-13:
            # FONT caps can emit a zero-area triangle along a collinear
            # straight-stem junction. It paints no area and must not ship.
            continue
        # The canonical front is +Z. Parent maps glyph X -> -local Z and
        # glyph Y -> local Y, preserving this winding as fascia normal +X.
        indices.extend([a, b, c] if area > 0 else [a, c, b])
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    if curve.users == 0:
        bpy.data.curves.remove(curve)
    return vertices, indices


def boundary_loops(vertices, indices):
    counts = Counter()
    directed = []
    for i in range(0, len(indices), 3):
        a, b, c = indices[i:i+3]
        for x, y in ((a, b), (b, c), (c, a)):
            counts[tuple(sorted((x, y)))] += 1
            directed.append((x, y))
    assert all(n <= 2 for n in counts.values()), 'Non-manifold planar edge'
    boundary = {(x, y) for x, y in directed if counts[tuple(sorted((x, y)))] == 1}
    following = {}
    for x, y in boundary:
        assert x not in following, 'Branched outline boundary'
        following[x] = y
    loops = []
    while boundary:
        a, b = next(iter(boundary))
        start = a
        loop = [a]
        while True:
            assert (a, b) in boundary, 'Outline did not close'
            boundary.remove((a, b))
            if b == start:
                break
            loop.append(b)
            a, b = b, following[b]
        area = sum(vertices[loop[i]][0]*vertices[loop[(i+1) % len(loop)]][1]
                   - vertices[loop[(i+1) % len(loop)]][0]*vertices[loop[i]][1]
                   for i in range(len(loop))) / 2
        assert abs(area) > 1e-12, 'Zero area outline'
        loops.append({'signedArea': area, 'vertices': len(loop)})
    return loops


def write_contact_sheet(file, entries):
    # A CPU triangle rasterizer: there is no Blender camera, material, render
    # engine, font rasterization or GPU involved in this inspection sheet.
    width, row_height, factor = 1600, 102, 2
    height = row_height * len(entries) + 32
    image = np.empty((height*factor, width*factor, 3), dtype=np.uint8)
    image[:] = (237, 232, 215)
    for row, entry in enumerate(entries):
        bounds = entry['bounds']
        scale = min((width-100)/(bounds['max'][0]-bounds['min'][0]), 54.0)
        center_y = 20 + row_height*(row+.5)
        points = [((width/2+x*scale)*factor, (center_y-y*scale)*factor)
                  for x, y in entry['vertices']]
        for offset in range(0, len(entry['indices']), 3):
            triangle = [points[i] for i in entry['indices'][offset:offset+3]]
            ymin = max(0, math.floor(min(p[1] for p in triangle)))
            ymax = min(height*factor, math.ceil(max(p[1] for p in triangle)))
            for y in range(ymin, ymax):
                scan, xs = y+.5, []
                for a, b in zip(triangle, triangle[1:]+triangle[:1]):
                    if min(a[1], b[1]) <= scan < max(a[1], b[1]):
                        xs.append(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]))
                if len(xs) == 2:
                    x0, x1 = max(0, math.ceil(min(xs)-.5)), min(width*factor, math.ceil(max(xs)-.5))
                    image[y, x0:x1] = (35, 41, 35)
        separator = int((20+(row+1)*row_height)*factor)
        if separator < height*factor:
            image[separator:separator+factor, 40*factor:(width-40)*factor] = (213, 207, 188)
    image = np.rint(image.reshape(height, factor, width, factor, 3).mean(axis=(1, 3))).astype(np.uint8)
    scanlines = b''.join(b'\x00'+image[y].tobytes() for y in range(height))
    def chunk(kind, data):
        return struct.pack('!I', len(data))+kind+data+struct.pack('!I', zlib.crc32(kind+data) & 0xffffffff)
    payload = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0))+chunk(b'IDAT', zlib.compress(scanlines, 9))+chunk(b'IEND', b'')
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(payload)


def main():
    args = arguments()
    assert sha(ROOT/FONT_FILE) == FONT_SHA, 'Pinned Nimbus Sans Bold changed; no system-font substitution allowed'
    font = bpy.data.fonts.load(str(ROOT/FONT_FILE), check_existing=True)
    h_vertices, _ = font_mesh('H', font, 3)
    cap_height = max(v[1] for v in h_vertices)-min(v[1] for v in h_vertices)
    assert cap_height > 0
    proofs = {}
    for glyph in sorted(set(''.join(WORDS)) - {' '}):
        vertices, indices = font_mesh(glyph, font, 3)
        loops = boundary_loops(vertices, indices)
        proofs[glyph] = {'counterHoles': sum(loop['signedArea'] < 0 for loop in loops),
                         'outerOutlines': sum(loop['signedArea'] > 0 for loop in loops),
                         'triangles': len(indices)//3}
    for glyph, count in {'A': 1, 'B': 2, 'D': 1, 'O': 1, 'P': 1, 'R': 1}.items():
        assert proofs[glyph]['counterHoles'] == count, glyph + ': real counter disappeared'
    entries = []
    for text in WORDS:
        resolution = 3
        vertices, indices = font_mesh(text, font, resolution)
        if len(indices)//3 > MAX_TRIANGLES:
            resolution = 2
            vertices, indices = font_mesh(text, font, resolution)
        assert len(indices)//3 <= MAX_TRIANGLES, text + ': exceeds triangle budget'
        original = {'min': [min(v[a] for v in vertices) for a in (0, 1)],
                    'max': [max(v[a] for v in vertices) for a in (0, 1)]}
        center = [(original['min'][a]+original['max'][a])/2 for a in (0, 1)]
        vertices = [[round((v[a]-center[a])/cap_height, 9) for a in (0, 1)] for v in vertices]
        assert all(math.isfinite(v) for p in vertices for v in p)
        loops = boundary_loops(vertices, indices)
        holes = sum(loop['signedArea'] < 0 for loop in loops)
        expected = sum(proofs[glyph]['counterHoles'] for glyph in text if glyph != ' ')
        assert holes == expected, text + ': tessellation changed a glyph counter'
        bounds = {'min': [min(v[a] for v in vertices) for a in (0, 1)],
                  'max': [max(v[a] for v in vertices) for a in (0, 1)]}
        entries.append({'id': text.lower().replace('&', 'and').replace(' ', '-'),
                        'text': text, 'vertices': vertices, 'indices': indices,
                        'bounds': bounds, 'capHeight': 1.0,
                        'baselineY': round(-center[1]/cap_height, 9),
                        'width': bounds['max'][0]-bounds['min'][0],
                        'height': bounds['max'][1]-bounds['min'][1],
                        'triangles': len(indices)//3, 'resolution': resolution,
                        'counterHoles': holes, 'expectedCounterHoles': expected,
                        'outlineLoops': len(loops)})
    data = {
        'schema': 1, 'kind': 'physical-fascia-lettering',
        'generator': {'file': 'tools/chunk_surfer/build-plaza-shop-lettering.py',
                      'sha256': sha(__file__), 'blender': bpy.app.version_string,
                      'method': 'Pinned Blender FONT curve, front fill, resolution3 (2 only if needed), no extrusion/bevel; actual mesh loop triangles. No textures, UVs, atlas growth or generated font substitutes.'},
        'font': {'file': FONT_FILE, 'sha256': FONT_SHA, 'family': 'Nimbus Sans', 'face': 'Bold',
                 'source': 'https://github.com/ArtifexSoftware/urw-base35-fonts',
                 'license': 'Vendored AGPL-3.0 with font embedding exception; original notices retained unchanged.',
                 'licenseFile': LICENSE_FILE, 'licenseSha256': sha(ROOT/LICENSE_FILE),
                 'copyingFile': COPYING_FILE, 'copyingSha256': sha(ROOT/COPYING_FILE)},
        'coordinates': {'dimensions': 'XY', 'units': 'H-cap-height equals1',
                        'origin': 'Center of actual ink bounds, not advance width',
                        'canonicalFrontNormal': [0, 0, 1],
                        'fasciaMapping': 'glyph X -> -local Z; glyph Y -> local Y; canonical front -> local +X',
                        'originalHCapHeight': cap_height},
        'limits': {'maximumTrianglesPerWord': MAX_TRIANGLES,
                   'actualMaximumTriangles': max(e['triangles'] for e in entries),
                   'totalTriangles': sum(e['triangles'] for e in entries)},
        'validation': {'allFinite': True, 'allFlat': True, 'allFrontWindingPositive': True,
                       'glyphCoverage': sorted(proofs), 'glyphProofs': proofs,
                       'counterHolesCheckedAgainstIndividualGlyphs': True,
                       'wordCoverage': list(WORDS), 'wordCount': len(entries)},
        'words': entries,
    }
    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT/output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=True)+'\n')
    if args.contact_sheet:
        write_contact_sheet(Path(args.contact_sheet), entries)
    print(json.dumps({'ok': True, 'output': str(output.relative_to(ROOT)),
                      'wordCount': len(entries), 'bytes': output.stat().st_size,
                      'fontSHA': FONT_SHA, 'limits': data['limits'],
                      'perWord': [{'text': e['text'], 'triangles': e['triangles'],
                                   'counterHoles': e['counterHoles']} for e in entries]}, indent=2))


if __name__ == '__main__':
    main()
