import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { boothCameraFrame, boothPoseForSourceId } from '../src/game/booth-presentation.js';
import { STORY_WAYFINDING_CAPTURE_PRESETS } from '../src/data/story-wayfinding-captures.js';

const byId=(id)=>CONSERVATORY_PROPS.find((prop)=>prop.id===id);
for(const id of [
  'yard-booth','yard-booth-glazing','yard-booth-interior','yard-booth-practicals',
  'yard-booth-guard-idle','yard-booth-guard-ledger','yard-booth-guard-handoff','yard-booth-handoff',
])assert.ok(byId(id),`${id} is an independently addressable booth layer`);
assert.equal(byId('yard-booth').blocks,true);
assert.equal(byId('yard-booth-interior').interactive,false);
assert.equal(boothPoseForSourceId('start.line.6'),'ledger');
assert.equal(boothPoseForSourceId('threshold.line.5'),'handoff');
assert.equal(boothPoseForSourceId('threshold.line.11'),'idle');

const origin={x:10,y:10,yaw:Math.PI-.10,pitch:.2},target={x:9,y:10};
assert.deepEqual(boothCameraFrame({origin,target,startedAt:100,nowMs:100}),origin);
const framed=boothCameraFrame({origin,target,startedAt:100,nowMs:820});
assert.equal(framed.x,origin.x,'conversation framing does not move the player body');
assert.ok(Math.abs(framed.pitch+.035)<1e-9);
assert.ok(Math.abs(framed.yaw-origin.yaw)<=Math.PI,'framing takes the shortest yaw path');

assert.equal(byId('box-office-ledger').mesh,'rekey_ledger');
assert.equal(byId('box-office-key-cabinet').mesh,'chapel_key_cabinet');
assert.equal(
  byId('box-office-key-cabinet').action,
  'key-cabinet-board',
  'cabinet shell keeps the authored comparison action',
);
assert.deepEqual(['CH-04','C-17','FOH-M'].map((tag)=>byId(`box-office-key-ring-${tag.toLowerCase().replaceAll('-','')}`)?.keyTag),['CH-04','C-17','FOH-M']);
for(const mesh of['chapel_key_ring_ch04','chapel_key_ring_c17','chapel_key_ring_fohm'])assert.ok(PROP_MESH[mesh],`${mesh} is independently renderable`);
assert.equal(byId('yard-look-bench').action,'yard-vigil-bench');
assert.equal(byId('yard-look-bench').mesh,'yard_look_bench');
assert.ok(PROP_MESH.loose_note_page6);
assert.ok(PROP_MESH.chapel_screen_signal);
assert.ok(PROP_MESH.tower_exit_indicator);
const main=readFileSync('src/main.js','utf8');
assert.match(main,/p\.id==='page-6'\?'loose_note_page6'/);
assert.match(main,/guidance\.target\?\.propId==='chapel-inner-screen'/);
assert.match(main,/guidance\.target\?\.id==='story:descend-nave'/);
assert.match(main,/propHit\.action==='yard-vigil-bench'\?'TURN AND SIT ON'/);
assert.match(main,/yardBenchSitFrame\(\{origin,seat,elapsed\}\)/,'bench interaction owns an authored turn-and-seat camera action');
assert.match(main,/storyGuidanceEmissive\(instance/,'object guidance lights the target instance itself');
const captureIds=new Set(STORY_WAYFINDING_CAPTURE_PRESETS.map((entry)=>entry.id));
for(const id of ['arrival-van','arrival-bench','arrival-lodge','booth-window-conversation','page-6','rekey-ledger','key-cabinet','chapel-screen','tenor-full','tenor-reduced','tenor-off','tower-descent','fifth-take','ending-surfaced-exit','ending-chapel-commitment','ending-grey-door','ending-rescue-exit'])assert.ok(captureIds.has(id),`${id} has a visual capture preset`);
assert.equal(new Set(STORY_WAYFINDING_CAPTURE_PRESETS.map((entry)=>entry.file)).size,STORY_WAYFINDING_CAPTURE_PRESETS.length);

console.log('story prop and booth presentation tests ok');
