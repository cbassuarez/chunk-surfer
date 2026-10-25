import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceReturnRenderFrame,createSourceReturnFlashbackRenderer} from '../src/render/source-return-flashback-renderer.js';
import {sampleSourceReturnFlashback} from '../src/game/source-return-flashback.js';
import {makeCoastalMemoryScene} from '../src/game/coastal-memory/scene.js';
import {COASTAL_WORLD_FROM_LOCAL,coastalLocalPoint} from '../src/data/coastal-memory.js';
import {createPropRangeController} from '../src/render/prop-range.js';
import {coastalWaterUniforms} from '../src/render/coastal-memory-water.js';
import {localLightConeWeight} from '../src/render/local-light-cone.js';
const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const sample=(t,extra={})=>sampleSourceReturnFlashback(t,{destination:'tower',metrics,...extra});
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const near=(a,b,e=.0002)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const nearVector=(a,b)=>{assert.equal(a.length,b.length);for(let k=0;k<a.length;k++)near(a[k],b[k]);};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(a=>{resolve=a;});return{promise,resolve};}

test('actual vehicle, physical eye and headlamp transforms are retained through deep water, reversed fall and third-person release',()=>{
 for(const t of[0,4,15,26,49]){const input=sample(t),before=structuredClone(input),out=sourceReturnRenderFrame(input,metrics);assert.deepEqual(input,before,'authoring the view cannot move its sampled simulation state');nearVector(out.scene.body,input.vehicle.bodyMatrix);nearVector(out.scene.eye,input.camera.eye);near(out.look.yaw,input.camera.yaw);near(out.look.pitch,input.camera.pitch);assert.equal(out.cinematicLook,true);assert.equal(out.driveState.programTime,t);assert.equal(out.driveState.cutEnabled,false);assert.equal(out.scene.cut.sources.length,0);assert.equal(out.scene.predicaments.sources.length,0);assert.equal(out.scene.mirrors.length,0);
  for(const[i,anchor]of metrics.body.headlamps.entries()){const lamp=out.scene.lamps.find(l=>l.id==='drive-headlamp-'+i);assert.ok(lamp);const expected=point(input.vehicle.bodyMatrix,anchor);nearVector([lamp.x,lamp.y,lamp.z],expected);nearVector(input.lamps[i].position,expected);assert.equal(lamp.intensity,5);if(out.coastalMemory)nearVector(out.coastalMemory.lights[i].position,expected);}
 }
});

test('fish lanes and distant stars stay in canonical sea-space rather than following the player camera',()=>{
 const input=sample(4),normal=sourceReturnRenderFrame(input,metrics),moved=structuredClone(input);moved.camera.eye[0]+=18;moved.camera.eye[1]+=7;moved.camera.yaw+=.6;const other=sourceReturnRenderFrame(moved,metrics,{lookOffset:{yaw:.4,pitch:-.2}}),fauna=normal.scene.props.filter(p=>p.mesh.startsWith('source_return_'));
 assert.equal(fauna.filter(p=>p.mesh==='source_return_fish_body').length,18);assert.equal(fauna.filter(p=>p.mesh==='source_return_fish_fins').length,18);assert.equal(fauna.filter(p=>p.mesh==='source_return_star').length,64);
 for(const p of fauna){const same=other.scene.props.find(q=>q.id===p.id);assert.deepEqual(same.matrix,p.matrix);const local=coastalLocalPoint(p.matrix.slice(12,15));if(p.mesh==='source_return_star'){assert.ok(local[1]>60);assert.ok(Math.hypot(...p.matrix.slice(12,15).map((x,k)=>x-input.camera.eye[k]))<260,'the real driving cull must retain the surface stars');}else assert.ok(local[1]>-38&&local[1]<-33);}
 assert.deepEqual(normal.coastalMemory.siteMatrix,COASTAL_WORLD_FROM_LOCAL);assert.equal(normal.coastalMemory.waterY,0);assert.equal(normal.coastalMemory.flood,1);assert.ok(!normal.scene.props.some(p=>/sea.surface|opaque.water/.test(p.mesh)));
});

test('all submitted sea details resolve by the real prop loader mesh keys in the generated GLB',()=>{
 const bytes=readFileSync(new URL('../public/assets/source-return/fauna.glb',import.meta.url)),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),catalog=new Map(doc.meshes.map(mesh=>[mesh.name,mesh]));
 const out=sourceReturnRenderFrame(sample(4),metrics);
 for(const prop of out.scene.props.filter(p=>p.mesh.startsWith('source_return_'))){const mesh=catalog.get(prop.mesh);assert.ok(mesh,'prop loader cannot resolve '+prop.mesh);for(const primitive of mesh.primitives){assert.equal(primitive.mode??4,4);assert.ok(Number.isInteger(primitive.indices));assert.ok(Number.isInteger(primitive.attributes.NORMAL));assert.ok(doc.accessors[primitive.attributes.POSITION].count>12);}}
 assert.equal(doc.extensionsRequired,undefined,'the pack remains supported by the ordinary prop parser');
});

test('only the transient return lowers the actual seabed52m; the canonical coast and vehicle dimensions remain intact',()=>{
 const t=4,canonical=makeCoastalMemoryScene({timeSec:t,includeWreck:false,vehicleMetrics:metrics}),saved=structuredClone(canonical.props),input=sample(t),out=sourceReturnRenderFrame(input,metrics),seabed=canonical.props.find(p=>p.mesh==='cm_seabed'),lowered=out.scene.props.find(p=>p.mesh==='cm_seabed');assert.ok(seabed&&lowered);for(let k=0;k<16;k++)near(lowered.matrix[k],seabed.matrix[k]-(k===13?52:0));assert.deepEqual(canonical.props,saved);
 for(const mesh of['cm_limestone_coast','cm_grass_bank','cm_soil_cap','cm_distant_pier'])nearVector(out.scene.props.find(p=>p.mesh===mesh).matrix,canonical.props.find(p=>p.mesh===mesh).matrix);
 assert.equal(out.scene.props.some(p=>p.mesh==='cm_wreck_seat'||p.id==='coastal-sunken-same-van'),false);assert.equal(out.scene.props.some(p=>/cm_(?:broken_music_box|music_box|damp_note)/.test(p.mesh)),false);
 assert.deepEqual(out.weather.returnBlack.min,metrics.body.min);assert.deepEqual(out.weather.returnBlack.max,metrics.body.max);assert.equal(out.scene.props.filter(p=>p.mesh==='drive_vehicle_body').length,1);assert.equal(out.scene.props.filter(p=>p.mesh==='drive_tyre').length,4);
});

test('full Source black retains only the actual van and its physical dolly with a body-space world exclusion frame',()=>{
 const input=sample(49),out=sourceReturnRenderFrame(input,metrics);assert.equal(input.sourceBlack,1);assert.ok(out.scene.props.length>5);assert.ok(out.scene.props.every(p=>/^drive_(?:cabin|radio(?:_needle)?|vehicle_body|wheel|wiper|speed_needle|tyre|recorder_|mirror_|left_|right_)/.test(p.mesh)));assert.equal(out.coastalMemory,null);assert.equal(out.weather.rain,0);assert.equal(out.weather.extinction,0);assert.equal(out.weather.cloud,0);assert.equal(out.weather.returnBlack.amount,1);
 for(const local of[[0,0,0],metrics.body.min,metrics.body.max,[.48,1.65,-.25]])nearVector(point(out.weather.returnBlack.worldToBody,point(input.vehicle.bodyMatrix,local)),local);nearVector(out.scene.eye,input.camera.eye);assert.ok(out.scene.props.every(p=>!p.mesh.startsWith('source_return_')));
});

test('deep return water reveals actual fish and transmitted stars without changing the ordinary coast calibration',()=>{
 const input=sample(4),out=sourceReturnRenderFrame(input,metrics);
 assert.equal(out.weather.active,false,'air weather cannot obscure an underwater scene');
 assert.deepEqual(coastalWaterUniforms(out.coastalMemory).optics,[.35,.12]);
 assert.equal(input.coastalMemory.waterOptics,undefined,'the sampler and shared coast stay unmodified');
 assert.deepEqual(coastalWaterUniforms(input.coastalMemory).optics,[1,1]);
});

test('the steeply pitched return headlamps illuminate along the real body axis',()=>{
 for(const t of[4,15,26,40]){const input=sample(t),out=sourceReturnRenderFrame(input,metrics);assert.equal(out.physicalHeadlampCones,true);
  for(const source of input.lamps){const actual=out.scene.lamps.find(l=>l.id===source.id);nearVector(actual.direction,source.direction);assert.ok(localLightConeWeight(actual,source.direction.map(v=>v*8))>.999);assert.equal(localLightConeWeight(actual,source.direction.map(v=>v*-8)),0);}
 }
 const driveRenderer=readFileSync(new URL('../src/game/source-drive-renderer.js',import.meta.url),'utf8'),propRenderer=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 assert.match(driveRenderer,/physicalHeadlampCones:frame\.physicalHeadlampCones===true/,'the host must carry the opt-in to the actual prop draw');
 assert.match(propRenderer,/uDriveHeadlight\.z<\.5&&li<2/,'ordinary dipped road lamps retain their existing cutoff; the return uses its true cone');
});

function fixture({initial,pack}={}){
 let ready=false;const calls=[],frames=[],ranges=[];const borrowed={async initialize(options){calls.push(['initialize',options]);const result=initial?await initial.promise:true;ready=result!==false;return result;},ready:()=>ready,render(frame){calls.push(['render']);frames.push(frame);return ready;},dispose(){calls.push(['dispose']);ready=false;}};
 const actualRange=createPropRangeController();
 const props={async addPropPack(url){calls.push(['pack',url]);if(pack)await pack.promise;},setAuthoredPropRange(owner,far){const release=actualRange.acquire(owner,far),lease={owner,far,released:0};ranges.push(lease);return()=>{lease.released++;release();};}};
 const owner=createSourceReturnFlashbackRenderer({createRenderer:()=>borrowed,props,resolveAsset:p=>'resolved:'+p});return{owner,calls,frames,ranges};
}

test('the existing driving renderer owns presentation; initialization waits for fauna and acquires one releasable distant range',async()=>{
 const pack=deferred(),f=fixture({pack});assert.equal(f.owner.ready(),false);assert.equal(f.owner.render(sample(4),metrics),false,'no partial picture before preparation');const first=f.owner.initialize(),second=f.owner.initialize();await flush();assert.deepEqual(f.calls.filter(c=>c[0]==='initialize'),[['initialize',{coastalMemory:true}]]);assert.equal(f.owner.ready(),false,'a ready van is not yet a ready return picture');assert.equal(f.ranges.length,0);pack.resolve();assert.equal(await first,true);assert.equal(await second,true);assert.equal(f.ranges.length,1);assert.equal(f.ranges[0].owner,'source-return');assert.ok(f.ranges[0].far>=260&&f.ranges[0].far<=320,'the real range controller must accept the return lease');assert.equal(f.owner.ready(),true);
 assert.equal(f.owner.render(sample(4),metrics),true);assert.equal(f.frames.length,1);assert.equal(f.frames[0],f.owner.last());assert.equal(f.frames[0].cinematicLook,true);assert.equal(f.frames[0].coastalMemory.active,true);f.owner.dispose();f.owner.dispose();assert.equal(f.ranges[0].released,1);assert.equal(f.calls.filter(c=>c[0]==='dispose').length,1);assert.equal(f.owner.ready(),false);assert.equal(f.owner.render(sample(4),metrics),false);
});

test('an unavailable borrowed renderer cannot install fauna or claim a ready return',async()=>{
 const initial=deferred(),f=fixture({initial}),pending=f.owner.initialize();initial.resolve(false);assert.equal(await pending,false);assert.equal(f.calls.some(c=>c[0]==='pack'),false);assert.equal(f.ranges.length,0);assert.equal(f.owner.ready(),false);assert.equal(f.owner.render(sample(4),metrics),false);f.owner.dispose();
});

test('late asynchronous preparation after disposal cannot obtain a range or render a picture',async()=>{
 for(const stage of['renderer','fauna']){const gate=deferred(),f=fixture(stage==='renderer'?{initial:gate}:{pack:gate}),pending=f.owner.initialize();await flush();f.owner.dispose();gate.resolve(true);assert.equal(await pending,false);assert.equal(f.ranges.length,0);assert.equal(f.calls.filter(c=>c[0]==='dispose').length,1);assert.equal(f.owner.ready(),false);assert.equal(f.owner.render(sample(4),metrics),false);}
});
