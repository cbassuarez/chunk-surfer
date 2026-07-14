// Data-driven Web Audio cue renderer shared by the game-facing adapter and the
// Narrative Studio. It never mutates source audio files.

export function createCuePlayer({ context, destination, loadBuffer, buses = {} } = {}) {
  const active = new Map();
  const output = (name) => buses[name] || destination || context?.destination;

  async function play(cue, assets, { seed = Math.random, gainScale = 1 } = {}) {
    if (!context || !cue) return null;
    if (cue.concurrency === 'replace') stop(cue.id, cue.stopFadeMs || 40);
    const handles = [];
    for (const layer of cue.layers || []) {
      const asset = assets.get ? assets.get(layer.assetId) : assets[layer.assetId];
      if (!asset || asset.kind === 'procedural') continue;
      const buffer = await loadBuffer(asset);
      if (!buffer) continue;
      const now = context.currentTime + Math.max(0, Number(layer.delay || 0));
      const source = context.createBufferSource();
      source.buffer = buffer;
      const jitter = (range, fallback) => Array.isArray(range)
        ? Number(range[0]) + seed() * (Number(range[1]) - Number(range[0])) : fallback;
      source.playbackRate.setValueAtTime(jitter(layer.playbackRateRange, Number(layer.playbackRate ?? 1)), now);
      source.detune?.setValueAtTime(jitter(layer.detuneRange, Number(layer.detune ?? 0)), now);
      source.loop = !!layer.loop;
      const gain = context.createGain();
      const target = Math.max(0, jitter(layer.gainRange, Number(layer.gain ?? 1)) * gainScale);
      const fadeIn = Math.max(0, Number(layer.fadeIn || 0));
      gain.gain.setValueAtTime(fadeIn ? 0 : target, now);
      if (fadeIn) gain.gain.linearRampToValueAtTime(target, now + fadeIn);
      let tail = gain;
      let panner = null;
      const panValue = jitter(layer.panRange, Number(layer.pan ?? 0));
      if (context.createStereoPanner && panValue) {
        panner = context.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), now);
        gain.connect(panner); tail = panner;
      }
      source.connect(gain); tail.connect(output(layer.bus || cue.bus || 'sfx'));
      const start = Math.max(0, Number(layer.trimStart || 0));
      const available = Math.max(0, buffer.duration - start);
      const requested = layer.trimEnd != null ? Math.max(0, Number(layer.trimEnd) - start) : available;
      const duration = Math.min(available, requested);
      source.start(now, start, source.loop ? undefined : duration);
      if (!source.loop && layer.fadeOut && duration > Number(layer.fadeOut)) {
        gain.gain.setValueAtTime(target, now + duration - Number(layer.fadeOut));
        gain.gain.linearRampToValueAtTime(0, now + duration);
      }
      const handle = { source, gain, nodes: [source, gain, panner].filter(Boolean) };
      source.onended = () => disconnect(handle);
      handles.push(handle);
    }
    active.set(cue.id, handles);
    return { cueId: cue.id, handles, stop: (fadeMs = 30) => stop(cue.id, fadeMs) };
  }

  function disconnect(handle) {
    for (const node of handle.nodes) { try { node.disconnect(); } catch (_) {} }
  }

  function stop(cueId, fadeMs = 30) {
    const handles = active.get(cueId) || [];
    const now = context?.currentTime || 0;
    for (const handle of handles) {
      try {
        handle.gain.gain.cancelScheduledValues(now);
        handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
        handle.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        handle.source.stop(now + fadeMs / 1000 + .01);
      } catch (_) {}
    }
    active.delete(cueId);
  }

  return { play, stop, stopAll: () => [...active.keys()].forEach((id) => stop(id)) };
}
