import { assetUrl } from '../platform/paths.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const amplitude = db => 10 ** ((Number(db) || 0) / 20);
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const DEFAULT_BYTES = 48 * 1024 * 1024;
const hash = value => {
  let result = 2166136261;
  for (const ch of String(value)) result = Math.imul(result ^ ch.charCodeAt(0), 16777619) >>> 0;
  return result || 1;
};

/**
 * Complete, independently edited contacts. This owns audible presentation only:
 * it never emits AI noise, recording spoil, inventory or HUSH transactions.
 * Every source enters the supplied world-SFX bus, including finite wet stems.
 * Preparing a buffer is never permission to replay the contact which requested it.
 */
export function createFootstepAudio({
  getAudio = () => null,
  fetcher = (...args) => fetch(...args),
  urlFor = assetUrl,
  manifest: suppliedManifest = null,
  manifestUrl = 'audio/footsteps/manifest.json',
  maxVoices = 32,
  maxDecodedBytes = DEFAULT_BYTES,
  maxConcurrentLoads = 4,
  random = Math.random,
} = {}) {
  const voiceLimit = Math.max(2, Math.floor(maxVoices));
  const byteLimit = Math.max(1, maxDecodedBytes);
  const loadLimit = Math.max(1, Math.min(8, maxConcurrentLoads));
  let ctx = null, destination = null, generation = 0, disposed = false, paused = false;
  let manifest = suppliedManifest, manifestPending = null, manifestRetryAt = 0;
  let decodedBytes = 0, stamp = 0, voiceId = 0, loading = 0;
  const cache = new Map(), pending = new Map(), queue = [], bags = new Map();
  const voices = new Map(), retiring = new Set(), owners = new Map();
  const lastPlants = new Map();
  const responseClocks = new Map();
  const errors = [], events = [];
  const stats = { playedDry: 0, playedResponses: 0, missedContacts: 0, suppressedContacts: 0, suppressedResponses: 0, evictedClips: 0 };
  const log = event => { events.push(event); if (events.length > 80) events.shift(); };
  const fail = error => { errors.push(String(error?.message || error)); if (errors.length > 8) errors.shift(); };

  function cleanup(voice) {
    if (voice.cleaned) return;
    voice.cleaned = true;
    voices.delete(voice.id); retiring.delete(voice);
    voice.entry.pins = Math.max(0, voice.entry.pins - 1);
    voice.source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) { /* already ended */ } }
  }
  function release(voice, immediate = false) {
    if (voice.cleaned) return;
    const now = ctx?.currentTime || 0;
    voices.delete(voice.id);
    if (!immediate) {
      try {
        voice.env.gain.cancelScheduledValues(now);
        voice.env.gain.setValueAtTime(voice.env.gain.value, now);
        voice.env.gain.linearRampToValueAtTime(0, now + .025);
        voice.source.stop(now + .03);
        voice.releaseAt = now + .035;
        retiring.add(voice);
        // Allocation pressure cannot accumulate arbitrarily many fade-outs.
        if (retiring.size > 8) cleanup(retiring.values().next().value);
        return;
      } catch (_) { /* context may have closed */ }
    }
    try { voice.source.stop(now); } catch (_) { /* already stopped */ }
    cleanup(voice);
  }
  function prune() {
    const now = ctx?.currentTime || 0;
    for (const voice of voices.values()) if (voice.endAt <= now) cleanup(voice);
    for (const voice of retiring) if (voice.releaseAt <= now) cleanup(voice);
  }
  function clear(owner) {
    for (const voice of [...voices.values(), ...retiring]) {
      if (owner == null || voice.owner === owner) release(voice, true);
    }
    if (owner == null) { owners.clear(); bags.clear(); }
    else owners.delete(owner);
    // A cancelled future source has no heard attack to reserve. A past attack
    // still owns its short spacing interval across a surface/tail clear.
    const now = ctx?.currentTime || 0;
    for (const [id, timing] of responseClocks) if (owner == null || id === owner) {
      if (timing.onsetAt > now) timing.onsetAt = null;
      if (timing.attackAt > now) timing.attackAt = null;
      timing.lag = 0; timing.wander = 0; timing.profile = null; timing.contactAt = null;
    }
  }
  function audio() {
    if (disposed) return false;
    const next = getAudio() || {};
    const nextCtx = next.ctx || next.context;
    const nextDestination = next.destination || next.bus;
    if (!nextCtx || !nextDestination || nextCtx.state === 'closed') return false;
    if (nextCtx !== ctx || nextDestination !== destination) {
      clear(); generation++;
      lastPlants.clear();
      responseClocks.clear();
      cache.clear(); decodedBytes = 0;
      ctx = nextCtx; destination = nextDestination;
    }
    prune();
    return true;
  }
  async function loadManifest() {
    if (manifest) return manifest;
    if (manifestPending) return manifestPending;
    if (Date.now() < manifestRetryAt || disposed) return null;
    manifestPending = (async () => {
      try {
        const response = await fetcher(urlFor(manifestUrl));
        if (!response.ok) throw new Error(`footstep manifest: ${response.status}`);
        const data = await response.json();
        if (data.version !== 1 || !data.clips || !data.banks) throw new Error('unsupported footstep manifest');
        manifest = data;
        return data;
      } catch (error) { fail(error); manifestRetryAt = Date.now() + 2000; return null; }
      finally { manifestPending = null; }
    })();
    return manifestPending;
  }
  function makeRoom(bytes) {
    if (bytes > byteLimit) return false;
    while (decodedBytes + bytes > byteLimit) {
      let candidate;
      for (const item of cache.values()) if (!item.pins && (!candidate || item.used < candidate.used)) candidate = item;
      if (!candidate) return false;
      cache.delete(candidate.id); decodedBytes -= candidate.bytes; stats.evictedClips++;
    }
    return true;
  }
  function pump() {
    while (!disposed && loading < loadLimit && queue.length) {
      const job = queue.shift();
      if (job.generation !== generation) { job.resolve(null); pending.delete(job.key); continue; }
      loading++;
      (async () => {
        let entry = null;
        try {
          const clip = manifest.clips[job.id];
          const response = await fetcher(urlFor(clip.url));
          if (!response.ok) throw new Error(`footstep ${job.id}: ${response.status}`);
          const data = await response.arrayBuffer();
          if (disposed || job.generation !== generation) return;
          const buffer = await job.context.decodeAudioData(data);
          if (disposed || job.generation !== generation) return;
          const bytes = buffer.length * buffer.numberOfChannels * 4;
          if (!Number.isFinite(bytes) || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error(`invalid footstep ${job.id}`);
          if (makeRoom(bytes)) {
            entry = { id: job.id, buffer, bytes, pins: 0, used: ++stamp };
            cache.set(job.id, entry); decodedBytes += bytes;
          }
        } catch (error) { fail(error); }
        finally {
          loading--; pending.delete(job.key); job.resolve(entry); pump();
        }
      })();
    }
  }
  function load(id) {
    if (!manifest?.clips[id] || !ctx || disposed) return Promise.resolve(null);
    const found = cache.get(id);
    if (found) { found.used = ++stamp; return Promise.resolve(found); }
    const key = `${generation}:${id}`;
    if (pending.has(key)) return pending.get(key);
    // A contact/preload cannot leave an unbounded download backlog.
    if (queue.length >= 64) return Promise.resolve(null);
    const promise = new Promise(resolve => queue.push({ id, key, generation, context: ctx, resolve }));
    pending.set(key, promise); pump();
    return promise;
  }
  function profileKey(input) {
    if (input.profile === 'compiled') return `compiled-${['field', 'path', 'fault'].includes(input.tone) ? input.tone : 'field'}`;
    return ['glazed', 'erased', 'compiled-field', 'compiled-path', 'compiled-fault'].includes(input.profile) ? input.profile : null;
  }
  function selection(input) {
    const surface = typeof input.surface === 'string' ? input.surface : 'concrete';
    const bankKey = manifest.banks[surface] ? surface : 'concrete';
    const bank = manifest.banks[bankKey] || manifest.banks.tile;
    const careful = input.careful || ['careful', 'slow'].includes(input.condition);
    const gait = careful && bank.slow?.length ? 'slow' : 'walk';
    return { bank, bankKey, gait, ids: list(bank[gait] || bank.walk), profile: profileKey(input) };
  }
  function responseFor(profile, dryId, plantIndex, previous) {
    const choices = list(manifest.responses?.[profile]?.[dryId]);
    if (!choices.length) return { responseId: null, noteIndex: null };
    if (profile?.startsWith('compiled-')) {
      // One note belongs to each footfall. Draw with replacement from the
      // related microtonal pool; unlike a shuffle bag, 1-3-1-4-2-4 is possible.
      // Exclude only an adjacent repeat, without imposing a cycle or melody.
      const last = previous?.profile === profile ? previous.noteIndex : null;
      const exclude = Number.isInteger(last) && last >= 0 && last < choices.length && choices.length > 1;
      let noteIndex = Math.floor(clamp(random(), 0, .999999) * (choices.length - (exclude ? 1 : 0)));
      if (exclude && noteIndex >= last) noteIndex++;
      return { responseId: choices[noteIndex], noteIndex };
    }
    return { responseId: choices[Math.abs(plantIndex) % choices.length], noteIndex: null };
  }
  async function preload(input = {}) {
    if (!audio()) return false;
    const data = await loadManifest();
    if (!data || disposed) return false;
    const { bank, ids, profile } = selection(input);
    // Warm whole contacts first. Every entry is bounded by the same LRU; no
    // extra permanent decoded copy is kept in a scene or room owner.
    const dry = [...new Set([...ids, ...list(bank.scuff), ...list(bank.layer)])];
    await Promise.all(dry.map(load));
    const responses = [...new Set(ids.flatMap(id => list(data.responses?.[profile]?.[id])))];
    await Promise.all(responses.map(load));
    return ids.some(id => cache.has(id));
  }
  function take(key, ids) {
    if (!ids.length) return null;
    let bag = bags.get(key);
    if (!bag || !bag.remaining.length || bag.signature !== ids.join('|')) {
      const remaining = [...ids];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(clamp(random(), 0, .999999) * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining[0] === bag?.last) [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
      bag = { remaining, last: bag?.last, signature: ids.join('|') }; bags.set(key, bag);
      // NPC/echo ownership is finite even in a long session.
      if (bags.size > 96) bags.delete(bags.keys().next().value);
    }
    const id = bag.remaining.shift(); bag.last = id;
    return id;
  }
  function play(id, input, kind, gain, delay = 0, settle = false) {
    const entry = cache.get(id);
    if (!entry || paused || !ctx || ctx.state === 'closed') { if (id) void load(id); return null; }
    const categoryLimit = kind === 'response' ? 8 : kind === 'layer' ? 8 : 16;
    const category = [...voices.values()].filter(voice => voice.kind === kind);
    if (category.length >= categoryLimit) release(category[0]);
    while (voices.size >= voiceLimit) release(voices.values().next().value);
    const start = ctx.currentTime + delay;
    const duration = kind === 'response' ? Math.min(entry.buffer.duration, manifest.maxResponseSeconds || 6.25) : entry.buffer.duration;
    const source = ctx.createBufferSource(), env = ctx.createGain(), nodes = [source, env];
    source.buffer = entry.buffer;
    source.playbackRate.setValueAtTime(1, start);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + Math.min(.003, duration / 4));
    env.gain.setValueAtTime(gain, start + Math.max(.003, duration - .025));
    env.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(env); let output = env;
    if (input.releaseGesture) {
      // The weak-leg release is friction under the existing plant, not a
      // second low-frequency sole impact beside the next footfall.
      const friction = ctx.createBiquadFilter(); friction.type = 'highpass';
      friction.frequency.setValueAtTime(750, start); friction.Q.setValueAtTime(.5, start);
      output.connect(friction); output = friction; nodes.push(friction);
    }
    // Filtering only changes surface response, never playback rate or gait.
    const dull = clamp(input.muffle, 0, 1);
    if (dull > .001 && kind !== 'response') {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(6500 - dull * 5500, start); filter.Q.setValueAtTime(.5, start);
      output.connect(filter); output = filter; nodes.push(filter);
    }
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      const pan = Number.isFinite(input.pan) ? clamp(input.pan, -1, 1) : input.footSide === 'right' ? .065 : -.065;
      panner.pan.setValueAtTime(pan, start); output.connect(panner); output = panner; nodes.push(panner);
    }
    output.connect(destination);
    const voice = { id: ++voiceId, owner: input.owner, kind, settle, source, env, nodes, entry, endAt: start + duration + .015 };
    entry.pins++; entry.used = ++stamp;
    source.onended = () => cleanup(voice);
    try { source.start(start); source.stop(voice.endAt); }
    catch (error) { cleanup(voice); fail(error); return null; }
    voices.set(voice.id, voice);
    return voice;
  }
  function cancelResidue(owner) {
    let cancelled = false;
    for (const voice of voices.values()) if (voice.owner === owner && voice.settle) { release(voice); cancelled = true; }
    const timing = responseClocks.get(owner);
    if (cancelled && timing?.settle) {
      if (timing.onsetAt > ctx.currentTime + .03) timing.onsetAt = null;
      if (timing.attackAt > ctx.currentTime + .03) timing.attackAt = null;
    }
  }
  function responseLag(input, profile, interval, scheduledAt) {
    let state = responseClocks.get(input.owner);
    if (!state) {
      state = { lag: 0, wander: 0, seed: 1, profile: null, contactAt: null,
        contactInterval: interval, responseInterval: interval, onsetAt: null, attackAt: null };
      responseClocks.set(input.owner, state);
      if (responseClocks.size > 96) responseClocks.delete(responseClocks.keys().next().value);
    }
    const idle = state.contactAt == null || scheduledAt - state.contactAt > Math.max(1.5, state.contactInterval * 3);
    if (idle) { state.lag = 0; state.wander = 0; }
    if (idle || state.profile !== profile) state.seed = hash(`${input.owner}\0${profile || 'physical'}`);
    // The lag has its own contact-driven deterministic drift. It neither
    // consumes the note/shuffle RNG nor runs a timer while the body is still.
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    const requested = profile ? clamp(input.responseLagSeconds, 0, .095) : 0;
    const wanderRange = profile ? clamp(input.responseLagWanderSeconds, 0, .025) : 0;
    const active = !!profile && (requested > 0 || wanderRange > 0 || state.lag > 1e-7);
    if (!requested && !wanderRange) state.wander = 0;
    else state.wander = state.wander * .82 + (state.seed / 4294967296 * 2 - 1) * wanderRange * .18;
    const cap = profile ? Math.min(.095, .4 * Math.min(interval, state.contactInterval || interval)) : 0;
    const previousLag = state.lag;
    const target = clamp(requested + state.wander, 0, cap);
    // Decreasing delay must not repay itself as a short pair of notes. Even
    // disabling the treatment releases its phase gradually over real contacts.
    const maximumSlewLag = Math.min(cap, previousLag + .012);
    const minimumSlewLag = Math.min(cap, Math.max(0, previousLag - .012));
    const lag = clamp(target, minimumSlewLag, maximumSlewLag);
    state.lag = lag; state.profile = profile; state.contactAt = scheduledAt; state.contactInterval = interval;
    return { state, lag, cap, maximumSlewLag, requested, wander: state.wander, active };
  }
  function responseTiming(id, descriptor, profile, interval, scheduledAt, plan, { settle = false } = {}) {
    const clip = manifest.clips[id];
    if (!clip) return { responseSuppressedReason: 'unavailable' };
    const onset = Math.max(0, Number(clip.onsetSeconds ?? clip.primaryContactSeconds) || 0);
    // A diffuse bloom's full-file maximum is not another footstep. Prefer its
    // measured early response attack, rather than reserving the entire wet tail.
    const attack = Math.max(onset, Number(clip.responseAttackSeconds ?? clip.peakAttackSeconds ?? onset) || onset);
    const state = plan.state;
    const nominalSpacing = Math.max(.14, .72 * Math.min(interval, state.responseInterval || interval));
    const anchorSpacing = (offset, previousOffset) => {
      if (!Number.isFinite(state.responsePlantAt) || !Number.isFinite(previousOffset)) return nominalSpacing;
      const baselineGap = scheduledAt + offset - state.responsePlantAt - previousOffset;
      // Diffuse returns have authored attack offsets of their own. Keep that
      // identity rather than turning Surface Lag into an answer-density change.
      // Added phase may shorten the corresponding baseline gap by at most12ms;
      // an already unsafe sub140ms/reversed attack still gets no new voice.
      return Math.max(.14, Math.min(nominalSpacing, baselineGap - .012));
    };
    const onsetSpacing = anchorSpacing(onset, state.onsetOffset);
    const attackSpacing = anchorSpacing(attack, state.attackOffset);
    let required = 0;
    if (plan.active && !settle && Number.isFinite(state.onsetAt)) required = Math.max(required, state.onsetAt + onsetSpacing - scheduledAt - onset);
    if (plan.active && !settle && Number.isFinite(state.attackAt)) required = Math.max(required, state.attackAt + attackSpacing - scheduledAt - attack);
    const lag = Math.max(plan.lag, required);
    const fields = { responseLagRequestedSeconds: plan.requested,
      responseLagAppliedSeconds: null, responseLagCandidateSeconds: lag, responseLagWanderAppliedSeconds: plan.wander,
      responseScheduledAt: null, responseOnsetAt: null, responseAttackAt: null,
      responseMinimumOnsetSpacingSeconds: onsetSpacing, responseMinimumAttackSpacingSeconds: attackSpacing };
    // Rare adversarial re-entry/attack changes can leave no safe timing slot.
    // Omit that wet answer instead of delaying it into a later plant or playing
    // a compressed pair. The dependable dry plant is already owned separately.
    if (lag > plan.cap + 1e-7 || lag > plan.maximumSlewLag + 1e-7) {
      stats.suppressedResponses++;
      return { ...fields, responseSuppressedReason: 'response-spacing' };
    }
    const responseScheduledAt = scheduledAt + lag;
    const responseOnsetAt = responseScheduledAt + onset, responseAttackAt = responseScheduledAt + attack;
    const voice = play(id, descriptor, 'response', descriptor.responseGain,
      Math.max(0, responseScheduledAt - ctx.currentTime), settle);
    if (!voice) return { ...fields, responseSuppressedReason: 'unavailable' };
    stats.playedResponses++;
    state.lag = lag; state.onsetAt = responseOnsetAt; state.attackAt = responseAttackAt;
    state.responsePlantAt = scheduledAt; state.onsetOffset = onset; state.attackOffset = attack;
    state.responseInterval = interval; state.settle = settle;
    return { ...fields, responseLagAppliedSeconds: lag, responseScheduledAt, responseOnsetAt, responseAttackAt, responseSuppressedReason: null };
  }
  function contact(input = {}) {
    const owner = input.owner || input.scene || 'player';
    const missed = why => { stats.missedContacts++; return { played: false, reason: why }; };
    if (!audio() || paused || ctx.state === 'suspended' || Number(input.level ?? .22) <= .001) return missed('inactive');
    if (!manifest) { void preload(input); return missed('preparing'); }
    const { bank, bankKey, gait, ids, profile } = selection(input);
    const prior = owners.get(owner);
    const previousPlant = lastPlants.get(owner) || prior;
    const interval = Number.isFinite(input.interval) && input.interval > 0 ? input.interval : previousPlant?.interval || .35;
    // A small common lookahead recovers sub-frame contact timing. Nothing is
    // backdated, and loading still never queues a spent action for playback.
    const delay = Number.isFinite(input.latenessSeconds) ? Math.max(0, .035 - input.latenessSeconds) : 0;
    const scheduledAt = ctx.currentTime + delay;
    const minimumSpacing = Math.max(.14, Math.min(.45, .72 * Math.min(interval, previousPlant?.interval || interval)));
    if (previousPlant && scheduledAt - previousPlant.scheduledAt < minimumSpacing - .000001) {
      stats.suppressedContacts++;
      log({ owner, kind: 'suppressed', reason: 'contact-spacing', time: ctx.currentTime, scheduledAt });
      return { played: false, reason: 'contact-spacing', scheduledAt };
    }
    cancelResidue(owner);
    if (prior && prior.profile !== profile) {
      for (const voice of voices.values()) if (voice.owner === owner && voice.kind === 'response') release(voice);
      const oldResponse = responseClocks.get(owner);
      if (oldResponse?.onsetAt > ctx.currentTime + .03) oldResponse.onsetAt = null;
      if (oldResponse?.attackAt > ctx.currentTime + .03) oldResponse.attackAt = null;
    }
    const plantIndex = Number.isFinite(input.plantIndex) ? Math.trunc(input.plantIndex) : (prior?.plantIndex ?? -1) + 1;
    const descriptor = { ...input, owner, plantIndex, footSide: input.footSide || (plantIndex % 2 ? 'right' : 'left'),
      muffle: input.muffle ?? (profile === 'erased' ? .72 : 0) };
    const id = take(`${owner}:${bankKey}:${gait}`, ids);
    if (!id || !cache.has(id)) { void preload(input); return missed('preparing'); }
    const gain = Math.min(.85, clamp(input.level ?? .22, 0, 2) * 1.4)
      * amplitude(gait === 'slow' && bank.slowUsesWalk ? bank.slowGainDb : 0);
    if (!play(id, descriptor, 'dry', gain, delay)) return missed('unavailable');
    stats.playedDry++;
    const layer = take(`${owner}:${bankKey}:layer`, list(bank.layer));
    if (layer) play(layer, descriptor, 'layer', gain * amplitude(bank.layerGainDb), delay);
    const { responseId, noteIndex } = responseFor(profile, id, plantIndex, prior);
    const lagPlan = responseLag(descriptor, profile, interval, scheduledAt);
    let wetTiming = { responseScheduledAt: null, responseOnsetAt: null, responseAttackAt: null,
      responseLagRequestedSeconds: lagPlan.requested, responseLagAppliedSeconds: null, responseLagCandidateSeconds: lagPlan.lag,
      responseLagWanderAppliedSeconds: lagPlan.wander, responseSuppressedReason: null };
    if (responseId && profile !== 'erased' && manifest.profileParameters?.[profile]?.playOn !== 'settle') {
      wetTiming = responseTiming(responseId, { ...descriptor, responseGain: gain * amplitude(manifest.profileGainDb?.[profile]) },
        profile, interval, scheduledAt, lagPlan);
    }
    // A real recorded shoe scuff is an occasional weak-leg release, never a
    // second step/noise receipt. AudioContext scheduling makes it cancellable.
    const injury = clamp(input.injury, 0, 1), weakFoot = input.weakFoot || 'left';
    if (injury > .05 && descriptor.footSide === weakFoot && plantIndex % 4 === (weakFoot === 'right' ? 1 : 0) && bank.scuff?.length) {
      const scuff = take(`${owner}:${bankKey}:scuff`, bank.scuff);
      play(scuff, { ...descriptor, releaseGesture: true }, 'layer', gain * injury * .20, delay + .025);
    }
    const onsetAt = scheduledAt + (Number(manifest.clips[id].primaryContactSeconds ?? manifest.clips[id].onsetSeconds) || 0);
    owners.set(owner, { descriptor, profile, dryId: id, responseId, noteIndex, gain, plantIndex, interval, scheduledAt, onsetAt, lagPlan,
      lastAt: scheduledAt, stoppedAt: null, settled: false });
    // Changing a surface/clearing tails must not erase an already heard plant.
    // Real pause/context replacement explicitly starts a fresh audio timeline.
    lastPlants.set(owner, { interval, scheduledAt });
    if (lastPlants.size > 96) lastPlants.delete(lastPlants.keys().next().value);
    if (owners.size > 64) { const first = owners.keys().next().value; clear(first); }
    log({ owner, kind: 'plant', surface: input.surface || bankKey, profile: profile || 'physical', dryId: id, responseId,
      noteIndex, plantIndex, time: ctx.currentTime, scheduledAt, onsetAt, interval, ...wetTiming });
    return { played: true, dryId: id, responseId, noteIndex, plantIndex, scheduledAt, onsetAt, interval, ...wetTiming };
  }
  function update({ moving, paused: hold, owner } = {}) {
    if (!audio()) { clear(); return; }
    if (hold === true) { paused = true; clear(); lastPlants.clear(); responseClocks.clear(); return; }
    if (hold === false) paused = false;
    if (paused) return;
    for (const [id, state] of owners) {
      if (owner != null && owner !== id) continue;
      if (moving === true) { state.stoppedAt = null; cancelResidue(id); continue; }
      if (moving !== false || state.settled) continue;
      state.stoppedAt ??= ctx.currentTime;
      if (ctx.currentTime - state.stoppedAt < .12) continue;
      state.settled = true;
      // Stillness is a single last-contact answer. It has no autonomous pulse,
      // dry plant or gameplay noise and is cancelled as soon as walking resumes.
      const residueGain = state.profile === 'erased' ? 1 : 0;
      if (residueGain && state.responseId) {
        const wetTiming = responseTiming(state.responseId, { ...state.descriptor, responseGain: state.gain * residueGain
          * amplitude(manifest.profileGainDb?.[state.profile]) }, state.profile, state.interval, ctx.currentTime,
          state.lagPlan, { settle: true });
        log({ owner: id, kind: 'settle', profile: state.profile, responseId: state.responseId, time: ctx.currentTime, ...wetTiming });
      }
    }
  }
  function destroy() {
    clear(); disposed = true; generation++;
    cache.clear(); decodedBytes = 0; bags.clear(); lastPlants.clear(); responseClocks.clear();
    for (const job of queue.splice(0)) { pending.delete(job.key); job.resolve(null); }
  }
  function snapshot() {
    prune();
    return { ...stats, voices: voices.size, fadingVoices: retiring.size, decodedBytes, decodedClips: cache.size,
      pendingLoads: pending.size, owners: [...owners.keys()], paused, ready: !!manifest,
      responseTiming: [...responseClocks].map(([owner, timing]) => ({ owner, lagSeconds: timing.lag,
        wanderSeconds: timing.wander, responseOnsetAt: timing.onsetAt, responseAttackAt: timing.attackAt })),
      errors: [...errors], events: events.map(event => ({ ...event })) };
  }
  return Object.freeze({ preload, contact, update, clear, destroy, snapshot });
}
