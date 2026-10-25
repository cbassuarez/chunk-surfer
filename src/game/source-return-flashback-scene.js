import {createSourceReturnFlashback,normalizeSourceReturnFlashbackCheckpoint,stepSourceReturnFlashback,sourceReturnFlashbackFrame} from './source-return-flashback.js';
import {createSourceReturnFlashbackRenderer} from '../render/source-return-flashback-renderer.js';
import {SourceDriveAcoustics} from './source-drive/acoustics.js';
import {assetUrl} from '../platform/paths.js';
export {normalizeSourceReturnFlashbackCheckpoint} from './source-return-flashback.js';

export function makeSourceReturnFlashbackScene({destination,checkpoint=null,returnPose=null,context,destinationAudio,reducedMotion=false,isHeld=()=>false,
 onCheckpoint=()=>{},paintCover=()=>{},onRestore=()=>{},onDone=()=>{},onPause=()=>{},onError=()=>{},
 fetcher=globalThis.fetch?.bind(globalThis),createRenderer=createSourceReturnFlashbackRenderer,createAudio=options=>new SourceDriveAcoustics(options),
}={}){
 let state=normalizeSourceReturnFlashbackCheckpoint(checkpoint),metrics=null,metricsPending=null,preview=state?.elapsed>0?3:0,pending=null,preparing=false,ready=false,presented=false,closed=false,completed=false,restored=false,paused=false,blurred=false,drag=null,saveAt=0,error=null,arrivalReveal=null,audioDisposed=false,handoffPresented=false;
 let renderer=null,audio=null;const lookOffset={yaw:0,pitch:0};
 function serialize(){return state?structuredClone(state):null;}
 function save(){const value=serialize();if(value)onCheckpoint(value);}
 const frozen=()=>paused||blurred||isHeld();
 function disposeAudio(){if(!audio||audioDisposed)return;audioDisposed=true;audio.dispose?.();}
 function restore(){if(restored)return;restored=true;disposeAudio();renderer?.dispose?.();onRestore({returnPose:state?.returnPose||returnPose,destination});}
 function finish(reason=null){if(closed||completed)return;completed=true;paintCover(1);restore();onDone({destination,returnPose:state?.returnPose||returnPose,error:reason});}
 function fail(reason){error=String(reason?.message||reason);onError(reason);finish(error);}
 function loadMetrics(){if(metrics)return Promise.resolve(metrics);if(metricsPending)return metricsPending;metricsPending=(async()=>{const response=await fetcher(assetUrl('assets/source-drive/geometry/metrics.json'));if(closed)return null;if(!response?.ok)throw Error('The returning van geometry could not be prepared.');const value=await response.json();if(closed)return null;metrics=value;if(!state)state=createSourceReturnFlashback({destination,reducedMotion,metrics,returnPose});save();return metrics;})();return metricsPending;}
 async function prepare(){if(preparing||closed)return pending;preparing=true;pending=(async()=>{
  await loadMetrics();if(closed)return false;renderer=createRenderer();const acquired=await renderer.initialize();if(closed)return false;if(acquired===false)throw Error('The return picture could not be prepared.');
  audio=createAudio({context,destination:destinationAudio,gain:.48,fetcher});audio.setPaused(true);await audio.initialize();if(closed){disposeAudio();return false;}ready=true;return true;
 })().catch(reason=>{if(!closed)fail(reason);return false;});return pending;}
 const scene={id:'source-return-flashback',blocksWorld:true,blocksInput:true,suppressesHud:true,allowsLook:false,worldPresentation:'visible',
  initialize:async()=>{try{await loadMetrics();if(preview>=3&&!closed){scene.worldPresentation='hidden';return prepare();}return true;}catch(reason){fail(reason);return false;}},serialize,
  update(dt){
   if(closed||completed)return;const hold=frozen();audio?.setPaused(hold||!ready||!presented||restored);if(hold){drag=null;return;}
   if(arrivalReveal!==null){arrivalReveal+=Math.min(.05,Math.max(0,dt));if(arrivalReveal>=.9){completed=true;onDone({destination,returnPose:state?.returnPose||returnPose,error:null});}return;}
   if(preview<3){preview=Math.min(3,preview+Math.min(.05,Math.max(0,dt)));if(preview>=3){scene.worldPresentation='hidden';void prepare();}return;}
   if(!ready||!presented)return;stepSourceReturnFlashback(state,dt,{renderReady:presented});if(state.elapsed-saveAt>1){saveAt=state.elapsed;save();}
   if(sourceReturnFlashbackFrame(state).handoffReady&&handoffPresented){save();paintCover(1);restore();scene.worldPresentation='visible';arrivalReveal=0;}
  },
  render(){
   if(closed||completed)return;
   if(arrivalReveal!==null){paintCover(Math.max(0,1-arrivalReveal/.9));return;}
   if(preview<3){paintCover(Math.max(0,Math.min(1,(preview-2)/1)));return;}
   if(!ready){paintCover(1);return;}
   const frame=sourceReturnFlashbackFrame(state);presented=renderer.render(frame,metrics,{lookOffset})!==false;
   if(!presented){audio?.setPaused(true);paintCover(1);return;}
   const actual=renderer.last?.();if(actual)audio?.sync(actual.driveState,[],actual.weather,actual.evolution,[]);
   audio?.setPaused(frozen());paintCover(frame.coverAlpha);handoffPresented=frame.handoffReady&&frame.coverAlpha===1;
  },
  key(event){const k=String(event?.key||'').toLowerCase();if(k==='escape'){save();onPause();return true;}return true;},keyup:()=>true,
  pointer(event){if(closed||!ready||frozen())return true;
   if(event.type==='pointerdown')drag={x:event.clientX,y:event.clientY};
   if(event.type==='pointerup'||event.type==='pointercancel')drag=null;
   if(event.type==='pointermove'){const dx=Number.isFinite(event.movementX)&&event.buttons?event.movementX:drag?event.clientX-drag.x:0,dy=Number.isFinite(event.movementY)&&event.buttons?event.movementY:drag?event.clientY-drag.y:0;lookOffset.yaw=Math.max(-.9,Math.min(.9,lookOffset.yaw+dx*.0024));lookOffset.pitch=Math.max(-.5,Math.min(.5,lookOffset.pitch-dy*.0024));if(drag)drag={x:event.clientX,y:event.clientY};}return true;},
  pause(){paused=true;audio?.setPaused(true);save();},resume(){paused=false;},blur(){blurred=true;audio?.setPaused(true);save();},focus(){blurred=false;},
  exit(){if(closed)return;save();closed=true;restore();},
  reviewAt(time){if(!import.meta.env?.DEV||!ready||!state||closed||restored||!Number.isFinite(time))return false;state.elapsed=Math.max(0,Math.min(54.95,time));handoffPresented=false;presented=false;return{disclosure:'Explicit developer staging before capture; not continuous gameplay.',elapsed:state.elapsed};},
  diagnostics:()=>({ready,presented,preview,error,closed,completed,checkpoint:serialize(),frame:state?sourceReturnFlashbackFrame(state):null,rendering:renderer?.diagnostics?.(),audioDiagnostics:audio?.diagnostics?.()||null}),
 };
 return scene;
}
