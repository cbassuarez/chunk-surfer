import { renderSamSamples } from './sam-voice.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, finite(value)));
const lineKey = line => `${line?.voice || 'tower ghost'}\n${String(line?.text || '').trim()}`;

export const TOWER_WARNING_ENVELOPE_WINDOW_SECONDS = .024;

// Read the actual selected voice PCM at its retained transport offset. There
// is no analyser on another bus, invented syllable clock or render-time sine.
// heldValue is the same frozen PCM sample for a paused body's pose; active
// value remains zero when that source is not actually running.
export function towerWarningPcmEnvelope(pcm, offset = 0, { active = false, lineId = null } = {}) {
  const available = !!pcm?.samples?.length && Number.isFinite(pcm.sampleRate) && pcm.sampleRate > 0;
  const duration = available ? pcm.samples.length / pcm.sampleRate : 0;
  const seconds = clamp(offset, 0, duration), end = available ? Math.min(pcm.samples.length, Math.floor(seconds * pcm.sampleRate)) : 0;
  const start = available ? Math.max(0, end - Math.ceil(pcm.sampleRate * TOWER_WARNING_ENVELOPE_WINDOW_SECONDS)) : 0;
  let power = 0, peak = 0;
  for (let i = start; i < end; i++) {
    const sample = finite(pcm.samples[i]); power += sample * sample; peak = Math.max(peak, Math.abs(sample));
  }
  const rms = end > start ? Math.sqrt(power / (end - start)) : 0;
  const heldValue = clamp(rms * 4, 0, 1), running = available && active === true && seconds < duration;
  return { available, active: running, source: 'pcm', lineId, offset: seconds,
    windowSeconds: TOWER_WARNING_ENVELOPE_WINDOW_SECONDS,
    rms: running ? rms : 0, peak: running ? peak : 0, value: running ? heldValue : 0,
    heldValue, sampledRms: rms, sampledPeak: peak };
}

// One physical speaker in the street. Speech is PCM routed through the existing
// SFX destination, without the dialog scene, subtitle band, recorder or input
// ownership. The world runtime alone selects the current line.
export function createTowerWarningAudio({ getAudio = () => null, renderVoice = renderSamSamples, onError = () => {} } = {}) {
  const rendered = new Map(), pending = new Map();
  let destroyed = false, generation = 0, current = null, voice = null;
  let control = { line: null, listener: {}, source: {}, paused: true, enabled: false };

  function report(error) { try { onError(error); } catch {} }
  function load(line) {
    const key = lineKey(line);
    if (rendered.has(key)) return Promise.resolve(rendered.get(key));
    if (pending.has(key)) return pending.get(key);
    const owner = generation;
    const request = Promise.resolve().then(() => destroyed || owner !== generation ? null : renderVoice(String(line?.text || ''), { speaker: line?.voice || 'tower ghost' })).then(result => {
      if (destroyed || owner !== generation) return null;
      if (!result?.samples?.length || !Number.isFinite(result.sampleRate) || result.sampleRate <= 0) throw new Error('Tower warning voice returned no usable PCM');
      const samples = Float32Array.from(result.samples, value => clamp(value, -1, 1));
      const pcm = { samples, sampleRate: result.sampleRate, duration: samples.length / result.sampleRate, provider: result.provider || 'sam' };
      rendered.set(key, pcm);
      return pcm;
    }).catch(error => {
      if (!destroyed && owner === generation) report(error);
      return { error: String(error?.message || error) };
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
  }

  function cursor() {
    if (!current) return 0;
    return Math.min(current.pcm?.duration ?? Infinity, current.offset + (voice ? Math.max(0, finite(voice.ctx.currentTime) - voice.startedAt) * voice.rate : 0));
  }
  function stopVoice() {
    if (!voice) return;
    const old = voice;
    if (current) current.offset = cursor();
    voice = null;
    old.source.onended = null;
    try { old.source.stop(); } catch {}
    for (const node of old.nodes) { try { node.disconnect(); } catch {} }
  }
  function selected(line) {
    const key = lineKey(line), id = line?.id == null ? null : String(line.id);
    if (current?.id === id && current?.key === key) return;
    stopVoice();
    if (!line || id == null || !String(line.text || '').trim()) { current = null; return; }
    const target = current = { id, key, line: { ...line }, pcm: rendered.get(key) || null, offset: 0, done: false, error: null };
    if (target.pcm) return;
    load(line).then(pcm => {
      if (destroyed || current !== target) return;
      if (pcm?.error) target.error = pcm.error;
      else target.pcm = pcm;
      // Preparing samples never owns playback. A subsequent world update must
      // still affirm foreground, audible ownership and the same current line.
    });
  }
  function spatialise(record) {
    const listener = control.listener || {}, position = control.source || {};
    const dx = finite(position.x) - finite(listener.x), dy = finite(position.y) - finite(listener.y), dz = finite(position.z) - finite(listener.z);
    const yaw = finite(listener.yaw), pitch = finite(listener.pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const xyz = [dx * cy + dz * sy, -dx * sy * sp + dy * cp + dz * cy * sp, -dx * sy * cp - dy * sp + dz * cy * cp];
    const distance = Math.hypot(dx, dy, dz), now = record.ctx.currentTime;
    record.position = { x: finite(position.x), y: finite(position.y), z: finite(position.z) };
    record.relativeXYZ = xyz;
    record.distance = distance;
    const set = (parameter, value) => {
      if (!parameter) return;
      if (parameter.setTargetAtTime) parameter.setTargetAtTime(value, now, .025);
      else parameter.value = value;
    };
    if (record.spatialisation === 'HRTF') {
      if (record.panner.positionX) xyz.forEach((value, index) => set([record.panner.positionX, record.panner.positionY, record.panner.positionZ][index], value));
      else record.panner.setPosition?.(...xyz);
    } else set(record.panner?.pan, clamp(xyz[0] / Math.max(1, distance), -1, 1));
    // Nearby speech stays legible while walking around its owner. It recedes
    // naturally with the figure; the panner handles direction, not gain twice.
    set(record.distanceGain.gain, 1 / (1 + Math.max(0, distance - 1.5) * .16));
  }
  function audioRoute() {
    const route = getAudio() || {};
    const ctx = route.context || route.ctx || route.actx;
    const destination = route.destination || route.sfxGain || route.outGain;
    return ctx?.createBuffer && ctx?.createBufferSource && ctx?.createGain && destination && (!ctx.state || ctx.state === 'running') ? { ctx, destination } : null;
  }
  function start(route) {
    const target = current, pcm = target.pcm, ctx = route.ctx;
    if (target.offset >= pcm.duration) { target.done = true; return; }
    const owned = [], own = node => { if (node) owned.push(node); return node; };
    try {
      const source = own(ctx.createBufferSource()), gain = own(ctx.createGain()), distanceGain = own(ctx.createGain());
      const panner = own(ctx.createPanner?.() || ctx.createStereoPanner?.() || null);
      const buffer = ctx.createBuffer(1, pcm.samples.length, pcm.sampleRate);
      buffer.getChannelData(0).set(pcm.samples);
      source.buffer = buffer;
      const rate = clamp(target.line.rate ?? .92, .5, 1.5);
      source.playbackRate.value = rate;
      const level = clamp(target.line.gain ?? .20, 0, .35);
      if (gain.gain.setValueAtTime && gain.gain.linearRampToValueAtTime) {
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(level, ctx.currentTime + .012);
      } else gain.gain.value = level;
      source.connect(gain); gain.connect(distanceGain);
      if (panner) { distanceGain.connect(panner); panner.connect(route.destination); }
      else distanceGain.connect(route.destination);
      const record = voice = { ctx, destination: route.destination, source, gain, distanceGain, panner, nodes: owned, rate, startedAt: ctx.currentTime,
        spatialisation: panner && 'panningModel' in panner ? 'HRTF' : panner?.positionX || panner?.setPosition ? 'HRTF' : panner ? 'stereo' : 'mono' };
      if (record.spatialisation === 'HRTF') {
        panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0; panner.maxDistance = 10000;
        panner.coneInnerAngle = 360; panner.coneOuterAngle = 360; panner.coneOuterGain = 1;
      }
      spatialise(record);
      source.onended = () => {
        if (destroyed || voice !== record || current !== target) return;
        voice = null;
        target.offset = pcm.duration;
        target.done = true;
        for (const node of record.nodes) { try { node.disconnect(); } catch {} }
      };
      source.start(ctx.currentTime, target.offset);
    } catch (error) {
      stopVoice();
      for (const node of owned) { try { node.disconnect(); } catch {} }
      target.error = String(error?.message || error); report(error);
    }
  }
  function update(frame = {}) {
    if (destroyed) return snapshot();
    control = { ...control, ...frame };
    selected(control.line);
    const route = !control.paused && control.enabled ? audioRoute() : null;
    if (!route) stopVoice();
    else {
      if (voice && (voice.ctx !== route.ctx || voice.destination !== route.destination)) stopVoice();
      if (current?.pcm && !current.done && !current.error && !voice) start(route);
      if (voice) spatialise(voice);
    }
    return snapshot();
  }
  function snapshot() {
    const offset = cursor();
    const envelope = towerWarningPcmEnvelope(current?.pcm, offset, {
      active: !!voice && !control.paused && control.enabled && !current?.done && !current?.error,
      lineId: current?.id ?? null,
    });
    return { lineId: current?.id ?? null, ready: !!current?.pcm, done: !!current?.done, offset, provider: current?.pcm?.provider ?? null, envelope,
      error: current?.error ?? null, active: !!voice, paused: !!control.paused, enabled: !!control.enabled, destroyed,
      source: voice?.position || null, relativeXYZ: voice?.relativeXYZ || null, spatialisation: voice?.spatialisation || null };
  }
  function pause() { control.paused = true; stopVoice(); return snapshot(); }
  function destroy() {
    if (destroyed) return;
    destroyed = true; generation++; stopVoice(); current = null; rendered.clear(); pending.clear();
  }
  return { prepare: lines => destroyed ? Promise.resolve(false) : Promise.all((Array.isArray(lines) ? lines : []).map(load)).then(values => !destroyed && values.every(value => value && !value.error)), update, pause, setPaused: value => { if (value) return pause(); control.paused = false; return snapshot(); }, snapshot, destroy };
}
