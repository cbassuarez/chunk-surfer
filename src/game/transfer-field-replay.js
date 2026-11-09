// Replays borrow the real field, its collisions, animation and verbs. There is
// deliberately no save, flag, recorder or night-clock dependency in this host.
import {createMemoryFieldScene} from './memory-field-scene.js';
import {neuralFrame,neuralSeconds} from './neural-transition.js';

export function createTransferFieldReplay({visit,renderer,audio,presentation,paintOverlay,
  effect=null,setTableau=()=>{},playEffect=()=>{},onReturn=()=>{},onError=()=>{},
}={}){
  let returned=false,shown=false,sounded=false;
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
  const ownedRenderer={
    initialize:row=>renderer.initialize(row),
    render(state,look){
      const options=presentation?.()||{};
      if(effect?.kind==='seep'){
        const t=state.elapsed-2.4,settings={reducedFlash:!!options.reducedFlash,reducedMotion:!!options.reducedMotion};
        const lead=neuralSeconds('seep-in',settings),hold=.3;
        const plate=t>=lead&&t<lead+hold;
        if(plate!==shown){shown=plate;setTableau(plate?effect.plate:null,plate?{gain:options.reducedFlash?.55:1.1}:undefined);}
        if(t>=0&&!sounded){sounded=true;playEffect(effect);}
        if(t>=0&&t<lead)look={...look,neural:neuralFrame('seep-in',t,settings)};
        else if(plate)look={...look,neural:neuralFrame('seep-flash',t-lead,settings)};
        else if(t>=lead+hold&&t<lead+hold+neuralSeconds('seep-out',settings))look={...look,neural:neuralFrame('seep-out',t-lead-hold,settings)};
      }else if(effect?.kind==='bleed'&&state.elapsed>=2.4&&!sounded){sounded=true;playEffect(effect);}
      return renderer.render(state,look);
    },
    dispose(){setTableau(null);renderer.dispose();},
  };
  const scene=createMemoryFieldScene({visit:replayVisit,renderer:ownedRenderer,audio,presentation,paintOverlay,
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
