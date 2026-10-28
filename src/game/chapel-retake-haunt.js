// The retake is watched. This director schedules warnings; the existing take
// hunter remains the sole owner of pursuit, noise counterplay and contact.
import {CELL,ZONE,F} from '../data/floorplan/legend.js';
import {CHAPEL_DRESSING_MESH as M} from '../data/chapel-dressing.js';
import {CHAPEL_PRESENCE_PIVOTS as PIVOTS} from '../data/generated/chapel-dressing-geometry.js';

export const CHAPEL_RETAKE_HAUNT=Object.freeze({
  pulses:Object.freeze([.18,.48,.78]),maxFigures:3,maxInstances:9,nearM:1.8,farM:6.5,maxCells:625,
});
const roomZones=new Map([['main_b3',ZONE.studio],['the_tub',ZONE.natatorium],['amplifications',ZONE.hall],['soundnoisemusic',ZONE.practice]]);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value,a,b)=>Math.max(a,Math.min(b,Number(value)||0));
const identity=value=>typeof value==='string'&&value.trim()&&value.length<=512?value:null;
const empty=()=>({active:false,damageId:null,takeId:null,roomId:null,stage:'absent',pressure:0,pulseIndex:0,atSec:0,minimumSeconds:0,effectsMode:'full',events:[]});

export function createChapelRetakeHaunt(){
  let key=null,lastSec=null,blocked=true,fired=new Set(),current=empty();
  function update(input={}){
    const damageId=identity(input.damageId),takeId=identity(input.takeId),roomId=roomZones.has(input.roomId)?input.roomId:null;
    const eligible=!!damageId&&!!takeId&&!!roomId&&roomId===input.requiredRoomId&&input.recording===true
      &&finite(input.atSec)&&input.atSec>=0&&finite(input.minimumSeconds)&&input.minimumSeconds>0;
    if(!eligible){current=empty();blocked=true;return current;}
    const nextKey=JSON.stringify([damageId,takeId,roomId]),seconds=clamp(input.atSec,0,36000),minimum=clamp(input.minimumSeconds,1,3600);
    const nowBlocked=input.paused===true||input.focused===false||input.slating===true||input.stalled===true;
    const thresholds=CHAPEL_RETAKE_HAUNT.pulses.map(part=>part*minimum);
    const events=[];
    if(key!==nextKey){
      key=nextKey;lastSec=seconds;fired=new Set();blocked=true;
      // A director attached late must not summon every missed pulse at once.
      for(let i=0;i<thresholds.length;i++)if(thresholds[i]<=seconds)fired.add(i);
    }else{
      const crossed=[];
      for(let i=0;i<thresholds.length;i++)if(!fired.has(i)&&thresholds[i]<=seconds){fired.add(i);crossed.push(i);}
      // Consume missed windows while blocked, and on the first frame back.
      // If several thresholds are crossed by one stall, only the latest can
      // become an event; later frames never deliver the skipped backlog.
      if(!nowBlocked&&!blocked&&seconds>=lastSec&&crossed.length){
        const index=crossed.at(-1);
        events.push({type:'chapel-retake-pulse',id:`${damageId}:${takeId}:haunt:${index+1}`,cause:'chapel-retake',
          damageId,takeId,roomId,pulseIndex:index+1,atSec:seconds});
      }
      lastSec=Math.max(lastSec,seconds);
    }
    const pulseIndex=fired.size?Math.max(...fired)+1:0;
    const stage=nowBlocked?(input.slating?'slating':input.stalled?'stalled':'paused'):pulseIndex>=3?'surrounding':pulseIndex>=2?'closing':'watching';
    const pressure=nowBlocked&&current.active?current.pressure:Math.min(1,.18+.82*seconds/minimum);
    current={active:true,damageId,takeId,roomId,stage,pressure,pulseIndex,atSec:seconds,minimumSeconds:minimum,
      effectsMode:['off','reduced'].includes(input.effectsMode)?input.effectsMode:'full',events};
    blocked=nowBlocked;return current;
  }
  return{update,snapshot:()=>({...current,events:[]}),reset:()=>{key=null;lastSec=null;blocked=true;fired=new Set();current=empty();return current;}};
}

const caches=new WeakMap();
const hash=text=>{let n=2166136261;for(const ch of text){n^=ch.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
function supported(plan,x,y,{zone,group,floor},canOccupy){
  for(const dx of[-1,0,1])for(const dy of[-1,0,1]){
    const cx=Math.floor(x+dx),cy=Math.floor(y+dy),at=plan.logicalToPhysical(cx,cy);
    if(plan.isSolid(cx,cy)||plan.zoneAt(cx,cy)!==zone||at?.renderGroup!==group
      ||Math.abs(plan.floorAt(cx,cy)-floor)>.05||plan.ceilAt(cx,cy)-floor<1.65
      ||((plan.flagsAt?.(cx,cy)||0)&(F.STAIR|F.DOOR)))return false;
  }
  return !canOccupy||canOccupy(x,y)!==false;
}
function placements(plan,logicalOrigin,snapshot,listener,canOccupy){
  const x=Math.floor(logicalOrigin.x),y=Math.floor(logicalOrigin.y),at=plan.logicalToPhysical(x,y),zone=roomZones.get(snapshot.roomId);
  if(plan.isSolid(x,y)||plan.zoneAt(x,y)!==zone||!at?.renderGroup)return[];
  const config={zone,group:at.renderGroup,floor:plan.floorAt(x,y)},origin={x:at.x*CELL,z:at.z*CELL};
  const cacheRoot=plan.physicalSpanData?.()||plan;
  let cache=caches.get(cacheRoot);if(!cache){cache=new Map();caches.set(cacheRoot,cache);}
  const key=JSON.stringify([snapshot.damageId,snapshot.takeId,snapshot.roomId,x,y,config.group]);
  if(cache.has(key))return cache.get(key).filter(p=>supported(plan,p.logical.x,p.logical.y,config,canOccupy));
  const queue=[{x,y}],seen=new Set([`${x},${y}`]),candidates=[];
  for(let cursor=0;cursor<queue.length&&cursor<CHAPEL_RETAKE_HAUNT.maxCells;cursor++){
    const p=queue[cursor],mapped=plan.logicalToPhysical(p.x,p.y),floor=plan.floorAt(p.x,p.y);
    if(plan.isSolid(p.x,p.y)||plan.zoneAt(p.x,p.y)!==zone||mapped?.renderGroup!==config.group||Math.abs(floor-config.floor)>.05)continue;
    const position={x:mapped.x*CELL,y:floor,z:mapped.z*CELL},distance=Math.hypot(position.x-origin.x,position.z-origin.z);
    if(distance>CHAPEL_RETAKE_HAUNT.farM+.5)continue;
    if(distance>=CHAPEL_RETAKE_HAUNT.nearM&&distance<=CHAPEL_RETAKE_HAUNT.farM&&supported(plan,p.x,p.y,config,canOccupy)){
      const bearing=Math.atan2(position.x-origin.x,-(position.z-origin.z));
      candidates.push({...position,zone,group:config.group,logical:{...p},bearing,distance,seed:hash(`${key}:${p.x},${p.y}`)});
    }
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:p.x+dx,y:p.y+dy},id=`${next.x},${next.y}`;
      if(!seen.has(id)){seen.add(id);queue.push(next);}
    }
  }
  const facing=finite(logicalOrigin.yaw)?logicalOrigin.yaw:Number(listener.yaw)||0;
  const selected=[];
  for(const offset of[0,1.35,-1.35]){
    const ranked=candidates.filter(p=>selected.every(other=>Math.hypot(p.x-other.x,p.z-other.z)>=1.45))
      .sort((a,b)=>(Math.abs(angle(a.bearing-facing-offset))*1.8+Math.abs(a.distance-3))-(Math.abs(angle(b.bearing-facing-offset))*1.8+Math.abs(b.distance-3))||a.seed-b.seed);
    if(ranked[0])selected.push(ranked[0]);
  }
  const result=selected.map((p,index)=>({...p,index,yaw:Math.atan2(origin.x-p.x,-(origin.z-p.z)),scale:.96+(p.seed%5)*.015}));
  cache.set(key,result);if(cache.size>16)cache.delete(cache.keys().next().value);
  return result;
}
function matrixAt(p,local=[0,0,0],bob=0){
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw),k=p.scale;
  return new Float32Array([c*k,0,s*k,0,0,k,0,0,-s*k,0,c*k,0,
    p.x+(c*local[0]-s*local[2])*k,p.y+local[1]*k+bob,p.z+(s*local[0]+c*local[2])*k,1]);
}

export function chapelRetakeHauntInstances(snapshot,{plan,group,logicalOrigin,listener,timeSec=0,reducedMotion=false,canOccupy=null}={}){
  if(!snapshot?.active||!roomZones.has(snapshot.roomId)||!plan?.isLoaded?.()||!finite(logicalOrigin?.x)||!finite(logicalOrigin?.y)
    ||!finite(listener?.x)||!finite(listener?.z))return[];
  const positions=placements(plan,logicalOrigin,snapshot,listener,canOccupy).filter(p=>p.group===group&&Math.hypot(p.x-listener.x,p.z-listener.z)>1);
  const count=snapshot.pulseIndex>=1?3:2,instances=[],pivots=PIVOTS.kneeling;
  for(const p of positions.slice(0,count)){
    const reduced=reducedMotion||snapshot.effectsMode!=='full',breath=reduced?0:Math.sin(timeSec*.8+p.seed)*.006;
    const base={zone:p.zone,structural:false,noShadow:true,blocks:false,interactive:false,kind:'presence',role:'chapel-retake-witness',
      apparitionVariant:snapshot.effectsMode==='off'?0:10,emissive:[.65,.78,.82,.18+.14*clamp(snapshot.pressure,0,1)],logical:{...p.logical}};
    for(const[part,mesh,pivot,bob]of[['lower',M.kneelingLower,[0,0,0],0],['upper',M.kneelingUpper,pivots.upper,breath],['head',M.head,pivots.head,breath]]){
      const matrix=matrixAt(p,pivot,bob);
      instances.push({...base,id:`chapel-retake-haunt:${snapshot.damageId}:${snapshot.takeId}:${p.index}:${part}`,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14]});
    }
  }
  return instances;
}
