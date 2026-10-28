import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactExposurePlan, createContactExposurePlayer } from '../src/audio/contact-exposure.js';
import * as FEAR from '../src/audio/fear.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ ready = true, bufferDuration = 1.416 } = {}) {
  const sources = [], nodes = [];
  const param = () => ({
    calls: [],
    setValueAtTime(...args) { this.calls.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.calls.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.calls.push(['exponential', ...args]); },
    setTargetAtTime(...args) { this.calls.push(['target', ...args]); },
    cancelAndHoldAtTime(...args) { this.calls.push(['hold', ...args]); },
    cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); },
  });
  const node = kind => {
    const value = { kind, connections: [], disconnected: false,
      connect(destination) { this.connections.push(destination); },
      disconnect() { this.disconnected = true; },
    };
    nodes.push(value); return value;
  };
  let context = {
    currentTime: 10, state: 'running',
    createBufferSource() {
      const src = Object.assign(node('source'), { playbackRate: param(), starts: [], stops: [],
        start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); },
      });
      sources.push(src); return src;
    },
    createGain() { return Object.assign(node('gain'), { gain: param() }); },
    createBiquadFilter() { return Object.assign(node('filter'), { frequency: param() }); },
    createStereoPanner() { return Object.assign(node('panner'), { pan: param() }); },
  };
  let time = 20, destination = node('destination'), buffer = ready ? { duration: bufferDuration } : null;
  const decode = deferred();
  const player = createContactExposurePlayer({
    getContext: () => context, getDestination: () => destination,
    getBuffer: () => buffer, loadBuffer: () => decode.promise, nowSeconds: () => time,
  });
  return { player, sources, nodes, decode,
    get context() { return context; },
    setContext(value) { context = value; }, setDestination(value) { destination = value; },
    setBuffer(value) { buffer = value; }, advance(seconds, { audio = true } = {}) { time += seconds; if (audio) context.currentTime += seconds; },
  };
}

test('contact plan preserves actual lateral bearing, forward rate and bounded levels', () => {
  const right = contactExposurePlan({ bearing: Math.PI / 2, intensity: 1 });
  const left = contactExposurePlan({ bearing: -Math.PI / 2, intensity: 1 });
  assert.equal(right.pan, 1); assert.equal(left.pan, -1); assert.equal(right.rate, 1);
  assert.equal(contactExposurePlan({ pan: 12, bearing: -Math.PI / 2 }).pan, 1);
  assert.ok(right.peak <= .62, 'does not exceed the previous physical-contact gain');
  assert.ok(contactExposurePlan({ reduced: true }).peak < right.peak);
  for (const bad of [NaN, Infinity, -Infinity, 'noise']) {
    const plan = contactExposurePlan({ pan: bad, bearing: bad, intensity: bad, duration: bad });
    for (const key of ['pan', 'peak', 'rate', 'duration', 'cutoffHz']) assert.ok(Number.isFinite(plan[key]), key);
    assert.ok(plan.duration <= .72 && plan.duration >= .12);
  }
});

test('a ready contact has one forward voice and a real end within the scene bound', () => {
  const h = harness(); const owner = h.player.play({ eventId: 'taken:1', pan: -.7 });
  assert.equal(owner.state, 'playing'); assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].buffer.duration, 1.416);
  assert.deepEqual(h.sources[0].starts[0], [10, 0, .72]);
  assert.deepEqual(h.sources[0].playbackRate.calls[0], ['set', 1, 10]);
  assert.deepEqual(h.nodes.find(n => n.kind === 'panner').pan.calls[0], ['set', -.7, 10]);
  const envelope = h.nodes.find(n => n.kind === 'gain').gain.calls;
  assert.deepEqual(envelope.at(-1), ['linear', 0, 10.72]);
  h.sources[0].onended();
  assert.equal(owner.active, false); assert.equal(owner.state, 'ended');
  assert.ok(h.nodes.filter(n => n.kind !== 'destination').every(n => n.disconnected));
});

test('cancelled pending decode can never start after the scene has exited', async () => {
  const h = harness({ ready: false }); const owner = h.player.play({ eventId: 'taken:2' });
  owner.cancel(); h.decode.resolve({ duration: 1.416 }); await flush();
  assert.equal(owner.state, 'cancelled'); assert.equal(h.sources.length, 0);
});

test('a slow decode becomes quiet fallback instead of a delayed second attack', async () => {
  const h = harness({ ready: false }); const owner = h.player.play({ eventId: 'taken:3' });
  h.advance(.1); h.decode.resolve({ duration: 1.416 }); await flush();
  assert.equal(owner.state, 'expired'); assert.equal(h.sources.length, 0);
});

test('a suspended audio clock cannot hide decode lateness in real time', async () => {
  const h = harness({ ready: false }); const owner = h.player.play({ eventId: 'taken:4' });
  h.advance(.1, { audio: false }); h.decode.resolve({ duration: 1.416 }); await flush();
  assert.equal(owner.state, 'expired'); assert.equal(h.sources.length, 0);
});

test('a replacement event invalidates old pending work and stale onended cannot clear it', async () => {
  const h = harness({ ready: false }); const first = h.player.play({ eventId: 'hard:1' });
  h.setBuffer({ duration: 1.416 }); const second = h.player.play({ eventId: 'hard:2' });
  h.decode.resolve({ duration: 1.416 }); await flush();
  assert.equal(first.state, 'cancelled'); assert.equal(second.state, 'playing'); assert.equal(h.sources.length, 1);
  const third = h.player.play({ eventId: 'hard:3' });
  h.sources[0].onended(); assert.equal(third.state, 'playing'); assert.equal(h.player.active, true);
  assert.ok(h.sources[0].disconnected, 'replaced source releases its node graph');
});

test('same event identity never replays after cancellation or normal completion', () => {
  const h = harness(); const first = h.player.play({ eventId: 'taken:5' });
  first.cancel({ fade: 0 });
  assert.equal(h.player.play({ eventId: 'taken:5' }), first); assert.equal(h.sources.length, 1);
  const second = h.player.play({ eventId: 'taken:6' }); h.sources[1].onended();
  assert.equal(h.player.play({ eventId: 'taken:6' }), second); assert.equal(h.sources.length, 2);
});

test('cancel fade is short, idempotent and does not extend when called every frame', () => {
  const h = harness(); const owner = h.player.play({ eventId: 'hard:4' });
  owner.cancel({ fade: 8 }); const count = h.sources[0].stops.length;
  h.advance(.02); owner.cancel({ fade: 8 });
  assert.equal(owner.state, 'fading'); assert.equal(h.sources[0].stops.length, count);
  assert.equal(h.sources[0].stops.at(-1)[0], 10.06);
  h.sources[0].onended(); assert.equal(owner.state, 'cancelled'); assert.equal(owner.active, false);
});

test('optional protected audio stays quiet while a real physical contact remains available', () => {
  const h = harness();
  assert.equal(h.player.play({ eventId: 'optional:1', physical: false, protectedAudio: true }).state, 'protected');
  assert.equal(h.sources.length, 0);
  assert.equal(h.player.play({ eventId: 'physical:1', physical: true, protectedAudio: true }).state, 'playing');
  assert.equal(h.sources.length, 1);
  assert.equal(h.player.play({ eventId: 'muted:1', muted: true }).state, 'protected');
  assert.ok(h.sources[0].disconnected, 'entering a mute cancels the preceding owned contact');
});

test('focus/context loss before decode never routes a voice into a new audio owner', async () => {
  const h = harness({ ready: false }); const owner = h.player.play({ eventId: 'taken:7' });
  h.setContext({ currentTime: 10, state: 'running' }); h.decode.resolve({ duration: 1.416 }); await flush();
  assert.equal(owner.state, 'expired'); assert.equal(h.sources.length, 0);
  const suspended = harness(); suspended.context.state = 'suspended';
  assert.equal(suspended.player.play({ eventId: 'taken:8' }).state, 'unavailable');
  assert.equal(suspended.sources.length, 0);
});

test('failed decode, missing destination and invalid duration do not create orphan nodes', async () => {
  const h = harness({ ready: false }); const owner = h.player.play({ eventId: 'taken:9' });
  h.decode.reject(new Error('missing source')); await flush();
  assert.equal(owner.state, 'unavailable'); assert.equal(h.sources.length, 0);
  h.setDestination(null); assert.equal(h.player.play({ eventId: 'taken:10' }).state, 'unavailable');
  const invalid = harness({ bufferDuration: NaN });
  assert.equal(invalid.player.play({ eventId: 'taken:11' }).state, 'unavailable');
  assert.equal(invalid.sources.length, 0);
  assert.throws(() => invalid.player.play({}), /event identity/);
});

test('real fear wrapper preloads once and a cancelled cold contact cannot leak after decoding', async () => {
  const h = harness(), decoded = deferred(), originalFetch = globalThis.fetch, fetched = [];
  const hush = { duration: 1.416, numberOfChannels: 1, length: 3, sampleRate: 48000,
    getChannelData: () => Float32Array.from([.3, -.2, .1]),
  };
  h.context.decodeAudioData = bytes => new Uint8Array(bytes)[0] === 1 ? decoded.promise : Promise.resolve({ duration: 2 });
  h.context.createBuffer = (channels, length, rate) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate,
      getChannelData: channel => data[channel],
    };
  };
  globalThis.fetch = async url => {
    fetched.push(url);
    return { ok: true, arrayBuffer: async () => Uint8Array.from([url.includes('heartbeat') ? 0 : 1]).buffer };
  };
  try {
    FEAR.fearAudioInit(h.context, { id: 'fear-bus' });
    const pending = FEAR.playContactExposure({ eventId: 'wrapper:cold' });
    FEAR.cancelContactExposure({ fade: 0 });
    const preload = FEAR.preloadAll();
    decoded.resolve(hush); await preload; await flush();
    assert.equal(fetched.length, 2, 'heartbeat and hush are each fetched once despite concurrent preload/contact');
    assert.equal(pending.state, 'cancelled'); assert.equal(h.sources.length, 0);
    const ready = FEAR.playContactExposure({ eventId: 'wrapper:ready', pan: .4 });
    assert.equal(ready.state, 'playing'); assert.equal(h.sources[0].buffer, hush, 'uses the forward original, never reversed copy');
    FEAR.cancelContactExposure({ fade: 0 }); assert.equal(ready.state, 'cancelled');
    assert.ok(h.sources[0].disconnected);
  } finally {
    FEAR.cancelContactExposure({ fade: 0 }); FEAR.fearAudioInit(null, null);
    globalThis.fetch = originalFetch;
  }
});
