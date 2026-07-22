"""Diffusion-lens GPU server for chunk-surfer (M1c).

Protocol (must stay in sync with src/net/diffusion.js):
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
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import pipeline
from cache_contract import material_cache_key

JPEG_QUALITY = 72
SERVER_REV = "r15-boil-frames"
CACHE_SCHEMA = 3
LENS_TOKEN = os.environ.get("LENS_TOKEN", "")
CACHE_DIR = Path(os.environ.get("LENS_CACHE_DIR", Path.home() / ".cache" / "chunk-surfer" / "lens-v2"))

app = FastAPI()
lens = None
busy_lock = asyncio.Lock()
manifest_lock = threading.Lock()
manifest_cache: dict[str, dict] = {}


def compatibility_error() -> str | None:
    device, _dtype = pipeline.pick_device()
    expected = os.environ.get("LENS_EXPECT_BACKEND")
    if device not in {"cuda", "mps"}:
        if expected == "cuda":
            return "unsupported GPU: NVIDIA CUDA hardware and a compatible driver are required"
        if expected == "mps":
            return "unsupported GPU: Apple Silicon MPS is required"
        return "unsupported GPU: Apple Silicon MPS or NVIDIA CUDA is required"
    if expected and device != expected:
        return f"incompatible GPU backend: package requires {expected}, detected {device}"
    return None


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
        "supported": compatibility_error() is None,
        "error": compatibility_error(),
        "cacheSchema": CACHE_SCHEMA,
        "weightsSha256": pipeline.bundled_weights_sha256() or os.environ.get("LENS_WEIGHTS_SHA256") or None,
    }


def load_lens():
    """Boot the model once. Which model is $LENS_MODEL's business, not ours."""
    global lens
    error = compatibility_error()
    if error:
        raise RuntimeError(error)
    if lens is None:
        depth_env = os.environ.get("LENS_DEPTH")
        depth = None if depth_env is None else depth_env not in {"0", "false", "off"}
        lens = pipeline.build(style_lora=os.environ.get("LENS_STYLE_LORA") or None, depth=depth)
        print(f"lens up: {lens.status()}")
    return lens


def safe_bank_id(value) -> str:
    bank_id = str(value or "unknown")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,47}", bank_id):
        raise ValueError("invalid bankId")
    return bank_id


def manifest_path(bank_id: str) -> Path:
    return CACHE_DIR / bank_id / "manifest.json"


def read_manifest(bank_id: str) -> dict:
    if bank_id in manifest_cache:
        return manifest_cache[bank_id]
    path = manifest_path(bank_id)
    try:
        data = json.loads(path.read_text("utf-8"))
        result = data if data.get("schema") == CACHE_SCHEMA else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        result = {}
    manifest_cache[bank_id] = result
    return result


# Manifest entries key slot AND boil frame: a bank ships K temporal frames per
# surface, and keying by slot alone would make each frame evict the last.
def manifest_entry_key(slot: int, frame: int) -> str:
    return f"{int(slot)}:{int(frame)}"


def cached_result(bank_id: str, slot: int, frame: int, cache_key: str, cache_path: Path) -> bytes | None:
    entry = read_manifest(bank_id).get("entries", {}).get(manifest_entry_key(slot, frame), {})
    if entry.get("cacheKey") != cache_key or entry.get("file") != cache_path.name:
        return None
    try:
        payload = cache_path.read_bytes()
    except OSError:
        return None
    return payload if hashlib.sha256(payload).hexdigest() == entry.get("sha256") else None


def record_manifest(bank_id: str, slot: int, frame: int, cache_key: str, cache_path: Path,
                    payload_sha256: str, work: dict) -> None:
    with manifest_lock:
        manifest = read_manifest(bank_id)
        entries = manifest.get("entries", {})
        entries[manifest_entry_key(slot, frame)] = {
            "file": cache_path.name,
            "cacheKey": cache_key,
            "sha256": payload_sha256,
            "requestId": work.get("requestId"),
            "recipeSha256": work.get("recipeSha256"),
        }
        document = {
            "schema": CACHE_SCHEMA,
            "serviceRevision": SERVER_REV,
            "modelId": pipeline.DEFAULT_MODEL,
            "resolution": pipeline.SIZE,
            "weightsSha256": pipeline.bundled_weights_sha256() or os.environ.get("LENS_WEIGHTS_SHA256"),
            "sourceAtlasSha256": work.get("sourceAtlasSha256"),
            "bankId": bank_id,
            "updatedAt": int(time.time()),
            "entries": entries,
        }
        path = manifest_path(bank_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        temp.write_text(json.dumps(document, sort_keys=True, separators=(",", ":")), "utf-8")
        os.replace(temp, path)
        manifest_cache[bank_id] = document


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
    if LENS_TOKEN and ws.query_params.get("token") != LENS_TOKEN:
        await ws.close(code=1008, reason="invalid lens token")
        return
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
    latest: tuple[bytes, bytes | None, dict] | None = None
    request = {"type": "legacy", "requestId": None, "bankId": None, "slot": -1}
    task = None
    try:
        error = compatibility_error()
        if error:
            await ws.send_text(json.dumps({
                "type": "error", "phase": "hardware", "code": "UNSUPPORTED_GPU",
                "error": error, "modelId": pipeline.DEFAULT_MODEL,
            }))
            await ws.close(code=1011, reason="unsupported GPU")
            return
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, pipeline.validate_bundled_resources)
        except Exception as exc:
            await ws.send_text(json.dumps({
                "type": "error", "phase": "resources", "code": "MODEL_VALIDATION_FAILED",
                "modelId": pipeline.DEFAULT_MODEL, "error": str(exc)[:300],
            }))
            await ws.close(code=1011, reason="model validation failed")
            return
        device, _dtype = pipeline.pick_device()
        model = pipeline.MODELS[pipeline.DEFAULT_MODEL]
        await ws.send_text(json.dumps({
            "type": "status", "rev": SERVER_REV, "ok": True,
            "supported": True,
            "cacheSchema": CACHE_SCHEMA,
            "weightsSha256": pipeline.bundled_weights_sha256() or os.environ.get("LENS_WEIGHTS_SHA256") or None,
            "modelId": pipeline.DEFAULT_MODEL,
            "model": model.key, "label": model.label, "device": device,
            "steps": model.distilled_steps, "size": pipeline.SIZE,
            "depth": lens.depth if lens is not None else False,
            "degraded": (lens.degraded or None) if lens is not None else None,
            "ready": lens is not None,
        }))

        async def worker():
            nonlocal latest, seed
            import time
            import traceback
            try:
                while True:
                    if latest is None:
                        await asyncio.sleep(0.001)  # idle here is idle GPU
                        continue
                    (frame, dep, work), latest = latest, None
                    if seed_mode == "walk":
                        seed = (seed + 1) % 2_000_000_000
                    t0 = time.time()
                    cache_path = None
                    cache_key = None
                    bank_id = None
                    if work.get("type") in {"generate", "mutate"}:
                        bank_id = safe_bank_id(work.get("bankId"))
                        if work.get("modelId") != pipeline.DEFAULT_MODEL:
                            raise ValueError(f"modelId must be {pipeline.DEFAULT_MODEL}")
                        if work.get("checksumId") != f"sha256:{work.get('recipeSha256')}":
                            raise ValueError("checksumId must identify the profile recipe")
                        for field in ("recipeSha256", "sourceAtlasSha256"):
                            if not re.fullmatch(r"[0-9a-f]{64}", str(work.get(field) or "")):
                                raise ValueError(f"invalid {field}")
                        if int(work.get("slot", -1)) not in range(10):
                            raise ValueError("slot must be between 0 and 9")
                        if int(work.get("frame", 0)) not in range(8):
                            raise ValueError("frame must be between 0 and 7")
                        if work.get("cacheSchema") != CACHE_SCHEMA:
                            raise ValueError(f"cacheSchema must be {CACHE_SCHEMA}")
                        # Authored boot banks are content-addressed and persistent.
                        # Runtime mutations are intentionally ephemeral: caching a
                        # new seed every few seconds would create unbounded disk use.
                        if work.get("type") == "generate":
                            cache_key = material_cache_key(
                                work=work,
                                source_sha256=hashlib.sha256(frame).hexdigest(),
                                model_id=pipeline.DEFAULT_MODEL,
                                resolution=pipeline.SIZE,
                                weights_sha256=pipeline.bundled_weights_sha256() or os.environ.get("LENS_WEIGHTS_SHA256"),
                                service_revision=SERVER_REV,
                                cache_schema=CACHE_SCHEMA,
                            )
                            cache_path = CACHE_DIR / bank_id / f"{work.get('slot', -1)}-{int(work.get('frame', 0))}-{cache_key}.jpg"
                    cached_payload = cached_result(bank_id, int(work["slot"]), int(work.get("frame", 0)), cache_key, cache_path) if cache_path else None
                    cached = cached_payload is not None
                    if cached_payload is not None:
                        styled = cached_payload
                    else:
                        async with busy_lock:
                            if lens is None:
                                await ws.send_text(json.dumps({
                                    "type": "progress", "phase": "model", "state": "loading",
                                    "modelId": pipeline.DEFAULT_MODEL,
                                }))
                                active_lens = await loop.run_in_executor(None, load_lens)
                                await ws.send_text(json.dumps({
                                    "type": "status", "rev": SERVER_REV, "ok": True,
                                    "supported": True, "ready": True,
                                    "cacheSchema": CACHE_SCHEMA,
                                    "weightsSha256": pipeline.bundled_weights_sha256() or os.environ.get("LENS_WEIGHTS_SHA256") or None,
                                    "modelId": pipeline.DEFAULT_MODEL,
                                    **active_lens.status(),
                                }))
                            await ws.send_text(json.dumps({
                                "type": "progress", "phase": "generating",
                                "requestId": work.get("requestId"), "bankId": work.get("bankId"),
                                "slot": work.get("slot"), "modelId": pipeline.DEFAULT_MODEL,
                            }))
                            styled = await loop.run_in_executor(
                                None, diffuse, frame, prompt, strength, passes,
                                seed, guidance, negative, dep, depth_scale
                            )
                        if cache_path:
                            cache_path.parent.mkdir(parents=True, exist_ok=True)
                            temp_path = cache_path.with_suffix(".tmp")
                            temp_path.write_bytes(styled)
                            os.replace(temp_path, cache_path)
                    payload_sha256 = hashlib.sha256(styled).hexdigest()
                    if cache_path and not cached:
                        record_manifest(bank_id, int(work["slot"]), int(work.get("frame", 0)), cache_key, cache_path, payload_sha256, work)
                    d = f" +{len(dep)}B depth" if dep else " (blind)"
                    print(f"frame diffused in {time.time() - t0:.2f}s ({len(frame)}B{d} -> {len(styled)}B)")
                    if work.get("type") in {"generate", "mutate"}:
                        await ws.send_text(json.dumps({
                            "type": "result", "requestId": work.get("requestId"),
                            "bankId": work.get("bankId"), "slot": work.get("slot"),
                            "frame": int(work.get("frame", 0)),
                            "modelId": pipeline.DEFAULT_MODEL,
                            "checksumId": f"sha256:{payload_sha256}",
                            "sha256": payload_sha256, "cached": cached,
                        }))
                    elif work.get("type") == "frame":
                        # Possession bursts: live full-frame img2img, never cached,
                        # newest-wins like everything else in this slot.
                        await ws.send_text(json.dumps({
                            "type": "result", "requestId": work.get("requestId"),
                            "kind": "frame",
                            "modelId": pipeline.DEFAULT_MODEL,
                            "sha256": payload_sha256, "cached": False,
                        }))
                    await ws.send_bytes(styled)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # surface, don't die silently
                print("WORKER CRASH:\n" + traceback.format_exc())
                try:
                    await ws.send_text(json.dumps({
                        "type": "error", "phase": "generation", "code": "GENERATION_FAILED",
                        "requestId": (request or {}).get("requestId"),
                        "bankId": (request or {}).get("bankId"),
                        "slot": (request or {}).get("slot"),
                        "modelId": pipeline.DEFAULT_MODEL, "error": str(e)[:300],
                    }))
                except Exception:
                    pass

        task = asyncio.ensure_future(worker())
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes"):
                frame, dep = unpack(msg["bytes"])
                latest = (frame, dep, dict(request))
            elif msg.get("text"):
                data = json.loads(msg["text"])
                if data.get("type") in {"prompt", "generate", "mutate", "frame"}:
                    request = dict(data)
                    # How hard the geometry is allowed to insist. A live knob,
                    # because the right answer is a matter of taste and the
                    # tuner is where taste gets decided.
                    if data.get("depthScale") is not None:
                        depth_scale = min(1.5, max(0.0, float(data["depthScale"])))
                    prompt = str(data.get("prompt", prompt))[:400]
                    negative = str(data.get("negative", negative))[:400]
                    strength = min(0.95, max(0.1, float(data.get("strength", strength))))
                    requested_passes = min(6, max(1, int(data.get("passes", passes))))
                    passes = requested_passes
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
            await asyncio.gather(task, return_exceptions=True)


# Local GPU: `python server.py`; lens.local.json points at ws://127.0.0.1:8000.
if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("LENS_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("LENS_HOST must be loopback; the diffusion service is local-only")
    if os.environ.get("LENS_EAGER", "1") != "0":
        load_lens()
    uvicorn.run(app, host=host, port=int(os.environ.get("LENS_PORT", "8000")))
