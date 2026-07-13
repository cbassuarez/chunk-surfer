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
import math
import os
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
from PIL import Image

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
CONTROLNET_DEPTH = "lllyasviel/control_v11f1p_sd15_depth"

# TAESD is the SD1.x tiny autoencoder — the same one sd-turbo used, because
# sd-turbo is SD2.1-shaped and shares the 4-channel latent space. Nothing to
# change here on the way to 1.5, which is a small mercy.
TINY_VAE = "madebyollin/taesd"

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
        base="stable-diffusion-v1-5/stable-diffusion-v1-5",
        label="SD1.5 + Hyper-SD 4-step LoRA",
        lora="ByteDance/Hyper-SD:Hyper-SD15-4steps-lora.safetensors",
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
        base="stable-diffusion-v1-5/stable-diffusion-v1-5",
        label="SD1.5 + Hyper-SD 1-step LoRA",
        lora="ByteDance/Hyper-SD:Hyper-SD15-1step-lora.safetensors",
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
        base="stable-diffusion-v1-5/stable-diffusion-v1-5",
        label="SD1.5 + LCM-LoRA",
        lora="latent-consistency/lcm-lora-sdv1-5",
        scheduler="lcm",
        native_guidance=1.0,
        distilled_steps=4,
        controlnet=True,
    ),
    "sd15": Model(
        key="sd15",
        base="stable-diffusion-v1-5/stable-diffusion-v1-5",
        label="SD1.5 (no distillation — quality ceiling, not playable)",
        native_guidance=7.0,
        distilled_steps=20,
        controlnet=True,
    ),
}

DEFAULT_MODEL = os.environ.get("LENS_MODEL", "sd15-hyper4")


def pick_device() -> tuple[str, torch.dtype]:
    """CUDA, then Apple, then the couch. fp16 everywhere it is real."""
    if torch.cuda.is_available():
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
    repo, _, weight = spec.partition(":")
    kwargs = {"weight_name": weight} if weight else {}
    pipe.load_lora_weights(repo, adapter_name=adapter, **kwargs)


def build(model_key: str | None = None, style_lora: str | None = None,
          depth: bool | None = None) -> Lens:
    """Load once, at boot. Everything here is slow and none of it is per-frame."""
    model = MODELS[model_key or DEFAULT_MODEL]
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
    if model.variant and device == "cuda":
        kw["variant"] = model.variant

    def _open(**extra):
        k = {**kw, **extra}
        try:
            if "controlnet" in k:
                return StableDiffusionControlNetImg2ImgPipeline.from_pretrained(model.base, **k)
            return AutoPipelineForImage2Image.from_pretrained(model.base, **k)
        except Exception:                  # fp16 variant absent on some mirrors
            k.pop("variant", None)
            if "controlnet" in k:
                return StableDiffusionControlNetImg2ImgPipeline.from_pretrained(model.base, **k)
            return AutoPipelineForImage2Image.from_pretrained(model.base, **k)

    if want_depth:
        try:
            cn = ControlNetModel.from_pretrained(CONTROLNET_DEPTH, torch_dtype=dtype)
            pipe = _open(controlnet=cn)
            lens.depth = True
        except Exception as e:
            # Blind is a worse lens; a dead lens is no lens. Say so and carry on.
            lens.degraded = f"depth ControlNet unavailable ({str(e)[:100]}) — running blind"
            pipe = _open()
    else:
        pipe = _open()
    pipe = pipe.to(device)

    # The tiny VAE. At one UNet pass the full VAE decode is a real slice of the
    # frame, and this image is being smeared by a horror lens regardless.
    pipe.vae = AutoencoderTiny.from_pretrained(TINY_VAE, torch_dtype=dtype).to(device)

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


def diffuse(
    lens: Lens, jpeg_bytes: bytes, prompt: str, strength: float, passes: int,
    seed: int, guidance: float, negative: str, quality: int = 72,
    depth_bytes: bytes | None = None, depth_scale: float | None = None,
) -> bytes:
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    src_size = img.size
    img = img.resize((SIZE, SIZE))

    steps = lens.model.steps_for(strength, passes)
    gen = torch.Generator("cpu" if lens.device == "mps" else lens.device).manual_seed(seed)

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
    if guidance > lens.model.native_guidance + 0.05 and negative:
        kwargs["negative_prompt"] = negative

    out = lens.pipe(
        prompt=prompt, image=img, strength=strength,
        num_inference_steps=steps, guidance_scale=guidance,
        generator=gen, **ctrl, **kwargs,
    ).images[0]

    out = out.resize(src_size)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()
