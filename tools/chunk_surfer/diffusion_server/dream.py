"""The second lens layer: DeepDream, as the algorithm rather than as a prompt.

WHY THIS EXISTS AT ALL. material-mutation.js already asks Stable Diffusion for
"creeping pareidolic structure, recursive material echoes, anatomy suggested only
by surface grain" — which is a description of inceptionism handed to a text
encoder and hoped for. SD1.5 at one to four steps will not reliably give it,
because the thing that makes DeepDream look like DeepDream is not a style. It is
gradient ascent on a network's own activations: you amplify what the model
already half-sees until it is unmistakably there. No prompt reproduces that, so
this runs the actual loop.

IT IS ITS OWN MODULE ON PURPOSE. pipeline.py has to load Stable Diffusion before
it can do anything, which is tens of seconds and several gigabytes. The dream
pass shares nothing with it but a tensor, so keeping it separate means bench.py
can time the expensive new thing in about two seconds without touching SD. The
cost question is the whole risk in this feature and it should be cheap to ask.

WHICH NETWORK DECIDES THE AESTHETIC, not the code below. The classic look —
fur, snouts, and eyes opening in every surface — comes from ImageNet, which has
roughly 120 dog classes; that is genuinely why DeepDream is full of dogs. A
Places365 backbone hallucinates architecture instead: doorways, windows,
corridors. For a condemned building whose surfaces are becoming something, that
may well be the better one. `backbone=` picks it and bench.py compares them.
"""

from __future__ import annotations

import io
import random

import torch
import torch.nn.functional as F
from PIL import Image

# ImageNet input normalisation. Applied INSIDE the graph, so the gradient that
# comes back is with respect to the image we are actually stepping.
_MEAN = (0.485, 0.456, 0.406)
_STD = (0.229, 0.224, 0.225)

# Where to tap the network, coarse to fine in what it recognises. Early layers
# amplify edges and moire; the middle is where objects live and is where the
# eyes come from. These are attribute paths on torchvision's inception_v3.
DREAM_LAYERS = {
    "edges": "Mixed_5b",
    "texture": "Mixed_5c",
    "objects": "Mixed_6a",      # the default: structure without full dog
    "faces": "Mixed_6b",
    "deep": "Mixed_6c",
}
DEFAULT_LAYER = "objects"

# The short side Inception can still be marched through to the mid layers.
_MIN_SIDE = 192

_net_cache: dict[str, torch.nn.Module] = {}


def _load_backbone(backbone: str, device: str, ) -> torch.nn.Module:
    key = f"{backbone}:{device}"
    if key in _net_cache:
        return _net_cache[key]
    from torchvision.models import inception_v3, Inception_V3_Weights

    net = inception_v3(weights=Inception_V3_Weights.IMAGENET1K_V1, init_weights=False)
    net.eval().to(device)
    # Nothing here is being trained. Only the image carries a gradient.
    for p in net.parameters():
        p.requires_grad_(False)
    _net_cache[key] = net
    return net


def _module_at(net: torch.nn.Module, path: str) -> torch.nn.Module:
    node = net
    for part in path.split("."):
        node = getattr(node, part)
    return node


def _ascend(net, target, x, iterations, step, jitter, device):
    """One octave. Gradient ascent on the mean square of `target`'s activations."""
    mean = torch.tensor(_MEAN, device=device).view(1, 3, 1, 1)
    std = torch.tensor(_STD, device=device).view(1, 3, 1, 1)

    for _ in range(iterations):
        # JITTER. Roll the image a random amount before each step and roll it
        # back after. Without it the same pixels receive the same gradient every
        # iteration and the network's own stride prints a visible lattice over
        # the result — the usual reason a hand-rolled DeepDream looks tiled.
        ox = random.randint(-jitter, jitter)
        oy = random.randint(-jitter, jitter)
        x = torch.roll(x, shifts=(oy, ox), dims=(2, 3)).detach().requires_grad_(True)

        captured = {}
        handle = target.register_forward_hook(lambda _m, _i, out: captured.__setitem__("a", out))
        try:
            net((x - mean) / std)
        finally:
            handle.remove()

        activations = captured.get("a")
        if activations is None:
            return x.detach()
        # Maximise how strongly this layer responds. Squared, so the loud
        # channels get louder rather than everything drifting up together.
        activations.pow(2).mean().backward()

        grad = x.grad
        # NORMALISE BY THE GRADIENT'S OWN SCALE. Different layers differ in
        # magnitude by orders of magnitude, so a fixed step size is either a
        # no-op or a screenful of noise depending on which layer you tapped.
        # This is what makes `step` mean the same thing everywhere.
        grad = grad / (grad.abs().mean() + 1e-8)

        x = (x + step * grad).detach().clamp(0.0, 1.0)
        x = torch.roll(x, shifts=(-oy, -ox), dims=(2, 3))

    return x.detach()


def dream_tensor(
    img: torch.Tensor,
    *,
    layer: str = DEFAULT_LAYER,
    octaves: int = 3,
    octave_ratio: float = 1.4,
    iterations: int = 10,
    step: float = 0.02,
    jitter: int = 16,
    backbone: str = "inception",
    device: str = "cpu",
) -> torch.Tensor:
    """`img` is 1x3xHxW in 0..1. Returns the same shape, dreamed."""
    net = _load_backbone(backbone, device)
    target = _module_at(net, DREAM_LAYERS.get(layer, DREAM_LAYERS[DEFAULT_LAYER]))

    base = img.to(device)
    _, _, h, w = base.shape

    # INCEPTION HAS A FLOOR AND IT IS NOT OPTIONAL. The network downsamples by
    # about 32x on the way to the layers worth tapping, so a small octave arrives
    # at Mixed_6 as a 2x2 feature map and the 3x3 convolution raises rather than
    # degrading. Anything under ~192px on the short side will do it. Clamp both
    # the octave ladder and the input itself, and put the result back at the size
    # we were handed so a caller never has to know.
    out_size = (h, w)
    if min(h, w) < _MIN_SIDE:
        scale = _MIN_SIDE / min(h, w)
        base = F.interpolate(base, size=(max(_MIN_SIDE, int(h * scale)), max(_MIN_SIDE, int(w * scale))),
                             mode="bilinear", align_corners=False)
        _, _, h, w = base.shape

    # Coarse to fine. Working small first is what puts LARGE structure in — run
    # only at full resolution and you get a busy surface and no shapes.
    sizes = []
    for i in range(octaves):
        f = octave_ratio ** (octaves - 1 - i)
        sizes.append((max(_MIN_SIDE, int(h / f)), max(_MIN_SIDE, int(w / f))))
    # Duplicate rungs after the clamp are wasted passes, not extra detail.
    seen = set()
    sizes = [s for s in sizes if not (s in seen or seen.add(s))]

    detail = torch.zeros_like(F.interpolate(base, size=sizes[0], mode="bilinear", align_corners=False))
    out = base
    for size in sizes:
        octave_base = F.interpolate(base, size=size, mode="bilinear", align_corners=False)
        detail = F.interpolate(detail, size=size, mode="bilinear", align_corners=False)
        # Carry only what the previous octave ADDED into the next one, so the
        # larger pass refines the same hallucination instead of starting again.
        out = _ascend(net, target, (octave_base + detail).clamp(0, 1), iterations, step, jitter, device)
        detail = out - octave_base

    if out.shape[-2:] != out_size:
        out = F.interpolate(out, size=out_size, mode="bilinear", align_corners=False)
    return out.clamp(0, 1)


def dream_image(img: Image.Image, *, gain: float = 1.0, **kwargs) -> Image.Image:
    """PIL in, PIL out. `gain` blends the result back over the original, which is
    the knob that decides whether a wall is suggesting something or shouting."""
    import numpy as np

    src = torch.from_numpy(np.asarray(img, dtype=np.uint8).copy()) \
        .permute(2, 0, 1).unsqueeze(0).float().div(255.0)

    dreamed = dream_tensor(src, **kwargs).cpu()
    if gain < 1.0:
        dreamed = (src * (1.0 - gain) + dreamed * gain).clamp(0, 1)

    arr = dreamed.mul(255).round().to(torch.uint8).squeeze(0).permute(1, 2, 0).numpy()
    return Image.fromarray(arr, mode="RGB")


def dream_jpeg(jpeg_bytes: bytes, *, quality: int = 72, **kwargs) -> bytes:
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    out = dream_image(img, **kwargs)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()
