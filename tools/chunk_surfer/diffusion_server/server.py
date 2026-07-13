"""Diffusion-lens GPU server for chunk-surfer (M1c).

Protocol (must stay in sync with public/labs/chunk-surfer/src/net/diffusion.js):
  client -> server  binary JPEG      conditioning frame (the r3d base render)
  client -> server  text JSON        {"type":"prompt","prompt":str,"strength":float}
  server -> client  binary JPEG      styled frame
  server -> client  text JSON        {"type":"status", ...}

Each browser session has a newest-frame slot. Hidden tabs disconnect client-side;
visible tabs may coexist without evict/reconnect loops, and the shared device lock
serializes inference. If frames arrive while that device is busy, only the latest
frame for that session is diffused.

Seed policy is the client's: `fixed` (default) pins a place's identity across
frames and visits, `walk` lets it come apart. Character-suppressing negative
prompts are the client's job too — nothing appears in this world unless the
game puts it there.

The model lives in pipeline.py and is chosen by $LENS_MODEL (default sd15-hyper4).
This file owns the protocol and nothing else: it must not learn what a scheduler
is. It binds to loopback by default and is launched with `python server.py`.
"""

import asyncio
import json
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import pipeline

JPEG_QUALITY = 72
SERVER_REV = "r13-sd15-depth"

app = FastAPI()
lens = None
busy_lock = asyncio.Lock()


@app.get("/healthz")
def healthz():
    """Cheap readiness metadata. Never downloads or boots model weights."""
    device, _dtype = pipeline.pick_device()
    return {
        "ok": True,
        "service": "chunk-surfer-local-lens",
        "rev": SERVER_REV,
        "model": pipeline.DEFAULT_MODEL,
        "size": pipeline.SIZE,
        "device": device,
        "ready": lens is not None,
        "transport": "loopback",
    }


def load_lens():
    """Boot the model once. Which model is $LENS_MODEL's business, not ours."""
    global lens
    if lens is None:
        depth_env = os.environ.get("LENS_DEPTH")
        depth = None if depth_env is None else depth_env not in {"0", "false", "off"}
        lens = pipeline.build(style_lora=os.environ.get("LENS_STYLE_LORA") or None, depth=depth)
        print(f"lens up: {lens.status()}")
    return lens


# A frame, and the exact depth of THAT frame, in one message:
#
#     b'L2' | uint32 le frame length | frame JPEG | depth JPEG
#
# One message and never two. Sent separately they could desync by a frame under
# load, and a depth map one frame stale is a depth map of a room you have already
# left — worse than no depth at all, because the model believes it. A JPEG always
# begins FF D8 FF, so this magic can never be mistaken for a bare frame from an
# older client, which is what makes the change backward-compatible.
def unpack(data: bytes) -> tuple[bytes, bytes | None]:
    if len(data) > 6 and data[0:2] == b"L2":
        n = int.from_bytes(data[2:6], "little")
        if 0 < n <= len(data) - 6:
            return data[6:6 + n], data[6 + n:] or None
    return data, None


def diffuse(jpeg_bytes: bytes, prompt: str, strength: float, passes: int,
            seed: int, guidance: float, negative: str,
            depth_bytes: bytes | None = None, depth_scale: float | None = None) -> bytes:
    # Seed policy is the client's call (seed_mode). Pinned per zone: the place
    # keeps its identity frame to frame, and the crawl comes from the client's
    # feedback loop instead. Walking: the surfaces boil and the place forgets
    # itself — reserved for battle/rupture.
    return pipeline.diffuse(
        load_lens(), jpeg_bytes, prompt, strength, passes, seed, guidance,
        negative, quality=JPEG_QUALITY,
        depth_bytes=depth_bytes, depth_scale=depth_scale,
    )


@app.websocket("/")
async def session(ws: WebSocket):
    await ws.accept()
    prompt = "dark grimy concrete corridor, damp plaster, dread"
    negative = "person, people, human, figure, face, creature, clean, bright"
    strength = 0.5
    passes = 2
    guidance = 1.2
    seed_mode = "fixed"  # fixed = a place stays itself | walk = it comes apart
    seed = 7
    depth_scale = None                     # None = pipeline's LENS_DEPTH_SCALE
    # The frame and its depth are one thing and are dropped as one thing. Holding
    # them in a single slot is what makes "newest wins" unable to pair a frame
    # with the depth of a different frame.
    latest: tuple[bytes, bytes | None] | None = None
    task = None
    try:
        await ws.send_text(json.dumps({
            "type": "status", "rev": SERVER_REV, "ok": True, **load_lens().status(),
        }))
        loop = asyncio.get_event_loop()

        async def worker():
            nonlocal latest, seed
            import time
            import traceback
            try:
                while True:
                    if latest is None:
                        await asyncio.sleep(0.001)  # idle here is idle GPU
                        continue
                    (frame, dep), latest = latest, None
                    if seed_mode == "walk":
                        seed = (seed + 1) % 2_000_000_000
                    t0 = time.time()
                    async with busy_lock:
                        styled = await loop.run_in_executor(
                            None, diffuse, frame, prompt, strength, passes,
                            seed, guidance, negative, dep, depth_scale
                        )
                    d = f" +{len(dep)}B depth" if dep else " (blind)"
                    print(f"frame diffused in {time.time() - t0:.2f}s ({len(frame)}B{d} -> {len(styled)}B)")
                    await ws.send_bytes(styled)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # surface, don't die silently
                print("WORKER CRASH:\n" + traceback.format_exc())
                try:
                    await ws.send_text(json.dumps({"type": "status", "error": str(e)[:300]}))
                except Exception:
                    pass

        task = asyncio.ensure_future(worker())
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes"):
                latest = unpack(msg["bytes"])  # newest wins, frame+depth together
            elif msg.get("text"):
                data = json.loads(msg["text"])
                if data.get("type") == "prompt":
                    # How hard the geometry is allowed to insist. A live knob,
                    # because the right answer is a matter of taste and the
                    # tuner is where taste gets decided.
                    if data.get("depthScale") is not None:
                        depth_scale = min(1.5, max(0.0, float(data["depthScale"])))
                    prompt = str(data.get("prompt", prompt))[:400]
                    negative = str(data.get("negative", negative))[:400]
                    strength = min(0.95, max(0.1, float(data.get("strength", strength))))
                    requested_passes = min(6, max(1, int(data.get("passes", passes))))
                    passes = 1 if load_lens().device == "mps" else requested_passes
                    guidance = min(8.0, max(0.0, float(data.get("guidance", guidance))))
                    seed_mode = "walk" if data.get("seedMode") == "walk" else "fixed"
                    # A seed pinned per zone keeps a *place* recognisably itself
                    # across frames; the texture still crawls via client-side
                    # feedback. Walking the seed is reserved for scenes that
                    # are meant to come apart (battle, rupture).
                    if data.get("seed") is not None:
                        seed = int(data["seed"]) % 2_000_000_000
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        pass  # socket closed while a worker was returning its newest frame
    finally:
        if task:
            task.cancel()


# Local GPU: `python server.py`; lens.local.json points at ws://127.0.0.1:8000.
if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("LENS_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("LENS_HOST must be loopback; the diffusion service is local-only")
    if os.environ.get("LENS_EAGER", "1") != "0":
        load_lens()
    uvicorn.run(app, host=host, port=int(os.environ.get("LENS_PORT", "8000")))
