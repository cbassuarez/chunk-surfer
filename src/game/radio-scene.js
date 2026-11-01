// Calls enter this conversation only after the player accepts or transmits.
// Presentation uses the carried instrument; the scene owns dialogue,
// held contact choices, audio timing and cleanup.
import * as scenes from './scenes.js';
import { createConversation } from './conversation.js';
import { drawRadioScene, radioSceneLayout } from '../render/radio-scene.js';
import { uiSize } from '../render/ui.js';
import { isRadioControlEvent } from './bindings.js';
import { uiCue, UI_CUE, cancelUiCueScope } from '../audio/ui-cues.js';
import { pressControl, releaseControl, cancelControlScope } from './control-feedback.js';
import { createRadioInstrument } from './radio-instrument.js';
import { RADIO_DESK_CHANNEL } from '../render/radio-contact-performance.js';
import { warmRadioContact3D, disposeRadioContact3D } from '../render/radio-contact-3d.js';

export const RADIO_CONTACT_HOLD = .65;
export const RADIO_STAGE_HOLDS = Object.freeze({onset:1.2,relay:1.8,decision:1.4,reseat:1.15,still:1.3,break:2.2,after:1.8});
export function radioStageForLine(line={}){
  const id=String(line.sourceId||line.id||'');
  return Object.keys(RADIO_STAGE_HOLDS).find(stage=>id.endsWith(`rupture.${stage}`))||null;
}
const confirm=e=>e.controllerAction?e.controllerAction==='confirm':['Enter',' ','z','e'].includes(e.key)||e.code==='KeyE';
const inRect=(e,r)=>r&&e.cellX>=r.x&&e.cellX<=r.x+r.w&&e.cellY>=r.y&&e.cellY<=r.y+r.h;

export function makeRadioScene({id='radio',nodes,startAt='start',terminal=false,dead=false,
  audio,getAudio,cue,onChoice,onDone,onCancel,onExit,onStage,onSuspend,onResume,replay,worldView,
  getReducedMotion=()=>false,onInstrumentControl,onVolume,onTuneAway,onEgg,canEgg,eggHeard,
  getInstrumentProtected=()=>false,getHardwareReady}={}){
  let scene,ended=false,exited=false,t=0,stage=dead?'after':'live',stageAt=0,holding=null,hold=0;
  let defaultedContact=false,choice=null,releaseRequired=false,suspended=false,unfocused=false,unsubscribe=null;
  let heldControl=null,keyStuck=false,keyStuckAt=null,seamRevealed=false,hardwarePresented=false;
  const instrument=createRadioInstrument({onControl:onInstrumentControl,onVolume,onTuneAway,onEgg,canEgg,eggHeard});
  const convo=createConversation({nodes,startAt,sceneId:id,replay,audio,getAudio,volume:.24,
    feedbackScope:`radio:${id}`,feedbackProfile:'radio',
    // Terminal staging owns its equipment cues. Old narrative line triggers
    // cannot double-fire a rupture or leave the global lens in 'rupture'.
    cue:(name,line)=>{if(!terminal)cue?.(name,line);},
    onLine:line=>{
      const source=String(line.sourceId||line.id||'');
      if(source.endsWith('relay.line.3')){keyStuck=true;keyStuckAt=t;onInstrumentControl?.('fault',{id:'ptt-fault'});}
      if(source.endsWith('contact.line.seam'))seamRevealed=true;
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
  function canTune(){const v=convo.view();return !terminal&&!dead&&!getInstrumentProtected()&&v.nodeId==='request'&&v.pending?.kind==='branch';}
  function offChannel(){return instrument.view().channel!==RADIO_DESK_CHANNEL;}
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
  function cancelHold({silent=false}={}){holding=null;hold=0;instrument.release();if(heldControl)releaseControl(heldControl);heldControl=null;
    if(silent)cancelUiCueScope(`radio:${id}`);
  }
  scene={id:`radio:${id}`,blocksInput:true,blocksWorld:true,suppressesHud:true,allowsLook:false,
    handlesEscape:!terminal,lookProfile:'calm',
    enter(){
      void warmRadioContact3D();
      unsubscribe=scenes.subscribe(()=>{if(!exited&&scenes.top()!==scene){suspended=true;cancelHold({silent:true});instrument.suspend();onSuspend?.();}});
      convo.start();
    },
    exit(){if(exited)return;exited=true;unsubscribe?.();cancelHold();instrument.stop();disposeRadioContact3D();cancelControlScope(`radio:${id}:`);cancelUiCueScope(`radio:${id}`);convo.stop();audio?.stopTyping?.();onExit?.();},
    resume(){cancelHold();releaseRequired=false;suspended=false;instrument.resume();onResume?.();},
    blur(){cancelHold({silent:true});releaseRequired=false;suspended=true;unfocused=true;instrument.suspend();onSuspend?.();},
    focus(){unfocused=false;suspended=false;cancelHold();instrument.resume();onResume?.();},
    worldView:typeof worldView==='function'?()=>worldView({stage,age:t-stageAt,time:t,choice,reducedMotion:getReducedMotion()}):undefined,
    radioEggEnded(){instrument.eggEnded();},
    view(){const view={...convo.view(),viewport:uiSize(),radio:{stage,age:t-stageAt,time:t,hold,holdDuration:RADIO_CONTACT_HOLD,choice,terminal,dead,keyStuck,keyAge:keyStuckAt==null?null:t-keyStuckAt,seamRevealed,reducedMotion:getReducedMotion(),instrument:instrument.view(),canTune:canTune(),ready:ready(),contact:contact(),controlPrefix:controlPrefix()}};return {...view,layout:radioSceneLayout(uiSize(),view)};},
    update(dt){
      if(ended||exited||unfocused)return;
      if(scenes.top()!==scene){if(!suspended){suspended=true;cancelHold({silent:true});instrument.suspend();onSuspend?.();}return;}
      if(suspended){suspended=false;instrument.resume();onResume?.();}
      const step=Math.max(0,Math.min(.1,Number(dt)||0));t+=step;convo.update(step);
      instrument.update(step,{quiet:canTune(),dead:dead||stage==='break'||stage==='after'});
      if(getInstrumentProtected())onTuneAway?.();
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
      if(['tabPrev','tabNext'].includes(e.controllerAction)){instrument.adjustVolume(e.controllerAction==='tabPrev'?-1:1);return true;}
      if(['ArrowLeft','ArrowRight'].includes(e.key)){cancelHold();instrument.tune(e.key==='ArrowLeft'?-1:1,canTune());return true;}
      if(['-','_','+','='].includes(e.key)){instrument.adjustVolume(['-','_'].includes(e.key)?-1:1);return true;}
      if(!ready()){if(confirm(e))instrument.press('confirm',{hold:true});return true;}
      if(offChannel()){if(confirm(e))onInstrumentControl?.('denied');return true;}
      if(contact()){
        if(!defaultedContact){select(Math.max(0,convo.view().pending.options.findIndex(c=>c.goto==='still')),{sound:false});}
        if(['ArrowUp','ArrowDown','w','s'].includes(e.key)){cancelHold();instrument.press(e.key==='ArrowUp'||e.key==='w'?'previous':'next');return convo.key(e);}
        const index=Number(e.key)-1;
        // Numeric shortcuts select only. Nothing can bypass the physical hold.
        if(Number.isInteger(index)&&index>=0&&index<convo.view().pending.options.length){select(index);instrument.press(`key:${index+1}`);return true;}
        if(confirm(e)&&!releaseRequired){holding={kind:'key',code:e.code||e.key};hold=0;instrument.press('battery',{hold:true});pressChoice(convo.view().pending.index,true);}
        return true;
      }
      const pending=convo.view().pending;
      if(confirm(e))instrument.press(pending?.kind==='say'?'ptt':'confirm',{hold:true});
      else if(['ArrowUp','ArrowDown','w','s'].includes(e.key))instrument.press(e.key==='ArrowUp'||e.key==='w'?'previous':'next');
      if(pending?.options?.length){const number=Number(e.key)-1;
        if(confirm(e))pressChoice(pending.index);
        else if(Number.isInteger(number)&&number>=0&&number<pending.options.length)pressChoice(number);
      }
      if(confirm(e))return convo.key({...e,key:'Enter'});
      return convo.key(e);
    },
    keyup(e){
      if(confirm(e)||e.code===holding?.code)instrument.release();
      if(confirm(e)||e.code===holding?.code){cancelHold();releaseRequired=false;}
      return convo.keyup?.(e)||true;
    },
    pointer(e){
      if(e.type==='pointercancel'){cancelHold();return true;}
      if(e.type==='pointerup'){cancelHold();releaseRequired=false;return true;}
      const layout=scene.view().layout;
      if(e.type==='pointermove'&&holding?.kind==='pointer'
        &&!inRect(e,holding.control?layout.controls[holding.control]:layout.choices[holding.index])
        &&!inRect(e,holding.rect))cancelHold();
      if(e.type!=='pointerdown'||e.button>0)return true;
      // Expanded hardware targets may reach beyond their visible part. Ink
      // above that fringe owns the click, even when the part's center is clear.
      const onCaption=(layout.occlusionRects||[]).some(rect=>inRect(e,rect));
      const control=Object.entries(!onCaption&&(getHardwareReady?.()??hardwarePresented)?layout.controls:{}).filter(([,rect])=>inRect(e,rect))
        .sort(([,a],[,b])=>Math.hypot(e.cellX-(a.center?.x??a.x+a.w/2),e.cellY-(a.center?.y??a.y+a.h/2))-Math.hypot(e.cellX-(b.center?.x??b.x+b.w/2),e.cellY-(b.center?.y??b.y+b.h/2)))[0];
      if(control){
        const [name,r]=control;
        if(name==='channel'){cancelHold();instrument.tune(e.cellX<r.x+r.w/2?-1:1,canTune());return true;}
        if(name==='volume'){instrument.adjustVolume(e.cellX<r.x+r.w/2?-1:1);return true;}
        if(!ready()){instrument.press(name,{hold:true});return true;}
        if(name==='back'){instrument.press('back');if(!terminal)finish(true);else onInstrumentControl?.('denied');return true;}
        if(name==='previous'||name==='next'||name==='select'){scene.key({key:name==='previous'?'ArrowUp':'ArrowDown'});return true;}
        if(name.startsWith('key:')){instrument.press(name);const n=Number(name.slice(4));if(n>0&&n<10)scene.key({key:String(n)});return true;}
        if(name==='battery'&&contact()){select(0);scene.key({key:'Enter'});holding={kind:'pointer',control:name,rect:{...r}};return true;}
        if(name==='confirm'||name==='ptt'){
          if(name==='ptt'&&keyStuck){instrument.press('ptt',{hold:true});return true;}
          // Touching PTT during someone else's sentence is a physical press,
          // never a hidden Continue or permission to transmit.
          if(name==='ptt'&&convo.view().pending?.kind!=='say'&&convo.view().nodeId!=='request'){instrument.press('ptt',{hold:true});return true;}
          scene.key({key:'Enter'});instrument.press(name,{hold:true});if(contact())holding={kind:'pointer',control:name,rect:{...r}};return true;
        }
        instrument.press(name);return true;
      }
      if(!ready())return true;
      if(offChannel())return true;
      const index=layout.choices.findIndex(r=>inRect(e,r));
      if(index>=0){select(index);instrument.press(contact()?'battery':`key:${index+1}`,{hold:contact()});pressChoice(index,contact());if(contact()){holding={kind:'pointer',index};hold=0;}else convo.key({key:'Enter'});}
      else if(!contact()&&!convo.view().pending?.options?.length&&layout.captionRects.some(r=>inRect(e,r))){instrument.press('confirm');convo.key({key:'Enter'});}
      return true;
    },
    render(){hardwarePresented=drawRadioScene(scene.view(),{reducedMotion:getReducedMotion()});},
  };
  return scene;
}
