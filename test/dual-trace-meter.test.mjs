// node --experimental-vm-modules --test test/dual-trace-meter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

if (typeof vm.SourceTextModule !== 'function') throw new Error('Run Node with --experimental-vm-modules');
const filename = new URL('../src/audio/dual-trace.js', import.meta.url);
const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), { identifier: filename.href });
await module.link(() => { throw new Error('The shared meter must remain dependency-free'); });
await module.evaluate();
const { createDualTraceMeter, dualTraceSnapshot, resetDualTraceMeters, DUAL_TRACE_CONFIG: C } = module.namespace;

function close(actual, expected, tolerance = 1e-7, message = '') {
  assert(Math.abs(actual - expected) <= tolerance, `${message} expected ${expected}, received ${actual}`);
}

function integrated(db, extras = {}) {
  return { db, integrated: true, available: true, ...extras };
}

function drive(meter, db, from, to, step = 10, extras = {}) {
  for (let at = from; at < to - 1e-7; at += step) meter.push(integrated(db, extras), at);
  return meter.read(to);
}

function measurePcm(samples) {
  let power = 0, peak = 0;
  for (const sample of samples) { power += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  return { rms: Math.sqrt(power / samples.length), peak, clipped: peak >= 1 };
}

test('100 ms PCM energy and an independent 1 ms transient peak stay distinct', () => {
  const pcm = new Float64Array(4800);
  for (let i = 0; i < 48; i += 1) pcm[i] = 0.9 * Math.sin(2 * Math.PI * i / 48);
  const measurement = measurePcm(pcm);
  const meter = createDualTraceMeter();
  meter.push({ ...measurement, integrated: true, peakKind: 'sample' }, 0);
  const value = meter.read(100);
  close(value.db, 10 * Math.log10(measurement.rms ** 2 * (1 - Math.exp(-100 / 30))));
  close(value.peakDb, 20 * Math.log10(measurement.peak));
  assert(value.peakDb - value.db > 20, 'The sample peak must not be replaced by averaged energy');
  assert(value.segments48 < 30);
  assert.equal(value.peakKind, 'sample');
});

test('raw power receives a full 100 ms energy window; integrated input is not averaged twice', () => {
  const raw = createDualTraceMeter();
  const ready = createDualTraceMeter();
  raw.push({ rms: 1, peak: 1 }, 0);
  ready.push({ rms: 1, peak: 1, integrated: true }, 0);
  // A 100 ms boxcar on a step ramps linearly. This is the analytic response of
  // the subsequent 30 ms power-domain one-pole at the end of that ramp.
  const rampPower = 1 - 30 / 100 * (1 - Math.exp(-100 / 30));
  close(raw.read(100).db, 10 * Math.log10(rampPower), 0.001);
  close(ready.read(100).db, 10 * Math.log10(1 - Math.exp(-100 / 30)));
  assert(raw.read(100).db < ready.read(100).db - 1);
});

test('power attack and 14 dB/s fall agree at 30, 60, and 120 updates per second', () => {
  const results = [];
  for (const fps of [30, 60, 120]) {
    const meter = createDualTraceMeter();
    const attack = drive(meter, -12, 0, 1000, 1000 / fps);
    meter.push(integrated(-96), 1000);
    const falling = drive(meter, -96, 1000 + 1000 / fps, 2000, 1000 / fps);
    results.push({ attack, falling });
    close(attack.db, -12, 1e-10);
    close(falling.db, -26, 1e-7);
  }
  for (const result of results.slice(1)) {
    close(result.attack.db, results[0].attack.db);
    close(result.falling.db, results[0].falling.db);
    assert.equal(result.falling.segments48, results[0].falling.segments48);
    assert.equal(result.falling.segments24, results[0].falling.segments24);
  }
});

test('raw 100 ms integration is independent of 30/60/120 Hz display cadence', () => {
  const readings = [];
  for (const fps of [30, 60, 120]) {
    const meter = createDualTraceMeter();
    for (let frame = 0; frame < fps / 10; frame += 1) meter.push({ db: -12 }, frame * 1000 / fps);
    readings.push(meter.read(100).db);
  }
  for (const reading of readings) close(reading, readings[0], 0.001);
});

test('attack uses power, rather than interpolating decibels or RMS amplitude', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-20), 0);
  close(meter.read(30).db, -20 + 10 * Math.log10(1 - Math.exp(-1)));
  assert(meter.read(30).db > -23);
});

test('reads never renew peak or clip holds, including after a long frame stall', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-40, { peakDb: -3, clipped: true, peakKind: 'sample' }), 0);
  for (let at = 10; at <= 990; at += 10) close(meter.read(at).peakDb, -3);
  close(meter.read(1000).peakDb, -3);
  close(meter.read(1500).peakDb, -9);
  close(meter.read(2000).peakDb, -15);
  assert.equal(meter.read(1999).clipped, true);
  assert.equal(meter.read(2000).clipped, false);
  const longStall = meter.read(60000);
  assert.equal(longStall.db, -96);
  assert.equal(longStall.peakDb, -96);
  assert.equal(longStall.clipped, false);
  assert.equal(longStall.available, false);
  assert.equal(longStall.segments48, 0);
});

test('a genuinely new equal peak refreshes its hold; lower peaks do not', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-40, { peakDb: -3 }), 0);
  meter.push(integrated(-40, { peakDb: -20 }), 500);
  close(meter.read(1250).peakDb, -6);
  meter.push(integrated(-40, { peakDb: -3 }), 900);
  close(meter.read(1800).peakDb, -3);
  close(meter.read(2000).peakDb, -4.2);
});

test('sample-peak input is not raised to an already-integrated RMS value', () => {
  const meter = createDualTraceMeter();
  const value = meter.push({ rms: 0.8, peak: 0.1, integrated: true, peakKind: 'sample' }, 0);
  close(value.peakDb, -20);
  assert.equal(value.clipped, false);
});

test('instantaneous legacy fields bypass their existing 650 ms peak and clip holds', () => {
  const meter = createDualTraceMeter();
  const value = meter.push(integrated(-40, { peakDb: 0, clipped: true, instantPeakDb: -30, instantClipped: false }), 0);
  assert.equal(value.peakDb, -30);
  assert.equal(value.clipped, false);
});

test('a clip latch does not force RMS, peak evidence, or lit cells to full scale', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-40, { peakDb: -2, clipped: true, peakKind: 'sample' }), 0);
  const value = meter.read(100);
  assert.equal(value.clipped, true);
  assert(value.db < -40);
  assert.equal(value.peakDb, -2);
  assert(value.segments48 < 10);
  assert(value.segments24 < 6);
});

test('48-cell and 24-cell banks have 0.6 dB release hysteresis', () => {
  const meter = createDualTraceMeter();
  const lit = drive(meter, -23.9, 0, 1000);
  assert.equal(lit.segments48, 25);
  assert.equal(lit.segments24, 13);
  const hovering = drive(meter, -24.3, 1000, 2000);
  close(hovering.db, -24.3);
  assert.equal(hovering.segments48, 25);
  assert.equal(hovering.segments24, 13);
  const released = drive(meter, -24.7, 2000, 3000);
  assert.equal(released.segments48, 24);
  assert.equal(released.segments24, 12);
  assert.equal(released.counts[48], released.segments48);
  assert.equal(released.counts[24], released.segments24);
});

test('silence and readings at or below -48 never leave a phantom cell', () => {
  const meter = createDualTraceMeter();
  for (const db of [-96, -60, -48]) {
    meter.reset();
    const value = drive(meter, db, 0, 1000);
    assert.equal(value.segments48, 0);
    assert.equal(value.segments24, 0);
  }
  meter.reset();
  drive(meter, -47.9, 0, 1000);
  const falling = drive(meter, -48.1, 1000, 2000);
  assert.equal(falling.segments48, 0, 'The bottom cell must clear even inside its ordinary hysteresis band');
  assert.equal(falling.segments24, 0);
});

test('numeric values update at 8 Hz while the physical bar continues moving', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-12, { peakDb: -3 }), 0);
  assert.equal(meter.read(124).numericDb, -96);
  const tick = meter.read(125);
  close(tick.numericDb, tick.db);
  const between = meter.read(140);
  assert.equal(between.numericDb, tick.numericDb);
  assert.notEqual(between.db, tick.db);
  meter.push(integrated(-6, { peakDb: 0 }), 140);
  assert.equal(meter.read(249).numericPeakDb, -3);
  assert.equal(meter.read(250).numericPeakDb, 0);
  assert(meter.read(250).numericDb > tick.numericDb);
});

test('display projections do not alter a later packet with an earlier audio timestamp', () => {
  const projected = createDualTraceMeter();
  const untouched = createDualTraceMeter();
  for (const meter of [projected, untouched]) meter.push(integrated(-30, { peakDb: -20 }), 0);
  projected.read(5000);
  projected.read(100);
  for (const meter of [projected, untouched]) meter.push(integrated(-10, { peakDb: -5 }), 150);
  const actual = projected.read(200);
  const expected = untouched.read(200);
  for (const field of ['db', 'peakDb', 'numericDb', 'numericPeakDb', 'segments48', 'segments24']) close(actual[field], expected[field]);
});

test('stale input falls away; a single read does not integrate an entire long gap as live input', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-12), 0);
  assert.equal(meter.read(C.staleAfterMs).available, true);
  assert.equal(meter.read(C.staleAfterMs + 1).available, false);
  close(meter.read(1250).db, -12 + 10 * Math.log10(1 - Math.exp(-250 / 30)) - 14);
  meter.push(integrated(-96), 2000);
  assert(meter.read(2000).db < -36, 'An uncapped gap must release the old reading');
});

test('source, device, and channel changes clear body, peak, numeric, and clipping state', () => {
  for (const field of ['sourceId', 'deviceId', 'channelMode']) {
    const meter = createDualTraceMeter();
    meter.push(integrated(-1, { [field]: 'before', peakDb: 0, clipped: true }), 0);
    const next = meter.push(integrated(-60, { [field]: 'after', peakDb: -60 }), 100);
    assert.equal(next.db, -96);
    assert.equal(next.numericDb, -96);
    assert.equal(next.peakDb, -60);
    assert.equal(next.clipped, false);
    assert.equal(next.segments48, 0);
  }
});

test('availability loss clears immediately, including within the same timestamp', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-1, { peakDb: 0, clipped: true }), 100);
  const stopped = meter.push({ available: false }, 100);
  assert.equal(stopped.available, false);
  assert.equal(stopped.db, -96);
  assert.equal(stopped.peakDb, -96);
  assert.equal(stopped.clipped, false);
  meter.reset();
  assert.equal(meter.read(1000).numericDb, -96);
});

test('invalid values remain finite and unavailable; authored levels remain labelled as levels', () => {
  const meter = createDualTraceMeter();
  for (const input of [null, {}, { rms: NaN, peak: Infinity }, { db: -Infinity }, { rms: null }]) {
    const value = meter.push(input, 0);
    for (const field of ['db', 'peakDb', 'numericDb', 'numericPeakDb']) assert(Number.isFinite(value[field]));
    assert.equal(value.available, false);
  }
  const authored = meter.push(integrated(-20), 1);
  assert.equal(authored.peakKind, 'level');
  assert.equal(authored.available, true);
});

test('duplicate and out-of-order packets do not replace newer measurements or renew their holds', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-30, { peakDb: -3 }), 100);
  meter.push(integrated(-40, { peakDb: -20 }), 200);
  const before = meter.read(200);
  meter.push(integrated(0, { peakDb: 0, clipped: true }), 200);
  meter.push(integrated(0, { peakDb: 0, clipped: true }), 150);
  assert.equal(meter.read(200).db, before.db);
  assert.equal(meter.read(200).peakDb, -3);
  assert.equal(meter.read(200).clipped, false);
  close(meter.read(1600).peakDb, -9);
});

test('renderer adapter passes an already-metered microphone snapshot through unchanged', () => {
  const meter = createDualTraceMeter();
  meter.push(integrated(-20, { peakKind: 'sample' }), 0);
  const prepared = meter.read(100);
  assert.equal(dualTraceSnapshot('prepared', { dualTrace: prepared, db: 0, clipped: true }, 100), prepared);
});

test('duplicate timestamps and repeated snapshot objects never prolong retained peaks', () => {
  resetDualTraceMeters();
  const original = { ...integrated(-40, { peakDb: -3, clipped: true }), timestampMs: 0 };
  dualTraceSnapshot('timestamped', original, 0);
  for (const at of [100, 500, 900, 1200]) dualTraceSnapshot('timestamped', { ...original }, at);
  close(dualTraceSnapshot('timestamped', { ...original }, 1500).peakDb, -9);
  const retained = integrated(-40, { peakDb: -3 });
  dualTraceSnapshot('retained', retained, 0);
  dualTraceSnapshot('retained', retained, 900);
  close(dualTraceSnapshot('retained', retained, 1500).peakDb, -9);
});

test('explicit advancing timestamps remain fresh even when a producer reuses its object', () => {
  resetDualTraceMeters();
  const object = { ...integrated(-30, { peakDb: -3 }), timestampMs: 0 };
  dualTraceSnapshot('reuse', object, 0);
  object.timestampMs = 900;
  dualTraceSnapshot('reuse', object, 900);
  close(dualTraceSnapshot('reuse', object, 1500).peakDb, -3);
});

test('renderer sources are isolated and can be reset separately', () => {
  resetDualTraceMeters();
  dualTraceSnapshot('loud', integrated(-1, { peakDb: 0, clipped: true }), 0);
  const quiet = dualTraceSnapshot('quiet', integrated(-60, { peakDb: -60 }), 0);
  assert.equal(quiet.peakDb, -60);
  assert.equal(quiet.clipped, false);
  resetDualTraceMeters('loud');
  const fresh = dualTraceSnapshot('loud', integrated(-40, { peakDb: -40 }), 10);
  assert.equal(fresh.db, -96);
  assert.equal(fresh.peakDb, -40);
  assert.equal(fresh.clipped, false);
  const stillQuiet = dualTraceSnapshot('quiet', integrated(-60, { peakDb: -60 }), 100);
  assert(stillQuiet.db < -60 && stillQuiet.db > -61);
});
