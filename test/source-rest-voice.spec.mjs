import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeColdOpenScene} from '../src/game/coldopen.js';
import {makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';

test.afterEach(()=>scenes.clear());
const sounds=()=>({started:[],stopped:0,startTyping(options){this.started.push(options);},stopTyping(){this.stopped++;}});

test('the Source rest conversation types both speakers without starting synthetic speech',()=>{
  const audio=sounds(),story={id:'rest-voice-test',phase:'wrong-return',entry:'start',nodes:{start:{
    lines:[{who:'other',text:'I am here.'},{who:'you',text:'I know.'}],choices:[{id:'leave',label:'Get up.',action:'leave'}]}}};
  const scene=makeSourceRestConversationScene({story,audio,getAudio:()=>{throw Error('A VFD line must not request a voice device.');}});
  scenes.push(scene);assert.equal(audio.started.length,1);assert.equal(scene.view().voice,null);
  scenes.update(1);scenes.key({key:' '});assert.equal(audio.started.length,2);assert.equal(scene.view().who,'me');assert.equal(scene.view().voice,null);
});

test('a cold-open presenter can opt all voiced speakers into VFD typing, without changing defaults',()=>{
  const audio=sounds(),silent=makeColdOpenScene({ambient:false,voiceEnabled:false,audio,
    getAudio:()=>{throw Error('A disabled voice must not request an audio device.');},beats:[{who:'unknown',text:'Listen.'}]});
  scenes.push(silent);assert.equal(audio.started.length,1);assert.equal(silent.view().voice,null);scenes.remove(silent);
  const ordinaryAudio=sounds(),ordinary=makeColdOpenScene({ambient:false,audio:ordinaryAudio,beats:[{who:'unknown',text:'Listen.'}]});
  scenes.push(ordinary);assert.equal(ordinaryAudio.started.length,0,'ordinary unknown speech retains its existing voiced treatment');
  assert.ok(ordinaryAudio.stopped>0);scenes.remove(ordinary);
});
