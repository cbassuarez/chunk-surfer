// HORIZON: the walking scene. He walks up to whoever is there. It reports what he
// does and decides nothing: the route is raised from these events by whoever owns
// the night.
import {HORIZON_APPROACH as C,spaceAtMap,spaceMapOf,spaceMultiply,spaceTranslation,spaceDistance,spaceIdentity} from '../data/horizon-approach.js';

const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const PITCH=1.45,TAU=Math.PI*2;
const wrapAngle=a=>a-TAU*Math.floor(a/TAU+.5);
export const HORIZON_APPROACH_EVENT=Object.freeze({
  ARRIVED:'horizon-approach-arrived',PLUCKED:'horizon-approach-petal',OPENED:'horizon-approach-offer-open',
  ACCEPTED:'horizon-approach-accepted',DECLINED:'horizon-approach-declined',
});
// The bearing St Brendan's lies on, from the object. Anywhere else out is the chapel.
export const HORIZON_TOWER_BEARING=Math.PI*.5,HORIZON_TOWER_SECTOR=.42;

export function freshHorizonApproach({occupant='daisy',condition=false,lyleBox=null,phi=0}={}){
  return{schema:1,occupant:C.occupants.includes(occupant)?occupant:'daisy',condition:!!condition,lyleBox,
    frame:spaceAtMap(C.space.startMetres,phi),yaw:-phi,pitch:0,elapsed:0,arrived:false,offerOpen:false,petalsPlucked:0,decided:null};
}
export const horizonApproachMap=state=>spaceMapOf(state.frame);
export const horizonApproachDistance=state=>spaceDistance(state.frame,spaceIdentity());
export const horizonApproachNear=state=>horizonApproachDistance(state)<C.station.reach;
// Where a body may stand: on the roads and the two places they meet.
export function horizonApproachOnGround(frame){
  const V=C.space,{r,phi}=spaceMapOf(frame),end=Math.PI*V.radius;
  if(r<V.hub||r>end-V.hub)return true;
  const spacing=TAU/V.roads,off=Math.abs(wrapAngle(phi-Math.round(phi/spacing)*spacing));
  return V.radius*Math.sin(r/V.radius)*off<=V.roadHalfWidth-C.bodyRadius;
}
function openOffer(state,events){
  if(state.offerOpen)return;
  state.offerOpen=true;events.push({type:HORIZON_APPROACH_EVENT.OPENED,occupant:state.occupant,lyleBox:state.lyleBox||null});
}
// A petal, at the object. The last one opens the offer: it is the only occupant
// whose condition is met here and now.
export function pluckHorizonApproachPetal(current){
  if(current.occupant!=='daisy'||current.decided||current.petalsPlucked>=C.daisy.petals||!horizonApproachNear(current))return null;
  const petalsPlucked=current.petalsPlucked+1,state={...current,petalsPlucked},events=[{type:HORIZON_APPROACH_EVENT.PLUCKED,petalsPlucked}];
  if(petalsPlucked===C.daisy.petals)openOffer(state,events);
  return{state,events};
}
// Straight on, in the space's own sense of straight. A wall is met by sliding along it.
function move(state,forward,strafe,distance){
  const length=Math.hypot(forward,strafe);if(!length)return false;
  const heading=Math.atan2(strafe,forward)+state.yaw,centre=spaceIdentity(),now=spaceDistance(state.frame,centre);
  for(const[turn,share]of[[0,1],[.7,.7],[-.7,.7],[1.2,.35],[-1.2,.35]]){
    const a=heading+turn,frame=spaceMultiply(state.frame,spaceTranslation([Math.sin(a),0,-Math.cos(a)],distance*share)),d=spaceDistance(frame,centre);
    // He walks up to it, not through it.
    if(!(d<C.station.standOff&&d<now)&&horizonApproachOnGround(frame)){state.frame=frame;return true;}
  }
  return false;
}
export function stepHorizonApproach(current,{dt=0,forward=0,strafe=0,paused=false}={}){
  const state={...current},events=[];
  if(paused||state.decided)return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt)));
  state.elapsed+=step;
  const length=Math.hypot(forward,strafe);
  if(length>0)move(state,forward/Math.max(1,length),strafe/Math.max(1,length),C.walk*step*Math.min(1,length));
  const near=horizonApproachNear(state);
  if(!state.arrived&&near){
    // The truth is given here, whoever it is, whatever he brought.
    state.arrived=true;events.push({type:HORIZON_APPROACH_EVENT.ARRIVED,occupant:state.occupant,lyleBox:state.lyleBox||null,condition:state.condition});
    if(state.condition&&state.occupant!=='daisy')openOffer(state,events);
  }
  // Standing there decides nothing. Walking on is the only thing that does.
  if(state.arrived&&horizonApproachDistance(state)>C.commit){
    const{phi}=horizonApproachMap(state),tower=state.offerOpen&&Math.abs(wrapAngle(phi-HORIZON_TOWER_BEARING))<HORIZON_TOWER_SECTOR;
    state.decided=tower?'accepted':'declined';
    events.push({type:tower?HORIZON_APPROACH_EVENT.ACCEPTED:HORIZON_APPROACH_EVENT.DECLINED,occupant:state.occupant,exit:tower?'tower':'chapel'});
  }
  return{state,events};
}

export function createHorizonApproachScene({renderer,occupant='daisy',condition=false,lyleBox=null,presentation=()=>({}),isInteract=e=>keyOf(e)==='e'||e?.controllerAction==='interact',
  onEvent=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The approach needs its renderer.');
  let state=freshHorizonApproach({occupant,condition,lyleBox}),ready=false,closed=false,paused=false,failed=false,initializing=null;
  const keys=new Set();
  const p=()=>presentation()||{},stopped=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},
    live=()=>ready&&!closed&&!failed&&renderer.ready?.()!==false;
  function fail(reason){failed=true;keys.clear();onError(reason);}
  const emit=events=>{for(const e of events)onEvent(e);};
  const scene={id:'horizon-approach',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    get allowsLook(){return live()&&!stopped()&&!state.decided;},
    initialize(){
      if(initializing)return initializing;
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{if(closed)return false;if(ok===false)throw Error('The approach could not be prepared.');ready=true;return true;}).catch(reason=>{fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed)return;
      if(!live()||stopped()){keys.clear();return;}
      const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        strafe=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      const result=stepHorizonApproach(state,{dt:Math.max(0,finite(dt)),forward,strafe});
      state=result.state;emit(result.events);
    },
    view:()=>({ready:live(),paused,closed,failed,near:horizonApproachNear(state),distance:horizonApproachDistance(state),map:horizonApproachMap(state),state:{...state,frame:undefined}}),
    serialize:()=>JSON.parse(JSON.stringify(state)),
    pause(){paused=true;keys.clear();},resume(){if(!paused)return;paused=false;keys.clear();},blur(){scene.pause();},suspend(){scene.pause();},focus(){scene.resume();},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:state.yaw+finite(yaw),pitch:Math.max(-PITCH,Math.min(PITCH,state.pitch+finite(pitch)))};return true;},
    setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:finite(look.yaw,state.yaw),pitch:Math.max(-PITCH,Math.min(PITCH,finite(look.pitch,state.pitch)))};return true;},
    place(next={}){state={...state,...next};},
    // Stands him `r` metres out on bearing `phi`, facing the object.
    placeAt(r,phi=0,look={}){state={...state,frame:spaceAtMap(r,phi),yaw:finite(look.yaw,-phi),pitch:finite(look.pitch,0)};},
    walk(seconds,{forward=1,strafe=0,dt=1/30}={}){
      const events=[];
      for(let t=0;t<seconds;t+=dt){const r=stepHorizonApproach(state,{dt,forward,strafe});state=r.state;events.push(...r.events);}
      emit(events);return events;
    },
    setOccupant(id,{condition=state.condition,lyleBox=state.lyleBox}={}){if(C.occupants.includes(id))state={...state,occupant:id,condition:!!condition,lyleBox,petalsPlucked:0,offerOpen:false,arrived:false};return state.occupant;},
    interact(){
      if(!live()||stopped())return false;
      const next=pluckHorizonApproachPetal(state);if(!next)return false;
      state=next.state;emit(next.events);return true;
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
      try{if(renderer.render(state,p())===false)throw Error('The approach view was interrupted.');}catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();renderer.dispose?.();onExit();},
  };
  return scene;
}
