# chunk-surfer diffusion-lens server — RunPod pod image (M1c).
# Build:  docker build -t chunk-surfer-diffusion .
# Run:    docker run --gpus all -p 8787:8787 chunk-surfer-diffusion
# RunPod: expose TCP port 8787; the pod proxy URL becomes the ?diffusion= ws target.
FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

RUN pip install --no-cache-dir \
    diffusers==0.31.0 transformers accelerate safetensors \
    fastapi "uvicorn[standard]" pillow

WORKDIR /app
COPY server.py .

# Pre-download weights into the image so pod cold-start skips the pull.
RUN python -c "from diffusers import AutoPipelineForImage2Image, AutoencoderTiny; import torch; \
AutoPipelineForImage2Image.from_pretrained('stabilityai/sd-turbo', torch_dtype=torch.float16, variant='fp16'); \
AutoencoderTiny.from_pretrained('madebyollin/taesd', torch_dtype=torch.float16)"

EXPOSE 8787
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787"]
