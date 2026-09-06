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
import time
from urllib.request import urlopen

from huggingface_hub import snapshot_download
from huggingface_hub.errors import HfHubHTTPError, LocalEntryNotFoundError
from protocol import CACHE_SCHEMA, MODEL_ID, SERVER_REV, SERVICE_SCHEMA

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
RUNTIME_SOURCE_FILES = (
    "cache_contract.py",
    "dream.py",
    "pipeline.py",
    "protocol.py",
    "requirements-local.txt",
    "server.py",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_aggregate(server_dir: Path) -> str:
    files = {name: sha256(server_dir / name) for name in RUNTIME_SOURCE_FILES}
    return hashlib.sha256(
        json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


# THE HUB RATE-LIMITS, AND IT DOES IT LATE.
#
# Every release fans out to three runners at once, each pulling four
# unauthenticated snapshots. On the v0.2.0 tag the macOS job downloaded the
# 14-file SD1.5 snapshot, then a 3-file one, and only THEN took a 429
# ("maximum queue size reached") on taesd -- throwing away five and a half
# minutes of good work and failing the platform.
#
# The 429 does not surface as an HTTP error either: snapshot_download catches
# it, fails to find the files locally, and re-raises LocalEntryNotFoundError
# with a message about the internet connection. Both have to be caught or the
# retry never fires on the case it exists for.
#
# Bounded and backed off rather than infinite: a genuinely wrong revision or a
# withdrawn repo should still fail the build, and reasonably quickly.
HUB_ATTEMPTS = 5
HUB_BACKOFF_SECONDS = (15, 30, 60, 120)


def snapshot_with_retry(folder, repo_id, revision, allow_patterns):
    for attempt in range(1, HUB_ATTEMPTS + 1):
        try:
            return Path(snapshot_download(
                repo_id=repo_id,
                revision=revision,
                allow_patterns=allow_patterns,
            ))
        except (HfHubHTTPError, LocalEntryNotFoundError) as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            transient = status is None or status == 429 or status >= 500
            if attempt == HUB_ATTEMPTS or not transient:
                raise
            delay = HUB_BACKOFF_SECONDS[min(attempt - 1, len(HUB_BACKOFF_SECONDS) - 1)]
            print(
                f"{folder}: hub fetch failed ({status or type(error).__name__}); "
                f"retrying in {delay}s [{attempt}/{HUB_ATTEMPTS - 1}]",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(delay)
    raise SystemExit(f"unreachable: {folder} retry loop fell through")


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
        snapshot = snapshot_with_retry(folder, repo_id, revision, ALLOW_PATTERNS[folder])
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
        "serviceSchema": SERVICE_SCHEMA,
        "cacheSchema": CACHE_SCHEMA,
        "serviceRevision": SERVER_REV,
        "modelId": MODEL_ID,
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
    try:
        import compel
    except Exception as error:
        raise SystemExit(
            "Compel is required in the shipped lens runtime — install "
            "requirements-local.txt before building."
        ) from error
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
    print(f"freezing compel {getattr(compel, '__version__', 'unknown')} for {args.target}")

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
            "--collect-all",
            "compel",
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
    contract = {
        "schema": 1,
        "target": args.target,
        "serviceSchema": SERVICE_SCHEMA,
        "cacheSchema": CACHE_SCHEMA,
        "serviceRevision": SERVER_REV,
        "modelId": MODEL_ID,
        "runtimeSourceSha256": source_aggregate(server_dir),
        "binarySha256": sha256(target),
    }
    contract_path = target.with_name(f"{target.name}.contract.json")
    contract_path.write_text(
        json.dumps(contract, indent=2, sort_keys=True) + "\n", "utf-8"
    )
    print(json.dumps({
        "binary": str(target),
        "contract": str(contract_path),
        "resources": str(resource_root),
        "weightsSha256": aggregate,
    }))


if __name__ == "__main__":
    main()
