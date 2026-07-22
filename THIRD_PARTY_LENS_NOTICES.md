# Critical Diffusion Runtime Notices

Chunk Surfer bundles model resources for local, offline material generation.
The generated material bank is an authored rendering layer; no player image or
camera stream is uploaded.

The bundled model resources are also covered by the Chunk Surfer End User
License Agreement, distributed as `EULA.md` in packaged app resources. That EULA
includes the required responsible-use restrictions for the bundled OpenRAIL
model resources.

## Stable Diffusion 1.5

- Project: Stable Diffusion v1.5
- Source: https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5
- Pinned repository revision: `451f4fe16113bff5a5d2269ed5ad43b0592e9a14`
- License: CreativeML Open RAIL-M
- The CreativeML Open RAIL-M text is distributed as
  `lens/CREATIVEML_OPEN_RAIL_M.txt`; pinned model-card attribution remains in
  `lens/models/sd15/README.md`.

## Hyper-SD

- Project: Hyper-SD, SD1.5 four-step LoRA
- Source: https://huggingface.co/ByteDance/Hyper-SD
- Pinned repository revision: `bc08d970a87c74c71209491d64e3525845698863`
- License: the Hyper-SD repository license and notices
- The pinned repository license is distributed in `lens/models/hyper-sd/`
  beside the installed runtime.

## ControlNet depth for Stable Diffusion 1.5

- Project: ControlNet v1.1 depth checkpoint for Stable Diffusion 1.5
- Source: https://huggingface.co/lllyasviel/control_v11f1p_sd15_depth
- Pinned repository revision: `539f99181d33db39cf1af2e517cd8056785f0a87`
- License: CreativeML Open RAIL-M
- The CreativeML Open RAIL-M text is distributed as
  `lens/CREATIVEML_OPEN_RAIL_M.txt`; pinned model-card attribution remains in
  `lens/models/controlnet-depth/README.md`.

## TAESD

- Project: TAESD
- Source: https://github.com/madebyollin/taesd
- Pinned repository revision: `614f76814bbe30edbe2e627ace1c2234c81a2c0e`
- License: MIT
- The TAESD MIT license text is distributed as `lens/TAESD-MIT.txt`; pinned
  model-card attribution remains in `lens/models/taesd/README.md`.

## Manifest

The packaged `lens/manifest.json` identifies the exact pinned repositories,
records the installed files, and checksums the bundled model resources.
