import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoorAudioEventPolicy,DOOR_BELL_FRACTION} from '../src/audio/door-events.js';

const door=(id='pub-west-entry',state='closed',openFraction=0)=>({id,activeLeaves:[0,1],runtime:{state,openFraction}});
const pose=(p,state,fraction)=>{p.runtime.state=state;p.runtime.openFraction=fraction;return p;};
const kinds=events=>events.map(e=>e.type);
const soundStarts=events=>events.filter(e=>!['movement','movement-stop'].includes(e.type));

test('initial stable doors and new doors seed silently, including an already-open Lyric',()=>{
  const policy=createDoorAudioEventPolicy(),closed=door(),open=door('pub-east-entry','open',1);
  assert.deepEqual(policy.observe([closed,open],.1),[]);
  assert.deepEqual(policy.observe([closed,open],.1),[]);
  assert.deepEqual(policy.observe([closed,open,door('practice-west-1')],.1),[]);
});

test('one paired opening has one start, then one angle-triggered bell with no duplicate semantic noise',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  let events=policy.observe([pose(p,'opening',0)],0);
  assert.deepEqual(kinds(events),['opening-start']);assert.equal(events[0].semanticKind,'door_open');
  assert.equal(events[0].portal,p);assert.equal(events[0].fromClosed,true);
  events=policy.observe([pose(p,'opening',.08)],.08);
  assert.deepEqual(kinds(events),['movement']);assert.equal(events[0].speed,1);assert.equal(events[0].started,true);
  events=policy.observe([pose(p,'opening',.15)],.07);
  const bell=events.filter(e=>e.type==='bell');assert.equal(bell.length,1);assert.equal(bell[0].threshold,DOOR_BELL_FRACTION);
  assert.equal(bell[0].semanticKind,null);assert.equal(bell[0].previousFraction,.08);
  assert.equal(events.filter(e=>e.semanticKind).length,0,'two active leaves do not create two world-noise events');
  assert.equal(policy.observe([pose(p,'opening',.8)],.65).filter(e=>e.type==='bell').length,0);
});

test('idempotent priming and repeat observations do not lose or repeat an armed bell',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  policy.observe([pose(p,'opening',.05)],.05);policy.prime([p]);
  const events=policy.observe([pose(p,'opening',.14)],.09);assert.equal(events.filter(e=>e.type==='bell').length,1);
  assert.deepEqual(policy.observe([p],0),[]);assert.equal(policy.observe([p],.2).filter(e=>e.type==='bell').length,0);
});

test('a partial re-close and reversal cannot ring again or produce a false closing contact',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  policy.observe([pose(p,'opening',.4)],.4);
  let events=policy.observe([pose(p,'closing',.3)],.1);assert.equal(events.filter(e=>e.type==='closed').length,0);
  events=policy.observe([pose(p,'opening',.3)],0);
  assert.equal(events.filter(e=>e.type==='opening-start').length,1);assert.equal(events.find(e=>e.type==='opening-start').fromClosed,false);
  events=policy.observe([pose(p,'opening',.8)],.5);assert.equal(events.filter(e=>e.type==='bell'||e.type==='closed').length,0);
});

test('closing starts before travel but only actual contact emits semantic door_close',()=>{
  const policy=createDoorAudioEventPolicy(),p=door('pub-west-entry','open',1);policy.prime([p]);
  let events=policy.observe([pose(p,'closing',1)],0);
  assert.deepEqual(kinds(events),['closing-start']);assert.equal(events[0].semanticKind,null);
  assert.deepEqual(policy.observe([p],.5),[],'a held closer cannot start friction or an impact');
  events=policy.observe([pose(p,'closing',.7)],.3);
  assert.equal(events.find(e=>e.type==='movement').started,true);assert.equal(events.find(e=>e.type==='movement').direction,-1);
  assert.equal(events.filter(e=>e.semanticKind).length,0);
  events=policy.observe([pose(p,'closed',0)],.7);
  assert.equal(events.filter(e=>e.type==='closed').length,1);assert.equal(events.find(e=>e.type==='closed').semanticKind,'door_close');
  assert.equal(events.find(e=>e.type==='closed').previousFraction,.7);
  assert.deepEqual(policy.observe([p],.1),[]);
});

test('zero-dt pre-tick pumps keep moving audio, while a real occupied interval stops it once',()=>{
  const policy=createDoorAudioEventPolicy(),p=door('service','open',1);policy.prime([p]);
  policy.observe([pose(p,'closing',.8)],.2);
  assert.deepEqual(policy.observe([p],0),[],'pre-tick pump must not stutter the travel voice');
  let events=policy.observe([p],.2);assert.deepEqual(kinds(events),['movement-stop']);assert.equal(events[0].reason,'held');
  assert.deepEqual(policy.observe([p],.2),[]);
  events=policy.observe([pose(p,'closing',.6)],.2);assert.equal(events.find(e=>e.type==='movement').started,true,'resumption starts only with real travel');
  assert.equal(events.filter(e=>e.semanticKind).length,0);
});

test('full closure rearms the same bell for the next opening, while holding open does not',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  policy.observe([pose(p,'opening',.2)],.2);policy.observe([pose(p,'open',1)],.8);
  assert.deepEqual(policy.observe([p],5),[]);
  policy.observe([pose(p,'closing',.4)],.6);policy.observe([pose(p,'closed',0)],.4);
  const events=policy.observe([pose(p,'opening',.2)],.2);assert.equal(events.filter(e=>e.type==='bell').length,1);
});

test('runtime-object replacement silently restores an interrupted swing and stops its old travel',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);policy.observe([pose(p,'opening',.3)],.3);
  p.runtime={state:'closed',openFraction:0};
  const events=policy.observe([p],0);assert.deepEqual(kinds(events),['movement-stop']);assert.equal(events[0].reason,'runtime-replaced');
  assert.equal(events[0].baselineReset,true);assert.equal(events[0].semanticKind,null);assert.deepEqual(soundStarts(events),[]);
  assert.deepEqual(policy.observe([p],.3),[]);
  assert.equal(policy.observe([pose(p,'opening',.2)],.2).filter(e=>e.type==='bell').length,1);
});

test('value-snapshot restore uses explicit reset, and direct stable endpoint jumps never sound like a swing',()=>{
  const policy=createDoorAudioEventPolicy();policy.prime([{id:'pub-west-entry',state:'closed',openFraction:0}]);
  assert.deepEqual(policy.observe([{id:'pub-west-entry',state:'open',openFraction:1}],.1),[]);
  assert.deepEqual(policy.observe([{id:'pub-west-entry',state:'closed',openFraction:0}],.1),[]);
  policy.observe([{id:'pub-west-entry',state:'opening',openFraction:.3}],.3);
  policy.reset();policy.prime([{id:'pub-west-entry',state:'closed',openFraction:0}]);
  assert.deepEqual(policy.observe([{id:'pub-west-entry',state:'closed',openFraction:0}],.1),[]);
});

test('only the two real Lyric entries ring; other glazed doors keep their own identity',()=>{
  const policy=createDoorAudioEventPolicy(),entries=[door(),door('pub-east-entry'),door('front-main'),door('pool-lobby')];policy.prime(entries);
  const events=policy.observe(entries.map(p=>pose(p,'opening',.2)),.2);
  assert.deepEqual(events.filter(e=>e.type==='bell').map(e=>e.doorId),['pub-west-entry','pub-east-entry']);
  assert.equal(events.filter(e=>e.semanticKind==='door_open').length,4);
});

test('removing a moving portal releases its travel voice without a made-up catch',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);policy.observe([pose(p,'opening',.3)],.3);
  const events=policy.observe([],.1);assert.deepEqual(kinds(events),['movement-stop']);assert.equal(events[0].reason,'removed');assert.equal(events[0].portal,p);
  assert.equal(events[0].semanticKind,null);assert.deepEqual(policy.observe([],.1),[]);
});

test('bad input and zero elapsed observations never invent nonfinite velocity',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  assert.deepEqual(policy.observe([null,{id:'invalid',state:'missing',openFraction:NaN},p],NaN),[]);
  const events=policy.observe([pose(p,'opening',.2)],0);assert.ok(events.every(e=>Number.isFinite(e.speed)&&e.speed===0));
});

test('a world/audio hold preserves a pending bell and resumes motion without another opening event',()=>{
  const policy=createDoorAudioEventPolicy(),p=door();policy.prime([p]);
  policy.observe([pose(p,'opening',.06)],.06);policy.hold();
  assert.deepEqual(policy.snapshot(),[{doorId:p.id,phase:'opening',fraction:.06,moving:false,bellArmed:true}]);
  assert.deepEqual(policy.observe([p],0),[]);
  let events=policy.observe([pose(p,'opening',.2)],.14);
  assert.equal(events.find(e=>e.type==='movement').started,true);
  assert.equal(events.filter(e=>e.type==='bell').length,1,'the unstruck bell still belongs to this swing');
  assert.equal(events.filter(e=>e.semanticKind).length,0,'resuming does not repeat door_open');
  policy.hold();events=policy.observe([pose(p,'opening',.4)],.2);
  assert.equal(events.find(e=>e.type==='movement').started,true);
  assert.equal(events.filter(e=>e.type==='bell').length,0,'an already-struck bell stays unarmed across a hold');
});

test('closing motion resumes after hold, while only its later real endpoint emits the contact',()=>{
  const policy=createDoorAudioEventPolicy(),p=door('service','open',1);policy.prime([p]);
  policy.observe([pose(p,'closing',.7)],.3);policy.hold();policy.hold();
  assert.deepEqual(policy.observe([p],0),[]);
  let events=policy.observe([pose(p,'closing',.4)],.3);
  assert.equal(events.find(e=>e.type==='movement').started,true);assert.equal(events.find(e=>e.type==='movement').direction,-1);
  assert.equal(events.filter(e=>e.semanticKind).length,0);
  events=policy.observe([pose(p,'closed',0)],.4);
  assert.equal(events.filter(e=>e.semanticKind==='door_close').length,1);
});
