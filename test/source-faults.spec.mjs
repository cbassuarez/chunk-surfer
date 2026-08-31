import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySourcePs2GeometryFault, sourceFaultFrame } from '../src/game/source-faults.js';

test('Source faults exist only from Source proper through the pre-Horizon boundary',()=>{
  assert.equal(sourceFaultFrame({sourcePhase:false}).active,false);
  assert.equal(sourceFaultFrame({sourcePhase:true,horizon:true}).active,false);
  const proper=sourceFaultFrame({sourcePhase:true,timeMs:9000,flashMode:'off'});
  const reveal=sourceFaultFrame({sourcePhase:true,transitionElapsedMs:0,timeMs:9000,flashMode:'off'});
  assert.equal(proper.active,true);
  assert.ok(reveal.nvme>proper.nvme);
  assert.ok(reveal.ps2>proper.ps2);
  assert.equal(reveal.flashMode,'off');
});

test('PS2 object deformation is deterministic, bounded, and render-only',()=>{
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const instances=Array.from({length:24},(_,index)=>({id:`source-object-${index}`,matrix:new Float32Array(identity)}));
  const frame=sourceFaultFrame({sourcePhase:true,transitionElapsedMs:0,timeMs:340});
  const first=applySourcePs2GeometryFault(instances,frame);
  const second=applySourcePs2GeometryFault(instances,frame);
  assert.deepEqual(first,second);
  assert.ok(first.some((instance)=>instance.sourceFaulted));
  assert.ok(instances.every((instance)=>!instance.sourceFaulted&&instance.matrix.every((value,index)=>value===identity[index])),'authoritative instances remain untouched');
  for(const instance of first.filter((entry)=>entry.sourceFaulted)){
    assert.ok(Math.abs(instance.matrix[12])<=.21);
    assert.ok(Math.abs(instance.matrix[14])<=.14);
  }
});

test('PS2 shader vocabulary stays in Source while window choreography uses NVMe only',()=>{
  const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const windows=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
  assert.match(renderer,/SOURCE_FAULT_FRAG/);
  assert.match(renderer,/uniform float uPs2/);
  assert.match(windows,/nvme-sector/);
  assert.doesNotMatch(windows,/uPs2|ps2uv|SOURCE_FAULT_FRAG/);
});
