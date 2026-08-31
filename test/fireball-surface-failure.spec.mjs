import assert from 'node:assert/strict';
import { createPersonalizedWindowEffects, FIREBALL_SURFACE_LABELS } from '../src/platform/personalized-window-effects.js';
import { createFireballExchange } from '../src/game/fireball-exchange.js';
import { compileFireballCastPlan } from '../src/game/window-channel.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const STAGE = Object.freeze({ x: .06, y: .34, w: .88, h: .3 });

function harness({ failing = [], reject = true, listen = false } = {}) {
  const surfaces = new Map();
  const calls = [];
  const dispatched = [];
  let constructed = 0;
  let onHit = null;
  class Surface {
    static async getByLabel(label) {
      if (failing.includes(label)) {
        if (reject) throw new Error(`${label} denied`);
        return null;
      }
      return surfaces.get(label) || null;
    }
    constructor(label) {
      constructed += 1;
      if (surfaces.has(label)) throw new Error(`a window with label ${label} already exists`);
      this.label = label;
      if (!failing.includes(label)) surfaces.set(label, this);
    }
    once(_event, cb) { cb(); }
    async hide() { calls.push(['hide', this.label]); }
    async close() { surfaces.delete(this.label); }
  }
  const failures = [];
  const effects = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: Surface,
      invoke: async (command, payload) => {
        calls.push([command, command === 'chunk_fireball_cast_step'
          ? payload.casts.map((cast) => `${cast.index}@${cast.progress.toFixed(2)}`).join(',')
          : payload?.label]);
        return command === 'chunk_fireball_cast_step' ? payload.casts.length : true;
      },
      emitTo: async (label, _event, payload) => { calls.push(['emitTo', `${label}:${payload.state}`]); return true; },
      listen: async (name, cb) => { if (listen && name === 'fireball-cast-hit') onHit = cb; return () => {}; },
    },
    onSurfaceReport: (report) => { if (report.state !== 'ready') failures.push(report); },
    documentApi: listen ? { defaultView: { CustomEvent, dispatchEvent: (event) => dispatched.push(event) } } : null,
  });
  return { effects, surfaces, calls, failures, dispatched, hit: () => onHit, constructed: () => constructed };
}

const plan = (rayCount, extra = {}) => ({
  schema: 2, kind: 'fireball-cast', castId: 'fireball:hall:seated:0:abcdef', battleId: 'hall',
  state: 'outbound', rayCount, reducedMotion: false, travelSeconds: 2.2, damage: null, stage: STAGE,
  rays: Array.from({ length: rayCount }, (_, index) => ({
    id: `ray-${index + 1}`, surfaceIndex: index, directionSign: 1,
    origin: { x: .5, y: .28 }, direction: { x: 1, y: 0 }, exit: { x: 1, y: .5 }, beyond: { x: 1.42, y: .5 },
  })),
  ...extra,
});
const outside = (rayCount, progress = 0, state = 'outbound') => Array.from({ length: rayCount }, (_, index) => ({
  index, rayId: `ray-${index + 1}`, state, progress, damage: null,
}));

// ── A SURFACE THAT CANNOT BE BUILT MUST NOT TAKE THE WHOLE FEATURE WITH IT ──
//
// Every step of the native prewarm can reject on a desktop build: a denied ACL
// call, a page the bundle does not contain, a create that never answers. All of
// them were unguarded inside a Promise.all whose rejection was swallowed at the
// only call site, so one failure left the session at prewarmState:'pending' for
// the rest of the battle. Nothing external appeared again, the in-canvas comets
// carried on unchanged, and nothing anywhere said why.
{
  const { effects, failures } = harness({ failing: ['fireball-cast-3'] });
  effects.begin({ intensity: 'hostile' });
  const resolved = await effects.prepareFireballs().catch((error) => `REJECTED:${error.message}`);
  assert.equal(resolved, true, 'prewarm must never reject');
  assert.equal(effects.debug().prewarmState, 'partial');
  assert.equal(effects.debug().readySurfaces, 3);
  assert.equal(failures.length, 1, 'the failure is reported exactly once');
  assert.match(failures[0].reasons.join(' '), /fireball-cast-3/, 'and it names the surface that failed');
  await effects.emergencyRestore({ notify: false });
}

{
  // Every surface failing is still a settled, described outcome, and combat is
  // never blocked by it.
  const { effects, failures } = harness({ failing: [...FIREBALL_SURFACE_LABELS] });
  const token = effects.begin({ intensity: 'hostile' });
  assert.equal(await effects.prepareFireballs(), false);
  assert.equal(effects.debug().prewarmState, 'unavailable');
  assert.equal(failures.at(-1).ready, 0);
  assert.equal(effects.beginFireballCast(plan(1), { token }), true);
  await effects.emergencyRestore({ notify: false });
}

// ── THE RAY IS MEASURED IN THE STAGE BAND, NOT THE WINDOW ──────────────────
//
// The native side read it as a fraction of the whole window, so every rightward
// cast aimed far off the side of the screen and clamped flat against the
// monitor edge — the same wrong place every time.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  calls.length = 0;

  effects.syncFireballCast(plan(1), outside(1, .5), { token });
  await settle();
  const step = calls.find(([command]) => command === 'chunk_fireball_cast_step');
  assert.ok(step, 'a comet outside the frame is placed');
  await effects.emergencyRestore({ notify: false });
}

{
  const rays = [];
  const surfaces = new Map();
  class Surface {
    static async getByLabel(label) { return surfaces.get(label) || null; }
    constructor(label) { this.label = label; surfaces.set(label, this); }
    once(_event, cb) { cb(); }
    async hide() {}
    async close() { surfaces.delete(this.label); }
  }
  const effects = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: Surface,
      invoke: async (command, payload) => { if (command === 'chunk_fireball_cast_step') rays.push(...payload.casts.map((cast) => cast.ray)); return 1; },
      emitTo: async () => true, listen: async () => () => {},
    },
    documentApi: null,
  });
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  effects.syncFireballCast(plan(1), outside(1, 0), { token });
  await settle();

  assert.equal(rays.length, 1);
  assert.ok(Math.abs(rays[0].exit.x - (STAGE.x + STAGE.w)) < 1e-9,
    'the exit is remapped into window space, not passed through raw');
  assert.ok(Math.abs(rays[0].exit.y - (STAGE.y + .5 * STAGE.h)) < 1e-9);
  assert.ok(Math.abs(rays[0].direction.x - STAGE.w) < 1e-9,
    'and so is the direction — an angle belongs to the rectangle it was measured in');
  assert.equal(rays[0].beyond, undefined, 'the fixed overshoot is no longer what places the surface');
  await effects.emergencyRestore({ notify: false });
}

// ── A STRUCK SURFACE IS A STRUCK FIREBALL, AND THE KEYBOARD GOES HOME ──────
//
// The surfaces were click-through, so the one thing a fireball exists for —
// clicking it — stopped working the moment it left the frame, and the click
// fell through to whatever was behind the window. Usually the desktop.
{
  const { effects, dispatched, calls, hit } = harness({ listen: true });
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  const onHit = hit();
  assert.ok(onHit, 'the main window listens for a struck surface');

  const live = plan(2);
  effects.beginFireballCast(live, { token });
  const opaque = (value) => {
    let hash = 0x811c9dc5;
    for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return `cast-${hash.toString(16).padStart(8, '0')}`;
  };

  onHit({ payload: { castId: opaque(live.castId), surfaceIndex: 1 } });
  await settle();
  const hits = dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.castId, live.castId, 'the real cast id never leaves this module');
  assert.equal(hits[0].detail.rayId, 'ray-2', 'and the surface that was clicked names its own ray');
  assert.ok(calls.some(([command]) => command === 'chunk_fireball_cast_focus_main'));

  dispatched.length = 0;
  onHit({ payload: { castId: opaque(live.castId), surfaceIndex: 2 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0,
    'a fixed surface outside this cast cannot alias the last live ray');

  // A click that caught nothing still hands the keyboard back.
  dispatched.length = 0; calls.length = 0;
  onHit({ payload: { castId: '', surfaceIndex: -1 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0);
  assert.ok(calls.some(([command]) => command === 'chunk_fireball_cast_focus_main'),
    'a missed click is exactly when the player next reaches for a key');

  // And a cast id that is not the live one reaches nothing.
  dispatched.length = 0;
  onHit({ payload: { castId: 'cast-deadbeef', surfaceIndex: 0 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0);
  await effects.emergencyRestore({ notify: false });
}

// ── ONE FLIGHT, IN TWO LEGS, ONE COMET AT A TIME ───────────────────────────
//
// It leaves the Surfer's hand, crosses the stage, crosses the bezel, comes back
// at the player, and lands. A surface exists only for the second half of that.
// Comets leave a beat apart and resolve one at a time, so "the cast's state" is
// not a thing any surface can be drawn from.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  calls.length = 0;

  const live = compileFireballCastPlan({ battleId: 'hall', movementId: 'attention', movementIndex: 1, castSequence: 0, stage: STAGE });
  let landed = 0;
  const exchange = createFireballExchange({
    battleId: 'hall',
    beginCast: () => { effects.beginFireballCast(live, { token }); return live; },
    onSync: (frame) => effects.syncFireballCast(live, frame.rays, { token }),
    onImpact: ({ damage }) => { landed += damage; },
  });
  exchange.setMovement({ id: 'attention', index: 1 });

  let sawStage = false;
  for (let tick = 0; tick < 90; tick += 1) {
    const frame = exchange.update(0.05, { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 1));
    const flying = frame.active?.rays.filter((ray) => ray.state === 'inflight') || [];
    if (flying.length && !frame.active.rays.some((ray) => ray.state !== 'waiting' && ray.state !== 'inflight')) {
      sawStage = true;
      assert.equal(calls.filter(([command]) => command === 'chunk_fireball_cast_step').length, 0,
        'nothing opens while every comet is still on the stage');
    }
  }
  assert.ok(sawStage, 'the stage crossing happened');
  const steps = calls.filter(([command]) => command === 'chunk_fireball_cast_step').map(([, at]) => at);
  assert.ok(steps.length > 6, `the surfaces travel rather than sitting still (${steps.length})`);
  assert.ok(landed > 0, 'a comet nobody touched lands on the player');
  assert.ok(calls.some(([command]) => command === 'hide'), 'and then it is gone');
  await effects.emergencyRestore({ notify: false });
}

// ── A FIGHT KEEPS ITS SURFACES ─────────────────────────────────────────────
//
// Ending a battle closed all four windows and the next battle's prewarm rebuilt
// them under the same four labels — a race Tauri loses in both directions, so
// the pool came back broken and nothing reached a surface again for the rest of
// the process. From a chair that is "it stops working after the menu".
{
  const { effects, surfaces, constructed } = harness();
  for (let fight = 1; fight <= 3; fight += 1) {
    const token = effects.begin({ intensity: 'hostile' });
    await effects.prepareFireballs();
    assert.equal(effects.debug().prewarmState, 'ready', `fight ${fight} has its surfaces`);
    await effects.end(token);
    assert.equal(surfaces.size, 4, 'ending a fight puts them away rather than destroying them');
  }
  assert.equal(constructed(), 4, 'four windows, built once, for the life of the app');
  await effects.emergencyRestore({ notify: false });
  assert.equal(surfaces.size, 0, 'only turning the module off destroys them');
}

console.log('fireball surface tests passed');

// ── THE SHOAL ─────────────────────────────────────────────────────────────
//
// The native side is handed four numbers and nothing else: how hard to break,
// how far, how far ahead of the pointer to aim, and how tightly to hold
// formation. The escalation, the break/settle cycle and every reason behind
// them stay on this side of the boundary — the compositor's job is the geometry
// the game cannot do, which is where a pointer actually is on the desk.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();

  const dance = { dodge: .8, reach: 2.1, senseMs: 240, cohesion: .9, settled: false, settleLeftMs: 0, pressure: .93 };
  calls.length = 0;
  effects.syncFireballCast(plan(2), outside(2, .4), { token, choreography: dance });
  await settle();
  const stepped = calls.find(([command]) => command === 'chunk_fireball_cast_step');
  assert.ok(stepped, 'a breaking shoal is stepped');

  // A settle sends no choreography at all, so a still shoal costs the native
  // side nothing and cannot be nudged by a stale number.
  const held = [];
  const spy = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: class {
        static async getByLabel(label) { return spySurfaces.get(label) || null; }
        constructor(label) { this.label = label; spySurfaces.set(label, this); }
        once(_event, cb) { cb(); }
        async hide() {}
        async close() { spySurfaces.delete(this.label); }
      },
      invoke: async (command, payload) => { if (command === 'chunk_fireball_cast_step') held.push(payload.choreography); return 1; },
      emitTo: async () => true, listen: async () => () => {},
    },
    documentApi: null,
  });
  const spySurfaces = new Map();
  const spyToken = spy.begin({ intensity: 'hostile' });
  await spy.prepareFireballs();

  spy.syncFireballCast(plan(2), outside(2, .4), { token: spyToken, choreography: { ...dance, dodge: 0, settled: true } });
  await settle();
  assert.equal(held.at(-1), null, 'a settled shoal sends no dance');

  spy.syncFireballCast(plan(2), outside(2, .5), { token: spyToken, choreography: dance });
  await settle();
  const sent = held.at(-1);
  assert.deepEqual(Object.keys(sent).sort(), ['cohesion', 'dodge', 'formationProgress', 'gesture', 'reach', 'senseMs'],
    'and a breaking one sends only bounded geometry plus its authored formation');
  assert.ok(sent.dodge > 0 && sent.dodge <= 1);
  assert.ok(sent.senseMs <= 600, 'the prediction lead is bounded on this side, not trusted from it');
  await spy.emergencyRestore({ notify: false });
  await effects.emergencyRestore({ notify: false });
}

console.log('fireball shoal tests passed');
