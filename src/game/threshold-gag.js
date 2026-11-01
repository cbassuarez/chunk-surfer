import {THRESHOLD_GAG as G,thresholdGagPose,thresholdGagTiming,thresholdGagViewPoints} from '../data/threshold-gag.js';
import {thresholdGagClearSight} from './threshold-gag-sight.js';
import {freshThresholdInspection,normalizeThresholdInspection} from './threshold-gag-inspection.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const WARNING=/^(?:closure-warning|hush-(?:warning|notice|armed|recovered)|counterweight-(?:warning|lowering-warning))$/;
const INTERRUPT=/^(?:capture|drop|fold|portal|phase|return|complete|loop)$/;
export function freshThresholdGag(){return{phase:'rest',elapsed:0,emitted:0,armed:false,available:false,reduced:false,cancelled:false,quietUntil:0,inspection:freshThresholdInspection()};}
export function normalizeThresholdGag(value){
  const fresh=freshThresholdGag();if(!value||typeof value!=='object')return fresh;
  const phase=['rest','running','spent'].includes(value.phase)?value.phase:'rest',reduced=!!value.reduced,finish=thresholdGagTiming(reduced).finish;
  return{phase,elapsed:phase==='rest'?0:phase==='spent'?finish:clamp(value.elapsed,0,finish),emitted:Math.round(clamp(value.emitted,0,31)),
    armed:phase==='rest'&&!!value.armed,available:!!value.available||phase!=='rest',reduced,cancelled:!!value.cancelled,quietUntil:Math.max(0,Number(value.quietUntil)||0),inspection:normalizeThresholdInspection(value.inspection)};
}
function supportedHere(s){return s.kind===G.hostKind&&s.status==='active'&&Math.abs(s.feet-G.feet)<.12&&!s.fall&&!s.recovery&&!s.reveal&&!s.cameraTransit&&!s.bodyTransit;}
const inLane=p=>p.z>=G.laneMinZ&&p.z<=G.laneMaxZ;
export function thresholdGagVisible(s,{layout}={}){
  const eye={x:s.x,y:s.feet+G.eyeHeight,z:s.z},yaw=s.yaw||0,pitch=s.pitch||0;
  return thresholdGagViewPoints().every(point=>{
    const dx=point[0]-eye.x,dy=point[1]-eye.y,dz=point[2]-eye.z,d=Math.hypot(dx,dz);
    return d>=.15&&Math.cos(Math.atan2(dx,-dz)-yaw)>=Math.cos(G.viewHalfAngle)&&Math.abs(Math.atan2(dy,d)-pitch)<=.65
      &&thresholdGagClearSight(eye,{x:point[0],y:point[1],z:point[2]},s,layout);
  });
}
export function thresholdGagQuiet(s){
  const g=s.thresholdGag||freshThresholdGag();
  return supportedHere(s)&&g.available&&s.elapsed>=g.quietUntil&&(s.opened||[]).length<5&&!(s.sourceDoors||[]).length;
}
function cue(events,g,kind,bit,at,s){
  if(g.emitted&bit||g.cancelled)return;g.emitted|=bit;
  const pose=thresholdGagPose({...s,thresholdGag:{...g,elapsed:at}}),position=kind==='boo'||kind==='speaker-click'?pose.speaker:kind==='stop'||kind==='rattle'?pose.contact:pose.mount;
  events.push({type:'threshold-gag-'+kind,id:G.id,position,chartId:G.chartId,at});
}
export function advanceThresholdGag(s,before,dt,events,{layout,reduced=false,audioReady=true}={}){
  if(s.kind!==G.hostKind)return;
  const g=s.thresholdGag||(s.thresholdGag=freshThresholdGag()),realEvents=events.filter(e=>!String(e.type).startsWith('threshold-gag-')),
    loop=realEvents.some(e=>e.type==='loop'),warning=realEvents.some(e=>WARNING.test(e.type)),interrupted=realEvents.some(e=>INTERRUPT.test(e.type));
  // The convincing first arrival contains no apparatus. An existing false
  // exit must return the visitor before this later, already impossible pass.
  if(loop){g.available=true;g.armed=false;g.quietUntil=s.elapsed+G.loopQuietSeconds;}
  if(warning)g.quietUntil=s.elapsed+G.warningTailSeconds;
  if(g.phase==='rest'){
    const eligible=thresholdGagQuiet(s);
    if(!supportedHere(s)||!inLane(s)||loop){g.armed=false;return;}
    if(before.x>=G.armX&&s.x<before.x-1e-7&&inLane(before)&&eligible)g.armed=true;
    if(before.x>G.triggerX&&s.x<=G.triggerX){
      const armed=g.armed;g.armed=false;
      const m=G.mount,wx=s.x-m.x,wz=s.z-m.z,dx=Math.cos(m.yaw)*wx+Math.sin(m.yaw)*wz,dz=-Math.sin(m.yaw)*wx+Math.cos(m.yaw)*wz,
        sweepClear=!(dx> -1.65-G.bodyRadius&&dx<.42+G.bodyRadius&&dz> -1.65-G.bodyRadius&&dz<.20+G.bodyRadius);
      if(!armed||!eligible||!audioReady||warning||interrupted||!sweepClear||!thresholdGagVisible(s,{layout}))return;
      g.phase='running';g.reduced=!!reduced;g.elapsed=0;cue(events,g,'release',1,0,s);
    }else return;
  }
  if(g.phase!=='running')return;
  if(!g.cancelled&&(warning||interrupted||!supportedHere(s)||(s.opened||[]).length>=5||(s.sourceDoors||[]).length)){
    g.cancelled=true;g.emitted=31;events.push({type:'threshold-gag-cancel',id:G.id,reason:warning?'real-warning':'real-transition',chartId:0});
  }
  const previous=g.elapsed,clock=thresholdGagTiming(g.reduced);g.elapsed=Math.min(clock.finish,g.elapsed+dt);
  for(const[kind,bit,at]of[['stop',2,clock.contact],['rattle',4,clock.rattle],['speaker-click',8,clock.click],['boo',16,clock.boo]])
    if(previous<at&&g.elapsed+1e-8>=at)cue(events,g,kind,bit,at,s);
  if(g.elapsed>=clock.finish){g.phase='spent';g.armed=false;events.push({type:'threshold-gag-spent',id:G.id,chartId:0,cancelled:g.cancelled});}
}
