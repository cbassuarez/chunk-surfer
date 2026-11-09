import { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS } from '../game/coastal-memory.js';
import { MUSIC_BOX_REFERENCE } from '../data/music-box-reference.js';
import { loadMusicBoxReference, peekMusicBoxReference, createMusicBoxTransport } from './music-box-transport.js';

export { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS };
// These remain musical references for the bell response, not a replacement
// score synthesized over the real damaged instrument.
export const COASTAL_MEMORY_NOTES = Object.freeze([790, 830, 1038, 1107, 1246, 1405, 1563, 1658, 1862, 2085]);
export const COASTAL_MEMORY_BELLS = Object.freeze([207.65, 174.61]);
export const COASTAL_MEMORY_AUDIO_PROVENANCE = Object.freeze({
  kind: 'user-recorded-pcm', revision: 3, durationSeconds: COASTAL_MEMORY_SECONDS,
  file: MUSIC_BOX_REFERENCE.file,
  material: 'The same worn Sankyo music box playing Clair de lune in the opening and coast: supplied performance, fixed pitch and timing, no invented replacement notes or fault overlays.',
  provenance: 'assets/music-box/reference-performance.json',
  ambience: 'Procedural wind and distant sea placeholder; distinct from the recorded instrument.',
});
const airBuffers = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const offsetOf = v => ((Number.isFinite(v) ? v : 0) % COASTAL_MEMORY_SECONDS + COASTAL_MEMORY_SECONDS) % COASTAL_MEMORY_SECONDS;

// Synchronous inspection is deliberately nullable until the real asset has
// decoded. No synthesized tune is substituted while loading or after failure.
export function coastalMemoryRecordingBuffer(context) { return peekMusicBoxReference(context); }
export function loadCoastalMemoryRecording(context, options = {}) { return loadMusicBoxReference(context, options); }
export function coastalMusicBoxIntactBuffer(context) { return coastalMemoryRecordingBuffer(context); }
export const COASTAL_MUSIC_BOX_INTACT_LEAD = 0;
export const COASTAL_MUSIC_BOX_INTACT_SECONDS = MUSIC_BOX_REFERENCE.durationSeconds;

export function playCoastalMemoryRecording({ context, destination, when, gain = 1, loop = false, offset = 0, fetcher, urlFor } = {}) {
  const transport = createMusicBoxTransport({ context, destination, fetcher, urlFor, gain });
  if (!transport) return null;
  let stopped = false;
  transport.play({ offset: loop ? offsetOf(offset) : Math.max(0, Number.isFinite(offset) ? offset : 0), loop, when });
  const ready = transport.initialize();
  return {
    ready,
    get source() { return transport.source; },
    out: transport.out,
    get done() { return stopped || transport.sample().state === 'ended' || !!transport.error(); },
    sample: () => transport.sample(),
    stop() { if (stopped) return; stopped = true; transport.dispose(); },
    provenance: COASTAL_MEMORY_AUDIO_PROVENANCE,
  };
}

// Historical callers retain their names, but there is no healthy substitute:
// the worn sound is the narrative clue in both places.
export const playCoastalMusicBoxRecording = playCoastalMemoryRecording;
export const playCoastalMusicBoxIntact = playCoastalMemoryRecording;

function coastalAirBuffer(context) {
  if (airBuffers.has(context)) return airBuffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, rate * 4, rate);
  let seed = 0x53454131, slow = 0, drift = 0;
  for (let i = 0; i < buffer.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    slow += (noise - slow) * (1 - Math.exp(-650 / rate));
    drift += (noise - drift) * (1 - Math.exp(-38 / rate));
    const t = i / rate, edge = Math.sin(t / 4 * Math.PI) ** 2;
    buffer.getChannelData(0)[i] = (slow * .3 + drift * .45) * edge;
    buffer.getChannelData(1)[i] = (slow * .28 - drift * .4) * edge;
  }
  airBuffers.set(context, buffer); return buffer;
}

// The broken box is silent until somebody works its pin. This owner supplies
// the coastal wind/sea only; the handled owner supplies the actual performance
// and listening evidence. Authored tape playback above remains independent.
export function createCoastalMemoryAudio({ context, destination, layout } = {}) {
  if (!context || !destination || !layout?.musicBox) return null;
  const airGain = context.createGain(); airGain.gain.value = 0; airGain.connect(destination);
  let source = null, sourceAt = 0, airOffset = 0, paused = false, disposed = false, current = {};
  const target = value => airGain.gain.setTargetAtTime(value, context.currentTime, .3);
  function stop() {
    if (!source) return;
    airOffset = (airOffset + Math.max(0, context.currentTime - sourceAt)) % 4;
    try { source.stop(); } catch {} source.disconnect(); source = null;
  }
  function reconcile() {
    if (disposed) return false;
    const active = current.state?.active === true && current.state.status === 'active';
    const held = paused || current.paused || current.hidden || current.interrupted || current.renderReady === false;
    if (!active || held || context.state !== 'running') { stop(); target(0); return false; }
    if (!source) {
      source = context.createBufferSource(); source.buffer = coastalAirBuffer(context); source.loop = true;
      source.connect(airGain); sourceAt = context.currentTime; source.start(sourceAt, airOffset);
    }
    target(current.recorderHeld ? .016 : .024); return true;
  }
  function update(input = {}) {
    if (disposed) return false;
    current = { ...input }; return reconcile();
  }
  return {
    initialize(input = {}) { update(input); return Promise.resolve(!disposed); },
    update,
    sample() { return { audibleSeconds: 0, recordingOffset: offsetOf(current.state?.recordingOffset),
      sourceReady: false, audioRunning: false, left: 0, right: 0 }; },
    setPaused(value) { if (disposed) return; paused = !!value; reconcile(); },
    dispose() { if (disposed) return; disposed = true; stop(); airGain.disconnect(); },
  };
}
