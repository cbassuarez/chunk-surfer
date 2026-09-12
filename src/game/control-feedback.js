// Input owns both mechanical travel and sound. Render-time sampling stays pure.
import * as mechanics from './control-mechanics.js';
import { uiCue, UI_CUE, cancelUiCueScope } from '../audio/ui-cues.js';
const held=new Map();
const now=()=>globalThis.performance?.now?.()??Date.now();
const profile=id=>id.startsWith('battle-preparation:')?'combat':id.split(':')[0];
export function pressControl(id,options={}){
  const at=Number.isFinite(options.now)?options.now:now(),previous=held.get(id);
  const result=mechanics.pressControl(id,options);
  if(!result||previous&&(previous.held||at<previous.until))return result;
  held.set(id,{held:options.held!==false,until:at+mechanics.CONTROL_TIMING.minimumPress});
  if(held.size>mechanics.CONTROL_REGISTRY_LIMIT)held.delete(held.keys().next().value);
  uiCue(UI_CUE.PRESS,{scope:id,key:'press',profile:profile(id)});
  if(options.held===false)uiCue(UI_CUE.RELEASE,{scope:id,key:'release',profile:profile(id),delay:mechanics.CONTROL_TIMING.minimumPress/1000});
  return result;
}
export function releaseControl(id,options={}){
  const result=mechanics.releaseControl(id,options),entry=held.get(id);
  if(entry?.held){
    entry.held=false;
    const at=Number.isFinite(options.now)?options.now:now();
    uiCue(UI_CUE.RELEASE,{scope:id,key:'release',profile:profile(id),delay:Math.max(0,entry.until-at)/1000});
  }
  return result;
}
export function cancelControlScope(prefix){
  for(const id of held.keys())if(id.startsWith(prefix))held.delete(id);
  cancelUiCueScope(prefix);
  return mechanics.cancelControlScope(prefix);
}
