#!/usr/bin/env python3
"""Verify the isolated exported GLB, rather than Blender's working image values.

Catches the original double-sRGB/dark-cabin failure, opt-in material routing, passive
reflector emission, and an approved readout hidden behind its opaque recess.
No renderer, browser or production data is modified. Python standard library only.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[3]
EXPECTED = {
    'warm grey enamel / formed metal': (.43, .415, .355),
    'textured warm charcoal ABS': (.055, .064, .060),
    'oxblood worn vinyl': (.145, .061, .042),
    'damp road aggregate': (.065, .069, .064),
    'damp old concrete': (.18, .19, .166),
    'dead grass and bank': (.105, .114, .070),
}

def png_pixels(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'Embedded base colour is not PNG'
    compressed = bytearray()
    pos = 8
    while pos < len(data):
        size = struct.unpack_from('>I', data, pos)[0]
        kind, payload = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + size]
        if kind == b'IHDR':
            width, height, depth, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
        if kind == b'IDAT': compressed.extend(payload)
        pos += size + 12
    assert depth == 8 and colour in (2, 6) and interlace == 0, 'Expected non-interlaced RGB(A)8 PNG'
    channels = 4 if colour == 6 else 3
    stride = width * channels
    raw, previous, result = zlib.decompress(compressed), bytearray(stride), []
    for row in range(height):
        offset = row * (stride + 1)
        filter_type = raw[offset]
        current = bytearray(raw[offset + 1:offset + 1 + stride])
        for x in range(stride):
            a = current[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if filter_type == 0: predictor = 0
            elif filter_type == 1: predictor = a
            elif filter_type == 2: predictor = b
            elif filter_type == 3: predictor = (a + b) // 2
            elif filter_type == 4:
                p = a + b - c
                distances = (abs(p - a), abs(p - b), abs(p - c))
                predictor = (a, b, c)[distances.index(min(distances))]
            else: raise AssertionError('Unsupported PNG filter')
            current[x] = (current[x] + predictor) & 255
        result.extend(tuple(current[x:x + channels]) for x in range(0, stride, channels))
        previous = current
    return width, height, channels, result

def linear(value):
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--glb', type=Path, default=ROOT / 'artifacts/source-drive-study/drive.glb')
    parser.add_argument('--metrics', type=Path, default=ROOT / 'artifacts/source-drive-study/geometry/metrics.json')
    parser.add_argument('--report', type=Path, default=ROOT / 'artifacts/source-drive-study/geometry/material-transfer-validation.json')
    args = parser.parse_args()
    data = args.glb.read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
    json_length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_length])
    binary = data[28 + json_length:]
    metrics = json.loads(args.metrics.read_text())
    checks, texture_rows = {}, []
    for material in doc['materials']:
        name = material['name']
        extras = material.get('extras', {})
        checks['localFinish:' + name] = extras.get('studyLocalFinish') is True and extras.get('materialFactors') == 'gltf'
        if name not in EXPECTED: continue
        pbr = material['pbrMetallicRoughness']
        factor = pbr.get('baseColorFactor', [1, 1, 1, 1])
        checks['whiteTextureFactor:' + name] = factor == [1, 1, 1, 1]
        image = doc['images'][doc['textures'][pbr['baseColorTexture']['index']]['source']]
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        encoded = binary[start:start + view['byteLength']]
        width, height, channels, pixels = png_pixels(encoded)
        encoded_mean = [sum(p[c] for p in pixels) / len(pixels) / 255 for c in range(3)]
        decoded_mean = [sum(linear(p[c]) for p in pixels) / len(pixels) for c in range(3)]
        expected = EXPECTED[name]
        error = max(abs(a - b) for a, b in zip(decoded_mean, expected))
        checks['decodedLinearBase:' + name] = error < .0025
        checks['opaqueTexture:' + name] = channels == 3 or all(p[3] == 255 for p in pixels)
        texture_rows.append({'material': name, 'size': [width, height], 'intendedLinearBase': expected,
            'embeddedPngMeanSRGB': encoded_mean, 'decodedLinearMean': decoded_mean,
            'maximumMeanError': error, 'embeddedPngSha256': hashlib.sha256(encoded).hexdigest()})
    checks['sixExpectedStocksPresent'] = len(texture_rows) == 6
    passive = [m for m in doc['materials'] if m['name'].startswith('passive ')]
    checks['passiveReflectorsDoNotEmit'] = len(passive) == 2 and all(not any(m.get('emissiveFactor', [0, 0, 0])) for m in passive)
    checks['poweredHeadlampSeparate'] = any(m['name'] == 'powered headlamp diffuser' and any(m.get('emissiveFactor', [0, 0, 0])) for m in doc['materials'])

    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        size = struct.calcsize(fmt) * components
        stride = view.get('byteStride', size)
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + fmt * components, binary, offset + i * stride) for i in range(a['count'])]

    # Intersect opaque recorder-body triangles at points across the actual readout.
    # This detects an occluding support face even if the whole mesh also has taller
    # screws or buttons outside the screen footprint.
    body = next(m for m in doc['meshes'] if m['name'] == metrics['recorder']['bodyMesh'])
    triangles = []
    for primitive in body['primitives']:
        positions = accessor(primitive['attributes']['POSITION'])
        ids = [i[0] for i in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
        triangles.extend(tuple(positions[ids[i + j]] for j in range(3)) for i in range(0, len(ids), 3))
    centre, screen_size = metrics['recorder']['readoutLocalCenter'], metrics['recorder']['readoutSize']
    fronts = []
    for ix in range(9):
        for iy in range(7):
            x = centre[0] + screen_size[0] * (.8 * ix / 8 - .4)
            y = centre[1] + screen_size[1] * (.8 * iy / 6 - .4)
            hits = []
            for a, b, c in triangles:
                determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(determinant) < 1e-12: continue
                u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant
                v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant
                if min(u, v, 1 - u - v) >= -1e-7: hits.append(u * a[2] + v * b[2] + (1 - u - v) * c[2])
            assert hits, 'Screen sample has no actual body backing'
            fronts.append(max(hits))
    clearance = centre[2] - max(fronts)
    checks['readoutAboveOpaqueBacking'] = clearance >= .0005
    # Guards explicitly confirm both former defects would fail these criteria.
    checks['oldLinearPngWouldFail'] = all(max(abs(linear(round(v * 255)) - v) for v in base) > .01 for base in EXPECTED.values())
    checks['oldReadoutWouldFail'] = .0244 - max(fronts) < 0
    report = {'kind': 'exported-drive-material-and-readout-regression-check',
        'sha256': hashlib.sha256(data).hexdigest(), 'source': str(args.glb.relative_to(ROOT)),
        'textureTransfer': 'linear authoring -> sRGB PNG -> production SRGB8 decode -> linear lighting',
        'textures': texture_rows, 'recorder': {'sampledBackingPoints': len(fronts), 'maximumBackingFrontZ': max(fronts),
            'readoutLocalZ': centre[2], 'minimumClearanceMetres': clearance},
        'checks': checks, 'passed': all(checks.values()),
        'limits': 'Export/numeric proof only. Native lighting, dither, movement and perception require root capture.'}
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'checks': len(checks), 'sha256': report['sha256'],
        'screenClearanceM': clearance, 'textures': texture_rows}, indent=2))
    raise SystemExit(0 if report['passed'] else 1)

if __name__ == '__main__': main()
