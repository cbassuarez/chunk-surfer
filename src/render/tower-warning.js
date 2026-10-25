// The warning uses the already shipped, skinned prior-operator body. Only its
// local material copies differ: its real clothes and anatomy still receive
// ordinary world light, cast shadows and pass through the scene's acquisition.
// No new asset decode, shader, screen layer or translucent apparition is used.
import {ZONE} from '../data/floorplan/legend.js';
import {TOWER_WARNING} from '../data/tower-warning.js';

export const TOWER_WARNING_SOURCE_MESH='outskirts_overprint_body';
export const TOWER_WARNING_MESH='exterior_tower_warning';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,finite(value)));
const q=(axis,angle)=>[axis[0]*Math.sin(angle/2),axis[1]*Math.sin(angle/2),axis[2]*Math.sin(angle/2),Math.cos(angle/2)];

/** Install after the existing outskirts character pack is resident. Repeating
 * the call is harmless; an interrupted/reloaded catalog rebuilds this alias. */
export function installTowerWarningFigure(_gl,pack){
  if(!pack?.catalog)return false;
  const source=pack.catalog.get(TOWER_WARNING_SOURCE_MESH);
  if(!source?.characterAsset||!source?.characterEntry)return false;
  const previous=pack.catalog.get(TOWER_WARNING_MESH);
  if(previous?.towerWarningSource===source)return true;
  const primitives=source.primitives.map(primitive=>{
    const name=String(primitive.materialName||'').toLowerCase();
    // Faces retain anatomical modelling, but nearly no reflected light. The
    // coat can catch a streetlight/torch along its shoulders and moving legs.
    const skin=/skin|eye|hair/.test(name),leather=/leather|sole/.test(name);
    return{...primitive,base:skin?[.025,.027,.030,1]:leather?[.16,.18,.20,1]:[.34,.37,.40,1],
      emissive:[0,0,0],metallic:0,roughness:skin?1:.97,
      materialName:`Tower warning ${name}`,materialRole:'tower-warning'};
  });
  pack.catalog.set(TOWER_WARNING_MESH,{...source,name:TOWER_WARNING_MESH,primitives,
    towerWarningSource:source,extras:{...source.extras,towerWarning:true}});
  return true;
}

/** Pure sampling. walkSeconds is accumulated only for real travelled metres
 * by the encounter runtime; a stopped actor never marches in place. */
export function towerWarningInstances(frame,{zone=ZONE.street,reducedMotion=false}={}){
  if(!frame||frame.visible===false||['absent','gone','complete','done'].includes(frame.phase))return[];
  const p=frame.position||TOWER_WARNING.position;
  if(![p.x,p.y,p.z].every(Number.isFinite))return[];
  const walking=frame.walking===true||frame.phase==='departing'&&frame.blocked!==true&&frame.walking!==false;
  const elapsed=Math.max(0,finite(frame.elapsed));
  const attention=clamp(frame.attentionWeight),speech=frame.speaking&&!reducedMotion?
    (.018+.018*(.5+.5*Math.sin(elapsed*12.7))):0;
  const character={clip:walking?'walk':'idle',loop:true,
    // The shipped 1.1s walk is in place. Slowing it with the .82m/s route
    // preserves a quiet gait; path travel remains the runtime's authority.
    time:walking?Math.max(0,finite(frame.walkSeconds))*.8:reducedMotion?0:elapsed,
    joints:{head:{rotation:q([0,1,0],finite(frame.headYaw)*attention)},
      jaw:{rotation:q([1,0,0],-speech)}}};
  return[{id:TOWER_WARNING.id,mesh:TOWER_WARNING_MESH,x:p.x,y:p.y,z:p.z,
    yaw:finite(frame.yaw,TOWER_WARNING.yaw),scale:1,zone,
    structural:false,interactive:false,blocks:false,character,
    noReflection:false,noShadow:false}];
}
