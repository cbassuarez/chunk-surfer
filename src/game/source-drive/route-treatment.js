// Static, physically built road changes. The remembered journey can hide the
// way ahead, but neither weather nor player hesitation moves the road edges.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*t*(10+t*(-15+6*t));};
export const DRIVE_PREDICAMENT_SECTIONS=Object.freeze([
 Object.freeze({id:'the-queue',start:145,end:465,title:'The queue on the cliff',full:[212,390]}),
 Object.freeze({id:'the-white-sea',start:945,end:1165,title:'The white sea',full:[1000,1090]}),
]);
export function roadTreatmentAt(distance=0){
 const d=Number.isFinite(distance)?distance:0;
 const pinch=ease(145,212,d)*(1-ease(390,465,d));
 const expanse=ease(945,1000,d)*(1-ease(1090,1165,d));
 return{pinch,expanse,halfWidth:3.25-1.58*pinch+24*expanse,
  shoulderWidth:1.6-1.42*pinch-.95*expanse,
  boundaryClearance:1.2641-1.0041*pinch-.6841*expanse,
  snowCover:ease(972,1025,d)*(1-ease(1095,1172,d)),
  section:pinch>.05?'the-queue':expanse>.05?'the-white-sea':'ordinary'};
}
