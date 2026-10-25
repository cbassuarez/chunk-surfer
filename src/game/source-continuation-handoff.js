// A crossing may be saved during its final rendered hold, before the host
// runtime has entered the original road. Resume the same guarded transaction
// from either side of that boundary; the runtime retains Contact authority.
export function resumeSourceContinuationHandoff(runtime,checkpoint){
  if(!runtime||!checkpoint?.completed||!checkpoint.exitReceipt||checkpoint.exitReceipt.delivered)return{handled:false};
  return runtime.completeContinuation(checkpoint);
}
