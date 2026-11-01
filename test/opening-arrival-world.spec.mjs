import test from 'node:test';
import assert from 'node:assert/strict';
import {openingChildPoint,openingParkedPlacement,openingArrivalWorldView} from '../src/game/opening-arrival-world.js';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
FP.compile(conservatory.levels,conservatory);
const original={x:16,y:0,z:8,yaw:Math.PI/2,group:'ground'},park={...original,x:14.903,z:7.842,yaw:1.504};
test('the actual parked pose transforms body, kit, lamp and the van interaction together without snapping',()=>{
 const raws=CONSERVATORY_PROPS.filter(p=>p.id==='yard-van'||p.id==='yard-van-lamp'||p.id==='yard-van-field-case');
 for(const raw of raws){const a=FP.logicalToPhysical(raw.x*2,raw.y*2),wanted=openingChildPoint({x:a.x*.5,y:a.y,z:a.z*.5},original,park),p=openingParkedPlacement(raw,original,park,FP),q=FP.logicalToPhysical(Math.round(p.x*2),Math.round(p.y*2));
  assert.ok(Math.abs(q.x*.5+p.renderOffsetX-wanted.x)<1e-8);assert.ok(Math.abs(q.z*.5+p.renderOffsetZ-wanted.z)<1e-8);assert.ok(Math.abs(p.yaw-park.yaw)<1e-8);
 }
 const raw=raws.find(p=>p.id==='yard-van'),p=openingParkedPlacement(raw,original,park,FP);assert.notDeepEqual(p.inspectAt,raw.inspectAt);assert.equal(raw.x,66,'authored placement is immutable');
});
test('shot context follows its own observer and exact eye instead of the parked operator',()=>{
 const frame={eye:[21.6,-2.38,11.9],yaw:1.7,pitch:.1,lens:{fovY:48},renderGroup:'basement',observer:{x:21.6,z:11.9,feet:-4},openingOverture:true,ambientPeople:false};
 const v=openingArrivalWorldView(frame,FP);assert.equal(FP.logicalToPhysical(v.x,v.y).renderGroup,'basement');assert.deepEqual(v.authoredCamera.eye,frame.eye);assert.equal(v.suppressActors,true);assert.equal(v.openingOverture,true);
 const held=openingArrivalWorldView({...frame,freeLook:true},FP,{look:{yaw:.9,pitch:-.3}});assert.equal(held.yaw,undefined);assert.equal(held.authoredCamera.yaw,.9);assert.equal(held.authoredCamera.pitch,-.3);
 assert.deepEqual(v.authoredCamera.lens,frame.lens);
});
