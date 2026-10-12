// One fixed piece of recorded material: the snowed-in hall, a chair, two bell
// notes and the recorder being set down. Listening at the ash desk and later
// playing the received tape resolve the same PCM buffer. No new voice/body is
// attributed to the HUSH, and no catalogue guest is added to this recording.
export const TOWER_PERSONAL_TAKE = 'tower-personal-recording';
export const TOWER_PERSONAL_CUE = 'tower.personal.take';
export const TOWER_PERSONAL_SECONDS = 14;
export const TOWER_PERSONAL_BELLS = Object.freeze([196, 261.63]);
const buffers = new WeakMap();

export function towerPersonalRecordingLevel(seconds = 0) {
  const t = ((Number(seconds) || 0) % TOWER_PERSONAL_SECONDS + TOWER_PERSONAL_SECONDS) % TOWER_PERSONAL_SECONDS;
  return Math.min(.8, .075 + .12 * Math.exp(-Math.abs(t - 1.2) * 3)
    + .62 * Math.exp(-Math.max(0, t - 3.1) * .7) * (t >= 3.1 ? 1 : 0)
    + .54 * Math.exp(-Math.max(0, t - 7.4) * .7) * (t >= 7.4 ? 1 : 0));
}

export function towerPersonalRecordingBuffer(context) {
  if (buffers.has(context)) return buffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, Math.ceil(rate * TOWER_PERSONAL_SECONDS), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  let seed = 0x43535254, low = 0, air = 0;
  for (let i = 0; i < left.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, t = i / rate;
    low += (noise - low) * .006; air += (noise - air) * .12;
    let s = low * .055 + (noise - air) * .002 + Math.sin(t * Math.PI * 200) * .0015;
    // Cloth against the chair, then its wooden foot finding the boards.
    if (t > .65 && t < 1.8) s += air * .07 * Math.sin((t - .65) / 1.15 * Math.PI) ** 2;
    for (const [at, f] of [[1.3, 92], [11.7, 135]]) {
      const d = t - at;
      if (d >= 0 && d < .5) s += Math.sin(d * Math.PI * 2 * f) * Math.exp(-d * 32) * .08;
    }
    for (let note = 0; note < 2; note++) {
      const d = t - [3.1, 7.4][note];
      if (d < 0) continue;
      for (const [ratio, gain, decay] of [[.5,.3,2.6],[1,1,2.2],[1.19,.32,1.8],[1.5,.2,1.5],[2.51,.11,.85]]) {
        s += Math.sin(d * Math.PI * 2 * TOWER_PERSONAL_BELLS[note] * ratio)
          * gain * .055 * Math.exp(-d / decay) * Math.min(1, d * 180);
      }
    }
    const fade = Math.min(1, t / .15, (TOWER_PERSONAL_SECONDS - t) / .5);
    left[i] = s * fade; right[i] = (s * .96 + low * .006) * fade;
  }
  buffers.set(context, buffer);
  return buffer;
}

export function playTowerPersonalRecording({ context, destination, when, gain = 1, loop = false, offset = 0 } = {}) {
  if (!context || !destination) return null;
  const source = context.createBufferSource(), out = context.createGain();
  source.buffer = towerPersonalRecordingBuffer(context); source.loop = loop;
  out.gain.value = Math.max(0, Math.min(2, Number(gain) || 0));
  source.connect(out); out.connect(destination);
  source.start(Math.max(context.currentTime, when ?? context.currentTime), Math.max(0, offset) % TOWER_PERSONAL_SECONDS);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { source.stop(); } catch {} source.disconnect(); out.disconnect(); };
  source.onended = () => { if (!loop) stop(); };
  return { source, out, stop };
}
