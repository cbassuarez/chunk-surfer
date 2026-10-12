import { TOWER_PERSONAL_SECONDS, playTowerPersonalRecording } from './tower-personal-recording.js';

// This transport measures the signal it actually plays. Listening receipts use
// the AudioContext clock; the two meters use independent stereo PCM analysers.
export function createTowerPersonalMonitor({ context, destination, offset = 0,
  play = playTowerPersonalRecording } = {}) {
  if (!context || !destination) return null;
  const initialOffset = Math.max(0, Number(offset) || 0) % TOWER_PERSONAL_SECONDS;
  const recording = play({ context, destination, loop: true, offset: initialOffset });
  if (!recording) return null;
  const splitter = context.createChannelSplitter(2);
  const analysers = [context.createAnalyser(), context.createAnalyser()];
  const samples = analysers.map((analyser, channel) => {
    analyser.fftSize = 512;
    splitter.connect(analyser, channel);
    return new Float32Array(analyser.fftSize);
  });
  recording.out.connect(splitter);
  let last = context.currentTime, played = 0, stopped = false;
  function sample() {
    if (stopped) return { audibleSeconds: 0, recordingOffset: (initialOffset + played) % TOWER_PERSONAL_SECONDS, left: 0, right: 0 };
    const now = context.currentTime, delta = Math.max(0, now - last); last = now;
    const audibleSeconds = context.state === 'running' ? delta : 0;
    played += audibleSeconds;
    const level = context.state !== 'running' ? [0, 0] : analysers.map((analyser, channel) => {
      analyser.getFloatTimeDomainData(samples[channel]);
      let square = 0;
      for (const value of samples[channel]) square += value * value;
      return Math.min(1, Math.sqrt(square / samples[channel].length) * 18);
    });
    return { audibleSeconds, recordingOffset: (initialOffset + played) % TOWER_PERSONAL_SECONDS,
      left: level[0], right: level[1] };
  }
  return { sample, stop() {
    if (stopped) return;
    stopped = true; recording.stop(); splitter.disconnect();
    analysers.forEach((analyser) => analyser.disconnect());
  } };
}

// The first three places carry one finite, filtered appearance of the same
// master. It is spatial world sound, never a listening receipt or a second take.
export function createTowerPersonalWorldSignal({ context, destination, world = 'hall', offset = 0,
  play = playTowerPersonalRecording } = {}) {
  if (!context || !destination || typeof context.createStereoPanner !== 'function') return null;
  const filter = context.createBiquadFilter(), gain = context.createGain(), pan = context.createStereoPanner();
  filter.type = world === 'broadcast' ? 'bandpass' : 'lowpass';
  filter.frequency.value = world === 'broadcast' ? 1250 : world === 'tape' ? 2100 : 3300;
  filter.Q.value = world === 'broadcast' ? .55 : .7;
  gain.gain.value = 0; filter.connect(gain); gain.connect(pan); pan.connect(destination);
  const startOffset = Math.max(0, Math.min(TOWER_PERSONAL_SECONDS, Number(offset) || 0));
  const recording = play({ context, destination: filter, offset: startOffset, gain: .7 });
  if (!recording) { filter.disconnect(); gain.disconnect(); pan.disconnect(); return null; }
  let elapsed = 0, last = context.currentTime, stopped = false;
  return {
    position({ distance = 0, pan: bearing = 0 } = {}) {
      if (stopped) return;
      gain.gain.setTargetAtTime(.75 / (1 + Math.max(0, distance) ** 2 * .035), context.currentTime, .08);
      pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, bearing)), context.currentTime, .06);
    },
    sample() {
      const now = context.currentTime;
      if (!stopped && context.state === 'running') elapsed += Math.max(0, now - last);
      last = now;
      const at = Math.min(TOWER_PERSONAL_SECONDS, startOffset + elapsed);
      return { offset: at, finished: at >= TOWER_PERSONAL_SECONDS };
    },
    stop() {
      if (stopped) return;
      stopped = true; recording.stop(); filter.disconnect(); gain.disconnect(); pan.disconnect();
    },
  };
}

// The transfer's cloth and wooden contact are slices of the master material.
// Source scheduling keeps their captions attached to sounds that really occur.
export function playTowerPersonalContact({ context, destination, kind = 'wood',
  play = playTowerPersonalRecording } = {}) {
  if (context?.state !== 'running' || !destination) return null;
  const cloth = kind === 'cloth', recording = play({ context, destination, gain: .65, offset: cloth ? .65 : 11.7 });
  if (recording?.source) recording.source.stop(context.currentTime + (cloth ? 1.1 : .5));
  return recording;
}
