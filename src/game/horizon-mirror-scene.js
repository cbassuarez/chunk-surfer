// HORIZON, THE MIRROR: the walking scene. Stage 1 of docs/plans/horizon-mirror.md.
// It reports what he does and decides nothing: walking into the glass and walking
// on past it are the two answers, and stage 3 is what turns them into a route.
import {HORIZON_MIRROR as C,horizonMirrorLocal} from '../data/horizon-mirror.js';

const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const PITCH=1.45;
export const HORIZON_MIRROR_EVENT=Object.freeze({ENTERED:'horizon-mirror-entered',WALKED_ON:'horizon-mirror-walked-on',PLUCKED:'horizon-mirror-petal'});

export function freshHorizonMirror({occupant='daisy'}={}){
  return{schema:1,x:C.spawn.x,z:C.spawn.z,yaw:0,pitch:0,elapsed:0,occupant:C.occupants.includes(occupant)?occupant:'daisy',petalsPlucked:0,entered:false,walkedOn:false};
}
// The glass lets him in from the front. The frame, and the board it is backed
// with, do not let him through either way; round the ends is open ground.
export function horizonMirrorBlocks(from,to){
  const a=horizonMirrorLocal(from.x,from.z),b=horizonMirrorLocal(to.x,to.z),r=C.bodyRadius,half=C.mirror.width/2,outer=half+C.mirror.frame+r;
  const crosses=(a.out>r&&b.out<=r)||(a.out<-r&&b.out>=-r)||(Math.abs(b.out)<r&&Math.abs(a.out)>=r);
  if(!crosses||Math.abs(b.along)>outer)return false;
  const intoTheGlass=a.out>0&&Math.abs(b.along)<half-r;
  return!intoTheGlass;
}
export function horizonMirrorNearGlass(state,reach=3.6){
  const l=horizonMirrorLocal(state.x,state.z);return l.out>0&&l.out<reach&&Math.abs(l.along)<C.mirror.width;
}
export function pluckHorizonMirrorPetal(current){
  if(current.occupant!=='daisy'||current.entered||current.petalsPlucked>=C.daisy.petals||!horizonMirrorNearGlass(current))return null;
  return{...current,petalsPlucked:current.petalsPlucked+1};
}
export function stepHorizonMirror(current,{dt=0,forward=0,strafe=0,paused=false}={}){
  const state={...current},events=[];
  if(paused||state.entered)return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt)));state.elapsed+=step;
  const length=Math.hypot(forward,strafe);
  if(length>0){
    const s=C.walk*step/Math.max(1,length),sin=Math.sin(state.yaw),cos=Math.cos(state.yaw),
      to={x:state.x+(sin*forward+cos*strafe)*s,z:state.z+(-cos*forward+sin*strafe)*s};
    if(!horizonMirrorBlocks(state,to)){state.x=to.x;state.z=to.z;}
    else if(!horizonMirrorBlocks(state,{x:to.x,z:state.z}))state.x=to.x;
    else if(!horizonMirrorBlocks(state,{x:state.x,z:to.z}))state.z=to.z;
  }
  const l=horizonMirrorLocal(state.x,state.z);
  if(l.out<-.5&&Math.abs(l.along)<C.mirror.width/2){state.entered=true;events.push({type:HORIZON_MIRROR_EVENT.ENTERED,occupant:state.occupant,petalsPlucked:state.petalsPlucked});}
  else if(!state.walkedOn&&state.z<C.mirror.z-C.passed){state.walkedOn=true;events.push({type:HORIZON_MIRROR_EVENT.WALKED_ON,occupant:state.occupant});}
  return{state,events};
}

export function createHorizonMirrorScene({renderer,occupant='daisy',presentation=()=>({}),isInteract=e=>keyOf(e)==='e'||e?.controllerAction==='interact',
  onEvent=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The mirror needs its renderer.');
  let state=freshHorizonMirror({occupant}),ready=false,closed=false,paused=false,failed=false,initializing=null;
  const keys=new Set();
  const p=()=>presentation()||{},stopped=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},
    live=()=>ready&&!closed&&!failed&&renderer.ready?.()!==false;
  function fail(reason){failed=true;keys.clear();onError(reason);}
  const scene={id:'horizon-mirror',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    get allowsLook(){return live()&&!stopped()&&!state.entered;},
    initialize(){
      if(initializing)return initializing;
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{if(closed)return false;if(ok===false)throw Error('The mirror could not be prepared.');ready=true;return true;}).catch(reason=>{fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed)return;
      if(!live()||stopped()){keys.clear();return;}
      const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        strafe=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      const result=stepHorizonMirror(state,{dt:Math.max(0,finite(dt)),forward,strafe});
      state=result.state;for(const e of result.events)onEvent(e);
    },
    view:()=>({ready:live(),paused,closed,failed,nearGlass:horizonMirrorNearGlass(state),state:{...state}}),
    serialize:()=>({...state}),
    pause(){paused=true;keys.clear();},resume(){if(!paused)return;paused=false;keys.clear();},blur(){scene.pause();},suspend(){scene.pause();},focus(){scene.resume();},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:state.yaw+finite(yaw),pitch:Math.max(-PITCH,Math.min(PITCH,state.pitch+finite(pitch)))};return true;},
    setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:finite(look.yaw,state.yaw),pitch:Math.max(-PITCH,Math.min(PITCH,finite(look.pitch,state.pitch)))};return true;},
    place(next={}){state={...state,...next};},
    setOccupant(id){if(C.occupants.includes(id))state={...state,occupant:id,petalsPlucked:0};return state.occupant;},
    interact(){
      if(!live()||stopped())return false;
      const next=pluckHorizonMirrorPetal(state);if(!next)return false;
      state=next;onEvent({type:HORIZON_MIRROR_EVENT.PLUCKED,petalsPlucked:state.petalsPlucked});return true;
    },
    key(e={}){
      const k=keyOf(e);
      if(k==='escape'||e.controllerAction==='back'){keys.clear();return false;}
      if(closed||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(!e.repeat&&isInteract(e)){scene.interact();return true;}
      if(walkKeys.has(k)&&!e.repeat&&live())keys.add(k);
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    input(name,value=true){
      if(name==='interact'){if(value)scene.interact();return true;}
      const key=actions[name]||name;if(!walkKeys.has(key))return false;if(!value)keys.delete(key);else if(live())keys.add(key);return true;
    },
    render(){
      if(closed||!ready)return;
      try{if(renderer.render(state,p())===false)throw Error('The mirror view was interrupted.');}catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();renderer.dispose?.();onExit();},
  };
  return scene;
}
