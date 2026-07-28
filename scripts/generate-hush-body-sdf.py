#!/usr/bin/env python3
"""Build the compact HUSH body texture from the cover-art silhouette.

The source smart object contains a deliberately faint full-canvas wash.  That
wash is part of the Photoshop composite, not part of the figure.  Distance
generation must therefore start from the authored, high-alpha body rather than
from ``alpha > 0`` or the billboard/card edge becomes a visible contour.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


OUTPUT_SIZE = (128, 256)
FIT_SIZE = (75, 228)
ALPHA_FLOOR = 32
MASK_THRESHOLD = 112
DISTANCE_RANGE = 28.0


def edt_1d(values: np.ndarray) -> np.ndarray:
    """Exact squared Euclidean distance transform (Felzenszwalb/Huttenlocher)."""
    length = int(values.shape[0])
    sites = np.zeros(length, dtype=np.int32)
    crossings = np.zeros(length + 1, dtype=np.float64)
    result = np.zeros(length, dtype=np.float64)
    k = 0
    sites[0] = 0
    crossings[0] = -np.inf
    crossings[1] = np.inf
    for q in range(1, length):
        while True:
            site = sites[k]
            crossing = ((values[q] + q * q) - (values[site] + site * site)) / (2.0 * (q - site))
            if crossing > crossings[k] or k == 0:
                break
            k -= 1
        if crossing <= crossings[k]:
            k = 0
        else:
            k += 1
        sites[k] = q
        crossings[k] = crossing
        crossings[k + 1] = np.inf
    k = 0
    for q in range(length):
        while crossings[k + 1] < q:
            k += 1
        delta = q - sites[k]
        result[q] = delta * delta + values[sites[k]]
    return result


def euclidean_distance_to(features: np.ndarray) -> np.ndarray:
    infinity = 1.0e12
    field = np.where(features, 0.0, infinity)
    horizontal = np.empty_like(field, dtype=np.float64)
    for y in range(field.shape[0]):
        horizontal[y, :] = edt_1d(field[y, :])
    squared = np.empty_like(horizontal, dtype=np.float64)
    for x in range(horizontal.shape[1]):
        squared[:, x] = edt_1d(horizontal[:, x])
    return np.sqrt(squared)


def source_body_alpha(source: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    alpha = np.asarray(source.convert('RGBA').getchannel('A'), dtype=np.uint8)
    body = alpha >= ALPHA_FLOOR
    ys, xs = np.nonzero(body)
    if not len(xs):
        raise ValueError(f'no figure pixels found at alpha >= {ALPHA_FLOOR}')
    bounds = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    # Erase the low-alpha smart-object wash before resampling.  Retain the
    # figure's authored antialiasing above the floor and remap it smoothly.
    cleaned = np.where(
        body,
        np.clip((alpha.astype(np.float32) - ALPHA_FLOOR) * (255.0 / (255 - ALPHA_FLOOR)), 0, 255),
        0,
    ).astype(np.uint8)
    return Image.fromarray(cleaned, mode='L').crop(bounds), bounds


def fit_body(alpha: Image.Image) -> tuple[np.ndarray, tuple[int, int]]:
    scale = min(FIT_SIZE[0] / alpha.width, FIT_SIZE[1] / alpha.height)
    fitted_size = (
        max(1, int(round(alpha.width * scale))),
        max(1, int(round(alpha.height * scale))),
    )
    fitted = alpha.resize(fitted_size, Image.Resampling.LANCZOS)
    card = Image.new('L', OUTPUT_SIZE, 0)
    offset = ((OUTPUT_SIZE[0] - fitted.width) // 2, (OUTPUT_SIZE[1] - fitted.height) // 2)
    card.paste(fitted, offset)
    return np.asarray(card, dtype=np.uint8), fitted_size


def encode_sdf(alpha: np.ndarray) -> Image.Image:
    mask = alpha >= MASK_THRESHOLD
    if not mask.any() or mask.all():
        raise ValueError('invalid silhouette mask')
    to_body = euclidean_distance_to(mask)
    to_air = euclidean_distance_to(~mask)
    signed = np.where(mask, np.maximum(0.0, to_air - 0.5), -np.maximum(0.0, to_body - 0.5))
    red = np.rint(np.clip(0.5 + signed / (DISTANCE_RANGE * 2.0), 0.0, 1.0) * 255.0).astype(np.uint8)
    height, width = alpha.shape
    blue = np.repeat(np.rint(np.linspace(255, 0, height))[:, None], width, axis=1).astype(np.uint8)
    rgba = np.dstack((red, alpha, blue, np.full_like(alpha, 255)))
    return Image.fromarray(rgba, mode='RGBA')


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path, help='cover-art silhouette PNG')
    parser.add_argument('--asset', type=Path, default=Path('assets/hush/hush-body-sdf.png'))
    parser.add_argument('--runtime', type=Path, default=Path('public/assets/hush/hush-body-sdf.png'))
    parser.add_argument('--provenance', type=Path, default=Path('assets/hush/provenance.json'))
    args = parser.parse_args()

    source = Image.open(args.source)
    cropped, source_bounds = source_body_alpha(source)
    alpha, fitted_size = fit_body(cropped)
    result = encode_sdf(alpha)
    for target in (args.asset, args.runtime):
        target.parent.mkdir(parents=True, exist_ok=True)
        result.save(target, format='PNG', optimize=True)

    # Semantic guard: neither source coverage nor the SDF zero crossing may
    # touch the card.  This is the regression that produced the bright box.
    rgba = np.asarray(result)
    border = np.concatenate((rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]))
    if int(border[:, 1].max()) != 0 or np.any((border[:, 0] >= 112) & (border[:, 0] <= 144)):
        raise RuntimeError('generated card edge participates in the HUSH mask')

    provenance = json.loads(args.provenance.read_text())
    provenance['source']['opaqueBounds'] = list(source_bounds)
    provenance['processed'].update({
        'sha256': sha256(args.asset),
        'fitSize': list(fitted_size),
        'alphaFloor': ALPHA_FLOOR,
        'maskThreshold': MASK_THRESHOLD,
        'generator': 'scripts/generate-hush-body-sdf.py',
        'distanceSource': 'thresholded figure alpha; smart-object canvas wash excluded',
    })
    args.provenance.write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'sha256': sha256(args.asset), 'sourceBounds': source_bounds, 'fitSize': fitted_size}))


if __name__ == '__main__':
    main()
