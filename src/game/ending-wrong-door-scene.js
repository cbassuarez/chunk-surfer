import {normalizeEndingWrongDoorDemolition,stepEndingWrongDoorDemolition,
  endingWrongDoorDemolitionFrame,endingWrongDoorDemolitionFocus} from './ending-wrong-door.js';
import {uiSize,uiCenter} from '../render/ui.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// The ending owns its body, receipts and checkpoint. Neither ordinary Source
// omen is advanced while the ending borrows their physical presentation.
export function createEndingWrongDoorScene({checkpoint,renderer,audio=null,
  presentation=()=>({}),onCheckpoint=()=>{},onReturn=()=>false,onComplete=()=>false,
  onExit=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The wrong door needs its physical renderer.');
  let state=normalizeEndingWrongDoorDemolition(checkpoint),ready=false,closed=false,
    paused=false,leaving=false,error=null,initializing=null,drag=null,saveClock=0;
  const keys=new Set(),clear=()=>{keys.clear();drag=null;};
  const protectedNow=()=>{const p=presentation()||{};return !!p.protected||!!p.suspended||!!p.hidden||p.focused===false;};
  const snapshot=()=>copy(state);
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  const live=()=>ready&&!closed&&!leaving&&!error&&renderer.ready?.()!==false;
  function fail(reason){error=String(reason?.message||reason);clear();audio?.stop?.();onError(reason);}
  async function finish(kind){
    if(closed||leaving)return false;
    clear();leaving=true;audio?.stop?.();const checkpoint=save(kind);
    try{
      const ok=await(kind==='complete'?onComplete({checkpoint}):onReturn({checkpoint}));
      if(ok===false)throw Error('The next threshold has not resolved.');
      return true;
    }catch(reason){if(!closed){leaving=false;fail(reason);}return false;}
  }
  function apply(input){
    const p=presentation()||{};
    const result=stepEndingWrongDoorDemolition(state,{...input,paused,
      protected:!!p.protected,assetsReady:live()});
    state=result.state;
    for(const event of result.events)onTrace({type:'event',event:copy(event),clock:state.physical.clock});
    if(result.events.some(e=>e.type==='enter-source-IV'))void finish('complete');
    else if(result.events.some(e=>e.type==='return'))void finish('return');
    else if(result.saveDue||result.events.length)save('event');
  }
  const scene={
    id:'ending-wrong-door-demolition',blocksWorld:true,blocksInput:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.all([Promise.resolve().then(()=>renderer.initialize?.()),
        Promise.resolve().then(()=>audio?.ready?.()).catch(()=>false)]).then(([ok])=>{
        if(closed)return false;
        if(ok===false)throw Error('The other door has not resolved.');
        ready=true;save('entry-or-resume');
        if(state.status==='ready-for-source-IV'&&!state.exitReceipt?.delivered)void finish('complete');
        else if(state.status==='returned')void finish('return');
        return true;
      }).catch(reason=>{if(!closed)fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      if(protectedNow()){clear();audio?.stop?.();return;}
      apply({dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});
      if(closed||leaving)return;
      const frame=endingWrongDoorDemolitionFrame(state),p=presentation()||{},body=state.physical;
      audio?.update?.(frame,{...p,listener:{x:body.x,y:body.feet+1.62,z:body.z,yaw:body.yaw},suspended:false});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=.5){saveClock=0;save('position');}
    },
    view:()=>({...snapshot(),ready:live(),paused,closed,leaving,error,
      frame:endingWrongDoorDemolitionFrame(state),focus:live()?endingWrongDoorDemolitionFocus(state):null}),
    audioDiagnostics:()=>audio?.snapshot?.()||null,
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();audio?.stop?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(!live()||paused||protectedNow()){clear();return false;}apply({dt:0,look});return true;},
    key(e={}){
      const key=keyOf(e);
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(paused){clear();return true;}
      if(protectedNow()){clear();audio?.stop?.();return true;}
      if(!live()){
        clear();
        if(!e.repeat&&error){
          if(key==='x')void finish('return');
          else if(key==='e'&&state.status==='ready-for-source-IV')void finish('complete');
        }
        return true;
      }
      if(movement.has(key)){keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true});
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||protectedNow()){clear();return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0,body=state.physical;
        apply({dt:0,look:{yaw:body.yaw+(x-drag.x)*.004,pitch:Math.max(-1.3,Math.min(1.3,body.pitch-(y-drag.y)*.003))}});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render(state.physical,presentation())===false)throw Error('The falling world is unavailable.');}catch(reason){ready=false;fail(reason);}}
      const{rows}=uiSize();
      if(!live()){
        renderer.clear?.();
        uiCenter(Math.floor(rows/2),error
          ?state.status==='ready-for-source-IV'?'E · TRY THE NEXT DOOR / X · RETURN':'THE DOOR IS STILL THERE · X TO RETURN'
          :'THE OTHER DOOR','ui-secondary');return;
      }
      const focus=endingWrongDoorDemolitionFocus(state);
      if(focus)uiCenter(rows-3,`E · ${focus.title||'OPEN THE DOOR'}`,'ui-primary');
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
