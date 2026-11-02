import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeSourceContinuationHandoff} from '../src/game/source-continuation-handoff.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {SOURCE_FINALE_ROUTE} from '../src/game/chunk-surf-state.js';
function terminal(){
 const initial=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL,{seed:4417}).state;
 const runtime=createSourceSpaceRuntime({initialState:initial});
 const entry=runtime.sourceContinuationEntry('forward',{runId:'resume-audit'});
 let s=normalizeSourceContinuation({...entry.checkpoint,layoutVersion:C.layoutVersion,phase:'catch',status:'active',level:C.catch.levels-1,...C.catch.finalApproach});
 s=stepSourceContinuation(s,{dt:0,interact:true,renderReady:true}).state;
 for(let i=0;i<100&&!s.completed;i++)s=stepSourceContinuation(s,{dt:1/60,forward:1,renderReady:true}).state;
 assert.equal(s.completed,true,'actual open-and-walk crossing earns the terminal checkpoint');
 runtime.setContinuationCheckpoint(s);return{runtime,checkpoint:s};
}
test('a save inside the final hold resumes the original onward transaction before horizon has been entered',()=>{
 const {runtime,checkpoint}=terminal(),saved=runtime.state();
 assert.notEqual(saved.phase,'horizon');assert.equal(checkpoint.exitReceipt.delivered,false);
 const restored=createSourceSpaceRuntime({initialState:saved}),contact=structuredClone(restored.state().sourceContacts);
 const result=resumeSourceContinuationHandoff(restored,restored.state().sourceContinuation);
 assert.equal(result.handled,true);assert.equal(restored.state().phase,'horizon');
 assert.equal(result.receipt,checkpoint.exitReceipt.id);assert.deepEqual(restored.state().sourceContacts,contact);
 assert.ok(Number.isFinite(result.checkpoint.x)&&Number.isFinite(result.checkpoint.y));
});
test('resuming after horizon ownership was saved retains the same receipt and acknowledges once',()=>{
 const {runtime,checkpoint}=terminal();resumeSourceContinuationHandoff(runtime,checkpoint);
 const restored=createSourceSpaceRuntime({initialState:runtime.state()});
 const result=resumeSourceContinuationHandoff(restored,restored.state().sourceContinuation);
 assert.equal(result.handled,true);assert.equal(result.receipt,checkpoint.exitReceipt.id);
 assert.equal(restored.acknowledgeContinuationHandoff(result.receipt),true);
 assert.equal(resumeSourceContinuationHandoff(restored,restored.state().sourceContinuation).handled,false);
});
test('terminal resume cannot bypass Contact or create a receipt for an unfinished encounter',()=>{
 const {runtime,checkpoint}=terminal(),saved=runtime.state();
 const contact=createSourceSpaceRuntime({initialState:{...saved,finale:{...saved.finale,route:SOURCE_FINALE_ROUTE.CONTACT}}});
 assert.equal(resumeSourceContinuationHandoff(contact,checkpoint).handled,false);
 assert.equal(resumeSourceContinuationHandoff(runtime,{...checkpoint,completed:false}).handled,false);
 assert.equal(resumeSourceContinuationHandoff(runtime,null).handled,false);
});
