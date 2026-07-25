#!/usr/bin/env python3
"""Build the per-target offline lens sidecar and its pinned model resources.

Run on the target OS: PyInstaller does not cross-compile. The release workflow
installs the pinned inference requirements, downloads immutable Hugging Face
snapshots, writes a checksum manifest, and then invokes this script before the
Tauri bundle step.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.request import urlopen

from huggingface_hub import snapshot_download

REVISIONS = {
    "sd15": ("stable-diffusion-v1-5/stable-diffusion-v1-5", "451f4fe16113bff5a5d2269ed5ad43b0592e9a14"),
    "hyper-sd": ("ByteDance/Hyper-SD", "bc08d970a87c74c71209491d64e3525845698863"),
    "taesd": ("madebyollin/taesd", "614f76814bbe30edbe2e627ace1c2234c81a2c0e"),
    "controlnet-depth": ("lllyasviel/control_v11f1p_sd15_depth", "539f99181d33db39cf1af2e517cd8056785f0a87"),
}
ALLOW_PATTERNS = {
    "sd15": [
        "README.md", "model_index.json", "feature_extractor/*", "scheduler/*", "tokenizer/*",
        "text_encoder/config.json", "text_encoder/model.fp16.safetensors",
        "unet/config.json", "unet/diffusion_pytorch_model.fp16.safetensors",
        "vae/config.json", "vae/diffusion_pytorch_model.fp16.safetensors",
    ],
    "hyper-sd": ["README.md", "LICENSE.md", "Hyper-SD15-4steps-lora.safetensors"],
    "taesd": ["README.md", "config.json", "diffusion_pytorch_model.safetensors"],
    "controlnet-depth": ["README.md", "config.json", "diffusion_pytorch_model.fp16.safetensors"],
}
TARGETS = {
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
}
SD15_LICENSE_URL = "https://raw.githubusercontent.com/CompVis/stable-diffusion/21f890f9da3cfbeaba8e2ac3c425ee9e998d5229/LICENSE"
SD15_LICENSE_SHA256 = "be351ebe7ac01bcdbb018639aadcfd38f136b7dc3f2a3d4d3a24db51d1b210ef"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, choices=sorted(TARGETS))
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    root = args.repo_root.resolve()
    server_dir = Path(__file__).resolve().parent
    resource_root = root / "src-tauri" / "lens-resources" / "lens"
    models = resource_root / "models"
    binaries = root / "src-tauri" / "binaries"
    models.mkdir(parents=True, exist_ok=True)
    binaries.mkdir(parents=True, exist_ok=True)

    resolved = {}
    for folder, (repo_id, revision) in REVISIONS.items():
        destination = models / folder
        snapshot = Path(snapshot_download(
            repo_id=repo_id,
            revision=revision,
            allow_patterns=ALLOW_PATTERNS[folder],
        ))
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(snapshot, destination, symlinks=False)
        resolved[folder] = {"repoId": repo_id, "revision": revision}

    notices = root / "THIRD_PARTY_LENS_NOTICES.md"
    shutil.copy2(notices, resource_root / notices.name)
    taesd_license = root / "third_party" / "licenses" / "TAESD-MIT.txt"
    shutil.copy2(taesd_license, resource_root / taesd_license.name)
    license_bytes = urlopen(SD15_LICENSE_URL, timeout=60).read()
    if hashlib.sha256(license_bytes).hexdigest() != SD15_LICENSE_SHA256:
        raise SystemExit("Stable Diffusion license checksum changed")
    (resource_root / "CREATIVEML_OPEN_RAIL_M.txt").write_bytes(license_bytes)

    files = {}
    for path in sorted(resource_root.rglob("*")):
        if path.is_file() and path.name != "manifest.json":
            files[path.relative_to(resource_root).as_posix()] = sha256(path)
    aggregate = hashlib.sha256(
        json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    manifest = {
        "schema": 1,
        "serviceSchema": 2,
        "modelId": "sd15-hyper4",
        "resolution": 512,
        "repositories": resolved,
        "files": files,
        "weightsSha256": aggregate,
    }
    (resource_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", "utf-8"
    )

    # The wheel about to be frozen must match the backend the sidecar will
    # demand at runtime. A CUDA target with a CPU-only torch is exactly the
    # defect that shipped a GPU-less Windows sidecar — and it needs no GPU to
    # detect, only `torch.version.cuda`. Fail the build here rather than after
    # a player downloads it.
    import torch  # installed by install_torch.py before this runs
    is_macos = "apple-darwin" in args.target
    cuda_build = getattr(torch.version, "cuda", None)
    if is_macos:
        if cuda_build is not None:
            raise SystemExit(f"macOS sidecar must use the MPS wheel, got a CUDA build ({cuda_build})")
    elif cuda_build is None:
        raise SystemExit(
            "CUDA target has a CPU-only torch wheel — run install_torch.py first. "
            "This is the packaging defect that shipped a GPU-less sidecar."
        )
    print(f"freezing torch {torch.__version__} (cuda build: {cuda_build}) for {args.target}")

    work = root / ".lens-build" / args.target
    work.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            "chunk-lens",
            "--distpath",
            str(work / "dist"),
            "--workpath",
            str(work / "work"),
            "--specpath",
            str(work),
            "--paths",
            str(server_dir),
            "--collect-all",
            "diffusers",
            "--collect-all",
            "transformers",
            str(server_dir / "server.py"),
        ],
        check=True,
        env={**os.environ, "LENS_BUNDLED": "0"},
    )
    suffix = ".exe" if "windows" in args.target else ""
    built = work / "dist" / f"chunk-lens{suffix}"
    target = binaries / f"chunk-lens-{args.target}{suffix}"
    shutil.copy2(built, target)
    target.chmod(target.stat().st_mode | 0o111)
    print(json.dumps({"binary": str(target), "resources": str(resource_root), "weightsSha256": aggregate}))


if __name__ == "__main__":
    main()
