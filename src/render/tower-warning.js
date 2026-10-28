// A dedicated clothed, skinned informant around an opaque negative body.
// Pose, contact, material depth and actual voice clocks stay world-owned.
import {ZONE} from '../data/floorplan/legend.js';
import {TOWER_WARNING} from '../data/tower-warning.js';
import {sampleCharacterPose} from './character-asset.js';
import {missingManMaterialRole} from './missing-man-material.js';
import {installMissingManSmoke,missingManSmokeInstances} from './missing-man-smoke.js';
import {towerWarningPerformance} from './tower-warning-performance.js';

export const TOWER_WARNING_SOURCE_MESH='tower_warning_missing_man';
export const TOWER_WARNING_MESH='exterior_tower_warning';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
let actor=null,lastFrame=null;

export function installTowerWarningFigure(gl,pack){
  if(!pack?.catalog)return false;
  const source=pack.catalog.get(TOWER_WARNING_SOURCE_MESH);
  if(!source?.characterAsset||!source?.characterEntry){actor=null;lastFrame=null;return false;}
  const previous=pack.catalog.get(TOWER_WARNING_MESH);
  if(previous?.towerWarningSource===source){actor=previous;installMissingManSmoke(gl,pack);return true;}
  const primitives=source.primitives.map(p=>{
    const materialRole=missingManMaterialRole(p),core=materialRole==='missing-man-core';
    return{...p,materialRole,...(core?{base:[0,0,0,1],emissive:[0,0,0],metallic:0,roughness:1,alphaCut:0}:{}),
      mainFactors:p.mainFactors?{...p.mainFactors}:undefined};
  });
  actor={...source,name:TOWER_WARNING_MESH,primitives,towerWarningSource:source,
    extras:{...source.extras,towerWarning:true,missingMan:source.characterEntry.extras?.missingMan||source.extras?.missingMan}};
  pack.catalog.set(TOWER_WARNING_MESH,actor);installMissingManSmoke(gl,pack);return true;
}
function bindAnchor(anchor,pose){
  if(!actor||!anchor?.position||!anchor.position.every(Number.isFinite))return null;
  const {characterAsset:asset,characterEntry:entry}=actor;
  const index=entry.skin.joints.findIndex(n=>asset.nodes[n].name===anchor.joint);if(index<0)return null;
  const m=pose.bones.subarray(index*16,index*16+16),p=anchor.position;
  return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
    m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}
function worldAnchor(p,position,yaw){
  if(!p)return null;const c=Math.cos(yaw),s=Math.sin(yaw);
  return[position.x+p[0]*c-p[2]*s,position.y+p[1],position.z+p[0]*s+p[2]*c];
}
function presentation(frame,options={}){
  if(!frame||frame.visible===false||['absent','gone','complete','done','departed'].includes(frame.phase))return null;
  const position=frame.position||TOWER_WARNING.position;if(![position.x,position.y,position.z].every(Number.isFinite))return null;
  const yaw=finite(frame.yaw,TOWER_WARNING.yaw),contract=actor?.extras?.missingMan;
  const performance=towerWarningPerformance(frame,{...options,assetContract:contract});
  let tip=null,sink=null,base=null;
  if(actor&&contract){
    const pose=sampleCharacterPose(actor.characterAsset,actor.characterEntry,performance.character);
    tip=worldAnchor(bindAnchor(contract.anchors?.ember,pose),position,yaw);
    base=worldAnchor(bindAnchor(contract.anchors?.cigaretteBase,pose),position,yaw);
    sink=worldAnchor(bindAnchor(contract.anchors?.face,pose),position,yaw);
  }
  return{position,yaw,performance,tip,sink,base};
}
export function towerWarningInstances(frame,{zone=ZONE.street,...options}={}){
  const view=presentation(frame,options);if(!view){lastFrame=null;return[];}
  const {position:p,yaw,performance,tip,sink}=view;lastFrame=view;
  const body={id:TOWER_WARNING.id,mesh:TOWER_WARNING_MESH,x:p.x,y:p.y,z:p.z,yaw,scale:1,zone,
    structural:false,interactive:false,blocks:false,character:performance.character,
    noReflection:false,noShadow:false};
  const smoke=tip&&sink?missingManSmokeInstances({tip,sink,clock:performance.smoke?.clock??frame.elapsed,
    engaged:frame.phase==='turning'||frame.phase==='speaking',reducedMotion:options.reducedMotion,
    densityScale:.8+(performance.smoke?.energy||0)*.3},{zone}):[];
  return[body,...smoke];
}
export function towerWarningLighting(frame,options={}){
  const listener=options.listener,p=frame?.position||TOWER_WARNING.position;
  if(!listener||Math.hypot(listener.x-p.x,listener.z-p.z)>10)return[];
  const view=presentation(frame,options);if(!view?.tip)return[];
  const [x,y,z]=view.tip;
  return[{id:'tower-warning:cigarette',x,y,z,color:[1,.36,.12],intensity:.16,radius:.19,
    penetration:0,spilling:false,kind:'fitting',circuit:null,maintained:true,floorY:view.position.y,castsShadow:false}];
}
export function towerWarningFigureStatus(){
  return{design:'missing-man',loaded:!!actor,sourceMesh:actor?.towerWarningSource?.name||null,
    materials:actor?.primitives.map(p=>({name:p.materialName,role:p.materialRole}))||[],
    contract:actor?.extras?.missingMan||null,
    current:lastFrame?{tip:lastFrame.tip,base:lastFrame.base,sink:lastFrame.sink,performance:lastFrame.performance}:null};
}
