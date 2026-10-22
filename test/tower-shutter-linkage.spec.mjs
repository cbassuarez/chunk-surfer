import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTowerShutterWinch,towerShutterDriveLayout,TOWER_SHUTTER_DRIVE as DRIVE} from '../tools/chunk_surfer/tower-shutter-linkage-geometry.mjs';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
const between=(a,b)=>builder.slice(builder.indexOf(a),builder.indexOf(b));
const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],uvs:[],indices:[]});return m.groups.get(mat);};
const primitives=new Function('group','signAssemblies','BUILDING_WINDOW_HOST_ORIGINS',[
  between('function addBox(','function addPlate('),between('function addCylinder(','function addCylinderX('),
  between('function addCylinderX(','function addEllipsoid('),between('function addBeam(','function addQuad('),
  'return {addBox,addCylinder,addCylinderX,addBeam};',
].join('\n'))(group,{isCarrier:()=>false},{});
const MAT={dark:0,wood:1,steel:3,brass:5},beams=[];
const m=buildTowerShutterWinch({mesh:name=>({name,groups:new Map()}),MAT,...primitives,
  addBeam:(mesh,a,b,width,material)=>{beams.push({a,b,width,material});primitives.addBeam(mesh,a,b,width,material);}});
const points=[...m.groups.values()].flatMap(g=>Array.from({length:g.positions.length/3},(_,i)=>g.positions.slice(i*3,i*3+3)));
const bounds=p=>({min:[0,1,2].map(a=>Math.min(...p.map(v=>v[a]))),max:[0,1,2].map(a=>Math.max(...p.map(v=>v[a])))});
const length=v=>Math.hypot(...v),minus=(a,b)=>a.map((v,i)=>v-b[i]);
const near=(a,b,t=.00001)=>Math.abs(a-b)<t;
const same=(a,b)=>a.every((v,i)=>near(v,b[i]));
function pack(relative){
  const bytes=readFileSync(new URL(relative,import.meta.url)),len=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const access=i=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView],width={VEC3:3,VEC2:2,SCALAR:1}[a.type],read={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]}[a.componentType];
    return Array.from({length:a.count},(_,n)=>Array.from({length:width},(_,axis)=>bin[read[0]]((v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||width*read[1])+axis*read[1]))).flat();};
  const get=name=>{const mesh=g.meshes.find(m=>m.name===name);assert.ok(mesh,`missing actual packed mesh ${name}`);return mesh.primitives.map(p=>({material:p.material,positions:access(p.attributes.POSITION),normals:access(p.attributes.NORMAL),indices:access(p.indices)}));};
  return{get};
}
// Retain the small literal accessor extraction as a regression fixture. The
// test remains usable without the task's large historical capture directory.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/tower-shutter-unlinked-baseline.json',import.meta.url)));
const baseline=pack('../public/assets/conservatory-props.glb');
const oldWinch=fixture.meshes.tower_winch,oldShutters=fixture.meshes.tower_shutters;

test('linkage retains every original drum/crank/grip primitive and uses existing dull materials',()=>{
  for(const old of oldWinch){
    const now=m.groups.get(old.material);assert.ok(now);
    for(const field of['positions','normals','indices'])for(let i=0;i<old[field].length;i++)
      assert.equal(field==='indices'?now[field][i]:Math.fround(now[field][i]),old[field][i],`original ${field} changed at ${i}`);
  }
  assert.ok([...m.groups.keys()].every(mat=>Object.values(MAT).includes(mat)),'no lit material or new material family');
  const triangles=[...m.groups.values()].reduce((n,g)=>n+g.indices.length/3,0);
  assert.ok(triangles<2200,`bounded one-off assembly: ${triangles} triangles`);
  assert.ok(points.every(p=>p.every(Number.isFinite)),'all actual production primitive coordinates must be finite');
  assert.ok(builder.slice(builder.indexOf('const LETTERING_INPUTS='),builder.indexOf('const sourceHash='))
    .includes("'tools/chunk_surfer/tower-shutter-linkage-geometry.mjs'"),'helper must participate in the real generated-asset freshness digest');
});

test('wire is tangent to the real drum and bell crank joins all nine blade spindles',()=>{
  const l=towerShutterDriveLayout(),wire=beams.find(b=>same(b.a,l.drumExit)&&same(b.b,l.cableEnd));
  assert.ok(wire&&wire.width>=.018,'one continuous visible wire must span the real separated assemblies');
  assert.ok(near(l.drumExit[0],-.427)&&near(l.drumExit[1],.72)&&near(l.drumExit[2],0));
  const direction=minus(wire.b,wire.a),radius=[l.drumExit[0],0,l.drumExit[2]];
  assert.ok(Math.abs(direction.reduce((s,n,i)=>s+n*radius[i],0))<1e-8,'wire must leave tangentially, not through the drum centre');
  assert.ok(Math.hypot(...radius)-.42<wire.width/2,'the wire wrap must touch the actual drum');
  for(const[a,b]of[[l.cableEnd,l.bellPivot],[l.bellPivot,l.bellOutput],[l.bellOutput,l.rodEye]])
    assert.ok(beams.some(p=>same(p.a,a)&&same(p.b,b)),'the load path must have no unconnected cable/lever/link endpoint');
  const vertical=beams.find(b=>same(b.a,[l.barX,l.rodBottom,l.barZ])&&same(b.b,[l.barX,l.rodTop,l.barZ]));
  assert.ok(vertical&&l.rodEye[1]>l.rodBottom&&l.rodEye[1]<l.rodTop,'output eye must meet the common guided rod');
  const cranks=beams.filter(b=>near(b.width,.032));assert.equal(cranks.length,9);
  const slatPoints=Array.from({length:oldShutters[0].positions.length/3},(_,i)=>oldShutters[0].positions.slice(i*3,i*3+3));
  for(let i=0;i<9;i++){
    const y=l.centres[i],pivot=l.at(-DRIVE.spindleStation,y-DRIVE.shutterOffset[1]);
    assert.ok(same(cranks[i].a,pivot)&&same(cranks[i].b,[l.barX,y+.11,l.barZ]));
    const arm=minus(cranks[i].b,pivot);
    assert.ok(Math.abs(arm.reduce((n,v,k)=>n+v*l.axis[k],0))<1e-8,'crank must be perpendicular to its actual canted blade axis');
    // The bearing reaches100mm inside the unchanged blade end. Recover the
    // blade's real source-local points rather than its coarse registry box.
    const materialY=y-DRIVE.shutterOffset[1],blade=slatPoints.filter(p=>Math.abs(p[1]-materialY)<.061);
    assert.ok(blade.length>=24,'each unchanged actual blade must exist at the linked height');
    const worldBlade=blade.map(p=>[-p[2],p[1]+.1,p[0]-5]),box=bounds(worldBlade);
    const spindleInside=l.at(-1.60,materialY);
    assert.ok(spindleInside.every((v,k)=>v>=box.min[k]-.001&&v<=box.max[k]+.001),'each axle must penetrate its real blade end');
  }
  // Horizontal cable force on the lower arm gives an upward output component.
  const input=minus(l.cableEnd,l.bellPivot),output=minus(l.bellOutput,l.bellPivot);
  assert.ok(input[1]<0&&near(input[2],0)&&output[2]>0&&near(output[1],0),'bell crank must actually turn the load path through90degrees');
  const pawl=beams.find(b=>same(b.a,[.30,.84,.34])&&same(b.b,[.44,.84,.16]));
  assert.ok(pawl,'the loaded drum needs the fixed pawl described by its retained inspection');
  const pawlRadius=Math.hypot(pawl.b[0],pawl.b[2]);
  assert.ok(pawlRadius>.438&&pawlRadius<.438+.035,'pawl tip must engage the exposed ratchet teeth rather than float beyond them');
});

test('actual new assembly stays beyond the protected catwalk and preserves runtime anchors/actions',()=>{
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  PROPS.propsInit(FP);const draws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
  const winch=draws.get('tower-shutter-winch'),shutters=draws.get('tower-shutters'),walk=draws.get('tower-catwalk');
  assert.deepEqual([winch.x,winch.z,winch.yaw],[97,59.5,0]);
  assert.deepEqual([shutters.x,shutters.z,shutters.yaw],[97,54.5,Math.PI/2]);
  assert.ok(near(shutters.y-winch.y,.1));
  const authored=CONSERVATORY_PROPS.find(p=>p.id==='tower-shutter-winch');
  assert.deepEqual([authored.x,authored.y,authored.yaw],[68,163,0]);
  assert.equal(authored.action,'tower-shutter-winch');assert.equal(authored.interaction,'action');
  assert.equal(PROP_MESH.tower_winch.blocks,false);assert.equal(PROPS.propById(authored.id).blocks,false);
  const meshBounds=bounds(points),walkPositions=baseline.get('tower_catwalk').flatMap(g=>g.positions);
  const outerGuard=Math.max(...walkPositions.filter((_,i)=>i%3===0))+walk.x;
  assert.ok(winch.x+meshBounds.min[0]>outerGuard+.4,'no wire, rod, support or original winch part may enter the protected east walk');
  assert.ok(meshBounds.min[1]>=0&&winch.y+meshBounds.max[1]<FP.ceilAt(PROPS.propById(authored.id).rx,PROPS.propById(authored.id).ry),
    'actual assembly must stand on its retained floor and stay below the real belfry ceiling');
  // A continuous east-catwalk body lane, including200mm side probes, remains
  // measured by the existing floor/body query. Geometry is outside that lane.
  for(let z=53;z<=57;z+=.1)for(const dx of[-.2,0,.2]){
    const a=FP.logicalAtPhysical((94.9+dx)*2,z*2,{group:'tower',floor:winch.y});
    assert.ok(a,'east maintenance walk must map to the real tower floor');
    assert.ok(!FP.isSolid(a.x-.5,a.y-.5)&&PROPS.propCanOccupy(a.x-.5,a.y-.5),'existing protected maintenance lane obstructed');
  }
});

test('actual packed winch includes the complete connection and leaves every shutter vertex unchanged',()=>{
  const baked=baseline.get('tower_winch');
  assert.equal(baked.length,m.groups.size);
  for(const expected of m.groups){
    const[material,geometry]=expected,actual=baked.find(p=>p.material===material);assert.ok(actual);
    for(const field of['positions','normals','indices']){
      assert.equal(actual[field].length,geometry[field].length,`rebake required: tower_winch ${field} does not include the full linkage`);
      for(let i=0;i<geometry[field].length;i++)assert.equal(actual[field][i],field==='indices'?geometry[field][i]:Math.fround(geometry[field][i]),
        `packed ${field} differs from the executed production helper at ${i}`);
    }
  }
  assert.deepEqual(baseline.get('tower_shutters'),oldShutters,'the connection must not alter any original shutter/slat primitive');
});
