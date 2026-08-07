"""The lens, as a swappable thing.

Everything that knows what model we are running lives here. server.py knows the
loopback protocol; this file knows diffusion, and the server should not learn
model-specific branches.

WHY WE ARE LEAVING sd-turbo
---------------------------
sd-turbo is a distilled SD2.1 and it did its job: 512², one UNet pass, ~25ms on
an A10G. Three things it cannot do, all of which we now want:

  · BE FINE-TUNED. The 2.1 fine-tuning ecosystem is thin to the point of
    nonexistent. Nobody trains for it. We want a ROOM TONE LoRA — a lens that has
    actually seen a condemned conservatory — and to have that we must be on a
    base the world trains against, which is SD1.5.
  · SHIP. The Turbo weights went out under Stability's non-commercial terms.
    This is going to be a game somebody pays for. (SD1.5 is OpenRAIL-M.)
  · TAKE A CONTROLNET. We raymarch: we have exact depth for every pixel and we
    are currently throwing it away. Depth conditioning is the single largest
    quality win available to this project and it is an SD1.5-shaped hole.

The speed we would lose by moving to a 20-step base, we buy back with a
step-DISTILLATION LoRA (DMD2 / Hyper-SD / LCM). Those turn SD1.5 into a 1–4 step
model while leaving it a fine-tunable, controllable SD1.5 underneath. That is the
whole trick, and it is why the migration is not a downgrade.

WHAT A MODEL HAS TO TELL US
---------------------------
Turbo and distilled-LoRA models disagree about how steps and guidance work, and
the disagreement is exactly what a naive swap gets wrong. So a Model states it:

  · `steps_for(strength, passes)` — how many nominal steps yield `passes` real
    UNet evaluations at this strength. img2img runs int(steps * strength) of
    them, and that product must be >= 1 or the scheduler hands back nothing.
  · `native_guidance` — the CFG the model was distilled for. Everything above it
    is off-distribution, and off-distribution is where the horror is (see the
    knob table in README.md). We keep the client's guidance knob pointed at the
    cliff on purpose; we just need to know where the cliff starts.
"""

from __future__ import annotations

import io

import numpy as np
import hashlib
import json
import math
import os
import sys
from dataclasses import dataclass, field

import torch
from diffusers import (
    AutoencoderTiny,
    AutoPipelineForImage2Image,
    ControlNetModel,
    LCMScheduler,
    StableDiffusionControlNetImg2ImgPipeline,
    TCDScheduler,
)
from diffusers.utils import logging as diffusers_logging
from PIL import Image

# Diffusers' component-loading progress bar constructs tqdm's multiprocessing
# RLock even though this service has no worker processes. If the sidecar is
# stopped before tqdm's module finalizer runs, Python reports that lock as a
# leaked semaphore. The game has its own loading UI, so prevent the unused
# progress machinery (and its semaphore) from being created at all.
diffusers_logging.disable_progress_bar()

_bundled_env = os.environ.get("LENS_BUNDLED")
# The game always passes LENS_BUNDLED=1. A frozen sidecar launched directly or
# by an older shell must still fail closed against its packaged resources rather
# than silently downloading several gigabytes from Hugging Face.
BUNDLED = _bundled_env == "1" or (_bundled_env is None and bool(getattr(sys, "frozen", False)))
MODEL_ROOT = os.environ.get("LENS_MODEL_ROOT")
RESOURCE_ROOT = os.environ.get("LENS_RESOURCE_DIR")
_validated_weights_sha256: str | None = None


def _model_ref(remote: str, folder: str) -> str:
    if not BUNDLED:
        return remote
    if not MODEL_ROOT:
        raise RuntimeError("LENS_MODEL_ROOT is required for the bundled service")
    local = os.path.join(MODEL_ROOT, folder)
    if not os.path.isdir(local):
        raise RuntimeError(f"bundled model resource is missing: {local}")
    return local


def validate_bundled_resources() -> str | None:
    """Verify every packaged model byte before the first credit can appear."""
    global _validated_weights_sha256
    if not BUNDLED:
        return None
    if _validated_weights_sha256:
        return _validated_weights_sha256
    if not RESOURCE_ROOT:
        raise RuntimeError("LENS_RESOURCE_DIR is required for the bundled service")
    root = os.path.realpath(RESOURCE_ROOT)
    with open(os.path.join(root, "manifest.json"), "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if manifest.get("schema") != 1 or manifest.get("serviceSchema") != 2:
        raise RuntimeError("bundled model manifest schema is incompatible")
    if manifest.get("modelId") != "sd15-hyper4" or manifest.get("resolution") != 512:
        raise RuntimeError("bundled model manifest describes the wrong runtime")
    actual = {}
    for relative, expected in manifest.get("files", {}).items():
        path = os.path.realpath(os.path.join(root, relative))
        if os.path.commonpath((root, path)) != root:
            raise RuntimeError("bundled model manifest contains an unsafe path")
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        value = digest.hexdigest()
        if value != expected:
            raise RuntimeError(f"bundled model checksum mismatch: {relative}")
        actual[relative] = value
    aggregate = hashlib.sha256(
        json.dumps(actual, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if aggregate != manifest.get("weightsSha256"):
        raise RuntimeError("bundled aggregate weight checksum mismatch")
    _validated_weights_sha256 = aggregate
    return aggregate


def bundled_weights_sha256() -> str | None:
    if _validated_weights_sha256:
        return _validated_weights_sha256
    if not BUNDLED or not RESOURCE_ROOT:
        return None
    try:
        with open(os.path.join(RESOURCE_ROOT, "manifest.json"), "r", encoding="utf-8") as handle:
            return json.load(handle).get("weightsSha256")
    except (OSError, json.JSONDecodeError):
        return None

# The depth ControlNet, and the whole argument for leaving SD2.1.
#
# Every other img2img pipeline in the world has to ESTIMATE the depth of its
# conditioning image — run MiDaS over a picture and hope. We raymarched the room:
# r3d.js already knows the exact distance to every pixel and was throwing it
# away. It now rides in the alpha channel of the scene texture and arrives here
# welded to the frame it belongs to (see the 'L2' header in server.py).
#
# What it buys: the hallucination can no longer wander off the geometry. Walls
# stay where the walls are. That is the difference between a horror lens and a
# smear, and it is worth more than any amount of GPU.
CONTROLNET_DEPTH = _model_ref("lllyasviel/control_v11f1p_sd15_depth", "controlnet-depth")

# TAESD is the SD1.x tiny autoencoder — the same one sd-turbo used, because
# sd-turbo is SD2.1-shaped and shares the 4-channel latent space. Nothing to
# change here on the way to 1.5, which is a small mercy.
TINY_VAE = _model_ref("madebyollin/taesd", "taesd")

SD15_BASE = _model_ref("stable-diffusion-v1-5/stable-diffusion-v1-5", "sd15")
HYPER_SD = _model_ref("ByteDance/Hyper-SD", "hyper-sd")

# 512² is not a performance lever, it is the distribution. SD1.5, like sd-turbo,
# is trained at 512 and falls out of the world below ~448: photographs become
# cartoon line-art with glowing filaments. Do not "optimise" this.
def _local_size() -> int:
    requested = int(os.environ.get("LENS_SIZE", "512"))
    # All SD1.x latent dimensions must be divisible by 64. Below 256 the room
    # loses doors; above 512 only buys latency on a local device.
    return max(256, min(512, round(requested / 64) * 64))


SIZE = _local_size()


@dataclass(frozen=True)
class Model:
    """One coherent (base, lora, scheduler) triple. Adding a model = adding one."""

    key: str
    base: str
    label: str
    # A step-distillation LoRA, as "repo" or "repo:weight_file". None = the raw
    # base model, which is honest and slow and useful as a quality ceiling.
    lora: str | None = None
    scheduler: str | None = None      # 'lcm' | 'tcd' | None (keep the base's)
    native_guidance: float = 0.0
    # Nominal steps the distillation was trained for. img2img will run
    # int(steps * strength) of them, so this is a floor to divide up, not a count.
    distilled_steps: int = 4
    variant: str | None = "fp16"
    # Only SD1.5 has the depth ControlNet. sd-turbo is SD2.1 and has none, which
    # is the third of the three reasons we are leaving it.
    controlnet: bool = False
    notes: str = ""

    def steps_for(self, strength: float, passes: int) -> int:
        """Nominal steps such that int(steps * strength) >= passes."""
        steps = max(1, math.ceil(passes / max(strength, 0.05)))
        while int(steps * strength) < passes:
            steps += 1
        # A distilled model has a schedule shape it expects. Asking a 4-step
        # model for 40 steps does not give you a better image, it gives you a
        # slower one and, with LCM, a worse one.
        return min(steps, max(self.distilled_steps * 4, 8))


MODELS: dict[str, Model] = {
    # Where we are coming from. Kept so the A/B is a fair fight and so a bad
    # migration can be reverted with an env var rather than a git revert.
    "sd-turbo": Model(
        key="sd-turbo",
        base="stabilityai/sd-turbo",
        label="SD-Turbo (SD2.1 distilled)",
        native_guidance=0.0,
        distilled_steps=2,
        notes="incumbent. fast, unfinetunable, non-commercial.",
    ),
    # Where we are going.
    #
    # NOT DMD2: checked the repo, and tianweiy/DMD2 ships SDXL distillations only
    # (dmd2_sdxl_*). There is no SD1.5 DMD2 LoRA, and SDXL is 1024-native and far
    # too heavy for a real-time lens. Hyper-SD is the live SD1.5 distillation.
    #
    # Hyper-SD 4-step is the quality pick and the default: at our knobs
    # (strength 0.42, passes 1) img2img runs a single UNet evaluation anyway, so
    # the LoRA is buying us a better *one pass*, not fewer passes.
    "sd15-hyper4": Model(
        key="sd15-hyper4",
        base=SD15_BASE,
        label="SD1.5 + Hyper-SD 4-step LoRA",
        lora=f"{HYPER_SD}#Hyper-SD15-4steps-lora.safetensors" if BUNDLED else "ByteDance/Hyper-SD:Hyper-SD15-4steps-lora.safetensors",
        scheduler="tcd",
        native_guidance=0.0,
        distilled_steps=4,
        controlnet=True,
        notes="the target. fine-tunable, ControlNet-able, OpenRAIL-M.",
    ),
    # One step. The fastest thing that is still SD1.5, and softer for it. Worth
    # the A/B on a machine that cannot hold frame rate at four.
    "sd15-hyper1": Model(
        key="sd15-hyper1",
        base=SD15_BASE,
        label="SD1.5 + Hyper-SD 1-step LoRA",
        lora=f"{HYPER_SD}#Hyper-SD15-1step-lora.safetensors" if BUNDLED else "ByteDance/Hyper-SD:Hyper-SD15-1step-lora.safetensors",
        scheduler="tcd",
        native_guidance=0.0,
        distilled_steps=1,
        controlnet=True,
    ),
    # The old reliable. Slower, but it is the distillation-free reference: if the
    # LoRA models look wrong, render one frame with this to find out whether it
    # is the distillation or the prompt.
    "sd15-lcm": Model(
        key="sd15-lcm",
        base=SD15_BASE,
        label="SD1.5 + LCM-LoRA",
        lora="latent-consistency/lcm-lora-sdv1-5",
        scheduler="lcm",
        native_guidance=1.0,
        distilled_steps=4,
        controlnet=True,
    ),
    "sd15": Model(
        key="sd15",
        base=SD15_BASE,
        label="SD1.5 (no distillation — quality ceiling, not playable)",
        native_guidance=7.0,
        distilled_steps=20,
        controlnet=True,
    ),
}

DEFAULT_MODEL = os.environ.get("LENS_MODEL", "sd15-hyper4")


def torch_build_report() -> dict:
    """Everything about the installed torch that decides whether a GPU works.

    This is the report that was missing when a Windows tester with an RTX 5070
    hit "unsupported GPU": the message could not tell a CPU-only wheel (shipped
    by accident from PyPI's default Windows index) apart from a real driver
    problem apart from a GPU too new for the bundled CUDA. All three read as
    `cuda.is_available() == False`, and only this distinguishes them.
    """
    cuda_build = getattr(torch.version, "cuda", None)  # None on a CPU-only wheel
    report = {
        "torch": torch.__version__,
        "cudaBuild": cuda_build,          # the CUDA the wheel was compiled for
        "cudaAvailable": bool(torch.cuda.is_available()),
        "cpuOnlyWheel": cuda_build is None,
        "deviceCount": 0,
        "devices": [],
        "driverError": None,
    }
    try:
        report["deviceCount"] = torch.cuda.device_count()
        for i in range(report["deviceCount"]):
            props = torch.cuda.get_device_properties(i)
            report["devices"].append({
                "name": props.name,
                # Blackwell is sm_120; a wheel whose max supported arch is below
                # this cannot run the card even though the driver enumerates it.
                "capability": f"sm_{props.major}{props.minor}",
            })
    except Exception as exc:  # torch raises here when the runtime can't init
        report["driverError"] = str(exc)
    try:
        report["archList"] = torch.cuda.get_arch_list()
    except Exception:
        report["archList"] = []
    return report


def pick_device() -> tuple[str, torch.dtype]:
    """CUDA, then Apple, then the couch. fp16 everywhere it is real."""
    if torch.cuda.is_available():
        if getattr(torch.version, "hip", None):
            return "rocm", torch.float16
        return "cuda", torch.float16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        # MPS does fp16, and at 512² with a tiny VAE it is the difference between
        # a slideshow and a game.
        return "mps", torch.float16
    return "cpu", torch.float32


@dataclass
class Lens:
    model: Model
    device: str
    dtype: torch.dtype
    pipe: object = None
    style_lora: str | None = None     # our own, once we have trained it
    depth: bool = False               # a depth ControlNet is loaded and armed
    degraded: str = ""                # why we are not what we claim to be
    compel: object = None             # long-prompt weighted embeddings, if available

    def status(self) -> dict:
        return {
            "model": self.model.key,
            "label": self.model.label,
            "device": self.device,
            "steps": self.model.distilled_steps,
            "size": SIZE,
            # The client sends depth only to a server that asks for it. This
            # field is the ask. An older server omits it and gets plain frames.
            "depth": self.depth,
            "degraded": self.degraded or None,
        }


def _load_lora(pipe, spec: str, adapter: str) -> None:
    delimiter = "#" if "#" in spec else ":"
    repo, _, weight = spec.partition(delimiter)
    kwargs = {"weight_name": weight} if weight else {}
    pipe.load_lora_weights(repo, adapter_name=adapter, **kwargs)


def build(model_key: str | None = None, style_lora: str | None = None,
          depth: bool | None = None) -> Lens:
    """Load once, at boot. Everything here is slow and none of it is per-frame."""
    validate_bundled_resources()
    model = MODELS[model_key or DEFAULT_MODEL]
    if BUNDLED and model.key != "sd15-hyper4":
        raise RuntimeError("the bundled service permits only the pinned sd15-hyper4 model")
    device, dtype = pick_device()
    lens = Lens(model=model, device=device, dtype=dtype, style_lora=style_lora)

    want_depth = model.controlnet if depth is None else (depth and model.controlnet)
    if depth and not model.controlnet:
        lens.degraded = f"{model.key} has no depth ControlNet (SD2.1) — running blind"

    # SD1.5 ships a safety checker and sd-turbo does not, so without this the two
    # halves of the A/B are not the same experiment. (Benched: switching it off
    # did NOT measurably change ms/frame — it is here for fairness and for the
    # ~1GB of CLIP weights it stops us loading, not for speed. Do not go looking
    # for a frame budget in it.) The lens only ever sees frames we rendered.
    kw = {"torch_dtype": dtype, "safety_checker": None, "requires_safety_checker": False}
    if BUNDLED:
        kw["local_files_only"] = True
    # The offline package intentionally contains only the pinned fp16 files.
    # MPS and ROCm need the same variant selection as CUDA, and even a bundled
    # CPU fallback must name the files that actually shipped.
    weight_variant = model.variant if model.variant and (BUNDLED or dtype == torch.float16) else None
    if weight_variant:
        kw["variant"] = weight_variant

    def _open(**extra):
        k = {**kw, **extra}
        try:
            if "controlnet" in k:
                return StableDiffusionControlNetImg2ImgPipeline.from_pretrained(model.base, **k)
            return AutoPipelineForImage2Image.from_pretrained(model.base, **k)
        except Exception:                  # fp16 variant absent on some mirrors
            # A pinned offline package cannot recover by asking for a variant
            # it deliberately did not include. Preserve the real load error.
            if BUNDLED or "variant" not in k:
                raise
            k.pop("variant", None)
            if "controlnet" in k:
                return StableDiffusionControlNetImg2ImgPipeline.from_pretrained(model.base, **k)
            return AutoPipelineForImage2Image.from_pretrained(model.base, **k)

    if want_depth:
        try:
            controlnet_kw = {"torch_dtype": dtype, "local_files_only": BUNDLED}
            if weight_variant:
                controlnet_kw["variant"] = weight_variant
            cn = ControlNetModel.from_pretrained(CONTROLNET_DEPTH, **controlnet_kw)
            pipe = _open(controlnet=cn)
            lens.depth = True
        except Exception as e:
            if BUNDLED:
                raise RuntimeError(f"bundled depth ControlNet failed validation: {e}") from e
            # Blind is a worse lens; a dead lens is no lens. Say so and carry on.
            lens.degraded = f"depth ControlNet unavailable ({str(e)[:100]}) — running blind"
            pipe = _open()
    else:
        pipe = _open()
    pipe = pipe.to(device)

    # The tiny VAE. At one UNet pass the full VAE decode is a real slice of the
    # frame, and this image is being smeared by a horror lens regardless.
    pipe.vae = AutoencoderTiny.from_pretrained(TINY_VAE, torch_dtype=dtype, local_files_only=BUNDLED).to(device)

    # A distilled model wants its own scheduler. Loading the LoRA without it
    # gives you a grey wash and a bad afternoon.
    if model.scheduler == "lcm":
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    elif model.scheduler == "tcd":
        pipe.scheduler = TCDScheduler.from_config(pipe.scheduler.config)

    adapters, weights = [], []
    if model.lora:
        try:
            _load_lora(pipe, model.lora, "distill")
            adapters.append("distill")
            weights.append(1.0)
        except Exception as e:
            if BUNDLED:
                raise RuntimeError(f"bundled distillation LoRA failed validation: {e}") from e
            # Degrade loudly and keep serving. A missing LoRA means "slow", and
            # slow is a thing a player can see through; a crash is not.
            lens.degraded = f"distillation LoRA unavailable ({str(e)[:120]}) — running the base at {model.distilled_steps * 4} steps"
            object.__setattr__(model, "distilled_steps", max(model.distilled_steps, 12))
    if style_lora:
        try:
            _load_lora(pipe, style_lora, "style")
            adapters.append("style")
            weights.append(float(os.environ.get("LENS_STYLE_WEIGHT", "0.8")))
        except Exception as e:
            lens.degraded = (lens.degraded + " | " if lens.degraded else "") + f"style LoRA unavailable ({str(e)[:80]})"
    if adapters:
        pipe.set_adapters(adapters, adapter_weights=weights)
        # Fusing folds the LoRA into the weights: no per-step adapter maths, and
        # at 1-4 steps that overhead is a measurable fraction of the frame.
        try:
            pipe.fuse_lora()
        except Exception:
            pass

    pipe.set_progress_bar_config(disable=True)
    if device == "cuda":
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass

    # Compel lifts CLIP's 77-token cap (chunked embeddings) and adds (word:1.3)
    # weighting. Local development may still report a degraded environment,
    # but a packaged build is invalid without it: silently truncating prompts
    # after a player downloaded the full offline runtime is not a recovery path.
    try:
        from compel import Compel
        lens.compel = Compel(
            tokenizer=pipe.tokenizer,
            text_encoder=pipe.text_encoder,
            truncate_long_prompts=False,
        )
    except Exception as e:
        if BUNDLED:
            raise RuntimeError(f"bundled Compel failed validation: {e}") from e
        lens.compel = None
        lens.degraded = (lens.degraded + " | " if lens.degraded else "") + f"compel unavailable ({str(e)[:80]}) — prompts truncate at 77 tokens"

    lens.pipe = pipe
    warm(lens)
    return lens


def prefetch(model_key: str | None = None) -> None:
    """Pull the weights and nothing else. For baking a container image, where
    there is no GPU and no reason to run a UNet."""
    from huggingface_hub import hf_hub_download

    model = MODELS[model_key or DEFAULT_MODEL]
    AutoPipelineForImage2Image.from_pretrained(model.base, torch_dtype=torch.float16)
    AutoencoderTiny.from_pretrained(TINY_VAE, torch_dtype=torch.float16)
    if model.lora:
        repo, _, weight = model.lora.partition(":")
        if weight:
            hf_hub_download(repo, weight)
        else:
            from huggingface_hub import snapshot_download
            snapshot_download(repo)


def warm(lens: Lens, n: int = 2) -> None:
    """The first frame is always a lie. Tell it here, not to a player."""
    img = Image.new("RGB", (SIZE, SIZE), (10, 10, 12))
    extra = {"control_image": img} if lens.depth else {}
    for _ in range(n):
        lens.pipe(
            prompt="warmup", image=img, strength=0.5,
            num_inference_steps=lens.model.steps_for(0.5, 1),
            guidance_scale=lens.model.native_guidance, **extra,
        )


# How hard the geometry is allowed to insist. 1.0 pins the walls exactly and the
# lens becomes a texture pass; 0 is the old blind smear. Around 0.5–0.7 the room
# stays a room while its material goes wrong, which is the entire brief.
DEPTH_SCALE = float(os.environ.get("LENS_DEPTH_SCALE", "0.6"))


def _clip_token_count(lens: Lens, text: str) -> int:
    try:
        return len(lens.pipe.tokenizer(text).input_ids)
    except Exception:
        return -1


# ── seamless generation ──────────────────────────────────────────────────────
#
# THE BANKS ARE TILED, SO THEY HAVE TO WRAP. surfaceSlot() in render/r3d.js
# repeats every generated material every 1.0-2.2 metres, and nothing in this
# pipeline ever asked the model for something that could survive that. Measured
# on the shipped cache, the two edges of a bank differ by up to fourteen times
# the texture's own internal detail — so every repeat drew a hard seam and the
# walls read as a grid of panels. That grid is the "plaid".
#
# Convolutions are where the edge is decided: with zero padding the model has no
# information past the border and invents a different one on each side. Circular
# padding makes the border wrap, so the left edge is generated knowing the right.
# It costs nothing and it is the standard way to get a tileable image out of SD.
#
# It has to be set on EVERYTHING that touches pixels — the UNet, the ControlNet
# and the decoder. TAESD is a real convolutional decoder, so a seamless latent
# decoded through zero padding gets its seam back on the way out.
_SEAMLESS_MODULES = ("unet", "controlnet", "vae")


def _mirror_seam(a, axis: int, feather: int):
    """Blend a band across the middle of `axis` with its own mirror.

    At the centre both sides average to the same value, so the join is exactly
    continuous; away from it the blend falls off to nothing. Because the band is
    mixed with a FLIPPED COPY OF ITSELF rather than a gradient, real texture
    survives the repair — a linear ramp would leave a soft smear across the tile.
    """
    a = np.swapaxes(a, 0, axis)
    n = a.shape[0]
    lo, hi = n // 2 - feather, n // 2 + feather
    if lo < 0 or hi > n or hi - lo < 2:
        return np.swapaxes(a, 0, axis)
    band = a[lo:hi]
    # 0.5 at the seam, 0 at the band edges: the two centre rows both become the
    # average of the pair, which is what makes them equal.
    ramp = 1.0 - np.abs(np.linspace(-1.0, 1.0, band.shape[0]))
    w = (0.5 * ramp * ramp).reshape(-1, *([1] * (band.ndim - 1)))
    a[lo:hi] = band * (1.0 - w) + band[::-1] * w
    return np.swapaxes(a, 0, axis)


def make_tileable(img: Image.Image, feather: int = 40) -> Image.Image:
    """Guarantee the wrap, on both axes.

    Circular convolution padding fixes the seam the MODEL creates, and measured
    it takes the horizontal wrap from 3.5x the texture's internal detail down to
    1.0x — seamless. It cannot fix a seam the SOURCE brought with it: img2img at
    moderate strength preserves large-scale content, so a frame whose top simply
    looks different from its bottom stays that way, and the vertical wrap does
    not improve at all.

    Rolling by half is the deterministic half of the fix. It makes the wrap
    continuous by construction — the new left and right borders were ADJACENT
    columns in the original — and moves the real discontinuity to a cross in the
    middle, where _mirror_seam can repair it without touching the edges the
    tiling depends on.
    """
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w = a.shape[:2]
    a = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    a = _mirror_seam(a, 1, min(feather, w // 4))
    a = _mirror_seam(a, 0, min(feather, h // 4))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), mode="RGB")


def _set_seamless(pipe, enable: bool) -> None:
    mode = "circular" if enable else "zeros"
    for name in _SEAMLESS_MODULES:
        module = getattr(pipe, name, None)
        if module is None:
            continue
        for layer in module.modules():
            if isinstance(layer, torch.nn.Conv2d):
                layer.padding_mode = mode


def diffuse(
    lens: Lens, jpeg_bytes: bytes, prompt: str, strength: float, passes: int,
    seed: int, guidance: float, negative: str, quality: int = 72,
    depth_bytes: bytes | None = None, depth_scale: float | None = None,
    dream_opts: dict | None = None, seamless: bool = False,
) -> bytes:
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    src_size = img.size
    img = img.resize((SIZE, SIZE))

    # Floor at two effective UNet evaluations for distilled models: one pass at
    # low strength is a blur, not a hallucination.
    effective_passes = max(2, passes) if lens.model.distilled_steps >= 2 else passes
    steps = lens.model.steps_for(strength, effective_passes)
    gen = torch.Generator("cpu" if lens.device == "mps" else lens.device).manual_seed(seed)

    tokens = _clip_token_count(lens, prompt)
    if tokens > 77 and lens.compel is None:
        print(f"PROMPT OVER BUDGET: {tokens} CLIP tokens, truncating at 77 (no compel): {prompt[:80]}…")

    # The exact depth of the room, marched by the engine that drew it. If the
    # client did not send one (old client, ?nodepth, a model with no ControlNet)
    # the pipeline is the plain img2img one and must not be handed control args.
    ctrl = {}
    if lens.depth:
        if depth_bytes:
            dimg = Image.open(io.BytesIO(depth_bytes)).convert("RGB").resize((SIZE, SIZE))
        else:
            # A ControlNet pipeline REQUIRES a control image. Mid-grey is the
            # honest way to say "no opinion" — it conditions on nothing.
            dimg = Image.new("RGB", (SIZE, SIZE), (128, 128, 128))
        ctrl = {
            "control_image": dimg,
            "controlnet_conditioning_scale": (
                DEPTH_SCALE if depth_scale is None else float(depth_scale)
            ) if depth_bytes else 0.0,
        }

    # The client's guidance knob is pointed at a cliff ON PURPOSE. At the model's
    # native CFG you get a tidy, obedient interior; above it the model
    # over-recognises and plaster turns into faces, and that failure IS the
    # aesthetic. Pass it through. A negative prompt only does anything once CFG
    # is off the floor, which is why it is gated on the same number.
    kwargs = {}
    use_negative = guidance > lens.model.native_guidance + 0.05 and bool(negative)
    if lens.compel is not None:
        # Weighted, chunk-embedded conditioning: no 77-token cliff, and burst
        # prompts may carry (word:1.3) emphasis. Tensors must share a length or
        # diffusers refuses the pair.
        conditioning = lens.compel(prompt)
        if use_negative:
            negative_conditioning = lens.compel(negative)
            [conditioning, negative_conditioning] = lens.compel.pad_conditioning_tensors_to_same_length(
                [conditioning, negative_conditioning])
            kwargs["negative_prompt_embeds"] = negative_conditioning
        kwargs["prompt_embeds"] = conditioning
    else:
        kwargs["prompt"] = prompt
        if use_negative:
            kwargs["negative_prompt"] = negative

    # Restored in a finally: the pipe is a long-lived singleton shared with the
    # burst path, which repaints the whole screen and must NOT wrap.
    _set_seamless(lens.pipe, seamless)
    try:
        out = lens.pipe(
            image=img, strength=strength,
            num_inference_steps=steps, guidance_scale=guidance,
            generator=gen, **ctrl, **kwargs,
        ).images[0]
    finally:
        if seamless:
            _set_seamless(lens.pipe, False)

    # THE SECOND LAYER. Gradient ascent on a CNN's own activations, run on what
    # the diffuser just produced — see dream.py for why a prompt cannot do this.
    # Applied at SIZE, before the resize back, so the octaves work at the
    # resolution the model actually generated rather than the client's.
    #
    # Absent or gain<=0 it costs nothing and this is the pipeline it always was.
    if dream_opts and float(dream_opts.get("gain", 0) or 0) > 0:
        from dream import dream_image
        out = dream_image(
            out,
            gain=float(dream_opts.get("gain", 1.0)),
            layer=str(dream_opts.get("layer", "objects")),
            octaves=int(dream_opts.get("octaves", 3)),
            iterations=int(dream_opts.get("iterations", 10)),
            step=float(dream_opts.get("step", 0.02)),
            device=lens.device,
        )

    # LAST, AND IT HAS TO BE LAST. The dream pass above is gradient ascent with
    # zero-padded convolutions over resampled octaves; whatever the wrap looked
    # like going in, it does not survive. Tiling is the final word on a bank.
    if seamless:
        out = make_tileable(out)

    out = out.resize(src_size)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()
