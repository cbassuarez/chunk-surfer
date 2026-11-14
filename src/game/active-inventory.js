// Ownership stays with the real item owners. Readiness and the held preference
// stay in bagLoadout. This is a read model, never a second inventory or weapon.
import {COMBAT_TOP_CAPACITY,normalizeCombatLoadout,selectHeldCombatSlot} from './combat-loadout.js';
import {carryItemDefinition} from './carry-items.js';

export function activeInventoryFrame(loadout,equipment=[]){
  const ready=normalizeCombatLoadout(loadout);
  const owned=new Map((Array.isArray(equipment)?equipment:[]).map(item=>[
    String(typeof item==='string'?item:item?.id||item?.sourceId||''),
    typeof item==='string'?{id:item,present:true}:item,
  ]));
  const slots=Array.from({length:COMBAT_TOP_CAPACITY},(_,index)=>{
    const id=ready.top[index]||null,item=id?owned.get(id):null;
    const present=!!item&&item.present!==false&&!item.deployed;
    const definition=carryItemDefinition(id);
    return {index,number:index+1,id,toolId:definition?.heldModelId||null,
      battleToolId:definition?.battleToolId||null,kind:definition?.kind||null,
      label:item?.title||definition?.label||id||'EMPTY',item,present,
      selected:ready.heldSlot===index,
      status:!id?'empty':!item?'not-owned':item.deployed?'deployed':!present?'missing':'ready'};
  });
  const selected=slots.find(slot=>slot.selected)||null;
  return {loadout:ready,slots,selected,held:selected?.present?selected:null,
    readyCount:slots.filter(slot=>slot.present).length,
    // Stowed tools remain reachable outside contact, as before.
    explorationItems:[...owned.values()].filter(item=>item?.present!==false&&!item?.deployed)};
}

export function cycleHeldInventorySlot(loadout,equipment,direction=1){
  const frame=activeInventoryFrame(loadout,equipment),choices=frame.slots.filter(slot=>slot.present);
  if(!choices.length)return selectHeldCombatSlot(frame.loadout,null);
  const step=direction<0?-1:1,at=choices.findIndex(slot=>slot.selected);
  const next=at<0?(step<0?choices.length-1:0):(at+step+choices.length)%choices.length;
  return selectHeldCombatSlot(frame.loadout,choices[next].index);
}

export function activeInventoryVisible(context={}){
  return !!(context.storyMode&&context.inWorld&&context.bagTaken
    &&!context.paused&&!context.blocksInput&&!context.blocksWorld&&!context.suppressesHud
    &&!context.authoredView&&!context.recording&&!context.listening&&!context.playback
    &&!context.specialSpace);
}
