// What can be seen from where you stand. Standing at the goods door that is the
// floor, the sky and the cardboard, and nothing else; the rest of it is only
// there once you have wandered far enough to come upon it.
import {EYE,ZONE} from '../data/floorplan/legend.js';
import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,SIX_FAULT_ARCS,sixAroundClock,sixClockCentre,sixBlinkLit} from '../data/six-nothingness.js';
import {THRESHOLD_GAG_MESHES} from '../data/threshold-gag.js';
import {sixBooAngle,sixScareFigure} from '../game/six-nothingness-scene.js';
import {meshForApparitionPose} from '../game/emergency-light-runtime.js';
import {sixNothingnessGeometry,sixGeometryBounds} from './six-nothingness-models.js';

const TAU=Math.PI*2;
const SHARED={structural:false,decorative:true,zone:ZONE.sourceSpace,noReflection:true,noShadow:true};
// The gag's hinge convention: local -X swings toward local -Z at +PI/2.
const gagMatrix=(x,y,z,yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c,0,s,0,0,1,0,0,-s,0,c,0,x,y,z,1]);};
// About the middle of the world: a clock or sector built on the -Z axis, moved round.
const turned=angle=>{const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
const translated=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}return o;}
const bounds=new Map();
function boundsOf(name){
  if(!bounds.has(name)){
    const{min,max}=sixGeometryBounds(sixNothingnessGeometry().find(row=>row.name===name));
    bounds.set(name,{c:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2],r:Math.hypot(max[0]-min[0],max[1]-min[1],max[2]-min[2])/2});
  }
  return bounds.get(name);
}
function placedBy(name,id,m){
  const{c,r}=boundsOf(name);
  return{...SHARED,id:'six:'+id,mesh:name,matrix:m,x:m[0]*c[0]+m[4]*c[1]+m[8]*c[2]+m[12],y:m[1]*c[0]+m[5]*c[1]+m[9]*c[2]+m[13],z:m[2]*c[0]+m[6]*c[1]+m[10]*c[2]+m[14],cullRadius:r};
}
const placed=(name,id,angle=0)=>placedBy(name,id,turned(angle));
const ALWAYS=Object.freeze(['six_floor','six_flat_face','six_flat_paint','six_flat_back','six_flat_edge','six_flat_timber','six_flat_weight','six_flat_tape','six_flat_ink']);
const faultMeshes=ring=>sixNothingnessGeometry().filter(row=>row.faultRing===ring).map(row=>row.name);
// One arc of a clock's ring: turned to the clock, out to its middle, turned to
// the arc's bearing, then out to the ring.
export const sixFaultArcMatrix=(clock,bearing)=>multiply(multiply(turned(clock.angle),translated(0,0,-(C.ruin.stepRadius+C.ruin.distance))),multiply(turned(bearing),translated(0,0,C.faults.radius)));
export const sixFaultSectorMatrix=angle=>multiply(turned(angle),translated(0,0,-C.faults.outer));

export function sixNothingnessRenderFrame(state,{reducedMotion=false,reducedDread=false}={}){
  // Once the clock has been read it stops blinking.
  const lit=state.exit?true:sixBlinkLit(state.elapsed,{reducedMotion}),near=(p,range)=>Math.hypot(p.x-state.x,p.z-state.z)<range,props=ALWAYS.map(name=>placed(name,name)),
    // One lamp on each side of the board, aimed at it. The floor takes almost none.
    lights=[{id:'six:flat-front',x:0,y:11,z:26,radius:52,intensity:1.7,color:[.92,.78,.58],penetration:0},
      {id:'six:flat-back',x:0,y:6,z:-9,radius:40,intensity:1.6,color:[.95,.88,.74],penetration:0}];
  let nearest=null,nearestDistance=Infinity;
  for(const clock of SIX_CLOCKS){
    if(!state.clocks?.[clock.id])continue;
    props.push(placed('six_ruin_body',`${clock.id}:body`,clock.angle),placed(lit?'six_ruin_lit':'six_ruin_dark',`${clock.id}:face`,clock.angle));
    const at=sixClockCentre(clock),d=Math.hypot(at.x-state.x,at.z-state.z);
    if(d<nearestDistance){nearest=clock;nearestDistance=d;}
  }
  if(nearest&&lit){
    const a=nearest.angle,r=C.ruin.stepRadius+C.ruin.distance*.6;
    lights.push({id:'six:vfd',x:-Math.sin(a)*r,y:C.ruin.bottom+C.ruin.scale,z:-Math.cos(a)*r,radius:30,intensity:2.4,color:[.85,.97,.92],penetration:0});
  }
  // A clock's boos and faults belong to it: they are only there once it is, so
  // the order you come upon them is always 6:00 AM, then the boos, then the faults.
  const nearFaults=faultMeshes('near'),farFaults=faultMeshes('far');
  for(const clock of SIX_CLOCKS)for(const[k,bearing]of SIX_FAULT_ARCS.entries()){
    if(!state.clocks?.[clock.id]||!near(sixAroundClock(clock,bearing,C.faults.radius),C.faults.reveal))continue;
    const m=sixFaultArcMatrix(clock,bearing);for(const name of nearFaults)props.push(placedBy(name,`${name}:${clock.id}:${k}`,m));
  }
  for(let k=0;k<C.faults.sectors;k++){
    const a=k/C.faults.sectors*TAU;
    if(!near({x:C.centre.x-Math.sin(a)*C.faults.outer,z:C.centre.z-Math.cos(a)*C.faults.outer},C.faults.reveal+12))continue;
    const m=sixFaultSectorMatrix(a);for(const name of farFaults)props.push(placedBy(name,`${name}:${k}`,m));
  }
  const fired=[];
  for(const boo of SIX_BOOS){
    if(!state.clocks?.[boo.clock]||!near(boo,C.boos.reveal))continue;
    const y=C.boos.mountHeight,fixed=gagMatrix(boo.x,y,boo.z,boo.yaw),moving=gagMatrix(boo.x,y,boo.z,boo.yaw+sixBooAngle(state,boo,{reducedMotion}));
    THRESHOLD_GAG_MESHES.forEach((mesh,k)=>props.push({...SHARED,id:`six:${boo.id}:${k}`,mesh,matrix:k<2?fixed:moving,x:boo.x,y,z:boo.z,cullRadius:2.6}));
    if(state.fired?.[boo.id])fired.push(boo);
  }
  // A fired boo keeps a little of the light it would have had in the room it was
  // built for. Only the nearest few: the rest stand out there in the dark.
  for(const boo of fired.filter(b=>near(b,16)).sort((a,b)=>Math.hypot(a.x-state.x,a.z-state.z)-Math.hypot(b.x-state.x,b.z-state.z)).slice(0,3)){
    const s=Math.sin(boo.yaw),c=Math.cos(boo.yaw);
    lights.push({id:`six:${boo.id}:lamp`,x:boo.x-c*1.1-s*1.6,y:C.boos.mountHeight+.7,z:boo.z-s*1.1+c*1.6,radius:5,intensity:1.5,color:[.83,.65,.36],penetration:0});
  }
  // The real one: the same body and charge as the apparition the original gag
  // fetches, with a cold light on it so it reads against nothing.
  const figure=sixScareFigure(state,{reducedDread});
  if(figure){
    props.push({id:`six:apparition:${figure.kind}`,mesh:meshForApparitionPose(figure.pose),x:figure.x,y:0,z:figure.z,yaw:figure.yaw,
      apparitionVariant:15,emissive:[.65,.78,.82,figure.charge],structural:false,noShadow:true,noReflection:true,zone:ZONE.sourceSpace,cullRadius:1.6});
    lights.push({id:'six:apparition-light',x:figure.x,y:2.4,z:figure.z,radius:6,intensity:1.8*figure.charge,color:[.78,.88,.95],penetration:0});
  }
  const eye=[state.x,EYE,state.z];
  return{props,lights,lit,figure,eye,authoredCamera:{eye,yaw:state.yaw,pitch:state.pitch}};
}
