// Mandatory local material-bank client. It never replaces the camera image:
// authored geometry/PBR stay authoritative while six generated banks provide
// high-frequency material response to the native renderer. Boot waits only for
// the calm bank; the remaining banks stream during the opening and menu, with
// any bank requested by a scene promoted to the front of the queue. Once those
// authored anchors are resident, one visible material at a time may be
// re-hallucinated at a performance-gated cadence and crossfaded in world space.
import { runtimeParams } from '../platform/launch.js';
import { profileBankRecipes } from '../render/look-profiles.js';
import { assembleSurfacePrompt, estimateClipTokens, PROMPT_TOKEN_BUDGET } from './prompt-budget.js';
import {
  MUTATION_FEEDBACK,
  mutationCanStart,
  mutationCandidateIsSafe,
  mutationCandidateMetrics,
  mutationGeneration,
  mutationTiming,
} from './material-mutation.js';

const RETRIES = 20;
const RETRY_MS = 6000;
const CACHE_SCHEMA = 3;
const MODEL_ID = 'sd15-hyper4';
const MUTATION_OBSERVE_MS = 2_000;
const BURST_SIZE = 384;
const BURST_DEGRADED_SIZE = 320;

export // ── the second lens layer ───────────────────────────────────────────────────
// DeepDream, run in the sidecar on what the diffuser just produced (see
// diffusion_server/dream.py). Off unless asked for: with no `dream` key the
// server takes the path it always took.
//
// IT APPLIES TO THE BANKS THEMSELVES, not only to runtime mutations.
//
// Dreaming only mutations was the first attempt and it is invisible in practice:
// the walls a player actually looks at are the authored boot banks, and a
// mutation swaps one slot every few seconds behind a 48fps gate. You can stand
// in a room for a minute and see nothing.
//
// The reason it was restricted was real, though — boot banks are content
// addressed and cached to disk, so a dreamed bank written under a plain bank's
// key would be served back to a client that never asked for one. The fix is to
// put the settings IN the key (cache_contract.REQUEST_FIELDS), not to avoid the
// path: now a dream request simply misses cache and generates, and turning it
// off returns the ordinary banks untouched.
//
// THERE IS NO URL UNDER TAURI, which is why the query param alone was never
// going to work: the desktop shell loads the app without a search string, and
// runtimeParams() only sets renderer/lens defaults there for exactly that
// reason. So the setting is read from a query param OR from localStorage, and
// can be changed live from the console — which is the only control surface a
// packaged build has before this gets a real settings entry.
//
//   ?dream=0.45              gain only              (browser)
//   ?dream=0.45,faces,4,12   gain, layer, octaves, iterations
//   __diffusion.setDream('0.45,faces')              (anywhere, live)
//   __diffusion.setDream(null)                      off
//
// Layers, coarse to fine: edges · texture · objects · faces · deep.
const DREAM_STORAGE_KEY = 'chunk-surfer:dream';
let dreamState = () => null;
function currentDream() {
  if (DREAM_OVERRIDE) return DREAM_OVERRIDE;
  try { return dreamFromRun(dreamState()); } catch (_) { return null; }
}

function parseDream(raw) {
  if (!raw) return null;
  const [gain, layer, octaves, iterations] = String(raw).split(',');
  const g = Math.max(0, Math.min(1, Number(gain)));
  if (!(g > 0)) return null;
  return {
    gain: g,
    layer: layer || 'objects',
    octaves: Number.isFinite(Number(octaves)) ? Number(octaves) : 3,
    iterations: Number.isFinite(Number(iterations)) ? Number(iterations) : 10,
  };
}

// THE RUN DRIVES IT. A global knob meant 0/5 takes looked like 5/5 and a coffee
// run looked like a sober one, which is the opposite of what the feature is for:
// the building gets to you as you work it, and the drug is not cosmetic.
//
// 0/5 sends NO dream key at all rather than gain 0 — that keeps the cache key
// identical to an ordinary run, so a player who has recorded nothing reuses the
// plain cached banks instead of regenerating a whole set that renders the same.
const DREAM_BY_TAKES = [0.00, 0.12, 0.24, 0.40, 0.60, 0.85];
// One step deeper into the network when the coffee is in him. See DREAM_LAYERS
// in diffusion_server/dream.py: coarse to fine, objects -> faces is structure
// giving way to anatomy.
const DREAM_LAYER_LADDER = ['edges', 'texture', 'objects', 'faces', 'deep'];

function dreamFromRun(state) {
  const takes = Math.max(0, Math.min(5, Math.floor(Number(state?.takes) || 0)));
  const gain = DREAM_BY_TAKES[takes];
  if (!(gain > 0)) return null;
  const drugged = !!state?.drankCoffee;
  const layer = DREAM_LAYER_LADDER[Math.min(
    DREAM_LAYER_LADDER.length - 1,
    DREAM_LAYER_LADDER.indexOf('objects') + (drugged ? 1 : 0),
  )];
  return {
    gain: Math.min(1, gain * (drugged ? 1.6 : 1)),
    layer,
    octaves: 3,
    iterations: drugged ? 12 : 10,
  };
}

// The manual override, which wins when set. It is the only control surface a
// packaged Tauri build has, because there is no URL to put a query param on.
let DREAM_OVERRIDE = (() => {
  let raw = '';
  try { raw = runtimeParams().get('dream') || ''; } catch (_) { /* no url */ }
  if (!raw) { try { raw = globalThis.localStorage?.getItem(DREAM_STORAGE_KEY) || ''; } catch (_) {} }
  return parseDream(raw);
})();

const NO_CHARACTERS = 'person, face, figure, hands, creature, animal, text, watermark, cartoon, bright, fog, smoke';

export const SURFACE_NAMES = Object.freeze([
  'reclaimed brick wall', 'split-face stone wall', 'ash wood floor', 'quartzite floor',
  'blue pool mosaic', 'white ceramic tile', 'polished terrazzo', 'travertine wall',
  'rammed-earth plaster wall', 'concrete wall cladding',
]);

// Compressed to the two or three marks that identify each material. Every word
// here is competing with the profile's mood for the front of CLIP's window.
export const SURFACE_PROMPT_DETAILS = Object.freeze([
  'damp mortar, mineral bloom',
  'mineral fissures, rust at joints',
  'raised grain, black seams',
  'mica fractures, calcite veins',
  'bleached grout, cobalt crazing',
  'cracked glaze, rust trails',
  'aggregate ghosts, wear lanes',
  'open pores, ochre tracks',
  'trowel arcs, damp blisters',
  'formwork grain, iron stains',
]);

// A frame and the depth of THAT frame in one message, so newest-wins can never
// pair a frame with another frame's depth. Mirrors unpack() in server.py.
function packL2(frame, depth) {
  if (!depth) return frame;
  const frameBytes = new Uint8Array(frame);
  const depthBytes = new Uint8Array(depth);
  const out = new Uint8Array(6 + frameBytes.byteLength + depthBytes.byteLength);
  out[0] = 0x4c; out[1] = 0x32; // 'L2'
  new DataView(out.buffer).setUint32(2, frameBytes.byteLength, true);
  out.set(frameBytes, 6);
  out.set(depthBytes, 6 + frameBytes.byteLength);
  return out.buffer;
}

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('source material tile could not be encoded')); return; }
      resolve(await blob.arrayBuffer());
    }, 'image/jpeg', 0.90);
  });
}

async function imagePixels(blob, size = 64) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, size, size);
    return context.getImageData(0, 0, size, size).data;
  } finally {
    bitmap.close();
  }
}

async function mutationCandidateSafe(previous, candidate) {
  if (!previous) return false;
  const [before, after] = await Promise.all([imagePixels(previous), imagePixels(candidate)]);
  return mutationCandidateIsSafe(mutationCandidateMetrics(before, after, 64, 64));
}

async function anchoredMutationPayload(source, previous, feedback = MUTATION_FEEDBACK) {
  const [sourceBitmap, previousBitmap] = await Promise.all([
    createImageBitmap(new Blob([source], { type: 'image/jpeg' })),
    createImageBitmap(previous),
  ]);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = sourceBitmap.width; canvas.height = sourceBitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(sourceBitmap, 0, 0);
    // Keep enough of the preceding hallucination for motifs to breed across
    // generations. The untouched source remains underneath as a structural
    // anchor, so this is recursion rather than an accumulating full-frame wash.
    context.globalAlpha = Math.max(0, Math.min(0.55, Number(feedback) || 0));
    context.drawImage(previousBitmap, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    return canvasJpeg(canvas);
  } finally {
    sourceBitmap.close();
    previousBitmap.close();
  }
}

async function sliceAtlas(url, { grey = false } = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`source atlas unavailable (${response.status})`);
  const atlas = await response.arrayBuffer();
  const [atlasSha256, image] = await Promise.all([
    sha256(atlas),
    createImageBitmap(new Blob([atlas])),
  ]);
  try {
    const size = image.width;
    const layers = Math.min(SURFACE_NAMES.length, Math.floor(image.height / size));
    if (layers !== SURFACE_NAMES.length) {
      throw new Error(`source atlas has ${layers} material tiles; expected ${SURFACE_NAMES.length}`);
    }
    const payloads = await Promise.all(Array.from({ length: layers }, (_, slot) => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, slot * size, size, size, 0, 0, size, size);
      if (grey) {
        // A depth ControlNet trained on MiDaS wants the full range used. The
        // height atlas is a relief map in one channel; normalise it so the
        // CONTRAST is the signal, exactly as r3dDepthCanvas does for bursts.
        const pixels = context.getImageData(0, 0, size, size);
        const data = pixels.data;
        let lo = 255; let hi = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < lo) lo = data[i];
          if (data[i] > hi) hi = data[i];
        }
        const k = 255 / Math.max(1, hi - lo);
        for (let i = 0; i < data.length; i += 4) {
          const v = (data[i] - lo) * k;
          data[i] = data[i + 1] = data[i + 2] = v;
          data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
      }
      return canvasJpeg(canvas);
    }));
    return { atlasSha256, payloads };
  } finally {
    image.close?.();
  }
}

async function surfacePayloads(url, heightUrl) {
  const albedo = await sliceAtlas(url);
  // The authored relief of each material, handed to the depth ControlNet as its
  // control image. Without it the model invents geometry that the PBR pass then
  // contradicts; with it the hallucination is pinned to the surface it is on.
  let depths = [];
  let heightSha256 = null;
  if (heightUrl) {
    try {
      const height = await sliceAtlas(heightUrl, { grey: true });
      depths = height.payloads;
      heightSha256 = height.atlasSha256;
    } catch (_) {
      depths = [];
    }
  }
  return { atlasSha256: albedo.atlasSha256, payloads: albedo.payloads, depths, heightSha256 };
}

async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function completeBankCount(banks) {
  return [...banks.values()].filter((bank) => bank.filter(Boolean).length === SURFACE_NAMES.length).length;
}

export function surfaceDiffusionStart({
  url,
  token = null,
  restartService = null,
  sourceUrl,
  heightUrl = null,
  applySurface,
  beginBank = () => {},
  commitSurfaces = () => {},
  captureBurstFrame = null,
  applyBurst = null,
  profiles = profileBankRecipes(),
  onStatus = () => {},
  // Takes recorded and whether he drank the coffee. Supplied by the caller so
  // this module never reaches into game state itself.
  dreamState: dreamStateProvider = null,
}) {
  if (profiles.length !== 6) throw new Error('critical diffusion requires exactly six authored profiles');
  if (typeof dreamStateProvider === 'function') dreamState = dreamStateProvider;
  const criticalBank = profiles[0]?.bankId;
  if (!criticalBank) throw new Error('critical diffusion requires a boot material bank');
  const total = profiles.length * SURFACE_NAMES.length;
  const stats = {
    mode: 'surface-banks', state: 'connecting', framesOut: 0, framesIn: 0,
    lastRttMs: 0, resident: false, bank: null, slot: -1, total, completed: 0,
    banksReady: 0, activeBank: null, criticalBank, criticalTotal: SURFACE_NAMES.length,
    criticalCompleted: 0, criticalReady: false,
    mutationsGenerated: 0, mutationsAccepted: 0, mutationsRejected: 0,
    mutationState: 'waiting', mutationDisabled: null, nextMutationAt: null,
    // What the second lens layer is actually doing, so a quiet feature can be
    // diagnosed from window.__diffusion.stats instead of by staring at a wall.
    dream: null,   // filled per request; see currentDream()
  };
  const banks = new Map();
  let endpoint = url;
  let launchToken = token;
  let socket = null;
  let reconnectTimer = null;
  let stopped = false;
  let fatal = false;
  let sequence = 0;
  let retries = RETRIES;
  let active = null;
  let sentAt = 0;
  let pendingResult = null;
  let queue = [];
  let payloads = [];
  let depthPayloads = [];
  let atlasSha256 = null;
  let heightSha256 = null;
  // Dropped to 3 when the GPU refuses the full temporal set. Five frames of ten
  // surfaces is 133 MiB of texture array; a machine that cannot hold it should
  // boil more slowly rather than not start.
  let frameCeiling = 5;
  let readyResolve;
  let readyReject;
  let allReadyResolve;
  let allReadyReject;
  const bankWaiters = new Map();
  let rendererQueue = Promise.resolve();
  let bankEpoch = 0;
  let requestedBank = null;
  let mutationSerial = 0;
  let mutationCursor = 0;
  let mutationPreparing = false;
  let mutationPerformanceFault = false;
  let mutationObservationUntil = 0;
  let nextMutationAt = null;
  let streamTimer = null;
  let burstUntil = 0;
  let burstSerial = 0;
  let burstPending = null;
  let burstResolve = null;

  const sourcePromise = surfacePayloads(sourceUrl, heightUrl).then((source) => {
    payloads = source.payloads;
    depthPayloads = source.depths || [];
    atlasSha256 = source.atlasSha256;
    heightSha256 = source.heightSha256;
    return source;
  });

  function makeReadyPromises() {
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const allReady = new Promise((resolve, reject) => { allReadyResolve = resolve; allReadyReject = reject; });
    allReady.catch(() => {});
    return { ready, allReady };
  }
  let readyPromises = makeReadyPromises();

  function setState(state, extra = {}) {
    Object.assign(stats, extra, { state });
    onStatus({ ...stats });
  }

  function setMutationState(state, extra = {}) {
    Object.assign(stats, extra, { mutationState: state, nextMutationAt });
    onStatus({ ...stats });
  }

  function fail(error) {
    fatal = true;
    const message = error?.message || String(error || 'lens calibration failed');
    setState('error', { error: message });
    readyReject?.(new Error(message));
    allReadyReject?.(new Error(message));
    readyReject = null; allReadyReject = null;
    for (const waiters of bankWaiters.values()) {
      for (const waiter of waiters) waiter.reject(new Error(message));
    }
    bankWaiters.clear();
  }

  async function buildQueue() {
    queue = [];
    // Frame 0 of every bank first: that is the still image of the world, and
    // boot only waits for the critical bank's ten. The boil frames that follow
    // stream in behind the game and upgrade each surface in place.
    const later = [];
    for (const profile of profiles) {
      const recipe = profile.generation;
      const recipeSha256 = await sha256(new TextEncoder().encode(JSON.stringify({
        bankId: profile.bankId, ...recipe,
      })));
      const frames = bankFrames(profile);
      for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
        for (let frame = 0; frame < frames; frame += 1) {
          const work = {
            requestId: `${profile.bankId}:${slot}:${frame}:${recipeSha256.slice(0, 12)}`,
            bankId: profile.bankId, slot, frame, recipe, recipeSha256,
          };
          if (frame === 0) queue.push(work);
          else later.push(work);
        }
      }
    }
    queue = [...queue, ...later];
  }

  function bankFrames(profile) {
    return Math.max(1, Math.min(frameCeiling, Math.floor(Number(profile?.generation?.frames) || 1)));
  }

  function surfacePrompt(recipe, slot) {
    const prompt = assembleSurfacePrompt({
      name: `seamless ${SURFACE_NAMES[slot]}`,
      detail: SURFACE_PROMPT_DETAILS[slot],
      style: recipe.prompt,
    });
    if (import.meta.env?.DEV) {
      const tokens = estimateClipTokens(prompt);
      if (tokens > PROMPT_TOKEN_BUDGET) {
        console.warn(`lens prompt over budget (~${tokens} tokens, budget ${PROMPT_TOKEN_BUDGET}): ${prompt}`);
      }
    }
    return prompt;
  }

  // Each successive boil frame is pushed a little further from the authored
  // albedo, so the crossfade escalates instead of cycling through equals.
  function frameStrength(recipe, frame) {
    const ramp = Number(recipe.strengthRamp) || 0;
    return Math.max(0.1, Math.min(0.95, Number(recipe.strength) + ramp * frame));
  }

  function continueBankStream() {
    if (streamTimer != null) clearTimeout(streamTimer);
    // Once the currently displayed bank exists, leave a small render-frame
    // window between background generations. The mutation scheduler can then
    // interleave a visible tile instead of waiting for all sixty bank tiles.
    const activeBankReady = (banks.get(stats.activeBank) || []).filter(Boolean).length === SURFACE_NAMES.length;
    if (!activeBankReady) return sendNext().catch(fail);
    streamTimer = setTimeout(() => {
      streamTimer = null;
      sendNext().catch(fail);
    }, 120);
  }

  function sendWork(work, payload) {
    if (!payload) throw new Error(`source material ${work.slot + 1} is unavailable`);
    active = work; pendingResult = null;
    const recipe = work.recipe;
    const mutation = work.type === 'mutate';
    const frame = Math.max(0, Math.floor(Number(work.frame) || 0));
    const depth = depthPayloads[work.slot] || null;
    stats.slot = work.slot; stats.bank = work.bankId;
    if (mutation) setMutationState('generating', { mutationSlot: work.slot, mutationBank: work.bankId });
    else setState('generating');
    socket.send(JSON.stringify({
      type: mutation ? 'mutate' : 'generate', requestId: work.requestId, bankId: work.bankId, slot: work.slot,
      frame,
      modelId: MODEL_ID, checksumId: `sha256:${work.recipeSha256}`,
      sourceAtlasSha256: atlasSha256, recipeSha256: work.recipeSha256,
      prompt: surfacePrompt(recipe, work.slot), negative: recipe.negative,
      strength: mutation ? recipe.strength : frameStrength(recipe, frame),
      passes: recipe.passes, guidance: recipe.guidance,
      // A surface keeps its identity across frames and walks only along the
      // boil axis: same place, later in its decay.
      seedMode: 'fixed', seed: mutation ? recipe.seed : recipe.seedBase + work.slot * 977 + frame * 131,
      size: 512, cacheSchema: CACHE_SCHEMA,
      depthScale: depth ? 0.55 : undefined,
      depthSha256: depth ? heightSha256 : undefined,
      dream: currentDream() || undefined,
    }));
    sentAt = performance.now();
    socket.send(packL2(payload, depth)); stats.framesOut += 1;
  }

  async function sendNext() {
    if (stopped || fatal || active || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (!queue.length) {
      stats.slot = -1; stats.bank = null; stats.banksReady = completeBankCount(banks);
      stats.resident = stats.banksReady === profiles.length;
      if (!stats.resident) { fail('incomplete material bank set'); return; }
      stats.criticalReady = true; stats.criticalCompleted = SURFACE_NAMES.length;
      setState('ready');
      readyResolve?.(api); readyResolve = null;
      allReadyResolve?.(api); allReadyResolve = null;
      return;
    }
    const work = queue.shift();
    sendWork({ ...work, type: 'generate' }, payloads[work.slot]);
  }

  function resolveBank(bankId) {
    const waiters = bankWaiters.get(bankId) || [];
    bankWaiters.delete(bankId);
    for (const waiter of waiters) waiter.resolve();
  }

  function prioritizeBank(bankId) {
    const requested = queue.filter((item) => item.bankId === bankId);
    if (!requested.length) return;
    queue = [...requested, ...queue.filter((item) => item.bankId !== bankId)];
  }

  function waitForBank(bankId) {
    const bank = banks.get(bankId);
    if (bank?.filter(Boolean).length === SURFACE_NAMES.length) return Promise.resolve();
    if (fatal) return Promise.reject(new Error(stats.error || `material bank ${bankId} failed`));
    prioritizeBank(bankId);
    return new Promise((resolve, reject) => {
      const waiters = bankWaiters.get(bankId) || [];
      waiters.push({ resolve, reject });
      bankWaiters.set(bankId, waiters);
    });
  }

  async function uploadBank(bankId, transitionMs, shouldCommit = () => true) {
    const images = banks.get(bankId);
    const profile = profiles.find((entry) => entry.bankId === bankId);
    if (!images || images.filter(Boolean).length !== SURFACE_NAMES.length || !profile || !shouldCommit()) return false;
    const frames = bankFrames(profile);
    if (beginBank(bankId, frames) === false) return false;
    for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
      const stack = images[slot] || [];
      for (let frame = 0; frame < frames; frame += 1) {
        // A surface whose later boil frames have not landed yet holds still on
        // frame zero rather than popping between a full and an empty layer.
        const blob = stack[frame] || stack[0];
        if (!blob) return false;
        const bitmap = await createImageBitmap(blob);
        try {
          if (applySurface(slot, frame, bitmap, profile.generation.mix) === false) return false;
        } finally {
          bitmap.close();
        }
      }
    }
    if (!shouldCommit()) return false;
    return commitSurfaces(profile.generation.mix, { bankId, transitionMs, frames }) !== false;
  }

  function queueBankUpload(bankId, transitionMs, shouldCommit) {
    const job = rendererQueue.catch(() => {}).then(() => uploadBank(bankId, transitionMs, shouldCommit));
    rendererQueue = job.catch(() => {});
    return job;
  }

  function disableMutations(reason) {
    stats.mutationDisabled = reason || 'disabled';
    mutationObservationUntil = 0;
    nextMutationAt = null;
    setMutationState('disabled', { mutationDisabled: stats.mutationDisabled });
  }

  function mutationSoftFailure(reason, { disable = false } = {}) {
    active = null; pendingResult = null; mutationPreparing = false;
    mutationPerformanceFault = false;
    stats.mutationsRejected += 1;
    if (disable) disableMutations(reason);
    else {
      nextMutationAt = performance.now() + 12_000;
      setMutationState('rejected', { mutationLastReject: reason, nextMutationAt });
    }
  }

  function mutationCooldown(reason, delayMs = 12_000) {
    mutationObservationUntil = 0;
    mutationPerformanceFault = false;
    nextMutationAt = performance.now() + delayMs;
    setMutationState('cooldown', { mutationLastBackoff: reason, nextMutationAt });
  }

  async function handleMutationBytes(work, bytes) {
    const candidate = new Blob([bytes], { type: 'image/jpeg' });
    const bank = banks.get(work.bankId) || [];
    const stack = bank[work.slot] || [];
    const frame = Math.max(0, Math.floor(Number(work.frame) || 0));
    const previous = stack[frame];
    // A shared GPU can block rendering so completely that tickMutation cannot
    // observe the bad frame until inference has returned. Watch the first
    // frames after every result as well as the frames during generation.
    mutationObservationUntil = performance.now() + MUTATION_OBSERVE_MS;
    stats.framesIn += 1;
    stats.lastRttMs = performance.now() - sentAt;
    stats.mutationsGenerated += 1;
    if (!await mutationCandidateSafe(previous, candidate)) {
      mutationSoftFailure('visual-outlier');
      return;
    }
    stack[frame] = candidate;
    bank[work.slot] = stack;
    banks.set(work.bankId, bank);
    stats.mutationsAccepted += 1;
    const stillCurrent = () => work.bankEpoch === bankEpoch
      && stats.activeBank === work.bankId
      && requestedBank == null;
    let displayed = false;
    if (stillCurrent()) displayed = await queueBankUpload(work.bankId, work.transitionMs, stillCurrent);
    active = null; pendingResult = null;
    if (work.performanceFault) {
      // MPS inference and WebGL share the same GPU. A transient hitch while the
      // model runs is expected; keep the valid visual result and simply wait
      // longer before asking for another one.
      nextMutationAt = Math.max(nextMutationAt || 0, performance.now() + 12_000);
    }
    mutationPerformanceFault = false;
    setMutationState(displayed ? 'crossfading' : 'accepted', {
      mutationSlot: work.slot,
      mutationBank: work.bankId,
      mutationTransitionMs: work.transitionMs,
      mutationDisplayed: displayed,
      mutationPerformanceBackoff: !!work.performanceFault,
    });
    continueBankStream();
  }

  async function prepareMutation({ bankId, slot, epoch, timing }) {
    const profile = profiles.find((entry) => entry.bankId === bankId);
    const stack = banks.get(bankId)?.[slot];
    const source = payloads[slot];
    if (!profile || !stack?.length || !source) throw new Error('visible material is not resident');
    const serial = ++mutationSerial;
    // Mutations walk the boil frames in turn, so a surface drifts one temporal
    // step at a time instead of one frame lurching away from its neighbours.
    const frame = serial % bankFrames(profile);
    const previous = stack[frame] || stack[0];
    const recipe = mutationGeneration(profile, slot, serial);
    const recipeSha256 = await sha256(new TextEncoder().encode(JSON.stringify({
      type: 'mutate', bankId, slot, frame, serial, ...recipe,
    })));
    const payload = await anchoredMutationPayload(source, previous, recipe.feedback);
    if (stopped || fatal || epoch !== bankEpoch || stats.activeBank !== bankId || requestedBank != null) return false;
    if (active || queue.length || !socket || socket.readyState !== WebSocket.OPEN) return false;
    sendWork({
      type: 'mutate', requestId: `mutate:${bankId}:${slot}:${frame}:${serial}:${recipeSha256.slice(0, 12)}`,
      bankId, slot, frame, recipe, recipeSha256, transitionMs: timing.transitionMs,
      bankEpoch: epoch, performanceFault: mutationPerformanceFault,
    }, payload);
    return true;
  }

  function tickMutation({
    now = performance.now(), allowed = false, visibleSlots = [], performance: perf = {}, transitioning = false,
  } = {}) {
    const fps = Number(perf?.fps);
    const lastFrameMs = Number(perf?.lastFrameMs);
    const observingResult = now < mutationObservationUntil;
    const frameBudgetExceeded = lastFrameMs > 42 || (Number.isFinite(fps) && fps < 46);
    if ((active?.type === 'mutate' || mutationPreparing || observingResult) && frameBudgetExceeded) {
      mutationPerformanceFault = true;
      if (active?.type === 'mutate') active.performanceFault = true;
      if (observingResult && !active && !mutationPreparing) {
        mutationCooldown('frame-budget');
        return false;
      }
    }
    if (mutationObservationUntil && now >= mutationObservationUntil) mutationObservationUntil = 0;
    if (stats.mutationDisabled) return false;
    // A possession burst owns the GPU while it runs. Tiles wait their turn.
    if (burstUntil > now) { nextMutationAt = null; return false; }
    if (!allowed) {
      nextMutationAt = null;
      if (stats.mutationState !== 'paused') setMutationState('paused');
      return false;
    }
    const slots = [...new Set((Array.isArray(visibleSlots) ? visibleSlots : [])
      .map((slot) => Math.floor(Number(slot))).filter((slot) => slot >= 0 && slot < SURFACE_NAMES.length))];
    const activeBankReady = (banks.get(stats.activeBank) || []).filter(Boolean).length === SURFACE_NAMES.length;
    const canStart = mutationCanStart({
      allowed,
      resident: activeBankReady,
      activeBank: stats.activeBank,
      activeWork: !!active || mutationPreparing || requestedBank != null,
      transitioning,
      fps,
      samples: perf?.samples,
      visibleSlots: slots,
    });
    if (!canStart) {
      if (!active && !mutationPreparing && requestedBank == null && !transitioning && stats.mutationState !== 'waiting') setMutationState('waiting');
      return false;
    }
    const timing = mutationTiming({ fps, lastRttMs: stats.lastRttMs });
    if (nextMutationAt == null) {
      nextMutationAt = now + timing.intervalMs;
      setMutationState('scheduled', { nextMutationAt });
      return false;
    }
    if (now < nextMutationAt) return false;
    const slot = slots[mutationCursor % slots.length];
    mutationCursor += 1;
    nextMutationAt = now + timing.intervalMs;
    stats.nextMutationAt = nextMutationAt;
    mutationPreparing = true;
    mutationPerformanceFault = false;
    const bankId = stats.activeBank;
    const epoch = bankEpoch;
    setMutationState('preparing', { mutationSlot: slot, mutationBank: bankId, nextMutationAt });
    prepareMutation({ bankId, slot, epoch, timing })
      .then((started) => {
        if (!started && !stats.mutationDisabled) setMutationState('waiting');
      })
      .catch((error) => mutationSoftFailure(error?.message || 'mutation preparation failed', { disable: true }))
      .finally(() => { mutationPreparing = false; });
    return true;
  }

  // ── possession bursts ──────────────────────────────────────────────────────
  // The tiles are the world's material; this is the world itself, handed back
  // to the model with the exact depth the engine marched, for a few seconds at
  // a time. It runs at two or three frames a second and that is the point: the
  // room stops being rendered and starts being remembered by something else.
  async function runBurst(profileId, seconds) {
    const profile = profiles.find((entry) => entry.bankId === profileId) || profiles.find((entry) => entry.bankId === stats.activeBank);
    const recipe = profile?.generation?.burst;
    if (!recipe || !captureBurstFrame || !applyBurst || stopped || fatal) return false;
    if (burstUntil > performance.now()) { burstUntil = performance.now() + seconds * 1000; return true; }
    burstUntil = performance.now() + Math.max(0.5, seconds) * 1000;
    let size = BURST_SIZE;
    try {
      while (performance.now() < burstUntil && !stopped && !fatal) {
        if (active || socket?.readyState !== WebSocket.OPEN) { await new Promise((r) => setTimeout(r, 40)); continue; }
        const shot = await captureBurstFrame(size);
        if (!shot?.frame) break;
        const started = performance.now();
        const requestId = `burst:${profileId}:${++burstSerial}`;
        burstPending = { requestId };
        active = { type: 'frame', requestId, slot: -1, bankId: null };
        pendingResult = null;
        socket.send(JSON.stringify({
          type: 'frame', requestId, modelId: MODEL_ID,
          prompt: recipe.prompt, negative: recipe.negative,
          strength: recipe.strength, passes: 2, guidance: recipe.guidance,
          seedMode: 'walk', seed: (burstSerial * 7919) % 2_000_000_000,
          size, depthScale: recipe.depthScale ?? 0.6,
          dream: currentDream() || undefined,
        }));
        sentAt = performance.now();
        socket.send(packL2(shot.frame, shot.depth));
        stats.framesOut += 1;
        const bytes = await burstReply();
        if (!bytes) break;
        const rtt = performance.now() - started;
        stats.lastRttMs = rtt;
        // A round trip this slow means the repaint is a memory of a room the
        // player has already left. Shrink once; leave if it is still slow.
        if (rtt > 1500) {
          if (size === BURST_DEGRADED_SIZE) break;
          size = BURST_DEGRADED_SIZE;
        }
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        try { applyBurst(bitmap, { profileId, remainingMs: burstUntil - performance.now() }); }
        finally { bitmap.close(); }
      }
    } finally {
      burstUntil = 0; burstPending = null;
      if (active?.type === 'frame') { active = null; pendingResult = null; }
      applyBurst(null, { profileId, remainingMs: 0 });
      setState(stats.state === 'error' ? 'error' : 'ready');
      continueBankStream();
    }
    return true;
  }

  function burstReply() {
    return new Promise((resolve) => {
      burstResolve = resolve;
      setTimeout(() => { if (burstResolve === resolve) { burstResolve = null; resolve(null); } }, 4000);
    });
  }

  function connect() {
    if (stopped || fatal) return;
    const mine = ++sequence;
    let queueReady = false;
    let protocolReady = false;
    let initialSendStarted = false;
    const startQueueWhenReady = async () => {
      if (mine !== sequence || initialSendStarted || !queueReady || !protocolReady) return;
      initialSendStarted = true;
      await sendNext();
    };
    const socketUrl = new URL(endpoint);
    if (launchToken) socketUrl.searchParams.set('token', launchToken);
    socket = new WebSocket(socketUrl); socket.binaryType = 'arraybuffer';
    setState('connecting', { error: null });
    socket.onopen = async () => {
      if (mine !== sequence) return;
      try {
        await sourcePromise;
        await buildQueue();
        stats.completed = 0; stats.banksReady = 0; stats.resident = false;
        stats.criticalCompleted = 0; stats.criticalReady = false; banks.clear();
        queueReady = true;
        await startQueueWhenReady();
      } catch (error) { fail(error); }
    };
    socket.onmessage = async (event) => {
      if (mine !== sequence || stopped || fatal) return;
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'error' || message.error) {
            if (active?.type === 'mutate') mutationSoftFailure(message.error || message.code || 'mutation failed', { disable: true });
            else fail(message.error || message.code);
            return;
          }
          if (message.type === 'status') {
            stats.server = message;
            if (message.device === 'cpu' || message.supported === false) { fail('accelerated GPU required'); return; }
            if (!protocolReady) {
              if (Number(message.cacheSchema) !== CACHE_SCHEMA) {
                fail(`bundled lens cache schema mismatch (service ${message.cacheSchema ?? 'missing'}, game ${CACHE_SCHEMA})`);
                return;
              }
              if (message.modelId !== MODEL_ID) {
                fail(`bundled lens model mismatch (service ${message.modelId ?? 'missing'}, game ${MODEL_ID})`);
                return;
              }
              protocolReady = true;
              await startQueueWhenReady();
            }
          } else if (message.type === 'result' && (message.kind === 'frame' || active?.type === 'frame')) {
            if (burstPending && message.requestId === burstPending.requestId) pendingResult = message;
          } else if (message.type === 'result') {
            if (!active || message.requestId !== active.requestId || message.bankId !== active.bankId || message.slot !== active.slot || message.modelId !== MODEL_ID) {
              if (active?.type === 'mutate') mutationSoftFailure('identifier-mismatch', { disable: true });
              else fail('diffusion result identifiers do not match the active request');
              return;
            }
            pendingResult = message;
          } else if (message.type === 'progress') {
            if (active?.type === 'mutate') setMutationState(message.phase === 'model' ? 'loading-model' : 'generating', { serverProgress: message });
            else setState(message.phase === 'model' ? 'loading-model' : 'generating', { serverProgress: message });
          }
          onStatus({ ...stats, server: message });
        } catch (error) { fail(error); }
        return;
      }
      if (active?.type === 'frame') {
        // Burst frames are ephemeral and unverified by design: there is nothing
        // to cache and nothing to key them against but the request they answer.
        const bytes = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
        stats.framesIn += 1;
        active = null; pendingResult = null;
        const resolve = burstResolve; burstResolve = null;
        resolve?.(bytes);
        return;
      }
      if (!active || !pendingResult) { fail('material bytes arrived without result metadata'); return; }
      const work = active;
      const bytes = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
      const checksum = await sha256(bytes);
      if (pendingResult.sha256 !== checksum || pendingResult.checksumId !== `sha256:${checksum}`) {
        if (work.type === 'mutate') mutationSoftFailure('checksum-mismatch', { disable: true });
        else fail(`checksum mismatch for ${work.requestId}`);
        return;
      }
      if (work.type === 'mutate') {
        try { await handleMutationBytes(work, bytes); }
        catch (error) { mutationSoftFailure(error?.message || 'mutation admission failed', { disable: true }); }
        return;
      }
      const bank = banks.get(work.bankId) || [];
      const stack = bank[work.slot] || [];
      stack[Math.max(0, Math.floor(Number(work.frame) || 0))] = new Blob([bytes], { type: 'image/jpeg' });
      bank[work.slot] = stack; banks.set(work.bankId, bank);
      stats.framesIn += 1; stats.completed += 1; stats.lastRttMs = performance.now() - sentAt;
      stats.banksReady = completeBankCount(banks);
      stats.criticalCompleted = (banks.get(criticalBank) || []).filter(Boolean).length;
      if (bank.filter(Boolean).length === SURFACE_NAMES.length) {
        resolveBank(work.bankId);
        if (work.bankId === criticalBank && !stats.criticalReady) {
          stats.criticalReady = true;
          setState('ready');
          readyResolve?.(api); readyResolve = null;
        }
      }
      // A boil frame that lands for the bank already on screen is uploaded in
      // place: the surface starts moving without waiting for a bank change.
      if (work.frame > 0 && stats.activeBank === work.bankId && requestedBank == null) {
        const epoch = bankEpoch;
        queueBankUpload(work.bankId, 0, () => epoch === bankEpoch && stats.activeBank === work.bankId);
      }
      active = null; pendingResult = null;
      continueBankStream();
    };
    let gone = false;
    const onGone = () => {
      if (gone || mine !== sequence || stopped || fatal) return;
      gone = true; active = null;
      if (retries-- > 0) {
        setState('reconnecting');
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RETRY_MS);
      }
      else fail('critical diffusion service unavailable');
    };
    socket.onclose = onGone; socket.onerror = onGone;
  }

  async function activateBank(bankId, { transitionMs = 0, shouldCommit = () => true } = {}) {
    if (!profiles.some((entry) => entry.bankId === bankId)) return false;
    const epoch = ++bankEpoch;
    requestedBank = bankId;
    try {
      await waitForBank(bankId);
      const currentRequest = () => epoch === bankEpoch && shouldCommit();
      const committed = await queueBankUpload(bankId, transitionMs, currentRequest);
      if (!committed || !currentRequest()) return false;
      stats.activeBank = bankId;
      nextMutationAt = null;
      setMutationState('waiting', { mutationBank: bankId, nextMutationAt });
      return true;
    } finally {
      if (epoch === bankEpoch) requestedBank = null;
    }
  }

  async function retry() {
    fatal = false; sequence += 1;
    if (reconnectTimer != null) clearTimeout(reconnectTimer);
    if (streamTimer != null) clearTimeout(streamTimer);
    reconnectTimer = null;
    streamTimer = null;
    try { socket?.close(1000, 'calibration retry'); } catch (_) {}
    socket = null; active = null; pendingResult = null; retries = RETRIES;
    mutationPreparing = false; mutationPerformanceFault = false; mutationObservationUntil = 0;
    nextMutationAt = null; requestedBank = null; bankEpoch += 1;
    Object.assign(stats, { mutationDisabled: null, mutationState: 'waiting', nextMutationAt: null });
    readyPromises = makeReadyPromises();
    api.ready = readyPromises.ready; api.allReady = readyPromises.allReady;
    if (restartService) {
      const config = await restartService();
      if (!config?.url) throw new Error('diffusion service restart returned no endpoint');
      endpoint = config.url; launchToken = config.token || null;
    }
    connect(); return api.ready;
  }

  const api = {
    stats, ready: readyPromises.ready, allReady: readyPromises.allReady, banks, activateBank, tickMutation, retry,
    burst({ profileId = stats.activeBank, seconds = 3 } = {}) {
      return runBurst(profileId, seconds).catch(() => false);
    },
    bursting() { return burstUntil > performance.now(); },
    clampFrames(max) { frameCeiling = Math.max(1, Math.min(5, Math.floor(Number(max) || 5))); },
    setMoving() {}, nudge() {}, resetFeedback() {},
    // Live, because a packaged build has no URL and no settings entry yet. It
    // takes effect on the next request; call retry() to re-pull the banks.
    setDream(spec) {
      DREAM_OVERRIDE = typeof spec === 'string' || spec == null ? parseDream(spec) : spec;
      try {
        if (DREAM_OVERRIDE) globalThis.localStorage?.setItem(DREAM_STORAGE_KEY, `${DREAM_OVERRIDE.gain},${DREAM_OVERRIDE.layer},${DREAM_OVERRIDE.octaves},${DREAM_OVERRIDE.iterations}`);
        else globalThis.localStorage?.removeItem(DREAM_STORAGE_KEY);
      } catch (_) {}
      return this.dream();
    },
    // What the next request will actually carry, override or not. The honest
    // answer to "is this on", which stats alone could not give.
    dream() {
      const resolved = currentDream();
      stats.dream = resolved ? { ...resolved, source: DREAM_OVERRIDE ? 'override' : 'run' } : null;
      return stats.dream;
    },
    stop() {
      stopped = true; sequence += 1;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      if (streamTimer != null) clearTimeout(streamTimer);
      reconnectTimer = null;
      streamTimer = null;
      try { socket?.close(1000, 'app shutdown'); } catch (_) {}
    },
  };
  connect();
  return api;
}
