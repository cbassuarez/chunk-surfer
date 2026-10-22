import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowChoreographyDirector} from '../src/platform/window-choreography.js';

test('the drive cancels an outskirts composition still acquiring its snapshots, before it can leak into the van',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;}),events=[];
 const director=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>false,
  effects:{registerSnapshot:async()=>{await pending;return'captured-fragment';},hideComposition:async()=>events.push('hidden'),hidePanes:async()=>{}},onState:e=>events.push(e.type)});
 const old=director.sourceDecay(.03);await Promise.resolve();
 assert.equal(director.debug().source.stage,'sealed');assert.equal(director.debug().decay.active,true);
 assert.equal(await director.leaveSource('source-drive'),true);release();assert.equal(await old,false);
 assert.equal(director.debug().composition,null);assert.equal(director.debug().decay.active,false);
 assert.equal(director.debug().decay.done,false,'the inserted journey does not consume the later on-foot window decay');
 assert.ok(!events.includes('composition'),'late snapshots cannot show a discarded composition');
});

test('on-foot window decay can resume at the restored exterior after the cinematic handoff',async()=>{
 const director=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>false});
 await director.sourceDecay(.03);assert.equal(director.debug().decay.active,true);
 await director.leaveSource('source-drive');assert.equal(director.debug().composition,null);
 await director.sourceDecay(.03);assert.equal(director.debug().decay.active,true);assert.equal(director.debug().decay.done,false);
 await director.restore('test-finished');
});
