import { createSourceEarthfallAudio } from './source-earthfall.js';
import { sourceEarthfallFrame } from '../game/source-earthfall.js';
import { ENDING_WRONG_DOOR_OMEN, endingWrongDoorOmenFrame } from '../data/ending-wrong-door-omen.js';

// One chronology and one material source. The three shipped CC0 cuts and the
// first omen's same-source presence send are already shared by Earthfall. Do
// not layer another demolition controller, drift ambience or a second tail.
export function endingWrongDoorAudioFrame(value, presentation = {}) {
  const physical = value?.player && value?.anchors ? value : sourceEarthfallFrame(value);
  const omen = endingWrongDoorOmenFrame(physical, presentation);
  const namespace = String(presentation.endingReceiptNamespace || ENDING_WRONG_DOOR_OMEN.sequenceId);
  const sequenceId = `${namespace}:physical-omens`;
  const front = { x: 0, y: omen.flowHeight + 1,
    z: -6 - Math.min(24, Math.max(0, physical.elapsed - ENDING_WRONG_DOOR_OMEN.releaseAt) * 7) };
  return { ...physical, sequenceId, endingOmen: omen,
    anchors: { ...physical.anchors, front },
    events: physical.events.map(event => ({ ...event,
      id: `${sequenceId}:${physical.runId}:${event.type}` })),
  };
}

export function createEndingWrongDoorAudio({ getAudio = () => null, createAudio = createSourceEarthfallAudio, ...options } = {}) {
  let output = null, disposed = false, lastOmen = null;
  const disconnect = () => {
    if (!output) return;
    for (const node of [output.gain, output.filter]) { try { node.disconnect?.(); } catch {} }
    output = null;
  };
  function sourceBus() {
    if (disposed) return null;
    let pair; try { pair = getAudio(); } catch { return null; }
    const ctx = pair?.ctx || pair?.context, destination = pair?.destination;
    if (!ctx || !destination || ctx.state === 'closed') return null;
    if (output?.ctx !== ctx || output.destination !== destination) {
      disconnect();
      const gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      gain.gain.value = 1; filter.type = 'lowpass'; filter.frequency.value = Math.min(12000, ctx.sampleRate * .45); filter.Q.value = .25;
      gain.connect(filter); filter.connect(destination); output = { ctx, destination, gain, filter };
    }
    return { ctx, destination: output.gain };
  }
  const audio = createAudio({ ...options, getAudio: sourceBus });
  function zero() {
    if (!output) return;
    const { ctx, gain } = output; gain.gain.cancelScheduledValues?.(ctx.currentTime);
    if (gain.gain.setValueAtTime) gain.gain.setValueAtTime(0, ctx.currentTime); else gain.gain.value = 0;
  }
  function update(value, presentation = {}) {
    if (disposed) return snapshot();
    const frame = endingWrongDoorAudioFrame(value, presentation); lastOmen = frame.endingOmen;
    sourceBus();
    const protectedAudio = presentation.protected || presentation.suspended || presentation.hidden
      || presentation.focused === false || !frame.active
      || output && ['suspended', 'interrupted', 'closed'].includes(output.ctx.state);
    if (protectedAudio) zero();
    else if (output) {
      const { ctx, gain, filter } = output;
      const level = lastOmen.occupied ? .18 : 1, cutoff = lastOmen.occupied ? 480 : Math.min(12000, ctx.sampleRate * .45);
      if (gain.gain.setTargetAtTime) gain.gain.setTargetAtTime(level, ctx.currentTime, .08); else gain.gain.value = level;
      if (filter.frequency.setTargetAtTime) filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, .08); else filter.frequency.value = cutoff;
    }
    audio.update(frame, presentation);
    return snapshot();
  }
  function snapshot() {
    return { ...audio.snapshot?.(), endingOmen: lastOmen,
      treatment: 'one recorded support/body/contact chronology; same-source release send; finite-world occlusion',
      disposed, outputGain: output?.gain.gain.value ?? 0, outputCutoff: output?.filter.frequency.value ?? 0 };
  }
  function stop() { zero(); audio.stop?.(); }
  return { update, ready: () => disposed ? Promise.resolve(false) : audio.ready(), snapshot, stop,
    reset() { stop(); audio.reset?.(); lastOmen = null; },
    destroy() { if (disposed) return; stop(); disposed = true; audio.destroy?.(); disconnect(); },
  };
}
