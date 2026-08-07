import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import {
  DOCK_INVESTIGATION_PROP_IDS,
  loadingDockInvestigation,
} from '../src/data/get-in-investigation.js';
import { createConversation } from '../src/game/conversation.js';

const acoustic = new Set(['dock-road-case', 'dock-cable-reel', 'dock-shutter-bar']);
const aftermath = new Set([
  'acq-maintenance-searchlight-dock',
  'dock-road-case',
  'dock-cable-reel',
  'dock-shutter-bar',
  'dock-chandelier-frame',
]);

assert.equal(DOCK_INVESTIGATION_PROP_IDS.length, 10, 'all ten dock hero objects own investigations');

function allText(tree) {
  return Object.values(tree).flatMap((node) => [
    ...(node.lines || []).map((line) => line.text),
    ...(node.choices || []).map((choice) => choice.text),
  ]).filter(Boolean).join('\n');
}

for (const id of DOCK_INVESTIGATION_PROP_IDS) {
  const prop = CONSERVATORY_PROPS.find((entry) => entry.id === id);
  assert.ok(prop?.dockInvestigation, `${id} is routed through investigation UX`);

  const tree = loadingDockInvestigation(id, { aftermath:false, revisited:false, auditioned:false });
  assert.ok(tree?.start && tree?.hub && tree?.done, `${id} has a start, hub, and exit`);
  assert.ok(tree.hub.choices.length >= 4, `${id} offers at least three investigations plus leaving`);
  assert.ok(tree.hub.choices.some((choice) => choice.text === 'leave it alone'));
  assert.ok(Object.entries(tree).some(([nodeId, node]) =>
    !['start', 'hub', 'done'].includes(nodeId) && (node.choices || []).length >= 3),
  `${id} lets the player interpret an observation instead of receiving a fixed verdict`);
  for (const [nodeId, node] of Object.entries(tree)) {
    if (node.goto) assert.ok(tree[node.goto], `${id}/${nodeId} points to a real node`);
    for (const choice of node.choices || []) assert.ok(tree[choice.goto], `${id}/${nodeId} choice points to ${choice.goto}`);
  }

  const text = allText(tree);
  assert.doesNotMatch(text, /decibel|dimmer|flange|ratchet|provenance|maintenance purchase|M\/L-\d|live circuit/i,
    `${id} should read as observation, not an equipment report`);
  assert.match(text, /look|touch|finger|hand|thumb|read|listen|knock|turn|pull|test|flick|lift|follow|trace|fit|rub|aim/i,
    `${id} gives the player a physical investigative verb`);

  const soundChoices = Object.values(tree).flatMap((node) => node.choices || []).filter((choice) => choice.dockAction === 'audition');
  assert.equal(soundChoices.length, acoustic.has(id) ? 1 : 0, `${id} sound is learned only by an explicit choice`);

  const revisited = loadingDockInvestigation(id, { aftermath:false, revisited:true, auditioned:acoustic.has(id) });
  assert.notEqual(revisited.start.lines[0].text, tree.start.lines[0].text, `${id} acknowledges a return inspection`);

  let closed=0;
  const convo=createConversation({nodes:tree,onDone:()=>{closed++;}});
  convo.start();
  for(let guard=0;guard<80&&!convo.view().finished;guard++){
    const view=convo.view();
    convo.update(10);
    if(view.pending?.kind==='branch'){
      const leaveIndex=view.pending.options.findIndex((choice)=>choice.text==='leave it alone');
      convo.key({key:leaveIndex>=0?String(leaveIndex+1):'Enter'});
    }else convo.key({key:' '});
  }
  assert.equal(closed,1,`${id} leave choice dismisses the investigation shell`);
}

for (const id of aftermath) {
  const before = loadingDockInvestigation(id, { aftermath:false, auditioned:true });
  const after = loadingDockInvestigation(id, { aftermath:true, auditioned:true });
  assert.notEqual(after.start.lines[0].text, before.start.lines[0].text, `${id} gains a real aftermath investigation`);
  assert.ok(after.hub.choices.length >= 4, `${id} aftermath remains interactive`);
  assert.ok(Object.entries(after).some(([nodeId, node]) =>
    !['start', 'hub', 'done'].includes(nodeId) && (node.choices || []).length >= 3),
  `${id} aftermath lets the player decide what the evidence means`);
  assert.match(allText(after), /remember|heard|saw|know|prove|certainty|where|order|fact|still|quiet/i,
    `${id} aftermath asks the player to investigate memory rather than reading a verdict`);
}

const chandelier = loadingDockInvestigation('dock-chandelier-frame');
assert.ok(chandelier.hub.choices.some((choice) => choice.if?.includes('dock.clue.workorder.last')),
  'the chandelier can connect to the unfinished paperwork');
assert.ok(chandelier.hub.choices.some((choice) => choice.if?.includes('dock.clue.lamp.aim')),
  'the chandelier can connect to the dead lamp reflection');

const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSource, /openLoadingDockInvestigation\(hit\)/,
  'dock hero props route through the investigation conversation');
assert.match(mainSource, /choice\?\.dockAction\s*===\s*'audition'/,
  'an acoustic prop only plays after the player chooses the sound-producing action');
assert.match(mainSource, /propHit\.dockInvestigation\s*\?\s*'INVESTIGATE'/,
  'the reticle describes the new interaction honestly');

console.log('loading dock investigations: 10 interactive trees, 5 aftermath trees, 3 explicit sound choices');
