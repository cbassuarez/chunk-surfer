#!/usr/bin/env python3
"""Install PyTorch from the RIGHT wheel index for this platform.

This exists because `pip install torch` does not do the obvious thing. PyPI's
default index serves a CPU-only torch wheel on Windows — so the release build
shipped a sidecar that reported `cuda.is_available() == False` on every Windows
machine, GPU or not. The CUDA wheels live on a separate index, and the RTX
50-series (Blackwell, sm_120) only has kernels in the cu128 wheels.

  macOS  -> default index. Apple-Silicon torch from PyPI has MPS; there is no
            CUDA on a Mac and no separate index to reach for.
  Windows/Linux -> the cu128 index, with a torch floor new enough for Blackwell.

Run this BEFORE `pip install -r requirements-local.txt`. Once a satisfying
torch is present, the requirements install leaves it alone (its torch line is a
loose floor, not an exact pin), so the CUDA wheel is not clobbered by the
default-index CPU wheel.
"""

from __future__ import annotations

import platform
import subprocess
import sys

# Blackwell (RTX 50-series) needs cu128 wheels, first shipped with torch 2.7.
# The ceiling keeps a surprise major from landing in a reproducible build.
TORCH_SPEC = "torch>=2.7,<2.9"
VISION_SPEC = "torchvision>=0.22,<0.24"
CUDA_INDEX = "https://download.pytorch.org/whl/cu128"


def install(args: list[str]) -> None:
    cmd = [sys.executable, "-m", "pip", "install", "--no-cache-dir", *args]
    print("+", " ".join(cmd))
    subprocess.check_call(cmd)


def main() -> int:
    system = platform.system()
    if system == "Darwin":
        # Default index: the MPS build.
        install([TORCH_SPEC, VISION_SPEC])
        backend = "mps"
    else:
        # Windows and Linux both want CUDA, and both want it from the cu128
        # index rather than whatever the default index would hand them.
        install(["--index-url", CUDA_INDEX, TORCH_SPEC, VISION_SPEC])
        backend = "cuda"

    # Prove what landed, so the CI log shows CUDA is really present before the
    # sidecar is even built — the check that would have caught this at release.
    check = (
        "import torch, json;"
        "print('installed torch', json.dumps({"
        "'version': torch.__version__,"
        "'cudaBuild': getattr(torch.version, 'cuda', None),"
        "'cudaAvailable': bool(torch.cuda.is_available())}))"
    )
    subprocess.check_call([sys.executable, "-c", check])
    print(f"torch install complete for backend: {backend}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
