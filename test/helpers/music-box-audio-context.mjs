export function musicBoxContext({ duration = 46.3 } = {}) {
  const nodes = [], sources = [], destination = { kind: 'destination' };
  const param = value => ({ value, targets: [], setTargetAtTime(next, at, tau) { this.value = next; this.targets.push({ value: next, at, tau }); } });
  function node(kind, extra = {}) {
    const item = { kind, connects: [], disconnected: false,
      connect(to, output) { this.connects.push({ to, output }); return to; }, disconnect() { this.disconnected = true; }, ...extra };
    nodes.push(item); return item;
  }
  const ctx = { sampleRate: 8000, currentTime: 0, state: 'running', destination, nodes, sources,
    decodes: 0,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: i => data[i] };
    },
    createBufferSource() { const source = node('source', { starts: [], stops: 0, playbackRate: param(1),
      start(at, offset = 0) { this.starts.push({ at, offset }); }, stop() { this.stops++; } }); sources.push(source); return source; },
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('filter', { frequency: param(0), Q: param(0) }),
    createStereoPanner: () => node('pan', { pan: param(0) }),
    createChannelSplitter: () => node('splitter'),
    createAnalyser: () => node('analyser', { fftSize: 0, getFloatTimeDomainData(data) { data.fill(.03); } }),
    decodeAudioData(bytes) { this.decodes++; const name = String(bytes?.assetName);
      const seconds = name.includes('release-tonal-slip') ? .62 : name.includes('handling-rattle') ? .6 : duration;
      const buffer = this.createBuffer(2, Math.round(this.sampleRate * seconds), this.sampleRate); buffer.assetName = name;
      return Promise.resolve(buffer); },
  };
  return ctx;
}
export const musicBoxFetcher = async url => ({ ok: true, arrayBuffer: async () => { const buffer = new ArrayBuffer(1024); buffer.assetName = String(url); return buffer; } });
export const musicBoxUrl = value => value;
export const flushAudio = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
