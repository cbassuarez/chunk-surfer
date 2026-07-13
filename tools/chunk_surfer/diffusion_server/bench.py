"""Is the new lens fast enough, and does it still look like the game?

    .venv-local/bin/python bench.py                      # every model, one frame each
    .venv-local/bin/python bench.py --model sd15-dmd2 -n 20
    .venv-local/bin/python bench.py --frame shot.jpg     # condition on a real render

Two questions, and they are not the same question:

  1. MS/FRAME. The client paces at ~16fps and the GPU has never been the
     bottleneck; what we need to know is whether SD1.5+LoRA stays inside the
     budget sd-turbo set (~25ms on an A10G, and whatever this machine does).
     Reported as a median, because the mean of a GPU is a lie told by the first
     frame.

  2. DOES IT STILL SCARE. Writes a contact sheet: the same conditioning frame,
     the same prompt, the same seed, through every model. The knobs in
     README.md were swept against sd-turbo and are not automatically true of
     SD1.5 — this is how we find out which of them survived.

Nothing here imports the server. A benchmark that needs a WebSocket is a
benchmark measuring a WebSocket.
"""

from __future__ import annotations

import argparse
import io
import statistics
import time
from pathlib import Path

from PIL import Image, ImageDraw

import pipeline

# The lens grammar, lifted from src/net/zone-prompts.js. Kept verbatim so the
# bench is testing the game's prompt and not a prompt a benchmark made up.
PROMPT = (
    "dark condemned conservatory corridor, damp plaster and stained concrete, "
    "architectural surfaces stay legible but unstable, grime and water damage "
    "resolving into repeating room-tone striations, underexposed, black shadows, "
    "heavy film grain, found footage, desaturated, empty, deserted, dread"
)
NEGATIVE = "person, people, human, figure, face, creature, clean, bright"
SEED = 10_411  # main_b3, from ZONE_SEEDS


def synthetic_frame() -> Image.Image:
    """A corridor, roughly: two walls in perspective and a dark end. Stands in for
    the raymarcher when nobody has handed us a real capture."""
    img = Image.new("RGB", (pipeline.SIZE, pipeline.SIZE), (12, 12, 14))
    d = ImageDraw.Draw(img)
    c = pipeline.SIZE // 2
    for i in range(9, 0, -1):
        k = i / 9
        s = int(c * k)
        v = int(70 * (1 - k) + 14)
        d.rectangle([c - s, c - s, c + s, c + s], outline=(v, v, v + 3), width=3)
    d.rectangle([c - 40, c - 30, c + 40, c + 40], fill=(6, 6, 7))
    return img


def to_jpeg(img: Image.Image, q: int = 90) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=q)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append", help="repeatable; default = all")
    ap.add_argument("-n", "--frames", type=int, default=8)
    ap.add_argument("--frame", type=Path, help="a real capture to condition on")
    ap.add_argument("--strength", type=float, default=0.42)   # explore defaults,
    ap.add_argument("--guidance", type=float, default=1.2)    # from README.md
    ap.add_argument("--passes", type=int, default=1)
    ap.add_argument("--out", type=Path, default=Path("bench-out"))
    # The exact depth of --frame, straight from the raymarcher. With it, the same
    # model twice: blind, then sighted. That comparison is the whole ControlNet
    # argument, and it should be visible without being told which is which.
    ap.add_argument("--depth", type=Path, help="grey depth map of --frame")
    ap.add_argument("--depth-scale", type=float, default=0.6)
    args = ap.parse_args()

    src = Image.open(args.frame) if args.frame else synthetic_frame()
    jpeg = to_jpeg(src.resize((pipeline.SIZE, pipeline.SIZE)))
    keys = args.model or list(pipeline.MODELS)
    args.out.mkdir(exist_ok=True)
    (args.out / "_source.jpg").write_bytes(jpeg)

    device, dtype = pipeline.pick_device()
    print(f"\ndevice: {device} / {dtype}")
    print(f"knobs:  strength={args.strength} guidance={args.guidance} passes={args.passes} seed={SEED}\n")

    depth_jpeg = None
    if args.depth:
        depth_jpeg = to_jpeg(Image.open(args.depth).convert("RGB").resize((pipeline.SIZE, pipeline.SIZE)))
        (args.out / "_depthmap.jpg").write_bytes(depth_jpeg)
        print(f"depth:  {args.depth} @ scale {args.depth_scale}\n")

    rows = []
    for key in keys:
        model = pipeline.MODELS[key]
        # With a depth map in hand, run each capable model TWICE — blind and
        # sighted — because "the ControlNet helps" is a claim, and a claim you
        # cannot see side by side is a claim you are taking on faith.
        variants = [(key, None)]
        if depth_jpeg is not None and model.controlnet:
            variants = [(f"{key}-blind", None), (f"{key}-depth", depth_jpeg)]

        for label, dep in variants:
            print(f"── {label}: {model.label}{' + depth' if dep else ''}")
            t0 = time.time()
            try:
                lens = pipeline.build(key, depth=dep is not None)
            except Exception as e:
                print(f"   LOAD FAILED: {str(e)[:200]}\n")
                rows.append((label, None, None, f"load failed: {str(e)[:60]}"))
                continue
            load_s = time.time() - t0
            if lens.degraded:
                print(f"   DEGRADED: {lens.degraded}")

            times = []
            for i in range(args.frames):
                t = time.time()
                out = pipeline.diffuse(
                    lens, jpeg, PROMPT, args.strength, args.passes,
                    SEED, args.guidance, NEGATIVE,
                    depth_bytes=dep, depth_scale=args.depth_scale,
                )
                times.append((time.time() - t) * 1000)
            (args.out / f"{label}.jpg").write_bytes(out)
            med = statistics.median(times)
            print(f"   load {load_s:5.1f}s · median {med:6.1f}ms · {1000 / med:4.1f}fps"
                  f" · steps={model.steps_for(args.strength, args.passes)}"
                  f" · best {min(times):.0f}ms worst {max(times):.0f}ms\n")
            rows.append((label, med, 1000 / med, lens.degraded or ""))
            del lens

    print("─" * 74)
    print(f"{'model':<20}{'ms/frame':>10}{'fps':>7}   note")
    for key, med, fps, note in rows:
        if med is None:
            print(f"{key:<20}{'—':>10}{'—':>7}   {note}")
        else:
            print(f"{key:<20}{med:>10.0f}{fps:>7.1f}   {note}")
    print(f"\ncontact sheet: {args.out}/  (compare against _source.jpg)")


if __name__ == "__main__":
    main()
