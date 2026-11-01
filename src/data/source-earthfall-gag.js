import {THRESHOLD_GAG,THRESHOLD_GAG_SOLIDS,thresholdGagAngle,thresholdGagTiming} from './threshold-gag.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as ASIDE} from './source-earthfall-ellery-aside.js';

// Recognition has its own clock. The implosion retains its original 0..7.8 s
// construction clock, so no door, charge, floor or acoustic phase is stretched.
export const EARTHFALL_GAG=Object.freeze({
  id:'earthfall-ellery-second-ghost',version:1,
  mount:Object.freeze({x:62.2,y:1.15,z:9.65,yaw:-.75}),
  releaseAt:6,maximumRecognitionSeconds:12,noticeSeconds:.25,
  shadowAt:12,shadowArcSeconds:.9,shadowArriveAt:15.3,completeAt:16,
  target:Object.freeze({x:65.15,z:11.65}),
});
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const ease=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
export function freshEarthfallGag({legacy=false}={}){
  return{version:1,elapsed:legacy?EARTHFALL_GAG.completeAt:0,waited:0,noticed:0,emitted:legacy?31:0,complete:legacy,legacy,reduced:false,reducedDread:false};
}
export function normalizeEarthfallGag(v){
  if(!v||v.version!==1)return freshEarthfallGag({legacy:true});
  const elapsed=clamp(v.elapsed,0,EARTHFALL_GAG.completeAt),complete=!!v.complete||elapsed>=EARTHFALL_GAG.completeAt-1e-8;
  return{version:1,elapsed:complete?EARTHFALL_GAG.completeAt:elapsed,waited:clamp(v.waited,0,EARTHFALL_GAG.maximumRecognitionSeconds),
    noticed:clamp(v.noticed,0,1),emitted:clamp(Math.floor(finite(v.emitted)),0,31),complete,legacy:!!v.legacy,reduced:!!v.reduced,reducedDread:!!v.reducedDread};
}
export function earthfallGagPoint(p,angle=0){
  const m=EARTHFALL_GAG.mount,a=m.yaw+angle,c=Math.cos(a),s=Math.sin(a);
  return{x:m.x+c*p[0]-s*p[2],y:m.y+p[1],z:m.z+s*p[0]+c*p[2]};
}
export function earthfallGagNoticed(state){
  const p=earthfallGagPoint(THRESHOLD_GAG.revealLocal),dx=p.x-state.x,dz=p.z-state.z,d=Math.hypot(dx,dz),pitch=Math.atan2(p.y-(state.feet+1.62),d);
  return d<8&&Math.cos(Math.atan2(dx,-dz)-state.yaw)>Math.cos(.72)&&Math.abs(pitch-state.pitch)<.6;
}
export function earthfallGagSequenceTime(state){
  const g=state.gag;return g?.legacy?finite(state.elapsed):finite(g?.waited)+Math.max(0,finite(g?.elapsed)-EARTHFALL_GAG.releaseAt)+finite(state.elapsed);
}
export function sourceEarthfallGagFrame(state={}){
  const g=normalizeEarthfallGag(state.gag),t=g.elapsed,m=EARTHFALL_GAG.mount,local=Math.max(0,t-EARTHFALL_GAG.releaseAt),fired=t>=EARTHFALL_GAG.releaseAt,
    angle=thresholdGagAngle(local,{fired,reduced:g.reduced}),clock=thresholdGagTiming(g.reduced);
  let shadow=null;
  if(!g.legacy&&!g.reducedDread&&t>=EARTHFALL_GAG.shadowAt&&finite(state.elapsed)<ASIDE.wallsAt.north+.1){
    const arc=-1.1*ease((t-EARTHFALL_GAG.shadowAt)/EARTHFALL_GAG.shadowArcSeconds),p=earthfallGagPoint([-.68,-1.15,.075],arc),
      endpoint=earthfallGagPoint([-.68,-1.15,.075],-1.1),u=ease((t-EARTHFALL_GAG.shadowAt-EARTHFALL_GAG.shadowArcSeconds)/(EARTHFALL_GAG.shadowArriveAt-EARTHFALL_GAG.shadowAt-EARTHFALL_GAG.shadowArcSeconds)),travel=g.reduced?.4:1,
      x=p.x+(EARTHFALL_GAG.target.x-endpoint.x)*u*travel,z=p.z+(EARTHFALL_GAG.target.z-endpoint.z)*u*travel,
      fadeStart=ASIDE.coreAt-.05,charge=.90*ease((t-EARTHFALL_GAG.shadowAt)/.35)*(1-ease((finite(state.elapsed)-fadeStart)/(ASIDE.wallsAt.north+.1-fadeStart)));
    shadow={x,z,feet:.025,pitch:-Math.PI/2,scaleX:2.4,scaleY:1.2,scaleZ:.1,yaw:Math.atan2(EARTHFALL_GAG.target.x-endpoint.x,-(EARTHFALL_GAG.target.z-endpoint.z)),variant:15,charge,poseId:'head_turn'};
  }
  return{enabled:!g.legacy,elapsed:t,phase:!fired?'recognition':t<EARTHFALL_GAG.shadowAt?'familiar':g.complete?'demolition':'violation',
    angle,mount:{...m},speaker:earthfallGagPoint(THRESHOLD_GAG.speaker,angle),contact:earthfallGagPoint(THRESHOLD_GAG.contact),
    shadow,reduced:g.reduced,reducedDread:g.reducedDread,noticed:g.noticed>=EARTHFALL_GAG.noticeSeconds,complete:g.complete,
    finishAt:EARTHFALL_GAG.releaseAt+clock.finish};
}
export function earthfallGagPenetration(x,z,state){
  const g=sourceEarthfallGagFrame(state);if(!g.enabled||finite(state.elapsed)>=ASIDE.foldStart)return 0;
  const m=g.mount,r=.22,feet=finite(state.feet);
  return Math.max(0,...THRESHOLD_GAG_SOLIDS.map(box=>{
    if(feet+1.8<=m.y+box.min[1]||feet>=m.y+box.max[1])return 0;
    const a=m.yaw+(box.moving?g.angle:0),c=Math.cos(a),s=Math.sin(a),dx=x-m.x,dz=z-m.z,lx=c*dx+s*dz,lz=-s*dx+c*dz;
    return Math.max(0,Math.min(lx+r-box.min[0],box.max[0]+r-lx,lz+r-box.min[2],box.max[2]+r-lz));
  }));
}
export function advanceEarthfallGag(state,dt,events,{reducedMotion=false,reducedDread=false}={}){
  const g=state.gag;g.reducedDread=!!reducedDread;if(g.complete)return false;
  const before=g.elapsed;if(before<EARTHFALL_GAG.releaseAt)g.waited=Math.min(EARTHFALL_GAG.maximumRecognitionSeconds,g.waited+dt);
  if(earthfallGagNoticed(state))g.noticed=Math.min(1,g.noticed+dt);
  if(before<EARTHFALL_GAG.releaseAt){
    g.elapsed=Math.min(EARTHFALL_GAG.releaseAt,g.elapsed+dt);
    if(g.elapsed>=EARTHFALL_GAG.releaseAt&&g.noticed<EARTHFALL_GAG.noticeSeconds&&g.waited<EARTHFALL_GAG.maximumRecognitionSeconds)g.elapsed=EARTHFALL_GAG.releaseAt-1e-6;
  }else g.elapsed=Math.min(EARTHFALL_GAG.completeAt,g.elapsed+dt);
  if(before<EARTHFALL_GAG.releaseAt&&g.elapsed>=EARTHFALL_GAG.releaseAt)g.reduced=!!reducedMotion;
  const clock=thresholdGagTiming(g.reduced),edges=[['release',0],['stop',clock.contact],['rattle',clock.rattle],['speaker-click',clock.click],['boo',clock.boo]];
  for(let i=0;i<edges.length;i++){
    const[kind,offset]=edges[i],at=EARTHFALL_GAG.releaseAt+offset,bit=1<<i;if(g.emitted&bit||g.elapsed<at-1e-8)continue;
    g.emitted|=bit;const f=sourceEarthfallGagFrame(state),position=kind==='release'?f.mount:kind==='boo'||kind==='speaker-click'?f.speaker:f.contact;
    const event={id:EARTHFALL_GAG.id+':'+state.runId,type:'threshold-gag-'+kind,at,position:{x:position.x,y:position.y,z:position.z},chartId:0,age:0};events.push(event);
  }
  if(g.elapsed>=EARTHFALL_GAG.completeAt-1e-8){g.elapsed=EARTHFALL_GAG.completeAt;g.complete=true;}
  return true;
}
