import {THRESHOLD_GAG as G,thresholdGagPoint,thresholdGagPenetration} from '../data/threshold-gag.js';
import {thresholdGagClearSight} from './threshold-gag-sight.js';
const number=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,number(n,a)));
const ACTIVE=new Set(['waiting','seen']);
const TRANSFER=/^(?:loop|complete|return|phase|fold|portal|capture|drop)$/;
export function freshThresholdInspection(){return{read:false,captionUntil:0,phase:'idle',anchor:null,elapsed:0,seenSeconds:0,awaySeconds:0};}
export function normalizeThresholdInspection(v){
  const fresh=freshThresholdInspection();if(!v||typeof v!=='object')return fresh;
  const phase=['idle','waiting','seen','gone'].includes(v.phase)?v.phase:'idle',a=v.anchor;
  const anchor=a&&['x','z','feet','yaw'].every(k=>Number.isFinite(a[k]))&&Math.abs(a.feet-G.feet)<.12
    ?{x:clamp(a.x,-10000,10000),z:clamp(a.z,-10000,10000),feet:a.feet,yaw:Math.atan2(Math.sin(a.yaw),Math.cos(a.yaw))}:null;
  return{read:!!v.read,captionUntil:Math.max(0,number(v.captionUntil)),phase:ACTIVE.has(phase)&&!anchor?'gone':phase,
    anchor,elapsed:clamp(v.elapsed,0,1e9),seenSeconds:clamp(v.seenSeconds,0,1),awaySeconds:clamp(v.awaySeconds,0,1)};
}
function present(s){return s.kind===G.hostKind&&s.status==='active'&&s.thresholdGag?.available&&s.thresholdGag.phase==='spent'
  &&Math.abs(s.feet-G.feet)<.12&&!s.fall&&!s.recovery&&!s.bodyTransit&&!s.cameraTransit&&(s.opened||[]).length<5&&!(s.sourceDoors||[]).length;}
function pointVisible(s,p,layout,angle=.72){
  const dx=p.x-s.x,dz=p.z-s.z,d=Math.hypot(dx,dz),dy=p.y-(s.feet+G.eyeHeight);
  return d>.12&&Math.cos(Math.atan2(dx,-dz)-(s.yaw||0))>Math.cos(angle)&&Math.abs(Math.atan2(dy,d)-(s.pitch||0))<.68
    &&thresholdGagClearSight({x:s.x,y:s.feet+G.eyeHeight,z:s.z},p,s,layout);
}
export function thresholdGagInspectFocus(s,layout){
  if(!present(s))return null;
  const p=thresholdGagPoint(G.inscription.target),m=G.mount,dx=s.x-m.x,dz=s.z-m.z,
    localZ=-Math.sin(m.yaw)*dx+Math.cos(m.yaw)*dz;
  if(localZ>-.16||Math.hypot(p.x-s.x,p.z-s.z)>G.inscription.range||!pointVisible(s,p,layout,.55))return null;
  return{type:'inspect',id:'ellery-student-ghost-back',title:'READ THE BACK',position:p,
    lines:[G.inscription.epithet,G.inscription.credit+' — two signatures.']};
}
function safeAnchor(x,z,s,layout,{checkSight=true}={}){
  const radius=G.inscription.ghostRadius,support=layout?.supportAt?.(x,z,s);
  if(!support||Math.abs(support.floor-s.feet)>.05||support.ceil-support.floor<G.inscription.ghostHeight+.08)return null;
  for(const dx of[-radius,0,radius])for(const dz of[-radius,0,radius]){
    const p=layout.supportAt(x+dx,z+dz,s);
    if(!p||Math.abs(p.floor-support.floor)>.04||p.ceil-p.floor<G.inscription.ghostHeight+.08
      ||layout.canOccupy&&!layout.canOccupy(x+dx,z+dz,{...s,feet:support.floor}))return null;
  }
  if(thresholdGagPenetration(x,z,s,radius,G.inscription.ghostHeight)>0)return null;
  const target={x,y:support.floor+1.3,z};
  if(checkSight&&!thresholdGagClearSight({x:s.x,y:s.feet+G.eyeHeight,z:s.z},target,s,layout))return null;
  return{x,z,feet:support.floor,yaw:Math.atan2(s.x-x,-(s.z-z))};
}
export function thresholdGagInspectionPlan(s,layout){
  if(!thresholdGagInspectFocus(s,layout)||s.thresholdGag.inspection?.phase&&s.thresholdGag.inspection.phase!=='idle')return null;
  for(const distance of[1.8,2.2,1.6])for(const offset of[0,.25,-.25,.45,-.45]){
    const bearing=(s.yaw||0)+Math.PI+offset,x=s.x+Math.sin(bearing)*distance,z=s.z-Math.cos(bearing)*distance;
    const anchor=safeAnchor(x,z,s,layout);if(anchor)return anchor;
  }
  return null;
}
export function inspectThresholdGag(s,layout,{authorized=false}={}){
  if(!thresholdGagInspectFocus(s,layout))return[];
  const i=s.thresholdGag.inspection||(s.thresholdGag.inspection=freshThresholdInspection()),anchor=authorized?thresholdGagInspectionPlan(s,layout):null;
  i.read=true;i.captionUntil=s.elapsed+G.inscription.captionSeconds;
  const events=[{type:'threshold-gag-inspected',id:G.id,epithet:G.inscription.epithet,credit:G.inscription.credit}];
  if(anchor){i.anchor=anchor;i.phase='waiting';i.elapsed=0;i.seenSeconds=0;i.awaySeconds=0;
    events.push({type:'threshold-gag-ghost-arrived',id:G.id,position:{x:anchor.x,y:anchor.feet,z:anchor.z},yaw:anchor.yaw});}
  return events;
}
export function advanceThresholdGagInspection(s,_before,dt,events,{layout,protectedScare=false,reduced=false}={}){
  const i=s.thresholdGag?.inspection;if(!i||!ACTIVE.has(i.phase))return;
  const transferred=events.some(e=>TRANSFER.test(e.type));
  const leave=reason=>{i.phase='gone';events.push({type:'threshold-gag-ghost-gone',id:G.id,reason});};
  if(protectedScare||transferred||!present(s)){leave(protectedScare?'protected':'transfer');return;}
  i.elapsed+=Math.max(0,number(dt));const a=i.anchor;
  if(!a||Math.hypot(s.x-a.x,s.z-a.z)>7){leave('left-the-room');return;}
  // A saved world anchor can outlive its supporting geometry. Retire it
  // rather than moving the presence or resurrecting it after a later load.
  // Occlusion from the player's new position is allowed; footing is not.
  if(!safeAnchor(a.x,a.z,s,layout,{checkSight:false})){leave('invalid-footing');return;}
  const visible=pointVisible(s,{x:a.x,y:a.feet+1.3,z:a.z},layout,.83);
  if(visible){i.seenSeconds=Math.min(1,i.seenSeconds+Math.max(0,number(dt)));i.awaySeconds=0;
    if(i.phase==='waiting'&&i.seenSeconds>=(reduced?.3:.12)){i.phase='seen';events.push({type:'threshold-gag-ghost-seen',id:G.id,position:{x:a.x,y:a.feet,z:a.z}});}}
  else if(i.phase==='seen'){i.awaySeconds+=Math.max(0,number(dt));if(i.awaySeconds>=.20)leave('out-of-view');}
}
export function thresholdGagGhostFrame(s){
  const i=s.thresholdGag?.inspection,a=i?.anchor;
  return present(s)&&ACTIVE.has(i?.phase)&&a?{...a,poseId:G.inscription.ghostPose,variant:15,charge:.42}:null;
}
