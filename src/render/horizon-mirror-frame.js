// What stands at Horizon, as prop instances. Two worlds: this side, drawn every
// frame, and the world behind the glass, drawn once into the capture the mirror
// shows. Only the second has St Brendan's in it.
import {EYE,ZONE} from '../data/floorplan/legend.js';
import {HORIZON_MIRROR as C,horizonMirrorBasis,horizonMirrorLocal,horizonMirrorPoint,horizonMirrorReflectionMatrix} from '../data/horizon-mirror.js';
import {meshForApparitionPose} from '../game/emergency-light-runtime.js';

const TAU=Math.PI*2;
const SHARED={structural:false,decorative:true,zone:ZONE.sourceSpace,noReflection:true,noShadow:true};
export const HORIZON_MIRROR_CHURCH_MESH='brendan_church_treated';
export const HORIZON_MIRROR_ANT_MESH='mf_ant_0';
export const HORIZON_MIRROR_SLAB_MESHES=Object.freeze(['mf_ant_slab_side','mf_ant_slab_top','mf_ant_slab_crack']);
// Who can be in the mirror, as what is drawn. Sarah and Lyle are the game's own
// figures and not portraits: from here neither is quite certain.
export const HORIZON_MIRROR_FIGURES=Object.freeze({
  sarah:Object.freeze({mesh:meshForApparitionPose('side'),scale:1.05,charge:.9}),
  lyle:Object.freeze({mesh:meshForApparitionPose('arm_out'),scale:1.08,charge:.9}),
});

function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}return o;}
const translate=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
const scaled=(s,sy=s,sz=s)=>new Float32Array([s,0,0,0,0,sy,0,0,0,0,sz,0,0,0,0,1]);
const aboutZ=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);};
const aboutY=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
// The glass's own frame at a point in it: x along, y up, z out (facing him).
export function horizonMirrorFrameMatrix(along=0,up=0,out=0,scale=1){
  const{n,t}=horizonMirrorBasis(),p=horizonMirrorPoint(along,up,out);
  return new Float32Array([t[0]*scale,0,t[2]*scale,0, 0,scale,0,0, n[0]*scale,0,n[2]*scale,0, p[0],p[1],p[2],1]);
}
function inst(mesh,id,matrix,extra={}){return{...SHARED,id:'hm:'+id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],cullRadius:extra.cullRadius||8,...extra};}
const MIRROR_PARTS=Object.freeze(['hm_mirror_frame','hm_mirror_back','hm_mirror_strut']);
const RIND=Object.freeze(['hm_rind_0','hm_rind_1','hm_rind_2']);
const GROUND=Object.freeze(['hm_floor','hm_road','hm_road_edge']);

// This side: the floor, the road and its edges, the standing mirror and the
// ribbons its frame is coming away in, and the chapel at the far end.
export function horizonMirrorStageProps(){
  const props=[inst('hm_floor','floor',translate(0,0,0),{cullRadius:C.floorRadius}),inst('hm_road','road',translate(0,0,0),{cullRadius:120}),
    inst('hm_road_edge','road-edge',translate(0,0,0),{cullRadius:120})];
  const m=horizonMirrorFrameMatrix();
  for(const mesh of[...MIRROR_PARTS,...RIND])props.push(inst(mesh,mesh,m,{cullRadius:12}));
  const chapel=multiply(translate(C.chapel.x,0,C.chapel.z),scaled(C.chapel.scale));
  for(const mesh of['hm_chapel','hm_chapel_glow'])props.push(inst(mesh,mesh,chapel,{cullRadius:30}));
  return props;
}
export function horizonMirrorStageLights(){
  const lamp=horizonMirrorPoint(0,C.mirror.bottom+C.mirror.height+1.4,2.4),chapelDoor=[C.chapel.x,3.5,C.chapel.z+16];
  return[{id:'hm:mirror-lamp',x:lamp[0],y:lamp[1],z:lamp[2],radius:16,intensity:1.6,color:[.8,.86,.95],penetration:0},
    {id:'hm:chapel-door',x:chapelDoor[0],y:chapelDoor[1],z:chapelDoor[2],radius:26,intensity:1.4,color:[.95,.78,.5],penetration:0}];
}

// The occupant, standing in its own frame (z toward the glass, so toward him).
export function horizonMirrorOccupantProps(occupant,{out=-C.occupantDepth,scale=1,petalsPlucked=0,tag='occupant'}={}){
  const base=horizonMirrorFrameMatrix(0,0,out,scale),props=[];
  if(occupant==='daisy'){
    props.push(inst('hm_daisy_stem',`${tag}:stem`,base,{cullRadius:4}),inst('hm_daisy_disc',`${tag}:disc`,base,{cullRadius:4}));
    const h=C.daisy.height;
    for(let k=Math.max(0,petalsPlucked);k<C.daisy.petals;k++){
      const m=multiply(base,multiply(translate(0,h,0),multiply(aboutZ(k/C.daisy.petals*TAU),translate(0,-h,0))));
      props.push(inst('hm_daisy_petal',`${tag}:petal:${k}`,m,{cullRadius:4}));
    }
  }else if(occupant==='ant'){
    // The field's ant on its stone, the ant grown far past the stone.
    const slab=multiply(base,scaled(12,6,12));
    for(const mesh of HORIZON_MIRROR_SLAB_MESHES)props.push(inst(mesh,`${tag}:${mesh}`,slab,{cullRadius:6}));
    props.push(inst(HORIZON_MIRROR_ANT_MESH,`${tag}:ant`,multiply(base,multiply(translate(0,.24,0),multiply(aboutY(Math.PI/2),scaled(220)))),{cullRadius:5}));
  }else{
    const f=HORIZON_MIRROR_FIGURES[occupant]||HORIZON_MIRROR_FIGURES.sarah;
    props.push(inst(f.mesh,`${tag}:${occupant}`,multiply(base,scaled(f.scale)),{structural:false,apparitionVariant:15,emissive:[.65,.78,.82,f.charge],cullRadius:3}));
  }
  return props;
}

// Behind the glass: this side reflected, the occupant, the mirrors inside the
// mirror (each smaller, each with the occupant again), and St Brendan's.
export function horizonMirrorWorldProps(occupant,{petalsPlucked=0}={}){
  const R=horizonMirrorReflectionMatrix(),props=[];
  for(const p of horizonMirrorStageProps()){
    // A mirror shows only what is in front of it. The ground runs both ways.
    if(MIRROR_PARTS.includes(p.mesh)||(!GROUND.includes(p.mesh)&&horizonMirrorLocal(p.x,p.z).out<0))continue;
    const m=multiply(R,p.matrix);props.push({...p,id:p.id+':reflected',matrix:m,x:m[12],y:m[13],z:m[14]});
  }
  props.push(...horizonMirrorOccupantProps(occupant,{petalsPlucked}));
  const{levels,first,gap,scale}=C.nest;
  for(let k=1;k<=levels;k++){
    const s=Math.pow(scale,k),out=-(first+(k-1)*gap),m=horizonMirrorFrameMatrix(0,0,out,s);
    for(const mesh of[...MIRROR_PARTS,...RIND])props.push(inst(mesh,`nest:${k}:${mesh}`,m,{cullRadius:10}));
    props.push(...horizonMirrorOccupantProps(occupant,{out:out-.9*s,scale:s,petalsPlucked,tag:`nest:${k}`}));
  }
  for(const mesh of['hm_sky_0','hm_sky_1','hm_sky_2'])props.push(inst(mesh,'sky:'+mesh,horizonMirrorFrameMatrix(0,0,-C.capture.distance),{cullRadius:200}));
  const church=multiply(horizonMirrorFrameMatrix(C.church.lateral,0,-C.church.depth),aboutY(C.church.yaw));
  props.push(inst(HORIZON_MIRROR_CHURCH_MESH,'church',church,{cullRadius:40,structural:true}));
  return props;
}
export function horizonMirrorWorldLights(){
  const over=horizonMirrorPoint(0,4.6,-C.occupantDepth+1.4),key=horizonMirrorPoint(.6,2.1,-C.occupantDepth+1.6),church=horizonMirrorPoint(C.church.lateral+6,14,-C.church.depth+18);
  return[{id:'hm:occupant-lamp',x:over[0],y:over[1],z:over[2],radius:9,intensity:1.8,color:[.86,.9,.98],penetration:0},
    {id:'hm:occupant-key',x:key[0],y:key[1],z:key[2],radius:7,intensity:2.6,color:[.9,.93,1],penetration:0},
    {id:'hm:church-lamp',x:church[0],y:church[1],z:church[2],radius:60,intensity:1.6,color:[.95,.82,.58],penetration:0}];
}

export function horizonMirrorRenderFrame(state){
  const eye=[state.x,EYE,state.z];
  return{props:horizonMirrorStageProps(),lights:horizonMirrorStageLights(),eye,authoredCamera:{eye,yaw:state.yaw,pitch:state.pitch}};
}
