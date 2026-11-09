import test from 'node:test';
import assert from 'node:assert/strict';
import {openingCabInstances,openingCabInspectionModel} from '../src/game/opening-cab-inspection.js';
import {OPENING_CAB_GEOMETRY as G} from '../src/data/opening-cab-object-geometry.js';
import {makeCoastalMemoryScene} from '../src/game/coastal-memory/scene.js';
import {freshWinding,stepWinding} from '../src/game/coastal-memory/winding.js';
import {MUSIC_BOX_CONSTRUCTION as C} from '../src/data/music-box-construction.js';
const point=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
const near=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8,`${a} ≈ ${b}`));
const rigid=m=>{for(const i of [0,4,8])assert.ok(Math.abs(Math.hypot(...m.slice(i,i+3))-1)<1e-8,'physical scale must stay one');};

test('cab inspection carries case and winding arbor together at unchanged physical scale',()=>{
 const anchor={x:12,y:1,z:23,yaw:.8,zone:0};
 const inspect={id:'music-box',eye:[12.2,2.6,23.1],center:G.targets['music-box'].point,cameraYaw:.5,cameraPitch:-.15,yaw:.65,pitch:.3,roll:.1,distance:.18};
 const parts=angle=>openingCabInstances(anchor,{inspect:{...inspect,crankAngle:angle}}).filter(p=>p.objectId==='music-box');
 const a=parts(0),b=parts(1.1),body=b.find(p=>p.mesh==='opening_cab_music_box'),key=b.find(p=>p.mesh==='opening_cab_music_box_key'),pivot=G.registration.musicBox.keyPivot;
 assert.equal(a.length,2);assert.equal(b.length,2);rigid(body.matrix);rigid(key.matrix);
 near(point(body.matrix,pivot),point(key.matrix,pivot));
 assert.notDeepEqual(a.find(p=>p.mesh===key.mesh).matrix,key.matrix,'the key must turn independently');
 assert.deepEqual(a.find(p=>p.mesh===body.mesh).matrix,body.matrix,'key motion must not turn the shell');
});

test('coastal pickup retains the same external arbor and closed shell through recoil',()=>{
 let winding=freshWinding();for(let i=0;i<8;i++)winding=stepWinding(winding,{held:true,turn:1},.25).state;
 const frame=w=>makeCoastalMemoryScene({hands:{handling:true,heldLocal:[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1],winding:w},worldFromLocal:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
 const a=frame(winding),released=stepWinding(winding,{held:false},.1).state,b=frame(released);
 assert.equal(released.playbackSeconds,winding.playbackSeconds,'spring recoil cannot invent reverse melody');
 for(const scene of [a,b]){const body=scene.props.find(p=>p.id==='coastal-broken-music-box'),key=scene.props.find(p=>p.id==='coastal-music-box-key');rigid(body.matrix);rigid(key.matrix);near(point(body.matrix,C.keyPivot),point(key.matrix,C.keyPivot));}
 assert.deepEqual(a.props.find(p=>p.id==='coastal-broken-music-box').matrix,b.props.find(p=>p.id==='coastal-broken-music-box').matrix);
 assert.notDeepEqual(a.props.find(p=>p.id==='coastal-music-box-key').matrix,b.props.find(p=>p.id==='coastal-music-box-key').matrix);
});

test('inspection describes the witnessed closed object without explaining the temporal clue',()=>{
 const value=openingCabInspectionModel({},'music-box');
 assert.match(value.musicBoxInspection.description,/Cream case/);
 assert.doesNotMatch(value.musicBoxInspection.description,/under the lid|dark wood|crash|never reached|already broken/i);
 assert.match(value.musicBoxInspection.description,/Lyle/);
});

test('actual cab controls rotate all three axes without steering, moving the camera or leaving winding held after focus loss',async()=>{
 const {makeOpeningVehicleScene}=await import('../src/game/opening-vehicle-scene.js');
 const events=[],rattles=[],scene=makeOpeningVehicleScene({driveEnabled:false,getAnchor:()=>({x:0,y:0,z:0,yaw:0}),getAssetStatus:()=>({loaded:true}),onWind:e=>events.push(e.type),onShake:amount=>rattles.push(amount)});
 scene.update(.016);assert.equal(scene.inspect('music-box'),true);
 const camera=structuredClone(scene.view().eye),rotations=[scene.inspectState().rotation];
 for(const code of ['KeyD','KeyW','BracketRight']){scene.key({code,type:'keydown'});scene.update(.2);scene.keyup({code});rotations.push(scene.inspectState().rotation);}
 for(let i=1;i<rotations.length;i++)assert.notDeepEqual(rotations[i],rotations[i-1]);
 assert.deepEqual(scene.view().eye,camera);assert.equal(scene.view().phase,'seated');assert.equal(scene.view().drive,null);
 assert.ok(rattles.length>=3);scene.pointer({type:'pointerdown',button:0});scene.blur();scene.pointer({type:'pointerup'});
 assert.deepEqual(events,['hold','cancel']);scene.resume();scene.key({code:'KeyE'});assert.equal(scene.inspectState(),null);scene.exit();
});
