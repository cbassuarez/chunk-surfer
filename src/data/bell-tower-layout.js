import { PLAN_SCALE } from './floorplan/legend.js';

const runtimePoint = (point) => Object.freeze({
  x: point.x * PLAN_SCALE + Math.floor(PLAN_SCALE / 2),
  y: point.y * PLAN_SCALE + Math.floor(PLAN_SCALE / 2),
  facing: point.facing ?? 0,
});

export const CHAPEL_OUTER_CHECKPOINT_AUTHORED = Object.freeze({ x:92, y:63, facing:2 });
export const CHAPEL_SCREEN_AUTHORED = Object.freeze({ x:92, y:67 });
export const RINGING_ROOM_ANCHOR = Object.freeze({ x:25, y:158 });
export const BELL_CHAMBER_ANCHOR = Object.freeze({ x:61, y:158 });
export const BELL_FRAME_AUTHORED = Object.freeze({ x:61, y:158 });
export const BELL_RELAY_CLAMP_AUTHORED = Object.freeze({ x:65.2, y:158 });
export const ORGAN_LOFT_ANCHOR = Object.freeze({ x:94, y:154 });
export const TOWER_ENTRY_AUTHORED = Object.freeze({ x:25, y:158, facing:0 });
export const SHUTTER_WINCH_AUTHORED = Object.freeze({ x:68, y:163 });
export const TENOR_ROPE_AUTHORED = Object.freeze({x:25+Math.cos(-Math.PI/2+7*Math.PI/4)*4,y:158+Math.sin(-Math.PI/2+7*Math.PI/4)*4});

export const TOWER_ROUTE_ANCHORS = Object.freeze({
  lowerStair: Object.freeze({x:2,y:151,facing:1}),
  lowerTurn: Object.freeze({x:7,y:154,facing:3}),
  ringingEntry: Object.freeze({x:31,y:159,facing:3}),
  belfryDoor: Object.freeze({x:32,y:155,facing:1}),
  upperTurn: Object.freeze({x:44,y:154,facing:3}),
  chamberEntry: Object.freeze({x:68,y:158,facing:3}),
  crossing: Object.freeze({x:61,y:158,facing:1}),
  winch: Object.freeze({x:68,y:160,facing:2}),
  serviceStair: Object.freeze({x:73,y:151,facing:1}),
  organLoft: Object.freeze({x:98,y:155,facing:1}),
  naveDoor: Object.freeze({x:100,y:156,facing:2}),
  naveExit: Object.freeze({x:105,y:154,facing:3}),
});

export const CHAPEL_OUTER_CHECKPOINT = runtimePoint(CHAPEL_OUTER_CHECKPOINT_AUTHORED);
export const TOWER_ENTRY = runtimePoint(TOWER_ENTRY_AUTHORED);
export const SHUTTER_WINCH = runtimePoint(SHUTTER_WINCH_AUTHORED);

export const TOWER_ENTRY_VIEW = Object.freeze({
  ...TOWER_ENTRY,
  floorH: 8.6,
  suppressActors: true,
});

export function nearAuthoredRuntime(px, py, authored, radius=3) {
  const at=runtimePoint(authored);
  return Math.hypot(px-at.x,py-at.y)<=radius;
}

// A compact English eight: two four-bell pits on low cast-iron H frames. Wheel
// planes face the rope guides below, and the rope-room positions form one
// clockwise pitch-ordered circle rather than the prototype's straight line.
export function createBellFrameLayout(bells, {
  centerX,
  centerZ,
  chamberFloorY=13.2,
  ringingFloorY=8.6,
} = {}) {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    throw new Error('bell frame requires a finite physical centre');
  }
  return (bells || []).map((bell, index) => {
    const row=Math.floor(index/4),bay=index%4;
    const frameYaw=row?Math.PI:0;
    const visualScale=.76+index*.028;
    const ropeAngle=-Math.PI/2+index*Math.PI/4;
    return{
      ...bell,
      pivot:{
        x:centerX+(bay-1.5)*1.92,
        y:chamberFloorY+2.05,
        z:centerZ+(row?1.95:-1.95),
      },
      frameYaw,
      ropeGuide:{
        x:centerX+(bay-1.5)*1.92,
        y:chamberFloorY+.32,
        z:centerZ+(row?1.35:-1.35),
      },
      ropeRoomPosition:{
        x:centerX+Math.cos(ropeAngle)*3.35,
        y:ringingFloorY,
        z:centerZ+Math.sin(ropeAngle)*3.35,
        yaw:ropeAngle+Math.PI/2,
      },
      visualScale,
      sweepRadius:1.05*visualScale,
    };
  });
}

// ST BRENDAN'S HANGS THE SAME EIGHT IN TWO TIERS. Its working chamber has an
// 8.4 by 7.6m clear interior; two four-bell pits side by side are nearly
// eight metres long. So the heavy back four (5–8) hang in a two-by-two pit on the
// belfry deck and the light front four (1–4) on a second frame above them. Same
// bells, same per-bell fields as createBellFrameLayout, so the chapel's assembly
// meshes and full-circle curve draw them unchanged. Every bell swings along x;
// the pitch keeps the two in each row from ever meeting at the top of a stroke.
export const TWO_TIER_PITCH = Object.freeze({ x: 2.2, z: 2.0 });
export function createTwoTierBellFrameLayout(bells, {
  centerX,
  centerZ,
  lowerFloorY=10.2,
  upperPivotY=14.4,
  pitchX=TWO_TIER_PITCH.x,
  pitchZ=TWO_TIER_PITCH.z,
} = {}) {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    throw new Error('bell frame requires a finite physical centre');
  }
  return (bells || []).map((bell, index) => {
    const upper=index<4;
    const slot=upper?index:index-4;
    const bay=slot%2,row=Math.floor(slot/2);
    const visualScale=.76+index*.028;
    return{
      ...bell,
      tier:upper?'upper':'lower',
      pivot:{
        x:centerX+(bay?1:-1)*pitchX/2,
        y:upper?upperPivotY:lowerFloorY+2.05,
        z:centerZ+(row?1:-1)*pitchZ/2,
      },
      frameYaw:0,
      visualScale,
      sweepRadius:1.05*visualScale,
    };
  });
}
