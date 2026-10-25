// Authored first-person entry through the loading-bay goods doors.
//
// Runtime positions are half-metre plan cells. The floorplan door describes
// which axis its leaves span and which side is indoors; this module turns that
// into one deterministic camera/body path shared by the runtime and tests.
import { ZONE,CELL } from '../data/floorplan/legend.js';

export const GET_IN_GOODS_DOOR_ID='dock-grey-exterior';

export function getInEntryHasHappened({flags={},setupComplete=false,hasRealTake=false}={}){
  return !!(flags['title.shown']||flags['setup.levels']||flags['combat.trained']||setupComplete||hasRealTake);
}

// Aim at the three-metre leaf surface, not a narrow cone around its centre.
// At arm's reach either leaf fills the view while the centre can lie far off
// axis. The ray must still meet the real width and face the door plane.
export function getInGoodsDoorAim(portal,position,direction,maxCells=5){
  if(portal?.id!==GET_IN_GOODS_DOOR_ID)return null;
  const normal=portal.widthAxis==='x'?'y':'x',along=normal==='x'?'y':'x';
  const plane=normal==='x'?portal.cx:portal.cy,centre=along==='x'?portal.cx:portal.cy;
  const dn=normal==='x'?direction?.[0]:direction?.[1],da=along==='x'?direction?.[0]:direction?.[1];
  if(![plane,centre,position?.[normal],position?.[along],dn,da].every(Number.isFinite)||Math.abs(dn)<.12)return null;
  const distance=(plane-position[normal])/dn;
  if(distance< -1e-6||distance>maxCells)return null;
  const lateral=position[along]+da*Math.max(0,distance)-centre;
  const halfWidth=(Number(portal.aperture?.width)||3)/(2*CELL);
  if(Math.abs(lateral)>halfWidth+.08)return null;
  return{aimAngle:0,aimScore:Math.max(0,distance)*.012+Math.abs(lateral)/halfWidth*.08};
}

// The aperture itself is deliberately unzoned. Room membership alone cannot
// own entry: a player can focus either goods leaf while standing on its outer
// threshold cells. The real focus supplies reach/aim/floor; the portal normal
// distinguishes arrival from the later interaction on the indoor side.
export function canBeginGetInDoorEntry({
  portal,position,zone,storyMode=false,inPlan=false,inSpecialSpace=false,
  active=false,retired=false,flags={},setupComplete=false,hasRealTake=false,
}={}){
  if(!storyMode||!inPlan||inSpecialSpace||active||retired||setupComplete
    ||getInEntryHasHappened({flags,setupComplete,hasRealTake})||!flags.prologueDone||portal?.id!==GET_IN_GOODS_DOOR_ID)return false;
  if(zone!==ZONE.dock&&zone!==ZONE.none)return false;
  const normal=portal.widthAxis==='x'?'y':'x';
  const centre=normal==='x'?portal.cx:portal.cy;
  const inside=(portal.insideSide??portal.definition?.insideSide)===-1?-1:1;
  return Number.isFinite(position?.[normal])&&Number.isFinite(centre)
    &&(position[normal]-centre)*inside<=1e-6;
}

// Continuing outside after the lodge is still the exterior lesson. Only the
// actual Get-In landing can resume the recorder setup or its pending memory.
export function getInSessionAction({atGetIn=false,flags={},setupComplete=false,handoffStarted=false,hasRealTake=false}={}){
  if(!atGetIn)return 'outside';
  if(flags['title.shown']&&flags['opening.driveTeaser.pending']&&!flags['opening.driveTeaser.consumed'])return 'drive';
  if(handoffStarted||setupComplete)return 'complete';
  if(flags.prologueDone&&!getInEntryHasHappened({flags,setupComplete,hasRealTake}))return 'title';
  return flags.prologueDone?'tutorial':'outside';
}

export const GET_IN_DOOR_ENTRY=Object.freeze({
  duration:2.85,
  openingHold:1.48,
  insideClearance:4,
});

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const smooth=(value)=>{const t=clamp01(value);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export function getInDoorEntryPose(portal={},origin={}){
  const widthAxis=portal.widthAxis==='x'?'x':'y';
  const inside=(portal.insideSide??portal.definition?.insideSide)===-1?-1:1;
  const clearance=Math.max(2.4,Number(portal.entryClearance)||GET_IN_DOOR_ENTRY.insideClearance);
  const x=widthAxis==='x'
    ? Number(portal.cx)||0
    : (Number(portal.cx)||0)+inside*clearance;
  const y=widthAxis==='x'
    ? (Number(portal.cy)||0)+inside*clearance
    : Number(portal.cy)||0;
  const normalX=widthAxis==='y'?inside:0,normalY=widthAxis==='x'?inside:0;
  return{
    x,y,
    yaw:Math.atan2(normalX,-normalY),
    pitch:0,
    inside,
    widthAxis,
  };
}

export function getInDoorEntryFrame({
  origin={},entry={},elapsed=0,duration=GET_IN_DOOR_ENTRY.duration,
  openingHold=GET_IN_DOOR_ENTRY.openingHold,reducedMotion=false,
}={}){
  const total=Math.max(.4,Number(duration)||GET_IN_DOOR_ENTRY.duration);
  const hold=Math.max(0,Math.min(total-.2,Number(openingHold)||0));
  const now=Math.max(0,Number(elapsed)||0);
  const turn=smooth(clamp01(now/Math.max(.35,hold+.20)));
  const crossing=smooth(clamp01((now-hold)/Math.max(.2,total-hold)));
  const stride=reducedMotion?0:Math.sin(crossing*Math.PI*4)*Math.sin(crossing*Math.PI)*.035;
  return{
    x:lerp(Number(origin.x)||0,Number(entry.x)||0,crossing),
    y:lerp(Number(origin.y)||0,Number(entry.y)||0,crossing),
    yaw:lerpAngle(Number(origin.yaw)||0,Number(entry.yaw)||0,turn),
    pitch:lerp(Number(origin.pitch)||0,Number(entry.pitch)||0,crossing),
    floorOffset:stride,
    phase:now<hold?'opening':'crossing',
    progress:crossing,
    done:now>=total,
  };
}
