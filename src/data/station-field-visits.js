// Station occurrences borrow these actual field templates, never their canonical
// night flags, take schedule or compulsory interruption timers.
import {MEMORY_FIELD_VISIT,MEMORY_FIELD} from './memory-field.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const STATION_FIELD_IDS=Object.freeze(['first','second','third','fourth']);
export const STATION_FIELD_WALK_METRES_PER_SECOND=2.4;
export const STATION_FIELD_RETURN_SECONDS=.45;
const landmarks={
 first:{id:'field-bag',x:MEMORY_FIELD_VISIT.first.bag.x,z:MEMORY_FIELD_VISIT.first.bag.z,height:1.02,label:'LOOK AT THE BAG',text:'The same white bag.'},
 second:{id:'field-slab',x:MEMORY_FIELD_VISIT.second.ant.slab.x,z:MEMORY_FIELD_VISIT.second.ant.slab.z,height:.04,label:'LOOK AT THE SLAB',text:'Every crack a ravine.'},
 third:{id:'field-van-door',...MEMORY_FIELD_VISIT.third.door,height:1.1,label:'LOOK AT THE DOOR',text:'The van door. The handle answers.'},
 fourth:{id:'field-van-door',...MEMORY_FIELD_VISIT.fourth.door,height:1.1,label:'LOOK AT THE DOOR',text:'The door. All the weight of it.'},
};
const decays={first:0,second:.08,third:.42,fourth:.7};
export const STATION_FIELD_VISITS=freeze(Object.fromEntries(STATION_FIELD_IDS.map(fieldId=>[fieldId,{
 id:`station-field:${fieldId}`,fieldId,memoryVisit:MEMORY_FIELD_VISIT[fieldId],spawn:{x:0,z:2.65,yaw:0,pitch:.04},snapshotDecay:decays[fieldId],
 returnDoor:{x:0,z:3,halfWidth:MEMORY_FIELD.door.halfWidth,height:MEMORY_FIELD.door.height,reach:2.2,open:true},
 landmark:{...landmarks[fieldId],reach:2.2},deformation:{warningSeconds:4,unmakeSeconds:24},
}])));
export function stationFieldVisit(fieldId,{connectionId='field-return'}={}){
 const visit=STATION_FIELD_VISITS[fieldId];if(!visit)return null;
 const connection=['field-return','field-return-a','field-return-b'].includes(connectionId)?connectionId:'field-return';
 return freeze({...visit,connectionId:connection});
}
