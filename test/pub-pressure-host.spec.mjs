import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pubPressureAttended,pubPressureClearSight,PUB_PRESSURE_GLASS,PUB_PRESSURE_STARTED} from '../src/game/pub-pressure-host.js';
import {pubServiceInstances} from '../src/render/pub-service-presentation.js';
import {PUB_QUEST_FLAGS} from '../src/game/pub-quest.js';
import {PUB_ACTORS,pubActor} from '../src/data/pub-population.js';

// Rangefind the real served glass, as a camera operator would. This helper
// chooses a view; it does not duplicate the production projection/frustum test.
function lookAt(eye,target=PUB_PRESSURE_GLASS,options={}){
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z;
  return{eye:{...eye},yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),
    width:1280,height:720,tanHalfFov:.95,...options};
}
function closeCamera(){const g=PUB_PRESSURE_GLASS;return lookAt({x:g.x,y:g.y+.77,z:g.z+1});}

test('the attended point is inside Ed’s actual served glass, independent of held trays and other patrons',()=>{
  const flags={[PUB_QUEST_FLAGS.accepted]:true,[PUB_QUEST_FLAGS.trayTaken]:true,[PUB_QUEST_FLAGS.watersServed]:true};
  const instances=pubServiceInstances(flags),ed=instances.find(p=>p.id==='pub-water-ed');assert.ok(ed);
  assert.equal(ed.mesh,'pub_service_water_glass');assert.equal(PUB_PRESSURE_GLASS.x,ed.x);assert.equal(PUB_PRESSURE_GLASS.z,ed.z);
  assert.ok(PUB_PRESSURE_GLASS.y>ed.y&&PUB_PRESSURE_GLASS.y<ed.y+.12,'framing targets the visible glass body, above its table contact');
  assert.notEqual(PUB_PRESSURE_STARTED,PUB_QUEST_FLAGS.watersServed,'a witnessed presentation attempt cannot become quest completion');
  assert.equal(pubServiceInstances({}).some(p=>p.id==='pub-water-ed'),false,'the host’s separate served-water gate has a real visual consequence');
});

test('a close, properly framed native camera attends the real glass without mutating its pose',()=>{
  const camera=closeCamera(),before=structuredClone(camera);Object.freeze(camera.eye);Object.freeze(camera);
  assert.equal(pubPressureAttended(camera),true);assert.deepEqual(camera,before);
  assert.equal(Object.isFrozen(PUB_PRESSURE_GLASS),true);
  const fallback={eye:{...camera.eye},yaw:camera.yaw,pitch:camera.pitch};assert.equal(pubPressureAttended(fallback),true,'ordinary default lens/aspect remains usable');
});

test('a glass behind the camera, at the eye, or beyond bodily reach cannot spend attention',()=>{
  const camera=closeCamera();assert.equal(pubPressureAttended({...camera,yaw:camera.yaw+Math.PI,pitch:-camera.pitch}),false);
  assert.equal(pubPressureAttended(lookAt({...PUB_PRESSURE_GLASS})),false,'a zero-length forward projection cannot count as framing');
  const g=PUB_PRESSURE_GLASS;
  assert.equal(pubPressureAttended(lookAt({x:g.x,y:g.y+.77,z:g.z+2})),true);
  assert.equal(pubPressureAttended(lookAt({x:g.x,y:g.y+.77,z:g.z+2.1})),false,'range uses the actual three-dimensional separation, not only floor distance');
  assert.equal(pubPressureAttended(lookAt({x:g.x,y:g.y+.77,z:g.z+5})),false);
});

test('looking away in yaw or pitch releases the framing requirement while small adjustments retain it',()=>{
  const camera=closeCamera();
  for(const changes of[{yaw:camera.yaw+.12},{yaw:camera.yaw-.12},{pitch:camera.pitch+.10},{pitch:camera.pitch-.10}])assert.equal(pubPressureAttended({...camera,...changes}),true);
  for(const changes of[{yaw:camera.yaw+1.3},{yaw:camera.yaw-1.3},{pitch:camera.pitch+.9},{pitch:camera.pitch-.9}])assert.equal(pubPressureAttended({...camera,...changes}),false,JSON.stringify(changes));
});

test('attention respects the actual lens and portrait extraction rather than a fixed yaw cone',()=>{
  const centre=closeCamera(),side={...centre,yaw:centre.yaw+.5};
  assert.equal(pubPressureAttended(side),true,'the glass is still within the central landscape extraction');
  assert.equal(pubPressureAttended({...side,width:720,height:1280}),false,'the same glass is outside the portrait attention region');
  assert.equal(pubPressureAttended({...side,tanHalfFov:.2}),false,'a tighter lens cannot retain offscreen attention');
  assert.equal(pubPressureAttended({...centre,tanHalfFov:.2}),true,'the tighter lens still admits its centred subject');
});

test('missing or nonfinite camera/target geometry and malformed supplied viewports fail closed',()=>{
  const camera=closeCamera();for(const value of[null,undefined,{}, {eye:null}])assert.equal(pubPressureAttended(value),false);
  assert.equal(pubPressureAttended(camera,null),false);
  for(const value of[NaN,Infinity,-Infinity]){
    for(const axis of['x','y','z']){
      assert.equal(pubPressureAttended({...camera,eye:{...camera.eye,[axis]:value}}),false);
      assert.equal(pubPressureAttended(camera,{...PUB_PRESSURE_GLASS,[axis]:value}),false);
    }
    for(const axis of['yaw','pitch','width','height'])assert.equal(pubPressureAttended({...camera,[axis]:value}),false,`${axis} ${value}`);
  }
});

test('moving the real camera changes attention without moving the glass or inventing occlusion authority',()=>{
  const camera=closeCamera(),before={...PUB_PRESSURE_GLASS};assert.equal(pubPressureAttended(camera),true);
  const moved={...camera,eye:{...camera.eye,x:camera.eye.x+2.5}};assert.equal(pubPressureAttended(moved),false);
  assert.deepEqual(PUB_PRESSURE_GLASS,before);
  assert.equal(pubPressureAttended(camera,{...PUB_PRESSURE_GLASS,z:PUB_PRESSURE_GLASS.z+4}),false,'the explicit target follows its real physical position');
});

test('moving Ed’s water on its table clears the original legal view while preserving the rejected placement case',()=>{
  const eye={x:33.5,y:1.74,z:31.35},oldTarget={x:32.65,y:.97,z:32.79};
  const blocked=lookAt(eye,oldTarget),clear=lookAt(eye);
  const ed=pubActor('pub-patron-ed');assert.ok(ed);assert.equal(ed.posture,'seated');
  assert.equal(pubPressureAttended(blocked,oldTarget),true,'optical framing alone admitted the rejected native view');
  assert.equal(pubPressureClearSight(blocked,oldTarget),false,'the original placement cannot spend its attempt through a patron’s back');
  assert.equal(pubPressureClearSight(blocked,oldTarget,[ed]),false,'Ed’s actual seat root accounts for the original obstruction');
  assert.equal(pubPressureClearSight(blocked,oldTarget,PUB_ACTORS.filter(a=>a.id!==ed.id)),true,'other real patrons do not explain this obstruction');
  assert.notDeepEqual(PUB_PRESSURE_GLASS,oldTarget,'the fix moves the vessel rather than relocating the observer');
  assert.deepEqual(clear.eye,blocked.eye,'the previously legal camera position is retained');
  assert.equal(pubPressureAttended(clear),true,'the newly placed served glass remains properly framed');
  assert.equal(pubPressureClearSight(clear),true,'the same camera now clears the whole authoritative patron population');
});

test('body clearance tests only the visible segment and the patron’s occupied height',()=>{
  const ed=pubActor('pub-patron-ed'),actors=[ed],bodyY=ed.floor+.95;
  const eye={x:ed.x-1,y:bodyY,z:ed.z},point={x:ed.x+1,y:bodyY,z:ed.z};
  assert.equal(pubPressureClearSight({eye},point,actors),false,'a real seated patron between the observer and target blocks the sight line');
  assert.equal(pubPressureClearSight({eye:{x:ed.x+.5,y:bodyY,z:ed.z}},{x:ed.x+1.5,y:bodyY,z:ed.z},actors),true,'a patron behind the observer does not occlude');
  assert.equal(pubPressureClearSight({eye:{x:ed.x-1.5,y:bodyY,z:ed.z}},{x:ed.x-.5,y:bodyY,z:ed.z},actors),true,'a patron beyond the target does not occlude');
  for(const y of[ed.floor+.10,ed.floor+2.05]){
    assert.equal(pubPressureClearSight({eye:{...eye,y}},{...point,y},actors),true,'the conservative torso envelope does not become an infinite vertical wall');
  }
});

test('clear sight remains separate from framing and does not mutate camera or actor geometry',()=>{
  const camera=lookAt({x:34.1,y:1.74,z:33.1});camera.yaw+=Math.PI;
  const before=structuredClone(camera),actorsBefore=structuredClone(PUB_ACTORS);
  Object.freeze(camera.eye);Object.freeze(camera);
  assert.equal(pubPressureAttended(camera),false,'looking away fails attention even when no body intersects the ray');
  assert.equal(pubPressureClearSight(camera),true,'body clearance does not invent a second camera-framing test');
  assert.deepEqual(camera,before);assert.deepEqual(PUB_ACTORS,actorsBefore);
});

test('invalid sight-line and patron geometry fails closed rather than admitting a hidden or unknown target',()=>{
  const camera=lookAt({x:34.1,y:1.74,z:33.1}),ed=pubActor('pub-patron-ed');
  for(const value of[null,undefined,{}, {eye:null}])assert.equal(pubPressureClearSight(value),false);
  assert.equal(pubPressureClearSight(camera,null),false);
  assert.equal(pubPressureClearSight({eye:{...PUB_PRESSURE_GLASS,y:2}},PUB_PRESSURE_GLASS,[]),false,'a vertical-only segment supplies no usable horizontal body-clearance ray');
  for(const value of[NaN,Infinity,-Infinity]){
    for(const axis of['x','y','z']){
      assert.equal(pubPressureClearSight({...camera,eye:{...camera.eye,[axis]:value}}),false);
      assert.equal(pubPressureClearSight(camera,{...PUB_PRESSURE_GLASS,[axis]:value}),false);
    }
    for(const axis of['x','z','floor'])assert.equal(pubPressureClearSight(camera,PUB_PRESSURE_GLASS,[{...ed,[axis]:value}]),false,`${axis} ${value}`);
  }
  for(const actors of[null,{},'unknown',[null],[{}]])assert.equal(pubPressureClearSight(camera,PUB_PRESSURE_GLASS,actors),false);
  assert.equal(pubPressureClearSight(camera,PUB_PRESSURE_GLASS,[]),true,'an explicitly empty population is known geometry, not a missing population');
});

test('the controller, audio and camera-attention checks are registered once beside the ordinary pub suites',()=>{
  const source=readFileSync(new URL('./run-all.mjs',import.meta.url),'utf8');
  const registered=[...source.matchAll(/^\s*'([^']+)'/gm)].map(match=>match[1]);
  const pub=registered.indexOf('test/pub-quest.spec.mjs');assert.ok(pub>=0);
  for(const name of['test/pub-pressure.spec.mjs','test/pub-pressure-audio.spec.mjs','test/pub-pressure-host.spec.mjs']){
    assert.equal(registered.filter(p=>p===name).length,1,name);assert.ok(registered.indexOf(name)>pub&&registered.indexOf(name)<pub+5);
  }
});
