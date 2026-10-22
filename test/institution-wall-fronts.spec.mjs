import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {wallContactAt} from '../src/world/wall-contact.js';

// Read JSON and BIN from one actual GLB snapshot, never from independently
// replaceable metadata. These are mesh measurements, not primitive-count tests.
const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
assert.equal(bytes.subarray(0,4).toString(),'glTF');
assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength=bytes.readUInt32LE(12),glb=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
function accessor(index){
  const a=glb.accessors[index],v=glb.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126,'positions/normals must be measured from the actual floating-point accessors');
  assert.equal(a.type,'VEC3');
  return Array.from({length:a.count},(_,i)=>[0,1,2].map(axis=>binary.readFloatLE(
    (v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+axis*4)));
}
function mesh(name){
  const m=glb.meshes.find(m=>m.name===name);assert.ok(m,`missing packed mesh ${name}`);
  const n=glb.nodes.find(n=>n.mesh===glb.meshes.indexOf(m));
  assert.ok(n&&!n.matrix&&!n.translation&&!n.rotation&&!n.scale,`${name} acquired a node transform; remeasure its front`);
  return m.primitives.map(p=>({positions:accessor(p.attributes.POSITION),normals:accessor(p.attributes.NORMAL),
    material:glb.materials[p.material].name}));
}
const meshes=new Map(['plant_mcc_bank','plant_idf_frame','dance_mirror','legacy_tape_rack','legacy_patchbay',
  'legacy_transfer_deck','equipment_rack'].map(name=>[name,mesh(name)]));
const bounds=points=>({min:[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),
  max:[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis])))});
const allPoints=name=>meshes.get(name).flatMap(p=>p.positions);
const part=(name,material)=>meshes.get(name).find(p=>p.material===material);
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const unit=v=>v.map(n=>n/Math.hypot(...v));
const renderer=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const matrixSource=renderer.slice(renderer.indexOf('function identity(){'),renderer.indexOf('function perspective(aspect)'));
assert.ok(matrixSource.includes('function modelMatrix('));
const modelMatrix=new Function(`${matrixSource};return modelMatrix;`)();
const transform=(p,m)=>[0,1,2].map(axis=>m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);

const cases=[
  {id:'spur-substation-mcc',mesh:'plant_mcc_bank',anchor:[21.5,34.19],blocks:true,front:'-z',approach:[21.5,35.8]},
  {id:'spur-substation-idf',mesh:'plant_idf_frame',anchor:[23.5,37.7],blocks:true,front:'-z',approach:[23.5,37]},
  {id:'plant-mcc-east',mesh:'plant_mcc_bank',anchor:[37.5,34.5],blocks:false,front:'-z',approach:[38.9,28.5]},
  {id:'plant-idf-west',mesh:'plant_idf_frame',anchor:[30.15,27.9],blocks:false,front:'-z',approach:[31.5,28]},
  {id:'b1-mirror-east',mesh:'dance_mirror',anchor:[48.5,16],blocks:false,front:'-z',approach:[47.5,16]},
  ...['a','b','c'].map((suffix,i)=>({id:`b2-mirror-north-${suffix}`,mesh:'dance_mirror',anchor:[28+4*i,6],
    blocks:false,front:'-z',approach:[28+4*i,7.5]})),
  {id:'b5-mirror-south',mesh:'dance_mirror',anchor:[15,32.5],blocks:false,front:'+z',approach:[15,31.4]},
];
const originalPlacements=new Map([
  ['spur-substation-mcc',[21.4,35,Math.PI/2]],['spur-substation-idf',[23.4,36.4,0]],
  ['legacy-tape-rack-west-a',[22.15,34.65,Math.PI/2]],['legacy-tape-rack-west-b',[22.15,36.15,Math.PI/2]],
  ['legacy-patchbay-north',[24.15,34.45,0]],['legacy-transfer-console',[22.95,37.15,Math.PI]],
  ['plant-rack-1',[38.5,28,Math.PI/2]],
]);
let compiled=false,draws,before,contactBefore;
const snapshot=(p,r)=>({prop:structuredClone(p),draw:structuredClone(r)});
function plan(){
  if(!compiled){
    FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
      connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
    const original=[...CONSERVATORY_PROPS,...PROPS.derivedDressing(FP)].map(p=>{
      const old=originalPlacements.get(p.id);
      return old?{...p,x:old[0],y:old[1],yaw:old[2],renderOffsetX:undefined,renderOffsetZ:undefined}:p;
    });
    // First isolate the contact re-anchor from the face repair: both stages
    // must draw and inspect the two panels in precisely the same place.
    PROPS.propsInit(FP,original);
    let oldDraws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
    contactBefore=new Map(['spur-substation-mcc','spur-substation-idf'].map(id=>[id,snapshot(PROPS.propById(id),oldDraws.get(id))]));
    // Reconstruct the former +Z declaration without editing source or assets;
    // B5's intentional backing must keep precisely this old pose.
    const ids=new Set(cases.map(c=>c.id));
    PROPS.propsInit(FP,original.map(p=>ids.has(p.id)?{...p,frontAxis:'+z'}:p));
    oldDraws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
    before=new Map(cases.map(c=>[c.id,snapshot(PROPS.propById(c.id),oldDraws.get(c.id))]));
    PROPS.propsInit(FP);draws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));compiled=true;
  }
  return{size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,materialAt:FP.materialAt,
    doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
}

test('actual packed controls and mirror fixing channels project from local -Z',t=>{
  for(const[name,body,controls]of[['plant_mcc_bank','painted steel','paper label'],['plant_idf_frame','dark wood','brass']]){
    const rear=bounds(part(name,body).positions),detail=part(name,controls),front=bounds(detail.positions);
    assert.ok(front.max[2]<rear.min[2]-.02,`${name} controls must sit beyond the actual negative-Z body face`);
    assert.ok(detail.positions.some((p,i)=>p[2]<front.min[2]+.001&&detail.normals[i][2]<-.99),
      `${name} actual control-face normals must point -Z`);
    assert.equal(PROP_MESH[name].frontAxis,'-z');
  }
  const plate=bounds(part('dance_mirror','painted steel').positions),channels=part('dance_mirror','dark wood');
  assert.ok(bounds(channels.positions).min[2]<plate.min[2]-.03,'mirror fixing channels must project beyond the negative-Z plate');
  assert.ok(channels.positions.some((p,i)=>p[2]<-.074&&channels.normals[i][2]<-.99),'mirror channel faces point -Z');
  assert.ok(part('dance_mirror','painted steel').positions.some((p,i)=>Math.abs(p[2])<1e-7&&part('dance_mirror','painted steel').normals[i][2]>.99),
    'the deliberately exposed B5 backing remains a separate plain +Z plate face');
  assert.equal(PROP_MESH.dance_mirror.frontAxis,'-z');
  t.diagnostic(`measured GLB ${createHash('sha256').update(bytes).digest('hex')}`);
});

for(const item of cases)test(`${item.id}: actual resolved face points into its room and rear meets masonry`,()=>{
  const reader=plan(),p=PROPS.propById(item.id),r=draws.get(item.id),matrix=modelMatrix(r),origin=transform([0,0,0],matrix);
  assert.ok(p&&r,'retained instance must survive actual compiled placement');
  assert.equal(p.frontAxis,item.front);
  const front=unit(subtract(transform([0,0,item.front==='-z'?-1:1],matrix),origin));
  const n=[p.wallContact.nx,0,p.wallContact.ny];
  assert.ok(dot(front,n)>.999,`${item.id} presents its back after the production wall-contact yaw override`);
  const contact=wallContactAt(reader,p.rx+.5,p.ry+.5,{prefer:p.mountNormal||null,searchCells:p.mountSearchCells});
  assert.deepEqual([contact.nx,contact.ny],[p.wallContact.nx,p.wallContact.ny]);
  const cell=FP.logicalToPhysical(contact.cell.x,contact.cell.y);
  const wall=[(cell.x+(contact.planeX??contact.cell.x)-contact.cell.x)*.5,0,
    (cell.z+(contact.planeY??contact.cell.y)-contact.cell.y)*.5];
  const points=allPoints(item.mesh).map(v=>transform(v,matrix));
  const clearance=Math.min(...points.map(v=>dot(subtract(v,wall),n)));
  assert.ok(Math.abs(clearance)<.001,`${item.id} rear is not flush with actual host masonry (${clearance}m)`);
  const rendered=bounds(points);
  assert.ok(rendered.min[1]>=p.floor-.001&&rendered.max[1]<FP.ceilAt(p.rx,p.ry),'fitting must stay within its existing room height');
  // The room-side approach uses the production body collision query, with an
  // additional 200mm margin in each direction rather than a point-only check.
  const at=FP.logicalToPhysical(item.approach[0]*2,item.approach[1]*2);
  assert.ok(dot(front,unit(subtract([at.x*.5,origin[1],at.z*.5],origin)))>.9,'approach must see the identified face');
  for(const[dx,dz]of[[0,0],[-.2,0],[.2,0],[0,-.2],[0,.2]]){
    const rx=(item.approach[0]+dx)*2-.5,ry=(item.approach[1]+dz)*2-.5;
    assert.ok(!FP.isSolid(rx,ry)&&!FP.isCollisionOnly(rx,ry)&&PROPS.propCanOccupy(rx,ry),
      `${item.id} body-sized viewing lane is obstructed`);
    assert.ok(Math.abs(FP.floorAt(rx,ry)-p.floor)<.001,'lane must stay on the existing room floor');
  }
});

test('front contracts preserve identities, collider sizes and the intentionally reversed B5 pose',()=>{
  plan();
  for(const item of cases){
    const authored=CONSERVATORY_PROPS.find(p=>p.id===item.id),p=PROPS.propById(item.id),old=before.get(item.id);
    assert.equal(CONSERVATORY_PROPS.filter(p=>p.id===item.id).length,1);
    assert.deepEqual([authored.x,authored.y],item.anchor,'retain the finite approved placement');
    if(item.id==='plant-mcc-east'){
      // The approved south-wall rehost clears the separate heating-pipe banks;
      // keep its save-stable identity and measure the production contact offset.
      assert.equal(authored.yaw,0);
      const r=draws.get(item.id);
      for(const[key,value]of Object.entries({x:37.5,y:-4,z:34.81,yaw:0}))
        assert.ok(Math.abs(r[key]-value)<1e-6,`south-wall MCC rendered ${key} must retain the approved contact pose`);
    }
    const reanchor=contactBefore.has(item.id);
    for(const key of['id','mesh','w','d','h','floor','blocks','scale','scaleX','scaleY','scaleZ','inspectAt',
      ...(!reanchor?['x','y','rx','ry']:[])])
      assert.deepEqual(p[key],old.prop[key],`${item.id} changed gameplay field ${key}`);
    assert.equal(p.blocks,item.blocks);
    const envelope=q=>bounds([-1,1].flatMap(x=>[-1,1].map(z=>{
      const lx=x*q.w*(q.scale||1)/2,lz=z*q.d*(q.scale||1)/2,c=Math.cos(q.yaw||0),s=Math.sin(q.yaw||0);
      return[c*lx-s*lz,0,s*lx+c*lz];
    })));
    const a=envelope(p),b=envelope(old.prop);
    for(const end of['min','max'])for(const axis of[0,2])assert.ok(Math.abs(a[end][axis]-b[end][axis])<1e-8,
      `${item.id} changed its symmetric body collider dimensions`);
    assert.equal(authored.inspectAt,undefined,'these repairs must not introduce interaction proxies');
    if(reanchor){
      const oldContact=contactBefore.get(item.id);
      for(const key of['x','y','z','yaw','scale'])assert.equal(draws.get(item.id)[key],oldContact.draw[key],
        `${item.id} collider alignment changed the already corrected visible pose ${key}`);
      for(const key of['interactionX','interactionY','interactionRx','interactionRy','inspect','action','interaction','interactionPriority'])
        assert.deepEqual(p[key],oldContact.prop[key],`${item.id} collider alignment changed interaction/progression field ${key}`);
    }
  }
  const b5=draws.get('b5-mirror-south'),old=before.get('b5-mirror-south').draw;
  for(const key of['x','y','z','yaw','scale'])assert.equal(b5[key],old[key],`B5 intentional backing changed ${key}`);
  assert.equal(CONSERVATORY_PROPS.find(p=>p.id==='b5-mirror-south').frontAxis,'+z');
});

test('finite service-edge placements do not intersect each other or their actual room masonry',()=>{
  plan();
  const ids=[...originalPlacements.keys()];
  const boxes=ids.map(id=>{
    const p=PROPS.propById(id),r=draws.get(id);assert.ok(p&&r,`${id} must not be culled into a wall`);
    const box=bounds(allPoints(p.mesh).map(v=>transform(v,modelMatrix(r))));
    for(const axis of[0,2])for(const end of['min','max']){
      // Corner-only checks can miss a partition across a long object's middle.
      for(let k=0;k<=8;k++){
        const point=[(box.min[0]+box.max[0])/2,p.floor,(box.min[2]+box.max[2])/2];
        point[axis]=box[end][axis];point[axis===0?2:0]=box.min[axis===0?2:0]+k/8*(box.max[axis===0?2:0]-box.min[axis===0?2:0]);
        const at=FP.logicalAtPhysical(point[0]*2,point[2]*2,{group:p.renderGroup,floor:p.floor});
        assert.ok(at&&!FP.isSolid(at.x-.001,at.y-.001),`${id} actual packed edge penetrates masonry`);
      }
    }
    return{id,box};
  });
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    const overlap=[0,2].every(axis=>Math.min(a.box.max[axis],b.box.max[axis])-Math.max(a.box.min[axis],b.box.min[axis])>.001);
    assert.equal(overlap,false,`${a.id} and ${b.id} actual bodies overlap`);
  }
  for(const id of['legacy-tape-rack-west-a','legacy-tape-rack-west-b','legacy-patchbay-north','legacy-transfer-console','plant-rack-1']){
    const p=PROPS.propById(id),r=draws.get(id);
    assert.equal(p.interactive,false);assert.equal(p.action,undefined);assert.equal(p.blocks,true);
    assert.ok(Math.hypot(p.x-r.x,p.y-r.z)<.001,`${id} visual body and authored blocker disagree`);
  }
});

test('service fronts have 0.9m working areas and continuous 400mm-margin body routes',()=>{
  plan();
  const clear=(x,y)=>{
    const rx=x*2-.5,ry=y*2-.5;
    return !FP.isSolid(rx,ry)&&!FP.isCollisionOnly(rx,ry)&&Math.abs(FP.floorAt(rx,ry)+4)<.001&&PROPS.propCanOccupy(rx,ry);
  };
  // MCC's existing grated access steps finish before Z35.3; its clear working
  // area begins immediately beyond them. Nothing about their construction or
  // the floorplan is changed by this placement repair.
  for(const[cx,cy]of[[21.5,35.85],[23.5,36.65],[38.85,28.5],[31.25,28]])
    for(let a=-.45;a<=.451;a+=.15)for(let b=-.45;b<=.451;b+=.15)
      assert.ok(clear(cx+a,cy+b),`0.9m working area blocked at ${cx+a},${cy+b}`);
  const routes=[
    [[24.5,36.8],[23.5,36.8],[23.5,37.15],[21.3,37.15],[21.3,35.5],[21,34.95]],
    [[23.5,36.8],[23,36],[22.8,35.4],[22.8,34.85]],
    [[37.4,30],[38.9,30],[38.9,28.5]],
    [[32,30],[31.5,30],[31.5,28]],
  ];
  for(const path of routes)for(let k=1;k<path.length;k++){
    const a=path[k-1],b=path[k],steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.05);
    for(let t=0;t<=steps;t++)for(const[dx,dy]of[[0,0],[-.2,0],[.2,0],[0,-.2],[0,.2]]){
      const x=a[0]+(b[0]-a[0])*t/steps+dx,y=a[1]+(b[1]-a[1])*t/steps+dy;
      assert.ok(clear(x,y),`continuous body route blocked at ${x},${y}`);
    }
  }
  // Both sides of the bank have close approaches. Controls are measured from
  // their packed factory coordinates; no remote gameplay proxy is introduced.
  const m=modelMatrix(draws.get('spur-substation-mcc'));
  for(const[local,stand]of[[[1.12,1.8,-.25],[21,34.95]],[[-.64,1.8,-.25],[22.8,34.85]]]){
    const control=transform(local,m);
    assert.ok(Math.hypot(control[0]-stand[0],control[2]-stand[1])<.82,'MCC flank control must remain within plausible arm reach');
  }
});
