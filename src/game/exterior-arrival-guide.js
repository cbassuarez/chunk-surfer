// The arrival teaches ordinary controls before the indoor recorder setup.
// Route progress belongs to existing story flags; only demonstrated movement
// and camera operation are remembered here. This module never accepts input,
// moves a body, grants equipment or makes an optional detour mandatory.
import { mapAcquired } from './map-ownership.js';
import { STORY_TARGET } from './story-guidance.js';

export const EXTERIOR_ARRIVAL_GUIDE = Object.freeze({
  schema: 1,
  moveMetres: 1,
  lookRadians: .16,
});

const finitePositive = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, value) : 0;
const limited = (value, maximum) => Math.min(maximum, finitePositive(value));

export function freshExteriorArrivalGuideState(saved = null) {
  const source = saved?.schema === EXTERIOR_ARRIVAL_GUIDE.schema ? saved : {};
  const moveMetres = limited(source.moveMetres, EXTERIOR_ARRIVAL_GUIDE.moveMetres);
  const lookRadians = limited(source.lookRadians, EXTERIOR_ARRIVAL_GUIDE.lookRadians);
  return {
    schema: EXTERIOR_ARRIVAL_GUIDE.schema,
    moveMetres,
    lookRadians,
    moved: source.moved === true || moveMetres >= EXTERIOR_ARRIVAL_GUIDE.moveMetres,
    looked: source.looked === true || lookRadians >= EXTERIOR_ARRIVAL_GUIDE.lookRadians,
  };
}

function arrivalActive(context = {}) {
  const flags = context.flags || {};
  return context.storyMode === true && context.inExterior === true
    && !context.blocked && !context.entryActive && !context.setupComplete
    && !flags['title.shown'] && !flags['opening.driveTeaser.pending']
    && !flags['opening.driveTeaser.consumed'];
}

// Feed accepted body travel and actual applied camera deltas, in metres and
// radians respectively. Raw keys, rejected steps and an authored camera turn
// prove neither operation. The caller also excludes hidden/paused scene owners
// with blocked, so UI navigation cannot silently finish these lessons.
export function reduceExteriorArrivalGuide(state, event = {}, context = {}) {
  const next = freshExteriorArrivalGuideState(state);
  if (!arrivalActive(context) || event.voluntary !== true) return next;
  if (event.type === 'move' && event.accepted === true && !next.moved) {
    next.moveMetres = limited(next.moveMetres + finitePositive(event.distanceMetres),
      EXTERIOR_ARRIVAL_GUIDE.moveMetres);
    next.moved = next.moveMetres >= EXTERIOR_ARRIVAL_GUIDE.moveMetres;
  }
  if (event.type === 'look' && event.applied === true && !next.looked) {
    const yaw = typeof event.yawDelta === 'number' && Number.isFinite(event.yawDelta)
      ? event.yawDelta : 0;
    const pitch = typeof event.pitchDelta === 'number' && Number.isFinite(event.pitchDelta)
      ? event.pitchDelta : 0;
    next.lookRadians = limited(next.lookRadians + Math.hypot(yaw, pitch),
      EXTERIOR_ARRIVAL_GUIDE.lookRadians);
    next.looked = next.lookRadians >= EXTERIOR_ARRIVAL_GUIDE.lookRadians;
  }
  return next;
}

function arrivalTarget(context) {
  const flags = context.flags || {};
  if (flags.prologueDone) return STORY_TARGET.getIn;
  const kitReady = !flags['van.preparation.v1']
    || (mapAcquired(flags) && flags['kit.fitted'] === true);
  if (!flags['bag.taken'] || !kitReady) return STORY_TARGET.van;
  // The runtime may supply the settled fraction. The durable flag is written
  // at the start of the van's swing, before its lamp and leaves have landed.
  const vanClosed = typeof context.vanClosed === 'boolean'
    ? context.vanClosed : flags['van.closed'] === true;
  return vanClosed ? STORY_TARGET.lodge : STORY_TARGET.vanShut;
}

// Action parts are rendered through the ordinary binding/glyph renderer.
// Controller LOOK is a supported virtual action. Keyboard LOOK has no binding:
// spelling it as an action would manufacture a misleading [LOOK] keycap.
export function exteriorArrivalGuide(state, context = {}) {
  if (!arrivalActive(context)) return null;
  const learned = freshExteriorArrivalGuideState(state);
  const target = arrivalTarget(context);
  const actionParts = [];
  let pointerHint = null;
  if (!learned.moved) actionParts.push({ action: 'move', label: 'MOVE' });
  if (!learned.looked) {
    if (context.device === 'controller') actionParts.push({ action: 'look', label: 'LOOK' });
    else pointerHint = context.pointerCaptured === true
      ? 'MOVE MOUSE TO LOOK' : 'CLICK THE VIEW TO LOOK';
  }
  return {
    stage: target.id === STORY_TARGET.getIn.id ? 'goods-door'
      : target.id === STORY_TARGET.lodge.id ? 'lodge' : 'van',
    objective: target.label,
    targetId: target.id,
    actionParts,
    pointerHint,
  };
}
