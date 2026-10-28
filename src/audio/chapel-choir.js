import { createChapelChoirApproach, CHAPEL_CHOIR_APPROACH } from '../game/chapel-choir-approach.js';
import { chapelServiceImpulse, chapelServiceVoiceMix } from './chapel-service.js';
import { renderGainChannels, segmentAt } from './chapel-choir-score.js';

// Recorded voices and gain signals share the audio clock, including during a
// stalled render frame. There is no frame-driven pulse timer or pitch change.
export function validateChapelChoirBank(bank) {
  if (bank?.version !== 1 || !Number.isFinite(bank.duration) || bank.duration < 8 || bank.duration > 150)
    throw Error('Invalid chapel choir passage');
  const separate = bank.sourceKind === 'independent-parts';
  if (!separate && bank.sourceKind !== 'ensemble-mix') throw Error('Unknown choir source kind');
  if (!Array.isArray(bank.tracks) || bank.tracks.length !== (separate ? 6 : 1))
    throw Error('Choir bank must contain six independent parts or one declared ensemble mix');
  const files = new Set(), ids = new Set(), originals = new Set(), hashes = new Set(), parts = new Set();
  for (const track of bank.tracks) {
    if (!/^[a-z0-9-]+\.wav$/.test(track.file) || files.has(track.file) || ids.has(track.id)
      || !track.id || !/^[a-f0-9]{64}$/.test(track.sha256 || '') || !track.source || !track.licenceUrl
      || !/^[a-z0-9-]+$/.test(track.anchor || '') || !/^[a-z0-9-]+$/.test(track.projectionAnchor || ''))
      throw Error('Invalid choir track provenance');
    files.add(track.file); ids.add(track.id);
    if (separate) {
      if (!track.part || parts.has(track.part) || !track.originalTrack || originals.has(track.originalTrack) || hashes.has(track.sha256))
        throw Error('Independent choir parts require unique original recordings');
      originals.add(track.originalTrack); hashes.add(track.sha256); parts.add(track.part);
    }
  }
  if (bank.control && (!/^[a-z0-9-]+\.f32$/.test(bank.control.file || '') || bank.control.sampleRate !== 12000
    || bank.control.frames !== Math.ceil(bank.duration * 12000) + 1 || !/^[a-f0-9]{64}$/.test(bank.control.sha256 || '')))
    throw Error('Invalid choir gain signal');
  return bank;
}

export function createChapelChoirRuntime({ context, destination, urlFor, score,
  fetcher = globalThis.fetch, phaseOffset = 0, random = Math.random,
} = {}) {
  const idle = { active: false, audible: false, loaded: false, sourceCount: 0, failed: null };
  if (!context || !destination || !urlFor || !score) return {
    ready: async () => false, update: () => idle, frame: () => idle, stop() {}, dispose() {},
  };
  const master = context.createGain(); master.gain.value = 0; master.connect(destination);
  const impulse = chapelServiceImpulse(context, random), roomInput = context.createGain();
  let room;
  const roomLevel = context.createGain(); roomLevel.gain.value = .24;
  // Modulation precedes reflections. The protection master follows both dry
  // and wet sound, so an interrupted take cannot inherit a service reverb tail.
  roomLevel.connect(master);
  function clearRoom() {
    roomInput.disconnect(); room?.disconnect();
    room = context.createConvolver(); room.normalize = true; room.buffer = impulse;
    roomInput.connect(room).connect(roomLevel);
  }
  clearRoom();
  const buses = [], buffers = [], controls = [], playing = new Set();
  let bank = null, loading = null, failed = null, disposed = false, last = idle;
  let started = 0, wasAudible = false;
  const approach = createChapelChoirApproach({duration:score.duration,phaseOffset});
  function bus() {
    const input = context.createGain(), low = context.createBiquadFilter();
    low.type = 'lowpass'; low.Q.value = .5;
    const level = context.createGain(), pan = context.createStereoPanner(), send = context.createGain();
    level.gain.value = 0; send.gain.value = 0;
    input.connect(low).connect(level).connect(pan).connect(master);
    low.connect(send).connect(roomInput);
    return { input, low, level, pan, send };
  }
  async function load() {
    if (disposed) return false;
    if (loading) return loading;
    loading = (async () => {
      const response = await fetcher(urlFor('manifest.json'));
      if (!response.ok) throw Error(`Choir manifest: ${response.status}`);
      const next = validateChapelChoirBank(await response.json());
      if (Math.abs(next.duration - score.duration) > .001) throw Error('Choir score and passage disagree');
      const decoded = await Promise.all(next.tracks.map(async track => {
        const file = await fetcher(urlFor(track.file));
        if (!file.ok) throw Error(`Choir track: ${file.status}`);
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (buffer.numberOfChannels !== 1 || Math.abs(buffer.duration - next.duration) > 2 / context.sampleRate)
          throw Error('Choir tracks must be aligned mono passages of equal length');
        return buffer;
      }));
      if (disposed) return false;
      let rendered;
      if (next.control) {
        const response = await fetcher(urlFor(next.control.file));
        if (!response.ok) throw Error(`Choir gain signal: ${response.status}`);
        const bytes = await response.arrayBuffer(), { frames, sampleRate } = next.control;
        if (bytes.byteLength !== frames * next.tracks.length * 4) throw Error('Choir gain signal length differs');
        const data = new Float32Array(bytes);
        if (data.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw Error('Invalid choir gain samples');
        rendered = { length: frames, sampleRate,
          channels: next.tracks.map((_, i) => data.subarray(i * frames, (i + 1) * frames)) };
      } else {
        // Technical fixtures/custom banks may bake controls; the shipped bank
        // always carries precomputed samples to avoid a first-entry frame stall.
        rendered = renderGainChannels(score, { voices: next.tracks.length, controlHz: 12000 });
      }
      if (disposed) return false;
      for (let i = 0; i < decoded.length; i++) {
        const signal = context.createBuffer(1, rendered.length, rendered.sampleRate);
        signal.getChannelData(0).set(rendered.channels[i]);
        controls.push(signal); buffers.push(decoded[i]);
        buses.push({ natural: bus(), projected: bus() });
      }
      bank = next; return true;
    })().catch(error => { failed = String(error?.message || error); return false; });
    return loading;
  }
  function finish(now) {
    for (const live of playing) {
      live.envelope.gain.cancelScheduledValues(now);
      live.envelope.gain.setTargetAtTime(0, now, .008);
      for (const source of live.sources) { try { source.stop(now + .06); } catch {} }
      // Retire the whole input generation immediately. Reopening protection
      // cannot feed old phrases into the newly cleared reflection history.
      live.envelope.disconnect();
    }
    playing.clear();
    clearRoom();
  }
  function start(now, phase) {
    const at = now + .012, offset = ((phase + .012) % bank.duration + bank.duration) % bank.duration;
    for (let i = 0; i < buffers.length; i++) {
      const source = context.createBufferSource(), control = context.createBufferSource();
      source.buffer = buffers[i]; control.buffer = controls[i];
      for (const node of [source, control]) {
        node.loop = true; node.loopStart = 0; node.loopEnd = bank.duration;
        node.playbackRate.value = 1;
      }
      const envelope = context.createGain(), modulation = context.createGain();
      envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(1, at + .14);
      modulation.gain.value = 0;
      source.connect(envelope);
      envelope.connect(buses[i].natural.input);
      envelope.connect(modulation).connect(buses[i].projected.input);
      control.connect(modulation.gain);
      const live = { sources: [source, control], envelope, modulation, at, offset };
      playing.add(live);
      source.onended = () => {
        playing.delete(live);
        for (const node of [source, control, envelope, modulation]) node.disconnect();
      };
      // The two branches never create duplicate performers: one recording is
      // split before gain, as acoustic input and its electronic projection.
      source.start(at, offset); control.start(at, offset); started++;
    }
  }
  function spatial(nodes, point, yaw, now, projected) {
    const mix = chapelServiceVoiceMix({ ...point, radius: projected ? 40 : 20 }, yaw);
    const radius = projected ? 40 : 20, distance3D = Math.hypot(point.dx || 0, point.dy || 0, point.dz || 0);
    const horizontal = Math.max(0, 1 - mix.distance / radius), spatial = Math.max(0, 1 - distance3D / radius);
    mix.gain *= horizontal > 0 ? (spatial / horizontal) ** 1.2 : 0;
    mix.distance = distance3D; mix.height = Number(point.dy) || 0;
    const scale = projected ? .78 : .48;
    nodes.level.gain.setTargetAtTime(mix.gain * scale, now, .08);
    nodes.pan.pan.setTargetAtTime(mix.pan, now, .075);
    nodes.low.frequency.setTargetAtTime(mix.cutoff, now, .1);
    nodes.send.gain.setTargetAtTime(mix.gain * (projected ? .34 : .10), now, .10);
    return { ...mix, level: mix.gain * scale };
  }
  function update(input = {}) {
    if (disposed) return idle;
    const now = context.currentTime;
    if (input.active) void load();
    let reached = false;
    const mixes = buses.map((nodes, i) => {
      const track = bank.tracks[i];
      const natural = (input.voices || []).find(v => v.id === track.anchor);
      const projected = (input.voices || []).find(v => v.id === track.projectionAnchor);
      // Missing/removed anchors clear both paths; no last-position leak.
      const silent = { gain: 0 };
      const direct = spatial(nodes.natural, natural || silent, input.yaw || 0, now, false);
      const projection = spatial(nodes.projected, projected || silent, input.yaw || 0, now, true);
      reached ||= direct.gain > .001 || projection.gain > .001;
      return { id: track.id, natural: direct, projected: projection };
    });
    const naturalIds=new Set(bank?.tracks.map(track=>track.anchor)||['front']);
    const distances=(input.voices||[]).filter(voice=>naturalIds.has(voice.id)&&voice.gain>0
      &&(Number(voice.occlusionDb)||0)<CHAPEL_CHOIR_APPROACH.maxOcclusionDb)
      .map(voice=>Math.hypot(voice.dx||0,voice.dy||0,voice.dz||0));
    const nearby=distances.length>0&&Math.min(...distances)<=CHAPEL_CHOIR_APPROACH.triggerDistanceM;
    const performance=approach.update({now,active:!!input.active&&!!bank&&reached,muted:!!input.muted,
      distance:distances.length?Math.min(...distances):Infinity});
    const running=performance.engaged&&!!input.active&&!input.muted&&!!bank&&reached;
    const audible=running&&performance.arrivalEnvelope>.005;
    // A long, quiet arrival exposes the human layer before fervour can lift
    // anyone. Protection still covers both direct sound and room reflections.
    master.gain.setTargetAtTime(running ? .72 * performance.arrivalEnvelope * (input.dialogue ? .16 : 1) : 0, now, running ? .4 : .025);
    if (running && !wasAudible) start(now,performance.phase);
    if (!running && (wasAudible || playing.size)) finish(now);
    wasAudible = running;
    const phase = performance.phase;
    last = { active: !!input.active, audible, loaded: !!bank, failed, muted: !!input.muted,
      reason: input.reason, sourceKind: bank?.sourceKind || null,
      independentParts: bank?.sourceKind === 'independent-parts' ? 6 : 0,
      nearby, fallbackFadeSeconds:CHAPEL_CHOIR_APPROACH.fadeSeconds, ...performance, phase, segment: segmentAt(phase, score), sourceCount: playing.size * 2,
      started, mixes, starts: [...playing].map(v => ({ at: v.at, offset: v.offset })),
      bufferBytes: buffers.reduce((n, b) => n + b.length * 4, 0) + controls.reduce((n, b) => n + b.length * 4, 0),
    };
    return last;
  }
  function stop() {
    if (disposed) return;
    master.gain.setTargetAtTime(0, context.currentTime, .025); finish(context.currentTime);
    wasAudible = false; approach.reset(); last = { ...last, active: false, audible: false, sourceCount: 0, engaged:false, elapsed:0, fervour:0, arrivalEnvelope:0 };
  }
  function dispose() {
    if (disposed) return;
    stop(); disposed = true;
    for (const pair of buses) for (const group of Object.values(pair)) for (const node of Object.values(group)) node.disconnect();
    for (const node of [master, roomInput, room, roomLevel]) node.disconnect();
    buffers.length = controls.length = buses.length = 0;
  }
  return { ready: load, update, frame: () => last, stop, dispose };
}
