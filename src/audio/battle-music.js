import { assetUrl } from '../platform/paths.js';
import { authoredCue } from './authored-cues.js';

export const BATTLE_BPM = 168;
export const BATTLE_BEATS_PER_BAR = 4;
export const BATTLE_LOOP_BARS = 40;
export const BATTLE_BEAT_SECONDS = 60 / BATTLE_BPM;
export const BATTLE_BAR_SECONDS = BATTLE_BEAT_SECONDS * BATTLE_BEATS_PER_BAR;
export const BATTLE_LOOP_SECONDS = BATTLE_BAR_SECONDS * BATTLE_LOOP_BARS;
export const BATTLE_SOLO_BARS = 8;
export const BATTLE_MIN_REST_BARS = 4;
export const BATTLE_MAX_REST_BARS = 8;

const START_LOOKAHEAD_SECONDS = .06;
const SCHEDULE_LOOKAHEAD_SECONDS = .12;
const SESSION_GAIN = .74;
const DIALOGUE_GAIN = .42;
const LEAD_IDS = Object.freeze(['lead-1', 'lead-2', 'lead-3']);
const ENCOUNTER_ORDINALS = Object.freeze({ natatorium: 0, practice: 1, hall: 2, source: 3, chapel: 4 });

export const BATTLE_AUDIO = Object.freeze({
  bed: assetUrl('audio/game/battle/bed.mp3'),
  'lead-1': assetUrl('audio/game/battle/lead-1.mp3'),
  'lead-2': assetUrl('audio/game/battle/lead-2.mp3'),
  'lead-3': assetUrl('audio/game/battle/lead-3.mp3'),
  'entry-1-fill': assetUrl('audio/game/battle/entry-1-fill.mp3'),
  'entry-1-tail': assetUrl('audio/game/battle/entry-1-tail.mp3'),
  'entry-2-fill': assetUrl('audio/game/battle/entry-2-fill.mp3'),
  'entry-2-tail': assetUrl('audio/game/battle/entry-2-tail.mp3'),
  'entry-3-fill': assetUrl('audio/game/battle/entry-3-fill.mp3'),
  'entry-3-tail': assetUrl('audio/game/battle/entry-3-tail.mp3'),
});

const FALLBACK_GAIN = Object.freeze({
  bed: .72,
  'lead-1': 3,
  'lead-2': 2.35,
  'lead-3': .75,
  'entry-1-fill': .40,
  'entry-1-tail': 1.25,
  'entry-2-fill': 1.70,
  'entry-2-tail': 1.35,
  'entry-3-fill': 1.80,
  'entry-3-tail': 1.40,
});

let ctx = null;
let musicBus = null;
const buffers = new Map();
const pending = new Map();

export function battleMusicInit(context, destination) {
  if (ctx && ctx !== context) {
    buffers.clear();
    pending.clear();
  }
  ctx = context || null;
  musicBus = destination || context?.destination || null;
}

async function loadBuffer(id, fetchImpl = globalThis.fetch) {
  if (!ctx || !BATTLE_AUDIO[id]) return null;
  if (buffers.has(id)) return buffers.get(id);
  if (pending.has(id)) return pending.get(id);
  const job = Promise.resolve()
    .then(() => fetchImpl(BATTLE_AUDIO[id]))
    .then((response) => {
      if (!response?.ok) throw new Error(`${response?.status || 'fetch'} ${BATTLE_AUDIO[id]}`);
      return response.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(id, buffer);
      pending.delete(id);
      return buffer;
    })
    .catch((error) => {
      console.warn('battle music load failed', BATTLE_AUDIO[id], error);
      buffers.set(id, null);
      pending.delete(id);
      return null;
    });
  pending.set(id, job);
  return job;
}

export async function preloadBattleMusic({ fetchImpl = globalThis.fetch } = {}) {
  if (!ctx || typeof fetchImpl !== 'function') return new Map();
  await Promise.all(Object.keys(BATTLE_AUDIO).map((id) => loadBuffer(id, fetchImpl)));
  for (const id of ['bed', ...LEAD_IDS]) {
    const raw = buffers.get(id);
    const aligned = alignBattleBuffer(ctx, raw);
    if (aligned) buffers.set(id, aligned);
  }
  return buffers;
}

export function fnv1a(value = '') {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function encounterKey(combatId = '') {
  const id = String(combatId).toLowerCase();
  if (id.includes('natatorium')) return 'natatorium';
  if (id.includes('practice')) return 'practice';
  if (id.includes('hall')) return 'hall';
  if (id.includes('source')) return 'source';
  if (id.includes('chapel')) return 'chapel';
  return null;
}

export function battleEntryVariant(runId, combatId) {
  const key = encounterKey(combatId);
  const ordinal = key == null ? fnv1a(combatId) % 5 : ENCOUNTER_ORDINALS[key];
  return ((fnv1a(runId || 'legacy-run') + ordinal) % 3) + 1;
}

export function battleLoopFrameCount(sampleRate = 48000) {
  return Math.max(1, Math.round(Math.max(1, Number(sampleRate) || 48000) * BATTLE_LOOP_SECONDS));
}

export function alignBattleBuffer(context, source) {
  if (!context?.createBuffer || !source) return null;
  const channels = Math.max(1, Number(source.numberOfChannels) || 2);
  const length = battleLoopFrameCount(context.sampleRate || source.sampleRate);
  if (source.length === length && source.sampleRate === (context.sampleRate || source.sampleRate)) return source;
  const aligned = context.createBuffer(channels, length, context.sampleRate || source.sampleRate || 48000);
  for (let channel = 0; channel < channels; channel += 1) {
    const from = source.getChannelData?.(Math.min(channel, Math.max(0, (source.numberOfChannels || 1) - 1)));
    const to = aligned.getChannelData?.(channel);
    if (from && to) to.set(from.subarray(0, Math.min(from.length, to.length)));
  }
  return aligned;
}

export function nextBattleBarAt(time, downbeatAt) {
  const now = Number(time) || 0;
  const origin = Number(downbeatAt) || 0;
  if (now <= origin) return origin;
  const bars = Math.ceil(((now - origin) / BATTLE_BAR_SECONDS) - 1e-9);
  return origin + bars * BATTLE_BAR_SECONDS;
}

function cueLayerGain(cueId, layerId, fallback, { strict = false } = {}) {
  const layers = authoredCue(cueId)?.layers;
  // `strict` exists for the entry pairs. The loose fallback takes layers[0],
  // which for an entry cue is the FILL — so a tail whose layer id ever drifted
  // would silently be mixed at its fill's level. A missing tail gain falls back
  // to the tail's own default instead.
  const layer = layers?.find((entry) => entry.id === layerId) || (strict ? null : layers?.[0]);
  const gain = Number(layer?.gain);
  return Number.isFinite(gain) && gain >= 0 ? gain : fallback;
}

function gainFor(id) {
  if (id === 'bed') return cueLayerGain('battle.bed', 'battle.bed.layer', FALLBACK_GAIN[id]);
  if (id.startsWith('lead-')) return cueLayerGain(`battle.${id.replace('-', '.')}`, `battle.${id.replace('-', '.')}.layer`, FALLBACK_GAIN[id]);
  const match = /^entry-(\d)-(fill|tail)$/.exec(id);
  if (match) return cueLayerGain(`battle.entry.${match[1]}`, `battle.entry.${match[1]}.${match[2]}`, FALLBACK_GAIN[id], { strict: true });
  return FALLBACK_GAIN[id] ?? 1;
}

function paramValueAt(param, value, time) {
  param?.setValueAtTime?.(value, time);
  if (param && !param.setValueAtTime) param.value = value;
}

function rampParam(param, value, time) {
  param?.linearRampToValueAtTime?.(value, time);
  if (param && !param.linearRampToValueAtTime) param.value = value;
}

function cancelParam(param, time) {
  param?.cancelScheduledValues?.(time);
}

function bankBuffer(bank, id) {
  return bank?.get?.(id) || bank?.[id] || null;
}

function normalizedProfile(profile = {}) {
  const mode = profile.mode === 'movement' ? 'movement' : 'fixed';
  const requested = mode === 'movement' ? profile.movementLeads : [profile.lead];
  const valid = (requested || []).map(String).filter((id) => LEAD_IDS.includes(id));
  return mode === 'movement'
    ? { mode, movementLeads: valid.length ? valid : [...LEAD_IDS] }
    : { mode, lead: valid[0] || 'lead-1' };
}

export function createBattleMusicSession({
  combatId = '',
  runId = '',
  musicProfile = {},
  context = ctx,
  destination = musicBus,
  bufferBank = null,
} = {}) {
  const contextRef = context;
  const profile = normalizedProfile(musicProfile);
  const activeSources = new Set();
  const graphNodes = new Set();
  const leadHandles = new Map();
  let startPromise = null;
  let master = null;
  let bank = bufferBank;
  let status = contextRef && destination ? 'idle' : 'unavailable';
  let entryVariant = null;
  let downbeatAt = null;
  let targetLead = profile.mode === 'fixed' ? profile.lead : profile.movementLeads[0];
  let activeLead = null;
  let pendingLead = null;
  let pendingReason = null;
  let windowStartAt = null;
  let windowEndAt = null;
  let restUntil = null;
  let fallbackAt = null;
  let dialogueActive = false;
  let finishing = false;
  let stopped = false;

  function now() { return Number(contextRef?.currentTime) || 0; }
  function registerNode(node) { if (node) graphNodes.add(node); return node; }
  function disconnectGraph() {
    if (activeSources.size) return;
    for (const node of graphNodes) { try { node.disconnect?.(); } catch (_) {} }
    graphNodes.clear();
  }
  function registerSource(source) {
    if (!source) return source;
    activeSources.add(source);
    const previous = source.onended;
    source.onended = (...args) => {
      previous?.(...args);
      activeSources.delete(source);
      try { source.disconnect?.(); } catch (_) {}
      if (finishing || stopped) disconnectGraph();
    };
    return source;
  }
  function connectSource(id, buffer, when, { loop = false, gain = gainFor(id) } = {}) {
    if (!buffer || !master) return null;
    const source = registerSource(registerNode(contextRef.createBufferSource()));
    const layerGain = registerNode(contextRef.createGain());
    source.buffer = buffer;
    source.loop = loop;
    if (loop) {
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
    }
    paramValueAt(layerGain.gain, gain, when);
    source.connect(layerGain);
    layerGain.connect(master);
    source.start(when);
    return { source, gain: layerGain };
  }
  function availableLead(requested) {
    const start = Math.max(0, LEAD_IDS.indexOf(requested));
    for (let offset = 0; offset < LEAD_IDS.length; offset += 1) {
      const id = LEAD_IDS[(start + offset) % LEAD_IDS.length];
      if (bankBuffer(bank, id)) return id;
    }
    return null;
  }
  function chooseEntryPair() {
    const selected = battleEntryVariant(runId, combatId);
    for (let offset = 0; offset < 3; offset += 1) {
      const variant = ((selected - 1 + offset) % 3) + 1;
      if (bankBuffer(bank, `entry-${variant}-fill`) && bankBuffer(bank, `entry-${variant}-tail`)) return variant;
    }
    return null;
  }
  function masterTarget() { return dialogueActive ? DIALOGUE_GAIN : SESSION_GAIN; }
  function setDialogueActive(value) {
    dialogueActive = !!value;
    if (!master || finishing) return;
    const at = now();
    cancelParam(master.gain, at);
    paramValueAt(master.gain, master.gain.value, at);
    rampParam(master.gain, masterTarget(), at + (dialogueActive ? .18 : .36));
  }
  function ensureLead(id, when) {
    const selected = availableLead(id);
    if (!selected) return null;
    if (leadHandles.has(selected)) return { id: selected, ...leadHandles.get(selected) };
    const handle = connectSource(selected, bankBuffer(bank, selected), when, { loop: true, gain: 0 });
    if (!handle) return null;
    leadHandles.set(selected, handle);
    return { id: selected, ...handle };
  }
  function scheduleWindow(requested, when, reason) {
    if (finishing || stopped || downbeatAt == null) return false;
    const handle = ensureLead(requested, when);
    if (!handle) return false;
    const startAt = Math.max(when, restUntil || downbeatAt);
    const endAt = startAt + BATTLE_SOLO_BARS * BATTLE_BAR_SECONDS;
    const gain = gainFor(handle.id);
    for (const [id, entry] of leadHandles) {
      cancelParam(entry.gain.gain, startAt);
      paramValueAt(entry.gain.gain, 0, startAt);
      if (id === handle.id) {
        rampParam(entry.gain.gain, gain, startAt + BATTLE_BEAT_SECONDS);
        paramValueAt(entry.gain.gain, gain, endAt - BATTLE_BEAT_SECONDS);
        rampParam(entry.gain.gain, 0, endAt);
      }
    }
    activeLead = handle.id;
    windowStartAt = startAt;
    windowEndAt = endAt;
    restUntil = endAt + BATTLE_MIN_REST_BARS * BATTLE_BAR_SECONDS;
    fallbackAt = endAt + BATTLE_MAX_REST_BARS * BATTLE_BAR_SECONDS;
    pendingLead = null;
    pendingReason = reason || null;
    return true;
  }
  function requestSolo(requested = targetLead, reason = 'combat') {
    if (finishing || stopped || downbeatAt == null) return false;
    const selected = availableLead(requested) || availableLead(targetLead);
    if (!selected) return false;
    const at = now();
    if (activeLead && windowEndAt != null && at < windowEndAt) {
      pendingLead = selected;
      pendingReason = reason;
      return true;
    }
    if (restUntil != null && at < restUntil) {
      pendingLead = selected;
      pendingReason = reason;
      return true;
    }
    return scheduleWindow(selected, nextBattleBarAt(at + START_LOOKAHEAD_SECONDS, downbeatAt), reason);
  }
  function setMovement(index) {
    if (profile.mode !== 'movement') return targetLead;
    const requested = profile.movementLeads[Math.max(0, Number(index) || 0)] || profile.movementLeads.at(-1);
    targetLead = availableLead(requested) || availableLead(targetLead) || requested;
    return targetLead;
  }
  function onCombatEvent(event = {}) {
    const transitionTo = event.transition?.to;
    if (transitionTo != null && profile.mode === 'movement') {
      setMovement(transitionTo);
      requestSolo(targetLead, 'movement');
    }
    if (event.perfect) requestSolo(targetLead, 'perfect');
  }
  function update() {
    if (stopped || finishing || downbeatAt == null) return snapshot();
    const at = now();
    if (status === 'arrival' && at >= downbeatAt) status = 'running';
    if (activeLead && windowEndAt != null && at >= windowEndAt) activeLead = null;
    if (!activeLead && pendingLead && restUntil != null && at + SCHEDULE_LOOKAHEAD_SECONDS >= restUntil) {
      scheduleWindow(pendingLead, restUntil, pendingReason || 'queued');
    } else if (!activeLead && !pendingLead && fallbackAt != null && at + SCHEDULE_LOOKAHEAD_SECONDS >= fallbackAt) {
      scheduleWindow(targetLead, fallbackAt, 'fallback');
    }
    return snapshot();
  }
  async function start() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      if (!contextRef || !destination || stopped || finishing) return snapshot();
      status = 'loading';
      if (!bank) {
        if (contextRef === ctx) bank = await preloadBattleMusic();
        else bank = new Map();
      }
      if (stopped || finishing) return snapshot();
      const rawBed = bankBuffer(bank, 'bed');
      if (!rawBed) { status = 'unavailable'; return snapshot(); }
      const performanceIds = ['bed', ...LEAD_IDS];
      for (const id of performanceIds) {
        const raw = bankBuffer(bank, id);
        if (!raw) continue;
        const aligned = alignBattleBuffer(contextRef, raw);
        if (aligned) {
          if (bank?.set) bank.set(id, aligned);
          else bank[id] = aligned;
        }
      }
      master = registerNode(contextRef.createGain());
      paramValueAt(master.gain, masterTarget(), now());
      master.connect(destination);
      entryVariant = chooseEntryPair();
      // A fill and its tail are ONE hit, split either side of beat one, and they
      // are always the same variant — never a fill from one take with the ring-out
      // of another.
      const fill = entryVariant ? bankBuffer(bank, `entry-${entryVariant}-fill`) : null;
      const tail = entryVariant ? bankBuffer(bank, `entry-${entryVariant}-tail`) : null;
      // The fill is a PICKUP: it leads INTO the downbeat, so it has to end there.
      // It used to define the downbeat instead — `fillAt + fill.duration` — and the
      // three fills are .44, .66 and .44 of a bar long, so the bed's first beat
      // landed at a different off-grid moment for every variant and the tail then
      // rang out from that same wrong place. The grid comes first now; the fill is
      // scheduled backwards from it.
      const readyAt = now() + START_LOOKAHEAD_SECONDS;
      const fillSeconds = fill?.duration || 0;
      const countInBars = fillSeconds ? Math.max(1, Math.ceil(fillSeconds / BATTLE_BAR_SECONDS)) : 0;
      downbeatAt = readyAt + countInBars * BATTLE_BAR_SECONDS;
      const fillAt = downbeatAt - fillSeconds;
      if (fill) connectSource(`entry-${entryVariant}-fill`, fill, fillAt);
      connectSource('bed', bankBuffer(bank, 'bed'), downbeatAt, { loop: true });
      if (tail) connectSource(`entry-${entryVariant}-tail`, tail, downbeatAt);
      fallbackAt = downbeatAt + BATTLE_MAX_REST_BARS * BATTLE_BAR_SECONDS;
      status = 'arrival';
      return snapshot();
    })();
    return startPromise;
  }
  function stopWithFade(seconds) {
    if (stopped || finishing) return;
    finishing = true;
    status = 'fading';
    const at = now();
    const endAt = at + Math.max(.02, Number(seconds) || .02);
    if (master) {
      cancelParam(master.gain, at);
      paramValueAt(master.gain, master.gain.value, at);
      rampParam(master.gain, 0, endAt);
    }
    for (const source of activeSources) { try { source.stop(endAt + .02); } catch (_) {} }
    stopped = true;
  }
  function finish() { stopWithFade(BATTLE_BAR_SECONDS); }
  function abort() { stopWithFade(.1); }
  function snapshot() {
    const at = now();
    const gridBar = downbeatAt == null || at < downbeatAt ? 0 : Math.floor((at - downbeatAt) / BATTLE_BAR_SECONDS) + 1;
    const phase = status === 'arrival' ? 'arrival'
      : status === 'fading' ? 'fading'
        : activeLead && windowStartAt != null && at >= windowStartAt && at < windowEndAt ? 'solo'
          : restUntil != null && at < restUntil ? 'rest' : status;
    return {
      status,
      phase,
      combatId,
      entryVariant,
      downbeatAt,
      gridBar,
      targetLead,
      activeLead,
      pendingLead,
      pendingReason,
      windowStartAt,
      windowEndAt,
      restUntil,
      fallbackAt,
      dialogueActive,
      sourceCount: activeSources.size,
    };
  }
  return { start, update, onCombatEvent, setDialogueActive, finish, abort, snapshot };
}
