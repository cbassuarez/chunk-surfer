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
// What an uncontested comet costs. The player may choose to ignore one while
// doing something else and feel it without losing the whole fight.
export const FIREBALL_IMPACT_DAMAGE = 3;
// A native target leaves the stage and feints inside a fixed peripheral input
// envelope, then holds its own catch mark. The envelope protects near misses.
export const FIREBALL_OUTSIDE_SECONDS = 2.1;
// The first missed commitment is information, not damage. It retreats to the
// bezel and comes back once, visibly on the same ray. Only the second complete
// offer may land.
export const FIREBALL_REBOUND_SECONDS = .48;
export const FIREBALL_CATCH_PROGRESS = .72;
export const FIREBALL_OFFERS = 2;
export const FIREBALL_ACQUIRE_GRACE_SECONDS = .75;
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
const LIVE_RAY_STATES = Object.freeze(['inflight', 'approach', 'rebound']);
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
    const point = fireballRayPoint(ray, {
      state:'outbound',
      progress:['approach','rebound'].includes(flight.state)
        ? clamp(flight.canvasProgress ?? .86, 0, 1)
        : flight.progress,
    });
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
  manual = false,
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
  outsideSeconds = null,
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
  const outsideOverride = outsideSeconds == null ? null : Math.max(.05, Number(outsideSeconds) || FIREBALL_OUTSIDE_SECONDS);
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

  function spawn(context = {}) {
    if (active) return active.plan;
    const request = {
      movementId:movement.id,
      movementIndex:movement.index,
      movementTitle:movement.title,
      castSequence:sequence++,
      reducedMotion:!!reducedMotion,
      stage:getStage?.() || null,
      casterId:context.casterId || null,
      casterLabel:context.casterLabel || '',
      casterIndex:context.casterIndex,
      coordinateIds:context.coordinateIds || [],
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
    const dance=fireballChoreography({ reducedMotion:!!reducedMotion, ...(getPressure?.() || {}), rayCount:plan.rayCount });
    active = {
      plan,
      duration,
      // Cast-wide inspector summary; each ray owns its presentation phase.
      shoalSeconds:0,
      dance,
      outsideSeconds:outsideOverride ?? (dance.breakMs+dance.settleMs)/1000,
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
        rebound:0,
        offers:0,
        catchReady:false,
        acquired:false,
        acquiredOffers:0,
        offerDeadline:0,
        canvasProgress:.86,
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
    // A resolved surface keeps the pose the player actually answered. Its
    // short feedback tail must not complete a feint or restart an approach.
    ray.resolvedPose = Object.freeze(outsidePose(ray));
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
    if (changed && active) cancel('movement-change');
    if (changed) spawnIn = FIREBALL_FIRST_CAST_SECONDS;
    return snapshot();
  }

  function click({ x = -1, y = -1, aspect = 1, radius = .085 } = {}) {
    const hit = hitTestFireballCast(snapshot().active, { x, y, aspect, radius });
    if (!hit) return { hit:false, returned:false, charge, threshold };
    return register(active.rays[hit.index]);
  }

  function strike({ castId = '', rayId = null } = {}) {
    if (stopped || !active) return { hit:false, returned:false, charge, threshold };
    if (castId && String(castId) !== active.plan.castId) return { hit:false, returned:false, charge, threshold };
    const live = liveRays();
    // An explicitly addressed ray is never permission to strike a sibling.
    // Retain the unaddressed entry point for older in-canvas callers only.
    return register(rayId == null ? live[0] : live.find((ray) => ray.id === rayId));
  }

  // Reaching a native tile earns a stationary click opportunity, not charge.
  // Extend only once, so hovering cannot indefinitely postpone a projectile.
  function acquire({castId='',rayId=null,offer=1}={}){
    const rejected={acquired:false,charge,threshold};
    if(stopped||!active||String(castId)!==active.plan.castId||!Number.isInteger(offer))return rejected;
    const ray=active.rays.find(ray=>ray.id===rayId&&['approach','rebound'].includes(ray.state));
    if(!ray||offer!==Math.min(FIREBALL_OFFERS,ray.state==='rebound'?ray.offers:ray.offers+1))return rejected;
    if(ray.acquiredOffers&(1<<offer))return ray.state==='approach'
      ?{acquired:true,duplicate:true,castId,rayId,offer,charge,threshold}:rejected;
    if(ray.state==='rebound'){
      // Contact with the still-visible old offer cancels its retreat once.
      ray.state='approach';ray.offers=Math.max(0,ray.offers-1);
      ray.outside=active.outsideSeconds;ray.rebound=0;
    }
    ray.acquired=true;
    ray.acquiredOffers|=1<<offer;
    ray.catchReady=true;
    ray.offerDeadline=Math.max(active.outsideSeconds,(ray.state==='approach'?ray.outside:0)+FIREBALL_ACQUIRE_GRACE_SECONDS);
    last={type:'acquired',castId,rayId,offer};
    sync();
    return{acquired:true,duplicate:false,castId,rayId,offer,charge,threshold};
  }

  function outsidePose(ray) {
    if (ray.resolvedPose) return { ...ray.resolvedPose };
    const phase = fireballCyclePhase(ray.outside, active.dance);
    // The retreat retraces this ray's own offer. Its next approach starts a
    // fresh phase even though the cast's inspector clock has already settled.
    const formationProgress = ray.state === 'rebound'
      ? 1 - clamp(ray.rebound / FIREBALL_REBOUND_SECONDS, 0, 1)
      : phase.settled ? 1 : phase.formationProgress;
    const travel = ray.state === 'rebound'
      ? Math.sin(formationProgress * Math.PI)
      : phase.travel;
    return {
      rebounding:ray.state==='rebound',
      progress: FIREBALL_CATCH_PROGRESS * formationProgress,
      dodge: formationProgress >= 1 ? 0 : active.dance.evasion * travel,
      formationProgress,
    };
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
        state:['approach','rebound'].includes(ray.state) ? 'outbound' : ray.state,
        // The target reaches its catch mark during the authored feint and then
        // stays there. A rebound visibly retraces the same segment to the edge.
        ...outsidePose(ray),
        catchReady:!!ray.catchReady,
        acquired:!!ray.acquired,
        offer:Math.min(FIREBALL_OFFERS,ray.offers+1),
        damage:ray.damage,
      }));
  }

  function sync() {
    const rays = outsideFrame();
    if (!active || !rays.length) { onSync({ castId:active?.plan?.castId || '', rays:[], choreography:null }); return; }
    const dance = active.dance;
    const cycle = fireballCyclePhase(active.shoalSeconds, dance);
    const presented=onSync({
      castId:active.plan.castId,
      rays,
      // The cast-wide phase remains an inspector summary. Native movement and
      // commitment cues use each ray's own presentation phase above.
      choreography:{
        dodge:dance.evasion * cycle.travel,
        reach:dance.reach,
        cohesion:dance.cohesion,
        settled:cycle.settled,
        settleLeftMs:cycle.settleLeftMs,
        pressure:dance.pressure,
        gesture:dance.gesture,
        formationProgress:cycle.formationProgress,
      },
    });
    active.externalPresented=presented===true;
  }

  function update(dt, { enabled = true } = {}) {
    if (stopped) return snapshot();
    // Dialogue freezes live projectiles, but short deflect/RETURN/impact tails
    // are allowed to finish so no burst becomes a permanent overlay merely
    // because an authored line began.
    if (!enabled && (!active || liveRays().length)) return snapshot();
    const seconds = Math.max(0, Number(dt) || 0);
    if (!active) {
      if (manual) return snapshot();
      spawnIn -= seconds;
      if (spawnIn <= 0) spawn();
      return snapshot();
    }
    // Retain the inspector's cast-wide count from the first outside arrival.
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
        // A callback may end the exchange outright (a blow that breaks the
        // recordist hands the fight to the Surfer's throw, which cancels this).
        if (!active) return snapshot();
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
        const cycle=fireballCyclePhase(ray.outside,active.dance);
        ray.catchReady=cycle.settled;
        ray.canvasProgress=.86-cycle.travel*.08;
        if (ray.outside < Math.max(active.outsideSeconds,ray.offerDeadline)) continue;
        ray.offers += 1;
        if(ray.offers<FIREBALL_OFFERS){
          ray.state='rebound';
          ray.rebound=0;
          ray.catchReady=false;
          ray.acquired=false;
          ray.offerDeadline=0;
          last={type:'reoffered',castId:active.plan.castId,rayId:ray.id,offer:ray.offers+1};
          continue;
        }
        finish(ray, 'impact', landing || null);
        last = { type:'missed', castId:active.plan.castId, rayId:ray.id, damage:landing };
        if (landing > 0) onImpact({ castId:active.plan.castId, rayId:ray.id, damage:landing, casterId:active.plan.casterId || null });
        if (!active) return snapshot();
        continue;
      }
      if(ray.state==='rebound'){
        ray.rebound+=seconds;
        ray.catchReady=false;
        ray.canvasProgress=.86+.12*clamp(ray.rebound/FIREBALL_REBOUND_SECONDS,0,1);
        if(ray.rebound<FIREBALL_REBOUND_SECONDS)continue;
        ray.state='approach';
        ray.outside=0;
        ray.rebound=0;
        ray.canvasProgress=.86;
        continue;
      }
      ray.dwell -= seconds;
      if (ray.dwell > 0) continue;
      if (ray.state === 'reversed') {
        onReturn({ castId:active.plan.castId, rayId:ray.id, damage:rangedDamage, casterId:active.plan.casterId || null });
        last = { type:'returned', castId:active.plan.castId, rayId:ray.id, damage:rangedDamage };
        if (!active) return snapshot();
      }
      ray.state = 'gone';
    }
    if (!active) return snapshot();
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
        outsideSeconds:active.outsideSeconds,
        externalPresented:!!active.externalPresented,
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

  function cancel(reason='interrupted') {
    if(active)last={type:'forgiven',castId:active.plan.castId,reason:String(reason||'interrupted')};
    active = null;
    spawnIn = FIREBALL_FIRST_CAST_SECONDS;
    sync();
    return snapshot();
  }

  function castNow(context = {}) {
    if (stopped) return null;
    return spawn(context);
  }

  return { setMovement, update, click, strike, acquire, castNow, cancel, snapshot, stop };
}
