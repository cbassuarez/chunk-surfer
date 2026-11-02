import {pubPhysicalFromLocal,EXTERIOR_PUB} from '../data/exterior-pub.js';
import {pubQuestState} from '../game/pub-quest.js';
import {ZONE} from '../data/floorplan/legend.js';

// The same vessels have one owner at each step: bar tray, carried tray,
// customers' table, carried empties, returned tray. These are physical props,
// not a second inventory or an independently advancing service clock.
export const PUB_SERVICE_PLACEMENTS=Object.freeze([
  Object.freeze({id:'pub-water-mavis',kind:'water',tableId:'pub-snug-table-0',x:-4.23,z:-30.19}),
  // Public-side tabletop edge: visible beside Ed rather than through his back.
  Object.freeze({id:'pub-water-ed',kind:'water',tableId:'pub-snug-table-0',x:-3.80,z:-29.85}),
  Object.freeze({id:'pub-empty-bert',kind:'empty',tableId:'pub-snug-table-1',x:-4.15,z:-28.57}),
  Object.freeze({id:'pub-empty-farah',kind:'empty',tableId:'pub-snug-table-1',x:-3.80,z:-29.02}),
]);

// The controller owns onset, elapsed time, suspension and release. This is one
// glass in the ordinary service flow, not a room-wide shake or another clock.
// The liquid is a primitive of this same mesh and retains its authored pose.
export function applyPubPressureToGlass(instance,frame){
  if(instance?.id!=='pub-water-ed'||instance.mesh!=='pub_service_water_glass')return instance;
  const amount=Number.isFinite(frame?.amount)?Math.max(0,Math.min(1,frame.amount)):0;
  if(!amount||frame?.active===false||frame?.reducedMotion||frame?.reduceMotion||frame?.reduceFlash
    ||['off','finished','complete','done','cancelled','cleared'].includes(frame?.phase))return instance;
  if(![instance.x,instance.y,instance.z].every(Number.isFinite))return instance;
  const elapsed=Number.isFinite(frame?.elapsed)?Math.max(0,frame.elapsed):0;
  const wave=(hz,phase=0)=>Math.sin(elapsed*2*Math.PI*hz+phase);
  const pitch=amount*(.55*Math.PI/180)*(wave(13)+.28*wave(19,.7))/1.28;
  const roll=amount*(.38*Math.PI/180)*wave(17,.45);
  const cx=Math.cos(pitch),sx=Math.sin(pitch),cz=Math.cos(roll),sz=Math.sin(roll);
  const dx=amount*.00035*wave(11,.2),dz=amount*.00030*wave(15,.6);
  // The .028m bottom rim rocks on its lowest edge. Lifting by its projected
  // radius prevents the tiny tilt pushing half the base through the table.
  const lift=(.035*.8)*Math.hypot(sz,cz*sx);
  const local=[cz,sz,0,0,-sz*cx,cz*cx,sx,0,sz*sx,-cz*sx,cx,0,dx,lift,dz,1];
  const yaw=Number.isFinite(instance.yaw)?instance.yaw:0,c=Math.cos(yaw),s=Math.sin(yaw);
  const scale=Number.isFinite(instance.scale)?instance.scale:1;
  const scaleX=scale*(Number.isFinite(instance.scaleX)?instance.scaleX:1);
  const scaleY=scale*(Number.isFinite(instance.scaleY)?instance.scaleY:1);
  const scaleZ=scale*(Number.isFinite(instance.scaleZ)?instance.scaleZ:1);
  const base=instance.matrix?.length===16&&Array.from(instance.matrix).every(Number.isFinite)?instance.matrix:
    [c*scaleX,0,s*scaleX,0,0,scaleY,0,0,-s*scaleZ,0,c*scaleZ,0,instance.x,instance.y,instance.z,1];
  const matrix=new Float32Array(16);
  for(let column=0;column<4;column++)for(let row=0;row<4;row++)
    matrix[column*4+row]=base[row]*local[column*4]+base[4+row]*local[column*4+1]
      +base[8+row]*local[column*4+2]+base[12+row]*local[column*4+3];
  return{...instance,matrix};
}

export function pubServiceDrinks(flags={}, {timeSec=0}={}) {
  if(!pubQuestState(flags).watersServed)return {'pub-patron-mavis':null};
  const placement=PUB_SERVICE_PLACEMENTS.find(p=>p.id==='pub-water-mavis'),at=pubPhysicalFromLocal(placement);
  return {'pub-patron-mavis':{kind:'water',handoff:true,restWorld:[at.x,EXTERIOR_PUB.floor+.790,at.z],timeSec:Math.max(0,Number(timeSec)||0)}};
}

export function pubServiceInstances(flags={}, {source=false,carrier=null,drinksByActor={},tables=true,pressureFrame=null}={}) {
  if(source)return [];
  const state=pubQuestState(flags),out=[];
  for(const vessel of tables?PUB_SERVICE_PLACEMENTS:[]){
    if(vessel.kind==='water'?!state.watersServed:state.emptiesCollected)continue;
    if(vessel.id==='pub-water-mavis'&&drinksByActor['pub-patron-mavis']?.kind==='water')continue;
    const point=pubPhysicalFromLocal(vessel);
    out.push(applyPubPressureToGlass({id:vessel.id,mesh:vessel.kind==='water'?'pub_service_water_glass':'pub_service_empty_glass',
      x:point.x,y:EXTERIOR_PUB.floor+.790,z:point.z,yaw:0,zone:ZONE.pub,structural:false},pressureFrame));
  }
  if(state.carryingTray&&carrier?.eye&&Number.isFinite(carrier.yaw)){
    const {eye,yaw}=carrier;
    // Kept level at waist/chest height. Looking down reveals its current load;
    // camera pitch never tips the glasses or changes the controls.
    const mesh=state.trayLoad==='waters'?'pub_service_tray_loaded'
      :state.trayLoad==='empties'?'pub_service_tray_empty':'pub_service_tray_bare';
    out.push({id:'pub-carried-service-tray',mesh,
      x:eye.x+Math.sin(yaw)*.53,y:eye.y-.51,z:eye.z-Math.cos(yaw)*.53,
      yaw,zone:ZONE.pub,structural:false});
  }
  return out;
}
