import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {authoredCue,dispatchAuthoredCue} from '../src/audio/authored-cues.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const between=(start,end)=>{
  const a=main.indexOf(start),b=main.indexOf(end,a);
  assert.ok(a>=0&&b>a,`real main function boundaries: ${start}`);
  return main.slice(a,b).trim();
};
const fire=between('function fireCue(name, shape=null){','\nfunction roomMicInputOptions(');
const emit=between('function emitDoorArchitecture(portal,type,','\nlet architectureDoorAudio=');
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(){
  const playback=[],noise=[],stops=[];
  const context=vm.createContext({
    CUE_SEAL_GREY_DOOR:'door.grey.seal',ensureCtx(){},dispatchAuthoredCue,
    CUES:{playCue:(url,options)=>playback.push({url,options:plain(options)})},
    causalRecorder:{recordEvent(){}},
    emitAcousticEvent:event=>noise.push(plain(event)),
    acousticSpatialAt:(x,y)=>({areaId:'conservatory',floorId:'ground',position:{x,y}}),
    STORY:{stopBoothTone:()=>stops.push('booth'),stopRain:()=>stops.push('rain')},
  });
  vm.runInContext(`${fire}\n${emit}`,context);
  return{context,playback,noise,stops};
}

function expectedPlayback(id){
  const result=[];
  dispatchAuthoredCue(id,{play:(url,options)=>result.push({url,options:plain(options)})});
  return result;
}

test('ordinary door semantics never replay a generic recording or stop the booth and weather',()=>{
  assert.deepEqual(authoredCue('door').effects,['story:stop-booth'],
    'exercise the real story side effect that ordinary doors must not own');
  const h=harness();
  h.context.portal={id:'pub-west-entry',cx:71.5,cy:890.5,keyId:null,archetype:'public-glazed-pair',construction:'mahogany-glass'};
  vm.runInContext("emitDoorArchitecture(portal,'door_open',{playerGenerated:true});emitDoorArchitecture(portal,'door_close');",h.context);
  assert.deepEqual(h.stops,[]);
  assert.deepEqual(h.playback,[],
    'the movement observer owns recorded playback; semantic dispatch cannot double it');
  assert.deepEqual(h.noise.map(e=>({kind:e.kind,source:e.source,playerGenerated:e.semantics.playerGenerated})),[
    {kind:'door_open',source:{kind:'player',id:'door:pub-west-entry'},playerGenerated:true},
    {kind:'door_close',source:{kind:'environment',id:'door:pub-west-entry'},playerGenerated:false},
  ]);
});

test('ordinary keyed opening emits one semantic event without taking ownership of rain or key playback',()=>{
  assert.deepEqual(authoredCue('keyturn').effects,['story:stop-rain']);
  const h=harness();
  h.context.portal={id:'foh-office',cx:189,cy:27,keyId:'master',definition:{archetype:'staff-half-glazed',construction:'oak-wired-glass'}};
  vm.runInContext("emitDoorArchitecture(portal,'door_open',{playerGenerated:true});",h.context);
  assert.deepEqual(h.stops,[]);
  assert.deepEqual(h.playback,[],
    'the recorded mechanism player owns latch playback, including keyed doors');
  assert.equal(h.noise.length,1);
  assert.deepEqual(h.noise[0].spatial.position,{x:189,y:27});
  assert.deepEqual(h.noise[0].provenance,{system:'door-runtime',doorId:'foh-office',archetype:'staff-half-glazed',construction:'oak-wired-glass'});
});

test('intentional authored arrival cues retain their booth and rain handoffs',()=>{
  const h=harness();
  vm.runInContext("fireCue('door');fireCue('keyturn');",h.context);
  assert.deepEqual(h.stops,['booth','rain']);
  assert.deepEqual(h.playback,[...expectedPlayback('door'),...expectedPlayback('keyturn')]);
});
