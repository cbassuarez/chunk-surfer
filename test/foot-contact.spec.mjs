import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL } from '../src/data/floorplan/legend.js';
import { resolveFootContact, createFootContactClock, footContactGait } from '../src/audio/foot-contact.js';

test('code support selects stable field/path/fault without repurposing all sourceVoid', () => {
  for (const [materialId, tone] of [[MATERIAL.sourceField, 'field'], [MATERIAL.sourcePath, 'path'], [MATERIAL.sourceFault, 'fault']]) {
    assert.deepEqual([resolveFootContact({ materialId }).profile, resolveFootContact({ materialId }).tone], ['compiled', tone]);
  }
  assert.equal(resolveFootContact({ materialId: MATERIAL.sourceVoid }).profile, 'physical');
  assert.equal(resolveFootContact({ materialId: MATERIAL.sourceVoid, sourcePhase: 'horizon' }).profile, 'physical');
  assert.equal(resolveFootContact({ materialId: MATERIAL.sourceVoid, sourceDomain: 'nothing' }).profile, 'glazed');
  assert.equal(resolveFootContact({ horizon: { active: true, preTape: true, onTape: false } }).profile, 'physical');
  assert.equal(resolveFootContact({ horizon: { active: true, onTape: true } }).profile, 'erased');
  assert.equal(resolveFootContact({ sourceIV: true }).profile, 'glazed');
  assert.equal(resolveFootContact({ zone: 10 }).profile, 'physical');
});

test('remembered street, body, physical shore and station support win over Source metadata', () => {
  for (const input of [
    { sourceDomain: 'outskirts', expected: 'tarmac' },
    { busBody: { active: true }, expected: 'body' },
    { shore: { active: true, surface: 'lift' }, expected: 'metal' },
    { shore: { active: true, surface: 'bank' }, expected: 'stone' },
    { station: { world: 'whiteout' }, expected: 'snow' },
    { station: { world: 'flood' }, expected: 'water' },
    { station: { stage: 'ash-room' }, expected: 'ash' },
    { surface: { material: 'case-lining' }, expected: 'carpet' },
    { surface: { material: 'piano-wood' }, expected: 'wood' },
    { surface: { material: 'cold-stone' }, expected: 'stone' },
    { covering: 'paper', expected: 'paper' },
    { materialId: MATERIAL.sourcePage, expected: 'paper' },
  ]) {
    const value = resolveFootContact({ materialId: MATERIAL.sourceVoid, sourceMaterial: MATERIAL.sourceFault, nothingness: true, ...input });
    assert.equal(value.profile, 'physical', JSON.stringify(input));
    assert.equal(value.surface, input.expected, JSON.stringify(input));
  }
  assert.equal(resolveFootContact({ shore: { active: true, surface: 'void' } }).profile, 'glazed');
});

test('wetness and inactive scene flags do not accidentally replace the supporting floor', () => {
  assert.equal(resolveFootContact({ materialId: MATERIAL.wetTile }).wetness, 1);
  assert.equal(resolveFootContact({ surface: 'wood', wetness: 8 }).wetness, 1);
  assert.equal(resolveFootContact({ surface: 'wood', wetness: -1 }).wetness, 0);
  assert.equal(resolveFootContact({ surface: { material: 'piano-wood', wetness: .4 } }).wetness, .4);
  const value = resolveFootContact({ materialId: MATERIAL.sourcePath, busBody: { active: false }, station: { active: false, world: 'flood' }, horizon: { active: false, onTape: true } });
  assert.equal(value.profile, 'compiled');
});

const feed = (clock, seconds, speed, options = {}, dt = 1 / 60) => {
  const events = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) events.push(...clock.update({ dt, distance: speed * dt, scene: 'route', ...options }));
  return events;
};

test('accepted travel starts promptly then obeys gait time and distance, with one alternating plant each', () => {
  const clock = createFootContactClock({humanize:0});
  const events = feed(clock, 5, 1.5);
  assert.equal(events[0].at, 1 / 60);
  assert.ok(events.length >= 11 && events.length <= 12);
  events.forEach((event, i) => {
    assert.equal(event.plantIndex, i);
    assert.equal(event.footSide, i % 2 ? 'right' : 'left');
    if (i) assert.ok(Math.abs(event.at - events[i - 1].at - event.interval) <= 1/60 + 1e-8);
  });
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
});

test('11 m/s game travel remains a bounded fast gait rather than semantic-grid chatter', () => {
  const fast = feed(createFootContactClock({humanize:0}), 8, 11);
  assert.ok(fast.length >= 36 && fast.length <= 38, String(fast.length));
  assert.ok(fast.every((event, i) => !i || event.at - fast[i - 1].at >= .18));
  assert.ok(footContactGait(11).stride > footContactGait(1.5).stride);
  assert.ok(footContactGait(11).interval >= 1 / 4.8);
});

test('slow accepted motion still accumulates at high frame rates without a per-frame dead zone', () => {
  const slow = feed(createFootContactClock({humanize:0}), 8, .05, { careful: true }, 1 / 120);
  assert.ok(slow.length >= 2 && slow.length <= 4, String(slow.length));
  const a = feed(createFootContactClock({humanize:0}), 8, 1.5, {}, 1 / 60);
  const b = feed(createFootContactClock({humanize:0}), 8, 1.5, {}, 1 / 120);
  assert.ok(Math.abs(a.length - b.length) <= 1);
});

test('careful and injured travel reduces cadence without inventing supported travel', () => {
  const ordinary = feed(createFootContactClock({humanize:0}), 8, 1.5);
  const careful = feed(createFootContactClock({humanize:0}), 8, .45, { careful: true });
  const injured = feed(createFootContactClock({humanize:0}), 8, 1.5, { injury: 1 });
  assert.ok(careful.length < ordinary.length);
  assert.ok(injured.length < ordinary.length);
  const clock = createFootContactClock({humanize:0});
  for (const state of [{ distance: 0 }, { supported: false }, { accepted: false }, { active: false }, { paused: true }]) {
    assert.equal(feed(clock, 1, 1.5, state).length, 0);
  }
});

test('careful fast travel has an audible cadence distinction without changing accepted movement', () => {
  const ordinary = feed(createFootContactClock({humanize:0}), 8, 8);
  const careful = feed(createFootContactClock({humanize:0}), 8, 8, { careful: true });
  assert.ok(careful.length <= ordinary.length * .7, `${careful.length}/${ordinary.length}`);
  assert.ok(careful.every((event, i) => event.speed === 8 && event.interval >= 1 / 2.2
    && (!i || Math.abs(event.at - careful[i - 1].at - event.interval) <= 1/60 + 1e-8)));
});

test('injury alternates a modest weak-leg dwell, bounded by accepted travel and refractory timing', () => {
  const injured = feed(createFootContactClock({humanize:0}), 8, 3.2, { injury: 1 });
  const weak = injured.filter(event => event.footSide === 'left');
  const strong = injured.filter(event => event.footSide === 'right');
  assert.ok(weak[0].interval > strong[0].interval * 1.15);
  injured.forEach((event, i) => {
    if (i) {
      assert.ok(Math.abs(event.at - injured[i - 1].at - event.interval) <= 1/60 + 1e-8);
      assert.ok(event.at - injured[i - 1].at >= .18);
      assert.ok(Math.abs(event.distance - event.stride) <= event.speed/60 + 1e-8);
    }
  });
  const clock = createFootContactClock({humanize:0});
  feed(clock, .2, 3.2, { injury: 1 });
  assert.deepEqual(clock.update({ dt: 3, distance: 9.6, scene: 'route', injury: 1 }), []);
  assert.ok(clock.update({ dt: 1 / 60, distance: 3.2 / 60, scene: 'route', injury: 1 }).length <= 1);
});

test('pause, rejection, scene changes, warps and long frames discard accumulation instead of catching up', () => {
  const clock = createFootContactClock({humanize:0});
  feed(clock, .2, 1.5);
  assert.deepEqual(clock.update({ dt: .1, distance: 0, scene: 'other' }), []);
  assert.deepEqual(clock.update({ dt: .1, distance: 100, scene: 'other' }), []);
  assert.equal(clock.snapshot().reason, 'teleport');
  assert.deepEqual(clock.update({ dt: 4, distance: 12, scene: 'other' }), []);
  assert.equal(clock.snapshot().reason, 'hitch');
  assert.deepEqual(clock.update({ dt: .1, distance: .2, paused: true, scene: 'other' }), []);
  const resumed = clock.update({ dt: .1, distance: .2, scene: 'other' });
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].plantIndex, 0);
  assert.equal(clock.snapshot().travel, 0);
});

test('stationary looking, vertical transport and quick stop/reverse do not create extra plants', () => {
  const clock = createFootContactClock({humanize:0});
  assert.deepEqual(clock.update({ dt: .05, position: { x: 0, z: 0 }, scene: 'route' }), []);
  assert.equal(clock.update({ dt: .05, position: { x: .1, z: 0 }, scene: 'route' }).length, 1);
  assert.deepEqual(clock.update({ dt: .05, position: { x: .1, y: 10, z: 0 }, scene: 'route' }), []);
  assert.deepEqual(clock.update({ dt: .05, position: { x: 0, z: 0 }, scene: 'route' }), []);
  assert.deepEqual(clock.update({ dt: .05, position: { x: 0, z: 0 }, scene: 'route' }), []);
  assert.deepEqual(clock.update({ dt: .05, position: { x: .1, z: 0 }, scene: 'route' }), []);
});

test('explicit reset clears gait state and invalid inputs never produce catch-up bursts', () => {
  const clock = createFootContactClock({humanize:0});
  const before = feed(clock, 1, 11);
  clock.reset('route');
  assert.equal(clock.snapshot().plantIndex, 0);
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(clock.update({ dt, distance: .5, scene: 'route' }), []);
  const after = clock.update({ dt: .1, distance: 1.1, scene: 'route' });
  assert.equal(after.length, 1);
  assert.ok(after[0].id > before.at(-1).id);
  assert.equal(after[0].footSide, 'left');
  assert.equal(clock.update({ dt: .25, distance: 6.1, scene: 'route' }).length, 0);
});

test('calibrated gait retains its rate across display frame rates instead of losing a frame every plant', () => {
  for (const [speed, targetHz] of [[.45,1.25],[1.35,2.15],[1.8,2.45],[2.1,2.65],[5,3.5],[11.1,4.6]]) {
    const counts = [];
    for (const fps of [12,20,30,60,120]) {
      const events = feed(createFootContactClock({humanize:0}), 30, speed, {}, 1/fps);
      counts.push(events.length);
      const measured = (events.length - 1) / (events.at(-1).at - events[0].at);
      assert.ok(Math.abs(measured-targetHz) < .03, `${speed}m/s at${fps}fps: ${measured}Hz`);
      assert.ok(events.every((event,i)=>!i||event.at-events[i-1].at>=.14-1e-8));
    }
    assert.ok(Math.max(...counts)-Math.min(...counts)<=1, `${speed}m/s counts:${counts}`);
  }
});

test('acceleration changes the next cycle without waiting for a newly enlarged stride', () => {
  const clock = createFootContactClock({humanize:0}), before = feed(clock,2,1.8), after = feed(clock,2,11.1);
  assert.ok(after[0].at-before.at(-1).at < .4, 'acceleration must not leave a long silent glide');
  for (let i=2;i<after.length;i++) assert.ok(Math.abs(after[i].at-after[i-1].at-1/4.6)<1/60+1e-8);
});

test('a sustained low frame rate cannot bank a long burst of contact debt', () => {
  const clock=createFootContactClock({humanize:0});
  feed(clock,10,11.1,{},.25);
  assert.ok(clock.snapshot().cycle<=1);
  const recovery=feed(clock,1,11.1,{},1/120);
  assert.ok(recovery.length<=6,'frame recovery must not replay lost footfalls');
});
