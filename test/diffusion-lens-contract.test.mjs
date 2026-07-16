import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('boot hard-gates credits and title behind mandatory calibration', () => {
  const main = read('src/main.js');
  const calibration = read('src/game/lens-calibration.js');
  assert.match(main, /makeLensCalibrationScene\(\{[\s\S]*start:calibrate[\s\S]*onReady:afterCalibration/);
  assert.match(main, /await lens\.ready/);
  assert.match(main, /await lens\.activateBank\?\.\(bank,\{transitionMs:0\}\)/);
  assert.match(main, /scenes\.push\(makeOpeningCreditsScene\(\{onDone:afterCredits\}\)\)/);
  assert.match(calibration, /LOADING MATERIALS/);
  assert.match(calibration, /PREPARING TEXTURES/);
  assert.match(calibration, /RETRY/);
  assert.match(calibration, /QUIT/);
  assert.doesNotMatch(calibration, /AUDIOCORP|GENERATIVE LENS|BANKS VERIFIED/);
  assert.doesNotMatch(calibration, /continue without|bypass|skip/i);
  assert.doesNotMatch(main, /createLocalDiffusionFallback|THE LENS SLEEPS IN THE DOCK/);
});

test('production material client stages one boot bank and streams all six complete banks', () => {
  const client = read('src/net/diffusion.js');
  const main = read('src/main.js');
  assert.match(client, /profiles\.length !== 6/);
  assert.match(client, /SURFACE_NAMES\.length/);
  assert.match(client, /criticalBank/);
  assert.match(client, /criticalTotal: SURFACE_NAMES\.length/);
  assert.match(client, /allReady/);
  assert.match(client, /prioritizeBank\(bankId\)/);
  assert.match(client, /await waitForBank\(bankId\)/);
  assert.match(client, /completeBankCount\(banks\)/);
  assert.match(client, /beginBank\(bankId\)/);
  assert.match(client, /for \(let slot = 0; slot < SURFACE_NAMES\.length; slot \+= 1\)/);
  assert.match(client, /commitSurfaces\([\s\S]*bankId, transitionMs/);
  assert.match(client, /if \(!shouldCommit\(\)\) return false/);
  assert.match(main, /lookApplyQueue=lookApplyQueue/);
  assert.match(main, /WORLD_HIDDEN_SCENES[\s\S]*lens-calibration[\s\S]*opening-credits[\s\S]*title[\s\S]*credits/);
  assert.match(main, /if\(!scenePresentationHidesWorld\(\)\) render3d\(\)/);
  assert.doesNotMatch(client, /export function diffusionStart|setBypass|tune\(/);
});

test('material service reconnects are bounded and cancellable', () => {
  const client = read('src/net/diffusion.js');
  assert.match(client, /let reconnectTimer = null/);
  assert.match(client, /if \(retries-- > 0\)/);
  assert.doesNotMatch(client, /onopen\s*=\s*async[\s\S]{0,220}retries\s*=\s*RETRIES/);
  assert.match(client, /stop\(\) \{[\s\S]*clearTimeout\(reconnectTimer\)/);
});

test('runtime hallucination mutates one visible material ephemerally and fails closed on frame pressure', () => {
  const client = read('src/net/diffusion.js');
  const policy = read('src/net/material-mutation.js');
  const server = read('tools/chunk_surfer/diffusion_server/server.py');
  const main = read('src/main.js');
  assert.match(policy, /MUTATION_INTERVAL_MIN_MS = 5_000/);
  assert.match(policy, /MUTATION_INTERVAL_MAX_MS = 15_000/);
  assert.match(policy, /MUTATION_CROSSFADE_MIN_MS = 6_000/);
  assert.match(policy, /MUTATION_CROSSFADE_MAX_MS = 12_000/);
  assert.match(policy, /MUTATION_MIN_FPS = 58/);
  assert.match(client, /type: mutation \? 'mutate' : 'generate'/);
  assert.match(client, /anchoredMutationPayload/);
  assert.match(client, /mutationCandidateSafe/);
  assert.match(client, /lastFrameMs > 33/);
  assert.match(client, /MUTATION_OBSERVE_MS = 2_000/);
  assert.match(client, /observingResult && !active && !mutationPreparing/);
  assert.match(client, /disableMutations\('frame-budget'|mutationSoftFailure\('frame-budget'/);
  assert.match(main, /visibleSurfaceSlots/);
  assert.match(main, /tickMutation/);
  assert.match(server, /\{"generate", "mutate"\}/);
  assert.match(server, /if work\.get\("type"\) == "generate":\s+cache_key = material_cache_key/);
});

test('protocol binds result bytes to request, bank, slot, model, and checksum identifiers', () => {
  const client = read('src/net/diffusion.js');
  const server = read('tools/chunk_surfer/diffusion_server/server.py');
  for (const field of ['requestId', 'bankId', 'slot', 'modelId', 'checksumId']) {
    assert.match(client, new RegExp(field));
    assert.match(server, new RegExp(field));
  }
  assert.match(client, /pendingResult\.sha256 !== checksum/);
  assert.match(server, /record_manifest/);
  assert.match(server, /cached_result/);
  assert.ok(server.indexOf('cached_result(bank_id') < server.indexOf('await loop.run_in_executor(None, load_lens)'),
    'cache lookup must happen before the model is loaded');
  assert.match(server, /if cache_path and not cached:/);
});

test('desktop shell owns random authenticated sidecar lifecycle and cleanup', () => {
  const rust = read('src-tauri/src/lens_service.rs');
  const cargo = read('src-tauri/Cargo.toml');
  const main = read('src/main.js');
  assert.match(rust, /TcpListener::bind\(\("127\.0\.0\.1", 0\)\)/);
  assert.match(rust, /OsRng\.fill_bytes/);
  assert.match(rust, /MAX_STARTS/);
  assert.match(rust, /impl Drop for ManagedLens/);
  assert.match(main, /bootstrapNativeLens/);
  assert.match(clientSource(), /searchParams\.set\('token'/);
  assert.match(rust, /\.env\("LENS_DEPTH", "0"\)/);
  assert.match(rust, /command\.creation_flags\(sidecar_creation_flags\(\)\)/);
  assert.match(rust, /CREATE_NO_WINDOW/);
  assert.match(cargo, /target\.'cfg\(windows\)'\.dependencies[\s\S]*windows-sys/);
  assert.doesNotMatch(rust, /CREATE_NEW_CONSOLE|DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP/);
});

test('native development has an explicit loopback service path without weakening production ownership', () => {
  const main = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));
  const runner = read('scripts/run-latest.mjs');
  assert.match(main, /import\.meta\.env\?\.DEV[\s\S]*VITE_LENS_DEV_URL/);
  assert.ok(main.indexOf("qp.get('diffusion')") < main.indexOf('VITE_LENS_DEV_URL'));
  assert.match(main, /if\(IS_TAURI\)[\s\S]*bootstrapNativeLens/);
  assert.equal(pkg.scripts['play:latest'], 'node scripts/run-latest.mjs');
  assert.match(runner, /LENS_EAGER: '0'/);
  assert.match(runner, /port:\s*0/);
  assert.match(runner, /VITE_LENS_DEV_TOKEN:lensToken/);
  assert.doesNotMatch(runner, /aarch64-apple-darwin/,'developer launch follows the host platform instead of forcing macOS arm64');
});

function clientSource() { return read('src/net/diffusion.js'); }

test('bundled model path is offline, checksum-verified, and GPU-only', () => {
  const pipeline = read('tools/chunk_surfer/diffusion_server/pipeline.py');
  const server = read('tools/chunk_surfer/diffusion_server/server.py');
  const bundle = read('tools/chunk_surfer/diffusion_server/build_bundle.py');
  assert.match(pipeline, /local_files_only/);
  assert.match(pipeline, /validate_bundled_resources/);
  assert.match(pipeline, /diffusers_logging\.disable_progress_bar\(\)/);
  assert.match(server, /device not in \{"cuda", "mps"\}/);
  assert.match(server, /expected == "cuda"[\s\S]*NVIDIA CUDA hardware and a compatible driver are required/);
  assert.match(server, /UNSUPPORTED_GPU/);
  assert.match(bundle, /aarch64-apple-darwin/);
  assert.match(bundle, /x86_64-pc-windows-msvc/);
  assert.match(bundle, /x86_64-unknown-linux-gnu/);
  assert.doesNotMatch(bundle, /x86_64-apple-darwin/);
});
