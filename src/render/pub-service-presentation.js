import {pubWorldFromLocal,EXTERIOR_PUB} from '../data/exterior-pub.js';
import {pubQuestState} from '../game/pub-quest.js';
import {ZONE} from '../data/floorplan/legend.js';

// The same vessels have one owner at each step: bar tray, carried tray,
// customers' table, carried empties, returned tray. These are physical props,
// not a second inventory or an independently advancing service clock.
export const PUB_SERVICE_PLACEMENTS=Object.freeze([
  Object.freeze({id:'pub-water-mavis',kind:'water',tableId:'pub-snug-table-0',x:-4.23,z:-30.19}),
  Object.freeze({id:'pub-water-ed',kind:'water',tableId:'pub-snug-table-0',x:-3.74,z:-30.35}),
  Object.freeze({id:'pub-empty-bert',kind:'empty',tableId:'pub-snug-table-1',x:-4.15,z:-28.57}),
  Object.freeze({id:'pub-empty-farah',kind:'empty',tableId:'pub-snug-table-1',x:-3.80,z:-29.02}),
]);

export function pubServiceDrinks(flags={}, {timeSec=0}={}) {
  if(!pubQuestState(flags).watersServed)return {'pub-patron-mavis':null};
  const placement=PUB_SERVICE_PLACEMENTS.find(p=>p.id==='pub-water-mavis'),at=pubWorldFromLocal(placement);
  return {'pub-patron-mavis':{kind:'water',handoff:true,restWorld:[at.x,EXTERIOR_PUB.floor+.790,at.z],timeSec:Math.max(0,Number(timeSec)||0)}};
}

export function pubServiceInstances(flags={}, {source=false,carrier=null,drinksByActor={},tables=true}={}) {
  if(source)return [];
  const state=pubQuestState(flags),out=[];
  for(const vessel of tables?PUB_SERVICE_PLACEMENTS:[]){
    if(vessel.kind==='water'?!state.watersServed:state.emptiesCollected)continue;
    if(vessel.id==='pub-water-mavis'&&drinksByActor['pub-patron-mavis']?.kind==='water')continue;
    const point=pubWorldFromLocal(vessel);
    out.push({id:vessel.id,mesh:vessel.kind==='water'?'pub_service_water_glass':'pub_service_empty_glass',
      x:point.x,y:EXTERIOR_PUB.floor+.790,z:point.z,yaw:0,zone:ZONE.pub,structural:false});
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
