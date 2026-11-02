import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash}from'node:crypto';
import * as FP from '../src/world/floorplan.js';import * as PROPS from '../src/game/props.js';
import {conservatory}from'../src/data/floorplan/conservatory.js';
import {YARD_TURN_FRAMES,YARD_TURN_YAW,YARD_TURN_REVIEW_PATH,yardTurnPoint}from'../src/data/yard-turn.js';
import {YARD_JARDINS}from'../src/data/yard-jardins.js';
import {EXTERIOR_MAP_PLAN}from'../src/data/exterior-map-plan.js';
import {canonicalOutskirtsExteriorPose}from'../src/data/source-outskirts-town.js';
import {courtyardWalk}from'./helpers/exterior-pub-route.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);PROPS.setColliderGroupEnabled('exterior-infrastructure',true);
const placed=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
function body(x,z){const p=FP.logicalAtPhysical(x*2-.5,z*2-.5,{group:'ground',floor:0});assert.ok(p,`supported ${x},${z}`);const actual=FP.logicalToPhysical(p.x,p.y);close((actual.x+.5)*.5,x);close((actual.z+.5)*.5,z);return p;}
test('all retained range shells and Source snapshots share the same quarter turn and map footprints',()=>{
 for(const[id,f]of Object.entries(YARD_TURN_FRAMES)){const p=placed.get(id);assert.ok(p);close(p.x,f.target.x);close(p.z,f.target.z);close(Math.sin(p.yaw),Math.sin(YARD_TURN_YAW));const source=canonicalOutskirtsExteriorPose(id);close(source.x,p.x);close(source.z,p.z);close(Math.cos(source.yaw),Math.cos(p.yaw));const shape=EXTERIOR_MAP_PLAN.buildings.find(b=>b.id===id);assert.ok(shape);assert.ok(shape.points.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));}
 for(const id of['pub-complete-frontage','pub-complete-interior']){const a=placed.get(id),b=canonicalOutskirtsExteriorPose(id);close(a.x,b.x);close(a.z,b.z);close(Math.sin(a.yaw),Math.sin(b.yaw));}
});
test('the full rear spine has a measured 1.5m usable body-centre band against current geometry and planting',()=>{
 for(let z=13.25;z<=85.25;z+=.5)for(const x of[44.5,45.25,46.0]){const p=body(x,z);assert.ok(Math.abs(FP.floorAt(p.x,p.y))<.25);assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`spine ${x},${z}`);}
 for(let z=.25;z<=14.25;z+=.5)for(const x of[42.25,43,43.75]){const p=body(x,z);assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`north width ${x},${z}`);}
 for(let x=30.25;x<=45.25;x+=.5)for(const z of[43,43.75,44.5]){const p=body(x,z);assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`cross alley ${x},${z}`);}
 assert.equal(YARD_JARDINS.minimumUsableWidth,1.5);
});
test('the circuit is an ordinary walk from Lyric through the north facade to the opposite greenhouse side, without changing vehicle grade',()=>{
 const path=YARD_TURN_REVIEW_PATH;let p=body(path[0].x,path[0].z);
 for(const target of path.slice(1)){
  let guard=0;
  for(;;){const physical=FP.logicalToPhysical(p.x,p.y),x=(physical.x+.5)*.5,z=(physical.z+.5)*.5,dx=Math.sign(target.x-x),dz=Math.sign(target.z-z);if(Math.hypot(target.x-x,target.z-z)<1e-6)break;assert.ok(++guard<150);
   const yaw=FP.arcYawOffset(p.x,p.y,physical.x+.5,physical.z+.5),c=Math.cos(yaw),s=Math.sin(yaw),wx=dx?dx:0,wz=dx?0:dz;
   const q={x:p.x+Math.round(wx*c+wz*s),y:p.y+Math.round(-wx*s+wz*c)},step=FP.canStep(p.x,p.y,q.x,q.y);assert.equal(step.ok,true,`north path ${x},${z}`);const next=step.redirect||q;assert.equal(PROPS.propCanOccupy(next.x,next.y,{from:p}),true,`north collision ${x},${z}`);p=next;
  }
 }
 for(const z of[5.75,7.25,9.25]){const p=body(43.25,z);close(FP.floorAt(p.x,p.y),-.85*(43-38)/(45-38));}
});
test('the isolated boundary pack is current and preserves the original vehicle opening',()=>{
 const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/yard-jardins-boundary.stats.json',import.meta.url)));const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(stats.sha256,sha(fs.readFileSync(new URL('../public/assets/yard-jardins-boundary.glb',import.meta.url))));assert.equal(stats.protectedSource.unchanged,true);assert.deepEqual(stats.geometry.opening,{z0:5.2,z1:9.8,width:4.6});assert.ok(stats.triangles<16000);
 for(const[p,h]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL('../'+p,import.meta.url))),h,p);
});
