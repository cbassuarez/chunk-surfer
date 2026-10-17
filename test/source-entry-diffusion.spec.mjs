import assert from 'node:assert/strict';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { horizonEntryDiffusion } from '../src/render/horizon3d.js';
import { CELL } from '../src/data/floorplan/legend.js';

// The player should walk into the recording without seeing a complete image
// plane at its head. The reveal is measured from the physical seam, not from
// elapsed time or a teleport into the tape.
assert.equal(horizonEntryDiffusion(-12), 0);
assert.ok(horizonEntryDiffusion(0) < .03, 'the seam exposes the whole recording');
assert.ok(horizonEntryDiffusion(60) < .40, 'the first vapor has already resolved into a screen');
assert.ok(horizonEntryDiffusion(120) > horizonEntryDiffusion(60));
assert.equal(horizonEntryDiffusion(160), 1);

// After the happy recording, one real lamp remains near the head. It dies as
// the body passes, and that blackout survives a reload rather than repeating.
const built=buildPreTapeGodPreset(2210,{seed:4417,marbleEyes:'returned'});
const runtime=createSourceSpaceRuntime({initialState:built.state});
runtime.setLastLightPlayback({started:true,done:true});
runtime.setLastLightOut(true);
const lampId='source-street-remnant:lamp:threshold';
const at=(metres)=>({...built.position,y:built.position.y-metres/CELL});
const lampAt=(r,position)=>r.propInstances(position.x,position.y,{time:0,viewYaw:0}).find(piece=>piece.id===lampId);
const before=at(8);
runtime.setPlayerPosition(before);
assert.ok(lampAt(runtime,before)?.emissive?.[3]>.5,'the solitary light is dark before passing it');
assert.ok(!runtime.outskirtsBeatFrame({viewYaw:0,reducedMotion:true}).events.some(event=>event.id===`lamp-off:${lampId}`));
const after=at(10);
runtime.setPlayerPosition(after);
const blackout=runtime.outskirtsBeatFrame({viewYaw:0,reducedMotion:true}).events.filter(event=>event.id===`lamp-off:${lampId}`);
assert.equal(blackout.length,1,'the pass misses or repeats the light failure');
assert.equal(lampAt(runtime,after)?.emissive,undefined);
const restored=createSourceSpaceRuntime({initialState:runtime.state()});
restored.setPlayerPosition(after);
assert.equal(lampAt(restored,after)?.emissive,undefined,'reload relights the failed lamp');
assert.ok(!restored.outskirtsBeatFrame({viewYaw:0,reducedMotion:true}).events.some(event=>event.id===`lamp-off:${lampId}`));

console.log('source entry diffusion specs passed');
