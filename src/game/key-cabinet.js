// Pure runtime contract for the box-office key cabinet. Inventory and saving
// stay with main.js; this module owns only selection semantics and the transient
// wrong-ring motion so reloads can never preserve a half-dropped key ring.

export const KEY_CABINET_RING = Object.freeze({
  'CH-04': Object.freeze({id:'box-office-key-ring-ch04',mesh:'chapel_key_ring_ch04',outcome:'drop'}),
  'C-17': Object.freeze({id:'box-office-key-ring-c17',mesh:'chapel_key_ring_c17',outcome:'take'}),
  'FOH-M': Object.freeze({id:'box-office-key-ring-fohm',mesh:'chapel_key_ring_fohm',outcome:'drop'}),
});

export const KEY_CABINET_DROP_MS=720;
export const KEY_CABINET_IMPACT_PROGRESS=.38;

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));

export function keyCabinetSelection(tag=''){
  return KEY_CABINET_RING[String(tag)]?.outcome||null;
}

export function keyCabinetReactionNode(tag='',identified=false){
  if(String(tag)==='C-17')return identified?'known_take':'early_take';
  return identified?'known_drop':'early_drop';
}

export function keyCabinetKeyIdentified({ledger=false,identified=false,corridorDiscovered=false}={}){
  return !!(ledger||identified||corridorDiscovered);
}

export function startKeyCabinetDrop(id,now=0){
  const ring=Object.values(KEY_CABINET_RING).find((entry)=>entry.id===id);
  if(!ring||ring.outcome!=='drop')return null;
  return Object.freeze({id,startedAt:Number(now)||0,impactEmitted:false});
}

export function stepKeyCabinetDrop(value,now=0){
  if(!value)return{state:null,active:false,pose:null,impact:false,done:true};
  const progress=clamp01(((Number(now)||0)-value.startedAt)/KEY_CABINET_DROP_MS);
  const impact=!value.impactEmitted&&progress>=KEY_CABINET_IMPACT_PROGRESS;
  const state=impact?Object.freeze({...value,impactEmitted:true}):value;
  const fall=progress<=KEY_CABINET_IMPACT_PROGRESS
    ? Math.pow(progress/KEY_CABINET_IMPACT_PROGRESS,2)
    : 1-Math.pow((progress-KEY_CABINET_IMPACT_PROGRESS)/(1-KEY_CABINET_IMPACT_PROGRESS),3);
  const direction=value.id.endsWith('ch04')?1:-1;
  const done=progress>=1;
  return{
    state:done?null:state,
    active:!done,
    pose:done?null:{dy:-.34*fall,dz:.045*fall,dyaw:direction*.52*fall},
    impact,
    done,
  };
}
