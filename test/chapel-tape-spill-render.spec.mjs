import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,EYE} from '../src/data/floorplan/legend.js';
import {chapelTapeDemandInstances,chapelTapeSpillInstances} from '../src/render/chapel-tape-demand.js';

FP.compile(conservatory.levels,conservatory);
const context={runId:'chapel-spill-render',chapelWon:true,chapelRoute:true};
const position={x:185,y:116},at=FP.logicalToPhysical(position.x,position.y),group=at.renderGroup;
const floor=at.y,origin={x:(at.x+.5)*CELL,y:floor,z:(at.z+.5)*CELL};
const anchor={x:origin.x-.70,y:floor+.94,z:origin.z};
const base={schema:1,runId:context.runId,status:'departing',route:'inversion',progress:0,catch:null,departure:null,spent:[]};
const caught={...base,status:'caught',catch:{mode:'spatial',kind:'building',doorId:'chapel-c17',anchor,group,position,wallYaw:-Math.PI/2,initialDistance:.7,strainSeconds:0,holder:'player'}};
const spill={damageId:'chapel-spill-render:front-main:2',anchor,group,position,target:{takeId:'take:3',roomId:'the_tub',ordinal:3}};
function listener(changes={}){const p={...origin,yaw:.3,...changes};return{...p,eye:{x:p.x,y:p.y+EYE,z:p.z}};}
function frame(state,{view=listener(),timeSec=0,renderGroup=group,reducedMotion=true}={}){
  return chapelTapeDemandInstances(state,{plan:FP,context,group:renderGroup,listener:view,timeSec,reducedMotion});
}
const spillObjects=instances=>instances.filter(p=>p.id.startsWith('chapel-tape-demand:spill-'));
const stable=instances=>instances.map(p=>({...p,matrix:p.matrix?Array.from(p.matrix):undefined}));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('the damage pack contains opaque open-case and two-sided ribbon geometry within the original budget',async()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/chapel-tape-demand.glb',import.meta.url));
  const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/chapel-tape-demand.stats.json',import.meta.url)));
  assert.equal(sha(bytes),stats.sha256);assert.ok(bytes.length<900000);assert.ok(stats.triangles<20000);
  const doc=await new NodeIO().readBinary(bytes),meshes=doc.getRoot().listMeshes();
  for(const name of['tape_demand_field_case_broken','tape_demand_tape_leader','tape_demand_tape_strip','tape_demand_tape_coils'])assert.ok(meshes.some(m=>m.getName()===name),name);
  const unit=meshes.find(m=>m.getName()==='tape_demand_tape_strip');
  const normals=unit.listPrimitives().flatMap(p=>Array.from(p.getAttribute('NORMAL').getArray()));
  assert.ok(normals.some((v,i)=>i%3===2&&v>.99)&&normals.some((v,i)=>i%3===2&&v<-.99),'front and back have real opposing normals');
  for(const mesh of meshes.filter(m=>m.getName().includes('_tape_')||m.getName().endsWith('_broken'))){
    for(const p of mesh.listPrimitives()){
      assert.equal(p.getMaterial().getAlphaMode(),'OPAQUE');
      assert.ok([...p.getAttribute('POSITION').getArray(),...p.getAttribute('NORMAL').getArray()].every(Number.isFinite));
      assert.ok(p.getMaterial().getEmissiveFactor().every(n=>n===0),'worn edges reflect existing light, without emitting their own');
    }
  }
});

test('first failure changes the carried case silhouette and leaves a physical loose leader',()=>{
  const intact=frame(base),damaged=frame({...base,failures:1,caseDamaged:true});
  assert.equal(intact.filter(p=>p.mesh==='tape_demand_field_case').length,1);
  assert.equal(damaged.filter(p=>p.mesh==='tape_demand_field_case_broken').length,1);
  assert.equal(damaged.some(p=>p.mesh==='tape_demand_field_case'),false,'the broken model replaces the closed case');
  assert.equal(damaged.filter(p=>p.mesh==='tape_demand_tape_leader').length,1);
  assert.equal(spillObjects(damaged).length,0,'a warning leader cannot pretend a recording was already spilled');
});

test('the exposed ribbon is visible before a second loss and lengthens with deliberate strain',()=>{
  const warning={...caught,failures:1,caseDamaged:true};
  const start=frame(warning),strained=frame({...warning,catch:{...warning.catch,strainSeconds:1.4}});
  const a=start.find(p=>p.id==='chapel-tape-demand:unreeling-a'),b=strained.find(p=>p.id==='chapel-tape-demand:unreeling-a');
  assert.ok(a&&b);assert.notDeepEqual(Array.from(a.matrix),Array.from(b.matrix));
  assert.equal(spillObjects(strained).length,0);
  const later=frame(warning,{timeSec:700});
  assert.deepEqual(stable(start.filter(p=>p.mesh.startsWith('tape_demand_tape_'))),stable(later.filter(p=>p.mesh.startsWith('tape_demand_tape_'))),'reduced motion retains the warning without a looping shake');
});

test('the second-failure spill sits on the real support floor and stays locally bounded',()=>{
  const state={...caught,failures:2,caseDamaged:true,spill,catch:{...caught.catch,holder:'anchor'}};
  const instances=chapelTapeSpillInstances(state,{plan:FP,group});
  const coils=instances.filter(p=>p.mesh==='tape_demand_tape_coils');assert.ok(coils.length>=1&&coils.length<=3);
  for(const p of coils){
    assert.ok(p.y>=floor+.005&&p.y<=floor+.02);
    assert.ok(Math.hypot(p.x-origin.x,p.z-origin.z)<.4);
    assert.equal(p.blocks,false);assert.equal(p.noShadow,true);
  }
  assert.equal(instances.filter(p=>p.id.includes('falling')).length,2,'the spilled medium visibly connects the held case to the floor');
  assert.ok(instances.length<=5,'one spill has a small fixed instance budget');
});

test('reclaim and reload retain world-fixed torn coils while removing the live strand',()=>{
  const state={...caught,failures:2,caseDamaged:true,spill,catch:{...caught.catch,holder:'anchor'}};
  const first=spillObjects(frame(state)).filter(p=>p.mesh==='tape_demand_tape_coils');
  const restored=JSON.parse(JSON.stringify({...state,status:'released',catch:{...state.catch,holder:'player'}}));
  const walked=frame(restored,{view:listener({x:origin.x+4,z:origin.z+2,yaw:2.1}),timeSec:1000});
  assert.deepEqual(stable(spillObjects(walked)),stable(first));
  assert.equal(walked.filter(p=>p.mesh==='tape_demand_field_case_broken').length,1);
  assert.equal(walked.some(p=>p.id.includes('spill-falling')),false,'reclaimed scraps do not retain a second invisible grip');
});

test('spill geometry cannot appear in another floor, a completed ending or an unsupported rebuilt floor',()=>{
  const state={...caught,failures:2,caseDamaged:true,spill,catch:{...caught.catch,holder:'anchor'}};
  assert.deepEqual(chapelTapeSpillInstances(state,{plan:FP,group:group==='upper'?'ground':'upper'}),[]);
  assert.deepEqual(chapelTapeSpillInstances({...state,status:'complete'},{plan:FP,group}),[]);
  assert.deepEqual(chapelTapeSpillInstances({...state,route:null},{plan:FP,group}),[]);
  assert.deepEqual(chapelTapeSpillInstances(state,{plan:{...FP,physicalSpanData:()=>({cells:new Map()})},group}),[]);
  assert.deepEqual(chapelTapeSpillInstances({...state,spill:{...spill,position:{x:NaN,y:116}}},{plan:FP,group}),[]);
});
