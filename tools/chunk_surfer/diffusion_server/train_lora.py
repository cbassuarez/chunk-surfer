"""Train the ROOM TONE LoRA — a lens that has actually looked at a dead building.

This is the payoff for leaving sd-turbo. SD1.5 is a base the world trains
against, so we can teach it one specific thing: what a condemned conservatory
looks like, underexposed, on a bad camera, at four in the morning. A prompt can
only *ask* for that register and hope the model has it. A LoRA supplies it.

    # 1. put 80–300 images in dataset/roomtone/ (see dataset/README.md)
    # 2. train on the local CUDA/MPS device:
    .venv-local/bin/python train_lora.py
    # 3. serve it:
    LENS_STYLE_LORA=/path/to/roomtone.safetensors .venv-local/bin/python server.py

WHAT TO TRAIN ON — this matters more than any hyperparameter
------------------------------------------------------------
The LoRA learns the INTERSECTION of your images. Every photo should share the
thing you want and differ in everything else, or it learns the wrong invariant:
30 pictures of one corridor teaches it that corridor, not the register.

  · WANT: empty institutional interiors, water damage, stained plaster, peeling
    paint, dust, boarded windows, dead fluorescents, drained pools, stacked
    chairs, wet concrete. Underexposed. Flash-lit or single-source. Grainy.
  · AVOID, or it will paint them into your game for free: people (any, ever —
    this is the same rule as the negative prompt), daylight, colour saturation,
    tidy renovated rooms, wide-angle real-estate photography, watermarks.
  · 80–150 is plenty. 300 good ones beat 1000 mixed. One bad image with a person
    in it will do more damage than fifty good ones do good.

Captions: one .txt beside each image, or none at all and every image gets
TRIGGER. Keep captions SHORT and describe what varies (the subject), never what
is constant (the style) — the constant is what you want folded into the trigger
word, and a caption that names it hands the model an excuse not to learn it.
"""

from __future__ import annotations

import argparse
from pathlib import Path

# The word that summons it. Nonsense on purpose: a real word ("dark", "grimy")
# already means something to SD1.5 and training fights that meaning. A token the
# model has no prior for is a token it will happily fill with whatever we show it.
TRIGGER = "rmtn style"

def train(
    steps: int = 1500,
    lr: float = 1e-4,
    rank: int = 16,
    batch: int = 1,
    resolution: int = 512,
    base: str = "stable-diffusion-v1-5/stable-diffusion-v1-5",
    data_dir: Path = Path("dataset/roomtone"),
    output: Path = Path("roomtone.safetensors"),
):
    """A plain LoRA fine-tune of the UNet's attention. No text-encoder training:
    it doubles the cost, it is the fastest way to wreck the model's language, and
    for a *style* it buys almost nothing."""
    import random
    import torch
    import torch.nn.functional as F
    from diffusers import AutoencoderKL, DDPMScheduler, UNet2DConditionModel
    from peft import LoraConfig, get_peft_model_state_dict
    from PIL import Image as PILImage
    from safetensors.torch import save_file
    from torch.utils.data import DataLoader, Dataset
    from torchvision import transforms
    from transformers import CLIPTextModel, CLIPTokenizer

    files = sorted(
        p for p in data_dir.rglob("*")
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )
    if not files:
        raise SystemExit(
            f"No images in {data_dir}. Put the training set in dataset/roomtone/."
        )
    print(f"{len(files)} images")

    if torch.cuda.is_available():
        dev, weight_dtype = "cuda", torch.float16
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        dev, weight_dtype = "mps", torch.float16
    else:
        raise SystemExit("ROOM TONE LoRA training requires a local CUDA or MPS device")
    print(f"device: {dev}")
    tok = CLIPTokenizer.from_pretrained(base, subfolder="tokenizer")
    text = CLIPTextModel.from_pretrained(base, subfolder="text_encoder").to(dev, weight_dtype)
    vae = AutoencoderKL.from_pretrained(base, subfolder="vae").to(dev, weight_dtype)
    unet = UNet2DConditionModel.from_pretrained(base, subfolder="unet").to(dev, torch.float32)
    noise_sched = DDPMScheduler.from_pretrained(base, subfolder="scheduler")

    text.requires_grad_(False)
    vae.requires_grad_(False)
    unet.requires_grad_(False)

    # Attention only. This is where style lives; touching the resnets mostly buys
    # you overfitting and a bigger file.
    unet.add_adapter(LoraConfig(
        r=rank, lora_alpha=rank, init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    ))
    params = [p for p in unet.parameters() if p.requires_grad]
    print(f"training {sum(p.numel() for p in params) / 1e6:.1f}M LoRA params")

    tf = transforms.Compose([
        transforms.Resize(resolution, interpolation=transforms.InterpolationMode.BILINEAR),
        transforms.RandomCrop(resolution),
        # Horizontal flip is the one augmentation that is free here: a corridor
        # is a corridor mirrored. (Never vertical — gravity is a real feature.)
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize([0.5], [0.5]),
    ])

    class Roomtone(Dataset):
        def __len__(self):
            return len(files)

        def __getitem__(self, i):
            f = files[i]
            img = PILImage.open(f).convert("RGB")
            cap = f.with_suffix(".txt")
            caption = cap.read_text().strip() if cap.exists() else ""
            # The trigger leads, always. What we are teaching is "when you see
            # this token, be this building".
            caption = f"{TRIGGER}, {caption}" if caption else TRIGGER
            # 10% of the time, train on the trigger alone. This is what stops the
            # style leaking into every prompt: the model learns the token carries
            # it, rather than the whole of English carrying it.
            if random.random() < 0.10:
                caption = TRIGGER
            ids = tok(
                caption, padding="max_length", truncation=True,
                max_length=tok.model_max_length, return_tensors="pt",
            ).input_ids[0]
            return {"pixel_values": tf(img), "input_ids": ids}

    dl = DataLoader(Roomtone(), batch_size=batch, shuffle=True, num_workers=0, drop_last=True)
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=1e-2)

    step = 0
    unet.train()
    while step < steps:
        for b in dl:
            if step >= steps:
                break
            px = b["pixel_values"].to(dev, weight_dtype)
            with torch.no_grad():
                lat = vae.encode(px).latent_dist.sample() * vae.config.scaling_factor
                emb = text(b["input_ids"].to(dev))[0]
            lat = lat.float()
            emb = emb.float()

            noise = torch.randn_like(lat)
            t = torch.randint(0, noise_sched.config.num_train_timesteps, (lat.shape[0],), device=dev).long()
            noisy = noise_sched.add_noise(lat, noise, t)

            pred = unet(noisy, t, emb).sample
            target = noise if noise_sched.config.prediction_type == "epsilon" \
                else noise_sched.get_velocity(lat, noise, t)
            loss = F.mse_loss(pred, target)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            opt.zero_grad(set_to_none=True)

            step += 1
            if step % 50 == 0:
                print(f"step {step}/{steps}  loss {loss.item():.4f}")

    output.parent.mkdir(parents=True, exist_ok=True)
    sd = get_peft_model_state_dict(unet)
    save_file({f"unet.{k}": v.to(torch.float16).contiguous() for k, v in sd.items()}, str(output))
    print(f"\nwrote {output}  (trigger word: '{TRIGGER}')")
    print(f"serve:  LENS_STYLE_LORA={output} ./run-local.sh")
    print(f"\nThen put '{TRIGGER}' at the FRONT of the zone prompts in zone-prompts.js.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--resolution", type=int, default=512)
    ap.add_argument("--data", type=Path, default=Path("dataset/roomtone"))
    ap.add_argument("--output", type=Path, default=Path("roomtone.safetensors"))
    args = ap.parse_args()
    train(steps=args.steps, lr=args.lr, rank=args.rank, batch=args.batch,
          resolution=args.resolution, data_dir=args.data, output=args.output)


if __name__ == "__main__":
    main()
