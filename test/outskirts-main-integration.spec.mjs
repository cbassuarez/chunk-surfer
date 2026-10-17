import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { outskirtsChoiceId, outskirtsPhysicalAction } from '../src/game/outskirts-choice.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('function syncOutskirtsWorldState(){');
const end=main.indexOf('\nfunction syncOutskirtsNight(){',start);
assert.ok(start>0&&end>start);

function harness(){
  const flags={},actions=[],saved=[],world=[];
  let thought;
  const sandbox={
    chunkSurfRuntime:{
      setOutskirtsWorldState:value=>world.push(value),
      outskirtsPerformAction:value=>{actions.push(value);return {handled:true};},
      state:()=>({outskirtsExperience:{actions:actions.map(a=>`r${a.pass}:${a.action}`)}}),
    },
    flagGet:key=>flags[key],flagSet:(key,value)=>flags[key]=value,getSave:()=>({flags}),saveCommit:value=>saved.push(value),
    OUTSKIRTS_STORY:{lodge:{},'postbox-letter':{},woman:{}},OUTSKIRTS_FAR_PASS:15,NO_THINK:false,
    phoneWorld:{van:false},payphoneAnswerVan:()=>false,
    think:(_id,_tree,options)=>{thought=options;return true;},
    REC:{saveRecState:()=>({take:'unchanged'}),composure:()=>0,restoreComposure(){}},pushEvent(){},
    outskirtsChoiceId,outskirtsPhysicalAction,
  };
  vm.createContext(sandbox);vm.runInContext(main.slice(start,end),sandbox);
  return {sandbox,flags,actions,saved,world,thought:()=>thought};
}

test('reading a lodge does not act; a chosen knock survives closing without another step',()=>{
  const h=harness();
  assert.equal(h.sandbox.openOutskirtsInspection({inspect:'lodge',stretch:6}),true);
  assert.equal(h.actions.length,0,'inspection alone knocked on the physical hatch');
  h.thought().onChoice({sourceId:'outskirts.lodge.knock'});
  assert.equal(h.actions.length,1);assert.equal(h.actions[0].action,'knock');
  h.thought().onDone();
  assert.deepEqual(Array.from(h.saved.at(-1).chunkSurf.outskirtsExperience.actions),['r6:knock']);
  assert.equal(h.saved.at(-1).rec.take,'unchanged');
});

test('posting projects the actual pass and current flag state before persisting the physical action',()=>{
  const h=harness();h.flags['outskirts.letter.found']=true;
  h.flags['outskirts.ticket.asked']=true;
  assert.equal(h.sandbox.openOutskirtsInspection({inspect:'postbox',stretch:9}),true);
  // Thought applies authored mutations before the production onChoice callback.
  h.flags['outskirts.letter.posted']=true;
  h.thought().onChoice({sourceId:'outskirts.postbox.post'});
  assert.equal(h.world.at(-1).letterPostedAt,9);
  assert.equal(h.world.at(-1).letterPosted,true);
  assert.equal(h.world.at(-1).ticketAsked,true);
  h.thought().onCancel();
  assert.deepEqual(Array.from(h.saved.at(-1).chunkSurf.outskirtsExperience.actions),['r9:post']);
  assert.equal(h.saved.at(-1).flags['outskirts.letter.postedAt'],9);
});

test('after the handoff, inspection text follows the saved pocket-to-hand pose',()=>{
  const h=harness();h.flags['outskirts.ticket.returned']=true;
  h.sandbox.chunkSurfRuntime.outskirtsCharacterFrame=()=>({clock:10,woman:{receivedAt:0}});
  assert.equal(h.sandbox.outskirtsInspectionNode('woman',0),'woman-after-early');
  h.sandbox.chunkSurfRuntime.outskirtsCharacterFrame=()=>({clock:11,woman:{receivedAt:0}});
  assert.equal(h.sandbox.outskirtsInspectionNode('woman',0),'woman-after');
});
