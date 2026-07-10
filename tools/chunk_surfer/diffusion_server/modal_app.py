"""Modal deployment wrapper for the chunk-surfer diffusion-lens server.

Deploy:   .venv/bin/modal deploy modal_app.py
Dev loop: .venv/bin/modal serve modal_app.py   (hot-reloads server.py)

Serves the FastAPI app in server.py (WebSocket JPEG protocol) at a stable
wss:// URL. Token gating via the `chunk-surfer-lens` Modal Secret
(key LENS_TOKEN) — create once with:
  .venv/bin/modal secret create chunk-surfer-lens LENS_TOKEN=<random>

Cost posture: scaledown_window=120 means the GPU container dies two minutes
after the last player disconnects; nothing runs (or bills) while idle.
"""

import modal

app = modal.App("chunk-surfer-lens")


def _download_weights():
    import torch
    from diffusers import AutoencoderTiny, AutoPipelineForImage2Image

    AutoPipelineForImage2Image.from_pretrained(
        "stabilityai/sd-turbo", torch_dtype=torch.float16, variant="fp16"
    )
    AutoencoderTiny.from_pretrained("madebyollin/taesd", torch_dtype=torch.float16)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        # pinned trio: diffusers 0.31 breaks against transformers>=4.50
        # (FLAX_WEIGHTS_NAME removed) and huggingface_hub>=1.0
        "torch==2.4.0",
        "diffusers==0.31.0",
        "transformers==4.46.3",
        "huggingface_hub==0.26.5",
        "accelerate==1.1.1",
        "safetensors",
        "fastapi",
        "uvicorn",
        "pillow",
    )
    .run_function(_download_weights)  # bake weights into the image
    .add_local_file("server.py", "/root/server.py")
)


@app.function(
    image=image,
    gpu="A10G",  # ~$1.10/hr while a session is live; try L4/T4 if credits matter more than fps
    timeout=3600,
    scaledown_window=120,
    secrets=[modal.Secret.from_name("chunk-surfer-lens")],
)
@modal.concurrent(max_inputs=4)  # extra connections reach server.py's polite single-session refusal
@modal.asgi_app()
def lens():
    import server

    return server.app
