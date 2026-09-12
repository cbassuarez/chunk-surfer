import { createBattlePreparationModel } from './battle-preparation-model.js';
import { createBattlePreparationView } from '../render/battle-preparation-view.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { pressControl, cancelControlScope } from './control-feedback.js';
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
  const feedback=name=>audio?.[name]?.({scope:'battle-preparation',profile:'combat'});
  const command=(value,{confirmHeld=false}={})=>{
    if(closed||age<.22||!value)return;
    pressControl(`battle-preparation:${value}`,{held:false});message='';
    const before=model.snapshot();let sound=null;
    if(value==='ready'){
      try{if(!model.commit(apply)){message='Could not save equipment. Try READY again.';feedback('menuDenied');render();return;}}
      catch{message='Could not save equipment. Try READY again.';feedback('menuDenied');render();return;}
      feedback('menuConfirm');closed=true;view?.dispose();cancelControlScope('battle-preparation:');onReady?.({...model.snapshot(),confirmHeld});return;
    }
    if(value.startsWith('tab:')){model.tab(value.slice(4));if(before.page!==model.snapshot().page)sound='menuPage';}
    else if(value.startsWith('slot:')){model.slot(value.slice(5));if(before.selectedSlot!==model.snapshot().selectedSlot)sound='menuMove';}
    else if(value.startsWith('equip:')){const changed=model.equip(value.slice(6));sound=changed?(model.snapshot().replacing?'menuMove':'menuFit'):'menuDenied';}
    else if(value.startsWith('replace:'))sound=model.replace(value.slice(8))?'menuFit':'menuDenied';
    else if(value==='cancel-replace'){if(model.cancelReplace())sound='menuBack';}
    else if(value==='store')sound=model.store()?'menuRemove':'menuDenied';
    else if(value==='inspect'){
      const id=before.loadout.top[before.selectedSlot];
      if(id){view?.visible(false);scenes.push(makeItemInspectionScene({id,title:BATTLE_GEAR[id].label,description:BATTLE_EQUIPMENT_COPY[id]?.detail}));}
      return;
    }
    else if(value.startsWith('skill:')){model.skill(value.slice(6));if(before.selectedSkill!==model.snapshot().selectedSkill)sound='menuMove';}
    else if(value==='patch'){
      const result=model.patch();
      sound=result.changed?(before.build.techniques.includes(before.selectedSkill)?'menuUnpatch':'menuPatch'):'menuDenied';
      if(result.changed)message=result.returned?`${result.returned} ${result.returned===1?'lead':'leads'} returned.`:'Skill patched.';
    }
    if(sound)feedback(sound);render();
  };
  const moveFocus=direction=>{const before=view?.focus();view?.moveFocus(direction);if(view?.focus()!==before)feedback('menuMove');};
  const view=createBattlePreparationView({onActivate:command});render();
  return {
    snapshot:model.snapshot,
    update(dt){age+=Math.max(0,dt);if(paintFor>0){paintFor-=dt;view?.paint();}},
    visible(value){view?.visible(value);},
    dispose(){closed=true;view?.dispose();cancelControlScope('battle-preparation:');},
    key(event){
      if(event.repeat||closed)return true;
      const key=String(event.key||'').toLowerCase(),action=event.controllerAction;
      // Escape backs out of the flip first; only then does it leave the case.
      if(key==='escape'){if(model.snapshot().replacing){command('cancel-replace');return true;}return false;}
      if(['tabNext','tabPrev'].includes(action)||key==='q'||key==='e')command(`tab:${model.snapshot().page==='equipment'?'skills':'equipment'}`);
      else if(action==='start')command('ready',{confirmHeld:true});
      else if(key==='enter'||key===' '||action==='confirm')command(view?.focus()||'ready',{confirmHeld:true});
      else if(key==='tab')moveFocus(event.shiftKey?'prev':'next');
      else{const direction={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down',move_left:'left',move_right:'right',move_up:'up',move_down:'down'}[key]||{move_left:'left',move_right:'right',move_up:'up',move_down:'down'}[action];if(direction)moveFocus(direction);}
      return true;
    },
    pointer(event){
      if(closed)return true;
      if(event.type==='pointerdown'&&(event.originalEvent?.button??0)===0){const hit=view?.hit(event.clientX,event.clientY);if(hit){view.focusButton(hit,false);command(hit);}}
      return true;
    },
  };
}
