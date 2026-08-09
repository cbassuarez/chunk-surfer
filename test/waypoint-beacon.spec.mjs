import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createObjectGuidanceTracker, OBJECT_GUIDANCE } from '../src/game/waypoint-beacon.js';

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
assert.equal(tracker.update({target,distance:29,nowMs:19_999,mode:'reduced'}).visible,false);
frame=tracker.update({target,distance:29,nowMs:20_000,mode:'reduced'});
assert.equal(frame.visible,true);
assert.equal(tracker.update({target,distance:29,nowMs:27_999,mode:'reduced'}).visible,true);
assert.equal(tracker.update({target,distance:29,nowMs:28_000,mode:'reduced'}).visible,false);
assert.equal(tracker.update({target,distance:29,nowMs:57_999,mode:'reduced'}).visible,false);
assert.equal(tracker.update({target,distance:29,nowMs:58_000,mode:'reduced'}).visible,true);

tracker=createObjectGuidanceTracker();
tracker.update({target,distance:30,nowMs:0,mode:'reduced'});
tracker.update({target,distance:27,nowMs:10_000,mode:'reduced'});
assert.equal(tracker.update({target,distance:27,nowMs:29_999,mode:'reduced'}).visible,false,'closing three metres resets the stall clock');
assert.equal(tracker.update({target,distance:27,nowMs:30_000,mode:'reduced'}).visible,true);
assert.equal(tracker.update({target:{id:'story:replacement'},distance:8,nowMs:31_000,mode:'reduced'}).visible,false,'replacement targets restart timing');
assert.equal(tracker.update({target:null,nowMs:32_000,mode:'full'}).visible,false,'completion cleans up target illumination');
const main=readFileSync('src/main.js','utf8');
assert.doesNotMatch(main,/id:'story-waypoint-beacon'/,'runtime no longer creates a floating here beacon');
assert.match(main,/storyGuidanceEmissive\(instance/,'the actual target material receives guidance emissive');

console.log('object guidance tests ok');
