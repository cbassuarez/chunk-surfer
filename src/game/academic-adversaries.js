import {ACADEMIC_ADVERSARY_TIMING as T,ACADEMIC_ADVERSARY_CUES as CUES,
  ACADEMIC_ADVERSARY_COMPOSURE_COST,ACADEMIC_HELD_GEOMETRY,
  academicHeldPoint,academicHeldInside,academicHeldLocal,ACADEMIC_HELD_CHAMBER,
  academicHeldContactTime,academicHeldCrossing,academicHeldFrame,academicHeldCue,academicHeldStrikeActive,
} from '../data/academic-adversaries.js';

const OUTCOMES=new Set(['clean','struck','legacy-spent']);
const COUNTERS=['approaches','demonstrations','warnings','strikes','aborts','suspensions'];
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(9999,Math.trunc(Number(value)))):0;
export function createAcademicAdversariesState(saved={}, {legacyHeldComplete=false}={}){
  const value=saved&&typeof saved==='object'?saved:{};
  const currentUnresolved=value.version===1&&value.outcome===null;
  const outcome=OUTCOMES.has(value.outcome)?value.outcome:legacyHeldComplete&&!currentUnresolved?'legacy-spent':null;
  return{version:1,outcome,demonstrated:outcome!==null||value.demonstrated===true,
    counters:Object.fromEntries(COUNTERS.map(key=>[key,count(value.counters?.[key])]))};
}

// Harmful phases are advanced only by a live, explicitly ready/aware adapter.
// The adapter owns actual native focus, exclusive captions/audio and atomic
// persistence of the returned resolved event together with the recordist.
export function createAcademicAdversaries(saved={}, {legacyHeldComplete=false,geometry=ACADEMIC_HELD_GEOMETRY}={}){
  let state=createAcademicAdversariesState(saved,{legacyHeldComplete});
  let phase=state.outcome?'done':'dormant',elapsed=0,lureIndex=0,priorPlayer=null,poseTime=0;
  let readyNow=false,awareNow=false;
  let warningComplete=false,suspendedPhase=null,suspendedElapsed=0,suspendedFrom=null,warningFrom=null,withdrawFrom=null;
  const save=()=>createAcademicAdversariesState(state);
  const view=()=>({...save(),phase,elapsed,lureIndex,poseTime,ready:readyNow,aware:awareNow,suspended:phase==='suspended',warningComplete,suspendedPhase,
    warningFrom:warningFrom?structuredClone(warningFrom):null,
    withdrawFrom:withdrawFrom?structuredClone(withdrawFrom):null,
    suspendedFrom:suspendedFrom?structuredClone(suspendedFrom):null,
    threatActive:phase==='strike'&&warningComplete&&academicHeldStrikeActive(elapsed,geometry),
    cue:academicHeldCue({phase,elapsed})});
  const frame=()=>academicHeldFrame(view(),geometry);
  const bump=key=>{state.counters[key]=Math.min(9999,state.counters[key]+1);};
  function cue(id,events,extra={}){
    const data=CUES[id]||{};
    events.push({type:'cue',id:`academic-held:${id}`,cue:id,...data,
      at:data.at?{...data.at}:geometry?.cueAt?{...geometry.cueAt}:null,...extra});
  }
  function enter(next){phase=next;elapsed=0;}
  function startWarning(events){
    warningFrom=frame();warningComplete=false;suspendedPhase=null;suspendedFrom=null;enter('warning');bump('warnings');
    cue('warning',events,{exclusive:true,stateChanged:true});
  }
  function abort(events){
    if(!['done','dormant'].includes(phase)){
      bump('aborts');events.push({type:'stop',id:'academic-held:abort',reason:'left-local-area',stateChanged:true});
    }
    enter(state.outcome?'done':'dormant');warningComplete=false;suspendedPhase=null;suspendedFrom=null;suspendedElapsed=0;priorPlayer=null;
    warningFrom=null;withdrawFrom=null;
  }
  function suspend(events,reason){
    if(phase==='suspended'||['dormant','done','withdraw'].includes(phase))return;
    suspendedFrom=frame();suspendedElapsed=elapsed;suspendedPhase=phase;warningComplete=false;enter('suspended');bump('suspensions');
    events.push({type:'stop',id:'academic-held:suspend',reason,stateChanged:true});
  }
  function resolve(outcome,events){
    if(state.outcome)return;
    withdrawFrom=frame();state.outcome=outcome;state.demonstrated=true;warningComplete=false;enter('withdraw');
    cue(outcome,events,{exclusive:true});
    events.push({type:'resolved',id:`academic-held:resolved:${outcome}`,outcome,
      composureCost:outcome==='struck'?ACADEMIC_ADVERSARY_COMPOSURE_COST:0,stateChanged:true});
  }
  function contact(from,to,fromElapsed,toElapsed){
    if(typeof geometry?.contact==='function'){
      const hit=geometry.contact(from,to,fromElapsed,toElapsed);
      return hit===true?toElapsed:Number.isFinite(hit)&&hit>=fromElapsed&&hit<=toElapsed?hit:null;
    }
    return academicHeldContactTime(from,to,fromElapsed,toElapsed,geometry);
  }
  function crossing(from,to){
    if(typeof geometry?.crossing==='function')return geometry.crossing(from,to)===true;
    return academicHeldCrossing(from,to,geometry?.crossingGate);
  }
  function tick(dt,context={}){
    const events=[],player=academicHeldPoint(context.player),delta=Number.isFinite(dt)?Math.max(0,Math.min(T.maxTick,dt)):0;
    const interrupted=context.suspended||context.paused||context.hidden||context.focused===false||context.nativeFocused===false
      ||context.speechBusy||context.hushBusy||context.loanBusy;
    const ready=context.ready===true&&geometry?.ready===true;
    const aware=context.aware===true;
    readyNow=ready;awareNow=aware;
    if(state.outcome){
      if(phase==='withdraw'&&!interrupted&&ready){
        elapsed+=delta;if(elapsed>=T.withdraw)enter('done');
      }
      priorPlayer=player;return events;
    }
    if(context.group!=='academic'||!player||!academicHeldLocal(player)||context.local===false){abort(events);return events;}
    const previous=priorPlayer||player;priorPlayer=player;
    if(interrupted||!ready){suspend(events,interrupted?'presentation-busy':'not-ready');return events;}
    if(phase==='suspended'){
      const before=suspendedPhase;
      if(!aware)return events;
      if(['lure','reveal','demonstration'].includes(before)&&!state.demonstrated){
        phase=before;elapsed=suspendedElapsed;suspendedPhase=null;suspendedFrom=null;
        if(phase==='reveal')cue('reveal',events);
        else if(phase==='demonstration')cue('demonstration',events,{exclusive:true});
      }else startWarning(events);
      return events;
    }
    if(phase==='dormant'){
      if(state.demonstrated){if(aware){bump('approaches');startWarning(events);}return events;}
      bump('approaches');
      if(academicHeldInside(player,ACADEMIC_HELD_CHAMBER)){enter('reveal');cue('reveal',events,{stateChanged:true});}
      else{enter('lure');cue('lure-studio',events,{stateChanged:true});}
      return events;
    }
    if(phase==='lure'){
      const before=Math.floor((elapsed+1e-9)/T.lureCadence);elapsed+=delta;
      if(Math.floor((elapsed+1e-9)/T.lureCadence)>before){lureIndex++;cue(lureIndex%2?'lure-chamber':'lure-studio',events);}
      if(academicHeldInside(player,ACADEMIC_HELD_CHAMBER)){enter('reveal');cue('reveal',events);}
      return events;
    }
    if(phase==='reveal'||phase==='demonstration'){
      if(!aware)return events;
      poseTime+=delta;
      elapsed+=delta;
      if(phase==='reveal'&&elapsed>=T.reveal&&academicHeldInside(player,ACADEMIC_HELD_CHAMBER)
        &&Math.hypot(player.x-8.5,player.y-244.5)<6.2){enter('demonstration');cue('demonstration',events,{exclusive:true});}
      else if(phase==='demonstration'&&elapsed>=T.demonstration){
        state.demonstrated=true;bump('demonstrations');startWarning(events);
      }
      return events;
    }
    if(!aware){
      // A fixed update may run again before the just-entered phase is first
      // painted. Spend neither time nor contact until that actual receipt.
      // Losing awareness after live progress instead revokes the warning.
      if(elapsed===0&&['warning','strike','rest'].includes(phase))return events;
      suspend(events,'warning-not-perceived');return events;
    }
    poseTime+=delta;
    if(phase==='warning'){
      elapsed+=delta;
      if(elapsed+1e-9>=T.warning){warningComplete=true;enter('strike');bump('strikes');cue('strike',events,{exclusive:true,stateChanged:true});}
    }else if(phase==='strike'){
      // No contact on the warning-to-strike transition frame: the strike cue
      // becomes visible before this fresh player segment can incur a cost.
      const hit=delta>0&&warningComplete?contact(previous,player,elapsed,elapsed+delta):null;
      if(hit!==null){poseTime-=elapsed+delta-hit;elapsed=hit;resolve('struck',events);}
      else{elapsed+=delta;if(elapsed+1e-9>=T.strike){enter('rest');warningComplete=false;cue('rest',events,{exclusive:true});}}
    }else if(phase==='rest'){
      if(delta>0&&crossing(previous,player))resolve('clean',events);
      else{elapsed+=delta;if(elapsed+1e-9>=T.rest)startWarning(events);}
    }
    return events;
  }
  function load(next={},options={}){
    state=createAcademicAdversariesState(next,{legacyHeldComplete:options.legacyHeldComplete===undefined?legacyHeldComplete:options.legacyHeldComplete===true});
    enter(state.outcome?'done':'dormant');lureIndex=0;priorPlayer=null;poseTime=0;readyNow=false;awareNow=false;warningComplete=false;
    suspendedPhase=null;suspendedFrom=null;suspendedElapsed=0;warningFrom=null;withdrawFrom=null;return save();
  }
  return Object.freeze({tick,save,load,view,frame});
}

export {academicHeldFrame};
