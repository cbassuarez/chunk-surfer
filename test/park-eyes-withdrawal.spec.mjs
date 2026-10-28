import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as HEAD from '../src/game/marble-head.js';
import * as scenes from '../src/game/scenes.js';
import {planThoughtTextPanel,thoughtHad,markThought,resetThoughts,loadThoughtState,saveThoughtState} from '../src/game/thoughts.js';
import {createConversation} from '../src/game/conversation.js';
import {createReplayService} from '../src/progression/knowledge.js';
import {runtimeTree,narrativeDocument} from '../src/narrative/runtime-content.js';
import {validateNarrativeDocument,reachableNodeIds} from '../src/narrative/contracts.js';

// Run the production thought factory with a fixed text viewport. No drawing
// or audio backend is required for its actual conversation/input lifecycle.
const thoughtModule=fs.readFileSync(new URL('../src/game/thoughts.js',import.meta.url),'utf8');
const thoughtFactory=thoughtModule.slice(thoughtModule.indexOf('export function makeThoughtScene('),thoughtModule.indexOf('// ── which thoughts')).replace('export function','function');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function actualFunction(name){
  const start=main.indexOf(`function ${name}(`);assert.ok(start>=0,`missing production ${name}`);
  return main.slice(start,main.indexOf('\n}',start)+2);
}
let host,receipts,lit,flags,keys;
test.beforeEach(()=>{
  scenes.clear();HEAD.resetMarbleHead();resetThoughts();lit=true;flags={};keys=new Set();receipts=[];
  host=vm.createContext({
    HEAD,scenes,planThoughtTextPanel,createConversation,thoughtHad,markThought,saveThoughtState,createReplayService,
    BAND_W:86,uiSize:()=>({cols:120,rows:60}),
    storyMode:true,planName:'conservatory',NO_THINK:true,
    PARK_EYES:{at:{x:0,y:1},reachM:4.2,seeCos:.72},CELL:1,px:0,py:0,
    FP:{toRuntimePoint:p=>p},mapHeading:()=>Math.PI,
    PARK_EYES_THOUGHT:runtimeTree('conservatory.park_eyes'),
    REC:{lightOn:()=>lit,emitNoise:()=>{}},SPEECH:{say:()=>{},sayAll:()=>{}},
    ensureCtx:()=>{},STORY:undefined,actx:null,dialogGain:null,master:null,CR:{fx:undefined},
    fireCue:id=>receipts.push({cue:id}),applyStoryChoice:()=>{},
    saveCommit:value=>receipts.push({save:value}),
    syncMarbleHeadProps:()=>receipts.push({sync:true}),saveMarbleHead:()=>receipts.push({head:HEAD.saveMarbleHead()}),
    SERVICES_KEY_HOST:'academic-bust-5',playerKeys:keys,
    flagTest:id=>flags[id]===true,flagApply:ids=>ids.forEach(id=>flags[id]=true),getSave:()=>({items:[]}),
  });
  vm.runInContext([thoughtFactory,actualFunction('think'),actualFunction('parkEyesInReach'),actualFunction('interactParkEyes'),actualFunction('takeServicesKey')].join('\n'),host);
});
test.afterEach(()=>{scenes.clear();HEAD.resetMarbleHead();resetThoughts();});

function reachBranch(scene,nodeId){
  for(let i=0;i<30;i++){
    const v=scene.view();if(v.nodeId===nodeId&&v.pending?.kind==='branch')return v;
    assert.equal(scenes.top(),scene,`conversation ended before ${nodeId}`);
    scene.update(100);scene.key({key:'Enter'});
  }
  assert.fail(`did not reach branch ${nodeId}`);
}
function choose(scene,nodeId,goto){
  const v=reachBranch(scene,nodeId),index=v.pending.options.findIndex(c=>c.goto===goto);
  assert.ok(index>=0,`${nodeId} lacks ${goto}`);
  for(let i=0;i<index;i++)scene.key({key:'ArrowDown'});
  scene.key({key:'Enter'});
}
function finish(scene){
  for(let i=0;i<15&&scenes.top()===scene;i++){scene.update(100);scene.key({key:'Enter'});}
  assert.equal(scenes.top(),null,'the thought releases the ordinary world');
}
function inspect(){assert.equal(host.interactParkEyes(),true);return scenes.top();}
function savedThought(){return receipts.filter(r=>r.save?.thoughts).at(-1).save.thoughts;}
function reload(head=HEAD.saveMarbleHead(),thought=savedThought()){
  scenes.clear();HEAD.resetMarbleHead();resetThoughts();HEAD.loadMarbleHead(head);loadThoughtState(thought);
}

test('authored first withdrawal is reachable and distinct from a deliberate refusal of recognised eyes',()=>{
  const doc=narrativeDocument('conservatory.park_eyes'),tree=runtimeTree(doc.id);
  assert.deepEqual(validateNarrativeDocument(doc).errors,[]);
  assert.deepEqual([...reachableNodeIds(doc)].sort(),Object.keys(doc.nodes).sort());
  const firstLeave=tree.start.choices.find(c=>c.sourceId==='start.choice.2');
  assert.equal(firstLeave.text,'leave the wishing well alone');
  assert.equal(firstLeave.goto,'withdraw');assert.equal(firstLeave.eyeChoice,undefined);
  assert.ok(tree.withdraw.lines.length>0);assert.equal(tree.withdraw.choices,undefined);
  const knownLeave=tree.closer.choices.find(c=>c.sourceId==='closer.choice.2');
  assert.equal(knownLeave.goto,'leave');assert.equal(knownLeave.eyeChoice,'leave');
});

test('withdrawing before recognition survives thought memory and reload without terminally declining the eyes',()=>{
  const original=HEAD.saveMarbleHead(),scene=inspect();
  choose(scene,'start','withdraw');finish(scene);
  assert.deepEqual(HEAD.saveMarbleHead(),original);
  assert.equal(HEAD.marbleHeadInWater(),true);assert.equal(HEAD.marbleHeadSettled(),false);
  assert.equal(thoughtHad('park-eyes'),true,'the ordinary thought receipt still records the visit');
  assert.equal(receipts.some(r=>r.sync||r.head),false,'withdrawal never commits an eye handover or removes the basin prop');
  assert.equal(host.takeServicesKey('academic-bust-5'),false,'withdrawal does not grant a key prematurely');
  reload();
  assert.equal(thoughtHad('park-eyes'),true);
  const reopened=inspect();assert.equal(reopened.id,'thought:park-eyes');
  choose(reopened,'start','closer');reachBranch(reopened,'closer');
  assert.equal(HEAD.marbleHeadDeclined(),false,'recognition is still available after a saved first visit');
});

test('returning after an early withdrawal can take the eyes, restore the face and earn the same services key',()=>{
  let scene=inspect();choose(scene,'start','withdraw');finish(scene);reload();
  scene=inspect();choose(scene,'start','closer');choose(scene,'closer','take');finish(scene);
  assert.equal(HEAD.carryingMarbleHead(),true);assert.equal(HEAD.collectMarbleHead(),false);
  assert.equal(receipts.filter(r=>r.cue==='bag').length,1);
  assert.equal(host.interactParkEyes(),false,'carried eyes are no longer a basin interaction');
  assert.equal(host.takeServicesKey('academic-bust-5'),false,'the existing return condition remains necessary');
  assert.equal(HEAD.returnMarbleHead(HEAD.MARBLE_HEAD_BUST),true);
  assert.equal(host.takeServicesKey('academic-bust-5'),true);
  assert.equal(keys.has('services-core'),true);assert.equal(flags['key.servicesCore'],true);
  assert.equal(host.takeServicesKey('academic-bust-5'),false,'the same key cannot be earned twice');
});

test('explicit refusal after recognising the eyes remains terminal across reload and keeps the existing key consequence',()=>{
  const scene=inspect();choose(scene,'start','closer');choose(scene,'closer','leave');finish(scene);
  assert.equal(HEAD.marbleHeadDeclined(),true);assert.equal(HEAD.marbleHeadSettled(),true);
  assert.equal(receipts.filter(r=>r.sync).length,1);assert.equal(receipts.filter(r=>r.head).length,1);
  reload();assert.equal(host.parkEyesInReach(),false);assert.equal(host.interactParkEyes(),false);
  assert.equal(HEAD.collectMarbleHead(),false);assert.equal(HEAD.returnMarbleHead(HEAD.MARBLE_HEAD_BUST),false);
  assert.equal(host.takeServicesKey('academic-bust-5'),false);
});

test('torch-off inspection and cancelling a thought do not become a refusal',()=>{
  lit=false;assert.equal(host.interactParkEyes({focused:true}),true);
  assert.equal(scenes.depth(),0);assert.equal(thoughtHad('park-eyes'),false);
  assert.equal(HEAD.marbleHeadInWater(),true);
  lit=true;const scene=inspect();scene.key({key:'Escape'});
  assert.equal(scenes.depth(),0);assert.equal(HEAD.marbleHeadInWater(),true);
  assert.equal(host.interactParkEyes(),true,'the thought receipt does not block re-entry');
});
