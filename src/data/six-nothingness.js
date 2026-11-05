// WHAT IS BEHIND THE GOODS DOORS, THE NIGHT IT CRASHED.
//
// Local metres with the door at the origin: -Z is the way in, +Z is the yard
// that is no longer there. You come through into nothing, and it is nothing on
// the far side of the cardboard as well. Only a body that wanders comes upon the
// edges: first 6:00 AM, then the boos that turn you round, then far out the
// faults that start the night again.
export const SIX_NOTHINGNESS=Object.freeze({
  walk:4.8,bodyRadius:.22,eye:1.62,maxFrameDelta:.1,
  step:Object.freeze({x:0,z:-2}),
  blink:Object.freeze({period:1,lit:.56}),
  flat:Object.freeze({halfWidth:27,thickness:.06,door:Object.freeze({halfWidth:1.5,height:3.6})}),
  centre:Object.freeze({x:0,z:0}),
  // Each clock reads clean from one spot on its own radius. It first shows on a
  // lit blink, so the moment it arrives is the moment it switches on.
  ruin:Object.freeze({stepRadius:64,distance:14,scale:4.2,bottom:2.1,seed:0x6006,chips:70,count:5,reveal:50,hide:62}),
  boos:Object.freeze({rings:Object.freeze([Object.freeze({radius:98,count:52}),Object.freeze({radius:110,count:58})]),mountHeight:1.15,trigger:5.8,reveal:42,seed:0xb00}),
  faults:Object.freeze({radius:150,sectors:12,patches:14,rows:3,columns:4,height:3,seed:0xfa017,touch:.6,reveal:85}),
  floorRadius:190,
});
const TAU=Math.PI*2;
export function sixRandom(seed){
  let a=seed>>>0;
  return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
// The fixed apparatus. Each one's local +Z faces the middle, so a body walking
// out comes at it along the same line the original gag was built to be met on.
export const SIX_BOOS=Object.freeze((()=>{
  const{centre,boos}=SIX_NOTHINGNESS,rand=sixRandom(boos.seed),rows=[];
  for(const[r,ring]of boos.rings.entries())for(let k=0;k<ring.count;k++){
    const a=(k+(r?.5:0)+(rand()-.5)*.3)/ring.count*TAU,radius=ring.radius+(rand()-.5)*5,x=centre.x+Math.cos(a)*radius,z=centre.z+Math.sin(a)*radius,
      ux=(centre.x-x)/radius,uz=(centre.z-z)/radius;
    rows.push(Object.freeze({id:`boo-${r}-${k}`,x,z,yaw:Math.atan2(-ux,uz)}));
  }
  return rows;
})());
export const SIX_CLOCKS=Object.freeze(Array.from({length:SIX_NOTHINGNESS.ruin.count},(_,k)=>Object.freeze({id:`clock-${k}`,angle:k/SIX_NOTHINGNESS.ruin.count*TAU})));
const clockAt=(clock,radius)=>({x:SIX_NOTHINGNESS.centre.x-Math.sin(clock.angle)*radius,z:SIX_NOTHINGNESS.centre.z-Math.cos(clock.angle)*radius});
export const sixClockCentre=clock=>clockAt(clock,SIX_NOTHINGNESS.ruin.stepRadius+SIX_NOTHINGNESS.ruin.distance);
export const sixClockStep=clock=>clockAt(clock,SIX_NOTHINGNESS.ruin.stepRadius);
export const sixRadius=(x,z)=>Math.hypot(x-SIX_NOTHINGNESS.centre.x,z-SIX_NOTHINGNESS.centre.z);
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
