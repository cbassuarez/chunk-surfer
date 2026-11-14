// A click is a small mechanical impulse in an occupied room, not a light cue.
// Feed only ticks whose audible absolute time has arrived. The host supplies
// actual distance/door/space transmission; this module does not invent a second
// acoustic model, touch collisions, add sound, or decide a puzzle outcome.
import {PRACTICE_METRONOMES,METRONOME_TAKE,createMetronomeCoincidenceAccumulator} from './practice-metronomes.js';

export const PRACTICE_METRONOME_RESONANCE=Object.freeze({
  coincidenceSeconds:METRONOME_TAKE.coincidentSeconds,
  caseMaximumM:.00018,surfaceMaximumM:.00065,nearbyMaximumM:.0009,
  impulseSeconds:2.5,coherenceSeconds:1.4,insistenceSeconds:5.5,
  // The slowest allowed clock ticks every1.5s. Absence after that interval
  // releases the response; a stopped clock never sustains an artificial hum.
  coherenceHoldSeconds:1.65,historySeconds:60,gripDamping:32,reducedMotionScale:.22,
});
const C=PRACTICE_METRONOME_RESONANCE,TAU=2*Math.PI;
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const unit=n=>Math.max(0,Math.min(1,finite(n)));
const indexOf=voice=>Number.isInteger(voice?.index)&&voice.index>=0&&voice.index<PRACTICE_METRONOMES.length
  ?voice.index:PRACTICE_METRONOMES.findIndex(item=>item.id===voice?.id);
const identity=index=>({index,id:PRACTICE_METRONOMES[index].id});
const zero=()=>[0,0,0];

// A two-stage response to sustained phase coincidence. This exact solution
// makes insistence independent of render rate or how audible ticks were batched.
function evolve(state,to){
  const dt=Math.max(0,to-state.at);if(!dt)return;
  const c=state.coherence-state.target,i=state.insistence-state.target;
  const ec=Math.exp(-dt/C.coherenceSeconds),ei=Math.exp(-dt/C.insistenceSeconds);
  state.coherence=state.target+c*ec;
  state.insistence=state.target+i*ei+c*C.coherenceSeconds/(C.coherenceSeconds-C.insistenceSeconds)*(ec-ei);
  state.at=to;
}
function advanceEnvelope(state,to){
  if(state.expires<=to&&state.expires>state.at){evolve(state,state.expires);state.target=0;state.expires=-Infinity;}
  evolve(state,to);return state;
}
const envelopeAt=at=>({at,coherence:0,insistence:0,target:0,expires:-Infinity});
function boundedVector(values,cap,scale){
  const softened=values.map(n=>Math.tanh(n)),length=Math.hypot(...softened);
  if(!length)return zero();
  const factor=cap*scale/Math.max(1,length);return softened.map(n=>n*factor);
}
function carrier(age,hz,decay){
  if(age<0||age>C.impulseSeconds)return 0;
  // Starts at zero displacement; an event never teleports the object.
  return(1-Math.exp(-age/.006))*Math.exp(-age/decay)*Math.sin(TAU*hz*age);
}

/**
 * sample({now,ticks,voices,reducedMotion}) -> {coherence,insistence,voices}.
 *
 * `now` and tick.at use one absolute audible clock, in seconds. ticks contain
 * {index,at}; optional tick.transmission captures propagation at that instant.
 * voices contain {index|id,transmission,running,stopped,held}; transmission is
 * the host's measured0..1 door/distance/space coupling, independent of UI focus.
 * Same-rate/different-phase clocks remain different: no tempo or target-BPM
 * input participates in this response. Completed25ms clusters own coherence.
 *
 * Each voice returns caseOffset, surfaceOffset, nearbyOffset in local metres.
 * Apply only visual transforms to the existing casing, support and light loose
 * objects (rosin tin, pages, mallets); retain authored colliders and lights.
 * Held/stopped clocks accept no new impulses after contact, but existing wood
 * and loose-object motion rings down. A grip damps the casing more quickly.
 */
export function createPracticeMetronomeResonance({coincidenceSeconds=C.coincidenceSeconds}={}){
  const window=Math.max(0,finite(coincidenceSeconds,C.coincidenceSeconds));
  const clusters=createMetronomeCoincidenceAccumulator({windowSeconds:window});
  let lastNow=null,checkpoint=null,changes=[],pulses=[],lastTick,contacts;
  const initialize=()=>{
    lastTick=PRACTICE_METRONOMES.map(()=>-Infinity);
    contacts=PRACTICE_METRONOMES.map(()=>({initialized:false,blocked:false,blockedAt:Infinity,held:false,heldAt:null,holds:[]}));
  };
  function reset(now=null){
    clusters.clear();changes=[];pulses=[];lastNow=Number.isFinite(now)?now:null;
    checkpoint=lastNow==null?null:envelopeAt(lastNow);initialize();
  }
  initialize();
  function consumeChanges(state,rows,to){
    for(const row of rows){if(row.at>to)break;advanceEnvelope(state,row.at);state.target=row.target;state.expires=row.at+C.coherenceHoldSeconds;}
    return advanceEnvelope(state,to);
  }
  function gripDamping(index,from,to){
    const contact=contacts[index];let duration=0;
    for(const hold of contact.holds)duration+=Math.max(0,Math.min(to,hold.to)-Math.max(from,hold.from));
    if(contact.held)duration+=Math.max(0,to-Math.max(from,contact.heldAt));
    return Math.exp(-duration*C.gripDamping);
  }
  return{
    reset,
    sample({now=lastNow??0,ticks=[],voices=[],reducedMotion=false}={}){
      const at=finite(now,lastNow??0);if(lastNow!=null&&at<lastNow)reset(at);
      const byIndex=new Map(voices.map(voice=>[indexOf(voice),voice]));
      for(let index=0;index<PRACTICE_METRONOMES.length;index++){
        const voice=byIndex.get(index)||{},contact=contacts[index];
        const blocked=voice.running===false||voice.stopped===true||voice.held===true,held=voice.held===true;
        if(!contact.initialized){
          contact.initialized=true;contact.blocked=blocked;contact.blockedAt=blocked?-Infinity:Infinity;
          contact.held=held;contact.heldAt=held?-Infinity:null;
        }else{
          if(blocked&&!contact.blocked)contact.blockedAt=at;
          else if(!blocked)contact.blockedAt=Infinity;
          if(held&&!contact.held)contact.heldAt=at;
          if(!held&&contact.held){contact.holds.push({from:contact.heldAt,to:at});contact.heldAt=null;}
          contact.blocked=blocked;contact.held=held;
        }
        contact.holds=contact.holds.filter(hold=>hold.to>=at-C.impulseSeconds);
      }
      const heard=[];
      for(const tick of ticks.slice().sort((a,b)=>finite(a?.at)-finite(b?.at))){
        const index=indexOf(tick),when=finite(tick?.at,NaN);if(index<0||!Number.isFinite(when)||when>at+1e-9||when<at-C.impulseSeconds||when<=lastTick[index])continue;
        const voice=byIndex.get(index)||{},contact=contacts[index];
        lastTick[index]=when;
        if(contact.blocked&&when>=contact.blockedAt)continue;
        const strength=unit(tick.transmission??voice.transmission);
        if(!strength)continue;
        pulses.push({index,at:when,strength});heard.push({index,at:when,level:strength});
      }
      const completed=clusters.push(heard,at);
      for(const group of completed){
        const distinct=[...new Map(group.ticks.map(tick=>[tick.index,tick])).values()];
        const spread=distinct.length>1?Math.max(...distinct.map(tick=>tick.at))-Math.min(...distinct.map(tick=>tick.at)):0;
        const alignment=window>0?1-.5*Math.min(1,spread/window):1;
        const transmission=Math.sqrt(distinct.reduce((sum,tick)=>sum+tick.level*tick.level,0)/distinct.length);
        changes.push({at:group.at+window,target:unit((distinct.length-1)/(PRACTICE_METRONOMES.length-1)*alignment*transmission)});
      }
      changes.sort((a,b)=>a.at-b.at);
      if(!checkpoint)checkpoint=envelopeAt(Math.min(at,changes[0]?.at??at));
      // Retain a bounded rewind window for late frame delivery. Fold older
      // events analytically rather than restarting a sixty-second ramp.
      const cutoff=at-C.historySeconds;
      if(cutoff>checkpoint.at){
        checkpoint=consumeChanges({...checkpoint},changes.filter(row=>row.at<=cutoff),cutoff);
        changes=changes.filter(row=>row.at>cutoff);
      }
      changes=changes.filter(row=>row.at>=checkpoint.at);
      const envelope=consumeChanges({...checkpoint},changes,at),insistence=unit(envelope.insistence),scale=reducedMotion?C.reducedMotionScale:1;
      pulses=pulses.filter(pulse=>pulse.at>=at-C.impulseSeconds);
      const responses=PRACTICE_METRONOMES.map((_,index)=>{
        let casing=0,surface=0,nearby=0,energy=0;
        for(const pulse of pulses)if(pulse.index===index){
          const age=at-pulse.at,power=pulse.strength;
          casing+=power*carrier(age,12,.085)*gripDamping(index,pulse.at,at);
          surface+=power*carrier(age-.008,8.5,.16);
          nearby+=power*carrier(age-.016,5.5,.25);
          energy+=power*Math.exp(-age/.23);
        }
        const insist=1+.55*insistence;
        return{...identity(index),energy:unit(Math.tanh(energy)),
          caseOffset:boundedVector([casing*.48*insist,casing*.08*insist,casing*.16*insist],C.caseMaximumM,scale),
          surfaceOffset:boundedVector([surface*.12*insist,surface*.48*insist,surface*.08*insist],C.surfaceMaximumM,scale),
          nearbyOffset:boundedVector([nearby*.15*insist,nearby*.58*insist,nearby*.10*insist],C.nearbyMaximumM,scale)};
      });
      lastNow=at;return{coherence:unit(envelope.coherence),insistence,voices:responses};
    },
  };
}
