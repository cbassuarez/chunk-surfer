import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/game/cassette-ledger.js';
import {checkoffPlan,checkoffPenAt,makeWorkOrderCheckoffScene,CHECKOFF_TIMING} from '../src/game/work-order-checkoff.js';

const take=(l,roomId,outcome,extra={})=>L.recordOnCassette(l,L.nextCassette(l).n,{roomId,outcome,...extra}).ledger;
const signed=()=>L.recordLevelCheck(L.signWorkOrder(L.createCassetteLedger('contract'),{time:'21:42'}));
function scene(ledger,seen,extra={}){const drawn=[],closed=[],seenAt=[];
  const s=makeWorkOrderCheckoffScene({marks:ledger.marks,seenOrder:seen,ink:{draw:(marks,pen)=>({pen})},drawSheet:f=>drawn.push(f),
    onSeen:o=>seenAt.push(o),onClose:()=>closed.push(true),...extra});return{s,drawn,closed,seenAt};}
const run=(s,seconds)=>{for(let t=0;t<seconds;t+=.05)s.update(.05);};

test('the pen writes only what is new, one mark after another, at a hand’s pace',()=>{
  const before=signed(),after=take(before,'main_b3','clean');
  const plan=checkoffPlan(after.marks,before.order);
  assert.deepEqual(plan.steps.map(s=>s.kind),['label-strike','slash','note','tick','strike']);
  assert.ok(plan.writing>1.5&&plan.writing<12,`${plan.writing}s of writing`);
  assert.equal(checkoffPlan(after.marks,after.order).steps.length,0,'nothing is written twice');
  assert.ok(!checkoffPlan(after.marks,0).steps.some(s=>['shift','issued','signature'].includes(s.kind)),'the lodge signature is already on the sheet');
  const mid=plan.steps[2];assert.deepEqual(checkoffPenAt(plan,mid.start+mid.seconds/2),{order:mid.order,fraction:.5});
  assert.deepEqual(checkoffPenAt(plan,plan.writing+1),{order:Infinity,fraction:1});
});

test('he lets the stop land first; then his hands are busy but the world keeps running',()=>{
  const before=signed(),after=take(before,'the_tub','rejected',{cause:'BREATH',atSec:41}),{s}=scene(after,before.order);
  assert.equal(s.blocksWorld,false);assert.equal(s.allowsLook,true);
  assert.equal(s.blocksInput,false,'nothing is held up while the transport clicks off');
  run(s,CHECKOFF_TIMING.wait+.1);assert.equal(s.blocksInput,true);assert.equal(s.view().phase,'raising');
});

test('a step, interact or Escape lowers the sheet, and what was left is counted as written',()=>{
  const before=signed(),after=take(before,'main_b3','clean'),{s,closed,seenAt}=scene(after,before.order);
  run(s,CHECKOFF_TIMING.wait+CHECKOFF_TIMING.raise+.3);assert.equal(s.view().phase,'writing');
  assert.equal(s.key({key:'w'}),true);assert.deepEqual(seenAt,[after.order]);
  run(s,CHECKOFF_TIMING.lower+.1);assert.deepEqual(closed,[true]);assert.equal(s.blocksInput,false);
  assert.equal(scene(after,before.order).s.key({key:'q'}),false,'other keys are not taken while it waits');
});

test('left alone it writes, lingers and goes down by itself; reduced motion writes it whole',()=>{
  const before=signed(),after=take(before,'main_b3','clean'),{s,closed,drawn}=scene(after,before.order);
  run(s,CHECKOFF_TIMING.wait+CHECKOFF_TIMING.raise+checkoffPlan(after.marks,before.order).writing+CHECKOFF_TIMING.linger+CHECKOFF_TIMING.lower+1);
  assert.deepEqual(closed,[true]);
  const quiet=scene(after,before.order,{reducedMotion:true});run(quiet.s,CHECKOFF_TIMING.wait+.1);quiet.s.render();
  assert.equal(quiet.drawn.at(-1).lift,1);assert.deepEqual(quiet.drawn.at(-1).ink.pen,{order:Infinity,fraction:1});
});
