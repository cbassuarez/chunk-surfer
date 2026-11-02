import {STUDENT_STRIKE_FILM,STUDENT_STRIKE_DURATION} from '../data/student-strike-film.js';
export {STUDENT_STRIKE_DURATION};
// Pure measured layout sampler; it owns no game camera, progression or clock.
import {ZONE} from '../data/floorplan/legend.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../data/academic-society.js';
import {ACADEMIC_FLOOR_GUESTS,ACADEMIC_FLOOR_HOLLOWS} from '../data/academic-floor-population.js';
import {academicSocietyCharacterInstances,academicFloorPopulationInstances} from '../render/academic-society-characters.js';
import {articulateStrikeActor,sampleStrikePlateOffer,STRIKE_PERFORMANCE_SITES} from '../render/student-strike-performance.js';
const plateOptions={approach:[1.5,2.4],slide:[2.4,3.6],release:[6.1,7.4]};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const u=clamp(x);return u*u*u*(10+u*(-15+6*u));};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
function path(points,u){
  if(!Array.isArray(points))throw Error('Camera path is missing.');
  if(typeof points[0]==='number')return[...points];
  if(points.length===1)return[...points[0]];
  if(points.length===2)return mix(points[0],points[1],u);
  if(points.length!==4)throw Error('Use one, two or four measured camera marks.');
  return points[0].map((v,i)=>(1-u)**3*v+3*(1-u)**2*u*points[1][i]+3*(1-u)*u*u*points[2][i]+u**3*points[3][i]);
}
function scalar(value,u,fallback){return Array.isArray(value)?value[0]+(value.at(-1)-value[0])*u:Number.isFinite(value)?value:fallback;}
function look(eye,target){const d=target.map((v,i)=>v-eye[i]),length=Math.hypot(...d);if(length<.001)throw Error('Camera target coincides with eye.');return{direction:d.map(v=>v/length),yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
function focusFor(c,local,eye,target,direction){
  const marks=c.focus?.length?c.focus:[{at:0,target}];
  let index=marks.findIndex(m=>m.at>=local);if(index<0)index=marks.length-1;
  const a=marks[Math.max(0,index-1)],b=marks[index],u=b.at>a.at?smooth((local-a.at)/(b.at-a.at)):1;
  const distance=m=>Number.isFinite(m.distanceM)?m.distanceM:Math.max(.10,(m.target||target).reduce((sum,v,i)=>sum+(v-eye[i])*direction[i],0));
  return 1/((1-u)/distance(a)+u/distance(b));
}
export function createStudentStrikeTimeline(plan){
  const shots=plan.shots||[],durationSeconds=plan.durationSeconds||shots.at(-1)?.end;
  if(!shots.length||!Number.isFinite(durationSeconds)||durationSeconds<=0)throw Error('A complete positive-duration shot plan is required.');
  let end=0;for(const shot of shots){if(shot.start!==end||!(shot.end>shot.start))throw Error('Shot intervals must be contiguous and increasing.');end=shot.end;}
  if(end!==durationSeconds)throw Error('Duration differs from the final shot end.');
  return{plan,shots,durationSeconds,fps:plan.fps||24,width:plan.width||960,height:plan.height||480,sample(seconds,{returnPose=null,reducedMotion=false,voiceActorId=null}={}){
    const time=clamp(Number.isFinite(seconds)?seconds:0,0,durationSeconds),shot=shots.find(s=>time<s.end)||shots.at(-1),local=time-shot.start;
    const u=clamp(local/(shot.end-shot.start)),c=shot.camera;
    const cameraU=reducedMotion?.5:u;
    const eye=path(c.eye,cameraU),target=path(c.target,cameraU),orientation=look(eye,target);
    const nativeReturn=shot.stage==='return'||shot.nativeReturn===true;
    const focalLengthMm=scalar(c.focalLengthMm,u,35),fNumber=scalar(c.fNumber??c.apertureFNumber,u,8);
    const focusDistanceM=focusFor(c,local,eye,target,orientation.direction);
    const camera={eye,target,yaw:orientation.yaw,pitch:orientation.pitch,tanHalfFov:nativeReturn ? .95 : 12.445/(2*focalLengthMm),
      lens:nativeReturn?null:{focalLengthMm,apertureFNumber:fNumber,sensorHeightMm:12.445,focusDistanceM,maxBlurPx:9}};
    if(nativeReturn&&returnPose){const reference=returnPose;camera.eye=[...(reference.eye||eye)];camera.target=[...(reference.target||target)];camera.yaw=reference.yaw??camera.yaw;camera.pitch=reference.pitch??camera.pitch;camera.lens=reference.lens??null;camera.tanHalfFov=reference.tanHalfFov??.95;}
    const actorIds=shot.actorIds||[],actors=(plan.actors||[]).filter(a=>actorIds.includes(a.id)).map(a=>({...a,position:[...(a.position||a.root||a.worldPosition)]}));
    // A deliberate body turn remains true across subsequent memory cuts.
    for(const prior of shots.filter(s=>s.start<=time&&s.stage===shot.stage))for(const blocking of prior.blocking||[]){
      const ids=blocking.ids||[blocking.actorId||blocking.id];
      const w=smooth((time-prior.start-(blocking.start||0))/((blocking.end??prior.end-prior.start)-(blocking.start||0)));
      for(const actor of actors.filter(a=>ids.includes(a.id))){
        if(blocking.position||blocking.root)actor.position=path(blocking.position||blocking.root,w);
        if(blocking.yaw!=null)actor.yaw=scalar(blocking.yaw,w,actor.yaw||0);
        else if(blocking.yawStart!=null||blocking.yawEnd!=null)actor.yaw=(actor.yaw||0)+(blocking.yawStart||0)+((blocking.yawEnd||0)-(blocking.yawStart||0))*w;
        if(blocking.headYaw!=null)actor.headYaw=scalar(blocking.headYaw,w,actor.headYaw??actor.yaw??0);
      }
    }
    for(const cue of shot.performance||shot.performances||[]){
      const at=cue.at??cue.start??0,length=cue.durationSec??cue.duration??2.2;
      if(local<at||local>=at+length)continue;
      const actor=actors.find(a=>a.id===cue.actorId);if(!actor)continue;
      actor.performance={role:cue.role||'speaker',cue:cue.cue,elapsedSec:local-at};actor.speaking=cue.speaking===true;
    }
    if(shot.stage==='memory')for(const actor of actors){
      if(actor.id==='strike-student-a'&&['S02','S03','S04'].includes(shot.id))
        actor.articulatedAction={kind:'keyboard-refusal',seconds:Math.max(0,time-10),clockSeconds:time};
      if(actor.id==='strike-student-d'&&shot.id==='S05')
        actor.articulatedAction={kind:'plate-offer',seconds:local,clockSeconds:time,plateOptions};
    }
    const objectIds=shot.objectIds||[],sourceObjects=[...(shot.stage==='memory'?plan.memoryDressing?.persistent||[]:[]),
      ...(plan.objects||[]).filter(o=>objectIds.includes(o.id)),...(shot.additionalInstances||[])];
    const objects=[...new Map(sourceObjects.map(o=>[o.id,o])).values()].map(o=>{
      const p=o.position||o.root||[o.x,o.y,o.z];return{...o,x:p[0],y:p[1],z:p[2]};
    });
    for(const object of objects)if(object.motion?.translation){
      const motion=object.motion,w=smooth((local-motion.start)/(motion.end-motion.start)),delta=path(motion.translation,w);
      object.x+=delta[0];object.y+=delta[1];object.z+=delta[2];
    }
    if(shot.id==='S05'){
      const object=objects.find(o=>o.id==='offered-bread');
      if(object){const p=sampleStrikePlateOffer(local,plateOptions).position;object.x=p[0];object.y=p[1];object.z=p[2];}
      const giver=actors.find(a=>a.id==='strike-student-d');
      if(giver){giver.position=[...STRIKE_PERFORMANCE_SITES.meal.giverRoot];giver.yaw=STRIKE_PERFORMANCE_SITES.meal.giverYaw;giver.headYaw=giver.yaw;}
    }
    for(const move of shot.objectMoves||[]){const object=objects.find(o=>o.id===(move.objectId||move.id));if(!object)continue;
      const w=smooth((local-(move.start||0))/((move.end??shot.end-shot.start)-(move.start||0))),p=path(move.position,w);object.x=p[0];object.y=p[1];object.z=p[2];}
    const dialogue=(shot.dialogue||[]).find(l=>local>=(l.start??l.at??0)&&local<(l.end??(l.at??0)+(l.durationSec??4)))||null;
    // Gesture envelopes can settle before a sentence ends; the existing native
    // jaw follows the authored spoken interval rather than an old pose span.
    const narration=(plan.narration||[]).find(line=>time>=line.start&&time<line.end)||null;
    for(const actor of actors)actor.speaking=voiceActorId!==null?actor.id===voiceActorId:dialogue?.actorId===actor.id
      ||((shot.stage==='present'||shot.stage==='return')&&narration?.actorId===actor.id);
    let black=0;if(shot.transition==='fade-to-full-black-over-last-.35s')black=smooth((local-(shot.end-shot.start-.35))/.35);
    if(nativeReturn)black=local<.18?1:1-smooth((local-.18)/.5);
    return{seconds:time,shotId:shot.id,title:shot.title||shot.id,localSeconds:local,stage:shot.stage||shot.set||'memory',
      camera,nativeReturn,reducedMotion,renderGroup:shot.renderGroup||'academic',floorH:shot.floorH??10,zone:shot.zone??ZONE.academic,towerActive:shot.towerActive??shot.renderGroup==='tower',actors,objects,hidePropIds:shot.hidePropIds||[],lightingOverride:shot.lightingOverride||plan.lightingOverride||{},
      performanceSeconds:time,dialogue:dialogue||narration,black,scope:'Student-strike reconstruction; no progression or Contact effect.'};
  }};
}
// The exact same native character input is used in the browser and CPU trace.
// Unwrapped body/head headings remain authored; native anatomical clamps handle
// their relative angle. Historical roles never change their donor biography.
export function nativeStudentStrikeActors(frame,{voiceActorId=null}={}){
  const out=[];
  for(const entry of frame.actors||[]){
    const source=ACADEMIC_SOCIETY_ACTORS.find(a=>a.id===entry.sourceActorId||a.id===entry.id);
    const guest=[...ACADEMIC_FLOOR_GUESTS,...ACADEMIC_FLOOR_HOLLOWS].find(a=>a.id===entry.sourceActorId||a.id===entry.id);
    if(!source&&!guest)throw Error('Unknown native performer source '+entry.sourceActorId);
    const original=source||guest,position=entry.position||entry.root||entry.worldPosition;
    if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))throw Error('Student-strike actor requires a finite physical root.');
    const actor={...original,x:position[0],y:position[2],floor:position[1],bodyYaw:entry.yaw??original.yaw,
      yaw:entry.headYaw??entry.yaw??original.yaw,speaking:voiceActorId!==null?entry.id===voiceActorId:!!entry.speaking,talkingToPlayer:false,
      performance:entry.performance||null,phase:frame.performanceSeconds};
    if(entry.id.startsWith('strike-')){actor.heldProp=null;actor.activity=null;actor.support=null;}
    const project=(x,z)=>({x,y:position[1],z});
    const instances=source?academicSocietyCharacterInstances([actor],{project,timeSec:frame.performanceSeconds,zone:ZONE.academic})
      :academicFloorPopulationInstances([actor],{project,timeSec:frame.performanceSeconds,zone:ZONE.academic});
    for(const native of instances){
      const instance=entry.articulatedAction&&native.character?.joints?articulateStrikeActor(native,{...entry.articulatedAction,speaking:actor.speaking}):native;
      out.push({...instance,id:`student-strike-${entry.id}:${instance.id}`,studentStrikeActorId:entry.id,
      studentStrikeRole:entry.role||null,sourceActorId:original.id,
      studentStrikePerformance:{bodyYaw:actor.bodyYaw,desiredHeadYaw:actor.yaw,speaking:actor.speaking,gesture:actor.performance,articulation:instance.strikeArticulation||null}});
    }
  }
  return out;
}

const studentStrikeTimeline=createStudentStrikeTimeline(STUDENT_STRIKE_FILM);
export const studentStrikeFrame=(seconds,options={})=>studentStrikeTimeline.sample(seconds,options);
