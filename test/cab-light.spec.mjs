import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAB_GLASS,CAB_SOURCES,cabGlassView,cabLightFrame,rigidInverse,CAB_LIGHT_GLSL} from '../src/render/cab-light.js';
import {CAB_DASH,CAB_DASH_MESHES,CAB_DASH_PACK} from '../src/data/cab-dash.js';
import {openingVehiclePoint,openingVehicleWorldToCab,openingVehicleInstances} from '../src/data/opening-vehicle.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const metrics=JSON.parse(read('public/assets/source-drive/geometry/metrics.json'));
const apply=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
const near=(a,b,eps=1e-6)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<eps,`${a} against ${b}`));

test('nothing outside the van reaches inside it except through the glass',()=>{
  const dash=[-.3,1.27,-.75],footwell=[.45,.75,-.5];
  // Up ahead, seen through the screen: it lands on the dash.
  assert.equal(cabGlassView(dash,[-.3,3.2,-3]),1);
  // Down at the headlamps' height, ahead of the bulkhead: the dash can't see it, nor can his feet.
  assert.ok(cabGlassView(dash,[.66,1.02,-2.7])<.001);
  assert.ok(cabGlassView(footwell,[.66,1.02,-2.7])<.001);
  // Straight overhead is the roof.
  assert.ok(cabGlassView([.48,1.3,-.2],[.48,6,-.2])<.001);
  // Behind him is the bulkhead.
  assert.ok(cabGlassView([.48,1.5,0],[.48,1.5,6])<.001);
  // Out of the door glass, either side.
  for(const side of[-1,1])assert.equal(cabGlassView([0,1.5,-.1],[side*6,1.6,-.1]),1);
  // A lamp inside the van is inside the van.
  assert.equal(cabGlassView([-.3,1.1,-.55],CAB_SOURCES.binnacle),1);
  // The pillar throws a real edge: the shape of the window, not a glow.
  const across=[-6,-4,-2,0,2,4,6].map(x=>cabGlassView([.6,1.35,-.5],[x,1.7,-3]));
  assert.ok(across.some(v=>v>.99)&&across.some(v=>v<.01),`${across}`);
});
test('the glass is the cabin\'s own, and the JS and the shader use the same numbers',()=>{
  const{windscreenOpening:w}=metrics;
  assert.equal(CAB_GLASS.screen.y0,w.bottomY);assert.equal(CAB_GLASS.screen.y1,w.topY);
  assert.equal(CAB_GLASS.screen.z0,w.bottomZ);assert.equal(CAB_GLASS.screen.z1,w.topZ);
  assert.equal(CAB_GLASS.screen.halfBottom,w.right);
  for(const n of[CAB_GLASS.screen.y0,CAB_GLASS.screen.z0,CAB_GLASS.side.x,CAB_GLASS.side.rear])assert.ok(CAB_LIGHT_GLSL.includes(Number(n).toFixed(4)),String(n));
});
test('the cab frame turns the world back into cab space, driving and parked',()=>{
  const c=Math.cos(.7),s=Math.sin(.7),m=[c,0,-s,0,0,1,0,0,s,0,c,0,41,2,-9,1];
  near(apply(rigidInverse(m),apply(m,[.48,1.65,.2])),[.48,1.65,.2]);
  assert.equal(cabLightFrame({}),null);
  const anchor={x:12,y:.4,z:-30,yaw:.9,zone:1},p=openingVehiclePoint(anchor,[.48,1.65,.2]);
  near(apply(openingVehicleWorldToCab(anchor),[p.x,p.y,p.z]),[.48,1.65,.2]);
  assert.equal(openingVehicleWorldToCab(null),null);
});
test('the endings\' lamps keep their beam: the opt-in is for lamps that have a direction',()=>{
  for(const path of['src/render/ending-drive-off-renderer.js','src/render/ending-walk-off-renderer.js'])assert.doesNotMatch(read(path),/physicalHeadlampCones/,path);
  assert.doesNotMatch(read('src/game/source-drive/scene.js').match(/const lamps=\(metrics\.body[^\n]*/)[0],/direction/,'the ordinary lamps have none to opt in with');
});
test('the shader takes the cab through the finish, which every stock uses, and only for the cab',()=>{
  const props=read('src/render/props3d.js');
  assert.match(props,/uCabInterior>\.5&&uCabLight\.x>0\.0\)localFinish\+=base\*cabOwnLight\(vWorld,n\)/);
  assert.match(props,/uCabInterior>\.5&&uCabLight\.x>0\.0\)arch\*=cabGlassTransmission\(/);
  const flag=props.match(/setMaterialScalar\('uCabInterior',(\/[^\n]*?\/)\.test\(name\)/)[1],match=new RegExp(flag.slice(1,-1));
  for(const mesh of['drive_cabin','opening_drive_cabin','drive_cabin_dash','opening_drive_cabin_dash','opening_drive_cabin_door_r','drive_radio','drive_wheel'])assert.match(mesh,match,mesh);
  // The mug is in the cab too, at about half: a pale thing in that light would be all you saw.
  assert.match(props,/name==='ending_van_cup'\?\.55:0/);
  // The wiper and the wing mirrors are outside; the glass would black them out.
  for(const mesh of['drive_wiper','drive_mirror_right','drive_vehicle_body','drive_road','opening_drive_wiper','opening_drive_vehicle_body'])assert.doesNotMatch(mesh,match,mesh);
});
test('the panel lamps are a real lamp in the slot only the cab sees, and the radio\'s light follows its switch',()=>{
  const scene=read('src/game/source-drive/scene.js');
  assert.match(scene,/id:'drive-instrument-bounce'[^\n]*intensity:headlights\?\.55:0/);
  assert.match(scene,/radio:s\.radioOn===false\?0:1/);
  assert.match(read('src/game/source-drive-renderer.js'),/cabLight:scene\.cabLight\|\|null/);
  assert.match(read('src/main.js'),/P3\.setParkedCabLight\(arrivalAnchor\?cabLightFrame\(/);
});
test('the dash lands on the cabin it was measured from',()=>{
  const[fuel,speed]=metrics.gauges;
  assert.deepEqual([CAB_DASH.fuel.x,CAB_DASH.fuel.y,CAB_DASH.fuel.r],[fuel.center[0],fuel.center[1],fuel.radius]);
  assert.deepEqual([CAB_DASH.speed.x,CAB_DASH.speed.y,CAB_DASH.speed.r],[speed.center[0],speed.center[1],speed.radius]);
  // The numerals are on the needle's own sweep, in its own range.
  assert.ok(Math.abs(CAB_DASH.speed.sweep-metrics.speedNeedle.rotationZAtMin)<1e-9);
  assert.match(metrics.speedNeedle.dialUnits,new RegExp(`0-${CAB_DASH.speed.maxMph}`));
  // In front of the old dial and its ticks, behind the needle.
  assert.ok(CAB_DASH.cluster.z>-.629&&CAB_DASH.cluster.z<metrics.speedNeedle.center[2]);
  assert.ok(CAB_DASH.fascia.z>metrics.dashboard.frontZ&&CAB_DASH.fascia.z<-.59);
  const{x0,x1,y0,y1}=CAB_DASH.fascia;
  for(const row of CAB_DASH.rockers)assert.ok(row.x>x0&&row.x<x1&&row.y>y0&&row.y<y1,row.id);
  // Clear of the wheel's own column and of the radio's bracket.
  for(const row of CAB_DASH.rockers)assert.ok(Math.abs(row.x-.48)>.12,row.id);
});
test('the pack is modest, unbranded and placed wherever the cabin is',()=>{
  const stats=JSON.parse(read('public/assets/source-drive/cab-dash/cab-dash.stats.json'));
  assert.deepEqual(stats.meshes,[...CAB_DASH_MESHES]);assert.ok(stats.triangles<6000,String(stats.triangles));
  assert.ok(stats.bytes<1.5e6,String(stats.bytes));
  for(const path of['tools/chunk_surfer/source-drive-study/render-cab-dash-faces.py','tools/chunk_surfer/source-drive-study/build-cab-dash.mjs','src/data/cab-dash.js']){
    // Saying there's no maker's name is fine; printing one isn't.
    const source=read(path);assert.doesNotMatch(source,/\b(?:Ford|Transit|Motorcraft|Vauxhall|Bedford)\b/,path);
  }
  assert.match(read('src/game/source-drive/scene.js'),/cab\('drive_cabin'\);cab\('drive_cabin_dash'\)/);
  assert.match(read('src/game/source-drive/teaser-scene.js'),/drive_\(\?:cabin\(\?:_dash\)\?\|/,'it goes over the cliff with the van');
  assert.match(read('src/game/source-drive-renderer.js'),new RegExp(`path:'${CAB_DASH_PACK}'`));
  assert.match(read('src/render/r3d.js'),/P3\.addPropPack\(assetUrl\(CAB_DASH_PACK\)\)/);
  const parked=openingVehicleInstances({x:0,y:0,z:0,yaw:0,zone:1});
  assert.ok(parked.some(row=>row.mesh==='opening_drive_cabin_dash'));
});
