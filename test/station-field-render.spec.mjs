import test from 'node:test';
import assert from 'node:assert/strict';
import {stationFieldConstructionFrame,stationFieldEarthGeometry} from '../src/render/station-field-renderer.js';
import {memoryFieldRenderFrame} from '../src/render/memory-field-frame.js';
import {STATION_FIELD_VISITS} from '../src/data/station-field-visits.js';
import {STATION_FIELD_PREVIEW_GLSL} from '../src/render/station-field-preview-glsl.js';
test('occupied field retains actual remembered anchors and immediate supporting plane while the distance is dismantled',()=>{
 const visit=STATION_FIELD_VISITS.third,state={fieldId:'third',x:0,z:2.65,yaw:0,pitch:0,elapsed:20,decay:.42,deformation:{progress:1,warning:1},returnDoor:visit.returnDoor};
 const source=memoryFieldRenderFrame(state,visit.memoryVisit),before=new Map(source.props.map(p=>[p.id,p.matrix.slice()])),after=stationFieldConstructionFrame(source,{state});
 for(const p of after.props.filter(p=>/:ground$|:door-|:bag$|:jumper$|:wheel$/.test(p.id)))assert.deepEqual(p.matrix,before.get(p.id));
 assert.ok(after.props.some(p=>p.id.includes('earth-strip-')&&p.matrix[13]>0));
 assert.ok(after.props.some(p=>p.id.includes('return-leaf')&&Math.abs(p.matrix[12]+.62)<1e-6));
 for(const p of after.props)assert.ok(Array.from(p.matrix).every(Number.isFinite));
 assert.deepEqual(source.props.map(p=>p.matrix),[...before.values()]);
});
test('reduced dread softens the construction failure without closing the physical return door',()=>{
 const state={fieldId:'fourth',x:0,z:2.65,elapsed:30,decay:.7,deformation:{progress:1,warning:1},returnDoor:STATION_FIELD_VISITS.fourth.returnDoor};
 const base={props:[]},normal=stationFieldConstructionFrame(base,{state}),reduced=stationFieldConstructionFrame(base,{state,look:{reducedDread:true}});
 assert.ok(reduced.station.deformation<normal.station.deformation);
 assert.deepEqual(reduced.props.filter(p=>p.id.includes('return-')),normal.props.filter(p=>p.id.includes('return-')));
 assert.equal(stationFieldConstructionFrame(base,{state:{...state,deformation:{progress:0,warning:0}}}).props.some(p=>p.id.includes('earth-strip')),false);
 const earth=stationFieldEarthGeometry()[0];assert.ok(earth.i.every(i=>i>=0&&i<earth.p.length/3));
});
test('preview uses canonical sun geometry and accountable threshold coordinates without a legacy march',()=>{
 assert.match(STATION_FIELD_PREVIEW_GLSL,/3\.0-stationEye\.z/);
 assert.match(STATION_FIELD_PREVIEW_GLSL,/vec3\[4\]/);
 assert.doesNotMatch(STATION_FIELD_PREVIEW_GLSL,/ewTrace|for\(/);
});
