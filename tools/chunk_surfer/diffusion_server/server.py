"""Diffusion-lens GPU server for chunk-surfer (M1c).

Protocol (must stay in sync with public/labs/chunk-surfer/src/net/diffusion.js):
  client -> server  binary JPEG      conditioning frame (the r3d base render)
  client -> server  text JSON        {"type":"prompt","prompt":str,"strength":float}
  server -> client  binary JPEG      styled frame
  server -> client  text JSON        {"type":"status", ...}

Single-session, newest-client-wins: a new connection evicts the previous one
(a crashed tab must never hold the only slot). Newest-frame-wins too: if
frames arrive while the GPU is busy, only the latest is diffused.

Seed policy is the client's: `fixed` (default) pins a place's identity across
frames and visits, `walk` lets it come apart. Character-suppressing negative
prompts are the client's job too — nothing appears in this world unless the
game puts it there.

Status: verified live on Modal (A10G): ~90ms/frame server-side with TAESD.
Deploy via modal_app.py; Dockerfile kept for other providers.
"""

import asyncio
import io
import json
import math
import os

import torch
from diffusers import AutoencoderTiny, AutoPipelineForImage2Image
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from PIL import Image

MODEL = "stabilityai/sd-turbo"
TINY_VAE = "madebyollin/taesd"  # ~10x faster encode/decode than the full VAE
SIZE = 512          # DO NOT LOWER. sd-turbo is trained at 512x512; at 384 the
                    # output degrades and at 320 it leaves the distribution
                    # entirely — photographs become cartoon line-art with
                    # glowing filaments. Resolution is not a performance lever
                    # here. (The real fps bottleneck was a client-side inflight
                    # leak, not the GPU: see diffusion.js pacing.)
JPEG_QUALITY = 72
SERVER_REV = "r11-512"

app = FastAPI()
pipe = None
busy_lock = asyncio.Lock()
# Newest client wins. Refusing the second connection meant a crashed or
# half-closed browser tab could hold the only session slot until the container
# scaled down, and every later attempt fell back to the base render.
active_ws: WebSocket | None = None


def load_pipe():
    global pipe
    if pipe is None:
        pipe = AutoPipelineForImage2Image.from_pretrained(
            MODEL, torch_dtype=torch.float16, variant="fp16"
        ).to("cuda")
        pipe.vae = AutoencoderTiny.from_pretrained(
            TINY_VAE, torch_dtype=torch.float16
        ).to("cuda")
        pipe.set_progress_bar_config(disable=True)
        # one warmup pass so the first client frame isn't multi-second
        warm = Image.new("RGB", (SIZE, SIZE), (10, 10, 12))
        pipe(prompt="warmup", image=warm, strength=0.5, num_inference_steps=2,
             guidance_scale=0.0)
    return pipe


def diffuse(jpeg_bytes: bytes, prompt: str, strength: float, passes: int,
            seed: int, guidance: float, negative: str) -> bytes:
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    src_size = img.size
    img = img.resize((SIZE, SIZE))
    # sd-turbo executes int(num_inference_steps * strength) UNet passes, and
    # that product must be >= 1 or the scheduler yields zero timesteps.
    # `passes` is the hallucination knob: more passes = further departure from
    # the conditioning geometry.
    steps = max(1, math.ceil(passes / max(strength, 0.05)))
    while int(steps * strength) < passes:
        steps += 1
    # Seed policy is the client's call (seed_mode). Pinned per zone: the place
    # keeps its identity frame to frame, and the crawl comes from the client's
    # feedback loop instead. Walking: the surfaces boil and the place forgets
    # itself — reserved for battle/rupture.
    gen = torch.Generator("cuda").manual_seed(seed)
    # sd-turbo is distilled for guidance_scale=0. Pushing CFG above that is
    # off-distribution and it *breaks* — oversaturation, latent smearing, the
    # over-recognition that turns plaster into faces. That failure is the
    # aesthetic. guidance≈0 gives a tidy interior; 2-4 gives the abyss.
    kwargs = {}
    if guidance > 0.05 and negative:
        kwargs["negative_prompt"] = negative
    out = load_pipe()(
        prompt=prompt, image=img, strength=strength,
        num_inference_steps=steps, guidance_scale=guidance, generator=gen, **kwargs,
    ).images[0]
    out = out.resize(src_size)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


@app.websocket("/")
async def session(ws: WebSocket):
    global active_ws
    expected = os.environ.get("LENS_TOKEN", "")
    if expected and ws.query_params.get("token") != expected:
        await ws.close(code=4401)
        return
    # evict whoever holds the slot; a stale tab must not lock the lens out
    if active_ws is not None:
        try:
            await active_ws.close(code=1012)  # service restart
        except Exception:
            pass
    await ws.accept()
    active_ws = ws
    prompt = "dark grimy concrete corridor, damp plaster, dread"
    negative = "person, people, human, figure, face, creature, clean, bright"
    strength = 0.5
    passes = 2
    guidance = 1.2
    seed_mode = "fixed"  # fixed = a place stays itself | walk = it comes apart
    seed = 7
    latest_frame: bytes | None = None
    task = None
    try:
        await ws.send_text(json.dumps({"type": "status", "model": MODEL, "rev": SERVER_REV, "ok": True}))
        loop = asyncio.get_event_loop()

        async def worker():
            nonlocal latest_frame, seed
            import time
            import traceback
            try:
                while True:
                    if latest_frame is None:
                        await asyncio.sleep(0.001)  # idle here is idle GPU
                        continue
                    frame, latest_frame = latest_frame, None
                    if seed_mode == "walk":
                        seed = (seed + 1) % 2_000_000_000
                    t0 = time.time()
                    async with busy_lock:
                        styled = await loop.run_in_executor(
                            None, diffuse, frame, prompt, strength, passes,
                            seed, guidance, negative
                        )
                    print(f"frame diffused in {time.time() - t0:.2f}s ({len(frame)}B -> {len(styled)}B)")
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
                latest_frame = msg["bytes"]  # newest wins
            elif msg.get("text"):
                data = json.loads(msg["text"])
                if data.get("type") == "prompt":
                    prompt = str(data.get("prompt", prompt))[:400]
                    negative = str(data.get("negative", negative))[:400]
                    strength = min(0.95, max(0.1, float(data.get("strength", strength))))
                    passes = min(6, max(1, int(data.get("passes", passes))))
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
        pass  # evicted mid-receive by a newer session
    finally:
        if active_ws is ws:
            active_ws = None
        if task:
            task.cancel()
