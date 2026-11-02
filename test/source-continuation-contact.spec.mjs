import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {sourceRestPositionProtected,SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {continuationContactChapter,sourceContinuationHushContactFocus,sourceContinuationRecordingReturnFocus,sourceContinuationRecordingReturnProps,
 sourceContinuationRecordingDestination,sourceRecordingReturnPresentation,SOURCE_RECORDING_WORLD_CHAPTERS,SOURCE_CONTINUATION_RECORDING_RETURNS} from '../src/game/source-continuation-contact.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const status=chapter=>({chapter,battleAvailable:true,repeatAvailable:false,activeBattleId:null});
function body(chapter='II'){
 const pose=chapter==='III'?{phase:'catch',x:-177,z:-85,feet:2.4,chartId:0,level:1}:{phase:'wrong-return',x:16,z:-22,feet:0,chartId:0,level:0};
 const state=normalizeSourceContinuation({...freshSourceContinuation({runId:'contact-test'}),...pose,status:'active',yaw:0});
 state.hush={...state.hush,...pose,x:pose.x,z:pose.z-2,active:true,armed:true,mode:'follow',notice:0,trail:[]};
 state.counterweight.active=false;return state;
}
const ledger=(chapter='II',extra={})=>({schema:1,runId:'contact-test',recordings:[{id:'held-take',status:'held',roomId:'studio-b3',place:'Studio B3',destination:sourceContinuationRecordingDestination(chapter),...extra}]});
const focus=state=>sourceContinuationHushContactFocus(state,{status:status(continuationContactChapter(state))});

test('each continuation chapter offers deliberate Contact at its real supported follower, outside the physical catch',()=>{
 for(const chapter of['II','III']){const state=body(chapter),before=copy(state),f=focus(state);assert.equal(f.chapter,chapter);assert.equal(f.type,'source-contact');assert.equal(f.distance,2);assert.deepEqual(state,before);}
 const state=body(),f=sourceContinuationHushContactFocus(state,{status:{chapter:'II',repeatAvailable:true}});assert.equal(f.repeatContact,true);
});

test('neither proximity nor unavailable/wrong chapter authority manufactures Contact consent',()=>{
 const state=body();assert.equal(sourceContinuationHushContactFocus(state),null);
 assert.equal(sourceContinuationHushContactFocus(state,{status:{chapter:'III',battleAvailable:true}}),null);
 assert.equal(sourceContinuationHushContactFocus(state,{status:{...status('II'),activeBattleId:'battle-owned'}}),null);
 for(const metres of[.65,1,2.7,9]){state.hush.z=state.z-metres;assert.equal(focus(state),null);}
 state.hush.z=state.z-2;state.yaw=Math.PI;assert.equal(focus(state),null,'first-person Contact must be in the actual viewing direction');
});

test('falls, transits, refuge/rest ownership and a nearby receiving weight exclude Contact',()=>{
 for(const patch of[{fall:{}},{recovery:{}},{reveal:{}},{bodyTransit:{}},{cameraTransit:{}},{sourceRestView:{mode:'seated'}},{status:'completed'}])assert.equal(focus({...body(),...patch}),null);
 for(const patch of[{active:false},{fall:{}},{recovery:{}},{bodyTransit:{}},{mode:'yield'},{chartId:1},{feet:4.2}]){const state=body();Object.assign(state.hush,patch);assert.equal(focus(state),null);}
 const state=body('III');state.counterweight={...state.counterweight,active:true,x:state.x,z:state.z,y:state.feet};assert.equal(focus(state),null);
 for(const seat of SOURCE_REST_SEATS){const state={...body(seat.phase==='catch'?'III':'II'),...seat,...seat.approach};assert.equal(sourceRestPositionProtected(state),true);assert.equal(focus(state),null);}
 assert.equal(sourceContinuationHushContactFocus(body(),{status:status('II'),protected:true}),null);
});

test('a close apparent body across a closed real door or unsupported gap cannot be contacted',()=>{
 const state=body();Object.assign(state,{x:0,z:2,yaw:Math.PI});Object.assign(state.hush,{x:0,z:4.2});
 assert.equal(focus(state),null,'closed return leaf blocks the actual body reach');
 state.doorOpen['wrong-entry-return']=true;assert.equal(focus(state)?.chapter,'II','same real threshold after opening is reachable');
 const gap=body();Object.assign(gap,{x:12.9,z:-3,yaw:Math.PI/2});Object.assign(gap.hush,{x:15,z:-5.6});assert.equal(focus(gap),null);
});

test('custody returns have exact supported physical anchors and a real cassette through the world prop path',()=>{
 for(const anchor of SOURCE_CONTINUATION_RECORDING_RETURNS){
  const state=body(anchor.chapter),custody=ledger(anchor.chapter),before=copy(custody),all=sourceContinuationRecordingReturnProps(state,custody),props=all.filter(row=>row.sourceRecordingReturn);
  const pose=sourceRecordingReturnPresentation(anchor),style=SOURCE_RECORDING_WORLD_CHAPTERS[anchor.chapter];
  assert.equal(props.length,1);assert.equal(props[0].mesh,'academic_roof_cassette');assert.equal(props[0].chartId,anchor.chartId);assert.equal(props[0].x,pose.x);assert.equal(props[0].z,pose.z);
  assert.equal(props[0].y,anchor.feet+style.centreHeight);assert.equal(props[0].worldWidth,style.width);assert.equal(props[0].pitch,style.pitch);assert.equal(props[0].kind,'source-recording-cassette');assert.equal(props[0].structural,false);assert.equal(props[0].sourceRecordingReturn,true);assert.equal(all.filter(row=>row.sourceRecordingStand).length,3);assert.deepEqual(custody,before);
 }
 assert.equal(sourceContinuationRecordingDestination('IV'),null);
});

test('return props exist canonically before the destination chart/chapter is entered; focus still requires physical reach',()=>{
 const state=body(),custody=ledger('III');assert.equal(sourceContinuationRecordingReturnProps(state,custody).filter(row=>row.sourceRecordingReturn).length,1);
 assert.equal(sourceContinuationRecordingReturnFocus(state,{custody}),null);
 state.chartId=1;assert.equal(sourceContinuationRecordingReturnProps(state,ledger()).filter(row=>row.sourceRecordingReturn).length,1);assert.equal(sourceContinuationRecordingReturnFocus(state,{custody:ledger()}),null);
});

test('rich world cassette fans are bounded while every later held receipt remains recoverable',()=>{
 const state=body(),custody=ledger();Object.assign(state,{x:16,z:-21,yaw:0});
 custody.recordings=Array.from({length:13},(_,index)=>({...custody.recordings[0],id:'held-'+index,takeId:'take-'+index,takeKey:'key-'+index}));
 let recovered=0;
 while(custody.recordings.some(row=>row.status==='held')){
  const props=sourceContinuationRecordingReturnProps(state,custody),cassettes=props.filter(row=>row.sourceRecordingReturn);
  assert.ok(cassettes.length<=8);assert.ok(props.length<=12);assert.ok(cassettes.every(row=>row.worldWidth===.40&&row.y>=1.28&&row.noCollision===true));
  if(custody.recordings.filter(row=>row.status==='held').length>8)assert.equal(props.filter(row=>row.sourceRecordingSpine).length,1);
  const f=sourceContinuationRecordingReturnFocus(state,{custody});assert.ok(f);assert.equal(f.title,'HOLD THE CASSETTE');
  const row=custody.recordings.find(row=>row.id===f.receiptId);assert.equal(row.status,'held');row.status='recovered';recovered++;
 }
 assert.equal(recovered,13);assert.deepEqual(sourceContinuationRecordingReturnProps(state,custody),[]);
});

test('recovered, foreign-run and unapproved relocation rows cannot create a pickup or an invented footing',()=>{
 const state=body(),custody=ledger();Object.assign(state,{x:16,z:-21,yaw:0});assert.equal(sourceContinuationRecordingReturnFocus(state,{custody})?.receiptId,'held-take');
 for(const invalid of[{...custody,runId:'another-run'},ledger('II',{status:'recovered'}),ledger('II',{destination:{...sourceContinuationRecordingDestination('II'),x:17}}),ledger('II',{destination:{...sourceContinuationRecordingDestination('II'),chartId:1}})]){
  assert.deepEqual(sourceContinuationRecordingReturnProps(state,invalid),[]);assert.equal(sourceContinuationRecordingReturnFocus(state,{custody:invalid}),null);
 }
 assert.equal(sourceContinuationRecordingReturnFocus({...state,fall:{}},{custody}),null);assert.equal(sourceContinuationRecordingReturnFocus(state,{custody,protected:true}),null);
});

test('scene saves its exact body before explicit Contact and holds pursuit until the shared encounter releases it',async()=>{
 let contacts=0;const saves=[],state=body(),s=createSourceContinuationScene({checkpoint:state,renderer:{initialize:()=>true,ready:()=>true,render:()=>true},getContactStatus:status,onCheckpoint:(cp,meta)=>saves.push({cp,reason:meta.reason}),onContact:request=>{
  assert.equal(saves.at(-1).reason,'source-contact');assert.equal(request.checkpoint.x,16);assert.equal(request.chapter,'II');contacts++;return true;
 }});
 await s.initialize();assert.equal(s.view().focus.type,'source-contact');assert.equal(contacts,0);
 s.key({key:'e'});assert.equal(contacts,1);assert.equal(s.view().contactHeld,'source-contact');const held=s.serialize();
 s.key({key:'w'});s.update(.25);assert.deepEqual(s.serialize(),held);assert.equal(s.stillnessPose().transitioning,true);
 assert.equal(s.releaseContact(),true);assert.equal(s.view().contactHeld,null);assert.equal(s.serialize().hush.mode,'notice');assert.equal(s.releaseContact(),false);s.exit();
});

test('declined/failed Contact opening restores controls without altering progression or starting a battle',async()=>{
 for(const onContact of[()=>false,()=>undefined,()=>{throw Error('modal unavailable');}]){
  const errors=[],s=createSourceContinuationScene({checkpoint:body(),renderer:{initialize:()=>true,ready:()=>true,render:()=>true},getContactStatus:status,onContact,onError:e=>errors.push(e.message)});
  await s.initialize();s.key({key:'e'});await Promise.resolve();assert.equal(s.view().contactHeld,null);assert.equal(s.view().error,null);assert.equal(s.serialize().status,'active');assert.equal(s.serialize().hush.mode,'follow','a refused opener cannot be spammed to reset pursuit notice');s.exit();
 }
});

test('recovery is an explicit host request with exact receipt/location; props disappear only after canonical host recovery',async()=>{
 let custody=ledger(),requests=0;const frames=[],state=body();Object.assign(state,{x:16,z:-21,yaw:0});
 const s=createSourceContinuationScene({checkpoint:state,renderer:{initialize:()=>true,ready:()=>true,render:value=>{frames.push(value);return true;}},getRecordingCustody:()=>custody,onRecoverRecording:request=>{
  assert.deepEqual({receiptId:request.receiptId,chapter:request.chapter,locationId:request.locationId},{receiptId:'held-take',chapter:'II',locationId:'source-ii-recording-return'});requests++;custody=ledger('II',{status:'recovered'});return true;
 }});
 await s.initialize();s.render();assert.equal(frames.at(-1).sourceContactProps.filter(row=>row.sourceRecordingReturn).length,1);assert.equal(s.view().focus.type,'source-recording-return');
 assert.equal(requests,0);s.key({key:'e'});await Promise.resolve();assert.equal(requests,1);assert.equal(s.view().contactHeld,null);s.render();assert.deepEqual(frames.at(-1).sourceContactProps,[]);
 assert.equal(s.serialize().phase,'wrong-return');assert.equal('recordings' in s.serialize(),false,'custody remains canonical host state');s.exit();
});
