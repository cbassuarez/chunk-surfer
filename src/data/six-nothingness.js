// WHAT IS BEHIND THE GOODS DOORS, THE NIGHT IT CRASHED.
//
// Local metres with the door at the origin: -Z is the way in, +Z is the yard
// that is no longer there. You come through into nothing, and it is nothing on
// the far side of the cardboard as well. Only a body that wanders comes upon the
// edges: first 6:00 AM, then the ring of boos standing round that clock, then
// just past them the faults that put you back at the door.
//
// Each clock is the middle of its own little stage. Its boos face it from every
// side; its faults stand a few metres outside them, open only on the side you
// walk in from. One far ring of faults closes the gaps between the clocks.
export const SIX_NOTHINGNESS=Object.freeze({
  walk:4.8,bodyRadius:.22,eye:1.62,maxFrameDelta:.1,
  step:Object.freeze({x:0,z:-2}),
  blink:Object.freeze({period:1,lit:.56}),
  flat:Object.freeze({halfWidth:27,thickness:.06,door:Object.freeze({halfWidth:1.5,height:3.6})}),
  centre:Object.freeze({x:0,z:0}),
  // Each clock reads clean from one spot on its own radius. It first shows on a
  // lit blink, so the moment it arrives is the moment it switches on.
  ruin:Object.freeze({stepRadius:64,distance:14,scale:4.2,bottom:2.1,seed:0x6006,chips:70,count:5,reveal:50,hide:62}),
  // The thrown shards reach 33 m from a clock's middle, so the ring clears them;
  // the step the clock reads from is 14 m in, well inside it.
  boos:Object.freeze({radius:36,count:28,jitter:1.2,mountHeight:1.15,trigger:5.8,reveal:42,seed:0xb00,
    // The third and the eighth boo set off in a night bring something real with
    // them. Counted across resets, so the first few are only ever the gag.
    jumpscares:Object.freeze([3,8])}),
  // `mouth` is the half-angle left open toward the door, seen from the clock.
  faults:Object.freeze({radius:44,mouth:.56,segments:12,outer:128,sectors:24,touch:.6,reveal:36,seed:0xfa017,
    sheets:14,size:3.4,height:2.8,spreadHeight:4.6,depth:2.2}),
  // Where the exit is: on the step, looking at the clock.
  vantage:Object.freeze({radius:.75,yaw:.14,pitch:.3}),
  scare:Object.freeze({rush:.16,seconds:.82,distance:1.25,faultDistance:1.05}),
  exit:Object.freeze({align:1.4,minTalk:2.5,maxTalk:90,cover:1.2}),
  floorRadius:190,
});
const TAU=Math.PI*2;
export function sixRandom(seed){
  let a=seed>>>0;
  return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
export const SIX_CLOCKS=Object.freeze(Array.from({length:SIX_NOTHINGNESS.ruin.count},(_,k)=>Object.freeze({id:`clock-${k}`,index:k,angle:k/SIX_NOTHINGNESS.ruin.count*TAU})));
const clockAt=(clock,radius)=>({x:SIX_NOTHINGNESS.centre.x-Math.sin(clock.angle)*radius,z:SIX_NOTHINGNESS.centre.z-Math.cos(clock.angle)*radius});
export const sixClockCentre=clock=>clockAt(clock,SIX_NOTHINGNESS.ruin.stepRadius+SIX_NOTHINGNESS.ruin.distance);
export const sixClockStep=clock=>clockAt(clock,SIX_NOTHINGNESS.ruin.stepRadius);
export const sixRadius=(x,z)=>Math.hypot(x-SIX_NOTHINGNESS.centre.x,z-SIX_NOTHINGNESS.centre.z);
// A point around a clock, by its bearing from the side facing the door and its
// distance from the clock's middle. Bearing 0 is the way in.
export function sixAroundClock(clock,bearing,distance){
  const c=sixClockCentre(clock),a=clock.angle,dx=Math.sin(a),dz=Math.cos(a),lx=Math.cos(a),lz=-Math.sin(a);
  return{x:c.x+(dx*Math.cos(bearing)+lx*Math.sin(bearing))*distance,z:c.z+(dz*Math.cos(bearing)+lz*Math.sin(bearing))*distance};
}
// Where a point stands relative to a clock: distance from its middle and bearing
// from the door side, in (-PI, PI].
export function sixClockBearing(clock,x,z){
  const c=sixClockCentre(clock),a=clock.angle,px=x-c.x,pz=z-c.z,toward=px*Math.sin(a)+pz*Math.cos(a),across=px*Math.cos(a)-pz*Math.sin(a);
  return{distance:Math.hypot(px,pz),bearing:Math.atan2(across,toward)};
}
// The view that reads the clock clean, from its step.
export function sixVantageLook(clock){
  const{ruin,eye}=SIX_NOTHINGNESS;
  return{yaw:-clock.angle,pitch:Math.atan2(ruin.bottom+ruin.scale-eye,ruin.distance)};
}
// The fixed apparatus: a ring round every clock, each board turned to face it,
// so a body walking away from a clock comes at the front of the gag. The way in
// from the door runs between two boos, never through one.
export const SIX_BOOS=Object.freeze((()=>{
  const{boos}=SIX_NOTHINGNESS,rand=sixRandom(boos.seed),rows=[];
  for(const clock of SIX_CLOCKS){
    const middle=sixClockCentre(clock);
    for(let k=0;k<boos.count;k++){
      const bearing=(k+.5+(rand()-.5)*.24)/boos.count*TAU,distance=boos.radius+(rand()-.5)*2*boos.jitter,{x,z}=sixAroundClock(clock,bearing,distance),
        ux=(middle.x-x)/distance,uz=(middle.z-z)/distance;
      rows.push(Object.freeze({id:`boo-${clock.index}-${k}`,clock:clock.id,x,z,bearing,yaw:Math.atan2(-ux,uz)}));
    }
  }
  return rows;
})());
// A fault ring round a clock is cut into arcs, all outside the mouth. Each arc
// is one copy of the same torn segment, turned to its bearing.
export const SIX_FAULT_ARCS=Object.freeze((()=>{
  const{mouth,segments}=SIX_NOTHINGNESS.faults,span=(TAU-2*mouth)/segments;
  return Array.from({length:segments},(_,k)=>mouth+(k+.5)*span);
})());
export const sixFaultArcLength=()=>{const{radius,mouth,segments}=SIX_NOTHINGNESS.faults;return radius*(TAU-2*mouth)/segments;};
export const sixFaultSectorLength=()=>{const{outer,sectors}=SIX_NOTHINGNESS.faults;return outer*TAU/sectors;};
export const sixBlinkLit=(time,{reducedMotion=false}={})=>{
  if(reducedMotion)return true;const{period,lit}=SIX_NOTHINGNESS.blink,t=(Math.max(0,Number(time)||0)%period);return t<lit;
};
// The flat is a flat. Its only way through is the hole cut for the goods doors.
export function sixFlatBlocks(fromZ,toZ,x){
  const{flat,bodyRadius}=SIX_NOTHINGNESS;
  const half=flat.thickness/2+bodyRadius,crossing=Math.sign(fromZ-half)!==Math.sign(toZ-half)||Math.sign(fromZ+half)!==Math.sign(toZ+half)||Math.abs(toZ)<half;
  if(!crossing||Math.abs(x)>flat.halfWidth+bodyRadius)return false;
  return Math.abs(x)>flat.door.halfWidth-bodyRadius;
}
// The faults are a line you cannot cross from either side: a clock's ring
// everywhere but its mouth, and the far ring all the way round.
export function sixFaultTouched(from,to){
  const{radius,mouth,outer,touch}=SIX_NOTHINGNESS.faults;
  if(sixRadius(to.x,to.z)>=outer-touch)return{kind:'outer'};
  for(const clock of SIX_CLOCKS){
    const before=sixClockBearing(clock,from.x,from.z),after=sixClockBearing(clock,to.x,to.z);
    if(Math.abs(after.bearing)<=mouth)continue;
    if(Math.abs(after.distance-radius)<touch||(before.distance-radius)*(after.distance-radius)<0)return{kind:'ring',clock:clock.id};
  }
  return null;
}
// On the step, facing the clock closely enough that it reads.
export function sixVantageClock(state){
  const{vantage}=SIX_NOTHINGNESS;
  for(const clock of SIX_CLOCKS){
    if(!state.clocks?.[clock.id])continue;
    const step=sixClockStep(clock);if(Math.hypot(state.x-step.x,state.z-step.z)>vantage.radius)continue;
    const look=sixVantageLook(clock),yaw=Math.atan2(Math.sin(state.yaw-look.yaw),Math.cos(state.yaw-look.yaw));
    if(Math.abs(yaw)<=vantage.yaw&&Math.abs((Number(state.pitch)||0)-look.pitch)<=vantage.pitch)return clock;
  }
  return null;
}
