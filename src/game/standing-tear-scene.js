import {freshStandingTear,normalizeStandingTear,stepStandingTear,standingTearFrame} from './standing-tear.js';

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const action=k=>k==='e'||k===' '||k==='space'||k==='enter';

// Owns the borrowed viewpoint, not a Source destination or ordinary save area.
// World preparation and two real covered frames belong to onRestore; it must
// resolve only when the conservatory is safe to reveal.
export function createStandingTearScene({checkpoint=null,returnPose=null,runId='',renderer,audio=null,
  getLook=()=>null,isPaused=()=>false,isHidden=()=>false,inputActive=()=>true,
  paintCover=()=>{},onRestore=()=>{},onDone=()=>{},onCheckpoint=()=>{},onTrace=()=>{},onError=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The Standing Tear needs its physical renderer.');
  let state=checkpoint?normalizeStandingTear(checkpoint,{runId,returnPose:returnPose??checkpoint.returnPose}):freshStandingTear({runId,returnPose});
  // A reloaded return must be covered again. A receipt never means the old
  // document's prepared conservatory frame still exists in this WebView.
  if(state.phase==='returned'||state.phase==='ending'&&state.restoreIssued){state.phase='ending';state.endingSeconds=.9;state.readyIssued=false;}
  state.held=false;state.holdSeconds=0;
  let ready=false,closed=false,paused=false,blurred=false,externalHeld=false,restoring=false,restored=false,restoreReady=false,completed=false,
    disposedRenderer=false,initializing=null,error=null,restorePromise=null,lastFrame=null,saveClock=0,traceClock=0,prepareClock=0,reported=false;
  const keys=new Set(),traces=[];
  const frame=()=>standingTearFrame(state),snapshot=()=>clone(state);
  const trace=value=>{const item={...value,elapsed:state.elapsed,wallTimeMs:globalThis.performance?.now?.()??0};traces.push(item);if(traces.length>12000)traces.shift();onTrace(item);};
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  const disposeRenderer=()=>{if(disposedRenderer)return;disposedRenderer=true;renderer.dispose?.();};
  function report(reason){error=String(reason?.message||reason);if(!reported){reported=true;onError(reason);trace({type:'error',error});}}
  function clear(reason='clear'){
    keys.clear();
    if(state.held||state.liveMemoryId||state.moving){const result=stepStandingTear(state,{dt:0,paused:true});state=result.state;for(const event of result.events)dispatch(event);}
    audio?.stop?.('live');trace({type:'input-clear',reason});
  }
  function finish(payload={}){
    if(closed||completed)return;completed=true;clear('return-ready');audio?.stop?.();
    save('return-ready');trace({type:'handoff',completed:state.completed,restored:restoreReady,error});
    try{Promise.resolve(onDone({checkpoint:snapshot(),returnPose:clone(state.returnPose),receipt:clone(state.returnReceipt),completed:state.completed,restored:restoreReady,error,...payload})).catch(report);}catch(reason){report(reason);}
  }
  function restore(){
    if(closed||restoring)return restorePromise;
    restoring=true;restored=true;clear('full-black-restore');disposeRenderer();
    trace({type:'restore-start',returnPose:clone(state.returnPose)});save('restore-start');
    // Setting restored above exposes the building pass while our cover is
    // still fully black. Never await a renderer hidden by our own scene.
    restorePromise=Promise.resolve().then(()=>{
      if(closed)return false;
      return onRestore({checkpoint:snapshot(),returnPose:clone(state.returnPose),receipt:clone(state.returnReceipt),completed:state.completed,error});
    })
      .then(ok=>{if(closed)return false;if(ok===false)throw Error('The conservatory could not be prepared.');restoreReady=true;trace({type:'restore-ready'});save('restore-ready');return true;})
      .catch(reason=>{if(closed)return false;report(reason);finish({restored:false});return false;});
    return restorePromise;
  }
  function dispatch(event){
    audio?.event?.(event,frame());
    // Route/camera samples already have a stable 10 Hz clock below. Recording
    // every simulation substep would bury the threshold and first action.
    if(event.type!=='move')trace({type:'event',event:clone(event)});
    if(event.type==='restore')void restore();
    if(event.type==='return-ready')finish();
  }
  function apply(input){
    const result=stepStandingTear(state,input);state=result.state;
    for(const event of result.events){if(closed)break;dispatch(event);}
    if(!closed&&!completed&&result.events.some(e=>e.type!=='move'))save('event');
  }
  function heldByHost(){return paused||blurred||!!isPaused()||!!isHidden()||!inputActive();}
  function syncHeld(){
    const held=heldByHost();if(held!==externalHeld){externalHeld=held;clear(held?'presentation-held':'presentation-resumed');audio?.setPaused?.(held);if(held)save('interrupted');}
    return held;
  }
  function withdraw(reason='withdraw'){
    if(closed||completed||state.phase==='ending'||state.phase==='returned')return false;
    clear(reason);apply({dt:0,withdraw:true});save(reason);return true;
  }
  function fail(reason){if(closed)return;report(reason);audio?.stop?.();withdraw('failure');}
  const scene={
    id:'standing-tear',blocksWorld:true,blocksInput:true,suppressesHud:true,handlesEscape:false,lookProfile:'explore',
    get allowsLook(){return ready&&!closed&&!completed&&!heldByHost()&&state.phase!=='ending'&&state.phase!=='returned';},
    get worldPresentation(){return restored?'visible':'hidden';},
    initialize(){
      if(closed)return Promise.resolve(false);if(initializing)return initializing;
      save('loading');
      if(state.phase==='ending'&&state.restoreIssued){ready=true;initializing=Promise.resolve(true);void restore();return initializing;}
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{
        if(closed||restoring||completed)return false;if(ok===false)throw Error('The Standing Tear could not be prepared.');
        ready=true;clear('ready');trace({type:'ready'});save('ready');return true;
      }).catch(reason=>{if(!closed&&!restoring&&!completed)fail(reason);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||completed||syncHeld())return;
      const step=Math.min(.1,Math.max(0,Number(dt)||0));
      if(!ready&&state.phase!=='ending'){prepareClock+=step;if(prepareClock>20)fail(Error('The Standing Tear did not become ready.'));return;}
      const look=scene.allowsLook?getLook():null;
      apply({dt:step,renderReady:state.phase==='ending'?restoreReady:ready,
        forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),
        held:[...keys].some(action),lookYaw:look?.yaw,lookPitch:look?.pitch});
      if(closed||completed)return;
      audio?.update?.(frame(),{dt:step});
      saveClock+=step;traceClock+=step;
      if(saveClock>=.5){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;const presented=frame();trace({type:'pose',pose:clone(state.pose),phase:state.phase,held:state.held,endingSeconds:state.endingSeconds,fade:presented.fade,
        fullConfinementSeconds:presented.fullConfinementSeconds,witness:presented.witness,
        memories:presented.memories?.map(({id,awake,awakeSeconds,pressure,live})=>({id,awake,awakeSeconds,pressure,live})),
        courses:presented.panels?.map(({id,progress,target,colliding})=>({id,progress,target,colliding}))});}
    },
    render(){
      if(closed)return;syncHeld();
      if(ready&&!restored&&!disposedRenderer){lastFrame=frame();try{if(renderer.render(lastFrame)===false)throw Error('The Standing Tear frame could not be presented.');}catch(reason){fail(reason);}}
      // Hidden world presentation retains the last valid threshold raster
      // while this owner prepares. A new opaque loading frame would turn a
      // continuous crossing into a flash even when all assets are cached.
      const alpha=error&&!restored||restoring&&!restoreReady?1:frame().fade;
      if(alpha>.0001)paintCover(alpha);
    },
    key(e={}){
      const k=keyOf(e);
      if(k==='escape'||e.controllerAction==='back'){clear('pause-request');save('pause-request');return false;}
      if(closed||completed||syncHeld()||state.phase==='ending'||state.phase==='returned'||e.metaKey||e.ctrlKey||e.altKey)return true;
      if(k==='x'&&!e.repeat){withdraw('early-withdrawal');return true;}
      if(!ready)return true;
      if((movement.has(k)||action(k))&&!e.repeat){keys.add(k);if(action(k))apply({dt:0,held:true,interact:true,renderReady:true});}
      return true;
    },
    keyup(e={}){const k=keyOf(e);keys.delete(k);if(!closed&&!completed&&!heldByHost()&&action(k)&&ready&&state.phase!=='ending')apply({dt:0,held:[...keys].some(action),renderReady:true});return true;},
    pointer(){return true;},
    setLook(look={}){if(!scene.allowsLook)return false;apply({dt:0,lookYaw:look.yaw,lookPitch:look.pitch,held:[...keys].some(action),renderReady:true});return true;},
    withdraw,
    pause(){if(closed)return false;paused=true;syncHeld();return true;},
    resume(){if(closed)return false;paused=false;syncHeld();return true;},
    setPaused(value){return value?scene.pause():scene.resume();},
    blur(){if(closed)return false;blurred=true;syncHeld();save('blur');return true;},
    focus(){if(closed)return false;blurred=false;syncHeld();clear('focus');return true;},
    checkpoint:()=>save('requested'),serialize:snapshot,
    trace:()=>clone(traces),audioDiagnostics:()=>audio?.snapshot?.()||null,pending:()=>initializing,returnPending:()=>restorePromise,
    view:()=>({state:snapshot(),frame:frame(),renderedFrame:lastFrame,ready,closed,paused,restoring,restored,restoreReady,completed,error,renderer:renderer.diagnostics?.(),audio:audio?.snapshot?.()}),
    exit(){if(closed)return false;closed=true;ready=false;keys.clear();audio?.destroy?.();disposeRenderer();return true;},
  };
  return scene;
}
