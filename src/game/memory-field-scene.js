// THE FIELD, as something you can stand in. docs/plans/last-minutes.md, section 1a.
//
// The rule that makes it fair: waiting always gets you out. Every stuck visit ends
// once you've stopped trying for `quietSeconds`, and whatever you do it ends by
// `maxSeconds`. The door gives when you leave it alone. Input is read the whole time:
// the handle rattles, you can walk, and Escape still reaches the pause menu.
import {MEMORY_FIELD as C} from '../data/memory-field.js';
import {neuralFrame,NEURAL_NONE} from './neural-transition.js';
import {antPoseAt} from './memory-field-ant.js';

const finite=(v,f=0)=>typeof v==='number'&&Number.isFinite(v)?v:f;
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d'};
const walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// Reduced dread keeps every visit and shortens the part that isn't kind.
export function memoryFieldTimes(visit,{reducedDread=false}={}){
  const k=reducedDread?.45:1;
  return{min:visit.minSeconds*k,max:visit.maxSeconds*(visit.kind==='stuck'?k:1),quiet:visit.quietSeconds*(reducedDread?.5:1),decayTo:visit.decayTo*(reducedDread?.35:1)};
}
export function freshMemoryField(visit){
  const toDoor=visit.door&&Math.hypot(visit.door.x,visit.door.z)<40?Math.atan2(visit.door.x,-visit.door.z):visit.sunAz;
  const base={visit:visit.id,x:0,z:0,yaw:toDoor,pitch:visit.kind==='breath'?visit.sunAlt*.8:visit.door?.12:.05,
    elapsed:0,decay:0,tries:0,lastTry:null,quiet:0,released:null,leaving:null,left:false,said:{}};
  // Down on his heels over the slab, already looking at the ant.
  if(visit.ant){const{x,z}=visit.ant.crouch,look=antGaze(visit.ant,{x,z,eyeH:visit.ant.eye},0);
    return{...base,x,z,yaw:look.yaw,pitch:look.pitch,eyeH:visit.ant.eye,antDoneAt:null,ant:{t:0,tried:false,quiet:0,done:false,why:null,said:{}}};}
  return base;
}
// Where his eyes go: to the ant, wherever it has got to.
export function antGaze(ant,state,t){
  const pose=antPoseAt(ant,t),dx=pose.x-state.x,dz=pose.z-state.z;
  return{yaw:Math.atan2(dx,-dz),pitch:-Math.atan2(Math.max(.02,state.eyeH-pose.y),Math.max(.05,Math.hypot(dx,dz)))};
}
// Is he still down over the ant, or getting up from it?
export function memoryFieldAntActive(state,visit){return!!(visit.ant&&state.ant&&!state.ant.done);}
function memoryFieldRising(state,visit){return!!(visit.ant&&state.antDoneAt!=null&&state.elapsed-state.antDoneAt<visit.ant.standSeconds);}
export function memoryFieldNearDoor(state,visit){
  if(!visit.door||state.released!=null)return false;
  const dx=visit.door.x-state.x,dz=visit.door.z-state.z,d=Math.hypot(dx,dz);
  if(d>C.door.reach)return false;
  const f=[Math.sin(state.yaw),-Math.cos(state.yaw)];
  return d<.9||(dx*f[0]+dz*f[1])/d>.5;
}
// What he reaches for says less and less, and it still does nothing.
export function memoryFieldPromptWord(decay){
  if(decay<.3)return'OPEN';if(decay<.5)return'OPE';if(decay<.7)return'O E';if(decay<.88)return'  E';return'';
}
export function memoryFieldLids(state,visit,{reducedMotion=false}={}){
  const opening=1-smooth(.35,.35+C.lids.open,state.elapsed);
  const ending=0;
  if(reducedMotion)return Math.max(opening,ending);
  // He blinks, and later it takes longer to come back.
  const d=state.decay,period=6.2-2*d,length=.1+.5*d*d,u=(state.elapsed%period)/length,blink=state.decay>C.lids.blinkFrom||visit.kind==='wander'?(u<1?Math.sin(u*Math.PI):0):0;
  return Math.max(opening,ending,blink*.96);
}
// Colour in here is better than it has been all night. It is the only place it is.
// It opens out of the white the last place left him in, and it goes the way it came. The
// front comes from the sun. Where else.
export function memoryFieldNeural(state,{reducedFlash=false,reducedMotion=false}={}){
  const options={reducedFlash,reducedMotion};
  if(state.leaving)return neuralFrame('leave',state.elapsed-state.leaving.at,options);
  const arriving=neuralFrame('arrive',state.elapsed,options);
  if(!arriving.done)return arriving;
  // It looks worse the longer he stays: the leaks come in by themselves, the focus goes.
  const d=state.decay||0;
  if(d<.3)return NEURAL_NONE;
  return{...NEURAL_NONE,leak:.68*smooth(.3,1,d)*(reducedFlash?.7:1),lens:.42*smooth(.55,1,d),time:state.elapsed,shimmer:reducedFlash?0:1,done:false};
}
export function memoryFieldLook(state,visit,{reducedDread=false,reducedMotion=false,reducedFlash=false}={}){
  const d=state.decay,times=memoryFieldTimes(visit,{reducedDread});
  const closing=visit.tunnel?smooth(0,Math.max(1,times.max*.8),state.elapsed)*visit.tunnel*(reducedDread?.5:1):0;
  return{chroma:1.18-.95*d*d,contrast:1.04-.2*d,narrowing:closing,lift:0,lids:memoryFieldLids(state,visit,{reducedMotion}),
    skyFault:reducedDread?0:Math.pow(d,1.4),edge:.14+.86*smooth(.2,.8,d),sunScale:visit.sunScale*(1+(visit.tunnel?1.1*closing:0)),reducedMotion,reducedDread,neural:memoryFieldNeural(state,{reducedFlash,reducedMotion}),seed:state.seed||0};
}
function blockedByLeaf(state,before,visit){
  if(!visit.door)return false;
  const{x,z}=visit.door,across=Math.abs(state.x-x)<C.door.halfWidth+.32;
  if(state.released!=null&&state.elapsed-state.released>C.swingSeconds*.5)return false;
  return across&&Math.sign(before.z-z)!==Math.sign(state.z-z);
}
export function stepMemoryField(current,visit,{dt=0,forward=0,strafe=0,reducedMotion=false,reducedDread=false,tell=null}={}){
  const state={...current,said:{...current.said},...(current.ant?{ant:{...current.ant,said:{...current.ant.said}}}:{})},events=[],times=memoryFieldTimes(visit,{reducedDread});
  if(state.left)return{state,events};
  const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt)));
  state.elapsed+=step;state.quiet+=step;
  if(state.released==null)state.decay=times.decayTo*smooth(0,times.max,state.elapsed);
  // THE ANT. Getting up does nothing while he watches it. It lets him go once he
  // stops trying, or when the ant is gone into the grass, whichever comes first.
  const ant=visit.ant;
  if(memoryFieldAntActive(state,visit)){
    const a=state.ant;a.t+=step;a.quiet+=step;
    if(Math.hypot(forward,strafe)>0){a.tried=true;a.quiet=0;}
    for(const[index,row]of ant.lines.entries())if(!a.said[index]&&a.t>=row.at){a.said[index]=true;events.push({type:'line',text:row.text});}
    const pose=antPoseAt(ant,a.t),stopped=a.tried&&a.quiet>=ant.quietSeconds&&a.t>=ant.minSeconds;
    if(pose.gone||stopped||a.t>=ant.maxSeconds){a.done=true;a.why=pose.gone?'gone':stopped?'stood':'over';state.antDoneAt=state.elapsed;
      events.push({type:'stand',why:a.why,text:pose.gone?ant.gone:ant.stood});}
    // He can't help watching it: his eyes follow it, a little behind.
    state.eyeH=ant.eye;const gaze=antGaze(ant,state,a.t),k=Math.min(1,step*ant.follow);
    state.yaw+=Math.atan2(Math.sin(gaze.yaw-state.yaw),Math.cos(gaze.yaw-state.yaw))*k;state.pitch+=(gaze.pitch-state.pitch)*k;
    if(a.done)state.antPitch=state.pitch;
  }else if(ant&&state.antDoneAt!=null){
    const k=smooth(0,ant.standSeconds,state.elapsed-state.antDoneAt);
    state.eyeH=ant.eye+(C.eye-ant.eye)*k;
    if(k<1)state.pitch=(state.antPitch??ant.pitch)+(.05-(state.antPitch??ant.pitch))*k;
  }
  // The rest of the visit begins once he is up.
  const after=ant?(state.antDoneAt??Infinity):0;
  for(const[index,row]of visit.lines.entries()){
    if(state.said[index]||state.elapsed<row.at+after)continue;
    state.said[index]=true;
    const text=row.tell!=null?tell?.[row.tell]:row.text;
    if(text)events.push({type:'line',text});
  }
  const moving=visit.walk&&!state.leaving&&!memoryFieldAntActive(state,visit)&&!memoryFieldRising(state,visit),length=Math.hypot(forward,strafe);
  if(moving&&length>0){
    const before={x:state.x,z:state.z},s=C.walk*step/Math.max(1,length),sin=Math.sin(state.yaw),cos=Math.cos(state.yaw);
    state.x+=(cos*strafe+sin*forward)*s;state.z+=(sin*strafe-cos*forward)*s;
    if(blockedByLeaf(state,before,visit)){state.x=before.x;state.z=before.z;}
    else if(visit.door&&state.released!=null&&Math.abs(state.x-visit.door.x)<C.door.through&&Math.sign(before.z-visit.door.z)!==Math.sign(state.z-visit.door.z)&&!state.leaving){
      state.leaving={at:state.elapsed,why:'through'};events.push({type:'through'});
    }
  }
  if(visit.kind==='stuck'){
    if(state.released==null&&((state.elapsed>=times.min&&state.quiet>=times.quiet)||state.elapsed>=times.max)){
      state.released=state.elapsed;events.push({type:'give',text:visit.release||null});
    }
    if(state.released!=null&&!state.leaving&&state.elapsed-state.released>=C.leaveSeconds){state.leaving={at:state.elapsed,why:'waited'};}
  }else if(!state.leaving&&state.elapsed-after>=times.max){state.leaving={at:state.elapsed,why:'over'};}
  if(state.leaving&&state.elapsed-state.leaving.at>=C.coverOut){state.left=true;events.push({type:'left',why:state.leaving.why});}
  return{state,events};
}
// [E], or any other verb he has. It reads, it answers, and it does nothing.
export function tryMemoryField(current,visit){
  const state={...current,said:{...current.said},...(current.ant?{ant:{...current.ant}}:{})},events=[];
  if(state.left||state.leaving)return{state,events};
  // Reaching for anything while he watches the ant is trying to get up. It does nothing.
  if(memoryFieldAntActive(state,visit)){state.ant.tried=true;state.ant.quiet=0;events.push({type:'dead'});return{state,events};}
  if(memoryFieldNearDoor(state,visit)){
    state.tries+=1;state.lastTry=state.elapsed;state.quiet=0;
    const line=visit.tries[Math.min(state.tries-1,visit.tries.length-1)];
    events.push({type:'try',tries:state.tries,text:state.tries<=visit.tries.length?line:null});
  }else events.push({type:'dead'});
  return{state,events};
}

export function createMemoryFieldScene({visit,renderer,audio=null,tell=null,presentation=()=>({}),isInteract=e=>keyOf(e)==='e'||e?.controllerAction==='interact',
  paintOverlay=()=>{},onLine=()=>{},onDone=()=>{},onError=()=>{},onExit=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The field needs its renderer.');
  let state={...freshMemoryField(visit),seed:Math.random()},ready=false,closed=false,done=false,paused=false,failed=false,initializing=null,caption=null,captionUntil=0;
  const keys=new Set(),DEAD=new Set(['r','t','f','q','tab','b','m','g','x','c','enter',' ']);
  const p=()=>presentation()||{},stopped=()=>{const v=p();return!!(paused||v.paused||v.hidden||v.focused===false);},live=()=>ready&&!closed&&!failed;
  const say=text=>{if(!text)return;caption=text;captionUntil=state.elapsed+Math.max(2.6,text.length*.09);onLine(text);};
  function finish(error=null){if(done||closed)return;done=true;keys.clear();audio?.stop?.();onDone({visit:visit.id,tries:state.tries,why:state.leaving?.why||null,error});}
  function fail(reason){failed=true;keys.clear();onError(reason);finish(String(reason?.message||reason));}
  function dispatch(events){
    for(const event of events){
      if(event.text)say(event.text);
      if(event.type==='left'){finish();return;}
      audio?.event?.(event);
    }
  }
  const scene={id:'memory-field',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
    // He stares at the ant. The look is his again once he is up.
    get allowsLook(){return live()&&!stopped()&&visit.walk&&!state.leaving&&!memoryFieldAntActive(state,visit)&&!memoryFieldRising(state,visit);},
    initialize(){
      if(initializing)return initializing;
      initializing=Promise.resolve().then(()=>renderer.initialize?.(visit)).then(ok=>{if(closed)return false;if(ok===false)throw Error('The field could not be prepared.');ready=true;audio?.start?.(visit);return true;}).catch(reason=>{fail(reason);return false;});
      return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||done)return;
      if(!live()){return;}
      audio?.setPaused?.(stopped());
      if(stopped()){keys.clear();return;}
      const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        strafe=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),v=p();
      const result=stepMemoryField(state,visit,{dt,forward,strafe,reducedMotion:!!v.reducedMotion,reducedDread:!!v.reducedDread,tell});
      state=result.state;dispatch(result.events);
      if(caption&&state.elapsed>captionUntil)caption=null;
      audio?.update?.(state,visit);
    },
    view:()=>({ready:live(),paused,closed,done,failed,caption,near:memoryFieldNearDoor(state,visit),state:JSON.parse(JSON.stringify(state))}),
    pause(){paused=true;keys.clear();audio?.setPaused?.(true);},resume(){paused=false;},blur(){scene.pause();},suspend(){scene.pause();},focus(){scene.resume();},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:state.yaw+finite(yaw),pitch:Math.max(-C.pitch,Math.min(C.pitch,state.pitch+finite(pitch)))};return true;},
    setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:finite(look.yaw,state.yaw),pitch:Math.max(-C.pitch,Math.min(C.pitch,finite(look.pitch,state.pitch)))};return true;},
    place(next={}){state={...state,...next};},
    interact(){
      if(!live()||stopped())return false;
      const result=tryMemoryField(state,visit);state=result.state;dispatch(result.events);return true;
    },
    key(e={}){
      const k=keyOf(e);
      if(k==='escape'||e.controllerAction==='back'){keys.clear();return false;}
      if(closed||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(!e.repeat&&isInteract(e)){scene.interact();return true;}
      if(walkKeys.has(k)&&!e.repeat&&live()&&visit.walk)keys.add(k);
      // Every other thing he has. It doesn't come to hand here.
      else if(!e.repeat&&live()&&DEAD.has(k)&&!stopped()){const result=tryMemoryField({...state,x:1e6},visit);dispatch(result.events.filter(row=>row.type==='dead'));}
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    input(name,value=true){
      if(name==='interact'){if(value)scene.interact();return true;}
      const key=actions[name]||name;if(!walkKeys.has(key))return false;if(!value)keys.delete(key);else if(live()&&visit.walk)keys.add(key);return true;
    },
    render(){
      if(closed||done||!ready)return;
      try{
        const v=p();
        if(renderer.render(state,memoryFieldLook(state,visit,{reducedDread:!!v.reducedDread,reducedMotion:!!v.reducedMotion,reducedFlash:!!v.reducedFlash}))===false)throw Error('The field was interrupted.');
        const near=memoryFieldNearDoor(state,visit);
        paintOverlay({caption,near,word:near?memoryFieldPromptWord(state.decay):'',state});
      }catch(reason){fail(reason);}
    },
    exit(){if(closed)return;closed=true;keys.clear();audio?.stop?.();renderer.dispose?.();onExit();},
    review:{renderer},
  };
  return scene;
}
