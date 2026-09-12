// Calls enter this conversation only after the player accepts or transmits.
// Presentation uses the shared instrument panel; the scene owns dialogue,
// held contact choices, audio timing and cleanup.
import * as scenes from './scenes.js';
import { createConversation } from './conversation.js';
import { drawRadioScene, radioSceneLayout } from '../render/radio-scene.js';
import { uiSize } from '../render/ui.js';
import { isRadioControlEvent } from './bindings.js';
import { uiCue, UI_CUE, cancelUiCueScope } from '../audio/ui-cues.js';
import { pressControl, releaseControl, cancelControlScope } from './control-feedback.js';

export const RADIO_CONTACT_HOLD = .65;
export const RADIO_STAGE_HOLDS = Object.freeze({onset:1.2,relay:1.8,decision:1.4,reseat:1.15,still:1.3,break:2.2,after:1.8});
export function radioStageForLine(line={}){
  const id=String(line.sourceId||line.id||'');
  return Object.keys(RADIO_STAGE_HOLDS).find(stage=>id.endsWith(`rupture.${stage}`))||null;
}
const confirm=e=>e.controllerAction==='confirm'||['Enter',' ','z','e'].includes(e.key)||e.code==='KeyE';
const inRect=(e,r)=>r&&e.cellX>=r.x&&e.cellX<=r.x+r.w&&e.cellY>=r.y&&e.cellY<=r.y+r.h;

export function makeRadioScene({id='radio',nodes,startAt='start',terminal=false,dead=false,
  audio,getAudio,cue,onChoice,onDone,onCancel,onExit,onStage,onSuspend,onResume,replay,worldView,
  getReducedMotion=()=>false}={}){
  let scene,ended=false,exited=false,t=0,stage=dead?'after':'live',stageAt=0,holding=null,hold=0;
  let defaultedContact=false,choice=null,releaseRequired=false,suspended=false,unfocused=false,unsubscribe=null;
  let heldControl=null;
  const convo=createConversation({nodes,startAt,sceneId:id,replay,audio,getAudio,volume:.24,
    feedbackScope:`radio:${id}`,feedbackProfile:'radio',
    // Terminal staging owns its equipment cues. Old narrative line triggers
    // cannot double-fire a rupture or leave the global lens in 'rupture'.
    cue:(name,line)=>{if(!terminal)cue?.(name,line);},
    onLine:line=>{
      const next=radioStageForLine(line);
      if(next){stage=next;stageAt=t;onStage?.(next,{choice});}
    },
    onChoice:c=>{choice=c.goto==='reseat'?'reseat':c.goto==='still'?'still':choice;onChoice?.(c);},
    onDone:()=>finish(false),
  });
  function finish(cancelled){
    if(ended)return;ended=true;scenes.remove(scene);
    if(cancelled)uiCue(UI_CUE.BACK,{scope:`radio:${id}`,profile:'radio'});
    if(cancelled)onCancel?.();else onDone?.({choice});
  }
  function contact(){const v=convo.view();return v.nodeId==='contact'&&!!v.pending?.options?.length;}
  function ready(){return !terminal||t-stageAt>=(RADIO_STAGE_HOLDS[stage]||0);}
  const controlPrefix=()=>`radio:${id}:${convo.view().nodeId}:`;
  function pressChoice(index,held=false){
    const control=`${controlPrefix()}${index}`;pressControl(control,{held});if(held)heldControl=control;
  }
  function select(index,{sound=true}={}){
    cancelHold();
    if(contact())defaultedContact=true;
    convo.selectChoice(index,{sound});
  }
  function cancelHold({silent=false}={}){holding=null;hold=0;if(heldControl)releaseControl(heldControl);heldControl=null;
    if(silent)cancelUiCueScope(`radio:${id}`);
  }
  scene={id:`radio:${id}`,blocksInput:true,blocksWorld:true,suppressesHud:true,allowsLook:false,
    handlesEscape:!terminal,lookProfile:'calm',
    enter(){
      unsubscribe=scenes.subscribe(()=>{if(!exited&&scenes.top()!==scene){suspended=true;cancelHold({silent:true});onSuspend?.();}});
      convo.start();
    },
    exit(){if(exited)return;exited=true;unsubscribe?.();cancelHold();cancelControlScope(`radio:${id}:`);cancelUiCueScope(`radio:${id}`);convo.stop();audio?.stopTyping?.();onExit?.();},
    resume(){cancelHold();releaseRequired=false;suspended=false;onResume?.();},
    blur(){cancelHold({silent:true});releaseRequired=false;suspended=true;unfocused=true;onSuspend?.();},
    focus(){unfocused=false;suspended=false;cancelHold();onResume?.();},
    worldView:typeof worldView==='function'?()=>worldView({stage,age:t-stageAt,time:t,choice,reducedMotion:getReducedMotion()}):undefined,
    view(){const view=convo.view();return {...view,layout:radioSceneLayout(uiSize(),view),viewport:uiSize(),radio:{stage,age:t-stageAt,time:t,hold,choice,terminal,dead,ready:ready(),contact:contact(),controlPrefix:controlPrefix()}};},
    update(dt){
      if(ended||exited||unfocused)return;
      if(scenes.top()!==scene){if(!suspended){suspended=true;cancelHold({silent:true});onSuspend?.();}return;}
      if(suspended){suspended=false;onResume?.();}
      const step=Math.max(0,Math.min(.1,Number(dt)||0));t+=step;convo.update(step);
      if(contact()&&!defaultedContact){
        defaultedContact=true;const options=convo.view().pending.options;
        select(Math.max(0,options.findIndex(c=>c.goto==='still')),{sound:false});
      }
      if(holding&&contact()&&ready()){
        hold+=step;
        if(hold>=RADIO_CONTACT_HOLD){cancelHold();releaseRequired=true;convo.key({key:'Enter'});}
      }
    },
    key(e){
      if(!terminal&&isRadioControlEvent(e)){finish(true);return true;}
      if(e.key==='Escape'){cancelHold();if(!terminal)finish(true);else{suspended=true;onSuspend?.();}return !terminal;}
      if(e.repeat)return true;
      if(!ready())return true;
      if(contact()){
        if(!defaultedContact){select(Math.max(0,convo.view().pending.options.findIndex(c=>c.goto==='still')),{sound:false});}
        if(['ArrowUp','ArrowDown','w','s'].includes(e.key)){cancelHold();return convo.key(e);}
        const index=Number(e.key)-1;
        // Numeric shortcuts select only. Nothing can bypass the physical hold.
        if(Number.isInteger(index)&&index>=0&&index<convo.view().pending.options.length){select(index);return true;}
        if(confirm(e)&&!releaseRequired){holding={kind:'key',code:e.code||e.key};hold=0;pressChoice(convo.view().pending.index,true);}
        return true;
      }
      const pending=convo.view().pending;
      if(pending?.options?.length){const number=Number(e.key)-1;
        if(confirm(e))pressChoice(pending.index);
        else if(Number.isInteger(number)&&number>=0&&number<pending.options.length)pressChoice(number);
      }
      if(confirm(e))return convo.key({...e,key:'Enter'});
      return convo.key(e);
    },
    keyup(e){
      if(confirm(e)||e.code===holding?.code){cancelHold();releaseRequired=false;}
      return convo.keyup?.(e)||true;
    },
    pointer(e){
      if(e.type==='pointercancel'){cancelHold();return true;}
      if(e.type==='pointerup'){cancelHold();releaseRequired=false;return true;}
      const layout=radioSceneLayout(uiSize(),convo.view());
      if(e.type==='pointermove'&&holding?.kind==='pointer'&&!inRect(e,layout.choices[holding.index]))cancelHold();
      if(e.type!=='pointerdown'||e.button>0||!ready())return true;
      const index=layout.choices.findIndex(r=>inRect(e,r));
      if(index>=0){select(index);pressChoice(index,contact());if(contact()){holding={kind:'pointer',index};hold=0;}else convo.key({key:'Enter'});}
      else if(!contact())convo.key({key:'Enter'});
      return true;
    },
    render(){drawRadioScene(scene.view(),{reducedMotion:getReducedMotion()});},
  };
  return scene;
}
