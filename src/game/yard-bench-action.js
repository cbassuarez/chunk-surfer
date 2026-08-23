// Authored first-person motion for the opening shelter bench.
//
// Runtime positions are half-metre plan cells, while prop yaw is in radians.
// The seat itself is the bench anchor: the camera's +0.5-cell centre offset puts
// the body 25 cm forward of that anchor, on the slats rather than in the back.

export const YARD_BENCH_ACTION=Object.freeze({
  sitDuration:1.35,
  standDuration:.92,
  seatedEyeDrop:.72,
  seatedPitch:-.055,
});

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const smooth=(value)=>{const t=clamp01(value);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export function yardBenchSeatPose(bench={}){
  const yaw=Number(bench.yaw)||0;
  const outwardYaw=Number.isFinite(bench.seatYaw)
    ?Number(bench.seatYaw)
    :Math.atan2(Math.cos(yaw),-Math.sin(yaw));
  return{
    x:Number(bench.rx)||0,
    y:Number(bench.ry)||0,
    approachX:Number.isFinite(bench.interactionRx)?Number(bench.interactionRx):Number(bench.rx)||0,
    approachY:Number.isFinite(bench.interactionRy)?Number(bench.interactionRy):Number(bench.ry)||0,
    yaw:outwardYaw,
    pitch:Number.isFinite(bench.seatPitch)?Number(bench.seatPitch):YARD_BENCH_ACTION.seatedPitch,
    eyeDrop:Number.isFinite(bench.seatEyeDrop)?Number(bench.seatEyeDrop):YARD_BENCH_ACTION.seatedEyeDrop,
  };
}

export function yardBenchSitFrame({origin={},seat={},elapsed=0,duration=YARD_BENCH_ACTION.sitDuration}={}){
  const total=Math.max(.2,Number(duration)||YARD_BENCH_ACTION.sitDuration);
  const turn=smooth(clamp01((Number(elapsed)||0)/(total*.58)));
  const settle=smooth(clamp01(((Number(elapsed)||0)-total*.18)/(total*.82)));
  return{
    x:lerp(Number(origin.x)||0,Number(seat.x)||0,settle),
    y:lerp(Number(origin.y)||0,Number(seat.y)||0,settle),
    yaw:lerpAngle(Number(origin.yaw)||0,Number(seat.yaw)||0,turn),
    pitch:lerp(Number(origin.pitch)||0,Number(seat.pitch)||0,settle),
    floorOffset:lerp(0,-Math.abs(Number(seat.eyeDrop)||0),settle),
    done:Number(elapsed)>=total,
  };
}

export function yardBenchStandFrame({seat={},look={},elapsed=0,duration=YARD_BENCH_ACTION.standDuration}={}){
  const total=Math.max(.2,Number(duration)||YARD_BENCH_ACTION.standDuration);
  const rise=smooth(clamp01((Number(elapsed)||0)/total));
  return{
    x:lerp(Number(seat.x)||0,Number(seat.approachX)||0,rise),
    y:lerp(Number(seat.y)||0,Number(seat.approachY)||0,rise),
    yaw:Number(look.yaw)||0,
    pitch:lerp(Number(look.pitch)||0,0,rise*.72),
    floorOffset:lerp(-Math.abs(Number(seat.eyeDrop)||0),0,rise),
    done:Number(elapsed)>=total,
  };
}

// Standing still owns the body for its short authored rise, but a locomotion
// key pressed during it must survive for the first world frame afterwards.
// Sitting and seated deliberately remain input-modal.
export function yardBenchTracksMotion(phase){
  return phase==='standing';
}
