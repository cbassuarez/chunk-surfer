import {ACADEMIC_FLOOR_POPULATION} from '../data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../data/academic-society.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../data/academic-bouncers.js';

// A return means a real departure from the +10m floor, followed by re-entry.
// Render groups alone are insufficient: the main stair shares "academic"
// below the landing. No presentation clock, door count or meta return is used.
export const ACADEMIC_FLOOR_RETURN_TIMING=Object.freeze({awaySeconds:3,maxTick:.25,
  maxTravelPerSecond:8,positionSlack:1});
const T=ACADEMIC_FLOOR_RETURN_TIMING;
const bounded=(value,max=9999)=>Number.isFinite(Number(value))?Math.max(0,Math.min(max,Math.trunc(Number(value)))):0;
const stages=['gathering','reception-empty','gallery-empty','deserted'];
const cohort=(returnNumber,ids)=>ids.map(id=>[id,returnNumber]);
const DEPARTURE=new Map([
  ...cohort(1,['odette','agathe','academic-guest-landing','academic-guest-programme',
    'academic-guest-threshold','academic-guest-last-chair','academic-guest-hours',
    'academic-guest-late-light','academic-hollow-loggia']),
  ...cohort(2,['lucien','noe','academic-guest-window','academic-guest-fold',
    'academic-hollow-gallery','academic-hollow-west-bank','academic-hollow-east-bank',
    'academic-guest-interval','academic-guest-balcony','academic-guest-repeated-hour',
    'academic-hollow-corridor','academic-hollow-studio']),
  ...cohort(3,['celeste','emile','sabine','academic-guest-piano','academic-guest-turning-page',
    'academic-guest-second-bell','academic-guest-quiet-index','academic-guest-doorway',
    'academic-guest-hem','academic-guest-refrain','academic-hollow-return',
    'academic-bouncer-formal','academic-bouncer-dry']),
]);
const KNOWN=new Set([...ACADEMIC_FLOOR_POPULATION,...ACADEMIC_SOCIETY_ACTORS,...ACADEMIC_BOUNCER_ACTORS].map(actor=>actor.id));
const GUARD_IDS=new Set(ACADEMIC_BOUNCER_ACTORS.map(actor=>actor.id));
export const ACADEMIC_FLOOR_RETURN_COHORTS=Object.freeze([1,2,3].map(returns=>Object.freeze({
  returns,id:stages[returns],departedActorIds:Object.freeze([...DEPARTURE].filter(([,n])=>n<=returns).map(([id])=>id)),
})));
const point=value=>value&&[value.x,value.y,value.z].every(Number.isFinite)
  ?{x:value.x,y:value.y,z:value.z}:null;

export function normalizeAcademicFloorReturns(saved,{legacyVisited=false}={}){
  const value=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  const visits=bounded(value.visits)|| (legacyVisited?1:0);
  const returns=Math.min(bounded(value.returns,3),Math.max(0,visits-1));
  const presence=visits&&['inside','outside'].includes(value.presence)?value.presence:visits?'inside':'unvisited';
  const departureObserved=presence==='outside'&&value.departureObserved===true;
  const awaySeconds=departureObserved&&Number.isFinite(Number(value.awaySeconds))
    ?Math.max(0,Math.min(T.awaySeconds,Number(value.awaySeconds))):0;
  const returnArmed=presence==='outside'&&awaySeconds>=T.awaySeconds;
  const populationStage=visits?Math.min(3,returns+1,Math.max(returns,bounded(value.populationStage,3),returnArmed?returns+1:0)):0;
  return{version:1,visits,returns,populationStage,guardsDeparted:populationStage===3&&value.guardsDeparted===true,
    presence,departureObserved,awaySeconds,returnArmed};
}

// Uses the real physical observer, not authored coordinates or the render
// camera. The transition strip is neither inside nor away, so walking back and
// forth on the last tread cannot populate three returns.
export function academicFloorReturnRegion(observer){
  if(!observer||!Number.isFinite(observer.y))return{inside:false,away:false};
  const stair=!!observer.flightId||observer.spaceId==='main_stair';
  const inside=observer.renderGroup==='academic'&&!stair&&Math.abs(observer.y-10)<=.3;
  const away=!inside&&(observer.y<9.1||observer.y>10.9||observer.renderGroup==='academicRoof');
  return{inside,away};
}

export function academicFloorProtectedActorIds({admitted=false,consent,dialogueActorIds=[]}={}){
  const ids=new Set((Array.isArray(dialogueActorIds)?dialogueActorIds:[]).filter(id=>KNOWN.has(id)));
  if(!admitted)for(const actor of ACADEMIC_BOUNCER_ACTORS)ids.add(actor.id);
  // All seven residents are optional topic hubs; none grants a key or quest
  // flag. The sole live contract is the revocable voice loan. Leaving the
  // floor releases it in the society controller before the next return.
  if(consent==='lent')for(const id of ['emile','lucien','celeste'])ids.add(id);
  return ids;
}

export function academicFloorActorPresent(actorOrId,saved,{protectedActorIds=[]}={}){
  const id=typeof actorOrId==='string'?actorOrId:actorOrId?.id;
  const protectedIds=protectedActorIds instanceof Set?protectedActorIds:new Set(protectedActorIds);
  if(protectedIds.has(id))return true;
  if(GUARD_IDS.has(id)&&saved&&typeof saved==='object'&&saved.guardsDeparted!==true)return true;
  const returns=typeof saved==='number'?bounded(saved,3):bounded(saved?.populationStage??saved?.returns,3);
  // Unknown actors, fixed busts, Held Note and other classroom encounters are
  // outside this crowd policy. The dangerous late guest never has a departure.
  return !DEPARTURE.has(id)||returns<DEPARTURE.get(id);
}

export function createAcademicFloorReturns(saved,options={}){
  let state=normalizeAcademicFloorReturns(saved,options),priorPosition=null;
  const save=()=>({...state});
  function rebase(context={}){
    priorPosition=point(context.position);
    if(context.inside===true)state.presence=state.visits?'inside':'unvisited';
    else if(context.away===true)state.presence=state.visits?'outside':'unvisited';
    state.awaySeconds=0;state.returnArmed=false;state.departureObserved=false;
    return save();
  }
  function tick(dt,context={}){
    if(context.active!==true||context.paused||context.hidden||context.focused===false||context.suspended)return[];
    const delta=Number.isFinite(dt)?Math.max(0,Math.min(T.maxTick,dt)):0;
    const at=point(context.position);
    const jumped=at&&priorPosition&&Math.hypot(at.x-priorPosition.x,at.y-priorPosition.y,at.z-priorPosition.z)
      >T.positionSlack+T.maxTravelPerSecond*delta;
    if(context.debug===true||context.allowProgress===false||(jumped&&context.authorisedTraversal!==true)){rebase(context);return[];}
    priorPosition=at||priorPosition;
    if(context.inside===true){
      if(!state.visits){
        state={...state,visits:1,presence:'inside',departureObserved:false,awaySeconds:0,returnArmed:false};
        return[{type:'academic-floor-entered',id:'academic-floor:visit:1',stateChanged:true,stageChanged:false}];
      }
      const returned=state.presence==='outside'&&state.returnArmed;
      if(returned){state.visits=Math.min(9999,state.visits+1);state.returns=Math.min(3,state.returns+1);}
      state.presence='inside';state.departureObserved=false;state.awaySeconds=0;state.returnArmed=false;
      return returned?[{type:'academic-floor-returned',id:`academic-floor:visit:${state.visits}`,
        returns:state.returns,stage:stages[state.populationStage],stateChanged:true,stageChanged:false}]:[];
    }
    if(context.away===true&&state.visits){
      if(state.presence!=='outside'){state.presence='outside';state.departureObserved=true;}
      if(!state.departureObserved)return[];
      state.awaySeconds=Math.min(T.awaySeconds,state.awaySeconds+delta);
      state.returnArmed=state.awaySeconds+1e-8>=T.awaySeconds;
      if(state.returnArmed)state.awaySeconds=T.awaySeconds;
      const nextStage=Math.min(3,state.returns+1);
      const stageChanged=state.returnArmed&&state.populationStage<nextStage;
      const guardsLeave=state.returnArmed&&nextStage===3&&context.admitted===true&&!state.guardsDeparted;
      if(stageChanged||guardsLeave){
        state.populationStage=nextStage;if(guardsLeave)state.guardsDeparted=true;
        return[{type:'academic-floor-emptied',id:`academic-floor:absence:${state.visits}`,
          returns:state.returns,stage:stages[nextStage],stateChanged:true,stageChanged,populationChanged:true}];
      }
    }
    return[];
  }
  return Object.freeze({tick,rebase,save,
    load(value,loadOptions=options){state=normalizeAcademicFloorReturns(value,loadOptions);priorPosition=null;return save();},
    view:()=>({...save(),stage:stages[state.populationStage]})});
}
