import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as SPEECH from '../src/game/speech.js';
import {academicSocietyPresentationActive as active,createAcademicSocietyPresentationClock as clock,
  academicSocietyAmbientAudible as audible} from '../src/game/academic-society-presentation.js';
import {ACADEMIC_SOCIETY_BEATS as BEATS} from '../src/data/academic-society.js';

const visible={onAcademicFloor:true,nativeFocused:true,documentFocused:true};
const pair=BEATS.find(beat=>beat.id==='the-tuesday-argument');
const social={type:'social',area:pair.area,lines:pair.lines};

test('body acting continues in its own conversation without advancing through another modal',()=>{
  const c=clock();
  c.tick(.05,visible);c.tick(.05,{...visible,blocked:true,ownsTopScene:true});
  assert.equal(c.view().timeSec,.1);
  c.tick(.05,{...visible,blocked:true,ownsTopScene:false});
  assert.equal(c.view().timeSec,.1);
});

test('native blur, hidden document and pause freeze acting even when the dialogue owns the scene',()=>{
  const c=clock();c.tick(.1,visible);
  for(const flag of [{nativeFocused:false},{hidden:true},{paused:true}]){
    const ctx={...visible,blocked:true,ownsTopScene:true,...flag};
    assert.equal(active(ctx),false);c.tick(.1,ctx);assert.equal(c.view().timeSec,.1);
  }
  assert.equal(active({...visible,documentFocused:false}),true,'known native focus wins over delayed DOM focus');
  assert.equal(active({...visible,nativeFocused:null,documentFocused:false}),false);
});

test('resuming has no wall-clock catch-up and leaving resets transient performance',()=>{
  const c=clock();c.tick(.1,visible);c.tick(20,{...visible,hidden:true});
  c.tick(.04,visible);assert.ok(Math.abs(c.view().timeSec-.14)<1e-9);
  c.tick(Infinity,visible);c.tick(NaN,visible);c.tick(-1,visible);
  assert.ok(Math.abs(c.view().timeSec-.14)<1e-9);
  c.tick(10,visible);assert.ok(Math.abs(c.view().timeSec-.24)<1e-9,'an oversized frame is bounded');
  c.tick(.04,{...visible,onAcademicFloor:false});assert.equal(c.view().timeSec,0);
});

test('an ambient exchange expires across the actual chamber-to-gallery area boundary',()=>{
  assert.equal(audible(social,{x:10,y:247}),true);
  assert.equal(audible(social,{x:24,y:247}),false,'same floor does not preserve the local speech lease');
  assert.equal(audible(social,{x:14,y:274}),false);
});

test('the full reciprocal exchange must be audible, not just its nearest speaker',()=>{
  assert.equal(audible(social,{x:1,y:246}),false,'Celeste is farther than eight metres although Emile is close');
  assert.equal(audible({...social,lines:[]},{x:10,y:247}),false);
  assert.equal(audible({...social,lines:[{actorId:'unowned'}]},{x:10,y:247}),false);
  assert.equal(audible(social,null),false);
});

test('ambient locality does not silently withdraw or invalidate the separate consent consequence',()=>{
  assert.equal(audible({type:'borrowed-voice',lines:[{actorId:'emile'}]},{x:25,y:250}),true);
  assert.equal(audible({type:'released',lines:[{who:'direction'}]},null),true);
});

test('the actual speech voice readout follows handle completion, not caption presence',()=>{
  const source=fs.readFileSync(new URL('../src/game/speech.js',import.meta.url),'utf8');
  const fn=source.match(/export function isVoicing\(\) \{[^}]+\}/)?.[0];assert.ok(fn);
  const context={cur:{text:'The caption remains.'},curVoice:null};vm.createContext(context);
  vm.runInContext(fn.replace('export ',''),context);assert.equal(context.isVoicing(),false);
  let ended=false;context.curVoice={done:()=>ended};assert.equal(context.isVoicing(),true);
  ended=true;assert.equal(context.isVoicing(),false);
  SPEECH.clearSpeech();SPEECH.say({who:'direction',text:'A silent direction.',hold:5});SPEECH.updateSpeech(.1);
  assert.ok(SPEECH.speaking());assert.equal(SPEECH.isVoicing(),false);
  SPEECH.clearSpeech();
});
