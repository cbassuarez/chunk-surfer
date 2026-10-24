import { CHAPEL_SERVICE, chapelServiceEvents } from '../data/chapel-service-score.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function chapelServiceVoiceMix(point = {}, yaw = 0) {
  const distance = Math.hypot(point.dx || 0, point.dz || 0);
  const radius = Math.max(1, Number(point.radius) || 30);
  const reach = clamp(distance / radius, 0, 1);
  const bearing = distance < .001 ? 0 : wrap(Math.atan2(point.dx || 0, -(point.dz || 0)) - yaw);
  const rear = Math.max(0, -Math.cos(bearing));
  const loss = clamp(Number(point.occlusionDb) || 0, 0, 60);
  const gain = Math.max(0, Number(point.gain) || 0) * (1 - reach) ** 1.2 * 10 ** (-loss / 20);
  return { distance, bearing, gain,
    pan: clamp(Math.sin(bearing) * Math.min(1, distance / 3) * .88, -.88, .88),
    cutoff: clamp((6300 - reach * 3100 - rear * 1800) * 10 ** (-loss / 55), 380, 6300),
  };
}

// A modest synthetic stone-room response, explicitly not a measured chapel IR.
// The actual congregation recording retains its own decay and receives much
// less of this send than the close-miked recitation. No organ/drone is added.
export function chapelServiceImpulse(context, random = Math.random) {
  const rate = context.sampleRate, seconds = CHAPEL_SERVICE.reverbSeconds;
  const delay = CHAPEL_SERVICE.preDelaySeconds, length = Math.ceil((seconds + delay) * rate);
  const buffer = context.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = Math.round(delay * rate); i < length; i++) {
      const t = i / rate - delay;
      low += (.62 - .43 * Math.min(1, t / seconds)) * (random() * 2 - 1 - low);
      data[i] = low * Math.exp(-6.9 * t / seconds) * .27;
    }
    for (const [at, gain] of [[.044, .42], [.072, .30], [.109, .22], [.168, .13]]) {
      data[Math.round((at + delay + ch * .003) * rate)] += gain;
    }
  }
  return buffer;
}

export function createChapelServiceRuntime({ context, destination, urlFor,
  fetcher = globalThis.fetch, random = Math.random,
  phaseOffset = CHAPEL_SERVICE.phaseOffsetSeconds,
} = {}) {
  const idle = { active: false, audible: false, loaded: false, sourceCount: 0, voices: [] };
  if (!context || !destination || typeof urlFor !== 'function') return {
    update: () => idle, frame: () => idle, stop() {}, dispose() {}, ready: async () => false, buffer: () => null,
  };
  const master = context.createGain(); master.gain.value = 0;
  master.connect(destination);
  const convolver = context.createConvolver(); convolver.normalize = true;
  convolver.buffer = chapelServiceImpulse(context, random);
  const reverbOutput = context.createGain(); reverbOutput.gain.value = .27;
  convolver.connect(reverbOutput).connect(master);

  const buffers = new Map(), stations = new Map(), playing = new Map(), served = new Map();
  let clips = new Map(), manifest = null, loading = null, failed = null, disposed = false;
  let last = idle, wasAudible = false, scheduled = 0;

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      const response = await fetcher(urlFor('manifest.json'));
      if (!response.ok) throw new Error(`Chapel service manifest: ${response.status}`);
      const next = await response.json();
      if (next.version !== 1 || !Array.isArray(next.clips) || next.clips.length > 16 || !next.clips.length)
        throw new Error('Invalid chapel service bank');
      let seconds = 0;
      const ids = new Set();
      for (const clip of next.clips) {
        if (!/^[a-z0-9-]+\.mp3$/.test(clip.file) || ids.has(clip.id) || !(clip.duration > 0) || clip.duration > 40)
          throw new Error('Invalid chapel service clip');
        ids.add(clip.id); seconds += clip.duration;
      }
      if (seconds > 120) throw new Error('Chapel service decode budget exceeded');
      await Promise.all(next.clips.map(async clip => {
        const file = await fetcher(urlFor(clip.file));
        if (!file.ok) throw new Error(`Chapel service ${clip.file}: ${file.status}`);
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (disposed) return;
        buffers.set(clip.id, buffer);
      }));
      if (disposed) return false;
      manifest = next; clips = new Map(next.clips.map(clip => [clip.id, clip]));
      return true;
    })().catch(error => { failed = String(error?.message || error); return false; });
    return loading;
  }

  function stationFor(id) {
    if (stations.has(id)) return stations.get(id);
    const input = context.createGain(), filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 4000; filter.Q.value = .5;
    const dry = context.createGain(); dry.gain.value = 0;
    const pan = context.createStereoPanner(), send = context.createGain(); send.gain.value = 0;
    input.connect(filter); filter.connect(dry).connect(pan).connect(master);
    filter.connect(send).connect(convolver);
    const station = { input, filter, dry, pan, send };
    stations.set(id, station); return station;
  }

  function endSources(now, { forget = false } = {}) {
    for (const [key, voice] of playing) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, .015);
        voice.source.stop(now + .065);
      } catch { /* already ended */ }
      playing.delete(key);
    }
    if (forget) served.clear();
  }

  function play(event, now) {
    if (playing.size >= CHAPEL_SERVICE.maxSources || served.has(event.key)) return;
    const buffer = buffers.get(event.clip.id), station = stations.get(event.anchor);
    if (!buffer || !station) return;
    const offset = Math.max(0, now - event.at), duration = Math.min(buffer.duration, event.clip.duration);
    if (offset >= duration - .035) return;
    // No catch-up attacks: re-entry joins an existing long phrase quietly,
    // while the middle of a tiny incidental creak is simply left unheard.
    if (event.clip.role === 'movement' && offset > .12) { served.set(event.key, event.until); return; }
    const at = Math.max(now + .006, event.at), remaining = duration - offset;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const level = Math.max(0, Number(event.clip.gain) || 0);
    const attack = Math.min(remaining * .4, event.bed ? 1.2 : offset > .08 ? .22 : .018);
    const release = event.bed ? Math.min(1.4, remaining * .35) : Math.min(.10, remaining * .25);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.setValueAtTime(level, at + Math.max(attack, remaining - release));
    gain.gain.linearRampToValueAtTime(0, at + remaining);
    source.connect(gain).connect(station.input);
    playing.set(event.key, { source, gain, until: at + remaining, event });
    served.set(event.key, event.until);
    source.onended = () => {
      const live = playing.get(event.key);
      if (live?.source === source) playing.delete(event.key);
      try { source.disconnect(); gain.disconnect(); } catch { /* disposed */ }
    };
    source.start(at, offset, remaining);
    scheduled++;
  }

  function update(input = {}) {
    if (disposed) return idle;
    const now = context.currentTime;
    const active = !!input.active;
    if (active) void load();
    const loaded = !!manifest && buffers.size === clips.size && !failed;
    const voices = [];
    let audible = false;
    for (const point of input.voices || []) {
      const mix = chapelServiceVoiceMix(point, input.yaw || 0), station = stationFor(point.id);
      station.dry.gain.setTargetAtTime(mix.gain, now, .09);
      station.pan.pan.setTargetAtTime(mix.pan, now, .075);
      station.filter.frequency.setTargetAtTime(mix.cutoff, now, .10);
      // The response's field recording already contains a church tail. The
      // officiant needs more room; the recording of occupied silence needs less.
      station.send.gain.setTargetAtTime(mix.gain * (point.id === 'officiant' ? .48 : .14), now, .12);
      voices.push({ id: point.id, presenceId: point.presenceId, ...mix });
      audible ||= mix.gain > .001;
    }
    audible = active && loaded && !input.muted && audible;
    const target = audible ? CHAPEL_SERVICE.gain * (input.dialogue ? CHAPEL_SERVICE.dialogueGain : 1) : 0;
    master.gain.setTargetAtTime(target, now, audible ? CHAPEL_SERVICE.fadeInSeconds : CHAPEL_SERVICE.fadeOutSeconds);
    if (!audible) {
      if (wasAudible || playing.size) endSources(now, { forget: true });
    } else {
      for (const [key, until] of served) if (until < now - 1) served.delete(key);
      for (const [key, voice] of playing) if (voice.until < now) playing.delete(key);
      for (const event of chapelServiceEvents(now, clips, { phaseOffset })) play(event, now);
    }
    wasAudible = audible;
    last = { active, audible, muted: !!input.muted, reason: input.reason || null, loaded, failed,
      phase: (now + phaseOffset) % CHAPEL_SERVICE.cycleSeconds,
      sourceCount: playing.size, scheduled, voices,
      playing: [...playing.values()].map(v => ({ id: v.event.clip.id, key: v.event.key, anchor: v.event.anchor, at: v.event.at, until: v.event.until })),
    };
    return last;
  }

  function stop() {
    const now = context.currentTime;
    master.gain.setTargetAtTime(0, now, CHAPEL_SERVICE.fadeOutSeconds);
    endSources(now, { forget: true }); wasAudible = false;
    last = { ...last, active: false, audible: false, sourceCount: 0, playing: [] };
  }
  function dispose() {
    stop(); disposed = true;
    for (const station of stations.values()) for (const node of Object.values(station)) node.disconnect?.();
    master.disconnect(); convolver.disconnect(); reverbOutput.disconnect();
    stations.clear(); buffers.clear();
  }
  // The murmur (audio/chapel-murmur.js) cuts its grains from these same decoded
  // clips rather than decoding the recitation a second time.
  return { update, frame: () => last, ready: load, stop, dispose, buffer: id => buffers.get(id) || null };
}
