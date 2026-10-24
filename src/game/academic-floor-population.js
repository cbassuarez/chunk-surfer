import {ACADEMIC_FLOOR_POPULATION as ACTORS,ACADEMIC_FLOOR_GUESTS as GUESTS,
  ACADEMIC_FLOOR_POPULATION_GROUPS as GROUPS,ACADEMIC_FLOOR_POPULATION_BEATS as BEATS,
  ACADEMIC_FLOOR_POPULATION_TIMING as T,academicFloorPopulationDialogue} from '../data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../data/academic-society.js';

const GUEST_IDS=new Set(GUESTS.map(actor=>actor.id));
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(9999,Math.trunc(Number(value)))):0;
export function createAcademicFloorPopulationState(saved={}){
  const input=saved&&typeof saved==='object'?saved:{};
  return{version:1,remarks:Object.fromEntries(GUESTS.map(actor=>[actor.id,count(input.remarks?.[actor.id])]))};
}
export const serializeAcademicFloorPopulation=createAcademicFloorPopulationState;

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const angle=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const bearing=(from,to)=>Math.atan2(to.x-from.x,-(to.y-from.y));
const moveAngle=(from,to,amount)=>from+clamp(angle(from,to),-amount,amount);
const NAMED=new Map(ACADEMIC_SOCIETY_ACTORS.map(actor=>[actor.id,actor]));

// One cup carrier connects two real social rooms, returning along the same
// checked path. Pausing never replaces a
// mid-step pose with an idle pose: distance, position and articulation freeze
// together. Anonymous company owns no player input, hostility or quest state.
export function createAcademicFloorPopulation(saved={}){
  let state=createAcademicFloorPopulationState(saved),inside=false,timeSec=0,activeDialogue=null;
  let contextNow={},visit=0,ambientElapsed=0,ambientStarted=false,pending=null,issued=new Set(),lineKey=null,lineStarted=0;
  const initial=()=>new Map(ACTORS.map(actor=>[actor.id,{x:actor.x,y:actor.y,bodyYaw:actor.yaw,
    desiredYaw:actor.yaw,distance:0,speed:0,mode:'idle',next:1,direction:1,pause:actor.socialStop||T.walkPause}]));
  let bodies=initial();
  let activeActorIds=null;
  const present=id=>!activeActorIds||activeActorIds.has(id);
  const save=()=>serializeAcademicFloorPopulation(state);
  function cancelAmbient(){pending=null;}
  function partner(actor,body){
    const atFarStop=actor.routeMode==='shuttle'&&body.direction<0;
    const id=atFarStop&&actor.routePartnerId?actor.routePartnerId:actor.partnerId;
    return bodies.get(id)||NAMED.get(id)||actor.attentionAt;
  }
  function animate(delta,context){
    for(const actor of ACTORS){
      if(!present(actor.id))continue;
      const body=bodies.get(actor.id),route=actor.route;
      if(route?.length>1){
        if(body.pause>0){
          body.pause=Math.max(0,body.pause-delta);body.speed=0;body.mode='idle';
          const target=partner(actor,body);if(target){body.desiredYaw=bearing(body,target);body.bodyYaw=moveAngle(body.bodyYaw,body.desiredYaw,T.turnSpeed*delta);}
        }
        else{
          const target=route[body.next],distance=Math.hypot(target.x-body.x,target.y-body.y);
          body.desiredYaw=bearing(body,target);
          const turn=angle(body.bodyYaw,body.desiredYaw);
          body.bodyYaw=moveAngle(body.bodyYaw,body.desiredYaw,T.turnSpeed*delta);
          if(Math.abs(turn)>.13){body.mode='idle';body.speed=0;continue;}
          const step=Math.min(distance,(actor.speed||.32)*delta),fraction=distance?step/distance:0;
          const next={x:body.x+(target.x-body.x)*fraction,y:body.y+(target.y-body.y)*fraction};
          // A checked source route cannot predict a live door leaf. The main
          // adapter supplies the actual compiled step/prop predicate; absent
          // evidence of passability, this carrier waits with the cup.
          if(actor.requiresRouteClear&&context.canMove?.({x:body.x,y:body.y},next,actor)!==true){body.mode='idle';body.speed=0;continue;}
          if(context.listener&&Math.hypot(next.x-context.listener.x,next.y-context.listener.y)<.9){body.mode='idle';body.speed=0;continue;}
          body.x=next.x;body.y=next.y;body.distance+=step;body.speed=delta?step/delta:0;body.mode=step>1e-8?'walk':'idle';
          if(distance<=step+1e-8){
            if(actor.routeMode==='shuttle'){
              const endpoint=body.next===0||body.next===route.length-1;
              if(endpoint)body.direction*=-1;
              body.next+=body.direction;body.pause=endpoint?(actor.socialStop||8):0;
            }else{body.next=(body.next+1)%route.length;body.pause=T.walkPause;}
          }
        }
      }else if(!actor.dreadVariant){
        const target=partner(actor,body);
        if(target){body.desiredYaw=bearing(body,target);if(actor.activity!=='lean')body.bodyYaw=moveAngle(body.bodyYaw,body.desiredYaw,T.turnSpeed*delta);}
      }
    }
  }
  function tick(dt,context={}){
    if(Array.isArray(context.activeActorIds)||Object.prototype.toString.call(context.activeActorIds)==='[object Set]')activeActorIds=new Set(context.activeActorIds);
    const wasInside=inside;contextNow={...context};
    inside=context.onAcademicFloor===true;
    if(!inside){activeDialogue=null;cancelAmbient();lineKey=null;return[];}
    if(!wasInside){visit++;ambientElapsed=0;ambientStarted=false;issued=new Set();cancelAmbient();bodies=initial();}
    if(context.suspended||context.paused||context.hidden||context.focused===false||context.nativeFocused===false)return[];
    const delta=Number.isFinite(dt)?clamp(dt,0,T.maxTick):0;
    if(activeDialogue||context.speechBusy||context.adversaryBusy)return[];
    timeSec+=delta;ambientElapsed+=delta;animate(delta,context);
    const audible=context.audibleGroupIds instanceof Set?context.audibleGroupIds:new Set(context.audibleGroupIds||[]);
    const delay=ambientStarted?T.quietBetween:T.firstExchange;
    if(pending||ambientElapsed+1e-9<delay)return[];
    const beat=BEATS.find(beat=>!issued.has(beat.id)&&audible.has(beat.groupId)&&beat.lines.every(line=>present(line.actorId)));
    if(!beat)return[];
    ambientElapsed=0;ambientStarted=true;pending={id:`academic-population:${visit}:${beat.id}`,beatId:beat.id,groupId:beat.groupId};
    return[{type:'population-exchange',...pending,lines:beat.lines.map(line=>({...line}))}];
  }
  function settleAmbient(id,{completed=false}={}){
    if(pending?.id!==id)return[];
    const receipt=pending;cancelAmbient();ambientElapsed=0;
    const beat=BEATS.find(beat=>beat.id===receipt.beatId),valid=completed&&inside&&beat?.lines.every(line=>present(line.actorId));
    if(valid)issued.add(receipt.beatId);
    return[{type:'population-exchange-settled',...receipt,completed:!!valid}];
  }
  function dialogue(actorId){return academicFloorPopulationDialogue(actorId,state);}
  function beginDialogue(actorId){
    if(!inside||activeDialogue||!GUEST_IDS.has(actorId)||!present(actorId))return null;
    cancelAmbient();activeDialogue=actorId;return dialogue(actorId);
  }
  function endDialogue(actorId,{completed=false}={}){
    if(activeDialogue!==actorId)return[];
    activeDialogue=null;
    if(!completed||!inside)return[];
    state.remarks[actorId]=Math.min(9999,state.remarks[actorId]+1);
    return[{type:'remark-complete',id:`${actorId}:remark:${state.remarks[actorId]}`,actorId,stateChanged:true}];
  }
  function actorFrame(context=contextNow){
    // Fresh render voice context also becomes the default for read-only audio
    // and proxy queries in that frame; they must not restart the line clock by
    // falling back to the previous fixed update's stale transcript.
    contextNow={...contextNow,...context};context=contextNow;
    const clock=Number.isFinite(context.performanceTimeSec)?context.performanceTimeSec:timeSec;
    const line=context.speakingLine,speaker=context.speakingActorId;
    const actual=GUEST_IDS.has(speaker)&&line?.actorId===speaker
      &&(context.voiceActorId===undefined||context.voiceActorId===speaker);
    const key=actual?`${speaker}:${line.text}`:null;
    if(key!==lineKey||clock<lineStarted){lineKey=key;lineStarted=clock;}
    const lineElapsed=actual?Math.max(0,clock-lineStarted):0;
    return ACTORS.map((actor,index)=>{
      const body=bodies.get(actor.id),groupIndex=GROUPS.findIndex(group=>group.actors.includes(actor.id));
      let desired=body.desiredYaw,performance=null;
      if(actor.kind==='npc'&&groupIndex>=0){
        const group=GROUPS[groupIndex],slot=group.actors.indexOf(actor.id),cycleClock=timeSec+groupIndex*4.1,cycle=Math.floor(cycleClock/16.4),within=cycleClock%16.4;
        const first=within<3.1,elapsed=first?within:within-3.1,lead=group.actors[first?0:1];
        const other=bodies.get(group.actors.find(id=>id!==actor.id));
        if(slot>=0&&other&&body.mode!=='walk'&&Math.hypot(other.x-body.x,other.y-body.y)<7.5&&elapsed>=0&&elapsed<2.2)performance={key:`company:${group.id}:${cycle}:${lead}`,
          role:actor.id===lead?'speaker':'listener',cue:actor.id===lead?(slot?'concede':'offer'):'attend',elapsedSec:elapsed,
          sourceActorId:lead,targetActorId:group.actors.find(id=>id!==lead),silent:true};
      }
      if(actual&&(actor.id===speaker||actor.id===line.toActorId)){
        const source=bodies.get(speaker),target=bodies.get(line.toActorId),listener=actor.id!==speaker;
        if(!listener||source&&Math.hypot(source.x-body.x,source.y-body.y)<=8){
          const aim=listener?source:target;if(aim)desired=bearing(body,aim);
          performance={key:lineKey,role:listener?'listener':'speaker',cue:listener?(line.responseCue||'attend'):(line.performanceCue||'offer'),elapsedSec:lineElapsed,
            sourceActorId:speaker,targetActorId:line.toActorId||null,silent:false};
        }
      }
      if(activeDialogue===actor.id&&context.listener)desired=bearing(body,context.listener);
      if(actor.regard&&context.listener&&Math.hypot(context.listener.x-body.x,context.listener.y-body.y)<5)desired=bearing(body,context.listener);
      // Empty cloaks share one small turn within their own social gathering,
      // without following or closing the distance to the living visitor.
      const turn=actor.kind==='hollow'&&actor.groupId&&!actor.dreadVariant&&!actor.regard ? .08*Math.sin(timeSec*.19):0;
      return{...actor,x:body.x,y:body.y,bodyYaw:body.bodyYaw+turn,yaw:desired+turn,
        cohortTurn:turn,
        visible:inside&&present(actor.id),phase:actual&&actor.id===speaker?clock:timeSec+index*1.73,
        // Main's presentation clock continues during this society's own
        // conversation, and freezes on pause/blur/foreign modal. Roots use
        // controller time; unrelated people may still sip or smoke nearby.
        activityPhase:clock,activityOffset:index*1.73,
        mode:body.mode,speed:body.speed,distance:body.distance,engaged:activeDialogue===actor.id,
        talkingToPlayer:activeDialogue===actor.id,speaking:actual&&actor.id===speaker,performance};
    });
  }
  function load(next={}){
    state=createAcademicFloorPopulationState(next);inside=false;timeSec=0;activeDialogue=null;
    contextNow={};visit=0;ambientElapsed=0;ambientStarted=false;pending=null;issued=new Set();lineKey=null;lineStarted=0;bodies=initial();activeActorIds=null;return save();
  }
  return Object.freeze({tick,dialogue,beginDialogue,endDialogue,settleAmbient,actorFrame,save,load,
    view:()=>({...save(),inside,timeSec,activeDialogue,visit,ambientElapsed,pending:pending?{...pending}:null,issuedBeatIds:[...issued]})});
}
