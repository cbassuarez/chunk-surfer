import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimateHushClearance, estimateHushApproachClearance} from '../src/game/hush-clearance.js';
import {HUSH_POSTURE_NATIVE_HEIGHT_M} from '../src/data/generated/hush-last-posture-support.js';
import {pressureInstances, pressureSurfaceInstances} from '../src/render/pressure-volume.js';
import {sourceDesktopDensityPerformance} from '../src/render/source-desktop-view.js';

const identity=(x,y)=>({x,z:y});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.0013,`${a} != ${b}`);

test('the body can prepare for a narrow throat before entering it, without moving its navigation root',()=>{
  const actor=Object.freeze({x:0,y:0,heading:0});let queries=0;
  const navigation=Object.freeze({
    isWalkable(p){queries++;return p.y>-.6||Math.abs(p.x)<.25;},
    resolveMove(){assert.fail('presentation cannot request movement');},
    findPath(){assert.fail('presentation cannot change the route');},
  });
  const options={actor,navigation,logicalToPhysical:identity,cellMetres:1};
  const current=estimateHushClearance(options);assert.equal(current,.90);
  near(estimateHushApproachClearance({...options,currentClearanceM:current}),.46);
  assert.deepEqual(actor,{x:0,y:0,heading:0});assert.ok(queries<=83,`unbounded clearance work: ${queries}`);
});

test('a wall ahead does not masquerade as a narrow passage and unavailable geometry retains the current width',()=>{
  const actor={x:0,y:0,heading:0};
  assert.equal(estimateHushApproachClearance({actor,logicalToPhysical:identity,cellMetres:1,
    navigation:{isWalkable:p=>p.y>-.3}}),.90);
  assert.equal(estimateHushApproachClearance({actor,logicalToPhysical:()=>{throw Error('unloaded');},
    currentClearanceM:.63,navigation:{isWalkable:()=>true}}),.63);
});

test('clearance look-ahead is measured in physical metres through a rotated scaled floorplan',()=>{
  const actor={x:0,y:0,heading:0};
  const mapping=(x,y)=>({x:17-y*2,z:11+x*2});
  // One logical unit is two physical metres. The .8m probe reaches -.4,
  // while a mistaken .8 logical probe would run into the closed wall.
  const navigation={isWalkable:p=>p.y>-.3||p.y>-.6&&Math.abs(p.x)<.125};
  near(estimateHushApproachClearance({actor,navigation,logicalToPhysical:mapping,cellMetres:1}),.46);
});

test('edge-leading presentation retains anatomy, root, height and the exact fitted return transform',()=>{
  const actor={id:'last-posture',x:8,y:12,floorH:2.4,heightM:HUSH_POSTURE_NATIVE_HEIGHT_M,strength:.9,clearanceM:.46,
    performance:{version:1,role:'live-pressure',heading:.3,clip:'pressure_hold',time:0,manifestation:1,seed:1,
      density:{version:1,phase:0,clearanceTurn:Math.PI/2}}};
  const before=structuredClone(actor),body=pressureInstances(actor)[0],surface=pressureSurfaceInstances([body])[0];
  assert.equal(body.scaleX,1,'anatomy must not be flattened across a doorway');
  assert.equal(body.scale,1);assert.equal(body.x,4.25);assert.equal(body.z,6.25);assert.equal(body.y,2.4);
  assert.ok(Math.abs(body.yaw-(.3+Math.PI/2))<1e-8);
  for(const key of ['x','y','z','yaw','scale','scaleX','character'])assert.deepEqual(surface[key],body[key]);
  assert.deepEqual(actor,before);
});

test('a stationary battle stage cannot spend locomotion phase or carry a narrow-door body turn',()=>{
  const captured={density:{version:1,phase:2.3,traction:1,drive:1,clearanceTurn:Math.PI/2,seed:17}};
  const state={intent:{kind:'broadcast',progress:.4},clock:4,reducedMotion:false};
  const first=sourceDesktopDensityPerformance(state,captured),later=sourceDesktopDensityPerformance({...state,clock:400},captured);
  assert.equal(first.phase,later.phase);assert.equal(first.rate,0);assert.equal(first.traction,0);assert.equal(first.drive,0);
  assert.equal(first.clearanceTurn,0);assert.equal(captured.density.clearanceTurn,Math.PI/2);
});

test('secondary material transport is decoded before exposure/acquisition and its same payload survives dither',()=>{
  const acquisition=readFileSync(new URL('../src/render/pixel-mesh/transparent.js',import.meta.url),'utf8');
  const decode=acquisition.indexOf('vec2 cosmic=hushCosmosDecodeTransport(linear)');
  assert.ok(decode>0&&decode<acquisition.indexOf('vec3 display=sRGBTransferOETF'));
  assert.match(acquisition,/linear=mix\(linear,hushCosmosSignalMaterial\(cosmic.y\).rgb,cosmic.x\)/);
  const shader=readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8');
  const finish=shader.slice(shader.indexOf('if(uSourcePressureFinish>.5)'),shader.indexOf('if(uDebugSource == 1.0)'));
  assert.match(finish,/hushCosmosDecodeTransport\(raw\)/);
  assert.match(finish,/pressureRecordedCosmosInk\(finalColor,vec4\(cosmic.x,0.0,cosmic.y,cosmic.x\)\)/);
  assert.doesNotMatch(finish,/hushCosmosWorldField|raw.g\*1.25|smoothstep\(\.28,\.85/,
    'POST cannot paint another sky or infer identity from the old purple colour');
});
