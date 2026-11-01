import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Matrix4} from 'three';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C} from '../src/data/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from '../src/data/generated/source-earthfall-ellery-aside.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {THRESHOLD_GAG_MESHES,THRESHOLD_GAG} from '../src/data/threshold-gag.js';
import {thresholdGagGeometry,thresholdGagPosePoint} from '../tools/chunk_surfer/threshold-gag-geometry.mjs';
import {freshSourceEarthfallElleryAside,sourceEarthfallElleryAsideFrame,sourceElleryAsideObjectMatrix,multiplyAsideMatrix,transformAsidePoint} from '../src/game/source-earthfall-ellery-aside.js';
import {sourceEarthfallGagRenderFrame,sourceEarthfallGagNativeMatrix,SOURCE_EARTHFALL_GAG_REQUIRED,SOURCE_EARTHFALL_GAG_APPARITION_MESH} from '../src/render/source-earthfall-gag.js';
import {createSourceEarthfallElleryAsideRenderer,SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED} from '../src/render/source-earthfall-ellery-aside.js';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pointNear=(a,b)=>a.forEach((v,k)=>near(v,b[k]));
const liveMount=()=>sourceEarthfallElleryAsideFrame(freshSourceEarthfallElleryAside()).gag.mount;
function stagedFrame({elapsed=0,angle=0,shadow=null,...extra}={}){
 const mount=liveMount();return{elapsed,blackoutAlpha:0,eye:[C.spawn.x,C.eyeHeight,C.spawn.z],yaw:C.spawn.yaw,pitch:C.spawn.pitch,
  gag:{enabled:true,phase:'spent',elapsed:9,angle,mount,supportMatrix:sourceElleryAsideObjectMatrix('gag',[mount.x,0,mount.z],elapsed),shadow},...extra};
}

test('the reused mechanism and its sound anchors share one honest Source hinge pose and floor carrier',()=>{
 for(const elapsed of[0,C.floorCoreAt+.8])for(const angle of[0,.04,.10,.7,Math.PI/2]){
  const f=stagedFrame({elapsed,angle}),r=sourceEarthfallGagRenderFrame(f),g=f.gag,m=g.mount;
  assert.deepEqual(r.props.map(p=>p.mesh),THRESHOLD_GAG_MESHES);
  const fixed=multiplyAsideMatrix(g.supportMatrix,sourceEarthfallGagNativeMatrix(m)),moving=multiplyAsideMatrix(g.supportMatrix,sourceEarthfallGagNativeMatrix({...m,yaw:m.yaw+angle}));
  assert.deepEqual(r.props.slice(0,2).map(p=>p.matrix),[fixed,fixed]);assert.deepEqual(r.props.slice(2).map(p=>p.matrix),[moving,moving]);
  pointNear(Object.values(r.speaker),transformAsidePoint(moving,THRESHOLD_GAG.speaker));pointNear(Object.values(r.contact),transformAsidePoint(fixed,THRESHOLD_GAG.contact));
  const hinge=transformAsidePoint(moving,[0,0,0]);pointNear(hinge,transformAsidePoint(fixed,[0,0,0]));
  const p=[-.72,.32,.08],native=thresholdGagPosePoint(thresholdGagPosePoint(p,angle),m.yaw),expected=transformAsidePoint(g.supportMatrix,[m.x+native[0],m.y+native[1],m.z+native[2]]);
  pointNear(transformAsidePoint(moving,p),expected);
 }
 const f=stagedFrame({elapsed:C.floorCoreAt+.8}),r=sourceEarthfallGagRenderFrame(f);assert.ok(r.mount.y<f.gag.mount.y-.1,'the assembly goes with its failed floor instead of hovering in the remembered room');
});

test('the detached presence reuses pressure variant15 with no shadow and never follows the camera',()=>{
 const mount=liveMount(),shadow={x:mount.x+1.1,z:mount.z+.8,feet:0,yaw:-.4,pitch:.1,scale:1.05,charge:.76,variant:15},f=stagedFrame({elapsed:3.5,shadow}),a=sourceEarthfallGagRenderFrame(f),b=sourceEarthfallGagRenderFrame({...f,eye:[70,4,13],yaw:2,pitch:-1});
 assert.deepEqual(a.props,b.props,'head movement must not reposition, billow or billboard the pressure');
 assert.equal(a.shadow.mesh,SOURCE_EARTHFALL_GAG_APPARITION_MESH);assert.equal(a.shadow.apparitionVariant,15);assert.equal(a.shadow.noShadow,true);assert.equal(a.shadow.structural,false);assert.equal(a.shadow.emissive[3],shadow.charge);
 const carrier=sourceElleryAsideObjectMatrix('pressure',[shadow.x,shadow.feet,shadow.z],f.elapsed),matrix=multiplyAsideMatrix(carrier,sourceEarthfallGagNativeMatrix({x:shadow.x,y:shadow.feet,z:shadow.z,yaw:shadow.yaw,pitch:shadow.pitch,scale:shadow.scale}));
 assert.deepEqual(a.shadow.matrix,matrix);assert.equal(sourceEarthfallGagRenderFrame(stagedFrame({shadow:{...shadow,charge:0}})).shadow,null);
 assert.equal(sourceEarthfallGagRenderFrame({...f,blackoutAlpha:1}).props.length,0);assert.equal(sourceEarthfallGagRenderFrame({...f,gag:{...f.gag,enabled:false}}).props.length,0);
});

test('floor pressure remains a thin ground-clear projection without scaling or flattening the apparatus',()=>{
 const mount=liveMount(),shadow={x:mount.x+.9,z:mount.z+.7,feet:.025,yaw:-.4,pitch:-Math.PI/2,scaleZ:.1,charge:.70},f=stagedFrame({shadow}),r=sourceEarthfallGagRenderFrame(f),plain=sourceEarthfallGagRenderFrame(stagedFrame()),b=PROP_BOUNDS[SOURCE_EARTHFALL_GAG_APPARITION_MESH],bounds=new Box3();
 for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])bounds.expandByPoint(new Vector3(...transformAsidePoint(r.shadow.matrix,[x,y,z])));
 assert.ok(bounds.min.y>=C.room.floor,'even the full uneroded mesh stays above its real floor');
 assert.ok(bounds.max.y<C.room.floor+.04,'the original depth becomes a thin floor clearance, never an upright body');
 assert.ok(Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)>1.5,'body length survives as a substantial floor trace');
 assert.deepEqual(r.props.slice(0,4),plain.props,'nonuniform pressure scale must not reach the four rigid apparatus parts');
 assert.equal(r.shadow.apparitionVariant,15);assert.equal(r.shadow.noShadow,true);
});

test('actual complete apparatus sweep clears the copied room, all furnishings, doors and the ordinary arrival lane',()=>{
 const mount=liveMount(),geometry=thresholdGagGeometry(),bounds=new Box3(),native=sourceEarthfallGagNativeMatrix(mount);
 for(let k=0;k<=180;k++)for(const mesh of geometry)for(const g of mesh.groups.values())for(let i=0;i<g.p.length;i+=3){
  const local=g.p.slice(i,i+3),p=mesh.part==='moving'?thresholdGagPosePoint(local,k/180*Math.PI/2):local;bounds.expandByPoint(new Vector3(...transformAsidePoint(native,p)));
 }
 assert.ok(bounds.min.x>C.room.minX+C.bodyRadius&&bounds.max.x<C.room.maxX-C.bodyRadius&&bounds.min.z>C.room.minZ+C.bodyRadius&&bounds.max.z<C.room.maxZ-C.bodyRadius);
 near(bounds.min.y,C.room.floor);assert.ok(bounds.max.y<C.room.ceiling-.5);
 // Copied furnishings use the ordinary room's opposite yaw convention.
 for(const p of ASSET.props.filter(p=>p.bounds)){
  const matrix=new Matrix4().makeRotationY(p.yaw||0);matrix.setPosition(p.x,p.y,p.z);const box=new Box3(new Vector3(...p.bounds.min),new Vector3(...p.bounds.max)).applyMatrix4(matrix);
  assert.equal(bounds.intersectsBox(box),false,`the swept apparatus intersects ${p.id}`);
 }
 for(const panel of ASSET.panels.filter(p=>p.kind==='portal'))assert.equal(bounds.intersectsBox(new Box3(new Vector3(...panel.bounds.min),new Vector3(...panel.bounds.max))),false,`the apparatus enters the actual ${panel.id} doorway`);
 const c=Math.cos(mount.yaw),s=Math.sin(mount.yaw),dx=C.spawn.x-mount.x,dz=C.spawn.z-mount.z,laneX=c*dx+s*dz;
 assert.ok(laneX-.46-C.bodyRadius>.10,'ordinary forward walking clears the fixed scenery feet and the whole swing without moving the player');
});

function residencyFixture({missing=[],gate=null}={}){
 const catalog=new Set(SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED.filter(n=>!missing.includes(n))),calls=[],packs=[];
 const renderer=new Proxy({}, {get:(_,name)=>(...args)=>{calls.push({name,args});return name==='r3dAuthoredPropsReady'||name==='r3dBasePropsReady'?Promise.resolve(true):name==='r3dFrame'?true:undefined;}});
 const props={propMeshCatalog:()=>[...catalog],async addPropPack(url){packs.push(url);if(gate)await gate;if(url.endsWith('ellery-threshold-gag.glb'))THRESHOLD_GAG_MESHES.forEach(n=>catalog.add(n));if(url.endsWith('conservatory-props.glb'))catalog.add(SOURCE_EARTHFALL_GAG_APPARITION_MESH);}};
 const owner=createSourceEarthfallElleryAsideRenderer({renderer,props,resolveAsset:u=>u,getTorch:()=>({on:false,look:{power:0}})});
 return{owner,catalog,calls,packs};
}
test('the shared renderer acquires and repairs the dedicated gag without incomplete draws or a camera/torch override',async()=>{
 const h=residencyFixture({missing:THRESHOLD_GAG_MESHES});assert.equal(await h.owner.initialize(),true);assert.deepEqual(h.packs,['assets/ellery-threshold-gag.glb']);
 const state=freshSourceEarthfallElleryAside();assert.equal(h.owner.render(state),true);const draw=h.calls.findLast(c=>c.name==='r3dFrame').args[0],expected=sourceEarthfallElleryAsideFrame(state);
 assert.deepEqual(draw.authoredCamera,{eye:expected.eye,yaw:expected.yaw,pitch:expected.pitch});assert.equal(draw.light,0);assert.equal(draw.torchLook.power,0);assert.equal(draw.textSpace,false);
 const count=h.calls.filter(c=>c.name==='r3dFrame').length;h.catalog.delete(SOURCE_EARTHFALL_GAG_APPARITION_MESH);assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(state),true);assert.equal(h.calls.filter(c=>c.name==='r3dFrame').length,count);
 assert.equal(await h.owner.ensureResident(),true);assert.deepEqual(h.packs,['assets/ellery-threshold-gag.glb','assets/conservatory-props.glb']);assert.equal(h.owner.render(state),true);h.owner.dispose();
});
test('retiring the scene during dedicated-pack preparation cannot reacquire the room or submit a stray pressure',async()=>{
 let release;const h=residencyFixture({missing:THRESHOLD_GAG_MESHES,gate:new Promise(r=>release=r)}),loading=h.owner.initialize();await Promise.resolve();h.owner.dispose();release();assert.equal(await loading,false);assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(freshSourceEarthfallElleryAside()),false);assert.equal(h.calls.some(c=>c.name==='r3dFrame'),false);
});
