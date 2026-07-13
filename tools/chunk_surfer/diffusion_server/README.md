# chunk-surfer diffusion-lens server

Local GPU half of the material-detail layer. The browser sends the ten authored
surface-albedo tiles here once, stages the returned tiles in a WebGL texture
array, and atomically swaps the complete set into the raymarcher. Diffusion is
never applied to the camera image. Perspective, motion, depth, normals,
roughness, lighting, and fog state remain native renderer output.

The shader transfers high-frequency grain, mortar, staining, and wear from the
generated tile while retaining the authored albedo's broad colour and value.
Tiles use the same world-space UVs as the source PBR surfaces, so turning or
walking cannot make the result slide. If this server is absent, the untouched
PBR materials render normally.

## Run locally
```
python3.12 -m venv .venv-local
.venv-local/bin/pip install -r requirements-local.txt
./run-local.sh
```

The browser reads `public/labs/chunk-surfer/lens.local.json` when `?lens=1` is
present. That ignored file and the tracked example both point to
`ws://127.0.0.1:8000`. Non-loopback WebSocket endpoints are rejected by the
client; there is no cloud fallback, token, account, cold start, or usage bill.

`SERVER_REV` in server.py is echoed in the connect status JSON. Bump it on
protocol-visible changes.

## Tuning the material pass

Generation is intentionally finite: ten 512px tiles, one fixed seed per
material, no camera loop, and no regeneration when the player crosses a room
boundary. New results remain in the staging array until the whole batch is
complete, so a wall cannot change one tile at a time while it is visible.

| knob | effect |
|---|---|
| `strength` | variation available to the detail extractor; default `0.26` |
| `guidance` | pressure toward the material prompt; default `1.0` |
| `passes` | one-time generation cost; default `1` on MPS |
| `mix` | high-frequency detail transfer, not a generated-albedo crossfade; default `0.58` |

Changing `mix` is immediate and does not invoke the model. Changing prompt,
strength, guidance, or passes regenerates a complete staging batch and swaps it
only when ready. Prompt rules remain conservative: name a flat, orthographic,
tileable material and exclude rooms, perspective, objects, people, and fog.

Live tuning from the console, no reload:
```js
window.__diffusion.tune({ strength: 0.28, guidance: 1.1, mix: 0.62 })
window.__diffusion.resetFeedback()   // regenerate the complete material set
```
URL params: `dstrength dguidance dpasses dmix dprompt`.

## Hard-won pins & pitfalls
- diffusers 0.31 requires `transformers==4.46.3` + `huggingface_hub==0.26.5`
  (newer transformers removed `FLAX_WEIGHTS_NAME`).
- sd-turbo img2img: `int(steps × strength) ≥ 1` or the scheduler produces
  zero timesteps (`reshape tensor of 0 elements`). Use `ceil(1/strength)`.
- Worker-task exceptions must be caught and surfaced as status JSON — an
  unawaited task dies silently and the stream just never starts.
- `SERVER_REV` is echoed in the connect status JSON — check it before
  concluding a local server change "did nothing". Bump it whenever server
  behaviour changes.

## Migration: sd-turbo → SD1.5 + step-distillation LoRA (in progress)

The model now lives in `pipeline.py` and is chosen by `$LENS_MODEL`
(`sd15-hyper4` default; `sd-turbo` still selectable, so the A/B is a fair fight
and a bad migration is an env var, not a revert). `server.py` owns the protocol
and knows nothing about schedulers.

**Why leave sd-turbo**, given it works:
- **Fine-tuning.** It is a distilled SD2.1 and nobody trains for 2.1. A ROOM TONE
  LoRA — a lens that has actually looked at a condemned conservatory — needs a
  base the world trains against, and that is SD1.5.
- **Licence.** The Turbo weights shipped non-commercial. This is going to be a
  game somebody buys. SD1.5 is OpenRAIL-M.
- **ControlNet.** We *raymarch*: exact depth for every pixel, currently thrown
  away. Depth conditioning is the largest quality win available to this project
  and it is an SD1.5-shaped hole. The local server now receives that information
  directly from the renderer.

The speed sd-turbo bought us is bought back by a **step-distillation LoRA**
(Hyper-SD 4-step by default) — SD1.5 at 1–4 steps, still fine-tunable and
controllable underneath. That is the whole trick.

**NOT DMD2.** `tianweiy/DMD2` ships SDXL distillations only (`dmd2_sdxl_*`);
there is no SD1.5 DMD2 LoRA, and SDXL is 1024-native and far too heavy for a
real-time lens. Hyper-SD is the live SD1.5 distillation. (`pipeline.py` degrades
loudly rather than crashing when a LoRA is missing — that is how this was found.)

### Measured, 2026-07-11 (identical knobs, seed, prompt, real raymarched frame)

| model | CUDA A10G reference | this Mac (MPS) |
|---|---|---|
| sd-turbo (incumbent) | **83 ms · 12.1fps** | 847 ms · 1.2fps |
| SD1.5 + Hyper-SD 4-step | **81 ms · 12.3fps** | 1173 ms · 0.9fps |
| SD1.5 + Hyper-SD 1-step | 80 ms · 12.4fps | 1187 ms · 0.8fps |
| SD1.5 + LCM-LoRA | 82 ms · 12.1fps | 1177 ms · 0.8fps |

**On CUDA the migration is free** — all four are the same speed inside noise, so
we get fine-tuning, ControlNet and a shippable licence for nothing. And at the
explore defaults the four are near-indistinguishable on a real frame (contact
sheet in `bench-out/`), so it costs no dread either. Decided: **SD1.5 +
Hyper-SD**.

The 512² MPS reference lands at roughly 1fps, so the live local launcher defaults
to 256², one pass, no ControlNet, and direct frame replacement. While the player
moves, the overlay becomes translucent and the live base render carries spatial
response. Set `LENS_SIZE=320` or `LENS_DEPTH=1` only when trading responsiveness
back for image/detail fidelity on purpose.

```
python -m venv .venv-local && .venv-local/bin/pip install -r requirements-local.txt
.venv-local/bin/python bench.py                 # ms/frame + contact sheet, every model
.venv-local/bin/python server.py                # local GPU, same protocol, $0
```
`bench.py` answers the two separate questions — *is it fast enough* (median
ms/frame; the mean of a GPU is a lie told by the first frame) and *does it still
scare* (same frame, same seed, same prompt, through every model, side by side).

⚠️ **The knob table above was swept against sd-turbo and is not automatically
true of SD1.5.** CFG in particular: sd-turbo's native guidance is 0 and the abyss
starts at ~2. DMD2 sits near 0 but tolerates ~1; LCM-LoRA wants ~1. `Model.
native_guidance` records where each model's cliff begins — the client keeps
pointing the knob at the cliff on purpose. **Re-sweep before trusting the
defaults**, and expect the prompt rules (no "psychedelic/neon", state darkness
explicitly) to still hold, because those are facts about diffusion, not about 2.1.

## Depth ControlNet — the thing only this project can do

Every other img2img pipeline in the world has to **estimate** the depth of its
conditioning image: run MiDaS over a picture and hope. **We raymarched the room.**
`r3d.js` already knew the exact distance to every pixel and was throwing it away
at the end of the march.

It now rides in the **alpha channel** of the scene texture (the post pass reads
only `.rgb`, so nothing on screen can see it), is resolved on demand by
`r3dDepthCanvas(serverSize)` — *only* when a frame is actually being sent, never once
per rAF, because `readPixels` is a stall and a stall in the render loop is a
stutter in a horror game — and is normalised to fill the range, because a
ControlNet handed a low-contrast map politely ignores it.

Stored as **inverse depth (near = bright)**, which is the MiDaS convention every
SD depth ControlNet was trained on. Hand one a linear far-is-bright map and it
turns the room inside out.

**Protocol.** Frame and depth travel as ONE binary message:

```
b'L2' | uint32 le frame length | frame JPEG | depth JPEG
```

Never two messages. Sent separately they can desync by a frame under load, and a
depth map one frame stale is a depth map of a room you have already left — worse
than no depth at all, because the model *believes* it. A JPEG always begins
`FF D8 FF`, so the magic can never be mistaken for a bare frame from an older
client: old client → new server still works, and a server that cannot do depth
omits `depth:true` from its status and is never sent any.

Knobs: `depthScale` (0 = blind smear, 1 = walls pinned exactly and the lens
becomes a texture pass; **0.6** keeps the room a room while its material goes
wrong). Live via `window.__diffusion.tune({depthScale: 0.8})`, or `?nodepth=1`
for the blind lens. `bench.py --depth _depth.png` runs each model twice, blind
and sighted, so the claim can be seen rather than believed.

## The ROOM TONE LoRA

`train_lora.py` — the other half of the reason for leaving sd-turbo. A prompt can
only *ask* for a register; a LoRA supplies it.

```
.venv-local/bin/python train_lora.py
LENS_STYLE_LORA=./roomtone.safetensors ./run-local.sh
```

Read `dataset/README.md` before collecting anything. The one rule: **a LoRA learns
the intersection of your images**, so they must share exactly the thing you want
and differ in everything else — and **no people, ever, in the training set**, for
the same reason `NO_CHARACTERS` is the default negative prompt. One image with a
figure at the end of a hallway teaches the lens to put figures at the ends of
hallways, and a cast introduced by a sampler is not a cast.

## Next (with game content, M4+)
- Per-area prompts: client `setPrompt()` already exists; wire to narrative
  registers (straight/ironic/decay/refusal = four looks).
- Optional Cloudflare gatekeeper (budget ledger, queue) if demo links leak.
- `Dockerfile` is a provider-agnostic fallback (RunPod-style pods).
