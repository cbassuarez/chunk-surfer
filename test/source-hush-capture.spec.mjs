import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {sourceContinuationCapturedContactReady,sourceContinuationHushContactFocus} from '../src/game/source-continuation-contact.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';

const copy=v=>structuredClone(v);
const status=(chapter,won=false)=>({chapter,won,battleAvailable:!won,repeatAvailable:won,activeBattleId:null});
function body(chapter='II'){
 const pose=chapter==='III'?{phase:'catch',x:-290,z:-150,feet:8.4,chartId:0,level:0}:{phase:'wrong-return',x:16,z:-22,feet:0,chartId:0,level:0};
 const s=normalizeSourceContinuation({...freshSourceContinuation({runId:'capture-proof'}),...pose,status:'active',grace:0});
 if(chapter==='III')s.expedition={version:1,visited:['iii-arrival-court','iii-echo-colonnade'],chases:['iii-chase-outer'],activeSeconds:0,travelMetres:0};
 Object.assign(s.hush,{...pose,z:pose.z-.3,active:true,armed:true,mode:'follow',trail:[],elapsed:10});
 s.counterweight.active=false;s.recoveryAnchor={...pose,kind:'landing',supportId:'earned-test-landing',earnedAt:0};
 return s;
}
function caught(chapter='II'){return stepSourceContinuation(body(chapter),{dt:1/60,offerHushContact:true}).state;}
const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}});
function runtime(){const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417});return createSourceSpaceRuntime({initialState:built.state});}

test('both actual Hush catches hold their original recovery for an offer; ordinary hazards do not become Contact',()=>{
 for(const chapter of['II','III']){
  const state=caught(chapter);assert.equal(state.recovery?.contact,'pending');assert.equal(sourceContinuationCapturedContactReady(state),true);
  const before=copy(state.recovery),pose=[state.x,state.z,state.feet];
  const waiting=stepSourceContinuation(state,{dt:.25,offerHushContact:true}).state;
  assert.deepEqual(waiting.recovery,before);assert.deepEqual([waiting.x,waiting.z,waiting.feet],pose);
  const restored=normalizeSourceContinuation(JSON.parse(JSON.stringify(waiting)));
  assert.equal(restored.recovery.contact,'pending');assert.equal(sourceContinuationCapturedContactReady(restored),true);
  assert.equal(sourceContinuationCapturedContactReady({...restored,recovery:{...restored.recovery,reason:'counterweight'}}),false);
  assert.equal(sourceContinuationCapturedContactReady({...restored,fall:{}}),false);
 }
});

test('capture opens exactly one dialogue without E or consent, and decline resumes the same finite recovery',async()=>{
 for(const chapter of['II','III']){
  const offers=[],s=createSourceContinuationScene({checkpoint:body(chapter),renderer:renderer(),getContactStatus:ch=>status(ch),onContact:r=>{offers.push(r);return true;}});
  await s.initialize();s.update(1/60);
  assert.equal(offers.length,1);assert.equal(offers[0].captured,true);assert.equal(offers[0].chapter,chapter);
  const held=s.serialize();s.key({key:'w'});for(let i=0;i<10;i++)s.update(.25);
  assert.deepEqual(s.serialize(),held);assert.equal(offers.length,1);
  s.releaseContact();assert.equal(s.serialize().recovery.contact,'released');
  for(let i=0;i<60&&s.serialize().recovery;i++)s.update(.25);
  assert.equal(s.serialize().recovery,null);assert.ok(s.serialize().grace>0);assert.equal(offers.length,1);
  assert.equal(s.serialize().status,'active');s.exit();
 }
});

test('reload restores the same offer, while failed or ineligible presentation releases the queued recovery',async()=>{
 for(const accepted of[true,false]){
  let calls=0;const cp=caught(),s=createSourceContinuationScene({checkpoint:JSON.parse(JSON.stringify(cp)),renderer:renderer(),getContactStatus:ch=>status(ch),onContact:()=>{calls++;return accepted;}});
  await s.initialize();s.update(.1);await Promise.resolve();assert.equal(calls,1);
  if(accepted){assert.equal(s.serialize().recovery.contact,'pending');s.releaseContact();}
  else assert.equal(s.serialize().recovery.contact,'released');
  s.exit();
 }
 const cp=caught();cp.hush.chartId=1;
 const s=createSourceContinuationScene({checkpoint:cp,renderer:renderer(),getContactStatus:ch=>status(ch),onContact:()=>assert.fail('a remote body cannot offer Contact')});
 await s.initialize();s.update(.1);assert.equal(s.serialize().recovery.contact,'released');s.exit();
});

test('the runtime accepts only a proved local interception and still requires a fresh warning and explicit fight',()=>{
 for(const chapter of['II','III']){
  const r=runtime();r.setContinuationCheckpoint(caught(chapter));
  const args={chapter,locallyAvailable:true,runId:'capture-proof',captured:true};
  assert.equal(r.beginHushContact(null,{...args,captured:false}),null);
  const encounter=r.beginHushContact(null,args);assert.ok(encounter);assert.equal(encounter.captured,true);
  assert.match(encounter.lines.map(line=>line.text).join(' '),/not reached for it/);
  assert.equal(r.finalEncounterRequest(),null);
  assert.equal(r.resolveHushContactChoice('contact.confirm').handled,false);
  r.resolveHushContactChoice('contact.warning');assert.equal(r.finalEncounterRequest(),null);
  assert.equal(r.resolveHushContactChoice('contact.confirm').combat,true);
  const request=r.finalEncounterRequest();assert.equal(request.chapter,chapter);
  assert.equal(r.resolveFinalEncounter({battleAttemptId:request.battleAttemptId,won:true,outcome:'contain'}).handled,true);
  assert.deepEqual(r.state().finalEncounter.chapterWins,[chapter]);
 }
 const r=runtime();r.setContinuationCheckpoint(body());assert.equal(r.beginHushContact(null,{chapter:'II',locallyAvailable:true,captured:true}),null);
});

test('a won chapter retains a passive reachable presence and repeat Contact; another chapter still catches',()=>{
 let s=body(),origin=[s.hush.x,s.hush.z,s.hush.feet];
 for(let i=0;i<120;i++)s=stepSourceContinuation(s,{dt:1/60,offerHushContact:false,hushDefeated:true}).state;
 assert.equal(s.recovery,null);assert.equal(s.hush.mode,'yield');assert.deepEqual([s.hush.x,s.hush.z,s.hush.feet],origin);
 s.hush.z=s.z-2;
 assert.equal(sourceContinuationHushContactFocus(s,{status:status('II',true)})?.repeatContact,true);
 const next=stepSourceContinuation(body('III'),{dt:1/60,offerHushContact:true,hushDefeated:false}).state;
 assert.equal(next.recovery.contact,'pending');
});

test('a capture victory restores grounded agency without spending the queued punishment',async()=>{
 let won=false;
 const s=createSourceContinuationScene({checkpoint:body(),renderer:renderer(),getContactStatus:ch=>status(ch,won),onContact:()=>true});
 await s.initialize();s.update(1/60);const pose=s.serialize();won=true;
 s.releaseContact({won:true});assert.equal(s.serialize().recovery,null);
 s.update(.25);assert.equal(s.serialize().hush.mode,'yield');assert.equal(s.serialize().recovery,null);
 assert.deepEqual([s.serialize().x,s.serialize().z,s.serialize().feet],[pose.x,pose.z,pose.feet]);s.exit();
});

test('an earned chapter win preserves the delayed door arrival as a passive repeat-Contact presence',()=>{
 let s={...freshSourceContinuation({runId:'legacy-won-chapter'}),status:'active'};
 const origin=[s.hush.x,s.hush.z,s.hush.feet];
 for(let i=0;i<120&&!s.hush.active;i++)s=stepSourceContinuation(s,{dt:.25,hushDefeated:true}).state;
 assert.equal(s.hush.active,true,'a migrated victory must not erase the physical repeat-Contact presence');
 s=stepSourceContinuation(s,{dt:.25,hushDefeated:true}).state;
 assert.equal(s.hush.mode,'yield');assert.equal(s.recovery,null);
 assert.deepEqual([s.hush.x,s.hush.z,s.hush.feet],origin,'winning does not invent a new actor position');
});
