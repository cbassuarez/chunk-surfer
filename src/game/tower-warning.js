import {TOWER_WARNING as SPEC} from '../data/tower-warning.js';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const smooth=v=>{const x=clamp(v,0,1);return x*x*(3-2*x);};
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const phases=new Set(['waiting','turning','speaking','leaving','departed']);
const length=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const point=v=>v&&Number.isFinite(Number(v.x))&&Number.isFinite(Number(v.z))?{x:Number(v.x),z:Number(v.z)}:null;
const PIVOT=SPEC.departure.pivot;
// The walk starts wherever the pivot turn actually left him, then joins the
// authored curve. Older saves without a measured start use the stand point.
const routeOf=s=>s?.start?[{...SPEC.route[0],x:s.start.x,z:s.start.z},...SPEC.route.slice(1)]:SPEC.route;
const lengthOf=route=>route.slice(1).reduce((n,p,i)=>n+length(route[i],p),0);
const headingOf=(a,b)=>Math.atan2(b.x-a.x,-(b.z-a.z));
// Figure-local to world, matching the renderer's root transform.
const place=(root,yaw,local)=>({x:root.x+local.x*Math.cos(yaw)-local.z*Math.sin(yaw),z:root.z+local.x*Math.sin(yaw)+local.z*Math.cos(yaw)});
function rayBox(from,to,box){
  let enter=0,leave=1;
  for(const axis of ['X','Y','Z']){
    const k=axis.toLowerCase(),delta=to[k]-from[k],lo=box['min'+axis],hi=box['max'+axis];
    if(Math.abs(delta)<1e-9){if(from[k]<lo||from[k]>hi)return false;continue;}
    const a=(lo-from[k])/delta,b=(hi-from[k])/delta;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(leave<enter)return false;
  }
  return leave>.001&&enter<.999;
}
export function towerWarningOccluded(listener,position,{boxes=SPEC.occluders||[]}={}){
  if(!listener||!position)return true;
  // Feet, chest and head must all disappear behind real masonry. Turning the
  // camera, distance, darkness and a completed voice are not hiding evidence.
  return [.16,1.05,1.72].every(height=>boxes.some(box=>rayBox(listener,{x:position.x,y:position.y+height,z:position.z},box)));
}
function alongRoute(distance,route=SPEC.route){
  let remaining=clamp(distance,0,lengthOf(route));
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],metres=length(a,b);
    if(remaining<=metres||i===route.length-1){const t=metres?Math.min(1,remaining/metres):1;return{index:i,position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:headingOf(a,b)};}
    remaining-=metres;
  }
  return{index:0,position:{...SPEC.position},yaw:SPEC.yaw};
}

// THE TURN AWAY. He pivots on his planted left foot: the root swings about
// that ankle while the clip lifts the right leg into the first stride, so the
// weight-bearing foot stays put on the paving instead of skating round.
const pivotLocal=u=>({x:PIVOT.start.x+(PIVOT.end.x-PIVOT.start.x)*u,z:PIVOT.start.z+(PIVOT.end.z-PIVOT.start.z)*u});
function pivotRoot(anchor,yaw,u){const l=place({x:0,z:0},yaw,pivotLocal(u));return{x:anchor.x-l.x,z:anchor.z-l.z};}
function beginDeparture(s){
  s.departFrom=s.yaw;s.anchor=place(SPEC.position,s.yaw,pivotLocal(0));
  // Face the first leg from where the pivot will actually put him.
  let to=headingOf(SPEC.position,SPEC.route[1]);
  for(let i=0;i<3;i++)to=headingOf(pivotRoot(s.anchor,to,1),SPEC.route[1]);
  s.departTo=s.departFrom+angle(to-s.departFrom);
}

// This is an embodied conversation, not a scene or a dialogue tree. No input
// ownership, camera target or choice is produced; the host presents his
// current line as a subtitle and nothing else.
export function freshTowerWarning(value=null){
  const phase=phases.has(value?.phase)?value.phase:'waiting';
  const start=point(value?.start),anchor=point(value?.anchor);
  const departFrom=Number.isFinite(Number(value?.departFrom))&&value?.departFrom!==null?Number(value.departFrom):null;
  const departTo=Number.isFinite(Number(value?.departTo))&&value?.departTo!==null?Number(value.departTo):null;
  return{schema:2,phase,elapsed:Math.max(0,finite(value?.elapsed)),phaseSeconds:Math.max(0,finite(value?.phaseSeconds)),
    lineIndex:Math.round(clamp(value?.lineIndex,0,SPEC.lines.length-1)),lineGap:Math.max(0,finite(value?.lineGap)),
    distance:clamp(value?.distance,0,lengthOf(routeOf({start}))),walkSeconds:Math.max(0,finite(value?.walkSeconds)),
    yaw:finite(value?.yaw,SPEC.yaw),seenDepartureSeconds:Math.max(0,finite(value?.seenDepartureSeconds)),
    completed:phase==='departed',blocked:!!value?.blocked,walking:!!value?.walking,
    departFrom,departTo:departFrom===null?null:departTo,anchor:departFrom===null?null:anchor,start};
}

function positionOf(s){
  if(s.phase!=='leaving'&&s.phase!=='departed')return{...SPEC.position};
  if(s.start||!s.anchor)return alongRoute(s.distance,routeOf(s)).position;
  const root=pivotRoot(s.anchor,s.yaw,smooth(s.phaseSeconds/PIVOT.duration));
  return{x:root.x,y:SPEC.position.y,z:root.z};
}
export function towerWarningFrame(state){
  const s=freshTowerWarning(state);
  const line=s.phase==='speaking'&&s.lineGap<=0?{...SPEC.lines[s.lineIndex],id:`${SPEC.id}:line:${s.lineIndex}`} :null;
  return{...s,position:positionOf(s),yaw:s.yaw,visible:s.phase!=='departed',speaking:!!line,line,
    walking:s.phase==='leaving'&&s.walking&&!s.blocked,routeFinished:!!s.start&&s.distance>=lengthOf(routeOf(s))-.0001};
}

export function towerWarningFocus(state,{listener,yaw=0,visible=true}={}){
  const frame=towerWarningFrame(state);if(!listener||!frame.visible||!visible)return false;
  const dx=frame.position.x-listener.x,dz=frame.position.z-listener.z,d=Math.hypot(dx,dz);
  return d<=SPEC.interactRadius&&(d<.25||(dx*Math.sin(yaw)-dz*Math.cos(yaw))/d>.60);
}

export function beginTowerWarning(state,input={}){
  const s=freshTowerWarning(state);
  if(s.phase!=='waiting'||!towerWarningFocus(s,input))return{state:s,started:false};
  return{state:{...s,phase:'turning',phaseSeconds:0,lineIndex:0,lineGap:0},started:true};
}

export function stepTowerWarning(state,{dt=0,blocked=false,listener=null,audio=null,visible=false,exitOccluded=false,canOccupy=()=>true}={}){
  const s=freshTowerWarning(state);if(blocked||s.phase==='departed')return s;
  dt=clamp(dt,0,.1);s.elapsed+=dt;s.phaseSeconds+=dt;s.blocked=false;s.walking=false;
  const face=towerWarningFrame(s).position;
  if(listener&&s.phase!=='leaving'&&Math.hypot(listener.x-face.x,listener.z-face.z)<SPEC.attentionRadius){
    const target=Math.atan2(listener.x-face.x,-(listener.z-face.z));s.yaw+=clamp(angle(target-s.yaw),-dt*.85,dt*.85);
  }
  if(s.phase==='turning'&&s.phaseSeconds>=.85){s.phase='speaking';s.phaseSeconds=0;}
  else if(s.phase==='speaking'){
    s.lineGap=Math.max(0,s.lineGap-dt);
    const id=`${SPEC.id}:line:${s.lineIndex}`;
    // Only an actually completed utterance advances this beat. Slow decoding,
    // mute/pause and a loading promise cannot silently consume the warning.
    if(s.lineGap===0&&audio?.lineId===id&&audio.done===true){
      if(s.lineIndex<SPEC.lines.length-1){s.lineIndex++;s.lineGap=.70;}
      else{s.phase='leaving';s.phaseSeconds=0;beginDeparture(s);}
    }
  }else if(s.phase==='leaving'){
    if(visible)s.seenDepartureSeconds+=dt;
    if(!s.start&&!s.anchor){
      // A save from before the pivot existed: resume on the authored stand.
      if(s.distance>0||s.phaseSeconds>=PIVOT.duration)s.start={x:SPEC.route[0].x,z:SPEC.route[0].z};
      else beginDeparture(s);
    }
    if(!s.start){
      const u=smooth(s.phaseSeconds/PIVOT.duration);
      s.yaw=s.departFrom+(s.departTo-s.departFrom)*u;
      if(s.phaseSeconds>=PIVOT.duration){s.yaw=s.departTo;s.start=pivotRoot(s.anchor,s.yaw,1);}
    }else{
      const route=routeOf(s),total=lengthOf(route);
      if(s.distance<total){
        const ahead=Math.min(total,s.distance+SPEC.walkSpeed*dt),next=alongRoute(ahead,route),turn=angle(next.yaw-s.yaw);
        s.yaw+=clamp(turn,-dt*1.5,dt*1.5);
        if(Math.abs(turn)<.38){
          const from=alongRoute(s.distance,route).position;
          // The last legs are into the house front itself. Walking into the
          // plinth and the wall behind it is the point, not an obstruction.
          if(route[next.index].masonry||canOccupy(next.position,from)){s.distance=ahead;s.walkSeconds+=dt;s.walking=dt>0;}
          else s.blocked=true;
        }
      }
      // Reaching the end of a timer is never disappearance authority. The body
      // remains if the player follows it and keeps an unobstructed sight line.
      if(s.distance>=total-.0001&&exitOccluded){s.phase='departed';s.phaseSeconds=0;s.completed=true;}
    }
  }
  return s;
}
