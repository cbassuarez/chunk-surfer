import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestAfflictionCamera} from '../src/render/source-rest-affliction-view.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {SOURCE_REST_SEATS,sourceRestCamera} from '../src/game/source-rest-seat.js';
import {continuationChartSolids} from '../src/data/source-continuation.js';

test('a marked mistake recoils the rendered body without changing its chosen look, and reduced motion retains the ordinary camera',()=>{
 const seat=SOURCE_REST_SEATS[0],base={eye:[seat.x,seat.feet+1.04,seat.z],yaw:seat.view.yaw,pitch:seat.view.pitch},
   cue={...sourceRestAfflictionFrame({active:true,currentTime:54.35,progress:.2}),embodied:true,bodyProgress:1},before=structuredClone(base),
   hurt=sourceRestAfflictionCamera(base,cue);
 assert.notDeepEqual(hurt.eye,base.eye);assert.notEqual(hurt.pitch,base.pitch);assert.equal(hurt.yaw,base.yaw);
 assert.deepEqual(base,before);assert.equal(sourceRestAfflictionCamera(base,cue,{reducedMotion:true}),base);
 assert.equal(sourceRestAfflictionCamera(base,{...cue,embodied:false}),base);
});

test('the strongest sampled flinch and late slump keep the seated eye clear of the actual alcove',()=>{
 const seat=SOURCE_REST_SEATS[0],base=sourceRestCamera(seat,{eye:[seat.approach.x,seat.feet+1.62,seat.approach.z],yaw:Math.PI/2,pitch:0},1),
   solids=continuationChartSolids({...seat,status:'active'});
 for(const time of [35.046,54.337,211.4,230,459.25,470,500,700.614]){
  const cue={...sourceRestAfflictionFrame({active:true,currentTime:time,progress:.9}),embodied:true,bodyProgress:1},
    eye=sourceRestAfflictionCamera(base,cue).eye;
  assert.ok(!solids.some(s=>eye[0]>=s.minX&&eye[0]<=s.maxX&&eye[1]>=s.minY&&eye[1]<=s.maxY&&eye[2]>=s.minZ&&eye[2]<=s.maxZ));
  assert.ok(eye[1]>seat.feet+.75,'the camera stays above the real seat and protected floor');
 }
});
