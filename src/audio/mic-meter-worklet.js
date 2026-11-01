// Display-only microphone acquisition. One mono input, no outputs, no imports.
// The host uses the zero-output VU-meter topology from the Web Audio spec; the
// microphone is never connected to a speaker or to a silent destination branch.
class MicMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.window = new Float64Array(Math.max(1, Math.round(sampleRate * 0.1)));
    this.cursor = 0;
    this.power = 0;
    this.reportSamples = Math.max(1, Math.round(sampleRate / 60));
    this.sinceReport = 0;
    this.intervalPeak = 0;
    this.intervalClipped = false;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'stop') this.stopped = true;
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    // AudioWorkletNode explicitly down-mixes its selected input to mono, using
    // the same speaker interpretation as the gameplay analyser. No assumption
    // about the rendering quantum's length is made when samples are present.
    const input = inputs[0]?.[0];
    if (!input?.length) return true;
    for (let index = 0; index < input.length; index += 1) {
      const sample = Number.isFinite(input[index]) ? input[index] : 0;
      const square = sample * sample, absolute = Math.abs(sample);
      this.power += square - this.window[this.cursor];
      this.window[this.cursor] = square;
      this.cursor = (this.cursor + 1) % this.window.length;
      this.intervalPeak = Math.max(this.intervalPeak, absolute);
      this.intervalClipped ||= absolute >= 0.985;
      this.sinceReport += 1;
      if (this.sinceReport < this.reportSamples) continue;
      // Reports retain their AUDIO time. Queued reports after a main-thread
      // stall still deliver every interval's maximum in chronological order.
      const frame = currentFrame + index + 1;
      this.port.postMessage({
        type: 'mic-meter',
        rms: Math.sqrt(Math.max(0, this.power) / this.window.length),
        peak: this.intervalPeak,
        clipped: this.intervalClipped,
        audioTime: frame / sampleRate,
        frame,
        sampleRate,
        windowSamples: this.window.length,
        samples: this.sinceReport,
      });
      this.sinceReport = 0;
      this.intervalPeak = 0;
      this.intervalClipped = false;
    }
    return true;
  }
}

registerProcessor('chunk-surfer-mic-meter', MicMeterProcessor);
