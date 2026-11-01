// node --experimental-vm-modules --test test/monitor-dual-trace-integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

if (!vm.SourceTextModule) throw new Error('Run with node --experimental-vm-modules --test');
const monitorSource = await readFile(new URL('../src/audio/monitor.js', import.meta.url), 'utf8');
const meterSource = await readFile(new URL('../src/audio/dual-trace.js', import.meta.url), 'utf8');
async function fixture(at = 10000) {
  const clock = { now: at };
  const context = vm.createContext({ console, performance: { now: () => clock.now } });
  const monitor = new vm.SourceTextModule(monitorSource, { context });
  const meter = new vm.SourceTextModule(meterSource, { context });
  await monitor.link(() => { throw new Error('Unexpected monitor dependency'); });
  await meter.link(() => { throw new Error('Unexpected meter dependency'); });
  await monitor.evaluate(); await meter.evaluate();
  return { monitor: monitor.namespace, meter: meter.namespace, clock };
}
function sound(levelDb, semantics = {}) {
  return { id: 'handling', kind: 'equipment', acoustic: { levelDb, durationMs: 300 },
    semantics: { playerGenerated: true, ...semantics } };
}
function close(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
}

test('an authored sound without a supplied timestamp is live now, then expires', async () => {
  const { monitor: m, clock } = await fixture();
  assert.equal(m.monitorObserveAcousticEvent(sound(-12)), true);
  close(m.monitorSnapshot(clock.now).rms, 10 ** (-12 / 20));
  close(m.monitorSnapshot(clock.now).hushDb, -12);
  clock.now += 301;
  assert.equal(m.monitorSnapshot(clock.now).rms, 0);
});

test('explicit time zero and valid zero dB both remain valid inputs', async () => {
  const { monitor: m } = await fixture();
  m.monitorObserveAcousticEvent(sound(0), 0);
  const result = m.monitorSnapshot(1);
  assert.equal(result.rms, 1);
  assert.equal(result.hushDb, 0);
  assert.equal(result.instantClipped, true);
  assert.equal(m.monitorSnapshot(301).rms, 0);
});

test('non-player and monitor-hidden sounds cannot drive the exposure instrument', async () => {
  const { monitor: m, clock } = await fixture();
  assert.equal(m.monitorObserveAcousticEvent(sound(-3, { playerGenerated: false })), false);
  assert.equal(m.monitorObserveAcousticEvent(sound(-3, { audibleToMonitor: false })), false);
  m.monitorObserveAcousticEvent(sound(-3, { audibleToHush: false }));
  assert.equal(m.monitorSnapshot(clock.now).rms, 0);
});

test('proximity remains display-only while the raw room input drives HUSH', async () => {
  const { monitor: m, clock } = await fixture();
  m.monitorSetAuxInput(() => ({ rms: .01, peak: .04, clipped: false }));
  m.monitorSetPresenceInput(() => .8);
  const result = m.monitorSnapshot(clock.now);
  close(result.rms, Math.hypot(.8, .01));
  close(result.hushRms, .01);
  close(result.hushDb, -40);
  assert.equal(result.hushBand, 'normal');
  assert.equal(result.band, 'hot');
});

test('audible game output remains an echo reference rather than meter input', async () => {
  const { monitor: m, clock } = await fixture();
  let connected = false;
  const node = { getFloatTimeDomainData(buffer) { buffer.fill(.8); }, connect() { connected = true; } };
  m.monitorInit({ createAnalyser: () => node }, {});
  assert.equal(connected, true);
  close(m.monitorProgramMeasurement().rms, .8, 1e-6);
  assert.equal(m.monitorSnapshot(clock.now).rms, 0);
});

test('Dual trace reads instantaneous evidence without stacking the legacy hold', async () => {
  const { monitor: m, meter } = await fixture(0);
  const display = meter.createDualTraceMeter();
  m.monitorInject({ rms: .05, peak: .8 });
  display.push(m.monitorSnapshot(0), 0);
  m.monitorInject({ rms: .01, peak: .01 });
  const early = m.monitorSnapshot(100);
  close(early.peakDb, 20 * Math.log10(.8));
  close(early.instantPeakDb, -40);
  for (let at = 20; at <= 1500; at += 20) display.push(m.monitorSnapshot(at), at);
  close(display.read(1500).peakDb, 20 * Math.log10(.8) - 6, 1e-6);
});

test('the microphone adapter preserves prepared metering and independent peak evidence', async () => {
  const { monitor: m, meter } = await fixture();
  const model = meter.createDualTraceMeter();
  model.push({ rms: .1, peak: .8, integrated: true, peakKind: 'sample' }, 1000);
  const prepared = model.read(1050);
  const result = m.monitorSnapshotForMeasurement({ rms: .1, peak: .8, clipped: false,
    available: true, dualTrace: prepared });
  close(result.db, -20);
  close(result.instantPeakDb, 20 * Math.log10(.8));
  assert.equal(result.dualTrace, prepared);
  assert.equal(result.peakKind, 'sample');
  assert.equal(result.unit, 'dBFS');
  assert.equal(result.sourceId, 'room-mic');
  assert.equal(meter.dualTraceSnapshot('another-view', result, 1050), prepared);
});

test('clip annunciation does not change the RMS measurement or HUSH evidence', async () => {
  const { monitor: m, meter } = await fixture();
  const model = meter.createDualTraceMeter();
  for (let at = 0; at <= 1000; at += 10) {
    m.monitorInject({ rms: .05, peak: at === 1000 ? 1 : .1, clipped: at === 1000 });
    model.push(m.monitorSnapshot(at), at);
  }
  const display = model.read(1000), raw = m.monitorSnapshot(1000);
  assert.equal(display.clipped, true);
  assert.ok(display.db < -25 && display.db > -27);
  assert.ok(display.segments48 < 48);
  close(raw.hushDb, 20 * Math.log10(.05));
  assert.equal(raw.segments, 12, 'legacy snapshots retain their existing contract');
});

test('a quiet measurement interval can have a peak below the rolling RMS window', async () => {
  const { monitor: m, meter } = await fixture();
  const result = m.monitorSnapshotForMeasurement({ rms: .99, peak: .1, clipped: false,
    available: true, integrated: true });
  close(result.peak, .1);
  close(result.peakDb, -20);
  close(result.instantPeakDb, -20);
  assert.equal(result.clipped, false);
  assert.equal(result.instantClipped, false);
  const model = meter.createDualTraceMeter();
  model.push(result, 0);
  close(model.read(30).peakDb, -20);
  assert.equal(model.read(30).clipped, false);
});

test('unavailable microphone snapshots clear prepared display state explicitly', async () => {
  const { monitor: m, meter } = await fixture();
  const available = m.monitorSnapshotForMeasurement({ rms: .5, peak: .9, available: true });
  meter.dualTraceSnapshot('input', available, 0);
  const absent = m.monitorSnapshotForMeasurement({ rms: 0, peak: 0, available: false });
  const result = meter.dualTraceSnapshot('input', absent, 30);
  assert.equal(result.available, false);
  assert.equal(result.segments48, 0);
  assert.equal(result.peakDb, -96);
});
