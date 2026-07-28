import assert from 'node:assert/strict';

import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';

const lights=[
  {id:'far',x:30,y:2,z:30,floorY:0,intensity:.4,shadowReveal:1,pulseIndex:3},
  {id:'near',x:4,y:2,z:1,floorY:.5,intensity:.4,shadowReveal:.8,pulseIndex:7},
];
const frame=buildEmergencyShadowFrame(lights,{listener:{x:2,z:1}});
assert.ok(frame,'a readable nearby pulse authors one shadow frame');
assert.equal(frame.lightId,'near','unreachable distant practicals cannot steal the single practical shadow pass');
assert.equal(frame.lightOverride.castsShadow,true);
assert.ok(Number.isFinite(frame.lightOverride.shadowYaw));
assert.equal(frame.instance.mesh,'stair_shadow_figure');
assert.equal(frame.instance.shadowOnly,true,'the human form is absent from the colour pass');
assert.equal(frame.instance.y,.5,'the body stands on the authored room floor');
assert.equal('collision' in frame.instance,false);
assert.equal('hush' in frame.instance,false);
assert.equal('contact' in frame.instance,false);
assert.deepEqual(buildEmergencyShadowFrame(lights,{listener:{x:2,z:1}}),frame,'the same pulse composes the same shadow');
assert.equal(buildEmergencyShadowFrame(lights,{listener:{x:2,z:1},enabled:false}),null);
assert.equal(buildEmergencyShadowFrame([{...lights[1],shadowReveal:0}],{listener:{x:2,z:1}}),null);

console.log('emergency light shadow runtime contracts passed');
