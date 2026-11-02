#!/usr/bin/env python3
"""Package exact game Canvas exports and the shipping 5x7 ROM for itch.

No imaging or font dependencies are needed. Raster assets are decoded without
alteration; the two fonts carry the exported character ROM as TrueType outlines
inside ordinary TTF and zlib-compressed WOFF containers. They are not new type
designs. Run after the browser export has written skin-export.json.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
EM = 1000
ADVANCE = 720
COLS = 5
ROWS = 7
# The fallback is electronic-text.js's existing TOFU, never an invented glyph.
NOTDEF = (31, 17, 17, 17, 17, 17, 31)
ASSETS = {
    "plate": "plate-image",
    "glass": "glass-image",
    "glass-cover": "glass-cover",
    "annunciator": "annunciator-image",
    "lcd": "lcd-image",
    "cap-white": "cap-white",
    "cap-white-pressed": "cap-white-pressed",
    "cap-amber": "cap-amber",
    "cap-amber-pressed": "cap-amber-pressed",
    "cap-red": "cap-red",
    "cap-red-pressed": "cap-red-pressed",
}


def pack(fmt: str, *values: int | bytes) -> bytes:
    return struct.pack(">" + fmt, *values)


def pad4(data: bytes) -> bytes:
    return data + bytes((-len(data)) % 4)


def checksum(data: bytes) -> int:
    padded = pad4(data)
    return sum(struct.unpack(">" + "I" * (len(padded) // 4), padded)) & 0xFFFFFFFF


def contours_for(rows: tuple[int, ...], mode: str) -> list[list[tuple[int, int, bool]]]:
    """Use the production cell pads, pitch and lit dot/pixel geometry.

    Canvas has a downward y axis; a font has an upward y axis. Eight quadratic
    arcs approximate each VFD circle to sub-font-unit accuracy. LCD pixels use
    electronic-text.js's exact .08 inset and .84 fill within the .8 cell area.
    """
    step_x = ADVANCE * 0.8 / COLS
    step_y = EM * 0.8 / ROWS
    radius = min(step_x, step_y) * 0.42
    contours = []
    for row, mask in enumerate(rows):
        for col in range(COLS):
            if not (mask >> (COLS - 1 - col)) & 1:
                continue
            if mode == "lcd":
                x = ADVANCE * 0.1 + col * step_x + step_x * 0.08
                y = EM * 0.1 + row * step_y + step_y * 0.08
                w, h = step_x * 0.84, step_y * 0.84
                # Clockwise outer contour after converting Canvas coordinates.
                points = [(x, EM - y), (x + w, EM - y),
                          (x + w, EM - y - h), (x, EM - y - h)]
                contours.append([(round(px), round(py), True) for px, py in points])
            else:
                cx = ADVANCE * 0.1 + step_x * (col + 0.5)
                cy = EM - (EM * 0.1 + step_y * (row + 0.5))
                points = []
                # Alternating on-curve endpoints and exact tangent controls.
                for arc in range(8):
                    angle = -arc * math.pi / 4
                    points.append((round(cx + radius * math.cos(angle)),
                                   round(cy + radius * math.sin(angle)), True))
                    mid = angle - math.pi / 8
                    control_radius = radius / math.cos(math.pi / 8)
                    points.append((round(cx + control_radius * math.cos(mid)),
                                   round(cy + control_radius * math.sin(mid)), False))
                contours.append(points)
    return contours


def glyph_data(contours: list[list[tuple[int, int, bool]]]) -> tuple[bytes, tuple[int, int, int, int]]:
    if not contours:
        return b"", (0, 0, 0, 0)
    points = [point for contour in contours for point in contour]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    bounds = min(xs), min(ys), max(xs), max(ys)
    data = pack("hhhhh", len(contours), *bounds)
    end = -1
    for contour in contours:
        end += len(contour)
        data += pack("H", end)
    data += pack("H", 0)  # No hinting instructions.
    # Keep simple full signed deltas; WOFF's zlib removes repetition efficiently.
    data += bytes(1 if point[2] else 0 for point in points)
    previous = 0
    for x in xs:
        data += pack("h", x - previous)
        previous = x
    previous = 0
    for y in ys:
        data += pack("h", y - previous)
        previous = y
    return pad4(data), bounds


def make_cmap(mapping: dict[int, int]) -> bytes:
    # Format 4 directly maps every BMP codepoint, with no glyph-array offsets.
    segments: list[list[int]] = []
    for codepoint, glyph in sorted(mapping.items()):
        if not 0 <= codepoint < 0xFFFF:
            raise ValueError("This exported ROM requires BMP codepoints")
        delta = (glyph - codepoint) & 0xFFFF
        if segments and codepoint == segments[-1][1] + 1 and delta == segments[-1][2]:
            segments[-1][1] = codepoint
        else:
            segments.append([codepoint, codepoint, delta])
    segments.append([0xFFFF, 0xFFFF, 1])
    count = len(segments)
    power = 1 << (count.bit_length() - 1)
    body = pack("HHHHHHH", 4, 16 + 8 * count, 0, count * 2,
                power * 2, power.bit_length() - 1, count * 2 - power * 2)
    body += b"".join(pack("H", s[1]) for s in segments) + pack("H", 0)
    body += b"".join(pack("H", s[0]) for s in segments)
    body += b"".join(pack("H", s[2]) for s in segments)
    body += bytes(count * 2)
    # Both Unicode and Windows Unicode BMP records share the same subtable.
    return pack("HH", 0, 2) + pack("HHI", 0, 3, 20) + pack("HHI", 3, 1, 20) + body


def make_names(family: str) -> bytes:
    names = {
        0: "Authored Chunk Surfer character ROM; generated browser outline transport.",
        1: family, 2: "Regular", 3: family + "-1.0", 4: family,
        5: "Version 1.0", 6: family,
    }
    data, records = b"", b""
    for name_id, text in names.items():
        encoded = text.encode("utf-16-be")
        records += pack("HHHHHH", 3, 1, 0x0409, name_id, len(encoded), len(data))
        data += encoded
    return pack("HHH", 0, len(names), 6 + len(records)) + records + data


def make_font(glyphs: dict[str, list[int] | None], family: str, mode: str) -> tuple[bytes, bytes, dict]:
    unique_rows = [NOTDEF]
    row_ids = {NOTDEF: 0}
    mapping = {}
    for codepoint, rows in sorted(glyphs.items(), key=lambda pair: int(pair[0])):
        cp = int(codepoint)
        if rows is None:
            mapping[cp] = 0
            continue
        row = tuple(rows)
        if len(row) != ROWS or any(type(v) is not int or not 0 <= v < (1 << COLS) for v in row):
            raise ValueError(f"Invalid exported glyph {cp}")
        if row not in row_ids:
            row_ids[row] = len(unique_rows)
            unique_rows.append(row)
        mapping[cp] = row_ids[row]

    glyf, locations, bounds, point_counts, contour_counts = b"", [0], [], [], []
    for rows in unique_rows:
        contours = contours_for(rows, mode)
        data, box = glyph_data(contours)
        glyf += data
        locations.append(len(glyf))
        bounds.append(box)
        point_counts.append(sum(map(len, contours)))
        contour_counts.append(len(contours))
    count = len(unique_rows)
    xmin, ymin = min(b[0] for b in bounds), min(b[1] for b in bounds)
    xmax, ymax = max(b[2] for b in bounds), max(b[3] for b in bounds)
    min_lsb = min(b[0] for b in bounds)
    min_rsb = min(ADVANCE - b[2] for b in bounds)

    head = pack("IIIIHHQQhhhhHHhhh", 0x10000, 0x10000, 0, 0x5F0F3CF5, 3, EM,
                0, 0, xmin, ymin, xmax, ymax, 0, 8, 2, 1, 0)
    hhea = pack("IhhhHhhhhhhhhhhhH", 0x10000, EM, 0, 0, ADVANCE, min_lsb,
                min_rsb, xmax, 1, 0, 0, 0, 0, 0, 0, 0, count)
    maxp = pack("I" + "H" * 14, 0x10000, count, max(point_counts), max(contour_counts),
                0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    os2 = pack("HhHHH" + "h" * 11, 0, ADVANCE, 400, 5, 0,
               650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0)
    os2 += bytes(10) + pack("IIII", 3, 0, 0, 0) + b"CHNK"
    os2 += pack("HHHhhhHH", 0x40, min(mapping), max(mapping), EM, 0, 0, EM, 0)
    post = pack("IihhIIIII", 0x30000, 0, -100, 50, 1, 0, 0, 0, 0)
    assert len(head) == 54 and len(hhea) == 36 and len(maxp) == 32
    assert len(os2) == 78 and len(post) == 32
    tables = {
        "OS/2": os2, "cmap": make_cmap(mapping), "glyf": glyf, "head": head,
        "hhea": hhea, "hmtx": b"".join(pack("Hh", ADVANCE, b[0]) for b in bounds),
        "loca": b"".join(pack("I", loc) for loc in locations), "maxp": maxp,
        "name": make_names(family), "post": post,
    }
    tags = sorted(tables)
    n_tables = len(tags)
    power = 1 << (n_tables.bit_length() - 1)
    sfnt_header = pack("IHHHH", 0x10000, n_tables, power * 16,
                       power.bit_length() - 1, n_tables * 16 - power * 16)
    offset = 12 + n_tables * 16
    records, data, checksums, offsets = b"", b"", {}, {}
    for tag in tags:
        raw = tables[tag]
        checksums[tag], offsets[tag] = checksum(raw), offset
        records += pack("4sIII", tag.encode("ascii"), checksums[tag], offset, len(raw))
        data += pad4(raw)
        offset += len(pad4(raw))
    ttf = bytearray(sfnt_header + records + data)
    adjustment = (0xB1B0AFBA - checksum(ttf)) & 0xFFFFFFFF
    struct.pack_into(">I", ttf, offsets["head"] + 8, adjustment)
    tables["head"] = bytes(ttf[offsets["head"]:offsets["head"] + len(head)])
    assert checksum(ttf) == 0xB1B0AFBA

    # WOFF 1 is a compact zlib transport for these exact same sfnt tables.
    offset = 44 + n_tables * 20
    records, data = b"", b""
    for tag in tags:
        raw = tables[tag]
        compressed = zlib.compress(raw, 9)
        stored = compressed if len(compressed) < len(raw) else raw
        records += pack("4sIIII", tag.encode("ascii"), offset, len(stored), len(raw), checksums[tag])
        data += pad4(stored)
        offset += len(pad4(stored))
    woff = pack("4sIIHHIHHIIIII", b"wOFF", 0x10000, offset, n_tables, 0,
                len(ttf), 1, 0, 0, 0, 0, 0, 0) + records + data
    assert len(woff) == offset
    # Check every WOFF table round-trips, including the adjusted head.
    for i, tag in enumerate(tags):
        _, at, stored_len, original_len, _ = struct.unpack_from(">4sIIII", woff, 44 + i * 20)
        stored = woff[at:at + stored_len]
        raw = zlib.decompress(stored) if stored_len < original_len else stored
        assert raw == tables[tag]
    return bytes(ttf), woff, {
        "family": family, "mode": mode, "unitsPerEm": EM,
        "advance": ADVANCE, "mappedCodepoints": len(mapping),
        "unsupportedCodepointsMappedToNotdef": sum(v is None for v in glyphs.values()),
        "uniqueGlyphsIncludingNotdef": count, "ttfBytes": len(ttf), "woffBytes": len(woff),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "artifacts/itch-realignment/skin-export.json")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/media/storefront")
    parser.add_argument("--css", type=Path, default=ROOT / "artifacts/itch-realignment/skin-assets.css")
    args = parser.parse_args()
    export_bytes = args.input.read_bytes()
    source = json.loads(export_bytes)
    if not source.get("ready"):
        raise ValueError("Canvas export is not marked ready")
    if set(source["assets"]) != set(ASSETS):
        raise ValueError("Expected the eleven reviewed Canvas export assets")
    args.output.mkdir(parents=True, exist_ok=True)
    args.css.parent.mkdir(parents=True, exist_ok=True)
    asset_metadata, variables = {}, []
    for key, variable in ASSETS.items():
        url = source["assets"][key]
        prefix = "data:image/webp;base64,"
        if not url.startswith(prefix):
            raise ValueError(f"Not a WebP export: {key}")
        raw = base64.b64decode(url[len(prefix):], validate=True)
        if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
            raise ValueError(f"Invalid WebP container: {key}")
        filename = key + ".webp"
        (args.output / filename).write_bytes(raw)
        asset_metadata[filename] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        variables.append(f'  --cs-{variable}:url("{url}");')

    faces, font_metadata = [], []
    for family, mode in [("ChunkVFD", "vfd"), ("ChunkLCD", "lcd")]:
        ttf, woff, metadata = make_font(source["glyphs"], family, mode)
        (args.output / (family + ".ttf")).write_bytes(ttf)
        (args.output / (family + ".woff")).write_bytes(woff)
        data_url = base64.b64encode(woff).decode("ascii")
        faces.append(f'@font-face{{font-family:"{family}";src:url("data:font/woff;base64,{data_url}") format("woff");font-style:normal;font-weight:400;font-display:swap;}}')
        font_metadata.append(metadata)
    # The passive legends use the same vendored faces as hardware-faceplate.js,
    # rather than whichever Arial substitute a visitor happens to have.
    for filename, weight in [("NimbusSans-Regular.otf", "400"), ("NimbusSans-Bold.otf", "600 700")]:
        raw = (ROOT / "assets/fonts" / filename).read_bytes()
        (args.output / filename).write_bytes(raw)
        encoded = base64.b64encode(raw).decode("ascii")
        faces.append(f'@font-face{{font-family:"Hardware Sans";src:url("data:font/otf;base64,{encoded}") format("opentype");font-style:normal;font-weight:{weight};font-display:swap;}}')
        font_metadata.append({"family": "Hardware Sans", "weight": weight,
                              "source": "assets/fonts/" + filename,
                              "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    for filename in ["LICENSE.urw-base35.txt", "COPYING.urw-base35.txt"]:
        (args.output / filename).write_bytes((ROOT / "assets/fonts" / filename).read_bytes())
    provenance = {
        "source": source["source"],
        "input": str(args.input.relative_to(ROOT)) if args.input.is_relative_to(ROOT) else str(args.input),
        "inputSha256": hashlib.sha256(export_bytes).hexdigest(),
        "rasterProcess": "Base64 decoded without resampling, recoloring or image editing.",
        "rasters": asset_metadata,
        "fonts": font_metadata,
        "fontSources": ["src/render/vfd-font.js", "src/render/electronic-text.js"],
        "fontGeometry": {
            "characterMatrix": "5 columns by 7 rows; exported production ROM only",
            "vfd": "10 percent cell padding; radius = min(stepX, stepY) * .42; eight quadratic arcs per lit circle",
            "lcd": "10 percent cell padding; .08 pitch inset; .84 pitch rectangular lit pixels",
            "notdef": "Existing electronic-text.js TOFU [31,17,17,17,17,17,31]",
        },
        "limits": [
            "Fonts preserve lit glyph geometry, not Canvas additive glow, dormant dots, view-dependent glass or electrical state.",
            "The VFD Canvas painter's minimum 0.7*dpr dot radius is size-dependent; scalable font outlines use the proportional production radius.",
            "TrueType integer rounding and quadratic circle approximation are sub-font-unit outline transport limits.",
            "All unsupported codepoints exported as null map to the existing .notdef fallback; no new letterforms are authored.",
            "The raster skins are static exports at their exported dimensions and state; browser layout, focus and genuine interaction states require separate validation.",
        ],
    }
    (args.output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    comment = "/* Generated by scripts/build-storefront-skin.py from exact production Canvas exports and glyph ROM. See docs/media/storefront/provenance.json for geometry and static transport limits. */\n"
    args.css.write_text(comment + "\n".join(faces) + "\n#wrapper{\n" + "\n".join(variables) + "\n}\n")
    print(json.dumps({"assets": asset_metadata, "fonts": font_metadata, "cssBytes": args.css.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
