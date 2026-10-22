import {ACADEMIC_BOUNCER_ACTORS as ACTORS,ACADEMIC_BOUNCER_CLUES as CLUES,
  ACADEMIC_BOUNCER_SPOKEN_CLUES as SPOKEN_CLUES,ACADEMIC_BOUNCER_CLUE_RECEIPT_IDS as CLUE_RECEIPT_IDS,
  ACADEMIC_BOUNCER_CUE as CUE,ACADEMIC_BOUNCER_TIMING as T,
  ACADEMIC_BOUNCER_EXCHANGE as EXCHANGE,ACADEMIC_BOUNCER_CLOSING as CLOSING,
  ACADEMIC_BOUNCER_RESPONSES as RESPONSES,ACADEMIC_BOUNCER_OPTIONS as OPTIONS,
} from '../data/academic-bouncers.js';
import {createAcademicBouncerSociety,createAcademicBouncerSocietyState} from './academic-bouncer-society.js';

export function createAcademicBouncerState(saved={}){
  const value=saved&&typeof saved==='object'?saved:{};
  return {version:2,admitted:value.admitted===true,
    clues:Object.fromEntries(CLUE_RECEIPT_IDS.map(id=>[id,value.clues?.[id]===true])),
    social:createAcademicBouncerSocietyState(value.social)};
}
export const serializeAcademicBouncers=createAcademicBouncerState;
const pathLength=path=>path.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-path[index].x,point.y-path[index].y),0);
function pointAlong(path,distance){
  let remaining=distance;
  for(let index=1;index<path.length;index++){
    const from=path[index-1],to=path[index],length=Math.hypot(to.x-from.x,to.y-from.y);
    if(remaining<length&&length>0){const amount=remaining/length;return{x:from.x+(to.x-from.x)*amount,y:from.y+(to.y-from.y)*amount,yaw:Math.atan2(to.x-from.x,-(to.y-from.y))};}
    remaining-=length;
  }
  return {...path[path.length-1]};
}
const maxAsideDistance=Math.max(...ACTORS.map(actor=>pathLength(actor.asidePath)));

// No wall clock, input ownership or global flags. Only a completed successful
// acknowledgment admits the visitor; even the correct interruption is pending.
export function createAcademicBouncers(saved={}){
  let state=createAcademicBouncerState(saved),attempt=null,timeSec=0,asideDistance=state.admitted?maxAsideDistance:0;
  const society=createAcademicBouncerSociety(state.social);
  let performanceKey=null,performanceStartedAt=0;
  let serial=0;
  const knowsPhrase=()=>[...CLUES,...SPOKEN_CLUES].some(clue=>clue.teachesPhrase&&state.clues[clue.id]);
  const save=()=>serializeAcademicBouncers({...state,social:society.save()});
  const options=()=>OPTIONS.filter(option=>!option.requiresPhrase||knowsPhrase()).map(option=>({...option}));
  function currentLine(){
    if(!attempt)return null;
    if(attempt.phase==='player')return attempt.selectedLine;
    const lines=attempt.phase==='exchange'?EXCHANGE:attempt.phase==='closing'?CLOSING:
      attempt.phase==='response'?RESPONSES[attempt.reason]:null;
    return lines?.[attempt.index]||null;
  }
  function attemptView(){
    if(!attempt)return null;
    const line=currentLine();
    return {...attempt,line,currentLine:line,lineKey:line?`${attempt.serial}:${attempt.phase}:${attempt.index}`:null,
      cue:CUE,window:attempt.phase==='window',correct:attempt.outcome==='success',options:options()};
  }
  function view(){return {...save(),knowsPhrase:knowsPhrase(),attempt:attemptView(),timeSec,asideProgress:asideDistance/maxAsideDistance};}
  function recordClue(clue,sourceId){
    const newlyLearned=!state.clues[clue.id];state.clues[clue.id]=true;
    return {...clue,sourceId,newlyLearned,stateChanged:newlyLearned,knowsPhrase:knowsPhrase()};
  }
  function learnFromProp(propId){
    if(typeof propId!=='string'||!propId)return null;
    const clue=CLUES.find(candidate=>candidate.propId===propId);
    return clue?recordClue(clue,propId):null;
  }
  function learnFromConversation(sourceId,{completed=false}={}){
    if(completed!==true||typeof sourceId!=='string')return null;
    const clue=SPOKEN_CLUES.find(candidate=>candidate.sourceId===sourceId);
    return clue?recordClue(clue,sourceId):null;
  }
  function beginAttempt(){
    if(state.admitted||attempt)return null;
    attempt={serial:++serial,phase:'exchange',index:0,remaining:T.windowSeconds,
      outcome:null,reason:null,lineStartedAt:timeSec};
    return attemptView();
  }
  function finishLine(){
    if(!attempt||!currentLine())return false;
    if(attempt.phase==='player'){
      attempt.phase='response';attempt.index=0;attempt.lineStartedAt=timeSec;return true;
    }
    const length=attempt.phase==='exchange'?EXCHANGE.length:attempt.phase==='closing'?CLOSING.length:RESPONSES[attempt.reason].length;
    if(++attempt.index>=length){
      if(attempt.phase==='exchange'){attempt.phase='window';attempt.index=0;attempt.remaining=T.windowSeconds;}
      else {attempt.phase='terminal';attempt.index=0;if(!attempt.outcome){attempt.outcome='failure';attempt.reason='late';}}
    }
    attempt.lineStartedAt=timeSec;return true;
  }
  function tick(dt,context={}){
    if(context.suspended||context.paused||context.hidden||context.focused===false)return view();
    const delta=Number.isFinite(dt)?Math.max(0,Math.min(T.maxTick,dt)):0;
    timeSec+=delta;
    if(state.admitted)asideDistance=Math.min(maxAsideDistance,asideDistance+delta*T.asideSpeed);
    if(attempt?.phase==='window'){
      attempt.remaining=Math.max(0,attempt.remaining-delta);
      if(attempt.remaining<=1e-9){attempt.remaining=0;attempt.phase='closing';attempt.index=0;attempt.lineStartedAt=timeSec;}
    }
    return view();
  }
  function interject(choiceId){
    if(!attempt||!['exchange','window','closing'].includes(attempt.phase))return false;
    const choice=options().find(option=>option.id===choiceId);if(!choice)return false;
    const reason=attempt.phase==='exchange'?'early':attempt.phase==='closing'?'late':choiceId==='guests'?'success':'phrase';
    attempt.phase='player';attempt.index=0;attempt.reason=reason;
    attempt.outcome=reason==='success'?'success':'failure';attempt.lineStartedAt=timeSec;
    attempt.selectedLine={who:'me',voiceSpeaker:'me',sourceLabel:'YOU',text:choice.text};
    return {accepted:reason==='success',reason,choice:{...choice}};
  }
  function acknowledge(){
    if(attempt?.phase!=='terminal')return false;
    const admitted=attempt.outcome==='success';attempt=null;
    if(admitted)state.admitted=true;
    return admitted;
  }
  function cancelAttempt(){const active=!!attempt;attempt=null;return active;}
  function actorFrame({speakingActorId=null,voiceActorId=null,speakingLine=null,actorTargets=[],
    timeSec:clock=timeSec,reducedMotion=false,placements=[]}={}){
    const line=currentLine()||speakingLine;
    const key=line?`${line.actorId}:${line.text}`:null;
    if(key!==performanceKey){performanceKey=key;performanceStartedAt=timeSec;}
    const elapsedSec=attempt?Math.max(0,timeSec-attempt.lineStartedAt):Math.max(0,timeSec-performanceStartedAt);
    const frames=ACTORS.map(actor=>{
      const placement=Array.isArray(placements)?placements.find(point=>point.id===actor.id):placements?.[actor.id];
      const base={...actor,...placement},path=base.asidePath||[{x:base.x,y:base.y}];
      const total=pathLength(path),distance=state.admitted?Math.min(total,asideDistance):0;
      const walking=state.admitted&&distance<total-1e-8;
      const pose=state.admitted?pointAlong(path,distance):{x:base.x,y:base.y};
      return {...base,...pose,yaw:walking?pose.yaw:base.yaw,bodyYaw:walking?pose.yaw:base.yaw,
        mode:walking?'walk':'idle',distance,speed:walking?T.asideSpeed:0};
    });
    const targets=new Map([...actorTargets,...frames].map(actor=>[actor.id,actor]));
    return frames.map((base,index)=>{
      const speaking=voiceActorId===base.id,engaged=(speakingActorId||line?.actorId)===base.id;
      const addressed=line?.toActorId===base.id;
      const target=targets.get(engaged?line?.toActorId:addressed?line?.actorId:null);
      const looksAt=base.mode!=='walk'&&target&&Math.hypot(target.x-base.x,target.y-base.y)<8;
      return {...base,...(looksAt?{yaw:Math.atan2(target.x-base.x,-(target.y-base.y)),
          gazeAt:{x:target.x,y:target.y},gazeKey:target.id}:{}),
        stance:state.admitted?'aside':'guard',phase:(Number.isFinite(clock)?clock:timeSec)+index*1.73,
        speaking,talkingToPlayer:!!attempt,performance:{role:engaged?'speaker':addressed||attempt?'listener':'idle',
          cue:engaged?(line?.performanceCue||'assure'):(line?.responseCue||'attend'),elapsedSec}};
    });
  }
  function load(next={}){state=createAcademicBouncerState(next);society.load(state.social);attempt=null;timeSec=0;
    performanceKey=null;performanceStartedAt=0;asideDistance=state.admitted?maxAsideDistance:0;return save();}
  return Object.freeze({save,load,view,learnFromProp,learnClue:learnFromProp,learnFromConversation,beginAttempt,finishLine,tick,
    interject,acknowledge,cancelAttempt,actorFrame,society});
}
