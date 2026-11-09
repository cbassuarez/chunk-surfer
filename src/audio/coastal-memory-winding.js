// Player-handled playback of the same recorded Sankyo as the opening and
// coastal plinth. The mechanism owns wind/release; this owner follows its
// monotone reference clock. The former mislabelled per-note bank, reversed
// transport and bitcrushing are not part of this acoustic keepsake. Releases
// always carry the authored rake of real recorded comb attacks.
import { assetUrl } from '../platform/paths.js';
import { MUSIC_BOX_REFERENCE } from '../data/music-box-reference.js';
import { createMusicBoxTransport, createMusicBoxContacts } from './music-box-transport.js';

export const COASTAL_WINDING_AUDIO = Object.freeze({
  file: MUSIC_BOX_REFERENCE.file,
  durationSeconds: MUSIC_BOX_REFERENCE.durationSeconds,
  phraseGain: MUSIC_BOX_REFERENCE.gain,
  clickGain: .24,
  maxEncodedBytes: MUSIC_BOX_REFERENCE.maxEncodedBytes,
  maxDecodedSeconds: MUSIC_BOX_REFERENCE.maxDecodedSeconds,
});

export function createCoastalWindingAudio({ context, destination, fetcher, urlFor = assetUrl } = {}) {
  const transport = createMusicBoxTransport({ context, destination, fetcher, urlFor });
  const contacts = createMusicBoxContacts({ context, destination, fetcher, urlFor });
  let paused = true, disposed = false, input = {};
  let audible = 0, lastClock = context?.currentTime || 0, lastRunning = false;
  function settle() {
    const now = context?.currentTime || 0;
    const running = !paused && !disposed && !!transport?.sample().running;
    if (lastRunning && running && context.state === 'running') audible += Math.min(.25, Math.max(0, now - lastClock));
    lastClock = now; lastRunning = running;
  }
  function reconcile() {
    if (!transport || disposed) return false;
    const state = input.state || {};
    const playing = !paused && contacts.ready() && transport.ready() && state.phase === 'cranking' && state.playbackRate !== 0;
    const result = transport.sync({ position: Number.isFinite(state.playbackSeconds) ? state.playbackSeconds : 0, playing });
    const running = !paused && !!transport.sample().running;
    if (running !== lastRunning) lastClock = context.currentTime;
    lastRunning = running;
    return result;
  }
  return {
    async initialize() {
      if (disposed || !transport) return false;
      const [ready] = await Promise.all([transport.initialize(), contacts.initialize()]);
      if (disposed) return false;
      reconcile(); return ready && contacts.ready();
    },
    ready: () => !!transport?.ready() && !!contacts?.ready() && !disposed,
    error: () => transport?.error() || contacts?.error() || null,
    update(next = {}) {
      if (disposed || !transport) return false;
      settle();
      input = next;
      if (!paused) for (const event of next.events || []) {
        if (event.type === 'wind-click') contacts.play({ when: context.currentTime + Math.max(0, Number.isFinite(event.at) ? event.at : 0), gain: COASTAL_WINDING_AUDIO.clickGain });
        if (event.type === 'slam-start') contacts.playRelease({ when: context.currentTime + Math.max(0, Number.isFinite(event.at) ? event.at : 0), gain: .72 });
        if (event.type === 'handling-rattle' || event.type === 'shake') contacts.playRattle({ amount: event.amount ?? event.strength ?? .6 });
      }
      if (!paused && Number.isFinite(next.handlingRattle)) contacts.playRattle({ amount: next.handlingRattle });
      return reconcile();
    },
    rattle(amount = 1) { return !disposed && !paused && !!contacts?.playRattle({ amount }); },
    setPaused(value) {
      if (disposed || !transport) { if (value) contacts?.stop(); return; }
      settle();
      paused = !!value;
      if (paused) { transport.pause(); contacts.stop(); lastRunning = false; }
      // Fresh input after restoration decides whether the key is supported.
    },
    cancel() {
      paused = true; audible = 0; lastRunning = false;
      transport?.pause(); contacts?.stop();
    },
    sample() {
      settle();
      const sample = transport?.sample() || { ready: false, running: false, position: 0, seconds: MUSIC_BOX_REFERENCE.durationSeconds, state: 'unavailable' };
      const audibleSeconds = audible; audible = 0;
      const ready = sample.ready && !!contacts?.ready();
      return { ...sample, ready, error: sample.error || contacts?.error() || null, recordingOffset: sample.position, audibleSeconds,
        sourceReady: ready, audioRunning: (!paused && sample.running) || audibleSeconds > 0, left: 0, right: 0 };
    },
    dispose({ releaseTail = false } = {}) {
      if (disposed) return; disposed = true; audible = 0; lastRunning = false;
      transport?.dispose(); contacts?.dispose({ releaseTail });
    },
  };
}
