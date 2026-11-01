// Self-contained: Vite emits this module as an AudioWorklet asset. It has no
// relative imports, timers, renderer dependencies or playback-rate transposition.
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const finite = value => typeof value === 'number' && Number.isFinite(value);

export class HeartbeatCore {
  constructor(rate = 48000, report = () => {}) {
    this.rate = rate; this.report = report; this.clips = []; this.banks = { slow: [], fast: [] };
    this.bags = { slow: [], fast: [] }; this.last = { slow: -1, fast: -1 };
    this.running = false; this.paused = false; this.target = 0; this.level = 0; this.gain = 0;
    this.family = 'slow'; this.nextFrame = null; this.voice = null; this.lastEndFrame = null;
    this.frame = 0; this.serial = 0; this.resyncs = 0; this.seed = 0x68757274; this.wander = 0;
    this.stopRemaining = 0; this.stopFrames = 0; this.stopGain = 0; this.configured = false;
    this.alpha = 1 - Math.exp(-1 / (this.rate * .72));
    this.gainAlpha = 1 - Math.exp(-1 / (this.rate * .085));
  }
  random() {
    this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  configure(clips) {
    if (!Array.isArray(clips) || clips.length < 2 || clips.length > 24) throw Error('Heartbeat requires a bounded paired-performance bank.');
    let bytes = 0;
    const prepared = clips.map((clip, index) => {
      const pcm = clip.pcm instanceof Float32Array ? clip.pcm : new Float32Array(clip.pcm || []);
      const rate = Number(clip.sampleRate), duration = pcm.length / rate;
      bytes += pcm.byteLength;
      if (!['slow', 'fast'].includes(clip.family) || !finite(rate) || rate < 16000 || rate > 192000
        || !pcm.length || duration > 1.2 || bytes > 32 * 1024 * 1024) throw Error('Invalid heartbeat paired-performance buffer.');
      const first = Number(clip.firstPeakSeconds), second = Number(clip.secondPeakSeconds);
      if (!(first >= 0 && second > first && second < duration)) throw Error('Heartbeat paired landmarks must lie inside the complete performance.');
      return { id: String(clip.id || index), family: clip.family, pcm, sampleRate: rate,
        duration, firstPeakSeconds: first, secondPeakSeconds: second };
    });
    const banks = { slow: [], fast: [] };
    prepared.forEach((clip, index) => banks[clip.family].push(index));
    if (!banks.slow.length || !banks.fast.length) throw Error('Heartbeat needs both slow and fast paired performances.');
    this.clips = prepared; this.banks = banks; this.bytes = bytes;
    this.bags = { slow: [], fast: [] }; this.last = { slow: -1, fast: -1 };
    this.voice = null; this.nextFrame = null; this.configured = true;
    this.report({ type: 'ready', clips: prepared.length, bytes });
  }
  command(message = {}) {
    if (message.type === 'pressure') { this.target = clamp(message.level, 0, 1); return; }
    if (message.type === 'start') {
      if (!this.running) { this.running = true; this.nextFrame = null; this.stopRemaining = 0; }
      return;
    }
    if (message.type === 'pause') {
      const paused = !!message.paused;
      if (paused !== this.paused) { this.voice = null; this.nextFrame = null; this.gain = 0; }
      this.paused = paused; return;
    }
    if (message.type === 'stop') {
      this.running = false; this.nextFrame = null;
      this.stopFrames = this.stopRemaining = Math.round(clamp(message.fadeSeconds, 0, 1.5) * this.rate);
      this.stopGain = this.gain;
      if (!this.stopRemaining) { this.voice = null; this.gain = 0; }
      return;
    }
    if (message.type === 'dispose') {
      this.running = false; this.voice = null; this.nextFrame = null; this.gain = 0;
      this.clips = []; this.banks = { slow: [], fast: [] }; this.bytes = 0; this.configured = false;
    }
  }
  choose(family) {
    let bag = this.bags[family];
    if (!bag.length) {
      bag = [...this.banks[family]];
      for (let index = bag.length - 1; index > 0; index--) {
        const other = Math.floor(this.random() * (index + 1));
        [bag[index], bag[other]] = [bag[other], bag[index]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === this.last[family]) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.bags[family] = bag;
    }
    const index = bag.pop(); this.last[family] = index; return this.clips[index];
  }
  plant(frame) {
    if (this.family === 'slow' && this.level >= .58) this.family = 'fast';
    else if (this.family === 'fast' && this.level <= .42) this.family = 'slow';
    const clip = this.choose(this.family);
    this.wander = this.wander * .76 + (this.random() * 2 - 1) * .24;
    const period = Math.max(.94 - .40 * this.level, clip.duration + .038) * (1 + this.wander * .016);
    // A complete pair owns its slot; no overlap or debt repayment is necessary.
    const intervalFrames = Math.max(Math.ceil((clip.duration + .025) * this.rate), Math.round(period * this.rate));
    this.voice = { clip, startFrame: frame };
    this.nextFrame = frame + intervalFrames;
    const event = { type: 'cycle', serial: ++this.serial, id: clip.id, family: clip.family,
      time: frame / this.rate, firstPeakAt: frame / this.rate + clip.firstPeakSeconds,
      secondPeakAt: frame / this.rate + clip.secondPeakSeconds,
      interval: intervalFrames / this.rate, durationSeconds: clip.duration,
      level: this.level, playbackRate: 1, voices: 1 };
    this.report(event);
  }
  render(output, startFrame = this.frame) {
    output.fill(0);
    if (!this.configured) { this.frame = startFrame + output.length; return; }
    // Real rendering uses a continuous audio clock. A replacement/discontinuous
    // test clock may never replay all cycles missed while it was absent.
    if (this.lastEndFrame !== null && startFrame !== this.lastEndFrame) {
      this.voice = null; this.nextFrame = null; this.resyncs++;
      this.report({ type: 'clock-resync', time: startFrame / this.rate, resyncs: this.resyncs });
    }
    if (this.paused) {
      this.lastEndFrame = startFrame + output.length; this.frame = this.lastEndFrame; return;
    }
    for (let index = 0; index < output.length; index++) {
      const frame = startFrame + index;
      this.level += (this.target - this.level) * this.alpha;
      const targetGain = this.running ? this.level * this.level : 0;
      if (this.stopRemaining > 0) {
        this.gain = this.stopGain * (this.stopRemaining / Math.max(1, this.stopFrames));
        this.stopRemaining--;
        if (!this.stopRemaining) { this.voice = null; this.gain = 0; }
      } else this.gain += (targetGain - this.gain) * this.gainAlpha;
      if (this.running && this.target > .0001 && this.level > .001) {
        if (this.nextFrame === null) this.nextFrame = frame + Math.round(.025 * this.rate);
        if (frame >= this.nextFrame) this.plant(frame);
      } else if (!this.running || (this.target <= .0001 && this.level <= .001)) this.nextFrame = null;
      const voice = this.voice;
      if (!voice) continue;
      const position = (frame - voice.startFrame) * voice.clip.sampleRate / this.rate;
      const at = Math.floor(position);
      if (at >= voice.clip.pcm.length) { this.voice = null; continue; }
      const amount = position - at;
      const value = voice.clip.pcm[at] * (1 - amount) + (voice.clip.pcm[at + 1] || 0) * amount;
      output[index] = value * this.gain;
    }
    this.lastEndFrame = startFrame + output.length; this.frame = this.lastEndFrame;
  }
  snapshot() {
    return { frame: this.frame, time: this.frame / this.rate, level: this.level, gain: this.gain,
      running: this.running, paused: this.paused, family: this.family, cycles: this.serial,
      active: !!(this.running && !this.paused && this.target > .0001 && this.level > .001),
      resyncs: this.resyncs, voices: this.voice ? 1 : 0, clips: this.clips.length, bytes: this.bytes || 0 };
  }
}

const BaseProcessor = typeof AudioWorkletProcessor === 'undefined' ? class {} : AudioWorkletProcessor;
class HeartbeatProcessor extends BaseProcessor {
  constructor() {
    super();
    this.disposed = false; this.lastReport = 0;
    this.core = new HeartbeatCore(sampleRate, message => this.port.postMessage(message));
    this.port.onmessage = ({ data }) => {
      try {
        if (data?.type === 'configure') this.core.configure(data.clips);
        else this.core.command(data);
        if (data?.type === 'dispose') this.disposed = true;
      } catch (error) { this.port.postMessage({ type: 'error', message: String(error.message || error) }); }
    };
  }
  process(inputs, outputs) {
    if (this.disposed) return false;
    const output = outputs[0]?.[0];
    if (!output) return true;
    this.core.render(output, currentFrame);
    for (let channel = 1; channel < outputs[0].length; channel++) outputs[0][channel].set(output);
    if (currentFrame - this.lastReport >= sampleRate / 25) {
      this.lastReport = currentFrame;
      this.port.postMessage({ type: 'status', ...this.core.snapshot() });
    }
    return true;
  }
}
if (typeof registerProcessor === 'function') registerProcessor('chunk-surfer-heartbeat', HeartbeatProcessor);
