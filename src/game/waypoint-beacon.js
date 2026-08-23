// Presentation timing for story-target illumination. The tracker decides when
// help is permitted; the renderer applies that energy to the target's own
// material. It never creates a floating world marker.

export const OBJECT_GUIDANCE = Object.freeze({
  stallMs:8_000,
  progressDistance:1.25,
  visibleMs:18_000,
  cooldownMs:8_000,
});

export function createObjectGuidanceTracker(options={}){
  const rules={...OBJECT_GUIDANCE,...options};
  let state={targetId:null,bestDistance:Infinity,lastProgressAt:0,visibleUntil:0,cooldownUntil:0};
  const reset=(targetId=null,distance=Infinity,nowMs=0)=>{
    state={targetId,bestDistance:Number.isFinite(distance)?distance:Infinity,lastProgressAt:nowMs,visibleUntil:0,cooldownUntil:0};
  };
  return{
    update({target=null,distance=Infinity,nowMs=0,mode='full',sameRenderGroup=true,flash='full'}={}){
      const id=target?.id||null,now=Number(nowMs)||0,d=Number(distance);
      if(!id){reset(null,Infinity,now);return{visible:false,alpha:0,pulse:false,stalled:false,targetId:null};}
      if(id!==state.targetId)reset(id,d,now);
      if(Number.isFinite(d)&&d<=state.bestDistance-rules.progressDistance){
        state.bestDistance=d;state.lastProgressAt=now;state.visibleUntil=0;
      }
      const stalled=now-state.lastProgressAt>=rules.stallMs;
      if(mode==='reduced'&&stalled&&now>=state.cooldownUntil){
        state.visibleUntil=now+rules.visibleMs;
        state.cooldownUntil=state.visibleUntil+rules.cooldownMs;
      }
      const visible=!!sameRenderGroup&&(mode==='full'||(mode==='reduced'&&now<state.visibleUntil));
      const pulse=visible&&flash!=='off';
      return{visible,alpha:visible?(stalled ? .88 : .62):0,pulse,stalled,targetId:id};
    },
    snapshot(){return{...state,rules:{...rules}};},
    reset(){reset();},
  };
}

// One-release aliases for tests and external probes which imported the old
// timing model. Runtime presentation no longer draws a beacon.
export const WAYPOINT_BEACON=OBJECT_GUIDANCE;
export const createWaypointBeaconTracker=createObjectGuidanceTracker;
