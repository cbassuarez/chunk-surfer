// The existing congregation offers, then reaches for the carried case. No
// cast is spawned, moved downstairs, made solid or given recorder access.
import {CHAPEL_PRESENCE_PIVOTS as PIVOTS} from '../data/generated/chapel-dressing-geometry.js';

export const CHAPEL_COLLECTION=Object.freeze({maxFigures:6,noticeM:7,reachM:1.5,armM:.76});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const valid=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const active=state=>state&&['surfaced','inversion'].includes(state.route)&&['departing','caught','released'].includes(state.status);
const length=v=>Math.hypot(...v);
const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const l=length(v)||1;return v.map(n=>n/l);};
function segment(a,b,thickness=1){
  const d=sub(b,a),l=length(d)||.001,y=unit(d),seed=Math.abs(y[1])>.92?[0,0,1]:[0,1,0],x=unit(cross(y,seed)),z=cross(x,y);
  return new Float32Array([...x.map(n=>n*thickness),0,...y.map(n=>n*l),0,...z.map(n=>n*thickness),0,a.x,a.y,a.z,1]);
}
function upright(at,yaw,scale=1){const c=Math.cos(yaw)*scale,s=Math.sin(yaw)*scale;return new Float32Array([c,0,s,0,0,scale,0,0,-s,0,c,0,at.x,at.y,at.z,1]);}
function transformed(p,x,y,z){const a=p.yaw||0,s=p.scale||1;return{x:p.x+(Math.cos(a)*x-Math.sin(a)*z)*s,y:p.y+y*s,z:p.z+(Math.sin(a)*x+Math.cos(a)*z)*s};}
function targetOf(listener){
  if(valid(listener.caseTarget))return listener.caseTarget;
  const eye=valid(listener.eye)?listener.eye:{x:listener.x,y:listener.y+1.62,z:listener.z};
  const yaw=Number(listener.yaw)||0;
  return{x:eye.x+Math.sin(yaw)*.72+Math.cos(yaw)*.22,y:eye.y-.43,z:eye.z-Math.cos(yaw)*.72+Math.sin(yaw)*.22};
}
function eligible(placements,listener,canSee){
  if(!valid(listener))return[];
  const target=targetOf(listener);
  return(placements||[]).filter(p=>p.kind==='presence'&&p.role==='congregant'&&['seated','bowed','kneeling'].includes(p.figure)&&valid(p))
    .map(p=>({p,distanceM:Math.hypot(p.x-listener.x,p.z-listener.z)}))
    .filter(({p,distanceM})=>distanceM<=CHAPEL_COLLECTION.noticeM&&Math.abs(p.y-listener.y)<.65&&(!canSee||canSee({x:p.x,y:p.y+1.1,z:p.z},target)))
    .sort((a,b)=>a.distanceM-b.distanceM||a.p.id.localeCompare(b.p.id)).slice(0,CHAPEL_COLLECTION.maxFigures);
}
function pose(p,target,distanceM,timeSec,reducedMotion,fixedAnchor=null){
  const pivots=PIVOTS[p.figure]||PIVOTS.kneeling,s=p.scale||1;
  const upper={x:p.x,y:p.y+pivots.upper[1]*s,z:p.z};
  // The upper torso turns within a plausible twist; the lower body stays put.
  const facing=Math.atan2(target.x-p.x,-(target.z-p.z)),delta=Math.atan2(Math.sin(facing-(p.yaw||0)),Math.cos(facing-(p.yaw||0))),yaw=(p.yaw||0)+clamp(delta,-.70,.70);
  const body={...p,yaw},reach=clamp((4.8-distanceM)/3.5,.15,1),breath=reducedMotion?0:Math.sin(timeSec*1.2+p.x)*.006;
  const hands=[];
  for(const side of [-1,1]){
    const shoulder=transformed(body,side*.235,pivots.upper[1]+.50,-.04),to=sub(target,shoulder),d=length(to)||1;
    const maxReach=CHAPEL_COLLECTION.armM*s,extension=Math.min(maxReach,Math.max(.29,d*.90))*reach+.16*(1-reach);
    const end=fixedAnchor?{x:fixedAnchor.x-to[0]/d*.17*s,y:fixedAnchor.y-to[1]/d*.17*s,z:fixedAnchor.z-to[2]/d*.17*s}
      :{x:shoulder.x+to[0]/d*extension,y:shoulder.y+to[1]/d*extension+breath,z:shoulder.z+to[2]/d*extension};
    const elbow={x:(shoulder.x+end.x)/2+Math.cos(yaw)*side*.08,y:(shoulder.y+end.y)/2-.12,z:(shoulder.z+end.z)/2+Math.sin(yaw)*side*.08};
    const toward=unit(sub(target,end)),palmEnd=fixedAnchor?{...fixedAnchor}:{x:end.x+toward[0]*.17*s,y:end.y+toward[1]*.17*s,z:end.z+toward[2]*.17*s};
    const hand=segment(end,palmEnd,s);for(const i of [4,5,6])hand[i]*=1/.17;
    hands.push({side,shoulder,elbow,wrist:end,anchor:palmEnd,hand});
  }
  return{upper,yaw,hands,pivots};
}

export function chapelCollectionReceiver(placements,listener,{canSee=null,timeSec=0,reducedMotion=false}={}){
  const target=valid(listener)?targetOf(listener):null;if(!target)return null;
  for(const{p,distanceM}of eligible(placements,listener,canSee)){
    if(distanceM>CHAPEL_COLLECTION.reachM)continue;
    const hand=pose(p,target,distanceM,timeSec,reducedMotion).hands.sort((a,b)=>length(sub(a.anchor,target))-length(sub(b.anchor,target)))[0];
    // A palm that cannot physically reach the case may warn but cannot own it.
    if(length(sub(hand.anchor,target))>.42||canSee&&!canSee(hand.anchor,target))continue;
    return{id:p.id,anchor:{...hand.anchor},group:'upper',wallYaw:Math.atan2(target.x-p.x,-(target.z-p.z)),distanceM};
  }
  return null;
}

export function chapelCollectionFrame({placements=[],state=null,listener=null,timeSec=0,canSee=null,reducedMotion=false}={}){
  const empty={instances:[],replaceIds:[],receiver:null,warnings:[]};
  if(!active(state)||!valid(listener))return empty;
  let selected=eligible(placements,listener,canSee);
  const target=targetOf(listener),instances=[],replaceIds=[],warnings=[];
  const owner=state.status==='caught'&&state.catch?.kind==='congregation'?state.catch.receiverId:null;
  // A held case keeps its actual receiver at that station even when the
  // player retreats, turns away or changes floor. Depth still occludes it;
  // distance-based selection must not replace the saved hand with a new body.
  if(owner&&!selected.some(({p})=>p.id===owner)){
    const p=placements.find(p=>p.id===owner&&p.kind==='presence'&&p.role==='congregant'&&valid(p));
    if(p)selected=[{p,distanceM:Math.hypot(p.x-listener.x,p.z-listener.z)},...selected].slice(0,CHAPEL_COLLECTION.maxFigures);
  }
  for(const{p,distanceM}of selected){
    const fixedAnchor=owner===p.id&&valid(state.catch.anchor)?state.catch.anchor:null;
    const pp=pose(p,fixedAnchor||target,distanceM,timeSec,reducedMotion,fixedAnchor);
    const s=p.scale||1,base={zone:p.zone,structural:false,noShadow:true,blocks:false,interactive:false,kind:'presence',apparitionVariant:10,emissive:[.65,.78,.82,.18]};
    const emit=(suffix,mesh,matrix)=>instances.push({...base,id:`${p.id}:collection:${suffix}`,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14]});
    replaceIds.push(`${p.id}:upper`,`${p.id}:head`,`${p.id}:jaw`);
    emit('torso','tape_demand_receiver_torso',upright(pp.upper,pp.yaw,s));
    const neck=transformed({...p,yaw:pp.yaw},...pp.pivots.head);
    emit('head','chapel_presence_head',upright(neck,Math.atan2(target.x-neck.x,-(target.z-neck.z)),s));
    for(const hand of pp.hands){
      emit(`arm-${hand.side}`,'tape_demand_receiver_sleeve',segment(hand.shoulder,hand.elbow,s));
      emit(`forearm-${hand.side}`,'tape_demand_receiver_sleeve',segment(hand.elbow,hand.wrist,s*.76));
      emit(`hand-${hand.side}`,'tape_demand_receiver_hand',hand.hand);
    }
    warnings.push({id:p.id,distanceM,target:'case',gesture:owner===p.id?'holding':'receiving'});
  }
  return{instances,replaceIds,receiver:chapelCollectionReceiver(placements,listener,{canSee,timeSec,reducedMotion}),warnings};
}
