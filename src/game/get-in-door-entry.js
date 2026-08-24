// Authored first-person entry through the loading-bay goods doors.
//
// Runtime positions are half-metre plan cells. The floorplan door describes
// which axis its leaves span and which side is indoors; this module turns that
// into one deterministic camera/body path shared by the runtime and tests.

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
