import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceContinuationGuidedReview,sourceContinuationGuidedPlan} from '../src/dev/source-continuation-guided-review.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

async function harness({dt=1/60,blocked=false}={}){
 let wall=0,scheduled=null,focused=true,recording=false,owner;
 const listeners=new Map(),panel={style:{},remove(){this.removed=true;}},doc={hidden:false,visibilityState:'visible',hasFocus:()=>focused,body:{append(){}},createElement:()=>panel,addEventListener(){},removeEventListener(){}};
 const scene=createSourceContinuationScene({checkpoint:{...freshSourceContinuation({runId:'guided-unit'}),status:'active'},renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}}});
 await scene.initialize();owner=scene;
 const win={__scenes:{top:()=>owner},__probe:{rec:()=>({recording}),playback:()=>({playing:false})},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 const guide=installSourceContinuationGuidedReview({window:win,document:doc,requestFrame:fn=>(scheduled=fn,1),cancelFrame:()=>{scheduled=null;},now:()=>wall});
 function frame({game=true}={}){if(game&&!blocked)scene.update(dt);wall+=dt*1000;const callback=scheduled;scheduled=null;callback?.(wall);}
 const f6=(trusted=true)=>listeners.get('keydown')?.({code:'F6',isTrusted:trusted,preventDefault(){},stopImmediatePropagation(){}});
 return{scene,guide,win,doc,panel,frame,f6,focus:value=>focused=value,record:value=>recording=value,owner:value=>owner=value};
}

test('the explicit guide never starts on install or an untrusted F6 event, and never owns game time',async()=>{
 const h=await harness();const before=h.scene.serialize();h.frame({game:false});h.f6(false);for(let i=0;i<10;i++)h.frame({game:false});assert.equal(h.guide.status().running,false);assert.deepEqual(h.scene.serialize(),before);
 h.f6();for(let i=0;i<10;i++)h.frame({game:false});const after=h.scene.serialize();assert.equal(after.elapsed,0);assert.equal(after.x,before.x);assert.equal(after.z,before.z);assert.equal(h.guide.status().bodyTeleports,0);assert.equal(h.guide.status().nativeInputs,false);h.guide.dispose();h.scene.exit();
});

test('the plan contains the optional branch, third stair, physical doors and exactly three voluntary descents',()=>{
 const p=sourceContinuationGuidedPlan();assert.deepEqual(p.filter(s=>s.kind==='drop').map(s=>s.id),['catch-lip-0','catch-lip-1','catch-lip-2']);
 assert.deepEqual(p.filter(s=>s.kind==='door').map(s=>s.id),['wrong-false-return','wrong-onward','catch-final']);
 assert.ok(p.some(s=>s.kind==='walk'&&s.x===24&&s.z===-33));assert.ok(p.some(s=>s.kind==='walk'&&s.x===-10&&s.z===-22));
});

for(const dt of[1/60,.2,.25])test(`actual game-owned stepping completes the guided route at ${dt}s frames without a pose or clock bypass`,async()=>{
 const h=await harness({dt});h.f6();let frames=0;const stages=new Set();
 while(h.guide.status().running&&frames++<45000){h.frame();stages.add(h.scene.serialize().level);}
 const result=h.guide.status();assert.equal(result.finished,true,JSON.stringify(result));assert.equal(result.bodyTeleports,0);assert.equal(result.nativeInputs,false);assert.equal(result.cameraGuided,true);assert.equal(h.scene.serialize().completed,true);assert.equal(stages.size,4);assert.ok(h.scene.serialize().elapsed>120);const sight=result.receipts.find(r=>r.type==='actual-eye-look');assert.ok(sight);assert.ok(Math.abs(sight.eye.x-3.85)<.06);assert.ok(Math.abs(sight.eye.z-3)<.06);const dx=sight.target.x-sight.eye.x,dz=sight.target.z-sight.eye.z;assert.ok(Math.abs(sight.yaw-Math.atan2(dx,-dz))<1e-10);assert.ok(Math.abs(sight.pitch-Math.atan2(sight.target.y-sight.eye.y,Math.hypot(dx,dz)))<1e-10);h.guide.dispose();h.scene.exit();
});

test('focus loss, native pause and protected recorder activity release the held walk until another F6',async()=>{
 for(const reason of['focus','pause','recording']){
  const h=await harness();h.f6();for(let i=0;i<180;i++)h.frame();
  if(reason==='focus')h.focus(false);else if(reason==='pause')h.scene.pause();else h.record(true);
  h.frame();assert.equal(h.guide.status().running,false);const before=h.scene.serialize();for(let i=0;i<30;i++)h.frame();assert.equal(h.scene.serialize().x,before.x);assert.equal(h.scene.serialize().z,before.z);h.guide.dispose();h.scene.exit();
 }
});

test('a stuck review stops with an honest receipt and never stages an automatic correction',async()=>{
 const h=await harness({dt:.25,blocked:true});h.f6();for(let i=0;i<150&&h.guide.status().running;i++)h.frame();const state=h.scene.serialize();assert.equal(h.guide.status().running,false);assert.match(h.guide.status().reason,/Stuck/);assert.equal(state.x,0);assert.equal(state.z,2);assert.equal(state.elapsed,0);assert.equal(h.guide.status().bodyTeleports,0);h.guide.dispose();h.scene.exit();
});


test('focus loss during a requested descent resumes its observation without pressing E twice or crediting another stage',async()=>{
 const h=await harness({dt:.2});h.f6();let frames=0;
 while(h.guide.status().running&&!h.guide.status().receipts.some(r=>r.type==='descent-requested')&&frames++<5000)h.frame();
 assert.ok(h.scene.serialize().fall);h.scene.pause();h.focus(false);h.frame();assert.equal(h.guide.status().running,false);
 const pause=h.scene.serialize();for(let i=0;i<5;i++)h.frame();assert.deepEqual(h.scene.serialize(),pause);
 h.scene.resume();h.focus(true);h.f6();while(h.guide.status().running&&frames++<10000)h.frame();
 const result=h.guide.status();assert.equal(result.finished,true,JSON.stringify({reason:result.reason,step:result.step}));
 assert.deepEqual(result.receipts.filter(r=>r.type==='descent-requested').map(r=>r.id),['catch-lip-0','catch-lip-1','catch-lip-2']);h.guide.dispose();h.scene.exit();
});

test('an unexpected observed level stops before the guide can steer the body or camera onto another catch',async()=>{
 const h=await harness({dt:.2});h.f6();let frames=0;
 while(h.guide.status().running&&(h.scene.serialize().level!==1||h.scene.serialize().fall||h.guide.status().stepLabel==='Choose descent 1')&&frames++<5000)h.frame();
 assert.equal(h.scene.serialize().level,1);const before=h.scene.serialize();let commands=0;
 h.owner({id:'source-continuation',view:()=>({...h.scene.view(),level:3}),key(){commands++;},keyup(){commands++;},setLook(){commands++;}});
 h.frame({game:false});assert.equal(h.guide.status().running,false);assert.match(h.guide.status().reason,/Unexpected phase or catch level/);assert.equal(commands,0);assert.deepEqual(h.scene.serialize(),before);assert.equal(h.guide.status().bodyTeleports,0);h.guide.dispose();h.scene.exit();
});
