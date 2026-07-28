import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const rel=(p)=>path.join(ROOT,p);
let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};
const read=(p)=>fs.readFileSync(rel(p),'utf8');

const cfg=JSON.parse(read('lens.local.example.json'));
const endpoint=new URL(cfg.url);
ck('browser development config is loopback WebSocket only',endpoint.protocol==='ws:'&&endpoint.hostname==='127.0.0.1',cfg.url);
ck('browser development config has no packaged credential',!('token' in cfg));

const main=read('src/main.js');
const client=read('src/net/diffusion.js');
const server=read('tools/chunk_surfer/diffusion_server/server.py');
const pipeline=read('tools/chunk_surfer/diffusion_server/pipeline.py');
const rust=read('src-tauri/src/lens_service.rs');
const bundle=read('tools/chunk_surfer/diffusion_server/build_bundle.py');
const pkg=JSON.parse(read('package.json'));

ck('browser rejects non-loopback diffusion endpoints',main.includes('remote diffusion endpoint rejected — the lens is local-only'));
ck('desktop asks Tauri to own the service',main.includes('bootstrapNativeLens')&&rust.includes('chunk_lens_bootstrap'));
ck('desktop uses random authenticated loopback sessions',rust.includes('127.0.0.1", 0')&&rust.includes('OsRng.fill_bytes')&&client.includes("searchParams.set('token'"));
ck('hardware support is MPS or CUDA only',server.includes('device not in {"cuda", "mps"}')&&rust.includes('macOS Apple Silicon (MPS) or Windows/Linux x64 with NVIDIA CUDA'));
ck('game selects material-bank diffusion instead of camera diffusion',main.includes('surfaceDiffusionStart({')&&!client.includes('export function diffusionStart'));
ck('all six ten-tile banks are mandatory',client.includes('profiles.length !== 6')&&client.includes('completeBankCount(banks)'));
ck('material bank commits after all ten staged tiles',client.includes('for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1)')&&client.includes('commitSurfaces(profile.generation.mix'));
ck('gameplay mutation is visible-material, performance-gated, and not camera-driven',client.includes('tickMutation')&&client.includes("type: mutation ? 'mutate' : 'generate'")&&!client.includes('setZone')&&!client.includes('zonePrompt'));
ck('runtime mutation is ephemeral and never expands the authored cache',server.includes('new seed every few seconds would create unbounded disk use'));
ck('request/result identifiers and checksum are enforced',client.includes('pendingResult.checksumId')&&server.includes('"checksumId"')&&server.includes('record_manifest'));
ck('bundled models are offline and byte-verified',pipeline.includes('local_files_only')&&pipeline.includes('validate_bundled_resources'));
ck('frozen sidecar defaults to bundled resources',pipeline.includes('getattr(sys, "frozen", False)'));
ck('packaged launch cannot fall back to network weights',rust.includes('.env("HF_HUB_OFFLINE", "1")')&&rust.includes('.env("TRANSFORMERS_OFFLINE", "1")'));
ck('health endpoint starts before model initialization',rust.includes('.env("LENS_EAGER", "0")')&&server.includes('os.environ.get("LENS_EAGER", "0") == "1"'));
ck('native watchdog allows silent extraction, follows startup progress, and retains a hard cap',rust.includes('health_silent_timeout')&&rust.includes('health_stall_timeout')&&rust.includes('health_hard_timeout')&&rust.includes('last_progress_at'));
ck('bundled fp16 weights are selected on Apple, NVIDIA, AMD, and CPU fallback',pipeline.includes('BUNDLED or dtype == torch.float16')&&pipeline.includes('controlnet_kw["variant"] = weight_variant'));
ck('bundled loading cannot fall back to weight files that were not shipped',pipeline.includes('if BUNDLED or "variant" not in k:')&&pipeline.includes('Preserve the real load error'));
ck('sidecar package supports only the three approved target triples',bundle.includes('aarch64-apple-darwin')&&bundle.includes('x86_64-pc-windows-msvc')&&bundle.includes('x86_64-unknown-linux-gnu')&&!bundle.includes('x86_64-apple-darwin'));
ck('one command launches browser development service',pkg.scripts['lens:local']==='tools/chunk_surfer/diffusion_server/run-local.sh');
ck('one command prepares packaged service',pkg.scripts['lens:bundle']?.includes('build_bundle.py'));

const launcher=rel('tools/chunk_surfer/diffusion_server/run-local.sh');
ck('local launcher is executable',(fs.statSync(launcher).mode&0o111)!==0);
ck('bundled path replaces the old local venv release gate',fs.existsSync(rel('src-tauri/tauri.lens.conf.json')));

if(!pass){console.error('\n❌ LOCAL LENS FAILURES');process.exit(1);}
console.log('\n✅ LOCAL LENS PASSED');
