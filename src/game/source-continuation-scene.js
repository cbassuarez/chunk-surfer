import {normalizeSourceContinuation,stepSourceContinuation,continuationFocus} from './source-continuation.js';
import {uiSize,uiText,uiCenter} from '../render/ui.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// This scene borrows the shared renderer. It never writes the original body's
// position, recorder, injuries, inventory, quest receipts or Contact consent.
export function createSourceContinuationScene({checkpoint,renderer,audio=null,
  onCheckpoint=()=>{},onReturn=()=>{},onComplete=()=>{},onExit=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('Source continuation needs its physical renderer.');
  let state=normalizeSourceContinuation(checkpoint),ready=false,closed=false,paused=false,
    leaving=false,error=null,initializing=null,drag=null,saveClock=0,traceClock=0;
  const keys=new Set();
  const clear=()=>{keys.clear();drag=null;};
  const live=()=>ready&&!closed&&!leaving&&renderer.ready?.()!==false;
  const snapshot=()=>copy(state);
  const report=err=>{error=String(err?.message||err);clear();audio?.stop?.();onError(err);};
  function save(reason){const value=snapshot();onCheckpoint(value,{reason});return value;}
  function finish(kind){
    if(closed||leaving)return false;
    clear();leaving=true;audio?.stop?.();
    const value=save(kind);
    try{
      const result=kind==='complete'?onComplete({checkpoint:value}):onReturn({checkpoint:value,returnPose:value.returnPose});
      Promise.resolve(result).then(ok=>{if(ok===false)throw Error('The threshold could not be restored. Try it again.');})
        .catch(err=>{if(!closed){leaving=false;report(err);}});
    }catch(err){leaving=false;report(err);return false;}
    return true;
  }
  function apply(input){
    const result=stepSourceContinuation(state,input);state=result.state;
    const events=result.events|| (result.event?[result.event]:[]);
    for(const event of events){audio?.event?.(event,state);onTrace({type:'event',event:copy(event),phase:state.phase,elapsed:state.elapsed});}
    if(result.event?.type==='return'||events.some(e=>e.type==='return'))finish('return');
    else if(result.event?.type==='complete'||events.some(e=>e.type==='complete'))finish('complete');
    else if(events.length)save('interaction');
  }
  const scene={
    id:'source-continuation',blocksWorld:true,blocksInput:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{
        if(closed)return false;if(ok===false)throw Error('The next Source has not resolved.');
        ready=true;save('entry-or-resume');return true;
      }).catch(err=>{if(!closed)report(err);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      apply({dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),renderReady:true});
      if(closed||leaving)return;
      audio?.update?.({dt,state,paused:false,ready:true});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));traceClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=1){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;onTrace({type:'pose',elapsed:state.elapsed,phase:state.phase,
        x:state.x,z:state.z,feet:state.feet,yaw:state.yaw,pitch:state.pitch,level:state.level,
        focus:continuationFocus(state)?.id||null,closure:copy(state.closure||null),counterweight:copy(state.counterweight||null)});}
    },
    view:()=>({...snapshot(),ready:live(),closed,paused,leaving,error,focus:live()?continuationFocus(state):null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();audio?.pause?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(state.phase==='catch'||!live()||paused)return false;apply({dt:0,look,renderReady:true});return true;},
    key(e={}){
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(paused){clear();return true;}
      if(!live()){
        clear();if(!e.repeat&&(key==='x'||key==='e')&&error)finish('return');return true;
      }
      if(movement.includes(key)){keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true,renderReady:true});
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||state.phase==='catch'){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.30,Math.min(.62,state.pitch-(y-drag.y)*.003))},renderReady:true});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render(state)===false)throw Error('The Source view is unavailable.');}catch(err){ready=false;report(err);}}
      const {rows,cols}=uiSize();
      if(!live()){
        renderer.clear?.();uiCenter(Math.floor(rows/2),error?'THE FIRST DOOR IS STILL THERE':'THE DOOR OPENS INWARD','ui-primary');
        if(error){uiCenter(Math.floor(rows/2)+2,error.slice(0,Math.max(20,cols-4)),'ui-secondary');uiCenter(rows-2,'E / X · RETURN','ui-primary');}
        return;
      }
      const focus=continuationFocus(state);
      if(state.caption)uiText(2,2,String(state.caption).slice(0,Math.max(20,cols-4)),'ui-secondary');
      if(focus)uiCenter(rows-3,`E · ${focus.label||focus.title||'INSPECT'}`,'ui-primary');
      uiCenter(rows-1,state.phase==='catch'?'WASD · WALK   E · CHOOSE A DROP / DOOR   ESC · PAUSE':'WASD · WALK   RIGHT DRAG · LOOK   E · INSPECT / OPEN   ESC · PAUSE','ui-dim');
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
