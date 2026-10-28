import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';
import { busWomanInstances, busWomanPerformance } from '../src/game/bus-woman-presentation.js';
import { packShadowFrames, unpackShadowFrames } from '../src/causal/tape.js';
import { CausalRecorder } from '../src/causal/recorder.js';
import { runtimeTree } from '../src/narrative/runtime-content.js';
import { outskirtsChoiceId, outskirtsPhysicalAction } from '../src/game/outskirts-choice.js';

const fixture=()=>{const built=buildPreTapeGodPreset(0,{seed:4417,marbleEyes:'returned'});const runtime=createSourceSpaceRuntime({initialState:built.state});runtime.setPlayerPosition(built.position);return runtime;};
const stand=(runtime,p)=>{
  const at={x:(p.x-Math.sin(p.yaw))/CELL-.5,y:(p.z-Math.cos(p.yaw))/CELL-.5};
  runtime.setPlayerPosition(at);
  assert.equal(runtime.geometry.canStep(at.x,at.y,at.x,at.y).ok,true,'the visitor stands in front of the shelter on supported ground');
  return at;
};
const frame=runtime=>runtime.propInstances(undefined,undefined,{time:1e9});
const body=runtime=>frame(runtime).find(p=>p.id==='r0-bus-woman');
const advance=(runtime,seconds,suspended=false)=>{for(let t=0;t<seconds-1e-8;t+=.05)runtime.tickOutskirtsCharacters(Math.min(.05,seconds-t),{suspended});};

test('authored road choices retain their physical verbs after runtimeTree converts IDs',()=>{
  const tree=runtimeTree('source-space.outskirts');
  const choice=(node,id)=>tree[node].choices.find(entry=>entry.sourceId===id);
  const ticket=choice('woman-return','outskirts.woman.give');
  assert.equal(ticket.id,undefined);
  assert.equal(outskirtsChoiceId(ticket),'outskirts.woman.give');
  assert.equal(outskirtsPhysicalAction(ticket),'ticket');
  assert.equal(outskirtsPhysicalAction(choice('postbox-letter','outskirts.postbox.post')),'post');
  assert.equal(outskirtsPhysicalAction(choice('ledger-3','outskirts.ledger.sign')),'sign');
  assert.equal(outskirtsPhysicalAction(choice('woman-return','outskirts.woman.keep')),null);
});

test('the selected presentation consumes existing instances and never creates a woman elsewhere',()=>{
  const unrelated={id:'ordinary-chair',mesh:'chair'};
  assert.deepEqual(busWomanInstances(unrelated),[unrelated]);
  const woman={id:'yard-bus-waiter',mesh:'exterior_bus_woman',x:5,y:0,z:8,yaw:.4};
  const parts=busWomanInstances(woman,{mode:'ticket-wait',seconds:1});
  assert.deepEqual(parts.map(p=>p.mesh),['exterior_bus_woman','bus_woman_bag','bus_woman_ticket']);
  assert.ok(parts.every(p=>p.x===5&&p.z===8&&p.yaw===.4));
  assert.equal(parts.filter(p=>p.mesh==='exterior_bus_woman').length,1);
  assert.equal(outskirtsArrivalLayout().filter(p=>/^bus-woman/.test(p.key)).length,13);
  assert.equal(outskirtsArrivalLayout().filter(p=>/^bus-woman/.test(p.key)&&p.stretch>12).length,0);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/instance\.id!==?'yard-bus-waiter'|instance\.id!=='yard-bus-waiter'/);
});

test('receiving uses a saved finite gesture, stores the paper, and later waits with it',()=>{
  const runtime=fixture(),p=runtime.outskirtsPiece('r0-bus-woman');stand(runtime,p);
  runtime.setOutskirtsWorldState({ticketAsked:true,ticketFound:true,ticketReturned:false});
  assert.equal(runtime.outskirtsPerformAction({action:'ticket',pass:0}).handled,true);
  runtime.setOutskirtsWorldState({ticketReturned:true});
  assert.equal(body(runtime).character.clip,'bus_woman_receive');
  advance(runtime,1.25);
  assert.ok(frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'));
  const paused=JSON.stringify(frame(runtime).filter(p=>/^r0-bus-woman/.test(p.id)));
  advance(runtime,2,true);
  assert.equal(JSON.stringify(frame(runtime).filter(p=>/^r0-bus-woman/.test(p.id))),paused,'pause advanced a receipt');
  const restored=createSourceSpaceRuntime({initialState:JSON.parse(JSON.stringify(runtime.state()))});
  stand(restored,p);
  restored.setOutskirtsWorldState({ticketReturned:true});
  assert.deepEqual(body(restored).character,body(runtime).character,'reload restarted the receipt');
  advance(runtime,3);
  assert.equal(body(runtime).character.clip,'bus_woman_wait');
  assert.ok(!frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'),'stored paper still floats at the hand');
  advance(runtime,4.75);
  assert.equal(body(runtime).character.clip,'bus_woman_ready');
  assert.ok(!frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'),'the ticket appeared before clearing the pocket');
  advance(runtime,1);
  assert.ok(frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'),'the ticket did not emerge during retrieval');
  advance(runtime,1);
  assert.equal(body(runtime).character.clip,'bus_woman_ticket_wait');
  assert.ok(frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'));
});

test('an already returned ticket loads in its settled state rather than replaying the give',()=>{
  const runtime=fixture(),p=runtime.outskirtsPiece('r0-bus-woman');stand(runtime,p);
  runtime.setOutskirtsWorldState({ticketReturned:true});
  assert.equal(body(runtime).character.clip,'bus_woman_ticket_wait');
  assert.equal(runtime.outskirtsCharacterFrame().woman.receivedAt,null);
  assert.equal(busWomanPerformance({clock:12,aboard:true}).mode,'wait','standing aboard starts an unmotivated pocket search');
});

test('recorded Outskirts woman state is presentation authority, independent of live flags',()=>{
  const runtime=fixture(),p=runtime.outskirtsPiece('r0-bus-woman');stand(runtime,p);
  runtime.setOutskirtsWorldState({ticketReturned:true});advance(runtime,1);
  const saved=runtime.outskirtsCharacterFrame();
  runtime.setOutskirtsWorldState({ticketReturned:false});
  runtime.applyOutskirtsCharacterFrame(saved);
  runtime.setOutskirtsWorldState({ticketReturned:false});
  assert.equal(body(runtime).character.clip,'bus_woman_ticket_wait');
  assert.ok(frame(runtime).some(p=>p.id==='r0-bus-woman:return-half'));
  const packed=packShadowFrames([{t:0,x:0,y:0,spaceId:'source-space',outskirtsCharacters:saved},{t:1000,x:0,y:0,spaceId:'source-space',outskirtsCharacters:{...saved,clock:saved.clock+1}}]);
  assert.deepEqual(unpackShadowFrames(packed).map(p=>p.outskirtsCharacters.woman),[saved.woman,saved.woman]);
});

test('the ordinary yard pose clock survives tape packing and bounded replay windows',()=>{
  const recorder=new CausalRecorder();recorder.begin({runId:'bus-woman-test'});
  for(let i=0;i<4;i++)recorder.tick(.2,{x:2,y:3,spaceId:'conservatory',busWomanYardTime:8+i*.2});
  const window=recorder.poseWindow({maxFrames:8});
  assert.ok(window.length>=2);
  assert.ok(window.every(p=>Number.isFinite(p.busWomanYardTime)));
  const packed=packShadowFrames(window),restored=unpackShadowFrames(packed);
  assert.deepEqual(restored.map(p=>p.busWomanYardTime),window.map(p=>p.busWomanYardTime));
  const without=unpackShadowFrames(packShadowFrames([...window,{t:2000,x:0,y:0,spaceId:'source-space'}]));
  assert.equal(without.at(-1).busWomanYardTime,undefined,'an old yard pose leaked into a different space');
});
