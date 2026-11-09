// The same worn Sankyo reference is heard here and on the coast. Turning the
// key manually supports the recorded performance. Letting go stops it; the
// broken winding recoils instead of providing a healthy spring-driven tune.
// The recording carries its actual irregularities. We add no invented fault.
import { assetUrl } from '../platform/paths.js';
import { createMusicBoxTransport, createMusicBoxContacts } from './music-box-transport.js';
import { freshWinding, stepWinding, windingKeyAngle } from '../game/coastal-memory/winding.js';

export function createCabMusicBoxAudio({ context, destination, fetcher, resolve = assetUrl } = {}) {
  if (!context || !destination) return null;
  const transport = createMusicBoxTransport({ context, destination, fetcher, urlFor: resolve, gain: .55 });
  const contacts = createMusicBoxContacts({ context, destination, fetcher, urlFor: resolve });
  let winding = freshWinding(), held = false, paused = false, disposed = false;
  let lastUpdate = context.currentTime;
  let readyPromise = null;
  function initialize() {
    if (disposed) return Promise.resolve(false);
    if (!readyPromise) readyPromise = Promise.all([transport.initialize(), contacts.initialize()])
      .then(([ready]) => ready && contacts.ready()).finally(() => { readyPromise = null; });
    return readyPromise;
  }
  function apply(dt) {
    if (disposed || paused) return false;
    // Decoding is not spring motion: a cold first interaction loses no opening.
    const canAdvance = transport.ready() && contacts.ready();
    const result = stepWinding(winding, { held, turn: held ? 1.4 : 0 }, canAdvance ? dt : 0);
    winding = result.state;
    for (const event of result.events) {
      if (event.type === 'wind-click') contacts.play({ gain: .24 });
      if (event.type === 'slam-start') contacts.playRelease({ gain: .72 });
    }
    transport.sync({ position: winding.playbackSeconds || 0, playing: winding.phase === 'cranking' && winding.playbackRate !== 0 && canAdvance });
    return true;
  }
  function hold() {
    if (disposed) return false;
    held = true; void initialize(); apply(1 / 60); return true;
  }
  function release() {
    if (disposed) return false;
    held = false; void initialize(); apply(1 / 60); return true;
  }
  function cancel() {
    if (disposed) return false;
    held = false;
    winding = { ...winding, phase: 'rest', held: false, wind: 0, playbackRate: 0 };
    transport.pause(); contacts.stop(); return true;
  }
  return {
    initialize, hold, release, cancel,
    update(dt) {
      const elapsed = Number.isFinite(dt) ? dt : Math.max(0, context.currentTime - lastUpdate);
      lastUpdate = context.currentTime;
      return apply(Math.max(0, Math.min(.25, elapsed)));
    },
    shake(amount = 1) { return !disposed && !paused && contacts.playRattle({ amount }); },
    setPaused(value) {
      if (disposed) return;
      paused = !!value;
      if (paused) cancel();
    },
    ready: () => transport.ready() && contacts.ready(),
    error: () => transport.error() || contacts.error(),
    sample() { return { ...transport.sample(), ready: transport.ready() && contacts.ready(), error: transport.error() || contacts.error(),
      keyAngle: windingKeyAngle(winding), winding: { ...winding }, held, paused }; },
    stop() { if (disposed) return; disposed = true; held = false; transport.dispose(); contacts.dispose(); },
    dispose() { this.stop(); },
  };
}
