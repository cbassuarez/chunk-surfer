// A WHITE CARRIER BAG, and the cascade's plainest case. Rule 1: nothing says it's only
// a bag, and nothing says it isn't. It is the same mesh as the bag in the field, and it
// is never reachable and has no text of its own, only what he says about it.
//
//   early   outdoors, on the wind, or settled. Being a bag.
//   later   indoors. It can only be where he isn't looking.
//   late    at head height, where the air isn't moving. If he comes close, it goes.
//
// Render-only, and the same memory object carries it between frames. `free(x,z)` is the
// caller's question: can something stand in this physical cell?

export const THE_BAG=Object.freeze({
  indoorsFrom:.46,headHeightFrom:.64,
  near:6.5,far:34,spawnFrom:11,spawnTo:24,
  speed:1.7,fleeSpeed:3.4,relocateEvery:9,
});
const C=THE_BAG;
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
function hash(seed,salt){let h=0x811c9dc5;for(const ch of `${seed}:${salt}`){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}return(h>>>0)/4294967296;}

function inView(eye,at,yaw,cone=.7){
  const dx=at.x-eye.x,dz=at.z-eye.z,d=Math.hypot(dx,dz)||1,fx=Math.sin(yaw),fz=-Math.cos(yaw);
  return(dx*fx+dz*fz)/d>Math.cos(cone);
}
function findSpot(memory,{eye,yaw,free,seed}){
  for(let k=0;k<6;k++){
    memory.tries+=1;
    const ahead=hash(seed,`a${memory.tries}`)<.7,bearing=yaw+(ahead?(hash(seed,`b${memory.tries}`)-.5)*1.1:Math.PI+(hash(seed,`c${memory.tries}`)-.5)*2),
      reach=C.spawnFrom+(C.spawnTo-C.spawnFrom)*hash(seed,`r${memory.tries}`),x=eye.x+Math.sin(bearing)*reach,z=eye.z-Math.cos(bearing)*reach;
    let clear=true;
    for(let s=.2;s<=1;s+=.2)if(!free(eye.x+(x-eye.x)*s,eye.z+(z-eye.z)*s)){clear=false;break;}
    if(clear)return{x,z};
  }
  return null;
}
export function freshTheBag(){return{at:null,tries:0,lastMove:-Infinity,settled:false,flee:0,seen:false};}

export function stepTheBag(previous,{dt=0,time=0,meaning=0,outdoors=false,eye=null,yaw=0,wind=null,free=()=>true,seed=0,reducedMotion=false}={}){
  const memory={...(previous||freshTheBag())},m=clamp01(meaning);
  if(!eye)return memory;
  const allowed=outdoors||m>=C.indoorsFrom;
  if(!allowed){memory.at=null;return memory;}
  const d=memory.at?Math.hypot(memory.at.x-eye.x,memory.at.z-eye.z):Infinity,unseen=memory.at?!inView(eye,memory.at,yaw):true;
  // It only ever arrives where he isn't looking.
  if((!memory.at||d>C.far)&&(unseen||!memory.at)&&time-memory.lastMove>C.relocateEvery){
    const spot=findSpot(memory,{eye,yaw:yaw+Math.PI,free,seed});
    if(spot){memory.at=spot;memory.lastMove=time;memory.seen=false;}
  }
  if(!memory.at)return memory;
  const step=Math.max(0,Math.min(.1,Number(dt)||0));
  if(!reducedMotion&&step>0){
    if(d<C.near){
      // Come close, and it goes. Never fast. It just isn't where you get to.
      const dx=(memory.at.x-eye.x)/(d||1),dz=(memory.at.z-eye.z)/(d||1),x=memory.at.x+dx*C.fleeSpeed*step,z=memory.at.z+dz*C.fleeSpeed*step;
      if(free(x,z))memory.at={x,z};
    }else if(outdoors&&wind&&m<C.headHeightFrom){
      const x=memory.at.x+(wind.x||0)*.35*step,z=memory.at.z+(wind.z||0)*.35*step;
      if(free(x,z))memory.at={x,z};
    }
  }
  return memory;
}
export function theBagProp(memory,{time=0,meaning=0,floorY=0,reducedMotion=false,zone=0}={}){
  if(!memory?.at)return null;
  const m=clamp01(meaning),t=reducedMotion?0:time,high=m>=C.headHeightFrom;
  const y=floorY+(high?1.58+.05*Math.sin(t*.6):.06+.55*Math.max(0,Math.sin(t*.7+memory.at.x))),scale=1+Math.max(0,m-C.headHeightFrom)*1.8;
  const rate=high?1.1:3.2,frame=((Math.floor(t*rate)%4)+4)%4;
  return{id:'the-bag',mesh:`the_bag_${frame}`,x:memory.at.x,y,z:memory.at.z,yaw:t*(high?.1:.5),scaleX:scale,scaleY:scale,scaleZ:scale,zone,structural:false,decorative:true,noShadow:true,cullRadius:scale};
}
export function theBagGazed(memory,{eye,yaw,pitch=0,reach=30}={}){
  if(!memory?.at||!eye)return false;
  const d=Math.hypot(memory.at.x-eye.x,memory.at.z-eye.z);
  return d<reach&&inView(eye,memory.at,yaw,.16)&&Math.abs(pitch)<.5;
}
