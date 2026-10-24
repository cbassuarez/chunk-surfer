import {normalizeEndingWrongDoorDemolition} from './ending-wrong-door.js';
import {freshSourceIV,normalizeSourceIV} from './source-iv.js';

// These transitions are saved as one patch. Ordinary Source I/II state is not
// part of the transaction, and no return is earned merely by reaching IV.
export function endingSourceResume(save){
  const runId=save?.run?.id;if(!runId||save.run.status!=='active')return null;
  if(save.sourceIV?.sequenceId==='source-IV'&&save.sourceIV.runId===runId){
    const checkpoint=normalizeSourceIV(save.sourceIV,{runId});
    return checkpoint.exitReceipt?.delivered?null:{stage:'source-IV',checkpoint};
  }
  if(save.endingWrongDoor?.sequenceId!=='ending-wrong-door'||save.endingWrongDoor.runId!==runId)return null;
  const checkpoint=normalizeEndingWrongDoorDemolition(save.endingWrongDoor,{runId});
  if(checkpoint.status==='returned')return null;
  if(checkpoint.status==='ready-for-source-IV')return{stage:'source-IV',checkpoint:freshSourceIV({runId,returnPose:checkpoint.returnPose}),demolition:checkpoint};
  return{stage:'demolition',checkpoint};
}
export function endingSourceIVHandoff(checkpoint,save){
  const runId=save?.run?.id;
  if(!runId||save.run.status!=='active'||checkpoint?.runId!==runId||checkpoint.sequenceId!=='ending-wrong-door')return null;
  const ending=normalizeEndingWrongDoorDemolition(checkpoint,{runId});
  if(ending.status!=='ready-for-source-IV'||!ending.exitReceipt)return null;
  const sourceIV=save.sourceIV?.sequenceId==='source-IV'&&save.sourceIV.runId===runId
    ?normalizeSourceIV(save.sourceIV,{runId}):freshSourceIV({runId,returnPose:ending.returnPose});
  return{endingWrongDoor:{...ending,exitReceipt:{...ending.exitReceipt,delivered:true}},sourceIV,endingCutscene:null};
}
export function endingSourceIVCanFinish(save){
  const value=save?.sourceIV;
  return !!save?.run?.id&&save.run.status==='active'&&value?.sequenceId==='source-IV'
    &&value.runId===save.run.id&&value.status==='completed'&&!!value.exitReceipt
    &&!value.exitReceipt.delivered&&normalizeSourceIV(value,{runId:save.run.id}).exitReceipt?.id===value.exitReceipt.id;
}
