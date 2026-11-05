import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,sixBlinkLit,sixClockCentre,sixClockStep,sixFlatBlocks,sixFaultTouched,sixVantageClock,sixVantageLook} from '../data/six-nothingness.js';
import {THRESHOLD_GAG as G,thresholdGagAngle,thresholdGagTiming} from '../data/threshold-gag.js';

const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const PITCH=1.45;
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
const turn=(from,to)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from));
const BOO_POSES=Object.freeze(['arm_out','head_turn']);

export function freshSixNothingness(){
  return{schema:2,x:C.step.x,z:C.step.z,yaw:0,pitch:0,elapsed:0,fired:{},clocks:{},booCount:0,resets:0,scare:null,exit:null,left:false};
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
// Somewhere straight down the line you are looking along, at the height of the floor.
const ahead=(state,distance)=>({x:state.x+Math.sin(state.yaw)*distance,z:state.z-Math.cos(state.yaw)*distance});

// What comes with a boo that is not a gag, or out of a fault: a real figure.
// It is fixed in the world from the moment it starts, never steered after you.
export function sixScareFigure(state,{reducedDread=false}={}){
  const s=state?.scare;if(!s)return null;
  const t=finite(state.elapsed)-finite(s.at);if(t<0||t>C.scare.seconds)return null;
  const rush=s.kind==='boo'&&!reducedDread?smooth(t/C.scare.rush):s.kind==='boo'?0:1,
    x=s.from.x+(s.to.x-s.from.x)*rush,z=s.from.z+(s.to.z-s.from.z)*rush,
    fade=1-smooth((t-C.scare.seconds*.72)/(C.scare.seconds*.28));
  return{x,z,y:0,yaw:Math.atan2(x-s.eye.x,-(z-s.eye.z)),pose:s.pose,charge:.95*fade,kind:s.kind,id:s.id};
}
function startScare(state,kind,{id,from,pose,reducedDread}){
  const distance=kind==='fault'?C.scare.faultDistance*(reducedDread?3:1):C.scare.distance*(reducedDread?2.4:1),to=ahead(state,distance);
  state.scare={kind,id,at:state.elapsed,from:from||to,to,eye:{x:state.x,z:state.z},pose};
}

// Walking up on a boo fires it once. It stays out until the faults send you back.
function fireBoos(state,before,{reduced,reducedDread},events){
  for(const boo of SIX_BOOS){
    if(state.fired[boo.id])continue;
    const now=Math.hypot(state.x-boo.x,state.z-boo.z);
    if(now>C.boos.trigger||now>=Math.hypot(before.x-boo.x,before.z-boo.z)-1e-6)continue;
    state.booCount+=1;
    // `scare` is which of the real ones this is, counting from 1; 0 is the gag.
    state.fired[boo.id]={at:state.elapsed,emitted:0,scare:C.boos.jumpscares.indexOf(state.booCount)+1};
    events.push({type:'threshold-gag-release',id:boo.id,position:sixBooPoint(boo,[0,0,0]),chartId:0});
  }
  const clock=thresholdGagTiming(reduced);
  for(const boo of SIX_BOOS){
    const fired=state.fired[boo.id];if(!fired)continue;
    const age=state.elapsed-fired.at;
    for(const[kind,bit,at,point]of[['stop',1,clock.contact,G.contact],['rattle',2,clock.rattle,G.contact],['speaker-click',4,clock.click,G.speaker],['boo',8,clock.boo,G.speaker]]){
      if(fired.emitted&bit||age<at)continue;
      fired.emitted|=bit;
      const position=sixBooPoint(boo,point,sixBooAngle(state,boo,{reducedMotion:reduced}));
      events.push({type:'threshold-gag-'+kind,id:boo.id,position,chartId:0});
      if(kind==='boo'&&fired.scare&&!state.scare){
        const board=sixBooPoint(boo,G.revealLocal,0);
        startScare(state,'boo',{id:boo.id,from:{x:board.x,z:board.z},pose:BOO_POSES[(fired.scare-1)%BOO_POSES.length],reducedDread});
        events.push({type:'six-scare',kind:'boo',id:boo.id,position,reducedDread});
      }
    }
  }
}
function revealClocks(state,reducedMotion){
  const lit=sixBlinkLit(state.elapsed,{reducedMotion});
  for(const clock of SIX_CLOCKS){
    if(state.exit?.clock===clock.id){state.clocks[clock.id]=true;continue;}
    const at=sixClockCentre(clock),distance=Math.hypot(state.x-at.x,state.z-at.z);
    if(state.clocks[clock.id]){if(distance>C.ruin.hide)delete state.clocks[clock.id];}
    else if(lit&&distance<C.ruin.reveal)state.clocks[clock.id]=true;
  }
}
// The way out: on the step, the clock reads, and you say so.
export function beginSixExit(current){
  if(!current||current.exit||current.scare||current.left)return null;
  const clock=sixVantageClock(current);if(!clock)return null;
  return{...current,exit:{clock:clock.id,at:current.elapsed,from:{x:current.x,z:current.z,yaw:current.yaw,pitch:current.pitch},talked:false,coverAt:null}};
}
export function sixExitCover(state){
  const at=state?.exit?.coverAt;if(at==null)return 0;
  return Math.max(0,Math.min(1,(finite(state.elapsed)-at)/C.exit.cover));
}
function stepExit(state,events,speaking){
  const exit=state.exit={...state.exit},t=state.elapsed-exit.at,clock=SIX_CLOCKS.find(c=>c.id===exit.clock),step=sixClockStep(clock),look=sixVantageLook(clock),u=smooth(t/C.exit.align);
  state.x=exit.from.x+(step.x-exit.from.x)*u;state.z=exit.from.z+(step.z-exit.from.z)*u;
  state.yaw=exit.from.yaw+(turn(exit.from.yaw,look.yaw)-exit.from.yaw)*u;state.pitch=exit.from.pitch+(look.pitch-exit.from.pitch)*u;
  if(t<C.exit.align)return;
  if(!exit.talked){exit.talked=true;events.push({type:'six-exit-talk',clock:clock.id});return;}
  if(exit.coverAt==null){
    const talk=t-C.exit.align;
    if((talk>=C.exit.minTalk&&!speaking)||talk>=C.exit.maxTalk){exit.coverAt=state.elapsed;events.push({type:'six-exit-cover',clock:clock.id});}
    return;
  }
  if(sixExitCover(state)>=1&&!state.left){state.left=true;events.push({type:'six-leave',clock:clock.id});}
}
export function stepSixNothingness(current,{dt=0,forward=0,strafe=0,reducedMotion=false,reducedDread=false,speaking=false,paused=false}={}){
  const state={...current,fired:{...current.fired},clocks:{...current.clocks}},events=[];
  for(const id of Object.keys(state.fired))state.fired[id]={...state.fired[id]};
  if(paused||state.left)return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt))),before={x:state.x,z:state.z};
  state.elapsed+=step;
  if(state.exit){stepExit(state,events,speaking);revealClocks(state,reducedMotion);return{state,events};}
  // A fault does not let go of you: the figure, then the step behind the door.
  if(state.scare?.kind==='fault'){
    if(state.elapsed-state.scare.at>=C.scare.seconds){
      Object.assign(state,{x:C.step.x,z:C.step.z,yaw:0,pitch:0,fired:{},clocks:{},scare:null,resets:state.resets+1});
      events.push({type:'six-reset',resets:state.resets});
    }
    return{state,events};
  }
  if(state.scare&&state.elapsed-state.scare.at>C.scare.seconds)state.scare=null;
  const length=Math.hypot(forward,strafe);
  if(length>0){
    const s=C.walk*step/Math.max(1,length),sin=Math.sin(state.yaw),cos=Math.cos(state.yaw),
      x=state.x+(sin*forward+cos*strafe)*s,z=state.z+(-cos*forward+sin*strafe)*s;
    // Standing in the cut of the door, the board is either side of you too.
    const{flat,bodyRadius}=C,inCut=Math.abs(state.z)<flat.thickness/2+bodyRadius,inBoard=Math.abs(x)>flat.door.halfWidth-bodyRadius&&Math.abs(x)<=flat.halfWidth+bodyRadius;
    if(!inCut||!inBoard)state.x=x;
    if(!sixFlatBlocks(state.z,z,state.x))state.z=z;
  }
  const touched=sixFaultTouched(before,state);
  if(touched){
    state.x=before.x;state.z=before.z;
    startScare(state,'fault',{id:touched.clock||'outer',pose:'symmetric',reducedDread});
    events.push({type:'six-scare',kind:'fault',id:state.scare.id,position:{x:state.x,y:C.eye,z:state.z},reducedDread});
    return{state,events};
  }
  fireBoos(state,before,{reduced:reducedMotion,reducedDread},events);
  revealClocks(state,reducedMotion);
  return{state,events};
}

export function createSixNothingnessScene({renderer,audio=null,intro=null,introSeconds=0,presentation=()=>({}),isInteract=e=>keyOf(e)==='e'||e?.controllerAction==='interact',
  speaking=()=>false,onScare=()=>{},onExitTalk=()=>{},onLeave=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The nothingness needs its renderer.');
  let state=freshSixNothingness(),ready=false,closed=false,paused=false,failed=false,introAt=0,initializing=null;
  const keys=new Set();
  const p=()=>presentation()||{},stopped=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},
    live=()=>ready&&!closed&&!failed&&renderer.ready?.()!==false,inIntro=()=>!!intro&&introAt<introSeconds,
    directed=()=>!!state.exit||state.scare?.kind==='fault';
  const listener=()=>({runId:'six',x:state.x,feet:0,z:state.z,yaw:state.yaw,pitch:state.pitch,chartId:0});
  function fail(reason){failed=true;keys.clear();onError(reason);}
  function dispatch(events){
    for(const event of events){
      if(event.type==='six-scare'){onScare(event);continue;}
      if(event.type==='six-reset'){keys.clear();continue;}
      if(event.type==='six-exit-talk'){onExitTalk(event);continue;}
      if(event.type==='six-exit-cover')continue;
      if(event.type==='six-leave'){keys.clear();onLeave(event);continue;}
      audio?.event?.(event,listener(),null);
    }
  }
  const scene={id:'six-nothingness',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    get allowsLook(){return live()&&!stopped()&&!inIntro()&&!directed()&&!state.left;},
    initialize(){
      if(initializing)return initializing;
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{if(closed)return false;if(ok===false)throw Error('The nothingness could not be prepared.');ready=true;return true;}).catch(reason=>{fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed)return;
      if(!live()||stopped()){keys.clear();return;}
      const step=Math.max(0,finite(dt));
      if(inIntro()){
        introAt+=step;
        const pose=intro(Math.min(introAt,introSeconds));
        state={...state,x:pose.x,z:pose.z,yaw:pose.yaw,pitch:pose.pitch,elapsed:state.elapsed+step};
        return;
      }
      const free=!directed(),forward=free?Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')):0,
        strafe=free?Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')):0,v=p();
      const result=stepSixNothingness(state,{dt:step,forward,strafe,reducedMotion:!!v.reducedMotion,reducedDread:!!v.reducedDread,speaking:!!speaking()});
      state=result.state;dispatch(result.events);audio?.update?.(listener(),null,null);
    },
    view:()=>({ready:live(),paused,closed,failed,inIntro:inIntro(),vantage:!!(live()&&!inIntro()&&!state.exit&&!state.scare&&sixVantageClock(state)),cover:sixExitCover(state),state:JSON.parse(JSON.stringify(state))}),
    serialize:()=>JSON.parse(JSON.stringify(state)),
    pause(){paused=true;keys.clear();},resume(){if(!paused)return;paused=false;keys.clear();},blur(){scene.pause();},suspend(){scene.pause();},focus(){scene.resume();},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:state.yaw+finite(yaw),pitch:Math.max(-PITCH,Math.min(PITCH,state.pitch+finite(pitch)))};return true;},
    setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:finite(look.yaw,state.yaw),pitch:Math.max(-PITCH,Math.min(PITCH,finite(look.pitch,state.pitch)))};return true;},
    place(next={}){state={...state,...next};},
    // The [E] that reads the clock. Anywhere else it does nothing at all.
    interact(){
      if(!live()||inIntro()||stopped())return false;
      const next=beginSixExit(state);if(!next)return false;
      state=next;keys.clear();return true;
    },
    key(e={}){
      const k=keyOf(e);
      if(k==='escape'||e.controllerAction==='back'){keys.clear();return false;}
      if(closed||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(!e.repeat&&isInteract(e)){scene.interact();return true;}
      if(walkKeys.has(k)&&!e.repeat&&live()&&!inIntro()&&!directed())keys.add(k);
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    input(name,value=true){
      if(name==='interact'){if(value)scene.interact();return true;}
      const key=actions[name]||name;if(!walkKeys.has(key))return false;if(!value)keys.delete(key);else if(live()&&!inIntro()&&!directed())keys.add(key);return true;
    },
    render(){
      if(closed||!ready)return;
      try{if(renderer.render(state,p())===false)throw Error('The nothingness view was interrupted.');}catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();audio?.stop?.();renderer.dispose?.();onExit();},
  };
  return scene;
}
