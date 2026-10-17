import { fireballSurfaceContains,fireballSurfacePose } from './fireball-surface-pose.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const identity=cast=>`${cast?.castId}:${cast?.surfaceIndex}`;
const seedOf=cast=>Number(cast?.motion?.seed??parseInt(String(cast?.castId||'').slice(5),16))>>>0;

function sweptContact(pose,from,to){
  if(fireballSurfaceContains(pose,to))return true;
  if(!from)return false;
  let near=0,far=1;
  for(const [axis,min,max] of [['x',pose.x-8,pose.x+pose.size+8],['y',pose.y-8,pose.y+pose.size+8]]){
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-9){if(from[axis]<min||from[axis]>max)return false;continue;}
    const a=(min-from[axis])/delta,b=(max-from[axis])/delta;
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(near>far)return false;
  }
  return near<=far&&far>=0&&near<=1;
}

// The target spends at most 35% of an approaching pointer's forward distance,
// along one finite authored path. Reaching its painted body ends pursuit.
export function createFireballSurfaceChase({width=240,height=240}={}){
  let state=null;
  const pointers=new Map();

  function pathPose(progress){
    const pose=fireballSurfacePose({...state.cast,offer:state.offer,reducedMotion:false,motion:{
      ...state.cast.motion,rebounding:false,formationProgress:progress,
      dodge:(Number(state.cast.motion?.pressure)||0)*Math.sin(progress*Math.PI),
    }},{width,height});
    const ease=progress**2*(3-2*progress);
    const limitX=Math.min(40,(width-pose.size)/2-8),limitY=(height-pose.size)/2-8;
    const offsetX=clamp(pose.offsetX+state.startOffset.x*(1-ease),-limitX,limitX);
    const offsetY=clamp(pose.offsetY+state.startOffset.y*(1-ease),-limitY,limitY);
    const x=(width-pose.size)/2+offsetX,y=(height-pose.size)/2+offsetY;
    return {...pose,x,y,offsetX,offsetY,centerX:x+pose.size/2,centerY:y+pose.size/2};
  }

  function snapshot(){
    if(!state)return {cast:null,pose:null,acquired:false,progress:0,key:null,offer:0};
    const cast={...state.cast,catchReady:state.acquired,motion:{...state.cast.motion,
      formationProgress:state.progress,dodge:(Number(state.cast.motion?.pressure)||0)*Math.sin(state.progress*Math.PI),
    }};
    return {cast,pose:{...state.pose},acquired:state.acquired,progress:state.progress,key:state.key,offer:state.offer};
  }

  function latch(pose){state.pose={...pose};state.acquired=true;}

  function pointer(sample,{paintedPose=null}={}){
    if(!state||!Number.isFinite(sample?.x)||!Number.isFinite(sample?.y))return snapshot();
    const point={x:sample.x,y:sample.y};
    if(sample.active===false){state.previous=null;return snapshot();}
    const before=state.previous;state.previous=point;
    if(state.cast.state!=='outbound'||state.acquired)return snapshot();
    const visible=paintedPose||state.pose;
    if(sweptContact(visible,before,point)){latch(visible);return snapshot();}
    if(state.cast.motion?.rebounding||state.cast.reducedMotion||!before||state.progress>=1)return snapshot();
    const priorDistance=Math.hypot(before.x-visible.centerX,before.y-visible.centerY);
    const distance=Math.hypot(point.x-visible.centerX,point.y-visible.centerY);
    const forward=priorDistance-distance;
    if(distance>420||forward<=0)return snapshot();
    let budget=Math.min(8,forward*.35),progress=state.progress,pose=state.pose;
    // Small arc-length steps keep curved movement within the pointer budget.
    while(budget>1e-7&&progress<1){
      const nextProgress=Math.min(1,progress+.002),next=pathPose(nextProgress);
      const distance=Math.hypot(next.centerX-pose.centerX,next.centerY-pose.centerY);
      if(distance>budget){
        let low=progress,high=nextProgress;
        for(let step=0;step<18;step++){
          const middle=(low+high)/2,candidate=pathPose(middle);
          if(Math.hypot(candidate.centerX-pose.centerX,candidate.centerY-pose.centerY)<=budget)low=middle;else high=middle;
        }
        progress=low;pose=pathPose(progress);break;
      }
      progress=nextProgress;pose=next;budget-=distance;
    }
    state.progress=progress;state.pose=pose;
    if(fireballSurfaceContains(pose,point))latch(pose);
    return snapshot();
  }

  function setCast(cast){
    if(!cast){state=null;return snapshot();}
    const same=state&&identity(state.cast)===identity(cast);
    const announcedOffer=Math.max(1,Number(cast.offer)||1);
    const offer=cast.motion?.rebounding?Math.max(1,announcedOffer-1):announcedOffer;
    if(same&&(state.offer===offer||cast.state!=='outbound')){
      state.cast=cast;
      return snapshot();
    }
    const previous=same?state.pose:null;
    const progress=cast.reducedMotion?1:0;
    state={cast,offer,progress,acquired:false,key:`${identity(cast)}:${offer}`,pose:null,startOffset:{x:0,y:0},previous:null};
    const start=pathPose(0);
    if(previous)state.startOffset={x:previous.centerX-start.centerX,y:previous.centerY-start.centerY};
    state.pose=pathPose(progress);
    const cached=pointers.get(cast.surfaceIndex);
    if(cached&&cached.seed===seedOf(cast)){
      state.previous={x:cached.x,y:cached.y};
      if(cached.active!==false&&cast.state==='outbound'&&fireballSurfaceContains(state.pose,cached))latch(state.pose);
    }
    return snapshot();
  }

  function nativePointer(sample,options={}){
    if(!Number.isInteger(sample?.index)||!Number.isFinite(sample?.seed)||!Number.isFinite(sample?.x)||!Number.isFinite(sample?.y))return snapshot();
    pointers.set(sample.index,{...sample});
    if(!state||sample.index!==state.cast.surfaceIndex||sample.seed!==seedOf(state.cast))return snapshot();
    return pointer(sample,options);
  }

  return {setCast,pointer,nativePointer,snapshot};
}
