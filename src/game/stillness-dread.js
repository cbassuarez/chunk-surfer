// Presentation only: no fear meter, sound/noise, save or movement authority.
// Position is the supported body's physical position, not a bobbed camera.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):a));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
const finite3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const copy3=value=>value.map(n=>clamp(n,-1e6,1e6));
const profileOf=value=>Math.round(clamp(value,0,2));
const contextOf=value=>['string','number'].includes(typeof value)?String(value):'world';
const directionOf=value=>{
  if(!finite3(value))return[0,0,-1];
  const bounded=copy3(value),length=Math.hypot(...bounded);
  return length>1e-8?bounded.map(n=>n/length):[0,0,-1];
};
const PROFILES=Object.freeze([
  Object.freeze({onset:3.5,peak:18}),
  Object.freeze({onset:1.8,peak:11}),
  Object.freeze({onset:1.2,peak:9}),
]);
const MOVE_METRES=.06,VERTICAL_METRES=.18,TELEPORT_METRES=3.25;

/** One local presentation clock. `context` is a stable primitive key for the
 * current space/camera owner. A caller may hold the last frame during a real
 * pause with `freeze`; inactive/loading/changed spaces instead release it.
 * Looking never enters the movement test. Surface anchor/direction are sampled
 * once per bout, so changing the view cannot drag a face along the wall. */
export function createStillnessDread(){
  let running=false,context=null,profile=0,requestedProfile=0,time=0,stillSeconds=0,amount=0;
  let origin=null,lastPosition=null,anchor=[0,0,0],direction=[0,0,-1],releasing=false,bout=0;
  let reducedMotion=false,reduceFlash=false,reason='inactive',lastFrame;
  function snapshot(){
    return Object.freeze({active:running,amount,profile,requestedProfile,time,stillSeconds,
      anchor:Object.freeze([...anchor]),direction:Object.freeze([...direction]),
      releasing,bout,context,reducedMotion,reduceFlash,motionTime:reducedMotion?0:time,
      reason,presentationOnly:true});
  }
  function publish(){return lastFrame=snapshot();}
  function reset(){
    running=false;context=null;profile=0;requestedProfile=0;time=0;stillSeconds=0;amount=0;
    origin=null;lastPosition=null;anchor=[0,0,0];direction=[0,0,-1];releasing=false;bout=0;
    reducedMotion=false;reduceFlash=false;reason='inactive';return publish();
  }
  function latch(input,position){
    anchor=finite3(input.anchor)?copy3(input.anchor):[...position];
    direction=directionOf(input.direction);origin=[...position];stillSeconds=0;
    bout=Math.min(1e9,bout+1);
  }
  function begin(input,position,nextContext,nextProfile,why){
    running=true;context=nextContext;profile=nextProfile;requestedProfile=nextProfile;
    time=0;amount=0;releasing=false;lastPosition=[...position];reason=why;
    reducedMotion=!!input.reducedMotion;reduceFlash=!!input.reduceFlash;latch(input,position);
    return publish();
  }
  function update(input={}){
    // Absence cannot accrue time or change an already-visible composition.
    if(input.freeze===true)return lastFrame;
    if(input.active!==true){reset();return lastFrame;}
    if(!finite3(input.position)){reset();reason='invalid-position';return publish();}
    const position=copy3(input.position),nextContext=contextOf(input.context),nextProfile=profileOf(input.profile);
    if(!running)return begin(input,position,nextContext,nextProfile,'entered');
    if(nextContext!==context)return begin(input,position,nextContext,nextProfile,'context-change');
    if(Math.hypot(...position.map((n,i)=>n-lastPosition[i]))>TELEPORT_METRES)
      return begin(input,position,nextContext,nextProfile,'teleport');
    const dt=clamp(input.dt,0,.1);
    time=Math.min(1e6,time+dt);lastPosition=[...position];
    reducedMotion=!!input.reducedMotion;reduceFlash=!!input.reduceFlash;
    const moved=Math.hypot(position[0]-origin[0],position[2]-origin[2])>=MOVE_METRES-1e-9
      ||Math.abs(position[1]-origin[1])>=VERTICAL_METRES-1e-9;
    const changedProfile=nextProfile!==requestedProfile;requestedProfile=nextProfile;
    if(moved||changedProfile){
      stillSeconds=0;origin=[...position];
      if(amount>0){releasing=true;reason=moved?'movement-release':'profile-release';}
      else{profile=requestedProfile;latch(input,position);reason=moved?'movement':'profile-change';}
    }
    if(releasing){
      // A released face stays on its original surface while it fades. Only at
      // zero may the next seat/profile acquire a different surface anchor.
      amount=Math.max(0,amount-dt);stillSeconds=0;
      if(amount<=1e-8){amount=0;releasing=false;profile=requestedProfile;latch(input,position);reason='released';}
      return publish();
    }
    if(!moved&&!changedProfile){
      stillSeconds=Math.min(600,stillSeconds+dt);
      const curve=PROFILES[profile];amount=smooth(curve.onset,curve.peak,stillSeconds);
      reason=amount>0?'manifesting':'waiting';
    }
    return publish();
  }
  reset();
  return Object.freeze({update,reset,frame:()=>lastFrame});
}
