"""One real loopback frame through the running local lens."""

import asyncio
import io
import json
import time
from pathlib import Path

import websockets
from PIL import Image


def jpeg(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, "JPEG", quality=72)
    return out.getvalue()


def surface_tile(size: int) -> bytes:
    root = Path(__file__).resolve().parents[3]
    strip = Image.open(root / "public/labs/chunk-surfer/assets/surfaces/surface-albedo.jpg").convert("RGB")
    native = strip.width
    tile = strip.crop((0, 0, native, native)).resize((size, size))
    out = Path(__file__).with_name("bench-out")
    out.mkdir(exist_ok=True)
    tile.save(out / "surface-source.jpg", quality=90)
    return jpeg(tile)


async def main():
    async with websockets.connect("ws://127.0.0.1:8000", max_size=16_000_000) as ws:
        status = json.loads(await ws.recv())
        if not status.get("ok"):
            raise SystemExit(f"lens refused session: {status}")
        await ws.send(json.dumps({
            "type": "prompt",
            "prompt": "seamless tileable reclaimed brick wall material, damp age and mineral staining, orthographic flat albedo texture, fine physical detail, even illumination, no perspective",
            "negative": "person, face, figure, object, furniture, room, corridor, perspective, lamp, text, fog",
            "strength": 0.18,
            "passes": 1,
            "guidance": 1.05,
            "seedMode": "fixed",
            "seed": 10411,
            "depthScale": 0.6,
        }))
        size = int(status.get("size") or 256)
        source = surface_tile(size)
        started = time.perf_counter()
        await ws.send(source)
        styled = await asyncio.wait_for(ws.recv(), timeout=60)
        elapsed = (time.perf_counter() - started) * 1000
        if not isinstance(styled, bytes) or not styled.startswith(b"\xff\xd8\xff"):
            raise SystemExit("local lens did not return a JPEG frame")
        (Path(__file__).with_name("bench-out") / "surface-dream.jpg").write_bytes(styled)
        print(json.dumps({
            "ok": True,
            "model": status.get("model"),
            "device": status.get("device"),
            "depth": bool(status.get("depth")),
            "rttMs": round(elapsed),
            "bytes": len(styled),
        }))


if __name__ == "__main__":
    asyncio.run(main())
