// Mandatory local material-bank client. It never replaces the camera image:
// authored geometry/PBR stay authoritative while six generated banks provide
// high-frequency material response to the native renderer. Boot waits only for
// the calm bank; the remaining banks stream during the opening and menu, with
// any bank requested by a scene promoted to the front of the queue. Once those
// authored anchors are resident, one visible material at a time may be
// re-hallucinated at a performance-gated cadence and crossfaded in world space.
import { profileBankRecipes } from '../render/look-profiles.js';
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
const CACHE_SCHEMA = 2;
const MODEL_ID = 'sd15-hyper4';
const MUTATION_OBSERVE_MS = 2_000;

export const NO_CHARACTERS = 'person, people, human, man, woman, child, figure, silhouette, face, portrait, eyes, creature, animal, monster, statue, mannequin, doll, crowd, neon, saturated, poster art, cartoon, bright, fog, mist, haze, smoke, steam, dust cloud, atmospheric veil, volumetric fog';

export const SURFACE_NAMES = Object.freeze([
  'reclaimed brick wall', 'split-face stone wall', 'ash wood floor', 'quartzite floor',
  'blue pool mosaic', 'white ceramic tile', 'polished terrazzo', 'travertine wall',
  'rammed-earth plaster wall', 'concrete wall cladding',
]);

export const SURFACE_PROMPT_DETAILS = Object.freeze([
  'uneven lime mortar, dark damp tide marks, isolated pale mineral blooms, displaced brick repairs',
  'deep mineral fissures, rust bleed at joints, broad lichen-like discoloration without vegetation',
  'raised grain, blackened board seams, worn varnish islands, long water stains across several planks',
  'layered mica fractures, pale calcite veins, broad abrasion trails, chipped aggregate repairs',
  'chlorine-bleached grout, cobalt crazing, missing tessera repairs, broad submerged mineral stains',
  'cracked glaze, grey grout bloom, rust trails from old fittings, mismatched rectangular patch repairs',
  'large aggregate ghosts, waxed wear lanes, branching hairline cracks, dark institutional repair plugs',
  'open pores, ochre water tracks, chipped corners, pale salt blooms spanning multiple blocks',
  'trowel arcs, damp blisters, hairline settlement cracks, broad rubbed and repainted patches',
  'formwork grain, cold joints, iron oxide runs, spalled corners and conspicuous cement repairs',
]);

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

async function surfacePayloads(url) {
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
      canvas.getContext('2d').drawImage(image, 0, slot * size, size, size, 0, 0, size, size);
      return canvasJpeg(canvas);
    }));
    return { atlasSha256, payloads };
  } finally {
    image.close?.();
  }
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
  applySurface,
  beginBank = () => {},
  commitSurfaces = () => {},
  profiles = profileBankRecipes(),
  onStatus = () => {},
}) {
  if (profiles.length !== 6) throw new Error('critical diffusion requires exactly six authored profiles');
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
  let atlasSha256 = null;
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

  const sourcePromise = surfacePayloads(sourceUrl).then((source) => {
    payloads = source.payloads;
    atlasSha256 = source.atlasSha256;
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
    for (const profile of profiles) {
      const recipe = profile.generation;
      const recipeSha256 = await sha256(new TextEncoder().encode(JSON.stringify({
        bankId: profile.bankId, ...recipe,
      })));
      for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
        queue.push({
          requestId: `${profile.bankId}:${slot}:${recipeSha256.slice(0, 12)}`,
          bankId: profile.bankId, slot, recipe, recipeSha256,
        });
      }
    }
  }

  function surfacePrompt(recipe, slot) {
    return `seamless tileable ${SURFACE_NAMES[slot]} material, ${SURFACE_PROMPT_DETAILS[slot]}, ${recipe.prompt}, conspicuous readable changes at arm's length, orthographic flat albedo texture, neutral exposure, diffuse even illumination, no cast shadows, no perspective`;
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
    stats.slot = work.slot; stats.bank = work.bankId;
    if (mutation) setMutationState('generating', { mutationSlot: work.slot, mutationBank: work.bankId });
    else setState('generating');
    socket.send(JSON.stringify({
      type: mutation ? 'mutate' : 'generate', requestId: work.requestId, bankId: work.bankId, slot: work.slot,
      modelId: MODEL_ID, checksumId: `sha256:${work.recipeSha256}`,
      sourceAtlasSha256: atlasSha256, recipeSha256: work.recipeSha256,
      prompt: surfacePrompt(recipe, work.slot), negative: recipe.negative,
      strength: recipe.strength, passes: recipe.passes, guidance: recipe.guidance,
      seedMode: 'fixed', seed: mutation ? recipe.seed : recipe.seedBase + work.slot * 977,
      size: 512, cacheSchema: CACHE_SCHEMA,
    }));
    sentAt = performance.now();
    socket.send(payload); stats.framesOut += 1;
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
    if (beginBank(bankId) === false) return false;
    for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
      const bitmap = await createImageBitmap(images[slot]);
      try {
        if (applySurface(slot, bitmap, profile.generation.mix) === false) return false;
      } finally {
        bitmap.close();
      }
    }
    if (!shouldCommit()) return false;
    return commitSurfaces(profile.generation.mix, { bankId, transitionMs }) !== false;
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
    const previous = bank[work.slot];
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
    bank[work.slot] = candidate;
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
    const previous = banks.get(bankId)?.[slot];
    const source = payloads[slot];
    if (!profile || !previous || !source) throw new Error('visible material is not resident');
    const serial = ++mutationSerial;
    const recipe = mutationGeneration(profile, slot, serial);
    const recipeSha256 = await sha256(new TextEncoder().encode(JSON.stringify({
      type: 'mutate', bankId, slot, serial, ...recipe,
    })));
    const payload = await anchoredMutationPayload(source, previous, recipe.feedback);
    if (stopped || fatal || epoch !== bankEpoch || stats.activeBank !== bankId || requestedBank != null) return false;
    if (active || queue.length || !socket || socket.readyState !== WebSocket.OPEN) return false;
    sendWork({
      type: 'mutate', requestId: `mutate:${bankId}:${slot}:${serial}:${recipeSha256.slice(0, 12)}`,
      bankId, slot, recipe, recipeSha256, transitionMs: timing.transitionMs,
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

  function connect() {
    if (stopped || fatal) return;
    const mine = ++sequence;
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
        await sendNext();
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
      bank[work.slot] = new Blob([bytes], { type: 'image/jpeg' }); banks.set(work.bankId, bank);
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
    setMoving() {}, nudge() {}, resetFeedback() {},
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
