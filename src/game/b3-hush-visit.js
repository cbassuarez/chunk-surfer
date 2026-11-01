// A bounded ordinary-HUSH visit during the B3 speaker disturbance. The only
// information supplied to the body is the heard speaker transmission and a
// real closing door: it never follows a viewer or teleports an active actor.
// Coordinates are runtime half-metre cells on the unchanged basement plan.
export const B3_HUSH_VISIT = Object.freeze({
  bleed: Object.freeze({x:35,y:23}), // live-room face of the control glass
  entranceY:38,
  corridorY:42,
  room5Door:'room5-corridor', // Room 5 latch, across the service corridor
  // Chosen behind the south wall, out of the control-booth window's sight.
  spawnCandidates:Object.freeze([{x:31,y:40},{x:31,y:41},{x:31,y:42}].map(Object.freeze)),
  pulseSeconds:2.0,
  insideHoldSeconds:2,
  doorMemorySeconds:35,
  exitWaypoint:Object.freeze({x:31,y:42}),
  visitLimitSeconds:90,
});

const finitePoint=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const inLiveRoom=p=>finitePoint(p)&&p.x>=10&&p.x<36&&p.y>=10&&p.y<B3_HUSH_VISIT.entranceY;
const inCorridor=p=>finitePoint(p)&&p.y>=B3_HUSH_VISIT.corridorY;

/**
 * Integration owns production audio and door callbacks. emitBleed represents
 * the same audible booth monitor signal transmitted through the glass; it must
 * not create a second player-facing voice, override hearing or reveal a player.
 * closeDoor starts an already-open, unwedged, real closer; production door
 * machinery owns its sound, semantic event, saved state and collision.
 *
 * seen is persisted by the caller only onCompleted, after actual exit.
 * No actor is displaced, including on cancellation, reload or interruption.
 */
export function createB3HushVisit({presence,navigation,canSpawnHidden,canHearBleed,emitBleed,doorState,closeDoor,rattleDoor,onStarted,onCompleted}={}){
  let phase='idle',age=0,pulse=0,insideAge=0,entered=false,closerAttempted=false,heardDoorAt=null;
  let retryIssued=false,retryIdle=0;
  const actor=()=>presence?.presenceState?.()||{};
  const active=()=>!!presence?.isActive?.();
  const snapshot=()=>({phase,age,entered,closerAttempted});
  function start({player,signal}={}){
    if(phase!=='idle')return false;
    let spawned=false;
    if(!active()){
      const candidate=B3_HUSH_VISIT.spawnCandidates.find(p=>navigation?.isWalkable?.(p)
        && navigation?.findPath?.(p,B3_HUSH_VISIT.bleed)
        && (typeof canSpawnHidden==='function'&&canSpawnHidden(p,player))
        && (typeof canHearBleed==='function'&&canHearBleed(p,signal,B3_HUSH_VISIT.bleed)));
      if(!candidate||!presence?.spawnAtCell?.(candidate.x,candidate.y,{sector:'b3-speaker-approach'}))return false;
      spawned=true;
    }else{
      // An already-active body keeps its actual position and independent
      // priorities. Do not claim an encounter for an actor that cannot hear
      // or physically reach the real speaker transmission.
      const current=actor();
      if(!finitePoint(current)||!navigation?.isWalkable?.(current)
          ||!navigation?.findPath?.(current,B3_HUSH_VISIT.bleed)
          ||typeof canHearBleed!=='function'||!canHearBleed(current,signal,B3_HUSH_VISIT.bleed))return false;
    }
    phase='approach';age=0;pulse=0;insideAge=0;entered=false;closerAttempted=false;retryIdle=0;heardDoorAt=null;
    onStarted?.({spawned});return true;
  }
  // One stable wrapper preserves the ordinary navigation/target caches.
  const routeNavigation=navigation?.resolveMove?{...navigation,resolveMove(from,to,distance){
    const a=actor(),sameBelief=phase==='leaving'&&heardDoorAt!==null&&a.hasTarget
      &&a.targetReason==='ACOUSTIC_EVENT'&&a.targetSetAt===heardDoorAt
      &&['door_close','door_rattle'].includes(a.targetEventKind);
    const gate=B3_HUSH_VISIT.exitWaypoint;
    if(sameBelief&&from.y<gate.y-.01&&from.y>=35&&from.x>=27&&from.x<=35
        &&navigation.isWalkable?.(gate)&&navigation.findPath?.(from,gate)&&navigation.findPath?.(gate,to)){
      return navigation.resolveMove(from,gate,distance);
    }
    return navigation.resolveMove(from,to,distance);
  }}:navigation;
  return {
    step({dt=0,eligible=false,suspended=false,inBooth=false,signal=0,seen=false,player=null}={}){
      if(suspended||!eligible)return snapshot();
      const seconds=Math.max(0,Math.min(.25,Number(dt)||0));
      const level=Math.max(0,Math.min(1,Number(signal)||0));
      if(phase==='idle'){
        if(!seen&&inBooth&&level>0)start({player,signal:level});
        if(phase==='idle')return snapshot();
      }
      if(phase==='done')return snapshot();
      age+=seconds;
      if(!active()){phase='done';return snapshot();}
      if(age>B3_HUSH_VISIT.visitLimitSeconds){
        // A lost/interrupted investigation may be retried while the real
        // speaker remains audible. The existing actor is never moved.
        phase='idle';age=pulse=insideAge=retryIdle=0;entered=closerAttempted=false;heardDoorAt=null;
        return snapshot();
      }
      const position=actor();
      if(phase==='approach'){
        if(inLiveRoom(position)){
          entered=true;phase='inside';insideAge=0;
        }else if(level>0){
          pulse-=seconds;
          if(pulse<=0){pulse=B3_HUSH_VISIT.pulseSeconds;emitBleed?.({position:B3_HUSH_VISIT.bleed,intensity:level});}
        }
      }
      if(phase==='inside'){
        insideAge+=seconds;
        if(insideAge>=B3_HUSH_VISIT.insideHoldSeconds){
          closerAttempted=true;
          const door=doorState?.(B3_HUSH_VISIT.room5Door);
          // The callbacks emit the actual physical door sound through the
          // world's normal audio and HUSH hearing; nothing is offered directly.
          phase='leaving';
          if(door?.state==='open'&&door.open===true&&door.wedge!==true&&door.closer!=='none'){
            if(closeDoor?.(B3_HUSH_VISIT.room5Door)!==true){
              const current=doorState?.(B3_HUSH_VISIT.room5Door);
              if(current)rattleDoor?.(current);
            }
          }else if(door)rattleDoor?.(door);
        }
      }
      if(phase==='leaving'&&inCorridor(position)){phase='done';onCompleted?.();}
      else if(phase==='leaving'&&!retryIssued&&heardDoorAt!==null){
        // A director beat can interrupt the real Room 5 latch investigation
        // before HUSH reaches the open B3 mouth. One further physical rattle
        // is allowed only if that very same belief was dropped, no other
        // sound has replaced it, and no contact happened since it was heard.
        // Hearing may ignore the sound; we never install a new target here.
        const sameDroppedBelief=!position.hasTarget&&position.targetSetAt===heardDoorAt
          &&!position.pendingContact&&!(Number(position.lastCatchAt)>heardDoorAt);
        retryIdle=sameDroppedBelief?retryIdle+seconds:0;
        if(retryIdle>=2){
          retryIssued=true;
          const portal=doorState?.(B3_HUSH_VISIT.room5Door);
          if(portal)rattleDoor?.(portal);
        }
      }
      return snapshot();
    },
    // Call only from the normal HUSH hearing runtime's onHeard callback.
    // A competing sound may have prevented its offer: the presence guard then
    // refuses to extend or bias a different belief.
    heard({event,propagation}={}){
      if(phase!=='leaving'||!propagation?.heard||!Number.isFinite(propagation.effectiveLevelDb)
          ||event?.semantics?.playerGenerated!==false||event?.source?.kind!=='environment'
          ||event?.source?.id!==`door:${B3_HUSH_VISIT.room5Door}`
          ||event?.provenance?.system!=='door-runtime'
          ||event?.provenance?.doorId!==B3_HUSH_VISIT.room5Door
          ||!['door_close','door_rattle'].includes(event?.kind))return false;
      const extended=presence?.extendHeardEnvironmentalMemory?.({eventKind:event.kind,position:event.spatial?.position,
        seconds:B3_HUSH_VISIT.doorMemorySeconds})===true;
      if(extended)heardDoorAt=actor().targetSetAt;
      return extended;
    },
    // This is a collision-checked route preference toward the genuinely heard
    // door, not a new target. It stops on any new sound or contact. The normal
    // ordinary gait, body, collision and final door target remain authoritative.
    navigation(){return routeNavigation;},
    snapshot,
    reset(){phase='idle';age=pulse=insideAge=retryIdle=0;entered=closerAttempted=retryIssued=false;heardDoorAt=null;},
  };
}
