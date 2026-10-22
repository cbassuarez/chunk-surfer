import { ELLERY_BELLS } from '../data/bell-tower.js';
import { BELL_TOWER_STEM_MANIFEST_URL } from './bell-stem-assets.js';
import { normalizeBellStemManifest, chooseBellStem, resolveBellStemManifestUrls } from './bell-stem-manifest.js';
import { ST_BRENDANS_SOUND } from '../data/st-brendans-audio.js';
import { stBrendansAcousticLevel, stBrendansSourceMix, stBrendansAmbienceEvents } from '../game/st-brendans-sound.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));
const idle = () => ({ active: false, muted: true, ambientMuted: true, audible: false, sourceCount: 0, ambientCount: 0, scheduledStrikes: 0 });
const unavailable = () => ({ update: idle, snapshot: idle, ready: async () => false, strike: () => false,
  stop() {}, cut() {}, destroy() {}, maskingDb: () => 0 });

// Deterministic procedural response, not a measured cathedral impulse.
export function stBrendansImpulse(context, name = 'belfry') {
  const p = ST_BRENDANS_SOUND.profiles[stBrendansAcousticLevel(name)], rate = context.sampleRate;
  const length = Math.ceil((p.decay + .04) * rate), buffer = context.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch); let seed = (p.decay * 1000 + ch * 9329) >>> 0, low = 0;
    for (let i = Math.floor(.029 * rate); i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 4294967296 * 2 - 1;
      low += .25 * (noise - low);
      data[i] = low * Math.exp(-6.9 * (i / rate - .029) / p.decay) * .23;
    }
    p.delays.forEach((seconds, i) => { data[Math.min(length - 1, Math.round((seconds + ch * .0021) * rate))] += .5 / (i + 1); });
  }
  return buffer;
}

// One bank decode and one crossfading response pair serve all fixed sources.
// The eight tonal notes remain the existing documented prototype bank.
export function createStBrendansAudio({ context, destination, urlFor,
  fetcher = globalThis.fetch, stemManifestUrl = BELL_TOWER_STEM_MANIFEST_URL,
} = {}) {
  const ctx = context;
  if (!ctx || !destination || typeof urlFor !== 'function') return unavailable();
  const master = ctx.createGain(), ambientMaster = ctx.createGain(), bellMaster = ctx.createGain(), wetIn = ctx.createGain();
  master.gain.value = 0; ambientMaster.gain.value = 0; bellMaster.gain.value = 1;
  master.connect(destination); ambientMaster.connect(master); bellMaster.connect(master);
  const wetFilter = ctx.createBiquadFilter(); wetFilter.type = 'lowpass'; wetFilter.frequency.value = 8200; wetFilter.Q.value = .3;
  wetIn.connect(wetFilter);
  const firstImpulse = stBrendansImpulse(ctx), impulseCache = new Map([['belfry', firstImpulse]]);
  function impulseFor(name) {
    if (!impulseCache.has(name)) impulseCache.set(name, stBrendansImpulse(ctx, name));
    return impulseCache.get(name);
  }
  const responses = [0, 1].map(i => { const convolver = ctx.createConvolver(), gain = ctx.createGain();
    convolver.normalize = true; convolver.buffer = firstImpulse; gain.gain.value = i ? 0 : 1;
    wetFilter.connect(convolver).connect(gain).connect(bellMaster); return { convolver, gain }; });
  const ambientWetIn = ctx.createGain(), ambientWetOut = ctx.createGain(), ambientConvolver = ctx.createConvolver();
  // Air/mechanism tails have their own protected bus. Blocking incidental sound
  // cannot cut a valid combat bell or leave an incidental wet tail audible.
  ambientConvolver.normalize = true; ambientConvolver.buffer = firstImpulse; ambientWetOut.gain.value = .38;
  ambientWetIn.connect(ambientConvolver).connect(ambientWetOut).connect(ambientMaster);
  const stations = new Map(), buffers = new Map(), clips = new Map(), voices = new Set(), served = new Map();
  let frame = idle(), input = {}, disposed = false, ambientManifest = null, stemManifest = null,
    loading = null, stemLoading = null, bankFailure = null, stemFailure = null,
    profileName = 'belfry', activeResponse = 0, lastDamage = null, strikes = 0, lastStrike = null, scheduled = 0, masking = 0, wasEnabled = false;

  const ramp = (param, value, time = .09) => {
    if (typeof param?.setTargetAtTime === 'function') param.setTargetAtTime(value, ctx.currentTime, Math.max(.008, time));
    else if (param) param.value = value;
  };
  function track(source, gain, { kind = 'ambient', key = null, until = Infinity, extra = [] } = {}) {
    const voice = { source, gain, kind, key, until, extra, created: ctx.currentTime }; voices.add(voice);
    source.onended = () => { voices.delete(voice); for (const n of [source, gain, ...extra]) { try { n?.disconnect?.(); } catch {} } };
    return voice;
  }
  function clearVoices(kind = null) {
    for (const v of [...voices]) if (!kind || v.kind === kind) {
      try { v.gain.gain.cancelScheduledValues?.(ctx.currentTime); ramp(v.gain.gain, 0, .009); v.source.stop(ctx.currentTime + .035); } catch {}
      voices.delete(v);
    }
  }
  function clearResponseTails({ ambientOnly = false } = {}) {
    // Disconnecting a source cannot clear convolution memory. Reset the three
    // processing histories only at a protection edge; re-use cached impulses.
    for (const node of [...(ambientOnly ? [] : responses.map(r => r.convolver)), ambientConvolver]) {
      const buffer = node.buffer; node.buffer = null; node.buffer = buffer;
    }
  }
  function stationFor(id, kind = 'bell') {
    const key = `${kind}:${id}`; if (stations.has(key)) return stations.get(key);
    const station = { input: ctx.createGain(), filter: ctx.createBiquadFilter(), direct: ctx.createGain(), send: ctx.createGain(),
      pan: ctx.createStereoPanner?.(), panner: ctx.createPanner?.(), structureFilter: ctx.createBiquadFilter(), structure: ctx.createGain(), kind };
    station.filter.type = 'lowpass'; station.filter.Q.value = .4; station.direct.gain.value = 0; station.send.gain.value = 0; station.structure.gain.value = 0;
    station.structureFilter.type = 'lowpass'; station.structureFilter.frequency.value = 170; station.structureFilter.Q.value = .5;
    const target = kind === 'bell' ? bellMaster : ambientMaster, wet = kind === 'bell' ? wetIn : ambientWetIn;
    station.input.connect(station.filter).connect(station.direct);
    if (station.panner) {
      station.panner.panningModel = 'HRTF'; station.panner.distanceModel = 'inverse';
      // Attenuation is explicitly calculated from the same fixed pivot; HRTF
      // contributes direction/elevation only, without applying falloff twice.
      station.panner.refDistance = 1; station.panner.rolloffFactor = 0; station.panner.maxDistance = 500;
      station.direct.connect(station.panner).connect(target);
    } else if (station.pan) station.direct.connect(station.pan).connect(target);
    else station.direct.connect(target);
    station.filter.connect(station.send).connect(wet);
    station.input.connect(station.structureFilter).connect(station.structure).connect(target);
    stations.set(key, station); return station;
  }
  function place(station, point) {
    const mix = stBrendansSourceMix(point, input.listener, profileName), carry = input.carryProgress;
    const dying = carry == null ? 1 : .12 + .88 * (1 - clamp(carry, 0, 1));
    const air = station.kind === 'ambient' && station.id === 'air';
    const multiplier = station.kind === 'bell' ? dying : air ? ST_BRENDANS_SOUND.profiles[profileName].wind : dying;
    ramp(station.direct.gain, mix.direct * multiplier); ramp(station.send.gain, mix.send * multiplier * (air ? .2 : 1));
    ramp(station.filter.frequency, mix.cutoff); ramp(station.structure.gain, station.kind === 'bell' ? mix.structure * dying : 0);
    if (station.pan) ramp(station.pan.pan, mix.pan);
    if (station.panner) {
      if (station.panner.positionX) { ramp(station.panner.positionX, mix.localX); ramp(station.panner.positionY, mix.localY); ramp(station.panner.positionZ, mix.localZ); }
      else station.panner.setPosition?.(mix.localX, mix.localY, mix.localZ);
    }
    station.mix = mix; station.point = point; return mix;
  }
  async function loadAmbience() {
    if (loading) return loading;
    loading = (async () => {
      const response = await fetcher(urlFor('manifest.json')); if (!response.ok) throw new Error(`St Brendan's manifest ${response.status}`);
      const m = await response.json();
      if (m.version !== 1 || !Array.isArray(m.clips) || !m.clips.length || m.clips.length > 8) throw new Error('Invalid St Brendan\'s material bank');
      let seconds = 0; const seen = new Set();
      for (const c of m.clips) {
        if (!/^[a-z0-9-]+\.mp3$/.test(c.file) || seen.has(c.id) || !(c.duration > .1) || c.duration > 30) throw new Error('Invalid St Brendan\'s material clip');
        seen.add(c.id); seconds += c.duration;
      }
      if (seconds > 70) throw new Error('St Brendan\'s material decode budget exceeded');
      await Promise.all(m.clips.map(async c => {
        const response = await fetcher(urlFor(c.file)); if (!response.ok) throw new Error(`St Brendan's ${c.file} ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (!disposed) { buffers.set(c.id, buffer); clips.set(c.id, c); }
      }));
      if (disposed) return false; ambientManifest = m; return true;
    })().catch(e => { bankFailure = String(e?.message || e); return false; }); return loading;
  }
  async function loadStems() {
    if (stemLoading) return stemLoading;
    stemLoading = (async () => {
      const response = await fetcher(stemManifestUrl); if (!response.ok) throw new Error(`Bell manifest ${response.status}`);
      const base = typeof location === 'object' ? new URL(stemManifestUrl, location.href).href : new URL(stemManifestUrl, 'http://local.invalid/').href;
      const m = normalizeBellStemManifest(resolveBellStemManifestUrls(await response.json(), base));
      if (m.entries.length > 32) throw new Error('Bell bank decode budget exceeded');
      await Promise.all(m.entries.map(async entry => {
        const response = await fetcher(entry.url); if (!response.ok) throw new Error(`Bell stem ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        // Web Audio may legitimately resample a 48 kHz asset into a 44.1 kHz
        // context. Contact offsets remain in the manifest's 48 kHz source units.
        if (buffer.numberOfChannels !== 1 || buffer.duration < 11.9 || buffer.duration > 13) throw new Error('Invalid bell stem');
        if (!disposed) buffers.set(entry.url, buffer);
      }));
      if (disposed) return false; stemManifest = m; return true;
    })().catch(e => { stemFailure = String(e?.message || e); return false; }); return stemLoading;
  }
  function ready() { return Promise.all([loadAmbience(), loadStems()]).then(([ambience, bells]) => ({ ambience, bells })); }
  function playClip(id, station, { kind = 'ambient', offset = 0, gain = 1, key = null, duration = Infinity } = {}) {
    // A partially fetched bank must not leak isolated loaded bits on a bell
    // contact after another material file failed. Tonal bells stay separate.
    if (disposed || !ambientManifest || voices.size >= ST_BRENDANS_SOUND.maxSources || !buffers.has(id)) return false;
    if (kind === 'ambient' && [...voices].filter(v => v.kind === 'ambient').length >= ST_BRENDANS_SOUND.maxAmbientSources) return false;
    const buffer = buffers.get(id), clip = clips.get(id), remaining = Math.min(duration, buffer.duration - offset);
    if (remaining < .02) return false;
    const source = ctx.createBufferSource(), amp = ctx.createGain(), at = ctx.currentTime + .004;
    source.buffer = buffer; source.playbackRate.value = 1;
    const level = clamp(clip?.gain ?? 1, 0, 1) * gain, attack = offset > .1 ? .25 : .006;
    amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(level, at + Math.min(attack, remaining * .4));
    amp.gain.setValueAtTime(level, at + Math.max(Math.min(attack, remaining * .4), remaining - .035)); amp.gain.linearRampToValueAtTime(0, at + remaining);
    source.connect(amp).connect(station.input); track(source, amp, { kind, key, until: at + remaining }); source.start(at, offset, remaining); scheduled++; return true;
  }
  function fallbackBell(record, station, gain, when) {
    const base = Number(ELLERY_BELLS[record.bell - 1]?.frequency) || 116.54;
    for (const [ratio, amplitude, duration] of [[1, .16, 7.2], [2.01, .052, 4.6], [2.41, .033, 3.5], [3, .020, 2.6]]) {
      if (voices.size >= ST_BRENDANS_SOUND.maxSources) break;
      const osc = ctx.createOscillator(), amp = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = base * ratio;
      amp.gain.setValueAtTime(.0001, when); amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain * amplitude), when + .009);
      amp.gain.exponentialRampToValueAtTime(.0001, when + duration);
      osc.connect(amp).connect(station.input); track(osc, amp, { kind: 'bell', until: when + duration }); osc.start(when); osc.stop(when + duration + .03);
    }
  }
  function strike(record, bell = ELLERY_BELLS[record?.bell - 1], options = {}) {
    if (disposed || !input.active || input.muted || !record) return false;
    const id = Number(record.bell), world = input.bells?.find(b => b.id === id), point = world?.pivot || bell?.pivot;
    if (![point?.x, point?.y, point?.z].every(Number.isFinite)) return false;
    const station = stationFor(id), mix = place(station, { ...point, occlusionDb: world?.occlusionDb || 0 });
    const entry = chooseBellStem(stemManifest, { ...record, bell: id }), buffer = entry && buffers.get(entry.url);
    const when = ctx.currentTime + Math.max(0, Number(options.delaySec) || 0), gain = clamp(options.gain ?? .7, 0, 1);
    // Keep the alarm's new attack even under repeated contacts. Retire old
    // bell tails rather than silently dropping meaningful contact feedback.
    const needed = buffer ? 2 : 5;
    for (const voice of [...voices].filter(v => v.kind === 'bell').sort((a, b) => a.created - b.created)) {
      if (voices.size + needed <= ST_BRENDANS_SOUND.maxSources) break;
      try { ramp(voice.gain.gain, 0, .009); voice.source.stop(ctx.currentTime + .035); } catch {}
      voices.delete(voice);
    }
    if (voices.size >= ST_BRENDANS_SOUND.maxSources) return false;
    if (buffer) {
      const source = ctx.createBufferSource(), amp = ctx.createGain(); source.buffer = buffer; source.playbackRate.value = 1; amp.gain.value = gain * 10 ** ((entry.gainDb || 0) / 20);
      const intended = when - entry.contactOffsetSamples / 48000, start = Math.max(ctx.currentTime, intended), offset = Math.max(0, start - intended);
      source.connect(amp).connect(station.input); track(source, amp, { kind: 'bell', until: start + buffer.duration - offset }); source.start(start, offset);
    } else fallbackBell({ ...record, bell: id }, station, gain, when);
    // The recorded latch is contact texture, never an extra bell alarm. Delay
    // remains on the existing semantic strike; no separate random strikes.
    if (options.delaySec == null || options.delaySec < .02) playClip('iron-contact', station, { kind: 'bell', gain: .65 * gain });
    strikes++; masking = Math.min(24, masking + 2.8); lastStrike = { bell: id, when, point: { ...point }, gain, mode: buffer ? 'existing-clock-derived-stem' : 'synthesis-fallback', mix };
    return true;
  }
  function update(next = {}) {
    if (disposed) return idle(); input = next;
    const enabled = !!next.active && !next.muted, incidental = enabled && !next.ambientMuted;
    const name = stBrendansAcousticLevel(next.level);
    if (name !== profileName) {
      profileName = name; const inactive = 1 - activeResponse;
      responses[inactive].convolver.buffer = impulseFor(name); activeResponse = inactive;
      ambientConvolver.buffer = responses[inactive].convolver.buffer;
      responses.forEach((entry, index) => ramp(entry.gain.gain, index === activeResponse ? 1 : 0, .24));
    }
    ramp(wetFilter.frequency, ST_BRENDANS_SOUND.profiles[profileName].cutoff, .2);
    if (next.active) { void loadAmbience(); void loadStems(); }
    ramp(master.gain, enabled ? ST_BRENDANS_SOUND.gain * (next.dialogue ? ST_BRENDANS_SOUND.dialogueGain : 1) : 0, enabled ? .04 : .009);
    ramp(ambientMaster.gain, incidental ? 1 : 0, incidental ? ST_BRENDANS_SOUND.fadeIn : .009);
    if (!enabled) { clearVoices(); served.clear(); if (wasEnabled) clearResponseTails(); }
    else if (!incidental) { clearVoices('ambient'); served.clear(); if (!frame.ambientMuted) clearResponseTails({ ambientOnly: true }); }
    wasEnabled = enabled;
    for (const bell of next.bells || []) {
      const station = stationFor(bell.id); place(station, { ...bell.pivot, occlusionDb: bell.occlusionDb || 0 });
    }
    const points = (next.bells || []).map(b => b.pivot).filter(Boolean), center = points.length ? {
      x: points.reduce((s, p) => s + p.x, 0) / points.length, y: Math.min(...points.map(p => p.y)), z: points.reduce((s, p) => s + p.z, 0) / points.length,
    } : null;
    const defaults = center ? { frame: center, rope: { ...center, y: center.y - .8 }, air: { ...center, y: center.y + 1.1, z: center.z - 3.4 } } : {};
    const anchors = { ...defaults, ...(next.anchors || {}) };
    for (const [id, point] of Object.entries(anchors)) { const station = stationFor(id, 'ambient'); station.id = id; place(station, point); }
    for (const [mark, point] of Object.entries(next.damageAnchors || {})) {
      const existing = stations.get(`bell:damage:${mark}`); if (existing) place(existing, point);
    }
    for (const v of [...voices]) if (v.until < ctx.currentTime) voices.delete(v);
    for (const [key, until] of served) if (until < ctx.currentTime - 1) served.delete(key);
    if (incidental && ambientManifest) {
      for (const event of stBrendansAmbienceEvents(ctx.currentTime, { swinging: next.damage?.includes('bells-swinging'), carryProgress: next.carryProgress })) {
        if (served.has(event.key) || !anchors[event.anchor]) continue;
        if (playClip(event.id, stationFor(event.anchor, 'ambient'), { offset: Math.max(0, ctx.currentTime - event.at), gain: event.gain, key: event.key, duration: event.until - ctx.currentTime })) served.set(event.key, event.until);
      }
    }
    // Keep the existing damage timing without replaying historic breaks on
    // initial entry/reload. These are physical contact layers, not ambience.
    const damage = new Set(next.damage || []);
    if (enabled && lastDamage && ambientManifest && anchors.frame) for (const mark of damage) if (!lastDamage.has(mark)) {
      const id = mark === 'frame-shaken' ? 'timber-load' : mark === 'lantern-out' ? 'iron-contact'
        : mark === 'pulpitum-split' || mark === 'bell-fallen' ? 'stone-break' : null;
      // Stone damage must have its own actual ground source. Do not put the
      // broken screen or fallen bell back in the suspended timber frame.
      const point = next.damageAnchors?.[mark] || (mark === 'frame-shaken' ? anchors.frame : null);
      if (id && point) { const station = stationFor(`damage:${mark}`, 'bell'); place(station, point); playClip(id, station, { kind: 'damage', gain: .9 }); }
    }
    // An inactive helper frame intentionally has no saved world state. It is
    // not evidence that the church repaired itself. Re-entering, or returning
    // after REC/pause/focus protection, establishes a fresh baseline; damage
    // that happened while inaudible must never queue a deferred break sound.
    lastDamage = enabled ? damage : null;
    frame = { active: !!next.active, muted: !!next.muted, ambientMuted: !!next.ambientMuted, audible: enabled,
      level: profileName, reason: next.reason || null, bankReady: !!ambientManifest, bankFailure, stemReady: !!stemManifest, stemFailure,
      sourceCount: voices.size, ambientCount: [...voices].filter(v => v.kind === 'ambient').length, scheduled,
      scheduledStrikes: strikes, lastStrike, maskingDb: masking, response: 'deterministic procedural approximation, not measured',
      positioning: [...stations.values()].some(s => s.panner) ? 'fixed-world HRTF relative coordinates' : 'fixed-world stereo pan; height affects attenuation',
      impulseCount: impulseCache.size, sources: [...stations.entries()].map(([id, s]) => ({ id, point: s.point, mix: s.mix })),
      playing: [...voices].map(v => ({ kind: v.kind, key: v.key, until: v.until })) };
    return frame;
  }
  function stop() { input = {}; ramp(master.gain, 0, .009); ramp(ambientMaster.gain, 0, .009); clearVoices(); clearResponseTails(); served.clear(); lastDamage = null; wasEnabled = false; frame = { ...frame, ...idle() }; }
  function destroy() {
    stop(); disposed = true;
    for (const s of stations.values()) for (const n of Object.values(s)) { try { n?.disconnect?.(); } catch {} }
    for (const n of [master, ambientMaster, bellMaster, wetIn, wetFilter, ambientWetIn, ambientWetOut, ambientConvolver, ...responses.flatMap(r => [r.convolver, r.gain])]) n.disconnect?.();
    stations.clear(); buffers.clear(); clips.clear(); impulseCache.clear();
  }
  return { update, strike, ready, stop, cut: stop, destroy,
    snapshot: () => ({ ...frame, sourceCount: voices.size, ambientCount: [...voices].filter(v => v.kind === 'ambient').length, scheduledStrikes: strikes, lastStrike }),
    maskingDb: () => { masking *= .985; return masking; } };
}
