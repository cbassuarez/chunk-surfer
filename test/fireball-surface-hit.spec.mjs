import test from 'node:test';
import assert from 'node:assert/strict';
import { fireballSurfaceHitPayload,strikeFireballSurface } from '../src/game/fireball-surface-hit.js';

const outbound=()=>({
  castId:'cast-0a1b2c3d',state:'outbound',surfaceIndex:2,
  rays:[{id:'private-ray-data-never-returned'}],
});

test('a surface pointer strike emits only its opaque routing identity',async()=>{
  const emitted=[];
  const result=strikeFireballSurface(outbound(),(payload)=>emitted.push(payload));
  await Promise.resolve();
  assert.equal(result.hit,true);
  assert.equal(result.cast.state,'deflected','the local surface closes the double-click race immediately');
  assert.deepEqual(emitted,[{castId:'cast-0a1b2c3d',surfaceIndex:2}]);
  assert.equal(JSON.stringify(emitted).includes('private-ray-data'),false);
});

test('focus and pointerdown from one physical click cannot double-charge RETURN',async()=>{
  const emitted=[];
  const first=strikeFireballSurface(outbound(),(payload)=>emitted.push(payload));
  const second=strikeFireballSurface(first.cast,(payload)=>emitted.push(payload));
  await Promise.resolve();
  assert.equal(first.hit,true);
  assert.equal(second.hit,false);
  assert.equal(emitted.length,1);
});

test('idle, resolved, malformed, and out-of-pool surfaces cannot report a hit',()=>{
  assert.equal(fireballSurfaceHitPayload(null),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),state:'impact'}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),castId:'real-combat-id'}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),surfaceIndex:4}),null);
});
