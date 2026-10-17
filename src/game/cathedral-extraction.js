import { CHURCH, CHURCH_TOWER_ENDING_EXIT_DOOR_ID } from '../data/st-brendans.js';
import { ENDING_CUTSCENES } from '../data/endings.js';
import { createDraggedPayloadState } from './dragged-payload.js';
import { createEndingCutsceneState, endingCutsceneCompletionId } from './ending-cutscene.js';

// Church metres are physical yard coordinates, not addresses in the logical
// atlas. Keep that conversion explicit at the extraction's position gates.
export const CATHEDRAL_GROUND_LOGICAL_OFFSET = Object.freeze({ x: 112, y: 125 });
const westExitLeaf = CHURCH.doors.find(entry => entry.id === CHURCH_TOWER_ENDING_EXIT_DOOR_ID);
export const CATHEDRAL_WEST_EXIT_PLANE_METRES = Object.freeze({ x: westExitLeaf.x, z: westExitLeaf.y });
// Covers the rotated footprint of the rendered prone body, including its
// trailing feet. A cleared centre alone can leave him inside the west leaf.
export const CATHEDRAL_BODY_EXIT_CLEARANCE_METRES = 1.1;
const spec = ENDING_CUTSCENES['tower-won'];
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const point = (value) => finite(value?.x) && finite(value?.y)
  ? Object.freeze({ x: value.x, y: value.y }) : null;
const nonnegative = (value, fallback = 0) => finite(value) ? Math.max(0, value) : fallback;

export function cathedralGroundRuntimePoint(floorplan, local, offset = CATHEDRAL_GROUND_LOGICAL_OFFSET) {
  if (!point(local) || !point(offset) || typeof floorplan?.toRuntimePoint !== 'function') return null;
  return Object.freeze(floorplan.toRuntimePoint({ x: local.x + offset.x, y: local.y + offset.y }));
}

export function cathedralExtractionAnchors(floorplan, { bodyPosition, groundOffset = CATHEDRAL_GROUND_LOGICAL_OFFSET } = {}) {
  const nave = CHURCH.rooms.find((room) => room.id === 'nave');
  const west = floorplan?.doorState?.().find((door) => door.id === CHURCH_TOWER_ENDING_EXIT_DOOR_ID);
  return Object.freeze({
    collapsedSurfer: point(bodyPosition),
    nave: cathedralGroundRuntimePoint(floorplan, { x: (nave.x0 + nave.x1) / 2, y: 64 }, groundOffset),
    westDoors: west ? point({ x: west.cx, y: west.cy }) : null,
  });
}

export function cathedralBodiesOutsideWest(floorplan, player, body, { clearance = .25 } = {}) {
  const door=floorplan?.doorState?.().find(entry=>entry.id===CHURCH_TOWER_ENDING_EXIT_DOOR_ID);
  if(!door||!point(player)||!point(body))return false;
  const plane=floorplan.logicalToPhysical(door.cx,door.cy);
  // A compiled door volume is addressed at its cell centre. Its leaf is at
  // the authored church metre coordinate, a quarter metre farther outside.
  const planeX=floorplan.toRuntimeDistance(CATHEDRAL_WEST_EXIT_PLANE_METRES.x);
  const planeZ=floorplan.toRuntimeDistance(CATHEDRAL_WEST_EXIT_PLANE_METRES.z);
  const halfWidth=floorplan.toRuntimeDistance(1.5);
  return [player,body].every((at,index)=>{
    const margin=floorplan.toRuntimeDistance(index===0?clearance:Math.max(clearance,CATHEDRAL_BODY_EXIT_CLEARANCE_METRES));
    const p=floorplan.logicalToPhysical(at.x,at.y);
    return p.z<=planeZ-margin+1e-9&&Math.abs(p.x-planeX)<=halfWidth&&Math.abs(p.y-plane.y)<.25;
  });
}

function normalizeCutscene(value, reducedMotion) {
  const initial = createEndingCutsceneState(spec, { reducedMotion: reducedMotion ?? !!value?.reducedMotion });
  if (value?.endingId !== spec.endingId) return initial;
  const cursor = Math.min(spec.beats.length, Math.floor(nonnegative(value.cursor)));
  const complete = cursor === spec.beats.length;
  const actions = new Set(spec.beats.filter((beat) => beat.action).map((beat) => beat.action));
  return Object.freeze({
    ...initial,
    elapsedMs: nonnegative(value.elapsedMs), cursor,
    fired: Object.freeze(spec.beats.slice(0, cursor).map((beat) => beat.id)),
    interactions: Object.freeze([...new Set((Array.isArray(value.interactions) ? value.interactions : []).filter((action) => actions.has(action)))]),
    paused: !!value.paused, skipped: !!value.skipped, complete,
    completionId: complete ? endingCutsceneCompletionId(spec.endingId) : null,
    completionClaimed: complete && !!value.completionClaimed,
  });
}

function normalizePose(value) {
  if (!value || typeof value !== 'object') return null;
  const pose = {};
  for (const name of ['yaw', 'pitch', 'facing']) if (finite(value[name])) pose[name] = value[name];
  return Object.keys(pose).length ? Object.freeze(pose) : null;
}

export function normalizeCathedralExtractionCheckpoint(value) {
  if (value?.schema !== 1 || !point(value?.drag?.position)) return null;
  const position = point(value.drag.position);
  const trail = (Array.isArray(value.drag.trail) ? value.drag.trail : []).map(point).filter(Boolean).slice(-96);
  const drag = createDraggedPayloadState({
    position, trail, gripped: value.drag.gripped,
    spacing: finite(value.drag.spacing) ? Math.max(.25, value.drag.spacing) : 1.25,
  });
  return Object.freeze({
    schema: 1,
    stage: ['grip', 'drag', 'threshold', 'outside'].includes(value.stage) ? value.stage : 'grip',
    pace: finite(value.pace) ? Math.max(.1, Math.min(1, value.pace)) : .52,
    carryProgress: Math.min(1, nonnegative(value.carryProgress)),
    exitCell: point(value.exitCell), drag,
    dragVector: point(value.dragVector) || Object.freeze({ x: 0, y: -1 }),
    player: point(value.player), playerPose: normalizePose(value.playerPose),
    cutscene: normalizeCutscene(value.cutscene),
    cutsceneOrigin: point(value.cutsceneOrigin) ? Object.freeze({
      ...point(value.cutsceneOrigin), ...normalizePose(value.cutsceneOrigin),
      forward: Object.freeze(Array.isArray(value.cutsceneOrigin.forward)
        && value.cutsceneOrigin.forward.length === 2 && value.cutsceneOrigin.forward.every(finite)
        ? [...value.cutsceneOrigin.forward] : [0, -1]),
    }) : null,
  });
}

export function createCathedralExtractionCheckpoint({ escape, cutscene, player, playerPose } = {}) {
  if (escape?.kind !== 'cathedral-carry') return null;
  return normalizeCathedralExtractionCheckpoint({
    schema: 1, stage: escape.stage, pace: escape.pace, exitCell: escape.exitCell,
    drag: escape.drag, dragVector: escape.dragVector, carryProgress: escape.carryProgress, player, playerPose,
    cutscene: cutscene?.state || cutscene,
    cutsceneOrigin: cutscene?.origin,
  });
}

// Invalid or pre-checkpoint saves return null: the caller must place the body
// at the authored crossing, never silently create it at the current player.
export function restoreCathedralExtractionCheckpoint(value, { reducedMotion } = {}) {
  const checkpoint = normalizeCathedralExtractionCheckpoint(value);
  if (!checkpoint) return null;
  return Object.freeze({
    escape: Object.freeze({
      kind: 'cathedral-carry', stage: checkpoint.stage, pace: checkpoint.pace,
      exitCell: checkpoint.exitCell, drag: checkpoint.drag, dragVector: checkpoint.dragVector,
      carryProgress: checkpoint.carryProgress,
    }),
    cutscene: normalizeCutscene(checkpoint.cutscene, reducedMotion),
    cutsceneOrigin: checkpoint.cutsceneOrigin,
    player: checkpoint.player, playerPose: checkpoint.playerPose,
  });
}
