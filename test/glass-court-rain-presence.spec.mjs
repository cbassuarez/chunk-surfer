import test from 'node:test';
import assert from 'node:assert/strict';
import {GLASS_COURT as C} from '../src/data/glass-court.js';
import {GLASS_COURT_PRESENCES as bodies} from '../src/data/glass-court-presences.js';
import {createGlassCourtRainPresence,GLASS_COURT_RAIN_FACES as faces} from '../src/game/glass-court-rain-presence.js';

const visitor={eye:{x:faces[0].x,y:faces[0].y,z:C.origin.z+2.5},forward:{x:0,y:0,z:-1},ready:true,dtSec:.05};
const stare=(controller,n=70,options={})=>{let frame;for(let i=0;i<n;i++)frame=controller.update({...visitor,...options});return frame;};

test('wet expressions belong to the two existing bodies and their real north panes',()=>{
 assert.equal(faces.length,bodies.length);
 for(const [i,f] of faces.entries()){
  assert.equal(f.sourceId,bodies[i].id);assert.ok(Math.abs(f.x-bodies[i].x)<=1);
  assert.ok(Math.abs(f.z-C.origin.z)<.01);assert.ok(f.y-f.height/2>C.drawnFloor+1.68&&f.y+f.height/2<C.drawnFloor+3.89);
  assert.equal(bodies[i].blocks,false);assert.equal(bodies[i].interactive,false);
 }
});

test('a glance remains rain; sustained attention forms a particular body’s expression',()=>{
 const controller=createGlassCourtRainPresence();
 assert.equal(stare(controller,8).faces[0].coherence,0);
 const frame=stare(controller);
 assert.equal(frame.coordinateSpace,'physical-metres');assert.ok(frame.faces[0].coherence>.98);
 assert.equal(frame.faces[0].phase,'recognised');assert.equal(frame.faces[1].coherence,0);
 assert.deepEqual(frame.shader.faces[0].slice(0,3),[faces[0].x,faces[0].y,faces[0].z]);
});

test('outside remains ordinary glass, including a recently observed expression',()=>{
 const controller=createGlassCourtRainPresence();stare(controller);
 for(const eye of[{x:faces[0].x,y:faces[0].y,z:C.origin.z-.5},{x:C.bounds.x1+1,y:1.7,z:C.origin.z+2}]){
  const frame=controller.update({...visitor,eye});assert.equal(frame.active,false);
  assert.equal(frame.shader.active,0);assert.ok(frame.faces.every(f=>f.coherence===0));
 }
});

test('rain expressions do not replace planting, body ownership or a usable retreat',()=>{
 const before=JSON.stringify(bodies),controller=createGlassCourtRainPresence();stare(controller);
 const retreat=stare(controller,140,{forward:{x:0,y:0,z:1}});
 assert.equal(retreat.faces[0].coherence,0);assert.equal(JSON.stringify(bodies),before);
 assert.equal(Object.hasOwn(retreat,'damage'),false);assert.equal(Object.hasOwn(retreat,'capture'),false);
});

test('pause, focus loss, first resume and a long frame cannot advance the stare',()=>{
 const controller=createGlassCourtRainPresence();const before=stare(controller,25);
 for(const interruption of[{paused:true},{focused:false}]){
  const held=controller.update({...visitor,dtSec:30,...interruption});
  assert.equal(held.clockSec,before.clockSec);assert.equal(held.faces[0].coherence,before.faces[0].coherence);
 }
 const resume=controller.update(visitor);assert.equal(resume.clockSec,before.clockSec);
 const longFrame=controller.update({...visitor,dtSec:30});assert.equal(longFrame.clockSec,before.clockSec);
 const next=controller.update(visitor);assert.ok(next.clockSec>before.clockSec);
});

test('reduced motion and reduced flashes retain recognisable static wet faces',()=>{
 for(const options of[{reducedMotion:true},{flashMode:'reduced'},{flashMode:'off'}]){
  const frame=stare(createGlassCourtRainPresence(),70,options);
  assert.ok(frame.faces[0].coherence>.98);assert.equal(frame.motionSec,0);assert.equal(frame.flowAmplitude,0);
  assert.equal(frame.shader.motion[3],0);
 }
});

test('missing geometry, dry glass, invalid camera and reset produce no supernatural surface',()=>{
 for(const options of[{ready:false},{rainAmount:0},{eye:null},{eye:{x:NaN,y:1,z:30}}]){
  const frame=stare(createGlassCourtRainPresence(),70,options);
  assert.ok(frame.faces.every(f=>f.coherence===0));
 }
 const controller=createGlassCourtRainPresence();stare(controller);controller.reset();
 const after=controller.update({...visitor,dtSec:0});assert.equal(after.clockSec,0);assert.equal(after.faces[0].coherence,0);
});
