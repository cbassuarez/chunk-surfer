import {
  ACADEMIC_SOCIETY_ACTORS as ACTORS, ACADEMIC_SOCIETY_BEATS as BEATS,
  ACADEMIC_SOCIETY_TOPICS as TOPICS, ACADEMIC_SOCIETY_TIMING as T,
  ACADEMIC_SOCIETY_PERFORMANCE_CUES as CUES,ACADEMIC_SOCIETY_RESPONSE_CUES as RESPONSES,
  academicSocietyDialogue,academicSocietyLoanLines,academicSocietyBeatLines,
} from '../data/academic-society.js';

const BY_ID=new Map(ACTORS.map(person=>[person.id,person]));
const BEAT_BY_ID=new Map(BEATS.map(beat=>[beat.id,beat]));
const BEAT_IDS=new Set(BEAT_BY_ID.keys());
const CONSENT=new Set(['unasked','declined','lent','withdrawn','left','expired']);
const clamp=(v,a,b,f=a)=>Number.isFinite(Number(v))?Math.min(b,Math.max(a,Number(v))):f;
const unique=(value,allowed)=>(Array.isArray(value)?[...new Set(value.filter(id=>allowed.has(id)))]:[]);
const copy=value=>JSON.parse(JSON.stringify(value));
const point=value=>value&&Number.isFinite(Number(value.x))&&Number.isFinite(Number(value.y))
  ?{x:Number(value.x),y:Number(value.y)}:null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const spoken=(type,id,lines,extra={})=>({type,id,lines:copy(lines),...extra});
const lineKey=line=>{
  let hash=2166136261;for(const character of `${line.actorId}:${line.text||''}`)hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return `${line.actorId}:${(hash>>>0).toString(16)}`;
};
const wrapAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
let societyInstanceSerial=0;
const restingGaze={celeste:'emile',emile:'celeste',odette:'landing',lucien:'gallery',agathe:'odette',noe:'lucien',sabine:'emile'};

export function createAcademicSocietyState(saved={}){
  const input=saved&&typeof saved==='object'?saved:{};
  const consent=CONSENT.has(input.consent)?input.consent:'unasked';
  return {version:3,visits:Math.trunc(clamp(input.visits,0,9999)),
    met:Object.fromEntries(ACTORS.map(actor=>[actor.id,Math.trunc(clamp(input.met?.[actor.id],0,9999))])),
    topics:Object.fromEntries(ACTORS.map(actor=>[actor.id,unique(input.topics?.[actor.id],new Set(TOPICS[actor.id]))])),
    issuedBeatIds:unique(input.issuedBeatIds,BEAT_IDS),
    // Old saves have no current-visit receipts. Preserve their all-time receipts,
    // but do not resurrect one-shot greetings or discard completed decisions.
    visitBeatIds:unique(input.visitBeatIds,BEAT_IDS),
    roundBeatIds:unique(input.roundBeatIds??input.visitBeatIds,BEAT_IDS),
    ambientRounds:Object.fromEntries(['loggia','pair','gallery'].map(area=>[area,Math.trunc(clamp(input.ambientRounds?.[area],0,9999))])),
    beatIndex:Math.trunc(clamp(input.beatIndex,0,100000)),consent,
    loanRemaining:consent==='lent'?clamp(input.loanRemaining,0,T.loanSeconds,T.loanSeconds):0,
    loanElapsed:clamp(input.loanElapsed,0,T.loanSeconds),loanPulses:Math.trunc(clamp(input.loanPulses,0,T.maxLoanPulses)),
    returnAcknowledged:input.returnAcknowledged===true,
  };
}
export const serializeAcademicSociety=createAcademicSocietyState;

export function academicSocietyArea(listener){
  const p=point(listener);if(!p)return null;
  if(p.x>=8&&p.x<26&&p.y>=269&&p.y<279)return'loggia';
  if(p.x>=1&&p.x<17&&p.y>=241&&p.y<249)return'pair';
  if(p.x>=8&&p.x<11&&p.y>=249&&p.y<257)return'pair';
  if(p.x>=17&&p.x<23&&p.y>=241&&p.y<249)return'pair';
  if(p.x>=23&&p.x<48&&p.y>=242&&p.y<269)return'gallery';
  return null;
}

/** Pure local society. The adapter owns presentation/audio leases and controls. */
export function createAcademicSociety(saved={}){
  const instanceId=++societyInstanceSerial;
  let state=createAcademicSocietyState(saved),inside=false,firstTick=true;
  let quiet=T.firstExchange,idleTime=0,listener=null,focusedActor=null,activeDialogue=null;
  let performingKey=null,performanceStartedAt=0,lastPerformanceTime=null;
  const bodyYaws=new Map();
  let pendingAmbient=null,ambientSerial=0,attention=null;
  let activeActorIds=null;
  const present=id=>!activeActorIds||activeActorIds.has(id);
  const ambientAttempts=new Map();
  const save=()=>serializeAcademicSociety(state);
  function release(reason){
    if(state.consent!=='lent')return[];
    state.consent=reason==='leave'?'left':reason==='expired'?'expired':'withdrawn';
    state.loanRemaining=0;state.returnAcknowledged=false;
    return[spoken('released',`society:voice:${state.consent}`,[{who:'direction',text:reason==='leave'
      ?'Your next breath comes from where you are standing. Their evening stays upstairs.'
      :reason==='expired'?'Your breath catches in your own throat again. Emile has to finish the silence himself.'
        :'Your voice is back where your breath is.'}],{reason,stateChanged:true})];
  }
  function eligible(beat,p){
    if(!beat.lines.every(line=>present(line.actorId)))return false;
    if(!p||academicSocietyArea(p)!==beat.area)return false;
    if(beat.once&&state.issuedBeatIds.includes(beat.id))return false;
    if(state.roundBeatIds.includes(beat.id))return false;
    if((ambientAttempts.get(beat.id)||0)>=T.maxAmbientAttempts)return false;
    if(beat.minVisitBeats&&state.visitBeatIds.filter(id=>BEAT_BY_ID.get(id)?.area===beat.area).length<beat.minVisitBeats)return false;
    return beat.lines.every(line=>BY_ID.has(line.actorId)&&distance(p,BY_ID.get(line.actorId))<=T.earshot);
  }
  function settleAmbient(id,{completed=false,reason='cancelled'}={}){
    if(!pendingAmbient||pendingAmbient.id!==id)return[];
    const pending=pendingAmbient;pendingAmbient=null;
    const beat=BEAT_BY_ID.get(pending.beatId);
    if(completed&&inside&&beat&&beat.lines.every(line=>present(line.actorId))&&academicSocietyArea(listener)===beat.area
        &&pending.lines.every(line=>BY_ID.has(line.actorId)&&distance(listener,BY_ID.get(line.actorId))<=T.earshot)){
      if(!state.issuedBeatIds.includes(beat.id))state.issuedBeatIds.push(beat.id);
      if(!state.visitBeatIds.includes(beat.id))state.visitBeatIds.push(beat.id);
      if(!state.roundBeatIds.includes(beat.id))state.roundBeatIds.push(beat.id);
      ambientAttempts.delete(beat.id);
      state.beatIndex++;quiet=T.quietBetween;
      if(beat.outsider)attention={id:pending.id,area:beat.area,actorIds:[...beat.attentionActors],elapsed:0};
      return[{type:'ambient-complete',id:pending.id,beatId:beat.id,stateChanged:true}];
    }
    quiet=T.retryQuiet;
    return[{type:'ambient-cancelled',id:pending.id,beatId:pending.beatId,reason,stateChanged:false}];
  }
  function tick(dt,context={}){
    if(Array.isArray(context.activeActorIds)||Object.prototype.toString.call(context.activeActorIds)==='[object Set]')activeActorIds=new Set(context.activeActorIds);
    const onAcademicFloor=context.onAcademicFloor===true;
    listener=point(context.listener)||listener;
    focusedActor=BY_ID.has(context.focusedActor)?context.focusedActor:null;
    const events=[];
    if(!onAcademicFloor){
      inside=false;activeDialogue=null;firstTick=false;quiet=T.firstExchange;
      performingKey=null;lastPerformanceTime=null;bodyYaws.clear();
      pendingAmbient=null;attention=null;ambientAttempts.clear();
      return release('leave');
    }
    if(!inside){
      inside=true;if(!firstTick||state.visits===0){state.visits++;state.visitBeatIds=[];state.roundBeatIds=[];}
      events.push({type:'entered',id:`society:visit:${state.visits}`,stateChanged:true});
    }
    firstTick=false;
    const delta=clamp(dt,0,T.maxTick);
    if(context.quietClaimed){
      if(pendingAmbient)events.push(...settleAmbient(pendingAmbient.id,{reason:'safety-presentation'}));
      attention=null;return events;
    }
    if(context.suspended){
      if(pendingAmbient)events.push(...settleAmbient(pendingAmbient.id,{reason:'suspended'}));
      return events;
    }
    if(pendingAmbient){
      const beat=BEAT_BY_ID.get(pendingAmbient.beatId);
      if(!beat||!beat.lines.every(line=>present(line.actorId))||academicSocietyArea(listener)!==beat.area
          ||!pendingAmbient.lines.every(line=>BY_ID.has(line.actorId)&&distance(listener,BY_ID.get(line.actorId))<=T.earshot))
        events.push(...settleAmbient(pendingAmbient.id,{reason:'left-earshot'}));
      else{
        pendingAmbient.elapsed+=delta;
        if(pendingAmbient.elapsed>=T.pendingSeconds)events.push(...settleAmbient(pendingAmbient.id,{reason:'delivery-timeout'}));
        return events;
      }
    }
    if(context.speechBusy||activeDialogue)return events;
    idleTime+=delta;
    if(attention){
      attention.elapsed+=delta;
      if(attention.elapsed>=T.attentionSeconds||academicSocietyArea(listener)!==attention.area)attention=null;
    }
    if(state.consent==='lent'){
      state.loanElapsed=Math.min(T.loanSeconds,state.loanElapsed+delta);
      state.loanRemaining=Math.max(0,state.loanRemaining-delta);
      if(state.loanRemaining<=0)return[...events,...release('expired')];
      if(state.loanPulses===1&&state.loanElapsed>=T.secondLoanPulseAt){
        state.loanPulses=2;
        events.push(spoken('borrowed-voice','society:loan:2',academicSocietyLoanLines(1),{stateChanged:true}));
      }
      return events;
    }
    quiet-=delta;if(quiet>0)return events;
    const area=academicSocietyArea(listener);
    if(present('odette')&&state.visits>1&&!state.returnAcknowledged&&['declined','withdrawn','left','expired'].includes(state.consent)&&area==='loggia'&&distance(listener,BY_ID.get('odette'))<=T.earshot){
      state.returnAcknowledged=true;quiet=T.quietBetween;
      events.push(spoken('return','society:return',[{
        who:'unknown',actorId:'odette',name:BY_ID.get('odette').name,voiceSpeaker:BY_ID.get('odette').voiceSpeaker,sourceLabel:BY_ID.get('odette').sourceLabel,
        text:state.consent==='declined'?'Your own voice. It suits you. Come and go as you like.':'You came back in your own voice. Good. Come and go that way.',toPlayer:true,
      }],{stateChanged:true}));return events;
    }
    const available=BEATS.filter(beat=>eligible(beat,listener));
    if(!available.length){
      const local=BEATS.filter(beat=>beat.area===area&&!beat.once
        &&beat.lines.every(line=>present(line.actorId))
        &&beat.lines.every(line=>BY_ID.has(line.actorId)&&distance(listener,BY_ID.get(line.actorId))<=T.earshot));
      const repeatable=local.filter(beat=>(ambientAttempts.get(beat.id)||0)<T.maxAmbientAttempts);
      if(repeatable.length&&repeatable.every(beat=>state.roundBeatIds.includes(beat.id))){
        state.roundBeatIds=state.roundBeatIds.filter(id=>!local.some(beat=>beat.id===id));
        state.ambientRounds[area]=Math.min(9999,state.ambientRounds[area]+1);quiet=T.repriseQuiet;
        events.push({type:'ambient-round',id:`society:${area}:round:${state.ambientRounds[area]}`,area,stateChanged:true});
      }
      return events;
    }
    // Establish ordinary company first, then let the visitor notice its
    // appetite. Preserve authored order within each mood and never skip a
    // subject by rotating an index into a shrinking candidate set.
    const unheard=available.filter(beat=>!state.issuedBeatIds.includes(beat.id));
    const pool=unheard.length?unheard:available;
    const lastLocal=state.roundBeatIds.map(id=>BEAT_BY_ID.get(id)).filter(beat=>beat?.area===area).at(-1);
    const outsider=lastLocal?.outsider?null:pool.find(beat=>beat.outsider);
    const beat=outsider||pool.find(beat=>!beat.outsider)||pool[0],attempt=(ambientAttempts.get(beat.id)||0)+1;
    ambientAttempts.set(beat.id,attempt);
    const id=`society:${beat.id}:instance:${instanceId}:attempt:${++ambientSerial}`;
    const lines=academicSocietyBeatLines(beat,state);
    pendingAmbient={id,beatId:beat.id,area:beat.area,lines:copy(lines),attempt,elapsed:0};
    events.push(spoken('social',id,lines,{beatId:beat.id,area:beat.area,attempt,outsider:beat.outsider===true,stateChanged:false}));
    return events;
  }
  function dialogue(actorId){return academicSocietyDialogue(actorId,state);}
  function beginDialogue(actorId){
    if(!BY_ID.has(actorId)||!present(actorId)||activeDialogue)return null;
    if(pendingAmbient)settleAmbient(pendingAmbient.id,{reason:'direct-conversation'});
    attention=null;activeDialogue=actorId;focusedActor=actorId;
    return dialogue(actorId);
  }
  function endDialogue(actorId,{completed=false,choices=[]}={}){
    if(activeDialogue!==actorId)return[];
    activeDialogue=null;quiet=T.quietBetween;performingKey=null;
    if(!completed||!inside)return[];
    state.met[actorId]++;
    const selected=Array.isArray(choices)?choices:[];
    for(const choice of selected){
      const key=typeof choice?.societyTopic==='string'?choice.societyTopic:'';
      const [who,topicId]=key.split(':');
      if(who===actorId&&TOPICS[actorId].includes(topicId)&&!state.topics[actorId].includes(topicId))state.topics[actorId].push(topicId);
    }
    const action=selected.map(choice=>choice?.societyAction).filter(value=>['lend','decline','withdraw'].includes(value)).at(-1);
    const events=[{type:'dialogue-complete',id:`society:met:${actorId}`,actorId,stateChanged:true}];
    if(action==='withdraw'&&['lucien','emile'].includes(actorId))return[...events,...release('withdraw')];
    if(!['lucien','emile'].includes(actorId)||state.consent!=='unasked')return events;
    if(action==='decline'){
      state.consent='declined';state.returnAcknowledged=false;
      events.push({type:'choice',id:'society:voice:declined',actorId,action,stateChanged:true});
    }
    if(action==='lend'&&actorId==='emile'){
      state.consent='lent';state.loanRemaining=T.loanSeconds;state.loanElapsed=0;state.loanPulses=1;state.returnAcknowledged=false;
      events.push(spoken('borrowed-voice','society:loan:1',academicSocietyLoanLines(0),{actorId,action,stateChanged:true}));
    }
    return events;
  }
  function actorFrame(context={}){
    // Door staff remain owned by their admission controller. Their actual
    // local positions let named residents look back and listen when addressed.
    const allActors=new Map([...ACTORS.filter(actor=>present(actor.id)),...(context.externalActors||[]).filter(actor=>
      actor&&typeof actor.id==='string'&&point(actor)&&actor.floor===10)].map(actor=>[actor.id,actor]));
    const p=point(context.listener)||listener;
    const focus=BY_ID.has(context.focusedActor)?context.focusedActor:focusedActor;
    const speaking=allActors.has(context.speakingActorId)?context.speakingActorId:null;
    const mouth=Object.hasOwn(context,'voiceActorId')
      ?(BY_ID.has(context.voiceActorId)?context.voiceActorId:null):speaking;
    const speakingLine=context.speakingLine&&typeof context.speakingLine==='object'?context.speakingLine:null;
    const actualLine=speaking&&speakingLine?.actorId===speaking?speakingLine:null;
    const source=allActors.get(speaking),addressed=allActors.get(actualLine?.toActorId);
    const localAddressee=source&&addressed&&addressed.id!==source.id&&distance(source,addressed)<=T.earshot?addressed:null;
    const clock=Number.isFinite(context.performanceTimeSec)?Math.max(0,context.performanceTimeSec):idleTime;
    const key=actualLine?lineKey(actualLine):null;
    // Developer preview clocks may restart between takes. They must not retain
    // an old gesture age or a half-turned body from the previous take.
    if(lastPerformanceTime!==null&&clock<lastPerformanceTime){performingKey=null;bodyYaws.clear();}
    if(key!==performingKey){performingKey=key;performanceStartedAt=clock;}
    const elapsedSec=key?Math.max(0,clock-performanceStartedAt):0;
    const delta=lastPerformanceTime===null?0:clamp(clock-lastPerformanceTime,0,T.maxTick);
    lastPerformanceTime=clock;
    return ACTORS.map((actor,index)=>{
      const talkingToPlayer=activeDialogue===actor.id;
      let gazeKey=restingGaze[actor.id]||'gallery';
      if(talkingToPlayer||(p&&focus===actor.id&&distance(p,actor)<4))gazeKey='player';
      if(!talkingToPlayer&&actualLine?.actorId===actor.id){
        const addressee=localAddressee;
        if(actualLine.toPlayer&&p)gazeKey='player';
        else if(addressee&&addressee.id!==actor.id&&distance(actor,addressee)<=T.earshot)gazeKey=addressee.id;
      }
      if(localAddressee?.id===actor.id)gazeKey=source.id;
      const watched=!!attention&&!activeDialogue&&!actualLine&&p
        &&attention.actorIds.includes(actor.id)&&academicSocietyArea(p)===attention.area&&distance(p,actor)<=T.earshot;
      if(watched)gazeKey='player';
      const target=gazeKey==='player'?p:allActors.get(gazeKey);
      const yaw=target&&distance(target,actor)>.05?Math.atan2(target.x-actor.x,-(target.y-actor.y)):actor.yaw;
      const previousYaw=bodyYaws.get(actor.id)??actor.yaw;
      const bodyYaw=Number.isFinite(context.performanceTimeSec)?previousYaw+clamp(wrapAngle(yaw-previousYaw),-delta*2.2,delta*2.2):yaw;
      bodyYaws.set(actor.id,bodyYaw);
      let performance=null;
      if(actualLine?.actorId===actor.id&&CUES.includes(actualLine.performanceCue))
        performance={key,cue:actualLine.performanceCue,role:'speaker',sourceActorId:actor.id,targetActorId:localAddressee?.id||null,elapsedSec};
      else if(localAddressee?.id===actor.id&&RESPONSES.includes(actualLine.responseCue))
        performance={key,cue:actualLine.responseCue,role:'listener',sourceActorId:source.id,targetActorId:actor.id,elapsedSec};
      if(!performance&&!talkingToPlayer&&(!speakingLine||actualLine)){
        const beatTime=(clock+index*3.7)%14;
        if(watched)performance={key:attention.id,cue:'guarded',role:'listener',sourceActorId:null,targetActorId:'player',elapsedSec:attention.elapsed};
        else if(beatTime<2.2&&allActors.has(gazeKey))performance={key:`company:${actor.id}:${Math.floor((clock+index*3.7)/14)}`,
          ambient:true,cue:index%2?'amused':'attend',role:'listener',sourceActorId:gazeKey,targetActorId:actor.id,elapsedSec:beatTime};
      }
      return{...actor,yaw,bodyYaw,visible:inside&&present(actor.id),socialAttention:watched,mode:mouth===actor.id?'speaking':performance?.role==='speaker'?'addressing':performance?.role==='listener'||talkingToPlayer?'listening':'idle',
        speaking:mouth===actor.id,talkingToPlayer,gazeKey,gazeAt:target?{x:target.x,y:target.y}:null,
        performance,idleTime,phase:clock+index*1.73};
    });
  }
  function load(next={}){
    state=createAcademicSocietyState(next);inside=false;firstTick=true;quiet=T.firstExchange;
    idleTime=0;listener=null;focusedActor=null;activeDialogue=null;
    performingKey=null;performanceStartedAt=0;lastPerformanceTime=null;bodyYaws.clear();
    pendingAmbient=null;attention=null;ambientAttempts.clear();activeActorIds=null;return save();
  }
  return Object.freeze({tick,dialogue,beginDialogue,endDialogue,actorFrame,save,load,settleAmbient,
    releaseVoiceOnDeparture:()=>release('leave'),
    view:()=>({...save(),inside,quiet,idleTime,activeDialogue,listener:listener?{...listener}:null,
      pendingAmbient:pendingAmbient?{id:pendingAmbient.id,beatId:pendingAmbient.beatId,area:pendingAmbient.area,attempt:pendingAmbient.attempt,elapsed:pendingAmbient.elapsed}:null,
      attention:attention?copy(attention):null})});
}
