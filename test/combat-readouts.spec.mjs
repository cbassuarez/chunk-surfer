import test from 'node:test';
import assert from 'node:assert/strict';
import {combatReadoutState} from '../src/render/combat-readouts.js';
import {hallRosterState} from '../src/render/hall-roster.js';
import {combatHudLayout} from '../src/render/combat-hud-layout.js';

const base={composure:40,maxComposure:40,injuries:0,charge:1,maxCharge:3,battery:.75,snr:'signal',tools:{torch:true}};
test('battle readouts distinguish depleted composure from a recovered lasting injury',()=>{
  const spent=combatReadoutState({...base,composure:8,injuries:1});
  assert.equal(spent.condition.strainStatus,'depleted');assert.match(spent.status,/DEPLETED.*1 INJURY/);
  const recovered=combatReadoutState({...base,composure:20,maxComposure:20,injuries:4});
  assert.equal(recovered.condition.strainRatio,0);assert.match(recovered.status,/COMPOSED.*4 INJURIES/);
  assert.equal(combatReadoutState().status,'CONDITION UNAVAILABLE');
});
test('resources and temporary effects keep explicit independent meanings',()=>{
  const input={...base,charge:0,battery:0,take:null,snr:'silence',ringing:true,tempo:true,exposedBonus:5};
  const before=JSON.stringify(input),view=combatReadoutState(input);
  assert.equal(view.cells.take.value,'EMPTY');assert.equal(view.cells.charge.value,'0/3');
  assert.equal(view.cells.battery.value,'0%');assert.equal(view.cells.mode.value,'SILENCE');
  assert.deepEqual(view.effects,['RINGING','TEMPO OPEN','RESIDUE READY']);
  assert.equal(JSON.stringify(input),before);
  assert.equal(combatReadoutState({...base,take:{label:'THE REGARD'}}).cells.take.value,'THE REGARD');
});
test('Hall targets, acting members and surviving coherence remain separate',()=>{
  const members=[{id:'a',health:8,maxHealth:30,primary:true,targeted:true,acting:false},
    {id:'b',health:20,maxHealth:30,acting:true,parryReady:true},
    {id:'c',health:0,maxHealth:30,defeated:true}];
  const view=hallRosterState({members});
  assert.equal(view[0].activity,'TARGET');assert.equal(view[0].condition,'8/30');
  assert.equal(view[1].activity,'ACTING · PARRY READY');
  assert.equal(view[2].activity,'RELEASED');assert.equal(view[2].ratio,0);
});
test('mode selectors and a shared active control bank fit regular and small native panels',()=>{
  for(const sample of [{panel:{x:2,y:3,w:118,h:30}},{panel:{x:2,y:3,w:76,h:24}},
    {panel:{x:2,y:3,w:60,h:13},desktop:true}]){
    const layout=combatHudLayout({...sample,rosterActive:true});
    assert.deepEqual(layout.tools,layout.actions);
    assert.ok(layout.tabs.y+layout.tabs.h<=layout.carousel.y);
    assert.ok(layout.carousel.y+layout.carousel.h<=layout.detail.y);
    assert.ok(layout.detail.y+layout.detail.h<=sample.panel.y+sample.panel.h);
    assert.ok(layout.effects.y+layout.effects.h<layout.body.y);
  }
});
