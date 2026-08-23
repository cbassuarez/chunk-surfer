import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createObjectGuidanceTracker, OBJECT_GUIDANCE } from '../src/game/waypoint-beacon.js';
import { createInteractionLatch, INTERACTION_LATCH } from '../src/game/interaction-latch.js';

const target={id:'story:test'};
let tracker=createObjectGuidanceTracker();
let frame=tracker.update({target,distance:20,nowMs:0,mode:'full'});
assert.equal(frame.visible,true);
assert.equal(frame.stalled,false);
frame=tracker.update({target,distance:20,nowMs:OBJECT_GUIDANCE.stallMs,mode:'full'});
assert.equal(frame.visible,true);
assert.equal(frame.stalled,true);
assert.ok(frame.alpha>.8);
assert.equal(tracker.update({target,distance:20,nowMs:30_000,mode:'off'}).visible,false);
assert.equal(tracker.update({target,distance:20,nowMs:30_001,mode:'full',sameRenderGroup:false}).visible,false);
assert.equal(tracker.update({target,distance:20,nowMs:30_002,mode:'full',flash:'off'}).pulse,false);

tracker=createObjectGuidanceTracker();
assert.equal(tracker.update({target,distance:30,nowMs:0,mode:'reduced'}).visible,false);
assert.equal(tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs-1,mode:'reduced'}).visible,false);
frame=tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs,mode:'reduced'});
assert.equal(frame.visible,true);
assert.equal(tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs+OBJECT_GUIDANCE.visibleMs-1,mode:'reduced'}).visible,true);
assert.equal(tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs+OBJECT_GUIDANCE.visibleMs,mode:'reduced'}).visible,false);
assert.equal(tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs+OBJECT_GUIDANCE.visibleMs+OBJECT_GUIDANCE.cooldownMs-1,mode:'reduced'}).visible,false);
assert.equal(tracker.update({target,distance:29,nowMs:OBJECT_GUIDANCE.stallMs+OBJECT_GUIDANCE.visibleMs+OBJECT_GUIDANCE.cooldownMs,mode:'reduced'}).visible,true);

tracker=createObjectGuidanceTracker();
tracker.update({target,distance:30,nowMs:0,mode:'reduced'});
tracker.update({target,distance:28.5,nowMs:4_000,mode:'reduced'});
assert.equal(tracker.update({target,distance:28.5,nowMs:4_000+OBJECT_GUIDANCE.stallMs-1,mode:'reduced'}).visible,false,'meaningful approach resets the stall clock');
assert.equal(tracker.update({target,distance:28.5,nowMs:4_000+OBJECT_GUIDANCE.stallMs,mode:'reduced'}).visible,true);
assert.equal(tracker.update({target:{id:'story:replacement'},distance:8,nowMs:13_000,mode:'reduced'}).visible,false,'replacement targets restart timing');
assert.equal(tracker.update({target:null,nowMs:14_000,mode:'full'}).visible,false,'completion cleans up target illumination');

const latch=createInteractionLatch();
const rope={id:'tower-rope-8',interactive:true,aimScore:.1};
assert.equal(latch.update(rope,{nowMs:1_000}).retained,false);
assert.equal(latch.update(null,{nowMs:1_000+INTERACTION_LATCH.holdMs-1,resolve:()=>rope}).retained,true,'a one-frame reticle miss must not drop an acquired prop');
assert.equal(latch.update(null,{nowMs:1_000+INTERACTION_LATCH.holdMs+1,resolve:()=>rope}),null,'the latch eventually releases a genuinely abandoned prop');
latch.update(rope,{nowMs:4_000});latch.consume(rope.id);
assert.equal(latch.update(null,{nowMs:4_001,resolve:()=>rope}),null,'a completed action clears its prompt immediately');
const main=readFileSync('src/main.js','utf8');
assert.doesNotMatch(main,/id:'story-waypoint-beacon'/,'runtime no longer creates a floating here beacon');
assert.match(main,/storyGuidanceEmissive\(instance/,'the actual target material receives guidance emissive');
assert.match(main,/storyGuidanceHighlightRenderKey=''/,'render-group rebuilds invalidate material guidance');
assert.match(main,/scenes\.suppressesHud\(\)/,'modal instruments can hide the ordinary story HUD without freezing their world');

console.log('object guidance tests ok');
