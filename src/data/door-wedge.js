import {installProceduralMeshes} from '../render/procedural-mesh-install.js';

export const DOOR_WEDGE_MESH='portable_door_wedge';
export const DOOR_WEDGE_SHAPE=Object.freeze({length:.090,width:.045,height:.022,toeHeight:.001});
const {length:l,width:w,height:h,toeHeight:t}=DOOR_WEDGE_SHAPE;
const p=[-w/2,0,-l/2,w/2,0,-l/2,w/2,0,l/2,-w/2,0,l/2,
  -w/2,t,-l/2,w/2,t,-l/2,w/2,h,l/2,-w/2,h,l/2];
const i=[];for(const[a,b,c,d]of[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[3,2,6,7],[0,3,7,4]])i.push(a,b,c,a,c,d);
export const DOOR_WEDGE_GEOMETRY=Object.freeze([Object.freeze({name:DOOR_WEDGE_MESH,p:Object.freeze(p),i:Object.freeze(i),
  base:Object.freeze([.035,.038,.033,1]),emissive:Object.freeze([0,0,0]),roughness:.96,metallic:0,materialRole:'rubber-door-wedge'})]);

// Same resident prop installer as the physical metronome. No generated asset,
// texture, glow, collision proxy or independent rendering context is required.
export function installDoorWedgeMesh(gl,pack){return installProceduralMeshes(gl,pack,DOOR_WEDGE_GEOMETRY);}

// leafMatrix is the actual door leaf transform, including hinge reflection and
// its current opening angle. The wedge protrudes below the free edge; it does
// not float at the threshold centre when the leaf swings away from it.
export function doorWedgeInstance(door,leafMatrix,{zone}={}){
  if(!door?.wedge||door.state!=='open'||door.openFraction!==1||leafMatrix?.length!==16
    ||!Array.from(leafMatrix).every(Number.isFinite))return null;
  const matrix=new Float32Array(leafMatrix),x=Math.max(.12,Number(door.leaf?.width)||.95)-.09,
    y=.001,z=(Number(door.leaf?.depth)||.065)/2+.015;
  for(let axis=0;axis<3;axis++)matrix[12+axis]+=matrix[axis]*x+matrix[4+axis]*y+matrix[8+axis]*z;
  return{id:`door-wedge:${door.id}`,doorId:door.id,mesh:DOOR_WEDGE_MESH,matrix,
    ...(zone==null?{}:{zone}),structural:false,collidable:false,decorative:true,cullRadius:.08};
}
