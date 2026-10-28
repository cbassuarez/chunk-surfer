import { SOURCE_EARTHFALL as C, SOURCE_EARTHFALL_CUES, SOURCE_EARTHFALL_MATERIAL_CELL, earthfallContains, earthfallCatchHeight, earthfallCatchVelocity, earthfallExitDoorHeight, sourceEarthfallFracturePose, sourceEarthfallUpperHeight, sourceEarthfallLowerContains, SOURCE_EARTHFALL_STRATA } from '../data/source-earthfall.js';

const copy = value => JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
const angle = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const phases = new Set(['intact', 'fracturing', 'falling', 'catching', 'landed']);
const cueTypes = new Set([...SOURCE_EARTHFALL_CUES.map(cue => cue.type), 'catch', 'land', ...SOURCE_EARTHFALL_STRATA.map(layer=>layer.id)]);
const withinDoor = x => Math.abs(x) <= C.door.width / 2 - C.bodyRadius;
const receiptId = (state, type) => `${C.sequenceId}:${state.runId}:${type}`;
const localPose = value => value && typeof value === 'object' ? copy(value) : null;

export function freshSourceEarthfall({ runId = '', returnPose = null } = {}) {
  return { version: C.version, layoutRevision:3, sequenceId: C.sequenceId, runId: String(runId), status: 'active', phase: 'intact',
    ...C.spawn, clock: 0, elapsed: 0, accumulator: 0, committed: false, committedAt: null,
    velocityY: 0, catchElapsed: 0, catchVelocity: -C.terminalSpeed,
    entryDoor: { open: true, progress: 1 }, exitDoor: { open: false, progress: 0 },
    receipts: [], exitReceipt: null, returnPose: localPose(returnPose) };
}

export function normalizeSourceEarthfall(value, { runId, returnPose } = {}) {
  const fresh = freshSourceEarthfall({ runId: runId ?? value?.runId ?? '', returnPose: returnPose ?? value?.returnPose });
  if (!value || value.version !== C.version || value.sequenceId !== C.sequenceId
    || runId != null && String(runId) !== String(value.runId)) return fresh;
  const state = { ...fresh,
    status: ['active', 'returned', 'completed'].includes(value.status) ? value.status : 'active',
    phase: phases.has(value.phase) ? value.phase : 'intact',
    x: finite(value.x, fresh.x), z: finite(value.z, fresh.z),
    feet: clamp(value.feet, C.lowerFloor, C.upperFloor), yaw: angle(value.yaw), pitch: clamp(value.pitch ?? 0, -1.3, 1.3),
    clock: Math.max(0, finite(value.clock)), elapsed: Math.max(0, finite(value.elapsed)),
    accumulator: clamp(value.accumulator ?? 0, 0, C.fixedStep), committed: !!value.committed,
    committedAt: Number.isFinite(value.committedAt) ? Math.max(0, value.committedAt) : null,
    velocityY: clamp(value.velocityY ?? 0, -C.terminalSpeed, 0),
    catchElapsed: clamp(value.catchElapsed ?? 0, 0, C.catch.settleSeconds),
    catchVelocity: clamp(value.catchVelocity ?? -C.terminalSpeed, -C.terminalSpeed, 0),
    entryDoor: { open: value.entryDoor?.open !== false, progress: clamp(value.entryDoor?.progress ?? 1, 0, 1) },
    exitDoor: { open: !!value.exitDoor?.open, progress: clamp(value.exitDoor?.progress ?? 0, 0, 1) },
    returnPose: localPose(value.returnPose) || fresh.returnPose,
  };
  const seen = new Set();
  state.receipts = (Array.isArray(value.receipts) ? value.receipts : []).filter(receipt => cueTypes.has(receipt?.type)
    && Number.isFinite(receipt.at) && !seen.has(receipt.type) && seen.add(receipt.type)).map(receipt => ({
      id: receiptId(state, receipt.type), type: receipt.type, at: clamp(receipt.at, 0, state.clock),
      position: { x: finite(receipt.position?.x), y: finite(receipt.position?.y), z: finite(receipt.position?.z) },
      gain: clamp(receipt.gain ?? .5, 0, 1),
    }));
  if (!state.committed) {
    state.phase = 'intact'; state.feet = C.upperFloor; state.velocityY = 0;
    state.elapsed = 0; state.committedAt = null; state.catchElapsed = 0; state.receipts = [];
    state.exitDoor = { open: false, progress: 0 };
  } else {
    state.committedAt ??= Math.max(0, state.clock - state.elapsed);
    state.clock = Math.max(state.clock, state.committedAt + state.elapsed);
    if (state.phase === 'intact') state.phase = 'fracturing';
    if(state.phase==='fracturing')state.feet=sourceEarthfallUpperHeight(state.elapsed);
    if (state.phase === 'catching') {
      state.feet = earthfallCatchHeight(state.catchElapsed, state.catchVelocity);
      state.velocityY = earthfallCatchVelocity(state.catchElapsed, state.catchVelocity);
    }
    if (state.phase === 'landed' || state.status === 'completed') {
      state.phase = 'landed'; state.feet = C.lowerFloor; state.velocityY = 0; state.catchElapsed = C.catch.settleSeconds;
    }
    if (state.phase !== 'landed') state.exitDoor = { open: false, progress: 0 };
  }
  if(value.layoutRevision!==2&&value.layoutRevision!==3){
    // One-time topology migration for saves on the retired160m-wide floor.
    // Ordinary falling never projects or clamps a live body onto this route.
    const bounds=['intact','fracturing'].includes(state.phase)?C.earth:C.catch;
    const valid=['intact','fracturing'].includes(state.phase)?earthfallContains(bounds,state.x,state.z,C.bodyRadius):sourceEarthfallLowerContains(state.x,state.z,C.bodyRadius);
    if(!valid){state.x=clamp(state.x,bounds.minX+C.bodyRadius,bounds.maxX-C.bodyRadius);state.z=clamp(state.z,bounds.minZ+C.bodyRadius,bounds.maxZ-C.bodyRadius);}
  }
  if (state.status === 'completed') {
    // A completed old receipt may be delivered only after reload. Translate its
    // old doorway clearance once so the destination receives the same body,
    // rather than placing it24m back along the newly extended incoming spine.
    if(value.layoutRevision===2)state.z+=C.passage.exitZ-C.passage.priorExitZ;
    state.exitReceipt = { id: `${C.sequenceId}:${state.runId}:source-II`, delivered: !!value.exitReceipt?.delivered };
  }
  return state;
}

export function sourceEarthfallSupportAt(x, z, value = {}) {
  const state = normalizeSourceEarthfall(value);
  const upper = state.phase === 'intact' || state.phase === 'fracturing';
  if (!(upper?earthfallContains(C.earth,x,z):sourceEarthfallLowerContains(x,z))) return null;
  if (upper) return { id: 'earthfall-upper-earth', y: sourceEarthfallUpperHeight(state.elapsed), material: 'source-earth', kind: 'earth' };
  const y = state.phase === 'catching' ? earthfallCatchHeight(state.catchElapsed, state.catchVelocity)
    : state.phase === 'landed' ? C.lowerFloor : C.catch.interceptY;
  return { id: 'earthfall-folio-catch', y, material: 'source-folio', kind: 'catch' };
}

function receipt(state, type, events) {
  if (state.receipts.some(item => item.type === type)) return;
  const layer=SOURCE_EARTHFALL_STRATA.find(layer=>layer.id===type);
  const position = layer ? {x:state.x,y:layer.y,z:state.z} : type === 'catch' || type === 'land' ? { x: state.x, y: state.feet, z: state.z }
    : type === 'footing-loss' ? { x: state.x, y: sourceEarthfallUpperHeight(state.elapsed), z: state.z }
    : { x: 0, y: C.upperFloor, z: -14 };
  const item = { id: receiptId(state, type), type, at: state.clock, position,
    gain: SOURCE_EARTHFALL_CUES.find(cue => cue.type === type)?.gain ?? (type === 'land' ? .25 : .4) };
  state.receipts.push(item); events.push({ ...copy(item), age: 0 });
}

const doorFrame = (state, kind) => ({ id: `source-earthfall-${kind}`, kind,
  x: 0, z: kind === 'entry' ? 0 : C.passage.exitZ, y: kind === 'entry' ? C.upperFloor : earthfallExitDoorHeight(state.elapsed),
  width: C.door.width, height: C.door.height,
  open: !!state[`${kind}Door`].open, progress: state[`${kind}Door`].progress,
  passable: state[`${kind}Door`].progress >= 1 - 1e-8 && (kind === 'entry' ? ['intact', 'fracturing'].includes(state.phase) : state.phase === 'landed'),
  locked: kind === 'exit' && state.phase !== 'landed',
});

export function sourceEarthfallFocus(value) {
  const state = normalizeSourceEarthfall(value);
  if (state.status !== 'active') return null;
  for (const kind of ['entry', 'exit']) {
    const door = doorFrame(state, kind);
    if (Math.abs(state.feet - door.y) > .45 || Math.hypot(state.x, state.z - door.z) > C.door.focusDistance) continue;
    if (kind === 'entry' && !['intact', 'fracturing'].includes(state.phase)) continue;
    return { ...door, title: door.locked ? 'THE DOOR IS BELOW YOU' : kind === 'exit' && door.open ? 'THE DOOR STANDS OPEN' : door.open ? 'CLOSE THE DOOR' : 'OPEN THE DOOR',
      position: { x: door.x, y: door.y + 1.1, z: door.z } };
  }
  return null;
}

function interact(state, events, input = {}) {
  const focus = sourceEarthfallFocus(state);
  if (!focus || focus.locked) return;
  const door = state[`${focus.kind}Door`];
  // An automatic lower threshold admits an approach of its own accord. An
  // incidental interact must not reverse it; manual borrowers retain toggling.
  if (focus.kind === 'exit' && door.open && input.automaticDoors !== false) return;
  door.open = !door.open;
  events.push({ type: 'door', id: focus.id, open: door.open });
}

function openApproachingExit(state, events) {
  if (state.phase !== 'landed' || state.exitDoor.open
    || Math.abs(state.feet - C.lowerFloor) > .45
    || !sourceEarthfallLowerContains(state.x, state.z, C.bodyRadius)
    || Math.hypot(state.x, state.z - C.passage.exitZ) > C.door.approachDistance) return;
  state.exitDoor.open = true;
  events.push({ type: 'door', id: 'source-earthfall-exit', open: true, cause: 'approach' });
}

function crossingX(from, to, z) {
  return from.x + (to.x - from.x) * ((z - from.z) / ((to.z - from.z) || 1));
}
// The canonical goods frame has130mm posts and220mm depth (the actual
// build-door-pack frame). A capsule can still overlap its jamb after its centre
// crosses the plane, so lateral motion must obey the same physical aperture.
const FRAME_POST_WIDTH = .13, FRAME_HALF_DEPTH = .11, LEAF_HALF_DEPTH = .035;
function pointRectDistanceSquared(p, box) {
  const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX), dz = Math.max(box.minZ - p.z, 0, p.z - box.maxZ);
  return dx * dx + dz * dz;
}
function signedRectDistance(p, box) {
  const outside = pointRectDistanceSquared(p, box);
  return outside > 0 ? Math.sqrt(outside) : -Math.min(p.x - box.minX, box.maxX - p.x, p.z - box.minZ, box.maxZ - p.z);
}
function segmentIntersectsRect(a, b, box) {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'z']) {
    const min = box[axis === 'x' ? 'minX' : 'minZ'], max = box[axis === 'x' ? 'maxX' : 'maxZ'], d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) { if (a[axis] < min || a[axis] > max) return false; continue; }
    const first = (min - a[axis]) / d, last = (max - a[axis]) / d;
    lo = Math.max(lo, Math.min(first, last)); hi = Math.min(hi, Math.max(first, last)); if (lo > hi) return false;
  }
  return true;
}
function pointSegmentDistanceSquared(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0;
  return (p.x - a.x - dx * t) ** 2 + (p.z - a.z - dz * t) ** 2;
}
function capsuleSweepHits(a, b, box) {
  // Old in-jamb checkpoints may move out of penetration; never trap a retired
  // save or project it onto another pose. New legal movement cannot enter it.
  const before = signedRectDistance(a, box), after = signedRectDistance(b, box);
  if (before < C.bodyRadius - 1e-8 && after > before + 1e-9) return false;
  if (segmentIntersectsRect(a, b, box)) return true;
  let distance = Math.min(pointRectDistanceSquared(a, box), pointRectDistanceSquared(b, box));
  for (const x of [box.minX, box.maxX]) for (const z of [box.minZ, box.maxZ]) distance = Math.min(distance, pointSegmentDistanceSquared({ x, z }, a, b));
  return distance < C.bodyRadius ** 2 - 1e-10;
}
function doorBlocks(state, from, to) {
  for (const kind of ['entry', 'exit']) {
    const door = doorFrame(state, kind);
    if (state.feet >= door.y + door.height || state.feet + 1.9 <= door.y) continue;
    const half = door.width / 2, depth = FRAME_HALF_DEPTH;
    for (const sign of [-1, 1]) {
      const x0 = sign < 0 ? -half - FRAME_POST_WIDTH : half, x1 = sign < 0 ? -half : half + FRAME_POST_WIDTH;
      if (capsuleSweepHits(from, to, { minX: x0, maxX: x1, minZ: door.z - depth, maxZ: door.z + depth })) return true;
    }
    if (!door.passable && capsuleSweepHits(from, to, { minX: -half, maxX: half, minZ: door.z - LEAF_HALF_DEPTH, maxZ: door.z + LEAF_HALF_DEPTH })) return true;
  }
  return false;
}
function move(state, input, dt, events) {
  if (input.acceptedStep === false) return;
  const forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1);
  const length = Math.max(1, Math.hypot(forward, side));
  const grounded = ['intact', 'fracturing', 'landed'].includes(state.phase);
  const amount = (grounded ? C.walkSpeed : C.airSpeed) * dt / length;
  const dx = (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * amount;
  const dz = (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * amount;
  const from = { x: state.x, z: state.z }, to = { x: state.x + dx, z: state.z + dz };
  // Grounded movement ends at the actual finite sheet, whose edge is rendered.
  // Airborne movement never snaps or clamps to an invisible path/corridor.
  if (grounded && !(state.phase==='landed'?sourceEarthfallLowerContains(to.x,to.z,C.bodyRadius):earthfallContains(C.earth,to.x,to.z,C.bodyRadius)) || doorBlocks(state, from, to)) return;
  state.x = to.x; state.z = to.z;
  if (!state.committed && from.z > C.commitmentZ && to.z <= C.commitmentZ
    && to.z < from.z) {
    state.committed = true; state.committedAt = state.clock; state.elapsed = 0; state.phase = 'fracturing';
    receipt(state, 'strain', events);
  }
  if (['intact', 'fracturing'].includes(state.phase) && from.z < 0 && to.z >= 0 && withinDoor(crossingX(from, to, 0)) && Math.abs(state.feet-C.upperFloor)<.45 && doorFrame(state, 'entry').passable) {
    state.status = 'returned'; events.push({ type: 'return', returnPose: copy(state.returnPose), committed: state.committed });
  }
  const clearExit=C.passage.exitZ-C.bodyRadius;
  if (state.phase === 'landed' && from.z > clearExit && to.z <= clearExit
    && withinDoor(crossingX(from, to, clearExit)) && doorFrame(state, 'exit').passable) {
    state.status = 'completed'; state.exitReceipt = { id: `${C.sequenceId}:${state.runId}:source-II`, delivered: false };
    events.push({ type: 'enter-source-II', receipt: state.exitReceipt.id });
  }
}

function tick(state, input, dt, events) {
  state.clock += dt;
  if (input.automaticDoors !== false) openApproachingExit(state, events);
  for (const kind of ['entry', 'exit']) {
    const door = state[`${kind}Door`];
    if (kind === 'exit' && state.phase !== 'landed') { door.open = false; door.progress = 0; }
    else door.progress = clamp(door.progress + (door.open ? 1 : -1) * dt / C.door.openSeconds, 0, 1);
  }
  if (state.committed) state.elapsed = Math.max(state.elapsed, state.clock - state.committedAt);
  for (const cue of SOURCE_EARTHFALL_CUES) if (state.committed && state.elapsed + 1e-8 >= cue.at) receipt(state, cue.type, events);
  if(state.phase==='fracturing')state.feet=sourceEarthfallUpperHeight(state.elapsed);
  for(const layer of SOURCE_EARTHFALL_STRATA)if(state.committed&&state.elapsed+1e-8>=layer.releaseAt)receipt(state,layer.id,events);
  if (state.phase === 'fracturing' && state.elapsed + 1e-8 >= C.footingLossAt) {
    state.phase = 'falling'; state.velocityY = 0;
  }
  if(state.phase!=='catching')move(state,input,dt,events);
  if (state.status !== 'active') return;
  if (state.phase === 'falling') {
    state.velocityY = Math.max(-C.terminalSpeed, state.velocityY - C.gravity * dt);
    const next = state.feet + state.velocityY * dt;
    if (next <= C.catch.interceptY && sourceEarthfallLowerContains(state.x,state.z)) {
      state.feet = C.catch.interceptY; state.phase = 'catching'; state.catchElapsed = 0; state.catchVelocity = state.velocityY;
      receipt(state, 'catch', events);
    } else state.feet = next;
  } else if (state.phase === 'catching') {
    state.catchElapsed = Math.min(C.catch.settleSeconds, state.catchElapsed + dt);
    state.feet = earthfallCatchHeight(state.catchElapsed, state.catchVelocity);
    state.velocityY = earthfallCatchVelocity(state.catchElapsed, state.catchVelocity);
    if (state.catchElapsed + 1e-8 >= C.catch.settleSeconds) {
      state.phase = 'landed'; state.feet = C.lowerFloor; state.velocityY = 0; receipt(state, 'land', events);
    }
  }
}

export function stepSourceEarthfall(value, input = {}) {
  const state = normalizeSourceEarthfall(value), events = [];
  if (state.status !== 'active' || input.paused || input.protected || input.assetsReady === false || input.renderReady === false) return { state, events, event: null, saveDue: false };
  const look = input.look || {};
  state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta));
  state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.3, 1.3);
  if (input.interact) interact(state, events, input);
  state.accumulator += clamp(input.dt ?? 0, 0, C.maxFrameDelta);
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') {
    state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events);
  }
  state.accumulator = Math.max(0, state.accumulator);
  return { state, events, event: events.find(event => event.type === 'return' || event.type === 'enter-source-II') || events.at(-1) || null, saveDue: events.length > 0 };
}

export function sourceEarthfallFrame(value) {
  const state = normalizeSourceEarthfall(value);
  const material = sourceEarthfallFracturePose(SOURCE_EARTHFALL_MATERIAL_CELL.index, state.elapsed, SOURCE_EARTHFALL_MATERIAL_CELL.center);
  const catchSurfaceY = state.phase === 'landed' ? 0 : state.phase === 'catching'
    ? earthfallCatchHeight(state.catchElapsed, state.catchVelocity) : C.catch.interceptY;
  const lost = !['intact', 'fracturing'].includes(state.phase);
  const player = { x: state.x, y: state.feet, z: state.z, feet: state.feet, yaw: state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight };
  const impact=state.phase==='catching'?state.catchElapsed:state.phase==='landed'?C.catch.settleSeconds:0;
  const blackoutAlpha=state.phase==='catching'?impact<.035?impact/.035:impact<.2?1:Math.max(0,1-(impact-.2)/(.48-.2)):0;
  return { ...state, active: state.status === 'active', player, catchSurfaceY, blackoutAlpha,
    supported: !lost || state.phase === 'catching' || state.phase === 'landed', upperSupport: !lost,
    fracture: state.committed ? clamp(state.elapsed / C.footingLossAt, 0, 1) : 0,
    falling: state.phase === 'falling', focus: sourceEarthfallFocus(state),
    entryDoor: doorFrame(state, 'entry'), exitDoor: doorFrame(state, 'exit'),
    geometry: {
      upperEarth: { id: 'earthfall-upper-earth', ...C.earth, y: sourceEarthfallUpperHeight(state.elapsed), support: !lost, material: 'source-earth' },
      catchSurface: { id: 'earthfall-folio-catch', ...C.catch, y: catchSurfaceY, material: 'source-folio' },
      lowerApron: { id: 'earthfall-lower-apron', ...C.catch, y: C.lowerFloor, material: 'source-path' },
      path: { minX: -C.passage.halfWidth, maxX: C.passage.halfWidth, minZ: C.passage.exitZ - 3, maxZ: C.catch.minZ+.5, y: C.lowerFloor },
    },
    anchors: { entry: { x: 0, y: 101.2, z: 0 }, earth: { x: 0, y: 100, z: -14 },
      front: { x: state.x, y: state.feet + 1, z: state.z }, fallingMaterial: { x: material.x, y: material.y, z: material.z },
      catch: { x: state.x, y: catchSurfaceY, z: state.z }, exit: { x: 0, y: earthfallExitDoorHeight(state.elapsed) + 1.2, z: C.passage.exitZ } },
    events: state.receipts.map(item => ({ ...copy(item), age: Math.max(0, state.clock - item.at) })),
  };
}
