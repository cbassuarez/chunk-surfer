import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSourceEarthfall, sourceEarthfallFrame } from '../src/game/source-earthfall.js';
import { endingWrongDoorFlowHeight } from '../src/data/ending-wrong-door-omen.js';
import { endingWrongDoorAudioFrame, createEndingWrongDoorAudio } from '../src/audio/ending-wrong-door.js';
import { freshEndingWrongDoorDemolition, endingWrongDoorDemolitionFrame } from '../src/game/ending-wrong-door.js';

const physical = (elapsed = 4.3, extra = {}) => ({ ...freshSourceEarthfall({ runId: 'ending-run' }),
  committed: true, committedAt: 0, clock: elapsed, elapsed, phase: elapsed < 3 ? 'fracturing' : 'falling',
  feet: endingWrongDoorFlowHeight(elapsed), z: -3,
  receipts: [{ id: 'ordinary-source:strain', type: 'strain', at: 0, position: { x: 0, y: 100, z: -14 }, gain: .52 }], ...extra });
const param = (value = 0) => ({ value, calls: [], setValueAtTime(v, time) { this.value = v; this.calls.push(['set', v, time]); },
  setTargetAtTime(v, time, duration) { this.value = v; this.calls.push(['target', v, time, duration]); }, cancelScheduledValues() {} });
const node = () => ({ connections: [], connect(other) { this.connections.push(other); return other; }, disconnect() { this.disconnected = true; this.connections = []; } });

function fixture() {
  const gains = [], filters = [], calls = [], lifecycle = [];
  const ctx = { state: 'running', currentTime: 4.3, sampleRate: 48000,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createBiquadFilter() { const n = { ...node(), frequency: param(), Q: {} }; filters.push(n); return n; } };
  const destination = node(); let available = true, factories = 0, bus;
  const owner = createEndingWrongDoorAudio({ getAudio: () => available ? { ctx, destination } : null,
    createAudio(options) { factories++; bus = options.getAudio; return {
      async ready() { return !!bus(); },
      update(frame, presentation) { calls.push({ frame, presentation, bus: bus() }); }, snapshot: () => ({ controller: 'one-material-chronology' }),
      stop() { lifecycle.push('stop'); }, reset() { lifecycle.push('reset'); }, destroy() { lifecycle.push('destroy'); },
    }; } });
  return { owner, ctx, destination, gains, filters, calls, lifecycle, factories: () => factories,
    unavailable() { available = false; } };
}

test('ending accepts raw physical and outer ending frames without changing their clocks or checkpoints', () => {
  const raw = physical(), original = JSON.stringify(raw), normalized = sourceEarthfallFrame(raw);
  const a = endingWrongDoorAudioFrame(raw), b = endingWrongDoorAudioFrame(normalized);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(raw), original);
  assert.equal(a.elapsed, normalized.elapsed); assert.equal(a.clock, normalized.clock);
  assert.deepEqual(a.events[0].position, normalized.events[0].position);
  const outer = freshEndingWrongDoorDemolition({ runId: 'outer' });
  outer.physical = { ...physical(), runId: outer.physical.runId };
  const frame = endingWrongDoorDemolitionFrame(outer), adapted = endingWrongDoorAudioFrame(frame);
  assert.equal(adapted.runId, 'outer'); assert.equal(adapted.elapsed, frame.elapsed);
  assert.ok(adapted.events.every(e => !e.id.includes('ordinary-source')));
});

test('each ending has its own sound receipts and a world-fixed release front under listener movement', () => {
  const raw = physical(), a = endingWrongDoorAudioFrame(raw, { endingReceiptNamespace: 'ending:one' });
  const b = endingWrongDoorAudioFrame({ ...raw, x: 35, z: -30, yaw: 2, pitch: 1 }, { endingReceiptNamespace: 'ending:two' });
  assert.notEqual(a.events[0].id, b.events[0].id); assert.notEqual(a.sequenceId, b.sequenceId);
  assert.deepEqual(a.anchors.front, b.anchors.front);
  assert.equal(a.anchors.front.y, endingWrongDoorFlowHeight(raw.elapsed) + 1);
  assert.ok(a.anchors.front.z < -6);
});

test('one existing material controller owns every update; no independent loop or duplicate collapse is introduced', async () => {
  const f = fixture(); assert.equal(await f.owner.ready(), true); assert.equal(f.factories(), 1);
  f.owner.update(physical()); f.owner.update(physical(5.3)); f.owner.update(physical(9, { phase: 'landed', feet: 0 }));
  assert.equal(f.factories(), 1); assert.equal(f.calls.length, 3);
  assert.equal(f.calls[0].bus.destination, f.gains[0]); assert.equal(f.gains[0].connections[0], f.filters[0]);
  assert.equal(f.filters[0].connections[0], f.destination);
  assert.equal(f.gains.length, 1); assert.equal(f.filters.length, 1);
  assert.equal(f.owner.snapshot().controller, 'one-material-chronology');
});

test('the same finite world occupation muffles its material and releases on the actual landing', () => {
  const f = fixture(), visible = f.owner.update(physical(4.3));
  assert.equal(visible.outputGain, 1); assert.equal(visible.outputCutoff, 12000); assert.equal(visible.endingOmen.occupied, false);
  const consumed = f.owner.update(physical(5.3));
  assert.equal(consumed.outputGain, .18); assert.equal(consumed.outputCutoff, 480); assert.equal(consumed.endingOmen.occupied, true);
  const outside = f.owner.update(physical(5.3, { x: 110 }));
  assert.equal(outside.outputGain, 1); assert.equal(outside.endingOmen.occupied, false);
  const landed = f.owner.update(physical(9, { phase: 'landed', feet: 0 }));
  assert.equal(landed.outputGain, 1); assert.equal(landed.endingOmen.occupied, false);
});

test('protection, focus, context suspension, exit and disposal cut the ending output immediately', () => {
  for (const presentation of [{ protected: true }, { suspended: true }, { hidden: true }, { focused: false }]) {
    const f = fixture(); f.owner.update(physical()); const muted = f.owner.update(physical(5.3), presentation);
    assert.equal(muted.outputGain, 0); assert.equal(f.gains[0].gain.calls.at(-1)[0], 'set');
    assert.equal(f.calls.at(-1).presentation, presentation, 'normal material controller receives all receipt/protection gates');
  }
  const f = fixture(); f.owner.update(physical()); f.ctx.state = 'interrupted'; assert.equal(f.owner.update(physical()).outputGain, 0);
  f.ctx.state = 'running'; f.owner.update(physical()); f.owner.stop(); assert.equal(f.owner.snapshot().outputGain, 0);
  f.owner.destroy(); assert.equal(f.owner.snapshot().disposed, true); assert.ok(f.gains[0].disconnected && f.filters[0].disconnected);
  const before = f.calls.length; f.owner.update(physical()); assert.equal(f.calls.length, before);
  assert.deepEqual(f.lifecycle, ['stop', 'stop', 'destroy']);
});
