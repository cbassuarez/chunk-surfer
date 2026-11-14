// Hands on the object, with the school and the other clocks still alive.
// The engine owns time, drift, the temporary weight catch, and durable stops.
import * as scenes from './scenes.js';
import {uiSize,uiPhysicalSize} from '../render/ui.js';
import {promptLine} from './bindings.js';
import {METRONOME_TEMPO} from './practice-metronomes.js';
import {practiceMetronomeLayout,practiceMetronomeHit,practiceMetronomeDistanceAtPointer,
  practiceMetronomeTempoAtPointer,drawPracticeMetronome,practiceMetronomeHintRegions,drawPracticeMetronomeHint} from '../render/practice-metronome-view.js';

const clampTempo=n=>Math.max(METRONOME_TEMPO.min,Math.min(METRONOME_TEMPO.max,Number(n)||METRONOME_TEMPO.min));
const eventRole=e=>{
  if(e.controllerAction)return e.controllerAction==='menu'?'back':e.controllerAction;
  const key=String(e.key||'').toLowerCase(),code=e.code;
  if(key==='escape'||code==='Escape')return'back';
  if(key==='enter'||key===' '||code==='Space'||code==='Enter')return'confirm';
  if(key==='arrowup'||key==='w'||code==='KeyW'||code==='ArrowUp')return'move_up';
  if(key==='arrowdown'||key==='s'||code==='KeyS'||code==='ArrowDown')return'move_down';
  if(key==='arrowleft'||key==='a'||code==='KeyA'||code==='ArrowLeft')return'move_left';
  if(key==='arrowright'||key==='d'||code==='KeyD'||code==='ArrowRight')return'move_right';
  if(key==='tab'||code==='Tab')return e.shiftKey?'tabPrev':'tabNext';
  if(key==='q'||code==='KeyQ')return'tabPrev';
  if(key==='e'||code==='KeyE')return'tabNext';
  if(key==='r'||code==='KeyR')return'recorder';
  if(key==='f'||code==='KeyF')return'light';
  return null;
};
const holdKey=e=>e.controllerAction?`pad:${e.controllerAction}`:`key:${e.code||String(e.key||'').toLowerCase()}`;
export function practiceMetronomePrompts({focus='weight',recording=false}={}){
  return promptLine([
    {action:'select',label:'WEIGHT'},
    {action:'set',label:'HAND'},
    {action:'confirm',label:focus==='weight'?'HOLD WEIGHT':'CATCH / RELEASE'},
    {action:'light',label:'TORCH'},
    recording?{action:'recorder',label:'STOP RECORDING'}:null,
    {action:'back',label:'STEP BACK'},
  ]);
}
export function makePracticeMetronomeScene({getState=()=>({}),onTempo=()=>{},onWeightHold=()=>{},
  onRunning=()=>{},onClose=()=>{},onControl=()=>{},isRecording=()=>false,onRecordStop=()=>{},onLight=()=>{},
  getRenderProp=()=>null,getCamera=()=>null,projectWorld,worldView=()=>null,getReducedMotion=()=>false}={}){
  let scene,closed=false,notified=false,unsubscribe=null,focus='weight',drag=null,press=null,holding=false;
  let mix=0,elapsed=0,closing=false,closeElapsed=0,closeStartMix=0,covered=false,unfocused=false;
  let size={cols:120,rows:38};const heldKeys=new Set();
  const phase=()=>closing?'return':mix<.999?'approach':'hands';
  const state=()=>({...getState(),focus,dragging:!!drag,closeupMix:mix,closing,phase:phase(),elapsed});
  const layout=()=>{const physical=uiPhysicalSize();return practiceMetronomeLayout(size,state(),{
    physicalSize:physical.cols>0&&physical.rows>0?physical:size,camera:getCamera(),renderProp:getRenderProp(),projectWorld,
  });};
  const controlsReady=()=>{if(closed||closing||covered||unfocused||mix<.999)return false;const l=layout();return l.valid&&l.frontFacing;};
  const notify=()=>{if(notified)return;notified=true;onClose();};
  const syncHold=()=>{
    const next=!!drag||heldKeys.size>0;if(next===holding)return;
    holding=next;onWeightHold(next);onControl('weight-hold',{held:next});
  };
  const releasePointer=()=>{
    if(drag?.target&&drag.id!=null){try{drag.target.releasePointerCapture?.(drag.id);}catch{/* already released by the host */}}
  };
  const cancel=()=>{releasePointer();drag=null;press=null;heldKeys.clear();syncHold();};
  const finishClose=()=>{if(closed)return;closed=true;mix=0;cancel();if(!scenes.remove(scene))notify();};
  const close=()=>{if(closed||closing)return;closing=true;closeElapsed=0;closeStartMix=mix;cancel();if(getReducedMotion()||mix<=0)finishClose();};
  const setTempo=value=>{
    const before=Number(getState()?.tempo)||168,next=clampTempo(value);
    if(Math.abs(before-next)<.00001)return;
    onTempo(next,{held:holding});onControl('weight',{tempo:next,held:holding});
  };
  const toggle=()=>{
    if(closed)return;focus='pendulum';
    // A weight held in the fingers is temporarily silent. It is not an
    // explicitly stopped pendulum, so never toggle using `running` here.
    const next=!!getState()?.stopped;onRunning(next);onControl('pendulum',{running:next});
  };
  const changeFocus=()=>{cancel();focus=focus==='weight'?'pendulum':'weight';};
  scene={id:'practice-metronome',blocksInput:true,blocksWorld:false,allowsLook:false,handlesEscape:true,
    suppressesHud:false,worldPresentation:'visible',
    enter(){
      closed=false;mix=getReducedMotion()?1:0;const viewport=uiSize();if(viewport.cols>0&&viewport.rows>0)size=viewport;
      unsubscribe?.();unsubscribe=scenes.subscribe(()=>{
        const top=scenes.top({includeOverlay:true});
        covered=scenes.top()!==scene||(top!==scene&&!!(top?.blocksInput||top?.freezesBelow));
        if(!closed&&top!==scene)cancel();
      });
    },
    exit(){closed=true;mix=0;unsubscribe?.();unsubscribe=null;cancel();notify();},
    blur(){unfocused=true;cancel();},focus(){unfocused=false;},
    suspend(){covered=true;cancel();},resume(){covered=false;cancel();},
    update(dt){
      if(closed||covered||unfocused)return;const step=Math.max(0,Math.min(.1,Number(dt)||0));elapsed+=step;
      if(closing){closeElapsed+=step;mix=getReducedMotion()?0:Math.max(0,closeStartMix*(1-closeElapsed/.35));if(mix<=0)finishClose();}
      else mix=getReducedMotion()?1:Math.min(1,mix+step/.5);
    },
    getCloseupMix(){return mix;},
    worldView(){return worldView({mix,closing,elapsed,phase:phase()});},
    view(){return{...state(),layout:layout(),holding,prompts:practiceMetronomePrompts({focus,recording:!!isRecording()})};},
    key(e={}){
      if(closed)return false;
      if(e.ctrlKey||e.altKey||e.metaKey)return true;
      const role=eventRole(e);
      if(role==='back'){if(!e.repeat)close();return true;}
      if(role==='recorder'){if(!e.repeat&&isRecording())onRecordStop();return true;}
      if(role==='light'){if(!e.repeat)onLight();return true;}
      if(!controlsReady())return true;
      if(['move_left','move_right','tabPrev','tabNext'].includes(role)){
        e.preventDefault?.();if(!e.repeat)changeFocus();return true;
      }
      if(role==='move_up'||role==='move_down'){
        focus='weight';heldKeys.add(holdKey(e));syncHold();
        // Raising a real weight slows the clock. Lowering it makes it faster.
        setTempo((Number(getState()?.tempo)||168)+(role==='move_up'?-1:1));return true;
      }
      if(role==='confirm'){
        if(focus==='weight'){heldKeys.add(holdKey(e));syncHold();}
        else if(!e.repeat)toggle();return true;
      }
      return true;
    },
    keyup(e={}){if(closed)return false;heldKeys.delete(holdKey(e));syncHold();return true;},
    pointer(e={}){
      if(closed)return false;
      const id=e.pointerId??0;
      if(e.type==='pointercancel'||e.type==='lostpointercapture'){
        if(e.pointerId==null||drag?.id===id||press?.id===id)cancel();return true;
      }
      if(mix>=.98&&!closing&&e.type==='pointerdown'&&(e.button??0)===0&&practiceMetronomeHit(layout(),Number(e.cellX),Number(e.cellY))?.kind==='close'){close();return true;}
      if(!controlsReady())return true;
      if(e.type==='pointermove'&&drag?.id===id){
        if(!Number.isFinite(Number(e.cellX))||!Number.isFinite(Number(e.cellY)))return true;
        const tempo=practiceMetronomeTempoAtPointer(layout(),e.cellX,e.cellY,drag.offset);if(tempo!=null)setTempo(tempo);return true;
      }
      if(e.type==='pointermove'){
        if(!drag&&!press&&!holding){const hit=practiceMetronomeHit(layout(),Number(e.cellX),Number(e.cellY));
          if(hit?.kind==='weight'||hit?.kind==='pendulum')focus=hit.kind;
        }return true;
      }
      if(e.type==='pointerup'){
        if(drag?.id===id){releasePointer();drag=null;syncHold();}
        const old=press;if(old?.id!==id)return true;press=null;
        if((e.button??0)!==0)return true;
        const hit=practiceMetronomeHit(layout(),Number(e.cellX),Number(e.cellY));
        if(hit?.kind===old.kind&&hit.kind==='close')close();
        return true;
      }
      if(e.type!=='pointerdown'||(e.button??0)!==0)return true;
      // A second finger cannot steal a weight that is already in the first.
      if(drag||press)return true;
      const l=layout(),hit=practiceMetronomeHit(l,Number(e.cellX),Number(e.cellY));
      if(hit?.kind==='weight'){
        focus='weight';
        drag={id,offset:practiceMetronomeDistanceAtPointer(l,e.cellX,e.cellY)-l.pose.distance,target:e.originalEvent?.target};
        try{drag.target?.setPointerCapture?.(id);}catch{/* window pointer-up also releases it */}
        syncHold();
      }else if(hit){
        press={id,kind:hit.kind};
        // Contact catches the rod immediately. Waiting for pointer-up would
        // make a fast-moving rod escape the fingers between down and up.
        if(hit.kind==='pendulum')toggle();
      }
      return true;
    },
    render(viewport=uiSize()){
      if(viewport.cols>0&&viewport.rows>0)size=viewport;
      const l=layout();drawPracticeMetronome(state(),size,{layout:l});
      if(mix<.98||closing)return;
      const help=practiceMetronomePrompts({focus,recording:!!isRecording()});
      const hints=practiceMetronomeHintRegions(l,{focus,footer:help});
      drawPracticeMetronomeHint(hints.footer);drawPracticeMetronomeHint(hints.close);
    },
  };return scene;
}
