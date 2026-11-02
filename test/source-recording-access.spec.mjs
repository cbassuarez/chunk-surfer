import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSourceRecording, recoverSourceRecording } from '../src/game/source-recording-custody.js';
import { resolveSourceRecordingAccess, sourceRecordingAccessCurrent } from '../src/game/source-recording-access.js';

const options={runId:'cassette-night',chapter:'II',locationId:'source-ii-recording-return'};
const destination={chapter:'II',locationId:options.locationId,chartId:0,x:16,z:-22,feet:0};
function fixture(){
 const takes=[{id:'take:1',ordinal:1,roomId:'main_b3',startSeconds:0,endSeconds:60,durationSeconds:60,
  status:'accepted',counted:true,audible:[['the-real-room',.4]],slate:{audioKey:'the-real-slate'},discrete:[{cueId:'actual-event',atSec:14}]}];
 const claim=claimSourceRecording(null,{runId:options.runId,chapter:'I',contactId:'deliberate-contact',takes,destination});
 return{takes,custody:claim.state,request:{...options,receiptId:claim.recording.id}};
}
test('a cassette inspection gets a cloned exact physical take without recovering, changing content, or substituting another take from that room',()=>{
 const f=fixture(),before=JSON.stringify(f),preview=resolveSourceRecordingAccess(f.custody,f.takes,f.request);
 assert.equal(preview.ok,true);assert.equal(preview.previewAvailable,true);assert.deepEqual(preview.take,f.takes[0]);
 preview.take.audible[0][1]=1;preview.recording.status='recovered';
 assert.equal(JSON.stringify(f),before);
 const replacement={...f.takes[0],id:'take:2',ordinal:2,startSeconds:60,endSeconds:120};
 const missing=resolveSourceRecordingAccess(f.custody,[replacement],f.request);
 assert.equal(missing.ok,true);assert.equal(missing.previewAvailable,false);assert.equal(missing.take,null);assert.equal(missing.previewReason,'source-unavailable');
});
test('foreign run, wrong physical destination, recovered receipt and duplicate exact rows cannot authorize another preview',()=>{
 const f=fixture();
 assert.equal(resolveSourceRecordingAccess(f.custody,f.takes,{...f.request,runId:'another-night'}).reason,'wrong-run');
 assert.equal(resolveSourceRecordingAccess(f.custody,f.takes,{...f.request,locationId:'elsewhere'}).reason,'wrong-location');
 const duplicate=resolveSourceRecordingAccess(f.custody,[...f.takes,...structuredClone(f.takes)],f.request);
 assert.equal(duplicate.previewAvailable,false);assert.equal(duplicate.previewReason,'ambiguous-source');
 const recovered=recoverSourceRecording(f.custody,f.request).state;
 assert.equal(resolveSourceRecordingAccess(recovered,f.takes,f.request).reason,'already-recovered');
});
test('the inert session token revalidates source content, active run and held receipt after asynchronous preparation',()=>{
 const f=fixture(),view=resolveSourceRecordingAccess(f.custody,f.takes,f.request),token=view.token;
 assert.equal(sourceRecordingAccessCurrent(f.custody,f.takes,token,f.request),true);
 assert.equal(sourceRecordingAccessCurrent(f.custody,f.takes,token,{}),false,'caller must supply the current run/location, not trust a stale token');
 const changed=structuredClone(f.takes);changed[0].audible[0][0]='different-source';
 assert.equal(sourceRecordingAccessCurrent(f.custody,changed,token,f.request),false);
 assert.equal(sourceRecordingAccessCurrent(recoverSourceRecording(f.custody,f.request).state,f.takes,token,f.request),false);
 assert.equal(sourceRecordingAccessCurrent(f.custody,f.takes,token,{...f.request,runId:'different'}),false);
});
test('an erased or unavailable original stays inspectable but cannot become fabricated audition audio',()=>{
 const f=fixture(),erased=structuredClone(f.takes);erased[0].voided=true;
 const view=resolveSourceRecordingAccess(f.custody,erased,f.request);assert.equal(view.ok,true);assert.equal(view.previewAvailable,false);assert.equal(view.previewReason,'source-erased');
 const continuous={...f.takes[0],status:'archived',counted:false,continuous:{schema:1,kind:'continuous-cabin',durable:true,key:'exact',captureId:'exact-capture',
  runId:options.runId,takeId:'take:1',durationSeconds:60,frames:2880000,sampleRate:48000,channels:2,sha256:'a'.repeat(64)}};
 const claim=claimSourceRecording(null,{runId:options.runId,chapter:'I',contactId:'real-capture-contact',takes:[continuous],destination});
 const request={...options,receiptId:claim.recording.id};continuous.mediaUnavailable=true;
 assert.equal(resolveSourceRecordingAccess(claim.state,[continuous],request).previewReason,'media-unavailable');
});
