# Chunk Surfer critical diffusion service

This loopback-only GPU service generates the six authored material banks used by
the renderer: `calm`, `explore`, `booth`, `battle`, `hush`, and `rupture`. Each
bank contains ten deterministic 512px surface tiles. It never receives or
replaces the camera image; geometry, PBR lighting, depth, silhouettes, UI, and
motion stay native to the game renderer.

After all six banks are resident, gameplay may request one currently visible
material tile every 5–15 seconds. Runtime requests are one-pass, low-strength
img2img mutations anchored mostly to the authored albedo and are never written to
the persistent cache. The client rejects large luminance, colour, and seam
outliers, crossfades accepted tiles over 6–12 seconds, and disables further
mutation for the session if generation—or the first observed frames after its
result—overlaps a frame longer than 33ms.

Production boot is a hard gate. The Tauri shell starts its own bundled service
on a random loopback port with a random per-launch token. Loading verifies the
GPU and packaged weight manifest, then makes the ten-tile `calm` bank resident
before opening credits. The other five banks stream during the opening and menu;
a bank requested by a scene moves to the front of that queue. There is no CPU
path, remote endpoint, cloud fallback, player tuning panel, or “continue without
lens” action.

Supported packages:

- macOS Apple Silicon using MPS
- Windows x64 using NVIDIA CUDA
- Linux x64 using NVIDIA CUDA

Other hardware receives a compatibility error before model weights load.

## Browser development

Browser development uses the same WebSocket request/result protocol with a
separately launched service:

```sh
python3.12 -m venv .venv-local
.venv-local/bin/pip install -r requirements-local.txt
./run-local.sh
```

`lens.local.json` is ignored by git; copy `lens.local.example.json` when a
different loopback port is needed. Development may omit a token. Packaged builds
always require one.

## Protocol

Every generated tile is bound to explicit `requestId`, `bankId`, `slot`,
`modelId`, and `checksumId` values. The service sends structured `progress`,
`result`, and `error` events. Result metadata precedes the JPEG bytes and the
client checks the SHA-256 before admitting that tile to a bank.

The cache is outside the save/Steam Cloud tree. A content key includes source
atlas checksum, profile recipe, service/cache schema, model, resolution, fixed
seed, and bundled weight checksum. Each bank manifest is replaced atomically.
Corrupt or mismatched entries are regenerated.

Only authored `generate` requests enter this cache. Ephemeral gameplay `mutate`
requests never create manifests or files, so play time cannot grow the lens cache.

Cached tiles are checked before model construction, so a fully cached launch
does not pay to load or warm Stable Diffusion. The source atlas is fetched and
decoded once, and its ten JPEG payloads are encoded once for reuse across all
six banks.

## Packaging

Run the build on its target operating system; PyInstaller does not cross-build:

```sh
python -m pip install -r requirements-local.txt pyinstaller==6.16.0
python build_bundle.py --target aarch64-apple-darwin
# or x86_64-pc-windows-msvc / x86_64-unknown-linux-gnu
```

The builder downloads pinned Hugging Face revisions, copies license/attribution
files, writes a byte-level weight manifest, and produces the target-triple
sidecar expected by `src-tauri/tauri.lens.conf.json`. Release builds merge that
config so Tauri packages both `externalBin` and `resources`.

## Verification

`smoke-local.py` exercises the loopback protocol against a running development
service. On representative hardware, the self-hosted GPU workflow runs a real
512px material generation directly through MPS or CUDA:

```sh
python smoke-local.py --require-accelerator --size 512
```

The model contract is Stable Diffusion 1.5 plus the pinned Hyper-SD four-step
LoRA, TAESD, and the SD1.5 depth ControlNet. Production resource loading uses
`local_files_only=True`; an offline first launch cannot attempt a model download.
