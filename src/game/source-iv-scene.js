import {normalizeSourceIV,stepSourceIV,sourceIVFrame,sourceIVFocus} from './source-iv.js';
import {uiSize,uiCenter} from '../render/ui.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// This floor remains playable until its far grey door is opened and crossed.
// A return is committed by the host only after that physical action.
export function createSourceIVScene({checkpoint,renderer,presentation=()=>({}),
  onCheckpoint=()=>{},onComplete=()=>false,onRetry=()=>false,onSound=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('Source IV needs its physical renderer.');
  let state=normalizeSourceIV(checkpoint),ready=false,closed=false,paused=false,error=null,
    initializing=null,drag=null,saveClock=0,stepDistance=0,hold=0,dispatching=false;
  const keys=new Set(),clear=()=>{keys.clear();drag=null;};
  const snapshot=()=>copy(state);
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  const protectedNow=()=>{const p=presentation()||{};return !!p.protected||!!p.suspended||!!p.hidden||p.focused===false;};
  const live=()=>ready&&!closed&&!error&&renderer.ready?.()!==false;
  function fail(reason){error=String(reason?.message||reason);clear();onError(reason);}
  async function finish(){
    if(closed||dispatching||state.status!=='completed'||state.exitReceipt?.delivered)return false;
    clear();dispatching=true;const checkpoint=save('complete');
    try{if(await onComplete({checkpoint})===false)throw Error('The far door has not resolved.');return true;}
    catch(reason){if(!closed){dispatching=false;fail(reason);}return false;}
  }
  function apply(input){
    const before={x:state.x,z:state.z};
    const result=stepSourceIV(state,{...input,paused,protected:protectedNow(),assetsReady:live()});state=result.state;
    stepDistance+=Math.hypot(state.x-before.x,state.z-before.z);
    if(stepDistance>=.72){stepDistance%=.72;onSound({type:'footstep',x:state.x,z:state.z});}
    for(const event of result.events)if(event.type==='door')onSound(event);
    if(result.events.length||result.saveDue)save('event');
    if(state.status==='completed')clear();
  }
  const scene={
    id:'source-IV',blocksWorld:true,blocksInput:true,suppressesHud:true,allowsLook:false,
    handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;save('loading');
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{
        if(closed)return false;if(ok===false)throw Error('Source IV has not resolved.');
        ready=true;save('entry-or-resume');return true;
      }).catch(reason=>{if(!closed)fail(reason);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||dispatching)return;
      if(!live()||protectedNow()){clear();return;}
      if(state.status==='completed'){
        hold+=Math.min(.25,Math.max(0,Number(dt)||0));if(hold>=1.4)void finish();return;
      }
      apply({dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));if(saveClock>=.5){saveClock=0;save('position');}
    },
    view:()=>({...snapshot(),ready:live(),closed,paused,error,dispatching,hold,frame:sourceIVFrame(state),focus:live()?sourceIVFocus(state):null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(!live()||paused||protectedNow()||state.status!=='active'){clear();return false;}apply({dt:0,look});return true;},
    key(e={}){
      const key=keyOf(e);if(closed||dispatching||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(paused||protectedNow()){clear();return true;}
      if(error){if(!e.repeat&&key==='e'){if(state.status==='completed'){error=null;void finish();}else onRetry({checkpoint:snapshot()});}return true;}
      if(!live()||state.status!=='active'){clear();return true;}
      if(movement.has(key)){keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true});return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||protectedNow()||state.status!=='active'){clear();return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.3,Math.min(1.3,state.pitch-(y-drag.y)*.003))}});drag={x,y};}return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render(state,presentation())===false)throw Error('Source IV is unavailable.');}catch(reason){ready=false;fail(reason);}}
      const {rows}=uiSize();
      if(!live()){renderer.clear?.();uiCenter(Math.floor(rows/2),error?state.status==='completed'?'E · TRY THE FAR DOOR':'E · TRY SOURCE IV AGAIN':'SOURCE IV','ui-secondary');return;}
      const focus=sourceIVFocus(state);if(focus)uiCenter(rows-3,`E · ${focus.title}`,'ui-primary');
    },
    exit(){if(closed)return false;closed=true;clear();if(!dispatching)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };return scene;
}
