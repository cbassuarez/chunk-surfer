// The authored lighting rig.
//
// The conservatory's practicals used to be two hardcoded blocks inside main.js,
// keyed on render group, and seven of the nine spaces got an empty array. The
// lighting did not read as inconsistent so much as absent — there was nowhere to
// author any. This pins the contract of the table that replaced them.
//
// The specific bug this file exists to prevent: the natatorium ran at intensity
// 8.0–10.0 while the entire tower ran at 1.00–1.35, and nothing declared what
// class of source either was, so there was no way to tell whether 8.0 was a sky
// or a typo. It is a sky. Daylight through a failed roof genuinely is an order of
// magnitude above a fluorescent tube. Now every light declares its KIND and the
// bands are enforced, so a *fitting* at 8.0 fails here.

import assert from 'node:assert/strict';

import {
  LIGHT_BANDS,
  LIGHT_KIND,
  LIGHT_RIGS,
  LOCAL_LIGHT_SLOTS,
  allAuthoredLights,
  lightRigFor,
  resolveLocalLights,
} from '../src/data/conservatory-lights.js';

const lights = allAuthoredLights();
assert.ok(lights.length >= 16, 'the building has an authored rig');

// ── every light declares what it is, and stays inside that band ──────────────
for (const light of lights) {
  assert.ok(Object.values(LIGHT_KIND).includes(light.kind),
    `${light.id} declares a known kind (got ${light.kind})`);
  const [lo, hi] = LIGHT_BANDS[light.kind];
  assert.ok(light.intensity >= lo && light.intensity <= hi,
    `${light.id} is a ${light.kind} at ${light.intensity}, outside its band ${lo}..${hi}`);
  assert.ok(light.radius > 0, `${light.id} has a radius`);
  assert.equal(light.color.length, 3, `${light.id} has an rgb colour`);
  assert.ok(light.color.every((c) => c >= 0 && c <= 1), `${light.id} colour is 0..1`);
  for (const axis of ['x', 'z', 'y']) {
    assert.ok(Number.isFinite(light[axis]), `${light.id} has a finite ${axis}`);
  }
}

// The bands must not overlap into nonsense: an indicator can never out-shine a
// fitting, and a fitting can never reach a sky.
assert.ok(LIGHT_BANDS[LIGHT_KIND.INDICATOR][1] < LIGHT_BANDS[LIGHT_KIND.EMERGENCY][1]);
assert.ok(LIGHT_BANDS[LIGHT_KIND.EMERGENCY][1] < LIGHT_BANDS[LIGHT_KIND.FITTING][1]);
assert.ok(LIGHT_BANDS[LIGHT_KIND.FITTING][1] <= LIGHT_BANDS[LIGHT_KIND.SKY][1]);

// ── ids are unique per rig, because the renderer keys the shadow map off one ──
for (const [group, rig] of Object.entries(LIGHT_RIGS)) {
  const ids = rig.map((light) => light.id);
  assert.equal(new Set(ids).size, ids.length, `${group} has no duplicate light ids`);
}

// ── the values did not drift when they moved out of main.js ──────────────────
const byId = Object.fromEntries(lights.map((light) => [light.id, light]));
assert.equal(byId['natatorium-roof-spill-north'].intensity, 10.0);
assert.equal(byId['natatorium-roof-spill-north'].kind, LIGHT_KIND.SKY);
assert.equal(byId['academic-skylight-spill'].radius, 22);
assert.equal(byId['access-low'].intensity, 1.35);
assert.equal(byId['access-low'].kind, LIGHT_KIND.FITTING);
assert.equal(byId['academic-emergency-west'].kind, LIGHT_KIND.EMERGENCY);

// ── resolution: phase gate, flutter, circuits, slots ────────────────────────
const ground = resolveLocalLights('ground', { timeSec: 0 });
assert.equal(ground.length, 8, 'the ground rig fits the renderer exactly');
assert.deepEqual(resolveLocalLights('academic', { timeSec: 0 }).map((l) => l.id),
  ground.map((l) => l.id), 'the third floor shares the ground rig');
assert.deepEqual(resolveLocalLights('basement', { timeSec: 0 }), [],
  'a group with no authored rig is dark — deliberately, and visibly so in the table');
assert.equal(lightRigFor('chapel'), null);

// The tower's two exit lights appear only once it is cleared. This was the one
// piece of state-gated lighting the game already had; it must survive the move.
const towerDark = resolveLocalLights('tower', { timeSec: 0, towerCleared: false });
assert.equal(towerDark.length, 7);
assert.ok(!towerDark.some((l) => l.id === 'organ-exit'));
assert.equal(lightRigFor('tower').filter((l) => l.phase !== 'cleared' || true).length, 9,
  'the cleared tower authors nine lights for eight slots');
assert.ok(lightRigFor('tower').some((l) => l.id === 'organ-exit'));

// A cleared tower authors NINE lights and the renderer has EIGHT slots
// (`MAX_LOCAL_LIGHTS`, r3d.js:28 — the setter keeps `lights[0..7]` and silently
// drops the rest). The old inline rig pushed all nine in authored order, so
// `nave-exit` — the light over the nave exit door, in the ending — was authored
// and never rendered once. Resolving by distance is what fixes that: whichever
// eight you are nearest to are the eight you get.
const towerLit = resolveLocalLights('tower', { timeSec: 0, towerCleared: true, origin: { x: 100, z: 62 } });
assert.equal(towerLit.length, 8, 'never hand the renderer a ninth light');
const atTheNave = resolveLocalLights('tower', { timeSec: 0, towerCleared: true, origin: { x: 100.5, z: 82 } });
assert.ok(atTheNave.some((l) => l.id === 'nave-exit'),
  'standing at the nave exit, its own light is one of the eight');
// Nine authored, eight slots: exactly one yields, and it is the farthest from you
// (the belfry louvre, twenty-one metres back up the climb).
assert.equal(atTheNave.length, 8);
assert.ok(!atTheNave.some((l) => l.id === 'louvre-spill'),
  'and the farthest light up the climb yields its slot');

// The failing academic fitting flutters, and `flash !== 'full'` holds it steady —
// the accessibility behaviour the original rig had inline.
const failingAt = (timeSec, reducedFlash = false) => resolveLocalLights('ground', { timeSec, reducedFlash })
  .find((l) => l.id === 'academic-emergency-east-failing').intensity;
assert.equal(failingAt(0, true), .42, 'reduced flash pins it steady');
assert.equal(failingAt(9.1, true), .42);
assert.notEqual(failingAt(0.4), failingAt(1.9), 'and it moves when flash is full');
for (const t of [0, .3, 1.1, 2.7, 5.5, 9.9]) {
  const value = failingAt(t);
  const [lo, hi] = LIGHT_BANDS[LIGHT_KIND.EMERGENCY];
  assert.ok(value >= lo && value <= hi,
    `the flutter stays inside the emergency band at t=${t} (got ${value})`);
}

// Circuits: nothing authored needs mains yet, so every light survives an empty
// circuit set. When the breakers land in §3 this is the assertion that proves a
// dead circuit stays dark.
assert.equal(resolveLocalLights('ground', { timeSec: 0, liveCircuits: new Set() }).length, 8);
assert.ok(lights.every((light) => light.circuit === null),
  'no authored light depends on mains yet — sky and maintained fittings only');

// Slots: never hand the renderer more than it has, and prefer the nearest.
const crowded = resolveLocalLights('tower', {
  timeSec: 0, towerCleared: true, slots: 4, origin: { x: 100, z: 62 },
});
assert.equal(crowded.length, 4, 'the rig is clamped to the slot budget');
assert.ok(crowded.some((l) => l.id === 'access-low'), 'and keeps what you are standing next to');
assert.ok(!crowded.some((l) => l.id === 'nave-exit'), 'dropping what is far away');
assert.ok(LOCAL_LIGHT_SLOTS === 8);

console.log('lighting rig contracts passed');
