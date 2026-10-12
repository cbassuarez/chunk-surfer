import test from 'node:test';
import assert from 'node:assert/strict';
import { createTowerPersonalMonitor, createTowerPersonalWorldSignal, playTowerPersonalContact } from '../src/audio/tower-personal-monitor.js';

function monitorFixture() {
  const nodes = [], connections = [], plays = [];
  const context = { currentTime: 4, state: 'running', createChannelSplitter() {
    const node = { connect(target, channel) { connections.push([target, channel]); }, disconnect() { this.disconnected = true; } }; nodes.push(node); return node;
  }, createAnalyser() {
    const channel = nodes.length - 1;
    const node = { fftSize: 0, getFloatTimeDomainData(samples) { samples.fill(channel === 0 ? .025 : .01); }, disconnect() { this.disconnected = true; } }; nodes.push(node); return node;
  } };
  const out = { connect(target) { connections.push([target]); } };
  const recording = { out, stops: 0, stop() { this.stops++; } };
  const monitor = createTowerPersonalMonitor({ context, destination: {}, offset: 13.5,
    play(options) { plays.push(options); return recording; } });
  return { context, nodes, connections, recording, monitor, plays };
}

test('the monitor plays the fixed master from the saved offset and measures each stereo channel', () => {
  const h = monitorFixture();
  assert.equal(h.plays[0].offset, 13.5); assert.equal(h.plays[0].loop, true);
  const frame = h.monitor.sample();
  assert.ok(Math.abs(frame.left - .45) < 1e-6);
  assert.ok(Math.abs(frame.right - .18) < 1e-6);
  assert.equal(frame.audibleSeconds, 0);
  assert.deepEqual(h.connections.slice(0, 2).map((connection) => connection[1]), [0, 1]);
});

test('listening and tape position follow the audio clock, including wrap and suspension', () => {
  const h = monitorFixture(); h.context.currentTime += .75;
  assert.deepEqual(h.monitor.sample(), { audibleSeconds: .75, recordingOffset: .25,
    left: h.monitor.sample().left, right: h.monitor.sample().right });
  h.context.state = 'suspended'; h.context.currentTime += 3;
  const silent = h.monitor.sample();
  assert.equal(silent.audibleSeconds, 0); assert.equal(silent.left, 0); assert.equal(silent.right, 0);
  assert.equal(h.monitor.sample().recordingOffset, .25);
  h.context.state = 'running'; h.context.currentTime += .125;
  const resumed = h.monitor.sample();
  assert.equal(resumed.audibleSeconds, .125); assert.equal(resumed.recordingOffset, .375);
});

test('stopping tears down analyser connections exactly once and leaves no audible time or level', () => {
  const h = monitorFixture(); h.monitor.stop(); h.monitor.stop();
  h.context.currentTime += 20;
  assert.equal(h.recording.stops, 1); assert.ok(h.nodes.every((node) => node.disconnected));
  assert.deepEqual(h.monitor.sample(), { audibleSeconds: 0, recordingOffset: 13.5, left: 0, right: 0 });
});

function spatialFixture() {
  const nodes = [], plays = [];
  const parameter = () => ({ value: 0, targets: [], setTargetAtTime(...args) { this.targets.push(args); } });
  const node = () => { const n = { connect() {}, disconnect() { this.disconnections = (this.disconnections || 0) + 1; } }; nodes.push(n); return n; };
  const context = { currentTime: 7, state: 'running',
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
    createGain: () => ({ ...node(), gain: parameter() }),
    createStereoPanner: () => ({ ...node(), pan: parameter() }) };
  let stops = 0;
  const play = (options) => { plays.push(options); return { stop() { stops++; }, source: { stop: (when) => plays.push({ stopAt: when }) } }; };
  return { context, nodes, plays, play, get stops() { return stops; } };
}

test('spatial world sound reuses the master at a saved offset with source-relative level and pan', () => {
  const h = spatialFixture();
  const signal = createTowerPersonalWorldSignal({ context: h.context, destination: {}, world: 'broadcast', offset: 2.75, play: h.play });
  assert.equal(h.plays[0].offset, 2.75); assert.equal(h.plays[0].loop, undefined);
  assert.equal(h.plays[0].destination.type, 'bandpass');
  assert.equal(h.plays[0].destination.frequency.value, 1250);
  signal.position({ distance: 3, pan: .8 });
  const gain = h.plays[0].destination;
  assert.equal(gain.type, 'bandpass');
  h.context.currentTime += 1.25;
  assert.deepEqual(signal.sample(), { offset: 4, finished: false });
  h.context.state = 'suspended'; h.context.currentTime += 8;
  assert.deepEqual(signal.sample(), { offset: 4, finished: false });
  h.context.state = 'running'; h.context.currentTime += 12;
  assert.deepEqual(signal.sample(), { offset: 14, finished: true });
  signal.stop(); signal.stop(); assert.equal(h.stops, 1);
});

test('handover contacts play actual cloth and wood fragments from the same fixed master', () => {
  const h = spatialFixture();
  playTowerPersonalContact({ context: h.context, destination: {}, kind: 'cloth', play: h.play });
  assert.equal(h.plays[0].offset, .65); assert.equal(h.plays[1].stopAt, 8.1);
  playTowerPersonalContact({ context: h.context, destination: {}, kind: 'wood', play: h.play });
  assert.equal(h.plays[2].offset, 11.7); assert.equal(h.plays[3].stopAt, 7.5);
  h.context.state = 'suspended';
  assert.equal(playTowerPersonalContact({ context: h.context, destination: {}, play: h.play }), null);
  assert.equal(h.plays.length, 4, 'suspended contact sounds are dropped instead of scheduled after resume');
});
