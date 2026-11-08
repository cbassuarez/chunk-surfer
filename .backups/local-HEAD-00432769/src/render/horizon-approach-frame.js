// What is there, as prop instances, placed on the map. The renderer's curved space
// takes it from here: nothing in this file knows the space is curved.
import {EYE,ZONE} from '../data/floorplan/legend.js';
import {HORIZON_APPROACH as C,spaceEyeUniform} from '../data/horizon-approach.js';
import {HORIZON_TOWER_BEARING} from '../game/horizon-approach-scene.js';
import {meshForApparitionPose} from '../game/emergency-light-runtime.js';
import {horizonStairsMeshes} from './horizon-approach-models.js';
import {SOURCE_ESCHER_EXTENT} from './source-continuation-escher.js';

const TAU=Math.PI*2;
const SHARED={structural:false,decorative:true,zone:ZONE.sourceSpace,noReflection:true,noShadow:true};
export const HORIZON_CHURCH_MESH='brendan_church_treated';
export const HORIZON_MASONRY=Object.freeze({bay:'source_ii_ellery_bay',corner:'source_ii_ellery_corner',buttress:'source_ii_chapel_buttress',arch:'source_ii_arch_voussoirs',cap:'source_ii_tower_cap'});
export const HORIZON_ANT_MESH='mf_ant_0';
export const HORIZON_SLAB_MESHES=Object.freeze(['mf_ant_slab_side','mf_ant_slab_top','mf_ant_slab_crack']);
export const HORIZON_DAISY_MESHES=Object.freeze(['mf_hero_disc','mf_hero_stem']);
// Sarah and Lyle (he/him) are the game's own figures and not portraits: from here
// neither is quite certain.
export const HORIZON_FIGURES=Object.freeze({
  sarah:Object.freeze({mesh:meshForApparitionPose('side'),scale:1.05,charge:.9}),
  lyle:Object.freeze({mesh:meshForApparitionPose('arm_out'),scale:1.08,charge:.9}),
});
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}return o;}
const translate=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
const scaled=(s,sy=s,sz=s)=>new Float32Array([s,0,0,0,0,sy,0,0,0,0,sz,0,0,0,0,1]);
const I4=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const aboutY=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
const aboutZ=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);};
const aboutX=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);};
function inst(mesh,id,matrix,extra={}){return{...SHARED,id:'ha:'+id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],cullRadius:400,...extra};}
const atMap=(r,phi,y=0)=>[r*Math.sin(phi),y,r*Math.cos(phi)];
// Stood at r on bearing phi, facing the object.
const standing=(r,phi,{scale=1,turn=0,y=0}={})=>multiply(multiply(translate(...atMap(r,phi,y)),aboutY(phi+turn)),scaled(scale));

// The object, at the origin of the map, facing the way he came.
export function horizonApproachObjectProps(state,phi=0){
  const base=multiply(aboutY(phi),scaled(1)),props=[],occupant=state.occupant;
  if(occupant==='daisy'){
    const H=C.daisy.height,head=multiply(multiply(multiply(base,translate(0,H,0)),aboutX(-.35)),scaled(2));
    props.push(inst('mf_hero_stem','daisy:stem',multiply(multiply(base,translate(0,H,0)),scaled(2,H,2))),inst('mf_hero_disc','daisy:disc',head));
    for(let k=Math.max(0,state.petalsPlucked||0);k<C.daisy.petals;k++)props.push(inst('ha_daisy_petal',`daisy:petal:${k}`,multiply(head,aboutZ(k/C.daisy.petals*TAU))));
  }else if(occupant==='ant'){
    // The field's own ant on its own stone. The stone is the size of a stone.
    const slab=multiply(base,scaled(2.4,2,2.4));
    for(const mesh of HORIZON_SLAB_MESHES)props.push(inst(mesh,`slab:${mesh}`,slab));
    props.push(inst(HORIZON_ANT_MESH,'ant',multiply(multiply(base,translate(0,.085,.1)),scaled(9))));
  }else{
    const f=HORIZON_FIGURES[occupant]||HORIZON_FIGURES.sarah;
    props.push(inst(f.mesh,`figure:${occupant}`,multiply(base,scaled(f.scale)),{apparitionVariant:15,emissive:[.65,.78,.82,f.charge]}));
  }
  return props;
}
// One arch of Source's own over every road, twice on the way. That is all the closed
// space needs: the rest is what the space does to the roads.
function closedLandscape(){
  const V=C.variants.closed,end=Math.PI*V.radius,props=[],spacing=TAU/V.roads;
  for(let k=0;k<V.roads;k++)for(const share of[.34,.66])props.push(inst(HORIZON_MASONRY.arch,`road:${k}:${share}`,standing(end*share,k*spacing,{scale:.72})));
  return props;
}
function circleLimitLandscape(){
  const R=C.variants['circle-limit'].radius,props=[];
  // Masonry stood on the rings, the same walls again and again, smaller and smaller.
  for(const[share,count,mesh,scale]of[[1.6,5,HORIZON_MASONRY.corner,.1],[2.6,10,HORIZON_MASONRY.bay,.1],[3.4,20,HORIZON_MASONRY.corner,.13]]){
    for(let k=0;k<count;k++)props.push(inst(mesh,`ring:${share}:${k}`,standing(share*R,(k+.5)/count*TAU,{scale,turn:Math.PI/2})));
  }
  return props;
}
// The construction Source II falls through, a cell at a time. Its own turnings: each
// cell's down is at right angles to its neighbours'.
function relativityLandscape(){
  const V=C.variants.relativity,e=SOURCE_ESCHER_EXTENT.center,P=V.cell,props=[],meshes=horizonStairsMeshes();
  const centre=translate(-e[0],-e[1],-e[2]),turns=[I4,aboutZ(Math.PI/2),aboutX(Math.PI/2),aboutZ(Math.PI),aboutX(-Math.PI/2),aboutZ(-Math.PI/2)];
  for(let ix=-1;ix<=1;ix++)for(let iy=-1;iy<=1;iy++)for(let iz=-3;iz<=3;iz++){
    // The column the road runs through is left clear.
    if(ix===0&&iy===0)continue;
    const turn=turns[((ix+1)*5+(iy+1)*3+(iz+3))%turns.length],m=multiply(multiply(multiply(translate(ix*P,iy*P,iz*P+6),turn),scaled(V.scale)),centre);
    for(const mesh of meshes)props.push(inst(mesh,`stairs:${ix}:${iy}:${iz}:${mesh}`,m));
  }
  return props;
}
function destinations(variant){
  const V=C.variants[variant],closed=variant==='closed',far=closed?Math.PI*V.radius*.84:variant==='relativity'?V.roadEnd:V.radius*3.4,s=variant==='circle-limit'?.16:closed?.55:1;
  const props=[inst(HORIZON_CHURCH_MESH,'church',standing(far,HORIZON_TOWER_BEARING,{scale:s,turn:Math.PI}),{structural:true})];
  for(const[k,side]of[[0,-1],[1,1],[2,-1],[3,1]])props.push(inst(HORIZON_MASONRY.buttress,`chapel:${k}`,standing(far,(variant==='relativity'?Math.PI:-HORIZON_TOWER_BEARING)+side*.09+k*.02,{scale:.6*s,turn:Math.PI/2*side})));
  return props;
}
const GROUND=Object.freeze({closed:['ha_closed_road','ha_closed_hub','ha_closed_line'],'circle-limit':['ha_tile_dark','ha_tile_light','ha_tile_line'],relativity:['ha_road','ha_road_line','ha_hub']});
const LANDSCAPE=Object.freeze({closed:closedLandscape,'circle-limit':circleLimitLandscape,relativity:relativityLandscape});
export function horizonApproachRenderFrame(state){
  const V=C.variants[state.variant],I=translate(0,0,0),props=[];
  for(const mesh of GROUND[state.variant])props.push(inst(mesh,mesh,I));
  if(state.variant==='relativity'&&state.offerOpen)props.push(inst('ha_side','side',I),inst('ha_side_line','side-line',I));
  props.push(...LANDSCAPE[state.variant](),...destinations(state.variant),...horizonApproachObjectProps(state));
  const lights=[{id:'ha:key',x:.5,y:1.5,z:1.4,radius:3.2,intensity:2.2,color:[.9,.93,1],penetration:0},
    {id:'ha:over',x:0,y:3.4,z:-.5,radius:4,intensity:.8,color:[.86,.9,.98],penetration:0}];
  const eye=[0,EYE,0];
  return{props,lights,eye,authoredCamera:{eye,yaw:state.yaw,pitch:state.pitch},space:{sign:V.sign,radius:V.radius,eyeHeight:EYE,eye:spaceEyeUniform(V.sign,V.radius,state.frame,EYE)}};
}
