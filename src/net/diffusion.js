// Mandatory local material-bank client. It never replaces the camera image:
// authored geometry/PBR stay authoritative while six generated banks provide
// high-frequency material response to the native renderer. Boot waits only for
// the calm bank; the remaining banks stream during the opening and menu, with
// any bank requested by a scene promoted to the front of the queue.
import { profileBankRecipes } from '../render/look-profiles.js';

const RETRIES = 20;
const RETRY_MS = 6000;
const CACHE_SCHEMA = 2;
const MODEL_ID = 'sd15-hyper4';

export const NO_CHARACTERS = 'person, people, human, man, woman, child, figure, silhouette, face, portrait, eyes, creature, animal, monster, statue, mannequin, doll, crowd, neon, saturated, poster art, cartoon, bright, fog, mist, haze, smoke, steam, dust cloud, atmospheric veil, volumetric fog';

export const SURFACE_NAMES = Object.freeze([
  'reclaimed brick wall', 'split-face stone wall', 'ash wood floor', 'quartzite floor',
  'blue pool mosaic', 'white ceramic tile', 'polished terrazzo', 'travertine wall',
  'rammed-earth plaster wall', 'concrete wall cladding',
]);

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('source material tile could not be encoded')); return; }
      resolve(await blob.arrayBuffer());
    }, 'image/jpeg', 0.90);
  });
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
    return `seamless tileable ${SURFACE_NAMES[slot]} material, ${recipe.prompt}, orthographic flat albedo texture, fine physical detail, even illumination, no perspective`;
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
    active = queue.shift(); pendingResult = null;
    stats.slot = active.slot; stats.bank = active.bankId; setState('generating');
    const recipe = active.recipe;
    socket.send(JSON.stringify({
      type: 'generate', requestId: active.requestId, bankId: active.bankId, slot: active.slot,
      modelId: MODEL_ID, checksumId: `sha256:${active.recipeSha256}`,
      sourceAtlasSha256: atlasSha256, recipeSha256: active.recipeSha256,
      prompt: surfacePrompt(recipe, active.slot), negative: recipe.negative,
      strength: recipe.strength, passes: recipe.passes, guidance: recipe.guidance,
      seedMode: 'fixed', seed: recipe.seedBase + active.slot * 977,
      size: 512, cacheSchema: CACHE_SCHEMA,
    }));
    sentAt = performance.now();
    const payload = payloads[active.slot];
    if (!payload) throw new Error(`source material ${active.slot + 1} is unavailable`);
    socket.send(payload); stats.framesOut += 1;
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
          if (message.type === 'error' || message.error) { fail(message.error || message.code); return; }
          if (message.type === 'status') {
            stats.server = message;
            if (message.device === 'cpu' || message.supported === false) { fail('accelerated GPU required'); return; }
          } else if (message.type === 'result') {
            if (!active || message.requestId !== active.requestId || message.bankId !== active.bankId || message.slot !== active.slot || message.modelId !== MODEL_ID) {
              fail('diffusion result identifiers do not match the active request'); return;
            }
            pendingResult = message;
          } else if (message.type === 'progress') {
            setState(message.phase === 'model' ? 'loading-model' : 'generating', { serverProgress: message });
          }
          onStatus({ ...stats, server: message });
        } catch (error) { fail(error); }
        return;
      }
      if (!active || !pendingResult) { fail('material bytes arrived without result metadata'); return; }
      const bytes = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
      const checksum = await sha256(bytes);
      if (pendingResult.sha256 !== checksum || pendingResult.checksumId !== `sha256:${checksum}`) {
        fail(`checksum mismatch for ${active.requestId}`); return;
      }
      const bank = banks.get(active.bankId) || [];
      bank[active.slot] = new Blob([bytes], { type: 'image/jpeg' }); banks.set(active.bankId, bank);
      stats.framesIn += 1; stats.completed += 1; stats.lastRttMs = performance.now() - sentAt;
      stats.banksReady = completeBankCount(banks);
      stats.criticalCompleted = (banks.get(criticalBank) || []).filter(Boolean).length;
      if (bank.filter(Boolean).length === SURFACE_NAMES.length) {
        resolveBank(active.bankId);
        if (active.bankId === criticalBank && !stats.criticalReady) {
          stats.criticalReady = true;
          setState('ready');
          readyResolve?.(api); readyResolve = null;
        }
      }
      active = null; pendingResult = null;
      sendNext().catch(fail);
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
    await waitForBank(bankId);
    const images = banks.get(bankId);
    const profile = profiles.find((entry) => entry.bankId === bankId);
    if (!images || images.filter(Boolean).length !== SURFACE_NAMES.length || !profile) return false;
    if (beginBank(bankId) === false) return false;
    for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
      const bitmap = await createImageBitmap(images[slot]);
      const ok = applySurface(slot, bitmap, profile.generation.mix) !== false;
      bitmap.close();
      if (!ok) return false;
    }
    if (!shouldCommit()) return false;
    if (commitSurfaces(profile.generation.mix, { bankId, transitionMs }) === false) return false;
    stats.activeBank = bankId; onStatus({ ...stats }); return true;
  }

  async function retry() {
    fatal = false; sequence += 1;
    if (reconnectTimer != null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { socket?.close(1000, 'calibration retry'); } catch (_) {}
    socket = null; active = null; pendingResult = null; retries = RETRIES;
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
    stats, ready: readyPromises.ready, allReady: readyPromises.allReady, banks, activateBank, retry,
    setMoving() {}, nudge() {}, resetFeedback() {},
    stop() {
      stopped = true; sequence += 1;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      try { socket?.close(1000, 'app shutdown'); } catch (_) {}
    },
  };
  connect();
  return api;
}
