import { createBattlePreparationModel } from './battle-preparation-model.js';
import { createBattlePreparationView } from '../render/battle-preparation-view.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { pressControl, cancelControlScope } from './control-mechanics.js';
import * as scenes from './scenes.js';
import {makeItemInspectionScene} from './item-inspection-scene.js';
import {BATTLE_GEAR} from './combat-loadout.js';
import {BATTLE_EQUIPMENT_COPY} from './battle-preparation-model.js';

export function makeBattlePreparation({ getLoadout, getEquipment, getBuild, hasRig, getBattery, apply, onReady, audio } = {}) {
  const model=createBattlePreparationModel({loadout:getLoadout?.(),equipment:getEquipment?.()||[],build:getBuild?.(),hasRig:!!hasRig?.()});
  let age=0,closed=false,message='',paintFor=.25;
  const keys=()=>activeInputPromptDevice()==='controller'
    ? promptLine([{action:'select',label:'SELECT'},{action:'confirm',label:'CONFIRM'},{action:'tabNext',label:'TAB'},{action:'start',label:'READY'}])
    : 'ARROWS / TAB  SELECT · Q / E  TAB · ENTER  CONFIRM';
  const render=()=>{view?.render(model.snapshot(),{battery:getBattery?.()||0,message,keys:keys()});paintFor=.25;};
  const command=(value,{confirmHeld=false}={})=>{
    if(closed||age<.22)return;
    pressControl(`battle-preparation:${value}`,{held:false});audio?.menuConfirm?.();message='';
    if(value==='ready'){
      try{if(!model.commit(apply)){message='Could not save equipment. Try READY again.';render();return;}}
      catch{message='Could not save equipment. Try READY again.';render();return;}
      closed=true;view?.dispose();cancelControlScope('battle-preparation:');onReady?.({...model.snapshot(),confirmHeld});return;
    }
    if(value.startsWith('tab:'))model.tab(value.slice(4));
    else if(value.startsWith('slot:'))model.slot(value.slice(5));
    else if(value.startsWith('equip:'))model.equip(value.slice(6));
    else if(value==='store')model.store();
    else if(value==='inspect'){
      const snap=model.snapshot(),id=snap.loadout.top[snap.selectedSlot];
      if(id){view?.visible(false);scenes.push(makeItemInspectionScene({id,title:BATTLE_GEAR[id].label,description:BATTLE_EQUIPMENT_COPY[id]?.detail}));}
      return;
    }
    else if(value.startsWith('skill:'))model.skill(value.slice(6));
    else if(value==='patch'){const result=model.patch();if(result.changed)message=result.returned?`${result.returned} ${result.returned===1?'lead':'leads'} returned.`:'Skill patched.';}
    render();
  };
  const view=createBattlePreparationView({onActivate:command});render();
  return {
    snapshot:model.snapshot,
    update(dt){age+=Math.max(0,dt);if(paintFor>0){paintFor-=dt;view?.paint();}},
    visible(value){view?.visible(value);},
    dispose(){closed=true;view?.dispose();cancelControlScope('battle-preparation:');},
    key(event){
      if(event.repeat||closed)return true;
      const key=String(event.key||'').toLowerCase(),action=event.controllerAction;
      if(key==='escape')return false;
      if(['tabNext','tabPrev'].includes(action)||key==='q'||key==='e')command(`tab:${model.snapshot().page==='equipment'?'skills':'equipment'}`);
      else if(action==='start')command('ready',{confirmHeld:true});
      else if(key==='enter'||key===' '||action==='confirm')command(view?.focus()||'ready',{confirmHeld:true});
      else if(key==='tab')view?.moveFocus(event.shiftKey?'prev':'next');
      else{const direction={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down',move_left:'left',move_right:'right',move_up:'up',move_down:'down'}[key]||{move_left:'left',move_right:'right',move_up:'up',move_down:'down'}[action];if(direction){view?.moveFocus(direction);audio?.menuMove?.();}}
      return true;
    },
    pointer(event){
      if(closed)return true;
      if(event.type==='pointerdown'&&(event.originalEvent?.button??0)===0){const hit=view?.hit(event.clientX,event.clientY);if(hit){view.focusButton(hit,false);command(hit);}}
      return true;
    },
  };
}
