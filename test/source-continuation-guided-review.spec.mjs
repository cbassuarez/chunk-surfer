import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceContinuationGuidedReview,sourceContinuationGuidedPlan} from '../src/dev/source-continuation-guided-review.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';

async function harness({dt=1/60,blocked=false,alternates=false,topologyLoop=false,stageLoop=topologyLoop}={}){
 let wall=0,scheduled=null,focused=true,recording=false,owner;const events=[];
 const listeners=new Map(),panel={style:{},remove(){this.removed=true;}},doc={hidden:false,visibilityState:'visible',hasFocus:()=>focused,body:{append(){}},createElement:()=>panel,addEventListener(){},removeEventListener(){}};
 const checkpoint={...freshSourceContinuation({runId:'guided-unit'}),status:'active'};
 if(stageLoop){
  const entry={x:0,z:-19,feet:8.4,chartId:0,phase:'wrong-return',level:0,yaw:0,pitch:0};Object.assign(checkpoint,entry,{lastSafe:{...entry},recoveryAnchor:{...entry,kind:'refuge',supportId:'wrong-upper-refuge',earnedAt:0}});
  checkpoint.hush={...checkpoint.hush,x:0,z:-22,feet:8.4,chartId:0,trail:[{kind:'walk',x:0,z:-19,feet:8.4,chartId:0,level:0}],lastRecorded:{x:0,z:-19,feet:8.4,chartId:0,level:0}};
 }
 const scene=createSourceContinuationScene({checkpoint,renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}},onTrace:row=>{if(row.type==='event')events.push(row);}});
 await scene.initialize();owner=scene;
 const win={__scenes:{top:()=>owner},__probe:{rec:()=>({recording}),playback:()=>({playing:false})},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 const guide=installSourceContinuationGuidedReview({window:win,document:doc,requestFrame:fn=>(scheduled=fn,1),cancelFrame:()=>{scheduled=null;},now:()=>wall,alternates,topologyLoop});
 function frame({game=true}={}){if(game&&!blocked)scene.update(dt);wall+=dt*1000;const callback=scheduled;scheduled=null;callback?.(wall);}
 const f6=(trusted=true)=>listeners.get('keydown')?.({code:'F6',isTrusted:trusted,preventDefault(){},stopImmediatePropagation(){}});
 return{scene,guide,win,doc,panel,frame,f6,events,focus:value=>focused=value,record:value=>recording=value,owner:value=>owner=value};
}

test('the explicit guide never starts on install or an untrusted F6 event, and never owns game time',async()=>{
 const h=await harness();const before=h.scene.serialize();h.frame({game:false});h.f6(false);for(let i=0;i<10;i++)h.frame({game:false});assert.equal(h.guide.status().running,false);assert.deepEqual(h.scene.serialize(),before);
 h.f6();for(let i=0;i<10;i++)h.frame({game:false});const after=h.scene.serialize();assert.equal(after.elapsed,0);assert.equal(after.x,before.x);assert.equal(after.z,before.z);assert.equal(h.guide.status().poseWrites,0);assert.equal(h.guide.status().nativeInputs,false);h.guide.dispose();h.scene.exit();
});

test('the plan follows the declared raised return, physical doors and exactly three voluntary descents',()=>{
 const p=sourceContinuationGuidedPlan();assert.deepEqual(p.filter(s=>s.kind==='drop').map(s=>s.id),['catch-lip-0','catch-lip-1','catch-lip-2']);
 assert.deepEqual(sourceContinuationGuidedPlan({alternates:true}).filter(s=>s.kind==='drop').map(s=>s.id),['catch-lip-0-other','catch-lip-1-other','catch-lip-2-other']);
 assert.deepEqual(p.filter(s=>s.kind==='door').map(s=>s.id),['wrong-false-return','wrong-onward','journey-catch-gate','catch-final']);
 assert.deepEqual(p.filter(s=>s.kind==='fold').map(s=>s.id),JOURNEY_PORTALS.slice(0,5).map(portal=>portal.id));
 assert.deepEqual(p.filter(s=>s.kind==='fold').map(s=>s.exit.chartId),[1,2,3,4,0]);
 assert.equal(p.find(s=>s.id==='journey-catch-gate').expectedChart,4);
 assert.equal(p.filter(s=>s.recognitionId).length,8);assert.ok(p.filter(s=>s.recognitionId).every(s=>s.lookTarget&&Number.isFinite(s.feet)&&Number.isFinite(s.chartId)));
 assert.ok(p.some(s=>s.kind==='walk'&&s.x===16&&s.z===-33));assert.ok(p.some(s=>s.kind==='walk'&&s.x===3.85&&s.z===-20));
});

test('the physical closed-loop plan returns through the earlier-chart aperture and stops in the same refuge',()=>{
 const plan=sourceContinuationGuidedPlan({topologyLoop:true});
 assert.deepEqual(plan.filter(s=>s.kind==='fold').map(s=>s.id),['first-return','upper-walk','earlier-upper-return']);
 assert.deepEqual(plan.filter(s=>s.kind==='fold').map(s=>[s.chartId,s.exit.chartId]),[[0,1],[1,2],[2,0]]);
 assert.deepEqual(plan.filter(s=>s.kind==='door').map(s=>s.id),['wrong-onward']);assert.equal(plan.some(s=>s.kind==='drop'),false);
 assert.equal(plan.at(-1).kind,'stop');assert.equal(plan.at(-1).label,'closed-loop-complete');
 const views=plan.filter(s=>s.portalId==='earlier-upper-return'&&s.recognitionId);assert.equal(views.length,2);assert.ok(views.every(s=>s.targetChart===0&&s.chartId===2));
 assert.ok(plan.indexOf(views[1])<plan.findIndex(s=>s.kind==='fold'&&s.id==='earlier-upper-return'));
});

test('the closed loop refuses an undeclared entry instead of relocating the body',async()=>{
 const h=await harness({topologyLoop:true,stageLoop:false}),before=h.scene.serialize();h.guide.start();h.frame({game:false});
 assert.equal(h.guide.status().running,false);assert.equal(h.guide.status().finished,false);assert.match(h.guide.status().reason,/declared upper-refuge fixture/);assert.equal(h.guide.status().poseWrites,0);assert.deepEqual(h.scene.serialize(),before);h.guide.dispose();h.scene.exit();
});

test('ordinary keys physically close the non-Euclidean loop and stop without completing the chapter',async t=>{
 const h=await harness({topologyLoop:true});h.guide.start();let frames=0;
 while(h.guide.status({includeReceipts:false}).running&&frames++<18000)h.frame();
 const result=h.guide.status(),state=h.scene.serialize();
 assert.equal(result.finished,true,JSON.stringify({reason:result.reason,step:result.step,elapsed:state.elapsed,receipts:result.receipts.slice(-5)}));assert.equal(result.reason,'closed-loop-complete');assert.equal(result.poseWrites,0);assert.equal(result.nativeInputs,false);
 assert.equal(state.completed,false);assert.equal(state.phase,'wrong-return');assert.equal(state.chartId,0);assert.equal(state.feet,8.4);assert.ok(Math.hypot(state.x,state.z+19)<.15);
 const ids=result.receipts.filter(r=>r.type==='fold-observed').map(r=>r.id);assert.deepEqual(ids,['first-return','upper-walk','earlier-upper-return']);
 assert.equal(result.receipts.filter(r=>r.type==='closed-loop-complete').length,1);assert.equal(result.receipts.filter(r=>r.type==='recognition-observed'&&r.portalId==='earlier-upper-return').length,2);
 const held=JSON.stringify(state);h.frame({game:false});assert.equal(JSON.stringify(h.scene.serialize()),held,'a finished guide owns no further body movement');
 for(let n=0;n<900;n++){const actor=h.scene.serialize().hush;if(actor.foldSerial===3&&!actor.fall)break;h.frame();}
 const followed=h.scene.serialize(),hushIds=h.events.filter(row=>row.event.type==='hush-fold').map(row=>row.event.id);
 assert.deepEqual(hushIds,ids,'the valid three-metre Hush prefix follows the same three physical portals after the body stops');assert.equal(followed.hush.id,state.hush.id);assert.equal(followed.hush.chartId,0);assert.equal(followed.recovery,null);
 assert.equal(!!followed.hush.fall,false,JSON.stringify({case:'hush-loop-receiving-landing',elapsed:followed.elapsed,pose:{x:followed.hush.x,z:followed.hush.z,feet:followed.hush.feet},mode:followed.hush.mode,bodyTransit:followed.hush.bodyTransit,fall:followed.hush.fall&&{elapsed:followed.hush.fall.elapsed,vy:followed.hush.fall.vy,portalSupport:followed.hush.fall.portalSupport,trigger:followed.hush.fall.trigger}}));assert.equal(followed.hush.feet,8.4,'the actor must finish its own receiving gravity, not merely increment a portal serial');
 assert.deepEqual({x:followed.x,z:followed.z,feet:followed.feet},{x:state.x,z:state.z,feet:state.feet},'the finite closed-loop stop cannot issue further movement while Hush follows');
 t.diagnostic('CLOSED_LOOP_PROOF '+JSON.stringify({elapsed:state.elapsed,pose:{x:state.x,z:state.z,feet:state.feet,chartId:state.chartId},portalIds:ids,recognitionIds:result.receipts.filter(r=>r.type==='recognition-observed').map(r=>r.id),gameCompleted:state.completed,nativeInputs:false,poseWrites:0,hush:{entry:{x:0,z:-22,feet:8.4,chartId:0,trailMetres:3,freshRest:true},chartId:followed.hush.chartId,foldSerial:followed.hush.foldSerial,mode:followed.hush.mode,followedBy:followed.elapsed,portalIds:hushIds,pose:{x:followed.hush.x,z:followed.hush.z,feet:followed.hush.feet}}}));
 h.guide.dispose();h.scene.exit();
});

for(const {dt,alternates} of[{dt:1/60,alternates:false},{dt:.1,alternates:false},{dt:1/60,alternates:true}])test(`actual game-owned stepping completes the ${alternates?'alternate':'main'} guided route at ${dt}s frames without a pose or clock bypass`,async t=>{
 const h=await harness({dt,alternates});h.f6();let frames=0,gate=null;const stages=new Set();
 while(h.guide.status({includeReceipts:false}).running&&frames++<45000){h.frame();const state=h.scene.serialize();stages.add(state.level);if(!gate&&h.guide.status({includeReceipts:false}).stepLabel==='Open the physical Catch gate in this chart')gate=state;}
 const final=h.scene.serialize(),actor=s=>s&&({id:s.hush.id,x:s.hush.x,z:s.hush.z,feet:s.hush.feet,chartId:s.hush.chartId,mode:s.hush.mode,foldSerial:s.hush.foldSerial,queuedHead:s.hush.trail.slice(0,5)});
 t.diagnostic('GUIDE_CHART_PROOF '+JSON.stringify({dt,alternates,elapsed:final.elapsed,gate:{elapsed:gate?.elapsed,actor:actor(gate)},finalActor:actor(final),playerFoldIds:h.events.filter(r=>r.event.type==='fold').map(r=>r.event.id),hushFoldIds:h.events.filter(r=>r.event.type==='hush-fold').map(r=>r.event.id),captures:h.events.filter(r=>r.event.type==='capture').length}));
 assert.deepEqual(h.events.filter(r=>r.event.type==='hush-fold').map(r=>r.event.id),JOURNEY_PORTALS.slice(0,5).map(portal=>portal.id),'the same physical actor must traverse every accepted portal');
 assert.equal(gate?.hush.chartId,4);assert.equal(gate?.hush.foldSerial,4);assert.equal(final.hush.id,gate.hush.id);assert.equal(final.hush.chartId,0);assert.equal(final.hush.foldSerial,5);
 const result=h.guide.status();assert.equal(result.finished,true,JSON.stringify({reason:result.reason,step:result.step,elapsed:result.elapsed,receipts:result.receipts.slice(-5)}));assert.equal(result.poseWrites,0);assert.equal(result.nativeInputs,false);assert.equal(result.cameraGuided,true);assert.equal(h.scene.serialize().completed,true);assert.equal(stages.size,4);assert.ok(h.scene.serialize().elapsed>180);assert.deepEqual(result.receipts.filter(r=>r.type==='descent-requested').map(r=>r.id),['catch-lip-0','catch-lip-1','catch-lip-2'].map(id=>alternates?id+'-other':id));assert.deepEqual(result.receipts.filter(r=>r.type==='fold-observed').map(r=>r.id),JOURNEY_PORTALS.slice(0,5).map(portal=>portal.id));assert.equal(result.receipts.filter(r=>r.type==='recognition-observed').length,8);const sight=result.receipts.find(r=>r.type==='actual-eye-look');assert.ok(sight);assert.ok(Math.abs(sight.eye.x-3.85)<.06);assert.ok(Math.abs(sight.eye.z-3)<.06);const dx=sight.target.x-sight.eye.x,dz=sight.target.z-sight.eye.z;assert.ok(Math.abs(sight.yaw-Math.atan2(dx,-dz))<1e-10);assert.ok(Math.abs(sight.pitch-Math.atan2(sight.target.y-sight.eye.y,Math.hypot(dx,dz)))<1e-10);h.guide.dispose();h.scene.exit();
});

for(const dt of[.2,.25])test(`coarse ${dt}s digital steering records physical rejection without claiming route completion`,async()=>{
 const h=await harness({dt});h.guide.start();let frames=0;
 while(h.guide.status().running&&frames++<10000)h.frame();
 const result=h.guide.status();assert.equal(result.running,false);assert.equal(result.finished,false);assert.equal(h.scene.serialize().completed,false);
 assert.match(result.reason,/Physical .* capture|Stuck|unrequested fall/);assert.equal(result.poseWrites,0);assert.equal(result.nativeInputs,false);
 assert.ok(!result.receipts.some(r=>r.type==='completion-observed'));
 const capture=result.receipts.find(r=>r.type==='physical-capture-observed');if(capture)assert.equal(capture.reason,h.scene.serialize().recovery?.reason);
 const fall=result.receipts.find(r=>r.type==='physical-fall-observed');if(fall)assert.equal(fall.trigger,h.scene.serialize().fall?.trigger);
 const start=result.receipts.find(r=>r.type==='explicit-start');assert.equal(start.trustedGesture,false,'the fixture button API does not claim a native F6 gesture');
 h.guide.dispose();h.scene.exit();
});

test('an ordinary unrequested Space jump is recorded as a physical fall without steering or a completion claim',async()=>{
 const h=await harness();h.f6();h.frame();h.scene.key({key:' '});h.scene.keyup({key:' '});
 const before=h.scene.serialize();assert.equal(before.fall?.trigger,'jump');h.frame({game:false});
 const result=h.guide.status();assert.equal(result.running,false);assert.equal(result.finished,false);assert.match(result.reason,/unrequested fall/);
 assert.equal(result.receipts.find(r=>r.type==='physical-fall-observed')?.trigger,'jump');assert.deepEqual(h.scene.serialize(),before);
 assert.equal(result.poseWrites,0);assert.equal(result.nativeInputs,false);h.guide.dispose();h.scene.exit();
});

test('focus loss, native pause and protected recorder activity release the held walk until another F6',async()=>{
 for(const reason of['focus','pause','recording']){
  const h=await harness();h.f6();for(let i=0;i<180;i++)h.frame();
  if(reason==='focus')h.focus(false);else if(reason==='pause')h.scene.pause();else h.record(true);
  h.frame();assert.equal(h.guide.status().running,false);const before=h.scene.serialize();for(let i=0;i<30;i++)h.frame();assert.equal(h.scene.serialize().x,before.x);assert.equal(h.scene.serialize().z,before.z);h.guide.dispose();h.scene.exit();
 }
});

test('a stuck review stops with an honest receipt and never stages an automatic correction',async()=>{
 const h=await harness({dt:.25,blocked:true});h.f6();for(let i=0;i<150&&h.guide.status().running;i++)h.frame();const state=h.scene.serialize();assert.equal(h.guide.status().running,false);assert.match(h.guide.status().reason,/Stuck/);assert.equal(state.x,0);assert.equal(state.z,2);assert.equal(state.elapsed,0);assert.equal(h.guide.status().poseWrites,0);h.guide.dispose();h.scene.exit();
});


test('focus loss during a requested descent resumes its observation without pressing E twice or crediting another stage',async()=>{
 const h=await harness();h.f6();let frames=0;
 while(h.guide.status({includeReceipts:false}).running&&!h.guide.status().receipts.some(r=>r.type==='descent-requested')&&frames++<30000)h.frame();
 assert.ok(h.scene.serialize().fall);h.scene.pause();h.focus(false);h.frame();assert.equal(h.guide.status().running,false);
 const pause=h.scene.serialize();for(let i=0;i<5;i++)h.frame();assert.deepEqual(h.scene.serialize(),pause);
 h.scene.resume();h.focus(true);h.f6();while(h.guide.status({includeReceipts:false}).running&&frames++<45000)h.frame();
 const result=h.guide.status();assert.equal(result.finished,true,JSON.stringify({reason:result.reason,step:result.step}));
 assert.deepEqual(result.receipts.filter(r=>r.type==='descent-requested').map(r=>r.id),['catch-lip-0','catch-lip-1','catch-lip-2']);h.guide.dispose();h.scene.exit();
});

test('an unexpected observed level stops before the guide can steer the body or camera onto another catch',async()=>{
 const h=await harness();h.f6();let frames=0;
 while(h.guide.status({includeReceipts:false}).running&&(h.scene.serialize().level!==1||h.scene.serialize().fall||h.guide.status({includeReceipts:false}).stepLabel==='Choose descent 1')&&frames++<30000)h.frame();
 assert.equal(h.scene.serialize().level,1);const before=h.scene.serialize();let commands=0;
 h.owner({id:'source-continuation',view:()=>({...h.scene.view(),level:3}),key(){commands++;},keyup(){commands++;},setLook(){commands++;}});
 h.frame({game:false});assert.equal(h.guide.status().running,false);assert.match(h.guide.status().reason,/Unexpected phase or catch level/);assert.equal(commands,0);assert.deepEqual(h.scene.serialize(),before);assert.equal(h.guide.status().poseWrites,0);h.guide.dispose();h.scene.exit();
});
