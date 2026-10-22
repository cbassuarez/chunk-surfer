#!/usr/bin/env python3
"""Reconstruct the former colour-encoding error as a causal study control.

This is NOT a literal historical build. The current geometry, materials, extras,
UVs and factor values remain unchanged. Only six PNG RGB payloads are reassigned
from correctly encoded sRGB to linear values stored as PNG display samples.
The harness independently controls readout mount depth; this script does not.
Python standard library only; PNG alpha and every non-IDAT chunk are preserved.
"""
import hashlib
import json
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'artifacts/source-drive-study/drive.glb'
OUT = ROOT / 'artifacts/source-drive-study/refinement/material-control'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def linear(display):
    display /= 255
    return display / 12.92 if display <= .04045 else ((display + .055) / 1.055) ** 2.4


def png_read(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    chunks, compressed, pos = [], bytearray(), 8
    while pos < len(data):
        size = struct.unpack_from('>I', data, pos)[0]
        kind, payload = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + size]
        assert zlib.crc32(kind + payload) & 0xffffffff == struct.unpack_from('>I', data, pos + 8 + size)[0]
        chunks.append((kind, payload))
        if kind == b'IHDR':
            width, height, depth, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
        if kind == b'IDAT':
            compressed.extend(payload)
        pos += size + 12
    assert depth == 8 and colour in (2, 6) and interlace == 0
    channels, raw = (4 if colour == 6 else 3), zlib.decompress(compressed)
    stride = width * channels
    previous, rows = bytearray(stride), []
    for row in range(height):
        offset = row * (stride + 1)
        filter_type = raw[offset]
        current = bytearray(raw[offset + 1:offset + 1 + stride])
        for x in range(stride):
            a = current[x - channels] if x >= channels else 0
            b, c = previous[x], previous[x - channels] if x >= channels else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = a
            elif filter_type == 2:
                predictor = b
            elif filter_type == 3:
                predictor = (a + b) // 2
            elif filter_type == 4:
                p = a + b - c
                distances = [abs(p - a), abs(p - b), abs(p - c)]
                predictor = (a, b, c)[distances.index(min(distances))]
            else:
                raise AssertionError('Unexpected PNG filter')
            current[x] = (current[x] + predictor) & 255
        rows.append(current)
        previous = current
    return width, height, channels, rows, chunks


def png_write(rows, chunks):
    raw = b''.join(b'\0' + bytes(row) for row in rows)
    result, inserted = bytearray(b'\x89PNG\r\n\x1a\n'), False
    for kind, payload in chunks:
        if kind == b'IDAT':
            if inserted:
                continue
            payload, inserted = zlib.compress(raw, 9), True
        result.extend(struct.pack('>I', len(payload)))
        result.extend(kind + payload)
        result.extend(struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))
    return bytes(result)


def means(rows, channels, decode=False):
    count = sum(len(row) // channels for row in rows)
    return [sum((linear(row[i + c]) if decode else row[i + c] / 255)
                for row in rows for i in range(0, len(row), channels)) / count for c in range(3)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = SOURCE.read_bytes()
    assert source[:4] == b'glTF' and struct.unpack_from('<I', source, 4)[0] == 2
    json_length = struct.unpack_from('<I', source, 12)[0]
    original = json.loads(source[20:20 + json_length])
    doc = json.loads(json.dumps(original))
    original_bin = source[28 + json_length:]
    binary = bytearray(original_bin)
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    images = {}
    for material in doc['materials']:
        colour = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if colour:
            image_id = doc['textures'][colour['index']]['source']
            images.setdefault(image_id, []).append(material['name'])
    assert len(images) == 6, 'Control requires exactly the six authored stock maps'
    changed_views, records = [], []
    for image_id, materials in sorted(images.items()):
        image = doc['images'][image_id]
        assert image.get('mimeType') == 'image/png'
        view_id = image['bufferView']
        view = doc['bufferViews'][view_id]
        before = original_bin[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        width, height, channels, rows, chunks = png_read(before)
        converted = [bytearray(row) for row in rows]
        for row in converted:
            for i in range(0, len(row), channels):
                for c in range(3):
                    row[i + c] = max(0, min(255, round(255 * linear(row[i + c]))))
        after = png_write(converted, chunks)
        aw, ah, ac, actual_rows, actual_chunks = png_read(after)
        assert (width, height, channels) == (aw, ah, ac)
        assert [(k, p) for k, p in chunks if k != b'IDAT'] == [(k, p) for k, p in actual_chunks if k != b'IDAT']
        alpha_preserved = channels == 3 or all(a[i] == b[i] for a, b in zip(rows, actual_rows) for i in range(3, len(a), 4))
        assert alpha_preserved
        binary.extend(b'\0' * (-len(binary) % 4))
        view['byteOffset'], view['byteLength'] = len(binary), len(after)
        binary.extend(after)
        changed_views.append(view_id)
        image_path = OUT / ('before-image-' + str(image_id) + '.png')
        image_path.write_bytes(after)
        records.append({'image': image_id, 'materials': materials, 'size': [width, height],
            'alphaPreserved': alpha_preserved, 'allNonIdatChunksPreserved': True,
            'currentPngSha256': sha(before), 'controlPngSha256': sha(after),
            'currentPngDisplayMean': means(rows, channels),
            'currentDecodedLinearMean': means(rows, channels, True),
            'controlPngDisplayMean': means(actual_rows, channels),
            'controlDecodedLinearMean': means(actual_rows, channels, True)})
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    # Verify that only image view addresses/lengths and total buffer length changed.
    comparable = json.loads(json.dumps(doc))
    comparable['buffers'] = original['buffers']
    for i in changed_views:
        comparable['bufferViews'][i] = original['bufferViews'][i]
    assert comparable == original, 'Unintended production data changed'
    assert binary[:len(original_bin)] == original_bin, 'Original geometry/binary prefix changed'
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    output = (struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(binary)) +
        struct.pack('<II', len(encoded), 0x4e4f534a) + encoded +
        struct.pack('<II', len(binary), 0x004e4942) + binary)
    destination = OUT / 'before.glb'
    destination.write_bytes(output)
    receipt = {'kind': 'reconstructed-material-encoding-causal-control',
        'literalHistoricalBuild': False,
        'purpose': 'Isolate the former base-colour encoding error at identical geometry, material factors, extras, camera and light settings.',
        'source': str(SOURCE.relative_to(ROOT)), 'sourceSha256': sha(source),
        'output': str(destination.relative_to(ROOT)), 'outputSha256': sha(output),
        'outputBytes': len(output), 'method': 'Decode each current sRGB PNG RGB byte to linear, quantize that linear value to an RGB8 PNG display sample. Preserve alpha and all non-IDAT PNG chunks.',
        'quantizationLimit': 'Reconstructed from current 8-bit sRGB maps; this reproduces the error mechanism, not the exact bytes of former linear maps.',
        'originalBinaryPrefixPreserved': True, 'allNonImageJsonUnchanged': True,
        'changedImageBufferViewsOnly': changed_views,
        'readoutDepth': {'modifiedHere': False, 'harnessBeforeMetres': .0244, 'harnessAfterMetres': .0262},
        'images': records,
        'limits': 'Controlled reconstructed asset. Matched native frames and rendering settings are recorded independently by the root harness.'}
    (OUT / 'provenance.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (OUT / 'README.md').write_text('# Reconstructed encoding control\n\nThis is **not a literal old build**. `before.glb` keeps the current geometry, UVs, materials, extras and factors. Only the six base-colour PNG RGB payloads reconstruct the earlier linear-as-display encoding mistake. PNG alpha and every non-IDAT metadata chunk are preserved. Current 8-bit sRGB input makes this a mechanism control, not an exact historical texture-byte recovery.\n\nThe root harness separately sets readout mount depth to 0.0244 m before and 0.0262 m after. No readout or geometry data is altered here. Camera, lighting and shader must remain identical in the matched comparison. `provenance.json` contains per-image actual display and decoded linear means, hashes and invariance checks.\n')
    print(json.dumps({'sourceSha256': receipt['sourceSha256'], 'outputSha256': receipt['outputSha256'], 'bytes': len(output), 'images': len(records), 'allNonImageJsonUnchanged': True, 'originalBinaryPrefixPreserved': True}, indent=2))


if __name__ == '__main__':
    main()
