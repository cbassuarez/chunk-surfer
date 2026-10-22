import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {wallContactAt} from '../src/world/wall-contact.js';

// Read each GLB once. A coordinated atomic pack replacement cannot mix its
// JSON/accessors with another revision's BIN chunk or a separate stats file.
function readPack(relative){
  const bytes=readFileSync(new URL(relative,import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),'glTF');
  assert.equal(bytes.readUInt32LE(8),bytes.length,'the packed asset must be a complete GLB');
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const binary=bytes.subarray(28+jsonLength);
  function accessor(index){
    const a=json.accessors[index],view=json.bufferViews[a.bufferView];
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const reader={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]}[a.componentType];
    assert.ok(width&&reader,'this regression measures the actual uncompressed mesh accessors');
    return Array.from({length:a.count},(_,vertex)=>Array.from({length:width},(_,axis)=>binary[reader[0]](
      (view.byteOffset||0)+(a.byteOffset||0)+vertex*(view.byteStride||width*reader[1])+axis*reader[1])));
  }
  const mesh=name=>{
    const entry=json.meshes.find(m=>m.name===name);
    assert.ok(entry,`${name} must exist in the actual packed asset`);
    const node=json.nodes.find(n=>n.mesh===json.meshes.indexOf(entry));
    assert.ok(node&&!node.matrix&&!node.rotation&&!node.translation&&!node.scale,
      `${name} has acquired a node transform; its working face needs remeasurement`);
    return entry.primitives.map(p=>({positions:accessor(p.attributes.POSITION),normals:accessor(p.attributes.NORMAL),
      material:json.materials[p.material]?.name}));
  };
  return{mesh,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const mainPack=readPack('../public/assets/conservatory-props.glb');
const acquisitionPack=readPack('../public/assets/conservatory-acquisitions.glb');
const patchbay=mainPack.mesh('legacy_patchbay'),cabinet=acquisitionPack.mesh('gothic_cabinet_01');
const vertices=parts=>parts.flatMap(p=>p.positions);
const meshes=new Map([['legacy_patchbay',vertices(patchbay)],['gothic_cabinet_01',vertices(cabinet)]]);

// Use the real renderer's matrix composer, including the visual wall clearance.
const renderer=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const matrixSource=renderer.slice(renderer.indexOf('function identity(){'),renderer.indexOf('function perspective(aspect)'));
assert.ok(matrixSource.includes('function modelMatrix('));
const modelMatrix=new Function(`${matrixSource};return modelMatrix;`)();
const matrixPoint=(point,m)=>[0,1,2].map(axis=>m[axis]*point[0]+m[axis+4]*point[1]+m[axis+8]*point[2]+m[axis+12]);
const bounds=points=>({min:[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),
  max:[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis])))});
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const unit=p=>p.map(n=>n/Math.hypot(...p));

const cases=[
  {id:'b3-patchbay',mesh:'legacy_patchbay',anchor:[24,10.8],workProp:'b3-chair',normal:{nx:-1,ny:0},floor:-4},
  {id:'acq-chapel-score-cabinet-west',mesh:'gothic_cabinet_01',anchor:[89.5,153.5],inspectAt:{x:90.35,y:154.15},normal:{nx:1,ny:0},floor:8.6},
  {id:'acq-chapel-score-cabinet-east',mesh:'gothic_cabinet_01',anchor:[98.5,153.5],inspectAt:{x:97.65,y:154.15},normal:{nx:-1,ny:0},floor:8.6},
];
let compiled=false,draws;
function plan(){
  if(!compiled){
    FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
      connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
    PROPS.propsInit(FP);
    draws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));compiled=true;
  }
  return{size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,materialAt:FP.materialAt,
    doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
}

test('packed sockets and acquired carved doors define the actual +Z working faces',t=>{
  const steel=bounds(patchbay.find(p=>p.material==='painted steel').positions);
  const sockets=bounds(patchbay.find(p=>p.material==='brass').positions);
  assert.ok(sockets.min[2]>steel.max[2]+.025,'the patch sockets must project from the front of the real steel body');
  const carved=cabinet.flatMap(part=>part.positions.filter((p,i)=>Math.abs(p[0])<.65&&p[1]>.8&&p[1]<2&&part.normals[i][2]>.7));
  const relief=bounds(carved);
  assert.ok(carved.length>100&&relief.min[2]>.3&&relief.max[2]-relief.min[2]>.15,
    'the acquired carved doors/ironwork define a +Z relief face, not the plain backing');
  t.diagnostic(`main GLB ${mainPack.sha256}; acquisitions GLB ${acquisitionPack.sha256}`);
});

for(const item of cases)test(`${item.id}: visible working face has a clear body-sized approach`,()=>{
  plan();
  const authored=CONSERVATORY_PROPS.find(p=>p.id===item.id),runtime=PROPS.propById(item.id),draw=draws.get(item.id),matrix=modelMatrix(draw);
  assert.ok(authored&&runtime&&draw,`${item.id} must survive actual plan placement`);
  const center=matrixPoint([0,0,0],matrix),front=unit(subtract(matrixPoint([0,0,1],matrix),center));
  let work;
  if(item.workProp){const target=draws.get(item.workProp);work=[target.x,center[1],target.z];}
  else{const target=FP.logicalToPhysical(Math.round(authored.inspectAt.x*2),Math.round(authored.inspectAt.y*2));work=[target.x*.5,center[1],target.z*.5];}
  assert.ok(dot(front,unit(subtract(work,center)))>.7,
    `${item.id} presents its plain back to the existing chair/inspection side`);
  // Sample the full approach, including a 400mm-wide local lane, using real
  // logical/physical mapping and the production furniture/body collision query.
  for(let step=0;step<=8;step++)for(const lateral of[-.2,0,.2]){
    const distance=1+step*.1,x=center[0]+front[0]*distance-front[2]*lateral,z=center[2]+front[2]*distance+front[0]*lateral;
    const at=FP.logicalAtPhysical(x*2,z*2,{group:runtime.renderGroup,floor:runtime.floor});
    assert.ok(at,`${item.id} approach leaves the actual rendered room`);
    const rx=at.x-.5,ry=at.y-.5;
    assert.ok(!FP.isSolid(rx,ry),`${item.id} approach enters masonry`);
    assert.ok(Math.abs(FP.floorAt(rx,ry)-item.floor)<.001,`${item.id} approach leaves its floor`);
    assert.ok(PROPS.propCanOccupy(rx,ry),`${item.id} approach is obstructed at ${distance.toFixed(1)}m / ${lateral}m`);
  }
});

test('actual packed cabinets and patchbay stay outside their host masonry',()=>{
  const reader=plan();
  for(const item of cases){
    const runtime=PROPS.propById(item.id),draw=draws.get(item.id),contact=wallContactAt(reader,runtime.rx+.5,runtime.ry+.5,{prefer:item.normal,searchCells:6});
    assert.ok(contact,`${item.id} must retain its actual host wall`);
    const physicalCell=FP.logicalToPhysical(contact.cell.x,contact.cell.y);
    const wallX=(physicalCell.x+contact.planeX-contact.cell.x)*.5;
    const rendered=bounds(meshes.get(item.mesh).map(p=>matrixPoint(p,modelMatrix(draw))));
    const clearance=item.normal.nx>0?rendered.min[0]-wallX:wallX-rendered.max[0];
    assert.ok(clearance>=.009,`${item.id} penetrates its real masonry (${(clearance*1000).toFixed(1)}mm clearance)`);
    assert.ok(Math.abs(rendered.min[1]-runtime.floor)<.001,`${item.id} no longer sits on its existing floor`);
    assert.ok(rendered.max[1]<FP.ceilAt(runtime.rx,runtime.ry),`${item.id} intersects the existing ceiling`);
  }
});

test('facing repairs preserve authored obstacles and inspection anchors',()=>{
  plan();
  for(const item of cases){
    const authored=CONSERVATORY_PROPS.find(p=>p.id===item.id),runtime=PROPS.propById(item.id),spec=PROP_MESH[item.mesh];
    assert.equal(CONSERVATORY_PROPS.filter(p=>p.id===item.id).length,1);
    assert.deepEqual([authored.x,authored.y],item.anchor,'a visual repair must not move the existing obstacle');
    if(item.inspectAt)assert.deepEqual(authored.inspectAt,item.inspectAt,'retain the authored gameplay proxy');
    assert.equal(runtime.blocks,true,'the visible object must remain an honest body obstacle');
    assert.equal(PROPS.propCanOccupy(authored.x*2-.5,authored.y*2-.5),false);
    const envelope=yaw=>bounds([-1,1].flatMap(x=>[-1,1].map(z=>{
      const local=[x*spec.w/2,0,z*spec.d/2],c=Math.cos(yaw),s=Math.sin(yaw);
      return[authored.x+c*local[0]-s*local[2],0,authored.y+s*local[0]+c*local[2]];
    })));
    const before=envelope(authored.yaw+Math.PI),after=envelope(authored.yaw);
    for(const end of['min','max'])for(const axis of[0,2])assert.ok(Math.abs(before[end][axis]-after[end][axis])<1e-8,
      `${item.id} changed its symmetric collision envelope`);
  }
});
