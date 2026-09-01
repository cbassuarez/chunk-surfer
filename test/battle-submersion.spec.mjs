import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { createBattleSubmersionController,normalizeBattleSubmersion } from '../src/game/battle-submersion.js';
import { createBattleWaterAudio } from '../src/audio/battle-water.js';

const presentation=authoredCombatProfile('natatorium').presentation;

test('Natatorium owns exact dry, half, full and result phase metadata',()=>{
  assert.deepEqual(normalizeBattleSubmersion(presentation),{
    phases:['dry','half','full'],resultPhases:{win:'dry',lose:'full'},wetMix:{dry:0,half:.5,full:.92},
    lowpassHz:{dry:20000,half:1800,full:720},transitionSeconds:{dry:0,half:1,full:1.1,win:1.35},
  });
});

test('movement endpoints and literal half-view waterline are audio-independent',()=>{
  const controller=createBattleSubmersionController({presentation});
  assert.deepEqual({phase:controller.setMovement(0).phase,depth:controller.snapshot().depth,wet:controller.snapshot().wetMix},{phase:'dry',depth:0,wet:0});
  controller.setMovement(1);assert.equal(controller.update(.999).settled,false);const half=controller.update(.001);
  assert.equal(half.phase,'half');assert.equal(half.depth,.5);assert.equal(half.waterline,.5);assert.equal(half.wetMix,.5);assert.equal(half.lowpassHz,1800);
  controller.setMovement(2);assert.equal(controller.update(1.099).settled,false);const full=controller.update(.001);
  assert.equal(full.phase,'full');assert.equal(full.depth,1);assert.equal(full.wetMix,.92);assert.equal(full.lowpassHz,720);
});

test('victory finishes its 1.35 second surface before result dialogue while defeat stays full',()=>{
  const win=createBattleSubmersionController({presentation});win.setMovement(2);win.update(1.1);
  const rising=win.beginResult('win');assert.equal(rising.phase,'resurfacing');assert.equal(rising.settled,false);
  assert.equal(win.update(1.349).settled,false);const dry=win.update(.001);assert.equal(dry.phase,'dry');assert.equal(dry.wetMix,0);
  const lose=createBattleSubmersionController({presentation});lose.setMovement(2);lose.update(1.1);
  const beforeLoss=lose.snapshot();const held=lose.beginResult('lose');assert.equal(held.phase,'full');assert.equal(held.wetMix,.92);
  assert.equal(held.settled,true);assert.equal(held.serial,beforeLoss.serial,'defeat does not replay the plunge edge');
  const combat=readFileSync(new URL('../src/game/combat.js',import.meta.url),'utf8');
  assert.match(combat,/resultSurfacePending && submersionSnapshot\.settled[\s\S]{0,180}deliverResult\(\)/,
    'win dialogue is gated behind the controller endpoint');
  assert.match(combat,/if \(result === 'win'[\s\S]{0,180}phase = 'submersion'[\s\S]{0,180}finishMusic\(\);/,
    'victory still waits for the water controller endpoint');
  // Defeat holds the water and now holds BOTH halves of the death composition:
  // the desktop panes (interference.result) and the in-canvas screen
  // (onDefeatScreen) are one piece, launched together, and the loss dialogue
  // waits for whichever is still running. See game/death-scene.js.
  assert.match(combat,/result==='lose'[\s\S]{0,900}interference\?\.result\?\.\(result\)[\s\S]{0,200}onDefeatScreen\?\.\([\s\S]{0,200}finally\(deliverResult\)/,
    'defeat stays fully submerged while both halves of the death composition complete before loss dialogue');
});

test('water Foley fires once per phase edge and tears down on silent exits',()=>{
  const controller=createBattleSubmersionController({presentation});
  const rig=createBattleWaterAudio({enabled:true,getAudio:()=>null});
  for(const index of [0,1,2]){const snap=controller.setMovement(index);rig.setPhase(snap);rig.setPhase(snap);controller.update(index===1?1:index===2?1.1:0);rig.setPhase(controller.snapshot());}
  const phases=rig.snapshot().events.filter(({kind})=>kind==='phase').map(({phase})=>phase);
  assert.deepEqual(phases,['dry','half','full']);
  assert.equal(rig.stop(),true);assert.equal(rig.stop(),false);assert.equal(rig.snapshot().activeBeds,0);assert.equal(rig.snapshot().activeTransients,0);
});

test('the dry movement allocates no procedural sources and victory breath waits for resurfacing',()=>{
  const controller=createBattleSubmersionController({presentation});
  const rig=createBattleWaterAudio({enabled:true,getAudio:()=>({ctx:null})});
  rig.setPhase(controller.setMovement(0));
  assert.equal(rig.snapshot().activeBeds,0);
  assert.equal(rig.snapshot().events.some(({kind})=>kind==='breath'),false);
  controller.setMovement(2);controller.update(1.1);rig.setPhase(controller.snapshot());
  rig.setPhase(controller.beginResult('win'));
  assert.equal(rig.snapshot().events.some(({kind})=>kind==='breath'),false);
  controller.update(1.35);rig.setPhase(controller.snapshot());
  assert.equal(rig.snapshot().events.filter(({kind})=>kind==='breath').length,1);
});
