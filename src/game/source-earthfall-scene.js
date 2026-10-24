import {normalizeSourceEarthfall,stepSourceEarthfall,sourceEarthfallFrame,sourceEarthfallFocus} from './source-earthfall.js';
import {uiSize,uiCenter} from '../render/ui.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// The borrowed view owns the entire descent in metres. The original Source
// body and the next room's checkpoint remain with their existing controllers.
export function createSourceEarthfallScene({checkpoint,renderer,audio=null,
  presentation=()=>({}),onCheckpoint=()=>{},onReturn=()=>{},onComplete=()=>{},
  onExit=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The descending Source needs its physical renderer.');
  let state=normalizeSourceEarthfall(checkpoint),ready=false,closed=false,paused=false,
    leaving=false,error=null,initializing=null,drag=null,saveClock=0,traceClock=0;
  const keys=new Set();
  const clear=()=>{keys.clear();drag=null;};
  const snapshot=()=>copy(state);
  const live=()=>ready&&!closed&&!leaving&&renderer.ready?.()!==false;
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  function report(reason){error=String(reason?.message||reason);clear();audio?.stop?.();onError(reason);}
  function finish(kind){
    if(closed||leaving)return false;
    clear();leaving=true;audio?.stop?.();const checkpoint=save(kind);
    try{Promise.resolve(kind==='complete'?onComplete({checkpoint}):onReturn({checkpoint}))
      .then(ok=>{if(ok===false)throw Error('The original threshold is still there.');})
      .catch(reason=>{if(!closed){leaving=false;report(reason);}});
    }catch(reason){leaving=false;report(reason);return false;}
    return true;
  }
  function apply(input){
    const p=presentation()||{};
    const result=stepSourceEarthfall(state,{...input,paused,protected:!!p.protected,assetsReady:live()});
    state=result.state;
    const events=result.events||(result.event?[result.event]:[]);
    for(const event of events)onTrace({type:'event',event:copy(event),elapsed:state.elapsed});
    if(events.some(e=>e.type==='enter-source-II'||e.type==='complete'))finish('complete');
    else if(events.some(e=>e.type==='return'))finish('return');
    else if(events.length)save('event');
  }
  const scene={
    id:'source-earthfall',blocksWorld:true,blocksInput:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.all([Promise.resolve().then(()=>renderer.initialize?.()),
        Promise.resolve().then(()=>audio?.ready?.()).catch(()=>false)]).then(([ok])=>{
        if(closed)return false;if(ok===false)throw Error('The lower path has not resolved.');
        ready=true;save('entry-or-resume');return true;
      }).catch(reason=>{if(!closed)report(reason);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      apply({dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});
      if(closed||leaving)return;
      const frame=sourceEarthfallFrame(state),p=presentation()||{};
      audio?.update?.(frame,{...p,listener:{x:state.x,y:state.feet+1.62,z:state.z,yaw:state.yaw},suspended:false});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));traceClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=.5){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;onTrace({type:'pose',elapsed:state.elapsed,x:state.x,z:state.z,
        feet:state.feet,yaw:state.yaw,pitch:state.pitch,phase:frame.phase,catchSurfaceY:frame.catchSurfaceY});}
    },
    view:()=>({...snapshot(),ready:live(),closed,paused,leaving,error,frame:sourceEarthfallFrame(state),focus:live()?sourceEarthfallFocus(state):null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();audio?.stop?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(!live()||paused)return false;apply({dt:0,look});return true;},
    key(e={}){
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(paused){clear();return true;}
      if(!live()){
        clear();if(!e.repeat&&(key==='x'||key==='e')&&error)finish('return');return true;
      }
      if(movement.has(key)){keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true});
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.42,Math.min(1.25,state.pitch-(y-drag.y)*.003))}});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render(state,presentation())===false)throw Error('The descending path is unavailable.');}catch(reason){ready=false;report(reason);}}
      const {rows}=uiSize();
      if(!live()){renderer.clear?.();uiCenter(Math.floor(rows/2),error?'THE FIRST DOOR IS STILL THERE':'THE DOOR OPENS','ui-secondary');return;}
      const focus=sourceEarthfallFocus(state);
      if(focus)uiCenter(rows-3,`E · ${focus.label||focus.title||'OPEN'}`,'ui-primary');
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
