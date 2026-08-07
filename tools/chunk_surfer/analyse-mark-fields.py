#!/usr/bin/env python3
"""What the generated tiles actually contain, measured rather than asserted.

The lens spends its whole budget producing material that reaches the player
through a one-bit threshold. Before rebuilding the renderer around a mark field
derived from those tiles, the tiles had to be asked whether they contain a mark
field at all. This is the script that asked, and it stays in the repo because
every prompt or strength edit in look-profiles.js changes its answers.

WHAT IT FOUND, against 577 cached tiles:

  Orientation belongs to the MATERIAL, not the bank. Ash wood floor reads 0.91
  directional consistency, reclaimed brick 0.59, polished concrete 0.16 — a
  0.70 spread that is simply the source atlas showing through img2img. Averaged
  across all ten slots it vanishes (calm 0.310, rupture 0.326), which is what
  you get for averaging wood against concrete and is why the first pass at this
  measurement was wrong.

  Bank identity is density and scale. Local contrast runs calm 0.049 to rupture
  0.141 — 191% — and the frequency centroid 27.2 to 36.6.

  Rupture HOMOGENISES. Across-material orientation variance collapses 45%
  (std 0.240 -> 0.132): grain destroyed where it existed (wood -0.32, brick
  -0.21) and invented where it never did (terrazzo +0.20, ceramic +0.15). The
  building forgets what it is made of. That figure is now a design target, so
  --check exists to keep a well-meaning prompt tweak from deleting it.

Uses the diffusion service's own venv (numpy arrives with torch/diffusers):

    tools/chunk_surfer/diffusion_server/.venv-local/bin/python \\
        tools/chunk_surfer/analyse-mark-fields.py [--json out.json] [--check]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover - developer tooling
    sys.exit("needs numpy and pillow; run with diffusion_server/.venv-local/bin/python")

CACHE = Path(os.environ.get("LENS_CACHE_DIR", Path.home() / ".cache" / "chunk-surfer" / "lens-v2"))
BANKS = ("calm", "explore", "booth", "battle", "hush", "rupture")
# src/net/diffusion.js SURFACE_NAMES, in slot order. Cache files are named
# {slot}-{frame}-{key}.jpg, so slot needs no manifest read.
SLOTS = (
    "reclaimed brick", "split-face stone", "ash wood floor", "quartzite floor",
    "blue pool mosaic", "white ceramic tile", "polished terrazzo", "travertine",
    "rammed-earth plaster", "concrete cladding",
)
# The recorder's stipple runs at patternScale 36-46 per metre against 512px
# tiles, so the marks the engraving cares about are small. Measure there.
TENSOR_RADIUS = 4
# Rupture must stay at least this far below calm in across-material orientation
# variance, or it has stopped being the bank that forgets what things are.
HOMOGENISATION_FLOOR = 0.30


def box_sum(a: np.ndarray, r: int) -> np.ndarray:
    """Separable box sum over a (2r+1) window, edges replicated."""
    pad = np.pad(a, r, mode="edge")
    c = np.cumsum(pad, axis=0)
    rows = c[2 * r:, :] - np.pad(c[:-2 * r, :], ((1, 0), (0, 0)))[:-1, :]
    c = np.cumsum(rows, axis=1)
    return c[:, 2 * r:] - np.pad(c[:, :-2 * r], ((0, 0), (1, 0)))[:, :-1]


def structure_tensor(gray: np.ndarray, r: int = TENSOR_RADIUS):
    """Coherence and doubled-angle orientation.

    The angle is doubled because a grain is a LINE, not a vector: 0 and 180
    degrees are the same grain, and only 2*theta interpolates and mips across
    that wrap without tearing. This is the same encoding the shader will use.
    """
    gy, gx = np.gradient(gray)
    jxx, jyy, jxy = box_sum(gx * gx, r), box_sum(gy * gy, r), box_sum(gx * gy, r)
    trace = jxx + jyy
    # (l1-l2)/(l1+l2) for a symmetric 2x2, without an eigendecomposition.
    spread = np.sqrt(np.maximum(0.0, (jxx - jyy) ** 2 + 4.0 * jxy ** 2))
    coherence = np.where(trace > 1e-9, spread / np.maximum(trace, 1e-9), 0.0)
    return coherence, np.arctan2(2.0 * jxy, jxx - jyy), trace


def tile_stats(path: Path) -> dict | None:
    image = Image.open(path).convert("L")
    gray = np.asarray(image, dtype=np.float64) / 255.0
    coherence, theta2, trace = structure_tensor(gray)

    # Only judge direction where there is gradient energy to have one.
    strong = trace > np.percentile(trace, 60)
    if strong.sum() < 64:
        return None
    weights = coherence[strong]
    resultant = np.array([
        (weights * np.cos(theta2[strong])).sum(),
        (weights * np.sin(theta2[strong])).sum(),
    ])
    direction = float(np.linalg.norm(resultant) / max(weights.sum(), 1e-9))

    # Density: local contrast, subsampled — this is a statistic, not an image.
    pad = np.pad(gray, TENSOR_RADIUS, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(
        pad, (2 * TENSOR_RADIUS + 1, 2 * TENSOR_RADIUS + 1))[::4, ::4]
    contrast = float(windows.std(axis=(-1, -2)).mean())

    # Scale: radial centroid of the power spectrum, in cycles per tile.
    small = np.asarray(image.resize((256, 256)), dtype=np.float64) / 255.0
    spectrum = np.fft.fftshift(np.abs(np.fft.fft2(small - small.mean())))
    h, w = spectrum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    radius = np.hypot(yy - h / 2, xx - w / 2)
    keep = (radius > 2) & (radius < min(h, w) / 2)
    power = spectrum[keep] ** 2
    centroid = float((radius[keep] * power).sum() / max(power.sum(), 1e-9))

    return {
        "coherence": float(weights.mean()),
        "direction": direction,
        "contrast": contrast,
        "centroid": centroid,
        "luma": float(gray.mean()),
    }


def collect() -> dict:
    per_cell = defaultdict(list)
    for bank in BANKS:
        folder = CACHE / bank
        if not folder.is_dir():
            continue
        for jpg in sorted(folder.glob("*.jpg")):
            head = jpg.name.split("-", 1)[0]
            if not head.isdigit():
                continue
            slot = int(head)
            if not 0 <= slot < len(SLOTS):
                continue
            stats = tile_stats(jpg)
            if stats:
                per_cell[(bank, slot)].append(stats)
    return per_cell


def mean_of(cells, bank, slot, key):
    values = [row[key] for row in cells.get((bank, slot), [])]
    return float(np.mean(values)) if values else float("nan")


def report(cells) -> dict:
    banks = [b for b in BANKS if any(k[0] == b for k in cells)]
    if not banks:
        sys.exit(f"no cached tiles under {CACHE} — run the lens once first")

    print("tile-wide directional consistency by material  (1 = whole tile runs one way)\n")
    header = f"{'material':22}" + "".join(f"{b[:7]:>9}" for b in banks)
    print(header)
    print("-" * len(header))
    direction = {}
    for slot, name in enumerate(SLOTS):
        row = [mean_of(cells, b, slot, "direction") for b in banks]
        if all(v != v for v in row):
            continue
        direction[slot] = row
        print(f"{name:22}" + "".join(f"{v:9.3f}" if v == v else f"{'-':>9}" for v in row))

    print(f"\n{'bank':10}{'tiles':>7}{'coherence':>11}{'contrast':>10}{'centroid':>10}"
          f"{'dir spread':>12}")
    summary = {}
    for index, bank in enumerate(banks):
        rows = [r for (b, _), v in cells.items() if b == bank for r in v]
        column = np.array([direction[s][index] for s in direction if direction[s][index] == direction[s][index]])
        summary[bank] = {
            "tiles": len(rows),
            "coherence": float(np.mean([r["coherence"] for r in rows])),
            "contrast": float(np.mean([r["contrast"] for r in rows])),
            "centroid": float(np.mean([r["centroid"] for r in rows])),
            # The load-bearing number: how much the materials still differ from
            # each other. High = the building still knows what it is made of.
            "materialSpread": float(column.std()),
        }
        s = summary[bank]
        print(f"{bank:10}{s['tiles']:7d}{s['coherence']:11.3f}{s['contrast']:10.4f}"
              f"{s['centroid']:10.2f}{s['materialSpread']:12.3f}")

    if "calm" in summary and "rupture" in summary:
        base, torn = summary["calm"]["materialSpread"], summary["rupture"]["materialSpread"]
        collapse = 1.0 - torn / max(base, 1e-9)
        print(f"\nhomogenisation: calm {base:.3f} -> rupture {torn:.3f}  "
              f"= {collapse * 100:.0f}% collapse")
        print("  the building forgetting what it is made of, as a number")
        summary["homogenisation"] = collapse
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", type=Path, help="write the summary for a test to consume")
    parser.add_argument("--check", action="store_true",
                        help=f"fail unless rupture homogenises by >= {HOMOGENISATION_FLOOR:.0%}")
    args = parser.parse_args()

    summary = report(collect())
    if args.json:
        args.json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.json}")
    if args.check:
        collapse = summary.get("homogenisation")
        if collapse is None:
            print("\nFAIL: need both calm and rupture banks cached to check", file=sys.stderr)
            return 1
        if collapse < HOMOGENISATION_FLOOR:
            print(f"\nFAIL: rupture homogenises by {collapse:.0%}, floor is "
                  f"{HOMOGENISATION_FLOOR:.0%}. A prompt or strength edit has given the "
                  f"rupture bank its materials back.", file=sys.stderr)
            return 1
        print(f"\nOK: homogenisation {collapse:.0%} >= floor {HOMOGENISATION_FLOOR:.0%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
