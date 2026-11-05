// What can be seen from where you stand. Standing at the goods door that is the
// floor, the sky and the cardboard, and nothing else; the rest of it is only
// there once you have wandered far enough to come upon it.
import {EYE,ZONE} from '../data/floorplan/legend.js';
import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,sixClockCentre,sixBlinkLit} from '../data/six-nothingness.js';
import {THRESHOLD_GAG_MESHES} from '../data/threshold-gag.js';
import {sixBooAngle} from '../game/six-nothingness-scene.js';
import {sixNothingnessGeometry,sixGeometryBounds} from './six-nothingness-models.js';

const TAU=Math.PI*2;
const SHARED={structural:false,decorative:true,zone:ZONE.sourceSpace,noReflection:true,noShadow:true};
// The gag's hinge convention: local -X swings toward local -Z at +PI/2.
const gagMatrix=(x,y,z,yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c,0,s,0,0,1,0,0,-s,0,c,0,x,y,z,1]);};
// About the middle of the world: a clock or sector built on the -Z axis, moved round.
const turned=angle=>{const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
const bounds=new Map();
function boundsOf(name){
  if(!bounds.has(name)){
    const{min,max}=sixGeometryBounds(sixNothingnessGeometry().find(row=>row.name===name));
    bounds.set(name,{c:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2],r:Math.hypot(max[0]-min[0],max[1]-min[1],max[2]-min[2])/2});
  }
  return bounds.get(name);
}
function placed(name,id,angle=0){
  const{c,r}=boundsOf(name),m=turned(angle);
  return{...SHARED,id:'six:'+id,mesh:name,matrix:m,x:m[0]*c[0]+m[8]*c[2],y:c[1],z:m[2]*c[0]+m[10]*c[2],cullRadius:r};
}
const ALWAYS=Object.freeze(['six_floor','six_flat_face','six_flat_paint','six_flat_back','six_flat_edge','six_flat_timber','six_flat_weight','six_flat_tape','six_flat_ink']);
const FAULT_MESHES=Object.freeze(['six_fault_0','six_fault_1','six_fault_2','six_fault_3']);

export function sixNothingnessRenderFrame(state,{reducedMotion=false}={}){
  const lit=sixBlinkLit(state.elapsed,{reducedMotion}),near=(p,range)=>Math.hypot(p.x-state.x,p.z-state.z)<range,props=ALWAYS.map(name=>placed(name,name)),
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
  for(let k=0;k<C.faults.sectors;k++){
    const a=k/C.faults.sectors*TAU;
    if(!near({x:C.centre.x-Math.sin(a)*C.faults.radius,z:C.centre.z-Math.cos(a)*C.faults.radius},C.faults.reveal))continue;
    for(const name of FAULT_MESHES)props.push(placed(name,`${name}:${k}`,a));
  }
  const fired=[];
  for(const boo of SIX_BOOS){
    if(!near(boo,C.boos.reveal))continue;
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
  const eye=[state.x,EYE,state.z];
  return{props,lights,lit,eye,authoredCamera:{eye,yaw:state.yaw,pitch:state.pitch}};
}
