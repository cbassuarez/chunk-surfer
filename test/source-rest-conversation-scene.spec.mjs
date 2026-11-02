import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {sourceRestColdOpenNodes,makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';

test.afterEach(()=>scenes.clear());
const sample={id:'test-rest',phase:'catch',entry:'arrival',nodes:{arrival:{lines:[],choices:[
  {id:'stay',label:'Stay here. Let me die.',action:'commit'},
  {id:'rise',label:'Get up.',action:'leave'},
]}}};

test('authored graph maps to existing picker destinations and keeps spoken lines distinct',()=>{
  const story=sourceRestConversation('wrong-return'),nodes=sourceRestColdOpenNodes(story);
  assert.equal(nodes.arrival.lines[0].who,'unknown');
  assert.equal(nodes.arrival.lines[0].voice,false,'the unknown interlocutor uses the display, not a synthesized voice');
  assert.equal(nodes.arrival.lines[1].who,'me');
  assert.equal(nodes.arrival.lines[1].say,false);
  assert.equal(nodes.arrival.lines[1].voice,false,'the player text also stays on the display');
  assert.equal(nodes.arrival.goto,'first-choice');
  assert.equal(story.nodes.last.action,'commit','the final music exchange resolves automatically');
});

test('cinematic transcript leaves the physical Source scene and its world clock live',()=>{
  let ticks=0,result=[];
  const world={id:'source',blocksWorld:true,blocksInput:true,allowsLook:true,update(){ticks++;}};
  const scene=makeSourceRestConversationScene({story:sample,onDone:x=>result.push(x)});
  scenes.push(world);scenes.push(scene);
  assert.equal(scene.blocksWorld,false);assert.equal(scene.blocksInput,true);
  assert.equal(scene.sourcePressureLive,true);assert.equal(scene.view().presentation,'cinematic');
  scenes.update(1);assert.equal(ticks,1);
  scenes.key({key:'Escape'});
  assert.deepEqual(result,['leave']);assert.equal(scenes.top(),world);
  scene.key({key:'Escape'});assert.deepEqual(result,['leave'],'a stale input cannot deliver twice');
});

test('a terminal selection removes only its own scene and delivers commit once',()=>{
  let result=[];
  const world={id:'source',blocksWorld:true,blocksInput:true};scenes.push(world);
  const scene=makeSourceRestConversationScene({story:sample,onDone:x=>result.push(x)});scenes.push(scene);
  assert.equal(scene.view().pending.kind,'branch');
  scenes.key({key:'Enter'});
  assert.deepEqual(result,['commit']);assert.equal(scenes.top(),world);
  scene.key({key:'Escape'});assert.deepEqual(result,['commit']);
});

test('external interruption returns leave without pretending the player committed',()=>{
  let result=[];
  const scene=makeSourceRestConversationScene({story:sample,onDone:x=>result.push(x)});scenes.push(scene);
  scenes.remove(scene);
  assert.deepEqual(result,['leave']);
});

test('the recorder verb remains available during a real choice and cannot choose or advance a reply',()=>{
  let requests=0,result=[];
  const scene=makeSourceRestConversationScene({story:sample,onRecorder:()=>requests++,onDone:x=>result.push(x)});
  scenes.push(scene);const before=scene.view();
  scenes.key({key:'r',code:'KeyR'});scenes.key({key:'r',code:'KeyR',repeat:true});
  assert.equal(requests,1);assert.deepEqual(scene.view().pending,before.pending);assert.deepEqual(result,[]);
  scenes.key({controllerAction:'recorder'});assert.equal(requests,2);
});

test('a same-phase return begins at the unread line without replaying prior choices',()=>{
  let choices=0;
  const story={id:'resume-rest',phase:'catch',entry:'start',nodes:{start:{lines:[{who:'other',text:'First.'},{who:'other',text:'Second.'}],next:'later'},
    later:{lines:[{who:'other',text:'Still here.'}],choices:[]}}};
  const first=makeSourceRestConversationScene({story,onChoice:()=>choices++});scenes.push(first);
  scenes.update(1);scenes.key({key:' '});
  const checkpoint=first.checkpoint();assert.equal(checkpoint.lineSourceId,'resume-rest:start:line:1');scenes.remove(first);
  const resumed=makeSourceRestConversationScene({story,resumeFrom:checkpoint,onChoice:()=>choices++});scenes.push(resumed);
  assert.equal(resumed.view().line.text,'Second.');assert.equal(choices,0);
});
