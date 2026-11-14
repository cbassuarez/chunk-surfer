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
test('the crash field draws the whole van falling with its shadow near the end, then the wreck, its sod and a flattened door',async()=>{
 const {readFileSync}=await import('node:fs');
 const {stationFieldCrashProps,STATION_FIELD_VAN_PACKS}=await import('../src/render/station-field-renderer.js');
 const {VAN_WRECK}=await import('../src/data/van-wreck.js');
 const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
 const visit=STATION_FIELD_VISITS.fourth,base={target:{x:.5,z:-6},yaw:Math.PI/2};
 const high=stationFieldCrashProps({...base,landed:false,height:400},{metrics}).props.map(p=>p.mesh);
 for(const m of['drive_vehicle_body','drive_cabin','van_brand_drive'])assert.ok(high.includes(m),m);
 assert.equal(high.filter(m=>m==='drive_tyre').length,4);assert.ok(!high.includes('station_field_van_shadow'),'no shadow from that far up');
 assert.ok(stationFieldCrashProps({...base,landed:false,height:20},{metrics}).props.some(p=>p.mesh==='station_field_van_shadow'));
 const door=memoryFieldRenderFrame({x:0,z:2.65,yaw:0,pitch:0,elapsed:9,decay:.7},visit.memoryVisit).props.filter(p=>p.id.startsWith('memory-field:door-')).map(p=>({...p,door:visit.memoryVisit.door}));
 const down=stationFieldCrashProps({...base,landed:true,height:0,flattened:true},{metrics,doorProps:door});
 const meshes=new Set(down.props.map(p=>p.mesh));
 for(const m of[VAN_WRECK.meshes.hull,VAN_WRECK.meshes.cabDoorNear,'station_field_earth','van_wreck_brand'])assert.ok(meshes.has(m),m);
 assert.ok(!meshes.has('drive_vehicle_body'),'the whole van is gone once it is down');
 assert.equal(down.replace.size,door.length);for(const p of down.replace.values())assert.ok(Math.abs(p.matrix[5])<1e-6,'lying flat');
 for(const p of down.props)assert.ok(Array.from(p.matrix).every(Number.isFinite),p.id);
 // Every mesh it draws is loaded from a pack it lists, or made here.
 const listed=new Set(STATION_FIELD_VAN_PACKS.flatMap(p=>p.meshes));
 for(const m of new Set([...high,...meshes]))assert.ok(listed.has(m)||/^station_field_/.test(m)||/^van_wreck_brand/.test(m),m);
});
