// Physical door presentation policy. It observes the existing runtime without
// changing its state, timing, collision or controls. Fractions are copied:
// floorplan portals and their runtime objects are intentionally mutable.
export const LYRIC_BELL_DOORS=Object.freeze(['pub-west-entry','pub-east-entry']);
export const DOOR_BELL_FRACTION=.12;
const EPS=1e-6;
const phases=new Set(['closed','opening','open','closing']);
const movingPhase=phase=>phase==='opening'||phase==='closing';
const stablePhase=phase=>phase==='closed'||phase==='open';
const clamp01=value=>Math.max(0,Math.min(1,value));

function read(portal){
  if(!portal||typeof portal.id!=='string'||!portal.id)return null;
  const runtime=portal.runtime&&typeof portal.runtime==='object'?portal.runtime:null;
  const phase=runtime?.state??portal.state;
  const fraction=Number(runtime?.openFraction??portal.openFraction);
  if(!phases.has(phase)||!Number.isFinite(fraction))return null;
  return{portal,runtime,phase,fraction:clamp01(fraction)};
}

// Feed complete current portal snapshots. prime() only seeds unknown IDs, so a
// repeated pre-action prime cannot disarm a bell during an unfinished opening.
// reset()+prime() is the explicit world/run lifecycle handoff. Real floorplan
// runtime-object replacement is also recognised as a silent restore; callers
// supplying value snapshots must use that explicit reset for save restoration.
export function createDoorAudioEventPolicy({bellDoorIds=LYRIC_BELL_DOORS,bellFraction=DOOR_BELL_FRACTION}={}){
  const bells=new Set(bellDoorIds);
  const threshold=Number.isFinite(Number(bellFraction))?Math.max(.01,Math.min(.95,Number(bellFraction))):DOOR_BELL_FRACTION;
  const history=new Map();
  const seed=next=>({...next,moving:false,direction:0,bellArmed:next.phase==='closed'&&next.fraction<=EPS});
  function prime(portals=[]){
    for(const portal of portals){const next=read(portal);if(next&&!history.has(portal.id))history.set(portal.id,seed(next));}
  }
  function observe(portals=[],dt=0){
    const elapsed=Number.isFinite(Number(dt))?Math.max(0,Number(dt)):0;
    const events=[],seen=new Set();
    function push(type,next,previous,extra={}){
      const delta=next.fraction-previous.fraction;
      events.push({type,doorId:next.portal.id,portal:next.portal,phase:next.phase,
        fraction:next.fraction,openFraction:next.fraction,previousFraction:previous.fraction,delta,
        // Speed is fractional openness per second, not force. A pre-action
        // zero-dt observation cannot manufacture velocity or an impact.
        speed:elapsed>0?Math.abs(delta)/elapsed:0,
        direction:Math.abs(delta)>EPS?Math.sign(delta):0,moving:false,
        semanticKind:type==='opening-start'?'door_open':type==='closed'?'door_close':null,
        ...extra});
    }
    for(const portal of portals){
      const next=read(portal);if(!next||seen.has(portal.id))continue;seen.add(portal.id);
      const previous=history.get(portal.id);
      if(!previous){history.set(portal.id,seed(next));continue;}
      if(next.runtime&&previous.runtime&&next.runtime!==previous.runtime){
        // A load replaces runtime objects even if it lands at the endpoint of
        // an interrupted close. This is a control stop, never a catch/slam.
        push('movement-stop',next,previous,{reason:'runtime-replaced',baselineReset:true});
        history.set(portal.id,seed(next));continue;
      }
      if(stablePhase(previous.phase)&&stablePhase(next.phase)&&previous.phase!==next.phase){
        // Direct endpoint setters/warps are not a performed physical swing.
        history.set(portal.id,seed(next));continue;
      }
      const delta=next.fraction-previous.fraction;
      const openingTravel=delta>EPS&&(next.phase==='opening'||(previous.phase==='opening'&&next.phase==='open'));
      const closingTravel=delta< -EPS&&(next.phase==='closing'||(previous.phase==='closing'&&next.phase==='closed'));
      const travelled=openingTravel||closingTravel;
      const direction=travelled?Math.sign(delta):0;
      const phaseChanged=previous.phase!==next.phase;
      let bellArmed=previous.bellArmed;
      if(next.phase==='opening'&&previous.phase!=='opening'){
        push('opening-start',next,previous,{fromClosed:previous.phase==='closed'&&previous.fraction<=EPS});
      }
      if(next.phase==='closing'&&previous.phase!=='closing')push('closing-start',next,previous);
      if(travelled)push('movement',next,previous,{moving:true,started:!previous.moving||previous.direction!==direction});
      if(bells.has(portal.id)&&bellArmed&&openingTravel&&previous.fraction<threshold&&next.fraction>=threshold){
        push('bell',next,previous,{threshold});bellArmed=false;
      }
      const opened=previous.phase==='opening'&&next.phase==='open'&&next.fraction>=1-EPS;
      const closed=previous.phase==='closing'&&next.phase==='closed'&&next.fraction<=EPS;
      if(opened)push('opened',next,previous);
      if(closed)push('closed',next,previous);
      if(next.phase==='closed'&&next.fraction<=EPS)bellArmed=true;
      // pump(0) before a tick sees the same moving leaf. It must not stop the
      // travel voice. Only elapsed time without travel establishes a hold.
      const carriedMotion=!phaseChanged&&elapsed===0&&previous.moving&&movingPhase(next.phase);
      const moving=(travelled&&movingPhase(next.phase))||carriedMotion;
      if((previous.moving||travelled)&&!moving){
        push('movement-stop',next,previous,{reason:closed?'closed':opened?'opened':phaseChanged?'reversed':'held'});
      }
      history.set(portal.id,{...next,moving,direction:travelled?direction:carriedMotion?previous.direction:0,bellArmed});
    }
    for(const[id,previous]of history){
      if(seen.has(id))continue;
      if(previous.moving)push('movement-stop',previous,previous,{reason:'removed'});
      history.delete(id);
    }
    return events;
  }
  // Audio can be held while a scene owns the world, without restoring the
  // door or forgetting a pending/already-struck bell. Its next real delta is
  // a fresh movement start; no one-shot or semantic event is manufactured.
  function hold(){
    for(const previous of history.values()){previous.moving=false;previous.direction=0;}
  }
  return{prime,observe,hold,reset(){history.clear();},snapshot:()=>[...history].map(([doorId,s])=>({doorId,phase:s.phase,fraction:s.fraction,moving:s.moving,bellArmed:s.bellArmed}))};
}
