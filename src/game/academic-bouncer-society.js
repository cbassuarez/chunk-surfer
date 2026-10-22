import {ACADEMIC_BOUNCER_SOCIAL_BEATS as BEATS,ACADEMIC_BOUNCER_SOCIAL_TOPICS as TOPICS,
  ACADEMIC_BOUNCER_SOCIAL_TIMING as T,academicBouncerSocialBeatLines,academicBouncerSocialDialogue,
} from '../data/academic-bouncer-society.js';

const BEAT_IDS=new Set(BEATS.map(beat=>beat.id)),TOPIC_IDS=new Set(TOPICS);
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(9999,Math.trunc(Number(value)))):0;
const unique=(value,allowed)=>Array.isArray(value)?[...new Set(value.filter(id=>allowed.has(id)))]:[];
export function createAcademicBouncerSocietyState(saved={}){
  const value=saved&&typeof saved==='object'?saved:{};
  return{version:1,conversations:count(value.conversations),topics:unique(value.topics,TOPIC_IDS),
    visitId:count(value.visitId),issuedBeatIds:unique(value.issuedBeatIds,BEAT_IDS),
    visitBeatIds:unique(value.visitBeatIds,BEAT_IDS)};
}

// The adapter proves every speaker is physically local and unobstructed before
// supplying audibleBeatIds, and leases the resulting chain to that same area.
// There is no default that lets an omitted or stale listener hear the floor.
export function createAcademicBouncerSociety(saved={}){
  let state=createAcademicBouncerSocietyState(saved),quiet=T.firstExchange,activeDialogue=false;
  const save=()=>createAcademicBouncerSocietyState(state);
  function tick(dt,context={}){
    if(context.suspended||context.paused||context.hidden||context.focused===false)return[];
    const events=[];
    if(Number.isFinite(context.visitId)&&count(context.visitId)!==state.visitId){
      state.visitId=count(context.visitId);state.visitBeatIds=[];quiet=T.firstExchange;
      events.push({type:'visit',id:`bouncer-society:visit:${state.visitId}`,stateChanged:true});
    }
    if(!context.present||context.speechBusy||activeDialogue)return events;
    const delta=Number.isFinite(dt)?Math.max(0,Math.min(T.maxTick,dt)):0;
    quiet=Math.max(0,quiet-delta);if(quiet>0)return events;
    const audible=new Set(Array.isArray(context.audibleBeatIds)?context.audibleBeatIds:[]);
    const admission=context.admitted===true?'after':'before';
    const eligible=BEATS.filter(beat=>beat.admission===admission&&audible.has(beat.id)&&!state.visitBeatIds.includes(beat.id));
    if(!eligible.length)return events;
    const selected=eligible.find(beat=>!state.issuedBeatIds.includes(beat.id))||eligible[0];
    if(!state.issuedBeatIds.includes(selected.id))state.issuedBeatIds.push(selected.id);
    state.visitBeatIds.push(selected.id);quiet=T.quietBetween;
    events.push({type:'social',id:`bouncer-society:${selected.id}`,beatId:selected.id,
      area:selected.area,lines:academicBouncerSocialBeatLines(selected,state),stateChanged:true});
    return events;
  }
  function beginDialogue({societyState={}}={}){
    if(activeDialogue)return null;
    activeDialogue=true;
    return academicBouncerSocialDialogue(save(),{societyState});
  }
  function endDialogue({completed=false,choices=[]}={}){
    if(!activeDialogue)return[];
    activeDialogue=false;quiet=T.quietBetween;
    if(!completed)return[];
    const selected=Array.isArray(choices)?choices:[];
    for(const choice of selected){const id=choice?.bouncerTopic;if(TOPIC_IDS.has(id)&&!state.topics.includes(id))state.topics.push(id);}
    state.conversations=Math.min(9999,state.conversations+1);
    return[{type:'dialogue-complete',id:`bouncer-society:conversation:${state.conversations}`,stateChanged:true}];
  }
  function load(next={}){state=createAcademicBouncerSocietyState(next);quiet=T.firstExchange;activeDialogue=false;return save();}
  function defer(seconds=T.quietBetween){if(Number.isFinite(seconds))quiet=Math.max(quiet,Math.max(0,seconds));}
  return Object.freeze({tick,beginDialogue,endDialogue,save,load,defer,
    view:()=>({...save(),quiet,activeDialogue})});
}
