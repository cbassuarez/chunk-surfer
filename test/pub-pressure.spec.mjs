import test from 'node:test';
import assert from 'node:assert/strict';
import {createPubPressure,PUB_PRESSURE_CUE_ID,PUB_PRESSURE_TIMING as T} from '../src/game/pub-pressure.js';
const ready={inPub:true,worldActive:true,watersServed:true,glassSettled:true,still:true,attended:true,quiet:true};
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} should equal ${b}`);
function harness(options){
 const owner=createPubPressure(options),events=[];
 const update=(dt,changes={})=>{const frame=owner.update({...ready,dt,...changes});events.push(...frame.events);return frame;};
 const wait=(duration,changes={},step=.1)=>{let left=duration,frame=owner.view();while(left>1e-12){const dt=Math.min(step,left);frame=update(dt,changes);left-=dt;}return frame;};
 return{owner,events,update,wait,start(){wait(T.settleSeconds);assert.equal(events.filter(e=>e.type==='started').length,1);return owner.view();}};
}

test('an attended, served and settled glass requires a continuous quiet still window',()=>{
 for(const changes of[{inPub:false},{worldActive:false},{watersServed:false},{glassSettled:false},{still:false},{attended:false},{quiet:false},{busy:true}]){
  const h=harness();h.wait(6,changes);assert.equal(h.owner.view().consumed,false,JSON.stringify(changes));assert.equal(h.events.length,0);
 }
 const h=harness();h.wait(.9);h.update(.1,{still:false});assert.equal(h.owner.view().settledFor,0);
 h.wait(T.settleSeconds-.000001);assert.equal(h.owner.view().active,false);h.update(.000001);assert.equal(h.owner.view().active,true);
 assert.equal(h.owner.view().amount,0);assert.equal(h.events[0].type,'started');
});

test('the tremor finishes before one stable note event at the authored boundary',()=>{
 const h=harness();h.start();h.wait(T.tremorSeconds/2);assert.equal(h.owner.view().phase,'tremor');close(h.owner.view().amount,1);
 h.wait(T.tremorSeconds/2);assert.equal(h.owner.view().amount,0);assert.equal(h.owner.view().phase,'waiting-note');
 h.wait(T.noteAt-T.tremorSeconds-.000001);assert.equal(h.events.some(e=>e.type==='note'),false);
 h.update(.000001);assert.equal(h.owner.view().phase,'listening');
 assert.deepEqual(h.events.filter(e=>e.type==='note'),[{type:'note',id:PUB_PRESSURE_CUE_ID,elapsed:T.noteAt}]);
 for(let i=0;i<4;i++)assert.equal(h.owner.view().cueId,PUB_PRESSURE_CUE_ID);
 h.wait(8);assert.equal(h.owner.view().active,false);assert.equal(h.owner.view().amount,0);assert.equal(h.owner.view().consumed,true);
 assert.equal(h.events.filter(e=>e.type==='note').length,1);assert.equal(h.events.filter(e=>e.type==='complete').length,1);
});

test('eligible threshold remainder and note timing survive different frame partitions',()=>{
 for(const step of[1/60,.017,.11,.25]){
  const h=harness();h.wait(T.settleSeconds+T.noteAt-.000001,{},step);assert.equal(h.events.filter(e=>e.type==='note').length,0,`step ${step}`);
  h.update(.000001);assert.equal(h.events.filter(e=>e.type==='note').length,1,`step ${step}`);
  close(h.owner.view().elapsed,T.noteAt);h.wait(T.duration-T.noteAt,{},step);assert.equal(h.owner.view().phase,'complete');
 }
});

test('pause and focus loss freeze eligible time and the visible tremor without firing a note',()=>{
 for(const blocked of[{paused:true,worldActive:false,busy:true},{focused:false,worldActive:false}]){
  const h=harness();h.wait(.6);const settling=h.owner.view();h.wait(4,blocked);close(h.owner.view().settledFor,settling.settledFor);assert.equal(h.events.length,0);
  h.wait(T.settleSeconds-.6);h.wait(.2);const before=h.owner.view();h.wait(4,blocked);
  close(h.owner.view().elapsed,before.elapsed);close(h.owner.view().amount,before.amount);assert.equal(h.owner.view().suspended,true);
  assert.equal(h.events.filter(e=>e.type==='note').length,0);h.wait(T.noteAt-.2);assert.equal(h.events.filter(e=>e.type==='note').length,1);
 }
});

test('UI, recording noise and loading cancel an active attempt with no note deferred until afterward',()=>{
 for(const [blocked,reason]of[[{busy:true},'busy'],[{quiet:false},'not-quiet'],[{worldActive:false},'world-inactive']]){
  const h=harness();h.start();h.wait(.2);const stopped=h.update(.1,blocked);
  assert.equal(stopped.active,false);assert.equal(stopped.amount,0);assert.equal(stopped.consumed,true);assert.equal(stopped.endedBy,reason);
  assert.equal(h.events.filter(e=>e.type==='cancelled').length,1);h.wait(10);assert.equal(h.events.filter(e=>e.type==='note').length,0);assert.equal(h.events.filter(e=>e.type==='started').length,1);
  const pending=harness();pending.wait(.9);pending.update(.1,blocked);assert.equal(pending.owner.view().settledFor,0);pending.wait(.9);assert.equal(pending.owner.view().active,false);
 }
});

test('leaving clears pending presentation and consumes any started attempt across reentry or reload',()=>{
 const h=harness();h.start();h.wait(.2);const leaving=h.update(.1,{inPub:false});
 assert.equal(leaving.endedBy,'left-pub');assert.equal(leaving.amount,0);assert.equal(leaving.elapsed,0);assert.equal(leaving.consumed,true);
 h.wait(20);assert.equal(h.events.filter(e=>e.type==='note').length,0);assert.equal(h.events.filter(e=>e.type==='cancelled').length,1);
 const loaded=harness({consumed:true});loaded.wait(10);assert.equal(loaded.events.length,0);assert.equal(loaded.owner.view().phase,'complete');
 const pending=harness();pending.wait(.9);pending.update(.1,{inPub:false});pending.wait(.9);assert.equal(pending.owner.view().consumed,false);assert.equal(pending.events.length,0);
});

test('saving the started latch does not cancel its live attempt or replay it on a new controller',()=>{
 const h=harness();h.start();assert.equal(h.owner.view().consumed,true);
 h.wait(T.noteAt,{consumed:true});assert.equal(h.events.filter(e=>e.type==='note').length,1);
 const loaded=harness();loaded.wait(5,{consumed:true});assert.equal(loaded.events.length,0);assert.equal(loaded.owner.view().consumed,true);
});

test('loss of framing or movement after the witnessed start does not manufacture another attempt',()=>{
 const h=harness();h.start();h.wait(T.noteAt,{attended:false,still:false,glassSettled:false});
 assert.equal(h.events.filter(e=>e.type==='note').length,1);h.wait(10);assert.equal(h.events.filter(e=>e.type==='started').length,1);
});

test('invalid time is inert and long frame catchup is bounded rather than skipping the whole event',()=>{
 const h=harness();for(const dt of[0,-1,NaN,Infinity,undefined])h.update(dt);
 assert.equal(h.owner.view().settledFor,0);assert.equal(h.events.length,0);
 h.update(50);close(h.owner.view().settledFor,T.maxStep);
 assert.ok(Object.values(h.owner.view()).filter(v=>typeof v==='number').every(Number.isFinite));
 h.owner.reset();assert.equal(h.owner.view().consumed,false);assert.equal(h.owner.view().amount,0);
});

test('presentation is bounded, has no replayed events in view, and does not mutate host input or quest flags',()=>{
 const h=harness(),flags={'pub.help.watersServed':true},input=Object.freeze({...ready,dt:.1,flags});h.owner.update(input);
 assert.deepEqual(flags,{'pub.help.watersServed':true});assert.equal(h.owner.view().events,undefined);
 h.owner.reset();h.start();let nonzero=0;
 for(let i=0;i<300;i++){const frame=h.update(.01);assert.ok(frame.amount>=0&&frame.amount<=1);if(frame.amount>0)nonzero++;if(frame.elapsed>=T.tremorSeconds)assert.equal(frame.amount,0);}
 assert.ok(nonzero>30);assert.equal(h.events.filter(e=>e.type==='note').length,1);
 h.owner.reset({consumed:true});assert.equal(h.owner.view().phase,'complete');assert.equal(h.owner.view().elapsed,0);
});
