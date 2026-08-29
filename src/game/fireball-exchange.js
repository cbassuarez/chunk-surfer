import {
  advanceFireballCastPlan,
  compileFireballCastPlan,
  fireballRayPoint,
} from './window-channel.js';
import { fireballChoreography, fireballCyclePhase } from './fireball-choreography.js';

export const FIREBALL_RETURN_THRESHOLD = 3;
// A TOKEN, NOT A REWARD.
//
// This was ten -- a quarter of a movement's coherence for three clicks -- which
// made the ranged exchange the most efficient damage in the fight and turned a
// side beat into the main one. The point of catching a fireball is that it does
// not hit you. What you get for it is one, and the pleasure of the sound.
export const FIREBALL_RETURN_DAMAGE = 1;
export const FIREBALL_FIRST_CAST_SECONDS = 0.7;
export const FIREBALL_CAST_INTERVAL_SECONDS = 1.8;
// What an uncontested comet costs. Small next to a RETURN's ten, because the
// player is meant to be able to ignore one while doing something else and feel
// it — not to be punished for looking away from the desktop for a beat.
export const FIREBALL_IMPACT_DAMAGE = 3;
// The flight does not end at the bezel. It leaves the stage, crosses the rest
// of the screen, and only then lands — and it is clickable for every second of
// that, which is the entire reason there is a window out there at all.
export const FIREBALL_OUTSIDE_SECONDS = 1.15;
// SIBLINGS DO NOT ARRIVE TOGETHER.
//
// Four comets leaving on the same frame is one event with four sprites in it --
// nothing to read, nothing to answer separately, and a single wall of windows
// arriving at once. A beat and a bit between them makes it a phrase: they come
// in order, they can be taken in order, and the last one is still in the air
// when the first has landed. Arriving together is reserved for the movement
// that is supposed to be overwhelming.
export const FIREBALL_STAGGER_SECONDS = 0.26;
// In the air and answerable.
const LIVE_RAY_STATES = Object.freeze(['inflight', 'approach']);
// How long a finished comet stays on screen saying what happened to it.
const RAY_DWELL = Object.freeze({ deflected:0.34, reversed:0.70, impact:0.26 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

// EACH RAY IS ITS OWN PROJECTILE, SO EACH ONE IS ITS OWN TARGET.
//
// This used to test every ray against one shared progress, because there was
// one shared flight -- which is also why hitting one of them parried all of
// them. A cast is a volley of separate comets that happen to have been thrown
// together; only the ones still in the air can be hit, and only the one that
// was hit is affected.
export function hitTestFireballCast(active, { x = -1, y = -1, aspect = 1, radius = 0.085 } = {}) {
  if (!active?.plan?.rays?.length || !active.rays?.length) return null;
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  let closest = null;
  for (const flight of active.rays) {
    if (!LIVE_RAY_STATES.includes(flight.state)) continue;
    const ray = active.plan.rays[flight.index];
    if (!ray) continue;
    const point = fireballRayPoint(ray, { state:'outbound', progress:flight.progress });
    const dx = (px - point.x) * Math.max(.1, Number(aspect) || 1);
    const dy = py - point.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius && (!closest || distance < closest.distance)) closest = { rayId:ray.id, index:flight.index, distance, point };
  }
  return closest;
}

// Fireballs are a second, real-time combat clock. They do not inspect the
// ordinary intent, reducer phase, parry window or selected move. The scene only
// tells this controller whether live combat is currently visible; everything
// else -- spawn cadence, pointer deflection and RETURN -- lives here.
export function createFireballExchange({
  battleId = '',
  reducedMotion = false,
  returnThreshold = FIREBALL_RETURN_THRESHOLD,
  returnDamage = FIREBALL_RETURN_DAMAGE,
  beginCast = null,
  // Per RAY now, not per cast: one comet resolving says nothing about its
  // siblings, which are still in the air.
  resolveCast = () => {},
  onReturn = () => {},
  // An uncontested comet lands on the player.
  onImpact = () => {},
  // Every frame, the comets that should currently be drawn outside the frame
  // and where each one is in its own approach. One call for the whole volley.
  onSync = () => {},
  // One comet leaving the Surfer's hand. Fired per ray, in launch order, which
  // is what makes a staggered cast an arpeggio and a volley a chord.
  onLaunch = () => {},
  impactDamage = FIREBALL_IMPACT_DAMAGE,
  outsideSeconds = FIREBALL_OUTSIDE_SECONDS,
  staggerSeconds = FIREBALL_STAGGER_SECONDS,
  // Read at spawn, not at construction: the stage band moves with the window.
  getStage = null,
  // Which turn of which fight this is. Sampled once per cast, so the shoal
  // never changes what it is doing under the player's hand mid-flight.
  getPressure = null,
} = {}) {
  const threshold = Math.max(1, Math.floor(Number(returnThreshold) || FIREBALL_RETURN_THRESHOLD));
  const rangedDamage = Math.max(1, Math.floor(Number(returnDamage) || FIREBALL_RETURN_DAMAGE));
  const landing = Math.max(0, Math.floor(Number(impactDamage) || 0));
  const outside = Math.max(.05, Number(outsideSeconds) || FIREBALL_OUTSIDE_SECONDS);
  const stagger = Math.max(0, Number(staggerSeconds) || 0);
  let movement = { id:'', index:0, title:'' };
  let sequence = 0;
  let charge = 0;
  let spawnIn = FIREBALL_FIRST_CAST_SECONDS;
  let active = null;
  let last = null;
  let stopped = false;

  function planFor(request) {
    return beginCast?.(request) || compileFireballCastPlan({ battleId, ...request });
  }

  function spawn() {
    const request = {
      movementId:movement.id,
      movementIndex:movement.index,
      movementTitle:movement.title,
      castSequence:sequence++,
      reducedMotion:!!reducedMotion,
      stage:getStage?.() || null,
    };
    const plan = planFor(request);
    if (!plan) {
      spawnIn = FIREBALL_CAST_INTERVAL_SECONDS;
      return null;
    }
    const duration = Math.max(.6, Number(plan.travelSeconds) || 2.2);
    // A volley is the authored overwhelming beat and arrives as one wall. Every
    // other cast is a phrase: the second comet leaves while the first is still
    // crossing, and they can be answered in the order they were thrown.
    const together = !!plan.volley;
    active = {
      plan,
      duration,
      // Shared by every comet in the cast. Swimmers keep one count.
      shoalSeconds:0,
      dance:fireballChoreography({ reducedMotion:!!reducedMotion, ...(getPressure?.() || {}) }),
      rays: plan.rays.map((ray, index) => ({
        id:ray.id,
        index,
        // A comet with no wait is not waiting: it is already in the air on the
        // frame it was thrown.
        state:(together || index === 0) ? 'inflight' : 'waiting',
        wait:together ? 0 : index * stagger,
        elapsed:0,
        progress:0,
        outside:0,
        dwell:0,
        damage:null,
      })),
    };
    last = { type:'cast', castId:plan.castId };
    for (const ray of active.rays) {
      if (ray.state === 'inflight') onLaunch({ castId:plan.castId, rayId:ray.id, index:ray.index, volley:!!plan.volley });
    }
    return plan;
  }

  function liveRays() {
    return active ? active.rays.filter((ray) => LIVE_RAY_STATES.includes(ray.state)) : [];
  }

  function finish(ray, state, damage = null) {
    ray.state = state;
    ray.dwell = RAY_DWELL[state] || .3;
    ray.damage = Number.isFinite(Number(damage)) ? Math.max(0, Math.floor(Number(damage))) : null;
    resolveCast({ castId:active.plan.castId, rayId:ray.id, index:ray.index, state, damage:ray.damage });
  }

  // One struck comet, and only that one. Charge is the player's, not the ray's,
  // so three separate deflections across three separate comets still arm a
  // RETURN -- but the two that were not hit carry on exactly as they were.
  function register(ray) {
    if (!ray || !LIVE_RAY_STATES.includes(ray.state)) return { hit:false, returned:false, charge, threshold };
    charge = Math.min(threshold, charge + 1);
    const castId = active.plan.castId;
    if (charge >= threshold) {
      charge = 0;
      finish(ray, 'reversed', rangedDamage);
      last = { type:'return-armed', castId, rayId:ray.id, damage:rangedDamage };
      return { hit:true, returned:true, charge, threshold, damage:rangedDamage, castId, rayId:ray.id };
    }
    finish(ray, 'deflected');
    last = { type:'deflected', castId, rayId:ray.id, charge };
    return { hit:true, returned:false, charge, threshold, castId, rayId:ray.id };
  }

  function clearActive() {
    active = null;
    spawnIn = FIREBALL_CAST_INTERVAL_SECONDS;
    sync();
  }

  function setMovement({ id = '', index = 0, title = '' } = {}) {
    const next = { id:String(id || ''), index:Math.max(0, Math.floor(Number(index) || 0)), title:String(title || '') };
    const changed = next.id !== movement.id || next.index !== movement.index;
    movement = next;
    if (changed && active) {
      for (const ray of liveRays()) finish(ray, 'deflected');
      clearActive();
    }
    if (changed) spawnIn = FIREBALL_FIRST_CAST_SECONDS;
    return snapshot();
  }

  function click({ x = -1, y = -1, aspect = 1 } = {}) {
    const hit = hitTestFireballCast(snapshot().active, { x, y, aspect });
    if (!hit) return { hit:false, returned:false, charge, threshold };
    return register(active.rays[hit.index]);
  }

  function strike({ castId = '', rayId = null } = {}) {
    if (stopped || !active) return { hit:false, returned:false, charge, threshold };
    if (castId && String(castId) !== active.plan.castId) return { hit:false, returned:false, charge, threshold };
    const live = liveRays();
    return register(live.find((ray) => ray.id === rayId) || live[0]);
  }

  // What is outside the frame right now, one entry per comet. Everything drawn
  // out there is drawn from this and nothing else.
  function outsideFrame() {
    if (!active) return [];
    return active.rays
      .filter((ray) => ray.state !== 'waiting' && ray.state !== 'inflight' && ray.state !== 'gone')
      .map((ray) => ({
        index:ray.index,
        rayId:ray.id,
        state:ray.state === 'approach' ? 'outbound' : ray.state,
        progress:clamp(ray.outside / outside, 0, 1),
        damage:ray.damage,
      }));
  }

  function sync() {
    const rays = outsideFrame();
    if (!active || !rays.length) { onSync({ castId:active?.plan?.castId || '', rays:[], choreography:null }); return; }
    const dance = active.dance;
    const cycle = fireballCyclePhase(active.shoalSeconds, dance);
    onSync({
      castId:active.plan.castId,
      rays,
      // One dance for the whole cast: they break on the same count and settle
      // on the same count, which is the difference between a formation and
      // four windows each dodging on their own.
      choreography:{
        dodge:dance.evasion * cycle.travel,
        reach:dance.reach,
        senseMs:dance.senseMs,
        cohesion:dance.cohesion,
        settled:cycle.settled,
        settleLeftMs:cycle.settleLeftMs,
        pressure:dance.pressure,
      },
    });
  }

  function update(dt, { enabled = true } = {}) {
    if (stopped) return snapshot();
    // Dialogue freezes live projectiles, but short deflect/RETURN/impact tails
    // are allowed to finish so no burst becomes a permanent overlay merely
    // because an authored line began.
    if (!enabled && (!active || liveRays().length)) return snapshot();
    const seconds = Math.max(0, Number(dt) || 0);
    if (!active) {
      spawnIn -= seconds;
      if (spawnIn <= 0) spawn();
      return snapshot();
    }
    // The count the shoal keeps, started by the first comet to leave the frame.
    if (active.rays.some((ray) => ray.state !== 'waiting' && ray.state !== 'inflight' && ray.state !== 'gone')) {
      active.shoalSeconds += seconds;
    }
    for (const ray of active.rays) {
      if (ray.state === 'gone') continue;
      if (ray.state === 'waiting') {
        ray.wait -= seconds;
        if (ray.wait > 0) continue;
        ray.state = 'inflight';
        onLaunch({ castId:active.plan.castId, rayId:ray.id, index:ray.index, volley:!!active.plan.volley });
      }
      if (ray.state === 'inflight') {
        ray.elapsed += seconds;
        ray.progress = clamp(ray.elapsed / Math.max(.001, active.duration), 0, 1);
        // Off the stage and out over the desktop. Still live, still answerable:
        // the cast surface is only now allowed to exist.
        if (ray.progress >= 1) ray.state = 'approach';
        continue;
      }
      if (ray.state === 'approach') {
        ray.outside += seconds;
        if (ray.outside < outside) continue;
        finish(ray, 'impact', landing || null);
        last = { type:'missed', castId:active.plan.castId, rayId:ray.id, damage:landing };
        if (landing > 0) onImpact({ castId:active.plan.castId, rayId:ray.id, damage:landing });
        continue;
      }
      ray.dwell -= seconds;
      if (ray.dwell > 0) continue;
      if (ray.state === 'reversed') {
        onReturn({ castId:active.plan.castId, rayId:ray.id, damage:rangedDamage });
        last = { type:'returned', castId:active.plan.castId, rayId:ray.id, damage:rangedDamage };
      }
      ray.state = 'gone';
    }
    if (active.rays.every((ray) => ray.state === 'gone')) { clearActive(); return snapshot(); }
    sync();
    return snapshot();
  }

  function snapshot() {
    return {
      schema:2,
      battleId:String(battleId || ''),
      movement:{ ...movement },
      charge,
      threshold,
      returnReady:!!active?.rays?.some((ray) => ray.state === 'reversed'),
      choreography:active
        ? { ...active.dance, ...fireballCyclePhase(active.shoalSeconds, active.dance) }
        : null,
      active:active ? {
        plan:active.plan,
        duration:active.duration,
        rays:active.rays.map((ray) => ({ ...ray })),
        // The leader, for anything that still wants one number: the furthest
        // comet of the volley.
        progress:active.rays.reduce((most, ray) => Math.max(most, ray.progress), 0),
        outsideFrame:outsideFrame(),
      } : null,
      spawnIn:Math.max(0, spawnIn),
      last:last ? { ...last } : null,
    };
  }

  function stop() {
    stopped = true;
    active = null;
    sync();
  }

  function cancel() {
    if (active) for (const ray of liveRays()) finish(ray, 'deflected');
    active = null;
    spawnIn = FIREBALL_FIRST_CAST_SECONDS;
    sync();
    return snapshot();
  }

  return { setMovement, update, click, strike, cancel, snapshot, stop };
}
