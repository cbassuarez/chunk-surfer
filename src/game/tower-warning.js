import {TOWER_WARNING as SPEC} from '../data/tower-warning.js';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const phases=new Set(['waiting','turning','speaking','leaving','departed']);
const length=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const routeLength=()=>SPEC.route.slice(1).reduce((n,p,i)=>n+length(SPEC.route[i],p),0);
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
function alongRoute(distance){
  let remaining=clamp(distance,0,routeLength());
  for(let i=1;i<SPEC.route.length;i++){
    const a=SPEC.route[i-1],b=SPEC.route[i],metres=length(a,b);
    if(remaining<=metres||i===SPEC.route.length-1){const t=metres?Math.min(1,remaining/metres):1;return{position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:Math.atan2(b.x-a.x,-(b.z-a.z))};}
    remaining-=metres;
  }
  return{position:{...SPEC.position},yaw:SPEC.yaw};
}

// This is an embodied conversation, not a scene or a dialogue tree. No input
// ownership, camera target, protagonist line, caption or choice is produced.
export function freshTowerWarning(value=null){
  const phase=phases.has(value?.phase)?value.phase:'waiting';
  return{schema:1,phase,elapsed:Math.max(0,finite(value?.elapsed)),phaseSeconds:Math.max(0,finite(value?.phaseSeconds)),
    lineIndex:Math.round(clamp(value?.lineIndex,0,SPEC.lines.length-1)),lineGap:Math.max(0,finite(value?.lineGap)),
    distance:clamp(value?.distance,0,routeLength()),walkSeconds:Math.max(0,finite(value?.walkSeconds)),
    yaw:finite(value?.yaw,SPEC.yaw),seenDepartureSeconds:Math.max(0,finite(value?.seenDepartureSeconds)),
    completed:phase==='departed',blocked:!!value?.blocked,walking:!!value?.walking};
}

export function towerWarningFrame(state){
  const s=freshTowerWarning(state),at=s.phase==='leaving'||s.phase==='departed'?alongRoute(s.distance):{position:{...SPEC.position}};
  const line=s.phase==='speaking'&&s.lineGap<=0?{...SPEC.lines[s.lineIndex],id:`${SPEC.id}:line:${s.lineIndex}`} :null;
  return{...s,position:at.position,yaw:s.yaw,visible:s.phase!=='departed',speaking:!!line,line,
    walking:s.phase==='leaving'&&s.walking&&!s.blocked,routeFinished:s.distance>=routeLength()-.0001};
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
      else{s.phase='leaving';s.phaseSeconds=0;}
    }
  }else if(s.phase==='leaving'){
    if(visible)s.seenDepartureSeconds+=dt;
    if(s.phaseSeconds>=1.05&&s.distance<routeLength()){
      const next=alongRoute(Math.min(routeLength(),s.distance+SPEC.walkSpeed*dt)),turn=angle(next.yaw-s.yaw);
      s.yaw+=clamp(turn,-dt*1.5,dt*1.5);
      if(Math.abs(turn)<.38){
        const from=alongRoute(s.distance).position;
        if(canOccupy(next.position,from)){s.distance=Math.min(routeLength(),s.distance+SPEC.walkSpeed*dt);s.walkSeconds+=dt;s.walking=dt>0;}
        else s.blocked=true;
      }
    }
    // Reaching the end of a timer is never disappearance authority. The body
    // remains if the player follows it and keeps an unobstructed sight line.
    if(s.distance>=routeLength()-.0001&&exitOccluded){s.phase='departed';s.phaseSeconds=0;s.completed=true;}
  }
  return s;
}
