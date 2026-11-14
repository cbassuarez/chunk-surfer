// HORIZON: the walking scene. He walks up to whoever is there. It reports what he
// does and decides nothing: the route is raised from these events by whoever owns
// the night.
import {HORIZON_TOWER_WALK,HORIZON_SOUNDING_BELLS,horizonBellDue,horizonBellStrikes} from '../data/horizon-tower-bells.js';
import {HORIZON_APPROACH as C,HORIZON_TOWER_BEARING,HORIZON_TOWER_SECTOR,horizonTowerRoad,horizonTowerBearing,horizonApproachVariantId,spaceInverse,spaceAtMap,spaceMapOf,spaceMultiply,spaceTranslation,spaceDistance,spaceIdentity} from '../data/horizon-approach.js';

const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const PITCH=1.45,TAU=Math.PI*2;
const wrapAngle=a=>a-TAU*Math.floor(a/TAU+.5);
export const HORIZON_APPROACH_EVENT=Object.freeze({
  ARRIVED:'horizon-approach-arrived',PLUCKED:'horizon-approach-petal',OPENED:'horizon-approach-offer-open',
  ACCEPTED:'horizon-approach-accepted',DECLINED:'horizon-approach-declined',RETURNED:'horizon-approach-returned',
  BELL:'horizon-approach-bell',TOWER_REACHED:'horizon-approach-tower-reached',
});
// St Brendan's bearing and the tower road live with the space's data now, so the
// bells along that road can be laid out without the scene.
export {HORIZON_TOWER_BEARING,HORIZON_TOWER_SECTOR,horizonTowerRoad,horizonTowerBearing};

export function freshHorizonApproach({variant=C.defaultVariant,occupant='daisy',condition=false,lyleBox=null,phi=0,returning=false,defeats=0}={}){
  const id=horizonApproachVariantId(variant),V=C.variants[id],losses=Math.max(0,Math.floor(finite(defeats))),again=!!returning||losses>0,start=again?C.station.reach-.6:V.startMetres;
  return{schema:1,variant:id,occupant:C.occupants.includes(occupant)?occupant:'daisy',condition:again||!!condition,lyleBox,
    frame:spaceAtMap(V.sign,V.radius,start,phi),yaw:-phi,pitch:0,elapsed:0,arrived:false,offerOpen:false,
    petalsPlucked:again&&occupant==='daisy'?C.daisy.petals:0,decided:null,returning:again,defeats:losses,tower:null};
}
// THE TOWER ROAD. Taken the first time, in the closed space, the tower is not a
// cut: he walks on down the pale road, between the bells, to St Brendan's. Coming
// back after a defeat, or in the other spaces, taking it is arriving.
export const horizonTowerWalking=state=>state?.decided==='accepted'&&!!state.tower&&!state.tower.reached;
const towerRoadFor=state=>!state.returning&&state.variant==='closed';
const SOUNDING=new Set(HORIZON_SOUNDING_BELLS.map(bell=>bell.id));
function restoreTower(value,elapsed){
  if(!value||typeof value!=='object')return null;
  const rung={};
  for(const[id,at]of Object.entries(value.rung||{}))if(SOUNDING.has(id)&&Number.isFinite(at))rung[id]=Math.max(0,Math.min(elapsed,at));
  return{rung,still:Math.max(0,finite(value.still)),reached:value.reached===true};
}
export function restoreHorizonApproach(value,fallback={}){
  if(!value||typeof value!=='object'||!Array.isArray(value.frame)||value.frame.length!==16||!value.frame.every(Number.isFinite))return freshHorizonApproach(fallback);
  if(finite(fallback.defeats)>finite(value.defeats))return freshHorizonApproach(fallback);
  const variant=Object.hasOwn(C.variants,value.variant)?value.variant:fallback.variant,
    occupant=C.occupants.includes(value.occupant)?value.occupant:fallback.occupant,
    state=freshHorizonApproach({...fallback,variant,occupant,condition:value.condition,lyleBox:['broken','whole'].includes(value.lyleBox)?value.lyleBox:null,
      returning:value.returning,defeats:finite(value.defeats)});
  return{...state,frame:value.frame.slice(),yaw:finite(value.yaw,state.yaw),pitch:Math.max(-PITCH,Math.min(PITCH,finite(value.pitch))),
    elapsed:Math.max(0,finite(value.elapsed)),arrived:value.arrived===true,offerOpen:value.offerOpen===true,
    petalsPlucked:state.returning&&occupant==='daisy'?C.daisy.petals:Math.max(0,Math.min(C.daisy.petals,Math.floor(finite(value.petalsPlucked)))),
    decided:value.decided==='accepted'?'accepted':value.decided==='declined'&&!state.returning?'declined':null,
    tower:value.decided==='accepted'&&towerRoadFor(state)?restoreTower(value.tower,Math.max(0,finite(value.elapsed)))||{rung:{},still:0,reached:false}:null};
}
export const horizonApproachMap=state=>{const V=C.variants[state.variant];return spaceMapOf(V.sign,V.radius,state.frame);};
// Where a thing standing at `r` on bearing `phi` is from him: how far, along the
// space's own line, and at what bearing from where he is looking (to his right
// positive). For hearing it.
export function horizonApproachBearingTo(state,r,phi){
  const V=C.variants[state.variant],target=spaceAtMap(V.sign,V.radius,r,phi),distance=spaceDistance(V.sign,V.radius,state.frame,target);
  const local=spaceMultiply(spaceInverse(V.sign,state.frame),target),x=local[3],z=local[11];
  return{distance,bearing:Math.hypot(x,z)>1e-9?wrapAngle(Math.atan2(x,-z)-state.yaw):0};
}
export function horizonApproachDistance(state){
  const V=C.variants[state.variant];
  return spaceDistance(V.sign,V.radius,state.frame,spaceIdentity());
}
export const horizonApproachNear=state=>horizonApproachDistance(state)<C.station.reach;
// Where a body may stand. The closed space is only its roads and the two places
// they meet; the circle limit is its tiles, as far as there are any.
export function horizonApproachOnGround(variant,frame){
  const V=C.variants[variant],{r,phi}=spaceMapOf(V.sign,V.radius,frame);
  if(V.sign<0)return r<V.tileRings*V.radius-1;
  if(variant==='relativity'){
    const{x,z}=spaceMapOf(V.sign,V.radius,frame);
    return r<V.hub||(Math.abs(x)<=V.roadHalfWidth-C.bodyRadius&&Math.abs(z)<=V.roadEnd)||(Math.abs(z)<=V.roadHalfWidth-C.bodyRadius&&x>=0&&x<=V.roadEnd);
  }
  const end=Math.PI*V.radius;
  if(r<V.hub||r>end-V.hub)return true;
  const spacing=TAU/V.roads,off=Math.abs(wrapAngle(phi-Math.round(phi/spacing)*spacing));
  return V.radius*Math.sin(r/V.radius)*off<=V.roadHalfWidth-C.bodyRadius;
}
function openOffer(state,events){
  if(state.offerOpen)return;
  state.offerOpen=true;events.push({type:HORIZON_APPROACH_EVENT.OPENED,occupant:state.occupant,lyleBox:state.lyleBox||null,returning:!!state.returning,defeats:state.defeats||0});
}
// A petal, at the object. The last one opens the offer: it is the only occupant
// whose condition is met here and now.
export function pluckHorizonApproachPetal(current){
  if(current.occupant!=='daisy'||current.decided||current.petalsPlucked>=C.daisy.petals||!horizonApproachNear(current))return null;
  const petalsPlucked=current.petalsPlucked+1,state={...current,petalsPlucked},events=[{type:HORIZON_APPROACH_EVENT.PLUCKED,petalsPlucked}];
  if(petalsPlucked===C.daisy.petals)openOffer(state,events);
  return{state,events};
}
// The offer is still to come: the daisy has petals left, and the last of them is
// what opens it. Every other occupant opens it on arrival or never can.
export const horizonApproachOfferPending=state=>!!state.arrived&&!state.decided&&!state.offerOpen
  &&state.occupant==='daisy'&&state.petalsPlucked<C.daisy.petals;
// How far from the object he can walk this frame. Once he is there, walking past
// it is not a way round the offer: until it has been put to him and finished, no
// road takes him further out than arm's reach. A hair inside it, so that what he
// can do there ([E], a petal) stays in reach wherever he stops.
export function horizonApproachTether(state,{decisionsEnabled=true}={}){
  if(!state.arrived||state.decided)return Infinity;
  return decisionsEnabled&&!horizonApproachOfferPending(state)?Infinity:C.station.reach-.01;
}
// Once the tower is taken the only ground is the tower road, from where the
// choice was made on to St Brendan's door: no way back onto the others.
export function horizonTowerRoadGround(frame){
  const V=C.variants.closed,{r,phi}=spaceMapOf(V.sign,V.radius,frame);
  return r>=HORIZON_TOWER_WALK.from&&r<=HORIZON_TOWER_WALK.arrive+3
    &&V.radius*Math.sin(r/V.radius)*Math.abs(wrapAngle(phi-horizonTowerBearing('closed')))<=V.roadHalfWidth-C.bodyRadius;
}
// Straight on, in the space's own sense of straight. A wall is met by sliding along it.
function move(state,forward,strafe,distance,tether=Infinity){
  const ground=horizonTowerWalking(state)?horizonTowerRoadGround:frame=>horizonApproachOnGround(state.variant,frame);
  const V=C.variants[state.variant],length=Math.hypot(forward,strafe);if(!length)return false;
  const heading=Math.atan2(strafe,forward)+state.yaw,centre=spaceIdentity(),now=spaceDistance(V.sign,V.radius,state.frame,centre);
  for(const[turn,share]of[[0,1],[.7,.7],[-.7,.7],[1.2,.35],[-1.2,.35]]){
    const a=heading+turn,frame=spaceMultiply(state.frame,spaceTranslation(V.sign,V.radius,[Math.sin(a),0,-Math.cos(a)],distance*share)),d=spaceDistance(V.sign,V.radius,frame,centre);
    // He walks up to it, not through it; and not away from it before it has spoken.
    if(!(d<C.station.standOff&&d<now)&&!(d>tether&&d>now)&&ground(frame)){state.frame=frame;return true;}
  }
  return false;
}
export function stepHorizonApproach(current,{dt=0,forward=0,strafe=0,paused=false,decisionsEnabled=true}={}){
  const state={...current},events=[];
  if(paused||state.decided&&!horizonTowerWalking(state))return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt)));
  state.elapsed+=step;
  const length=Math.hypot(forward,strafe);
  if(horizonTowerWalking(state))return stepTowerRoad(state,{step,forward,strafe,length});
  const moved=length>0&&step>0&&move(state,forward/Math.max(1,length),strafe/Math.max(1,length),C.walk*step*Math.min(1,length),horizonApproachTether(state,{decisionsEnabled}));
  const near=horizonApproachNear(state);
  if(!state.arrived&&near){
    // The truth is given here, whoever it is, whatever he brought.
    state.arrived=true;events.push({type:state.returning?HORIZON_APPROACH_EVENT.RETURNED:HORIZON_APPROACH_EVENT.ARRIVED,occupant:state.occupant,lyleBox:state.lyleBox||null,condition:state.condition,defeats:state.defeats||0});
    if(state.condition&&(state.returning||state.occupant!=='daisy'))openOffer(state,events);
  }
  // Standing there decides nothing. Walking on is the only thing that does, and
  // only once there is nothing left for him to be offered.
  if(state.arrived&&moved&&decisionsEnabled&&!horizonApproachOfferPending(state)&&horizonApproachDistance(state)>C.commit){
    const{phi}=horizonApproachMap(state),tower=state.offerOpen&&Math.abs(wrapAngle(phi-horizonTowerBearing(state.variant)))<HORIZON_TOWER_SECTOR;
    if(state.returning&&!tower)return{state,events};
    state.decided=tower?'accepted':'declined';
    if(tower&&towerRoadFor(state))state.tower={rung:{},still:0,reached:false};
    events.push({type:tower?HORIZON_APPROACH_EVENT.ACCEPTED:HORIZON_APPROACH_EVENT.DECLINED,occupant:state.occupant,exit:tower?'tower':'chapel',walking:!!state.tower});
  }
  return{state,events};
}
// A step on the tower road. A bell sounds when what sets it off comes due, once;
// at St Brendan's door the Rind hands him on.
function stepTowerRoad(state,{step,forward,strafe,length}){
  const events=[],moved=length>0&&step>0&&move(state,forward/Math.max(1,length),strafe/Math.max(1,length),C.walk*step*Math.min(1,length));
  const tower={...state.tower,rung:{...state.tower.rung}};
  tower.still=moved?0:tower.still+step;
  const along=horizonApproachMap(state).r;
  for(const bell of HORIZON_SOUNDING_BELLS){
    if(tower.rung[bell.id]!=null||!horizonBellDue(bell,{along,still:tower.still}))continue;
    tower.rung[bell.id]=state.elapsed;
    events.push({type:HORIZON_APPROACH_EVENT.BELL,id:bell.id,ring:bell.ring,size:bell.size,strikes:horizonBellStrikes(bell)});
  }
  if(along>=HORIZON_TOWER_WALK.arrive){tower.reached=true;events.push({type:HORIZON_APPROACH_EVENT.TOWER_REACHED,exit:'tower'});}
  state.tower=tower;
  return{state,events};
}

export function createHorizonApproachScene({renderer,variant=C.defaultVariant,occupant='daisy',condition=false,lyleBox=null,returning=false,defeats=0,snapshot=null,presentation=()=>({}),isInteract=e=>keyOf(e)==='e'||e?.controllerAction==='interact',
  decisionsEnabled=()=>true,onEvent=()=>{},onInspect=()=>false,paintOverlay=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The approach needs its renderer.');
  let state=restoreHorizonApproach(snapshot,{variant,occupant,condition,lyleBox,returning,defeats}),ready=false,closed=false,paused=false,failed=false,initializing=null;
  const keys=new Set();
  const p=()=>presentation()||{},stopped=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},
    live=()=>ready&&!closed&&!failed&&renderer.ready?.()!==false,
    decisionReady=()=>typeof decisionsEnabled==='function'?decisionsEnabled(state)!==false:decisionsEnabled!==false;
  function fail(reason){failed=true;keys.clear();onError(reason);}
  const emit=events=>{for(const e of events)onEvent(e);};
  const scene={id:'horizon-approach',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    get allowsLook(){return live()&&!stopped()&&(!state.decided||horizonTowerWalking(state));},
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
      const result=stepHorizonApproach(state,{dt:Math.max(0,finite(dt)),forward,strafe,decisionsEnabled:decisionReady()});
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
    placeAt(r,phi=0,look={}){
      const V=C.variants[state.variant];
      state={...state,frame:spaceAtMap(V.sign,V.radius,r,phi),yaw:finite(look.yaw,-phi),pitch:finite(look.pitch,0)};
    },
    walk(seconds,{forward=1,strafe=0,dt=1/30}={}){
      const events=[];
      for(let t=0;t<seconds;t+=dt){const r=stepHorizonApproach(state,{dt,forward,strafe,decisionsEnabled:decisionReady()});state=r.state;events.push(...r.events);}
      emit(events);return events;
    },
    setOccupant(id,{condition=state.condition,lyleBox=state.lyleBox}={}){if(C.occupants.includes(id))state={...state,occupant:id,condition:state.returning||!!condition,lyleBox,petalsPlucked:state.returning&&id==='daisy'?C.daisy.petals:0,offerOpen:false,arrived:false};return state.occupant;},
    interact(){
      if(!live()||stopped())return false;
      const next=pluckHorizonApproachPetal(state);
      if(next){state=next.state;emit(next.events);return true;}
      return horizonApproachNear(state)&&state.arrived&&(state.occupant!=='daisy'||state.offerOpen)?onInspect({...state,frame:state.frame.slice()})!==false:false;
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
      try{const presentation=p();if(renderer.render(state,presentation)===false)throw Error('The approach view was interrupted.');paintOverlay(state,presentation);}catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();renderer.dispose?.();onExit();},
  };
  return scene;
}
