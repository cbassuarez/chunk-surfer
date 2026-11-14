// Replays borrow the real field, its collisions, animation and verbs. There is
// deliberately no save, flag, recorder or night-clock dependency in this host.
import {createMemoryFieldScene} from './memory-field-scene.js';

export function createTransferFieldReplay({visit,renderer,audio,presentation,paintOverlay,
  setTableau=()=>{},onReturn=()=>{},onError=()=>{},
}={}){
  let returned=false;
  // The live first visit is one involuntary breath. In extras that same body
  // becomes available afterwards, so even this entry is a place to explore.
  // Clone only this replay: the authored visit and its live timer stay intact.
  const first=visit.id==='first',introSeconds=visit.maxSeconds;
  const replayVisit=first?{...visit,maxSeconds:Infinity}:visit;
  const introHeld=new Map();
  const release=()=>{
    if(returned)return;returned=true;
    introHeld.clear();
    setTableau(null);onReturn(scene);
  };
  // The actual field scene owns its arrival and departure light. Replays do
  // not layer removed world seeps, action faults or cab bleeds over the visit.
  const scene=createMemoryFieldScene({visit:replayVisit,renderer,audio,presentation,paintOverlay,
    onDone:release,onExit:release,onError});
  const key=scene.key,keyUp=scene.keyup,update=scene.update;
  const movement=event=>/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/i.test(String(event.key||'').replace(/^key/i,''));
  const identity=event=>String(event.code||event.key||'').toLowerCase();
  scene.id='transfer-field-replay';scene.handlesEscape=true;scene.frontEndReplay=true;
  scene.update=dt=>{
    update(dt);
    if(first&&!replayVisit.walk&&scene.view().state.elapsed>=introSeconds){
      replayVisit.walk=true;
      for(const event of introHeld.values())key(event);
      introHeld.clear();
    }
  };
  scene.key=event=>{
    if(String(event?.key||'').toLowerCase()==='escape'||event?.controllerAction==='back'){
      event.preventDefault?.();release();return true;
    }
    if(first&&!replayVisit.walk&&movement(event))introHeld.set(identity(event),{...event,repeat:false});
    return key(event);
  };
  scene.keyup=event=>{introHeld.delete(identity(event));return keyUp(event);};
  scene.cancel=release;
  return scene;
}
