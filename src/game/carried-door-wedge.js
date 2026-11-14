// One named rubber wedge, initially under B2's corridor leaf. The door endpoint
// owns it while placed; save.items owns it while carried. No inventory count.
export const DOOR_WEDGE_ID='door-wedge';
export const DOOR_WEDGE_SOURCE='b2-corridor';
export const DOOR_WEDGE_RECOVERED_FLAG='door-wedge.recovered';
export const DOOR_WEDGE_TARGETS=Object.freeze([
  'b2-corridor','b1-corridor','room5-corridor',
  ...[1,2,3,4].flatMap(number=>[`practice-west-${number}`,`practice-east-${number}`]),
]);
const carried=save=>Array.isArray(save?.items)&&save.items.includes(DOOR_WEDGE_ID);
const items=save=>Array.isArray(save?.items)?save.items:[];
const fail=reason=>({changed:false,reason,patch:null});
const doorSnapshot=value=>structuredClone(value&&typeof value==='object'?value:{schema:2,states:{}});
const clearMarker=endpoint=>{const next={...endpoint,wedge:false};delete next.wedgeItemId;return next;};

export function doorWedgeTargetAvailability(door){
  if(!door||!DOOR_WEDGE_TARGETS.includes(door.id)||door.archetype!=='practice-acoustic-single'
    ||door.keyId!=null||door.access!=='both'||door.leafCount!==1)return{enabled:false,reason:'NOT AN ORDINARY ACOUSTIC DOOR'};
  if(door.state!=='open'||door.open!==true||door.openFraction!==1)return{enabled:false,reason:'WAIT FOR THE DOOR TO OPEN FULLY'};
  if(door.wedge)return{enabled:false,reason:'A WEDGE IS ALREADY THERE'};
  return{enabled:true,reason:''};
}

export function planPlaceDoorWedge(save,door,{doors=save?.doors}={}){
  if(!carried(save))return fail('WEDGE NOT CARRIED');
  const allowed=doorWedgeTargetAvailability(door);if(!allowed.enabled)return fail(allowed.reason);
  const snapshot=doorSnapshot(doors),endpoint=snapshot.states?.[door.id];
  if(!endpoint||endpoint.state!=='open'||endpoint.wedge)return fail('DOOR STATE CHANGED');
  if(Object.values(snapshot.states).some(value=>value?.wedgeItemId===DOOR_WEDGE_ID&&value.wedge))return fail('WEDGE ALREADY PLACED');
  snapshot.states[door.id]={...endpoint,wedge:true,wedgeItemId:DOOR_WEDGE_ID};
  return{changed:true,reason:null,patch:{items:items(save).filter(id=>id!==DOOR_WEDGE_ID),
    flags:{...(save?.flags||{}),[DOOR_WEDGE_RECOVERED_FLAG]:true},doors:snapshot},
    mutation:{type:'insert-wedge',doorId:door.id}};
}

export function planRecoverDoorWedge(save,event,{doors=save?.doors}={}){
  if(!event?.ok||!event.removedWedge)return fail('NO WEDGE REMOVED');
  const original=event.id===DOOR_WEDGE_SOURCE&&!save?.flags?.[DOOR_WEDGE_RECOVERED_FLAG];
  const ours=DOOR_WEDGE_TARGETS.includes(event.id)&&event.removedWedgeItemId===DOOR_WEDGE_ID;
  if(!original&&!ours)return fail('NOT THE CARRIED WEDGE');
  const snapshot=doorSnapshot(doors);
  if(snapshot.states?.[event.id])snapshot.states[event.id]=clearMarker(snapshot.states[event.id]);
  return{changed:true,reason:null,patch:{items:[...items(save).filter(id=>id!==DOOR_WEDGE_ID),DOOR_WEDGE_ID],
    flags:{...(save?.flags||{}),[DOOR_WEDGE_RECOVERED_FLAG]:true},doors:snapshot}};
}

export function reconcileCarriedDoorWedge(save,{doors=save?.doors}={}){
  const snapshot=doorSnapshot(doors);snapshot.states=snapshot.states&&typeof snapshot.states==='object'?snapshot.states:{};
  const marked=Object.entries(snapshot.states).filter(([,endpoint])=>endpoint?.wedgeItemId===DOOR_WEDGE_ID);
  const valid=marked.filter(([id,endpoint])=>DOOR_WEDGE_TARGETS.includes(id)&&endpoint.wedge&&endpoint.state==='open')
    .sort(([a],[b])=>DOOR_WEDGE_TARGETS.indexOf(a)-DOOR_WEDGE_TARGETS.indexOf(b));
  const placed=valid[0]?.[0]||null,recovered=carried(save)||marked.length>0||save?.flags?.[DOOR_WEDGE_RECOVERED_FLAG]===true;
  for(const[id,endpoint]of marked)if(id!==placed)snapshot.states[id]=clearMarker(endpoint);
  // Once this exact original has left B2, its unmarked authored starting wedge
  // cannot also return after a stale/default endpoint is loaded.
  if(recovered&&placed!==DOOR_WEDGE_SOURCE&&snapshot.states[DOOR_WEDGE_SOURCE]?.wedge)
    snapshot.states[DOOR_WEDGE_SOURCE]=clearMarker(snapshot.states[DOOR_WEDGE_SOURCE]);
  const keepInBag=!placed&&(carried(save)||marked.length>0);
  const nextItems=items(save).filter(id=>id!==DOOR_WEDGE_ID);if(keepInBag)nextItems.push(DOOR_WEDGE_ID);
  const flags={...(save?.flags||{}),...(recovered?{[DOOR_WEDGE_RECOVERED_FLAG]:true}:{})};
  const patch={items:nextItems,flags,doors:snapshot};
  const changed=JSON.stringify(nextItems)!==JSON.stringify(items(save))||JSON.stringify(flags)!==JSON.stringify(save?.flags||{})
    ||JSON.stringify(snapshot)!==JSON.stringify(doors||{schema:2,states:{}});
  return{changed,reason:null,patch:changed?patch:null,
    location:placed?'placed':keepInBag?'carried':recovered?'unavailable':'source',doorId:placed||(!recovered?DOOR_WEDGE_SOURCE:null)};
}

export function bagWedgeItems(save,{door=null}={}){
  if(!carried(save))return[];
  const allowed=doorWedgeTargetAvailability(door);
  return[{id:DOOR_WEDGE_ID,sourceId:DOOR_WEDGE_ID,label:'RUBBER DOOR WEDGE',title:'RUBBER DOOR WEDGE',
    role:'field-tool',icon:'wedge',present:true,readyCapable:true,battleCapable:false,value:'RECOVERABLE',location:'IN THE CASE',
    description:'The rubber wedge from B2. It can hold one ordinary acoustic door fully open; the open doorway also carries sound.',
    facts:[['FOUND','B2 / CORRIDOR DOOR'],['USE','ONE FULLY OPEN ORDINARY ACOUSTIC DOOR'],['RECOVERY','REMOVE FROM THE SAME DOOR']],
    inspectionActions:[{id:'rubber',label:'EXAMINE THE WEDGE',lines:[{who:'direction',text:'A small tapered rubber wedge. Its broad heel is compressed where the B2 leaf rested against it.'}]}],
    primaryAction:{id:'use-door-wedge',label:'USE AT OPEN DOOR',mode:'command',enabled:allowed.enabled,reason:allowed.reason,confirm:null,closeBefore:true}}];
}
