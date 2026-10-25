import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createExteriorConversationPerformance,transitionExteriorConversationPerformance,sampleExteriorConversationPerformance} from '../src/render/exterior-conversation-performance.js';
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function fn(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start);assert.ok(start>=0&&end>start);return source.slice(start,end+2);}
function fixture(){
  let dialogue,changes=0;
  const context={Map,Object,Math,Number,String,performance:{now:()=>0},document:{hidden:false,hasFocus:()=>true},paused:false,
    exteriorPeopleClock:0,exteriorConversationTracks:new Map(),createExteriorConversationPerformance,transitionExteriorConversationPerformance,sampleExteriorConversationPerformance,
    PROPS:{renderInstances:()=>[{id:'local',x:0,z:0,yaw:0}],propState:()=>({inspected:new Set()}),savePropState:()=>({})},
    FP:{logicalToPhysical:()=>({x:0,z:-4})},px:0,py:0,CELL:.5,shakeMode:()=>'full',usingSpecialSpace:()=>false,
    exteriorLoreConversation:()=>({tree:{},startAt:'start',slate:'local'}),inspectPropTracked:()=>{},saveCommit:()=>changes++,
    converse:(_id,_tree,options)=>{dialogue=options;return true;},
  };
  vm.createContext(context);vm.runInContext(['exteriorActorHeadYaw','noteExteriorConversation','tickExteriorPeople','exteriorConversationFrames','talkToExteriorLocal'].map(fn).join('\n'),context);
  return{context,dialogue:()=>dialogue,changes:()=>changes};
}
test('actual local conversation callbacks distinguish speaker, listener and exit, then expire a held subtitle',()=>{
  const{context:c,dialogue,changes}=fixture();c.talkToExteriorLocal({id:'local'});const calls=dialogue();
  assert.equal(calls.anchor,'bottom');assert.equal(calls.scrim,0);assert.equal(calls.showStoryArt,false,'physical speakers must remain visible above the transcript');
  calls.onLine({who:'man',text:'The road has been shut since Tuesday.'});c.tickExteriorPeople(.1);
  let state=c.exteriorConversationFrames().local;assert.ok(state.active&&state.speaking);
  calls.onLine({who:'me',text:'Since Tuesday?'});c.tickExteriorPeople(.1);
  assert.equal(c.exteriorConversationFrames().local.speaking,false,'player dialogue makes the person listen');
  calls.onLine({who:'man',text:'Yes.'});for(let i=0;i<100;i++)c.tickExteriorPeople(.1);
  assert.equal(c.exteriorConversationFrames().local.speaking,false,'a held subtitle never loops a speech animation forever');
  calls.onExit();for(let i=0;i<50;i++)c.tickExteriorPeople(.1);
  assert.equal(c.exteriorConversationTracks.size,0,'exit settles and retires its presentation track');
  assert.equal(changes(),1,'animation never writes progression or save state');
});
test('actual presentation clock stops on pause, focus loss and special scenes',()=>{
  const{context:c}=fixture();c.noteExteriorConversation('local',{line:{who:'man',text:'Wait here.'}});c.tickExteriorPeople(.1);const before=c.exteriorPeopleClock;
  c.paused=true;c.tickExteriorPeople(2);assert.equal(c.exteriorPeopleClock,before);
  c.paused=false;c.document.hidden=true;c.tickExteriorPeople(2);assert.equal(c.exteriorPeopleClock,before);
  c.document.hidden=false;c.document.hasFocus=()=>false;c.tickExteriorPeople(2);assert.equal(c.exteriorPeopleClock,before);
  c.document.hasFocus=()=>true;c.usingSpecialSpace=()=>true;c.tickExteriorPeople(2);assert.equal(c.exteriorPeopleClock,before);
});
