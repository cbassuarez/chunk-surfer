import {normalizeSourceFalseReturn,stepSourceFalseReturn,sourceFalseReturnFocus} from './source-false-return.js';
import {uiFill,uiSize,uiText} from '../render/ui.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// Ellery is a borrowed local presentation. Its doors do not invoke the real
// building, chapel, inventory, recording, ending or Contact dispatchers.
export function createSourceFalseReturnScene({checkpoint,layout,renderer,audio=null,
  onCheckpoint=()=>{},onComplete=()=>{},onFaultReturn=()=>{},onTorch=()=>false,onExit=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  if(!layout||typeof renderer?.render!=='function')throw Error('The false Ellery needs its copied physical layout.');
  let state=stepSourceFalseReturn(normalizeSourceFalseReturn(checkpoint,{spawn:layout.spawn}),{dt:0},layout).state,ready=false,closed=false,paused=false,
    leaving=false,error=null,initializing=null,drag=null,saveClock=0,traceClock=0,handoff=0;
  const keys=new Set(),clear=()=>{keys.clear();drag=null;};
  const live=()=>ready&&!closed&&!error&&renderer.ready?.()!==false;
  const snapshot=()=>copy(state);
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  const soundState=()=>({...state,phase:'false-return',closure:{mode:'dormant'}});
  const report=err=>{error=String(err?.message||err);clear();audio?.stop?.();onError(err);};
  const debug=!!import.meta.env?.DEV&&new URLSearchParams(globalThis.location?.search||'').has('sourceTrace');
  let loggedSecond=-1;
  function trace(value){onTrace(value);const second=Math.floor(state.elapsed);if(debug&&(value.type!=='pose'||second!==loggedSecond)){if(value.type==='pose')loggedSecond=second;console.debug('SOURCE_FALSE_RETURN_TRACE',JSON.stringify(value));}}
  function finish(){
    clear();leaving=true;handoff=.25;save('source-threshold');
  }
  function dispatch(){
    audio?.stop?.();handoff=0;
    try{Promise.resolve(onComplete({checkpoint:save('complete')})).then(ok=>{if(ok===false)throw Error('The Source threshold is unavailable.');}).catch(err=>{if(!closed){leaving=false;report(err);}});}
    catch(err){leaving=false;report(err);}
  }
  function apply(input){
    const focus=input.interact?sourceFalseReturnFocus(state,layout):null;
    const result=stepSourceFalseReturn(state,input,layout);state=result.state;
    for(const event of result.events||[]){
      if(event.type==='loop')clear();
      audio?.event?.(event.type==='loop'?{type:'phase'}:event,soundState());
      trace({type:'event',event:copy(event),choiceId:focus?.id||null,elapsed:state.elapsed});
      if(event.type==='complete')finish();
    }
    if(result.events?.length)save('interaction');
  }
  const scene={
    id:'source-false-return',blocksWorld:true,blocksInput:true,suppressesHud:true,
    get allowsLook(){return live()&&!paused&&!leaving;},handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize({retry=false}={}){
      if(retry){if(closed||!error)return Promise.resolve(false);initializing=null;error=null;ready=false;}
      if(initializing)return initializing;save('loading');
      initializing=Promise.resolve().then(()=>retry&&renderer.retry?renderer.retry():renderer.initialize?.()).then(ok=>{if(closed)return false;if(ok===false)throw Error('Ellery has not resolved.');ready=true;error=null;save('entry-or-resume');
        if(state.status==='completed'&&!state.exitReceipt?.delivered)finish();
        return true;}).catch(err=>{if(!closed)report(err);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused)return;
      if(!live()){clear();audio?.stop?.();return;}
      if(leaving){if(handoff>0){handoff=Math.max(0,handoff-Math.min(.25,Math.max(0,Number(dt)||0)));audio?.update?.({dt,state:soundState(),ready:true,focus:null});if(!handoff)dispatch();}return;}
      const delta=Math.min(.25,Math.max(0,Number(dt)||0)),turn=Number(keys.has('arrowright'))-Number(keys.has('arrowleft'));
      apply({dt:delta,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d'))-Number(keys.has('a')),look:{yaw:state.yaw+turn*delta*1.8,pitch:state.pitch},renderReady:true});
      if(leaving||closed)return;
      audio?.update?.({dt:delta,state:soundState(),focus:sourceFalseReturnFocus(state,layout),ready:true,paused:false});
      saveClock+=delta;traceClock+=delta;if(saveClock>=1){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;trace({type:'pose',elapsed:state.elapsed,x:state.x,z:state.z,feet:state.feet,yaw:state.yaw,pitch:state.pitch,
        focus:sourceFalseReturnFocus(state,layout)?.id||null,opened:copy(state.opened||[]),sourceDoors:copy(state.sourceDoors||[]),doorOpen:copy(state.doorOpen||{}),doorMotion:copy(state.doorMotion||{}),loopLatch:state.loopLatch,audio:audio?.snapshot?.()||null});}
    },
    view:()=>({...snapshot(),ready:live(),closed,paused,leaving,error,focus:live()?sourceFalseReturnFocus(state,layout):null,
      fallback:error?{title:'THIS AREA COULD NOT BE LOADED',actions:['R  TRY AGAIN','X  GO BACK']}:
        !ready&&!closed?{title:'PLEASE WAIT',actions:['X  GO BACK']}:null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();audio?.pause?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(!live()||paused||leaving)return false;apply({dt:0,look,renderReady:true});return true;},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yawDelta=0,pitchDelta=0){
      if(!Number.isFinite(yawDelta)||!Number.isFinite(pitchDelta))return false;
      return scene.setLook({yaw:state.yaw+yawDelta,pitch:state.pitch+pitchDelta});
    },
    key(e={}){
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||paused||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(error){if(!e.repeat&&key==='x')onFaultReturn({checkpoint:save('fault-retreat')});else if(!e.repeat&&key==='r')void scene.initialize({retry:true});else if(!e.repeat&&key==='e'&&state.status==='completed'){leaving=true;dispatch();}return true;}
      if(!live()||leaving){if(!leaving&&!e.repeat&&key==='x')onFaultReturn({checkpoint:save('loading-retreat')});return true;}
      if(!e.repeat&&key==='f'){onTorch();trace({type:'torch-input',elapsed:state.elapsed});return true;}
      if(movement.has(key)){if(!e.repeat)keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true,renderReady:true});return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||leaving){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.3,Math.min(.62,state.pitch-(y-drag.y)*.003))},renderReady:true});drag={x,y};}return true;
    },
    render(){
      if(closed)return;
      if(ready)try{if(renderer.render(state)===false)throw Error('The false Ellery view is unavailable.');}catch(err){ready=false;report(err);}
      // An unavailable borrowed view must never masquerade as a frozen game.
      // Ordinary exploration remains textless; only loading/failure offers a
      // visible way back without changing progression or inventing a new exit.
      const fallback=scene.view().fallback;if(!fallback)return;
      const size=uiSize(),cols=Math.max(20,size.cols||80),rows=Math.max(8,size.rows||24),y=Math.max(2,rows-5);
      uiFill(0,y-1,cols,rows-y+1,'#000');
      uiText(2,y,fallback.title,'ui-primary',1,cols-4);
      uiText(2,y+2,fallback.actions.join('    '),'ui-secondary',1,cols-4);
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
