import { assetUrl } from '../platform/paths.js';

// Existing recorded human effort, unpitched. Provenance lives beside the PCM.
export const PLAYER_CONDITION_EFFORT = Object.freeze({
  url: 'assets/audio/outskirts/fold-catch.wav',
  credits: 'assets/audio/outskirts/fold-credits.json',
  author: 'unfa',
  source: 'https://freesound.org/people/unfa/sounds/610991/',
  license: 'CC0-1.0',
  duration: .63,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const disconnect = node => { try { node?.disconnect(); } catch (_) {} };
const hurt = event => !!event && (event.damage > 0 || event.injuriesAdded > 0);

export function playerConditionEffortCalibration(buffer) {
  if (typeof buffer?.getChannelData !== 'function') return Object.freeze({
    measured:false, valid:true, samples:0, peak:null, rms:null, gain:1, normalizedPeak:null, normalizedRms:null});
  let peak = 0, squares = 0, samples = 0;
  const channels = Math.max(1, Math.floor(Number(buffer.numberOfChannels) || 1));
  for (let channel = 0; channel < channels; channel++) {
    const pcm = buffer.getChannelData(channel);
    for (const value of pcm) {
      if (!Number.isFinite(value)) return Object.freeze({
        measured:true, valid:false, samples, peak:null, rms:null, gain:1, normalizedPeak:null, normalizedRms:null});
      peak = Math.max(peak, Math.abs(value)); squares += value * value; samples++;
    }
  }
  const rms = samples ? Math.sqrt(squares / samples) : 0;
  const gain = peak > 0 && rms > 0 ? Math.min(6, .90 / peak, .14 / rms) : 1;
  return Object.freeze({measured:true, valid:true, samples, peak, rms, gain,
    normalizedPeak:peak * gain, normalizedRms:rms * gain});
}

export function playerConditionAudioPlan(frame = {}, { softened = false, volume = 1 } = {}) {
  const event = frame.event, allowed = hurt(event);
  const force = allowed ? clamp(frame.force ?? (event.injuriesAdded > 0 ? .85
    : .18 + .82 * Math.sqrt(clamp(event.damage / (frame.condition?.ceiling || 40), 0, 1))), 0, 1) : 0;
  return Object.freeze({allowed, force, rate:1, duration:.65,
    attack:.012, dipAt:.085, releaseAt:.18,
    worldFloor:1 - (softened ? .20 : .40) * force,
    voiceGain:(.24 + force * .28) * clamp(volume, 0, 1),
    lateAfter:.12});
}

export function playerConditionWorldGain(plan, elapsed) {
  if (!plan?.allowed || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= plan.duration) return 1;
  const start = plan.startGain ?? 1;
  if (elapsed < plan.dipAt) return start + (plan.worldFloor - start) * elapsed / plan.dipAt;
  if (elapsed <= plan.releaseAt) return plan.worldFloor;
  return plan.worldFloor + (1 - plan.worldFloor) * (elapsed - plan.releaseAt) / (plan.duration - plan.releaseAt);
}

async function loadEffort(ctx) {
  const response = await fetch(assetUrl(PLAYER_CONDITION_EFFORT.url));
  if (!response.ok) throw new Error(`Condition effort audio: ${response.status}`);
  return ctx.decodeAudioData(await response.arrayBuffer());
}

// This graph changes perception only. Direct threats and dialogue use other buses.
export function createPlayerConditionAudio({ getAudio = () => null, loadBuffer = loadEffort } = {}) {
  let graph = null, buffer = null, loading = null, generation = 0, disposed = false;
  let owner = null, serial = null, cue = null, voice = null;
  let eventsPlayed = 0, worldNarrowings = 0, loadError = null;
  let calibration = playerConditionEffortCalibration(null), lastVoiceGain = null;

  function stopVoice() {
    if (!voice) return;
    const previous = voice; voice = null;
    try { previous.source.stop(); } catch (_) {}
    disconnect(previous.source); disconnect(previous.gain);
  }
  function quiet() {
    stopVoice();
    if (graph && cue) {
      const at = graph.ctx.currentTime;
      const value = playerConditionWorldGain(cue.plan, at - cue.at);
      try {
        graph.input.gain.cancelScheduledValues(at);
        graph.input.gain.setValueAtTime(value, at);
        graph.input.gain.linearRampToValueAtTime(1, at + .02);
      } catch (_) { graph.input.gain.value = 1; }
    }
    cue = null;
  }
  function ensure() {
    if (disposed) return null;
    const pair = getAudio() || {}, ctx = pair.ctx;
    if (!ctx || !pair.bodyDestination || !pair.worldDestination) return null;
    if (graph && (graph.ctx !== ctx || graph.body !== pair.bodyDestination || graph.world !== pair.worldDestination)) {
      quiet(); disconnect(graph.input); graph = null; buffer = null; loading = null; generation++;
      calibration = playerConditionEffortCalibration(null); lastVoiceGain = null;
    }
    if (!graph) {
      const input = ctx.createGain(); input.gain.value = 1; input.connect(pair.worldDestination);
      graph = {ctx, input, body:pair.bodyDestination, world:pair.worldDestination};
    }
    return graph;
  }
  function prepare() {
    const active = ensure();
    if (!active || buffer) return Promise.resolve(!!buffer);
    if (loading) return loading;
    const epoch = generation, context = active.ctx;
    loading = Promise.resolve().then(() => loadBuffer(context)).then(value => {
      if (disposed || epoch !== generation || graph?.ctx !== context) return false;
      if (!value || !(value.duration > 0)) throw new Error('Condition effort PCM unavailable.');
      const measured = playerConditionEffortCalibration(value);
      if (!measured.valid) throw new Error('Condition effort PCM contains invalid samples.');
      calibration = measured;
      buffer = value; loadError = null; return true;
    }).catch(error => {
      if (epoch === generation) loadError = String(error?.message || error);
      return false;
    }).finally(() => { if (epoch === generation) loading = null; });
    return loading;
  }
  function play(active, plan) {
    const startGain = cue ? playerConditionWorldGain(cue.plan, active.ctx.currentTime - cue.at) : 1;
    quiet();
    const at = active.ctx.currentTime;
    cue = {at, plan:{...plan, startGain}};
    const gain = active.input.gain;
    gain.cancelScheduledValues(at); gain.setValueAtTime(startGain, at);
    gain.linearRampToValueAtTime(plan.worldFloor, at + plan.dipAt);
    gain.setValueAtTime(plan.worldFloor, at + plan.releaseAt);
    gain.linearRampToValueAtTime(1, at + plan.duration);
    worldNarrowings++;
    if (!buffer || plan.voiceGain <= 0) return;
    const source = active.ctx.createBufferSource(), amp = active.ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = plan.rate;
    const seconds = Math.min(PLAYER_CONDITION_EFFORT.duration, buffer.duration);
    const voiceGain = plan.voiceGain * calibration.gain; lastVoiceGain = voiceGain;
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(voiceGain, at + Math.min(plan.attack, seconds / 4));
    amp.gain.setValueAtTime(voiceGain, at + Math.max(plan.attack, seconds - .045));
    amp.gain.linearRampToValueAtTime(0, at + seconds);
    source.connect(amp); amp.connect(active.body);
    const record = {source, gain:amp}; voice = record;
    source.onended = () => {
      disconnect(source); disconnect(amp);
      if (voice === record) voice = null;
    };
    source.start(at, 0, seconds); source.stop(at + seconds + .005); eventsPlayed++;
  }
  function update(frame = {}, {active = true, suppressed = false, presented = true, softened = false, volume = 1} = {}) {
    const audio = ensure(), nextOwner = frame.condition?.owner ?? null;
    const nextSerial = frame.event?.serial ?? frame.serial ?? null;
    const first = owner === null, changedOwner = owner !== nextOwner;
    const fresh = nextSerial !== serial;
    owner = nextOwner; serial = nextSerial;
    const eligible = active && !suppressed && presented && frame.condition?.available === true
      && audio?.ctx.state === 'running';
    if (!eligible || first || changedOwner) { quiet(); return snapshot(); }
    if (cue && audio.ctx.currentTime - cue.at >= cue.plan.duration) cue = null;
    if (!fresh || !hurt(frame.event)) return snapshot();
    const age = Number(frame.impactAge ?? frame.eventAge ?? 0);
    const plan = playerConditionAudioPlan(frame, {softened, volume});
    if (!Number.isFinite(age) || age < 0 || age > plan.lateAfter) return snapshot();
    play(audio, plan);
    return snapshot();
  }
  function snapshot() {
    return Object.freeze({ready:!!buffer, graphReady:!!graph, preparing:!!loading, error:loadError,
      owner, serial, eventsPlayed, worldNarrowings, active:!!cue,
      worldGain:cue && graph ? playerConditionWorldGain(cue.plan, graph.ctx.currentTime - cue.at) : 1,
      calibration, lastVoiceGain,
      lastVoicePeak:calibration.measured && lastVoiceGain !== null ? calibration.peak * lastVoiceGain : null,
      lastVoiceRms:calibration.measured && lastVoiceGain !== null ? calibration.rms * lastVoiceGain : null,
      vocalSource:PLAYER_CONDITION_EFFORT.url});
  }
  return Object.freeze({prepare, update, snapshot,
    get worldInput() { return graph?.input || null; },
    dispose() { if (disposed) return; quiet(); disposed = true; generation++; disconnect(graph?.input);
      graph = null; buffer = null; loading = null; },
  });
}
