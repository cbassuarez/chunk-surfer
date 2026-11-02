import {resolveSourceRecordingAccess,sourceRecordingAccessCurrent} from './source-recording-access.js';
import {sourceContinuationRecordingReturnFocus} from './source-continuation-contact.js';
import {createSourceRecordingInspectionScene} from './source-recording-inspection.js';
import {createSourceRecordingAudition} from './source-recording-audition.js';

// Bind this temporary object view to the exact body, night, source interval and
// receipt. Rendering or listening alone never changes custody or room credit.
export function makeSourceRecordingInspectionHost({request,runtime,owner,getRuntime,getOwner,getRunId,getTakes,
  playback,renderer,presentation=()=>({}),onCommit=()=>{},onExit=()=>{},onError=()=>{},onTrace=()=>{},
  makeScene=createSourceRecordingInspectionScene}={}){
  const runId=getRunId?.(),options={runId,receiptId:request?.receiptId,chapter:request?.chapter,locationId:request?.locationId};
  const present=()=>!!owner&&getOwner?.()===owner&&getRuntime?.()===runtime&&getRunId?.()===runId;
  if(!present()||presentation().deadlinePending)return null;
  const custody=()=>runtime.sourceRecordingCustody(),takes=()=>getTakes()||[];
  const access=resolveSourceRecordingAccess(custody(),takes(),options);
  if(!access.ok)return null;
  const bodyHere=()=>{
    if(!present())return false;
    const focus=sourceContinuationRecordingReturnFocus(owner.serialize(),{custody:custody()});
    return focus?.receiptId===options.receiptId&&focus.chapter===options.chapter&&focus.locationId===options.locationId;
  };
  const valid=()=>bodyHere()&&sourceRecordingAccessCurrent(custody(),takes(),access.token,options);
  if(!valid())return null;
  const recording={...access.recording,slate:access.take?.slate||null,nightStamp:access.take?.nightStamp||null};
  return makeScene({recording,renderer,presentation,onError,onTrace,
    onAudition:({positionSeconds,signal})=>{
      if(!valid()||!access.previewAvailable||presentation().recorderAvailable===false)return null;
      return createSourceRecordingAudition({playback,take:access.take,positionSeconds,valid,signal,
        present:()=>present()&&presentation().recorderAvailable!==false,
        allowed:()=>present()&&presentation().recorderAvailable!==false&&!presentation().deadlinePending});
    },
    onRecover:()=>{
      if(!valid()||presentation().deadlinePending)return false;
      const result=runtime.recoverSourceRecording(options);
      if(result?.handled&&!result.duplicate)onCommit(result);
      return result?.handled===true;
    },
    onExit:result=>{if(present())owner.releaseContact?.();onExit(result);},
  });
}
