# Critical Diffusion Runtime Notices

Chunk Surfer bundles model resources for local, offline material generation.
The generated material bank is an authored rendering layer; no player image or
camera stream is uploaded.

## Stable Diffusion 1.5

- Project: Stable Diffusion v1.5
- Source: https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5
- License: CreativeML Open RAIL-M
- The CreativeML Open RAIL-M text is distributed as
  `lens/CREATIVEML_OPEN_RAIL_M.txt`; pinned model-card attribution remains in
  `lens/models/sd15/README.md`.

## Hyper-SD

- Project: Hyper-SD, SD1.5 four-step LoRA
- Source: https://huggingface.co/ByteDance/Hyper-SD
- License: the Hyper-SD repository license and notices
- The pinned repository license is distributed in `lens/models/hyper-sd/`
  beside the installed runtime.

## Additional inference resources

The packaged manifest identifies and checksums the pinned TAESD and SD1.5 depth
ControlNet snapshots. Their repository license and attribution files are kept
inside their respective model resource directories.
