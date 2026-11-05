import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,sixBlinkLit,sixClockCentre,sixFlatBlocks,sixRadius} from '../data/six-nothingness.js';
import {THRESHOLD_GAG as G,thresholdGagAngle,thresholdGagTiming} from '../data/threshold-gag.js';

const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const PITCH=1.45;

export function freshSixNothingness(){
  return{schema:1,x:C.step.x,z:C.step.z,yaw:0,pitch:0,elapsed:0,fired:{},clocks:{},faulted:false};
}
// A boo's own point, at its current swing, in local metres.
export function sixBooPoint(boo,point,angle=0){
  const a=boo.yaw+angle,c=Math.cos(a),s=Math.sin(a);
  return{x:boo.x+c*point[0]-s*point[2],y:C.boos.mountHeight+point[1],z:boo.z+s*point[0]+c*point[2]};
}
export function sixBooAngle(state,boo,{reducedMotion=false}={}){
  const fired=state.fired?.[boo.id];
  return thresholdGagAngle(fired?state.elapsed-fired.at:0,{fired:!!fired,reduced:reducedMotion});
}
// Walking out past a boo fires it once. It stays out until the night restarts.
function fireBoos(state,before,reduced,events){
  const movingOut=sixRadius(state.x,state.z)>sixRadius(before.x,before.z)+1e-6;
  if(movingOut)for(const boo of SIX_BOOS){
    if(state.fired[boo.id]||Math.hypot(state.x-boo.x,state.z-boo.z)>C.boos.trigger)continue;
    state.fired[boo.id]={at:state.elapsed,emitted:0};
    events.push({type:'threshold-gag-release',id:boo.id,position:sixBooPoint(boo,[0,0,0]),chartId:0});
  }
  const clock=thresholdGagTiming(reduced);
  for(const boo of SIX_BOOS){
    const fired=state.fired[boo.id];if(!fired)continue;
    const age=state.elapsed-fired.at;
    for(const[kind,bit,at,point]of[['stop',1,clock.contact,G.contact],['rattle',2,clock.rattle,G.contact],['speaker-click',4,clock.click,G.speaker],['boo',8,clock.boo,G.speaker]]){
      if(fired.emitted&bit||age<at)continue;
      fired.emitted|=bit;
      events.push({type:'threshold-gag-'+kind,id:boo.id,position:sixBooPoint(boo,point,sixBooAngle(state,boo,{reducedMotion:reduced})),chartId:0});
    }
  }
}
export function stepSixNothingness(current,{dt=0,forward=0,strafe=0,reducedMotion=false,paused=false}={}){
  const state={...current,fired:{...current.fired},clocks:{...current.clocks}},events=[];
  for(const id of Object.keys(state.fired))state.fired[id]={...state.fired[id]};
  if(paused||state.faulted)return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt))),before={x:state.x,z:state.z};
  state.elapsed+=step;
  const length=Math.hypot(forward,strafe);
  if(length>0){
    const s=C.walk*step/Math.max(1,length),sin=Math.sin(state.yaw),cos=Math.cos(state.yaw),
      x=state.x+(sin*forward+cos*strafe)*s,z=state.z+(-cos*forward+sin*strafe)*s;
    // Standing in the cut of the door, the board is either side of you too.
    const{flat,bodyRadius}=C,inCut=Math.abs(state.z)<flat.thickness/2+bodyRadius,inBoard=Math.abs(x)>flat.door.halfWidth-bodyRadius&&Math.abs(x)<=flat.halfWidth+bodyRadius;
    if(!inCut||!inBoard)state.x=x;
    if(!sixFlatBlocks(state.z,z,state.x))state.z=z;
  }
  fireBoos(state,before,reducedMotion,events);
  const lit=sixBlinkLit(state.elapsed,{reducedMotion});
  for(const clock of SIX_CLOCKS){
    const at=sixClockCentre(clock),distance=Math.hypot(state.x-at.x,state.z-at.z);
    if(state.clocks[clock.id]){if(distance>C.ruin.hide)delete state.clocks[clock.id];}
    else if(lit&&distance<C.ruin.reveal)state.clocks[clock.id]=true;
  }
  if(sixRadius(state.x,state.z)>=C.faults.radius-C.faults.touch){state.faulted=true;events.push({type:'six-fault'});}
  return{state,events};
}

export function createSixNothingnessScene({renderer,audio=null,intro=null,introSeconds=0,presentation=()=>({}),onFault=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The nothingness needs its renderer.');
  let state=freshSixNothingness(),ready=false,closed=false,paused=false,failed=false,introAt=0,initializing=null;
  const keys=new Set();
  const p=()=>presentation()||{},held=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},
    live=()=>ready&&!closed&&!failed&&renderer.ready?.()!==false,inIntro=()=>!!intro&&introAt<introSeconds;
  const listener=()=>({runId:'six',x:state.x,feet:0,z:state.z,yaw:state.yaw,pitch:state.pitch,chartId:0});
  function fail(reason){failed=true;keys.clear();onError(reason);}
  function dispatch(events){
    for(const event of events){
      if(event.type==='six-fault'){keys.clear();onFault();continue;}
      audio?.event?.(event,listener(),null);
    }
  }
  const scene={id:'six-nothingness',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    get allowsLook(){return live()&&!held()&&!inIntro()&&!state.faulted;},
    initialize(){
      if(initializing)return initializing;
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{if(closed)return false;if(ok===false)throw Error('The nothingness could not be prepared.');ready=true;return true;}).catch(reason=>{fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed)return;
      if(!live()||held()){keys.clear();return;}
      const step=Math.max(0,finite(dt));
      if(inIntro()){
        introAt+=step;
        const pose=intro(Math.min(introAt,introSeconds));
        state={...state,x:pose.x,z:pose.z,yaw:pose.yaw,pitch:pose.pitch,elapsed:state.elapsed+step};
        return;
      }
      const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        strafe=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      const result=stepSixNothingness(state,{dt:step,forward,strafe,reducedMotion:!!p().reducedMotion});
      state=result.state;dispatch(result.events);audio?.update?.(listener(),null,null);
    },
    view:()=>({ready:live(),paused,closed,failed,inIntro:inIntro(),state:JSON.parse(JSON.stringify(state))}),
    serialize:()=>JSON.parse(JSON.stringify(state)),
    pause(){paused=true;keys.clear();},resume(){if(!paused)return;paused=false;keys.clear();},blur(){scene.pause();},suspend(){scene.pause();},focus(){scene.resume();},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:state.yaw+finite(yaw),pitch:Math.max(-PITCH,Math.min(PITCH,state.pitch+finite(pitch)))};return true;},
    setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:finite(look.yaw,state.yaw),pitch:Math.max(-PITCH,Math.min(PITCH,finite(look.pitch,state.pitch)))};return true;},
    place(next={}){state={...state,...next};},
    key(e={}){
      const k=keyOf(e);
      if(k==='escape'||e.controllerAction==='back'){keys.clear();return false;}
      if(closed||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(walkKeys.has(k)&&!e.repeat&&live()&&!inIntro())keys.add(k);
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    input(name,value=true){const key=actions[name]||name;if(!walkKeys.has(key))return false;if(!value)keys.delete(key);else if(live()&&!inIntro())keys.add(key);return true;},
    render(){
      if(closed||!ready)return;
      try{if(renderer.render(state,p())===false)throw Error('The nothingness view was interrupted.');}catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();audio?.stop?.();renderer.dispose?.();onExit();},
  };
  return scene;
}
