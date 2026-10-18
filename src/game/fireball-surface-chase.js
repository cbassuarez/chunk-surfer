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

// Continuous semi-implicit dynamics, substepped at 120 Hz. Pointer approach
// supplies a repulsive force with a tangential component; collisions reflect
// velocity. Arrival wins over every force and cancels momentum immediately.
export function createFireballSurfaceChase({width=240,height=240}={}){
  let state=null;
  const pointers=new Map();
  const bounds=pose=>({left:8,right:width-pose.size-8,top:8,bottom:height-pose.size-8});
  function snapshot(){
    if(!state)return{cast:null,pose:null,acquired:false,progress:0,key:null,offer:0};
    return{cast:{...state.cast,catchReady:state.acquired,motion:{...state.cast.motion,formationProgress:state.progress}},
      pose:{...state.pose},acquired:state.acquired,progress:state.progress,key:state.key,offer:state.offer,
      velocity:{x:state.vx,y:state.vy},bounces:state.bounces};
  }
  function latch(pose){state.pose={...pose};state.acquired=true;state.vx=0;state.vy=0;}
  function resize(next){
    width=Math.max(116,Number(next?.width)||width);height=Math.max(116,Number(next?.height)||height);
    if(state){const b=bounds(state.pose);const x=clamp(state.pose.x,b.left,b.right),y=clamp(state.pose.y,b.top,b.bottom);
      state.pose={...state.pose,x,y,centerX:x+state.pose.size/2,centerY:y+state.pose.size/2,width,height};}
    return snapshot();
  }
  function pointer(sample,{paintedPose=null,now=null}={}){
    if(!state||!Number.isFinite(sample?.x)||!Number.isFinite(sample?.y))return snapshot();
    now=Number.isFinite(now)?now:(state.lastNow??-16)+16;
    const point={x:sample.x,y:sample.y},before=state.previous;
    const dt=state.lastNow==null?0:clamp((now-state.lastNow)/1000,0,.05);
    state.lastNow=now;state.previous=point;
    if(state.simTime==null)state.simTime=now;
    if(sample.active===false){state.previous=null;state.vx=0;state.vy=0;state.intentUntil=0;state.accumulator=0;state.simTime=now;return snapshot();}
    if(state.cast.state!=='outbound'||state.acquired)return snapshot();
    const visible=paintedPose||state.pose;
    if(sweptContact(visible,before,point)){latch(visible);return snapshot();}
    if(state.cast.motion?.rebounding||state.cast.reducedMotion||!before||dt<=0)return snapshot();
    const distance=Math.hypot(point.x-visible.centerX,point.y-visible.centerY);
    const forward=(Math.hypot(before.x-visible.centerX,before.y-visible.centerY)-distance)/dt;
    if(forward>12){state.intentUntil=now+140;state.drive=Math.min(1,forward/500);}
    state.accumulator+=dt;
    const h=1/120,steps=Math.floor((state.accumulator+1e-10)/h);
    state.accumulator-=steps*h;
    let pose={...visible};const b=bounds(pose),turn=(seedOf(state.cast)+state.offer+state.cast.surfaceIndex)%2?1:-1;
    for(let i=0;i<steps;i++){
      state.simTime+=h*1000;const tickAt=state.simTime;
      const drive=tickAt<=state.intentUntil?state.drive:0;
      const length=Math.max(1,Math.hypot(pose.centerX-point.x,pose.centerY-point.y));
      const ux=(pose.centerX-point.x)/length,uy=(pose.centerY-point.y)/length;
      let ax=(ux*.8-uy*.6*turn)*4800*drive,ay=(uy*.8+ux*.6*turn)*4800*drive;
      if(tickAt<state.blockXUntil&&ax*state.blockXSign>0)ax=0;
      if(tickAt<state.blockYUntil&&ay*state.blockYSign>0)ay=0;
      state.vx+=(ax-state.vx*1.5)*h;state.vy+=(ay-state.vy*1.5)*h;
      const speed=Math.hypot(state.vx,state.vy),ceiling=620+Math.max(0,Math.min(1,Number(state.cast.motion?.pressure)||0))*180;
      if(speed>ceiling){state.vx*=ceiling/speed;state.vy*=ceiling/speed;}
      let x=pose.x+state.vx*h,y=pose.y+state.vy*h;
      if(x<b.left||x>b.right){const sign=x<b.left?-1:1;const wall=sign<0?b.left:b.right;x=2*wall-x;state.vx=-sign*Math.abs(state.vx)*.94;state.blockXUntil=tickAt+220;state.blockXSign=sign;state.bounces++;}
      if(y<b.top||y>b.bottom){const sign=y<b.top?-1:1;const wall=sign<0?b.top:b.bottom;y=2*wall-y;state.vy=-sign*Math.abs(state.vy)*.94;state.blockYUntil=tickAt+220;state.blockYSign=sign;state.bounces++;}
      x=clamp(x,b.left,b.right);y=clamp(y,b.top,b.bottom);
      state.travel+=Math.hypot(x-pose.x,y-pose.y);
      pose={...pose,x,y,centerX:x+pose.size/2,centerY:y+pose.size/2,offsetX:x+pose.size/2-width/2,offsetY:y+pose.size/2-height/2,width,height};
      if(fireballSurfaceContains(pose,point)){latch(pose);return snapshot();}
    }
    state.progress=Math.min(1,state.travel/400);state.pose=pose;return snapshot();
  }
  function setCast(cast){
    if(!cast){state=null;return snapshot();}
    const same=state&&identity(state.cast)===identity(cast);
    const announced=Math.max(1,Number(cast.offer)||1),offer=cast.motion?.rebounding?Math.max(1,announced-1):announced;
    if(same&&(state.offer===offer||cast.state!=='outbound')){state.cast=cast;if(cast.state!=='outbound'){state.vx=0;state.vy=0;}return snapshot();}
    const previous=same?state.pose:null;
    state={cast,offer,pose:null,acquired:false,key:`${identity(cast)}:${offer}`,progress:0,travel:0,previous:null,lastNow:null,
      vx:0,vy:0,bounces:0,accumulator:0,simTime:null,intentUntil:0,drive:0,blockXUntil:0,blockYUntil:0,blockXSign:0,blockYSign:0};
    state.pose=previous?{...previous}:fireballSurfacePose({...cast,offer,motion:{...cast.motion,rebounding:false,formationProgress:cast.reducedMotion?1:0}},{width,height});
    const cached=pointers.get(cast.surfaceIndex);
    if(cached&&cached.seed===seedOf(cast)){state.previous={x:cached.x,y:cached.y};state.lastNow=cached.now;
      if(cached.active!==false&&cast.state==='outbound'&&fireballSurfaceContains(state.pose,cached))latch(state.pose);}
    return snapshot();
  }
  function nativePointer(sample,options={}){
    if(!Number.isInteger(sample?.index)||!Number.isFinite(sample?.seed)||!Number.isFinite(sample?.x)||!Number.isFinite(sample?.y))return snapshot();
    pointers.set(sample.index,{...sample,now:options.now});
    if(!state||sample.index!==state.cast.surfaceIndex||sample.seed!==seedOf(state.cast))return snapshot();
    return pointer(sample,options);
  }
  return{setCast,pointer,nativePointer,snapshot,resize};
}
