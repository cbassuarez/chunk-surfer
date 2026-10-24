import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { CHAPEL_MASS, CHAPEL_CONGREGATION, CHAPEL_DRESSING, CHAPEL_DRESSING_MESH, CHAPEL_DRESSING_BUDGET } from '../src/data/chapel-dressing.js';
import { CHAPEL_DRESSING_BOUNDS, CHAPEL_PRESENCE_PIVOTS } from '../src/data/generated/chapel-dressing-geometry.js';
import { chapelDressingWorldPlacements, chapelDressingRenderInstances, chapelPresenceLightState } from '../src/game/chapel-dressing.js';
import { createChapelApparitions } from '../src/game/chapel-apparitions.js';
import { parseGlb } from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const placed=chapelDressingWorldPlacements(FP,CHAPEL_DRESSING_BOUNDS);
const pack=parseGlb(fs.readFileSync(new URL('../public/assets/chapel-dressing.glb',import.meta.url)));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/chapel-dressing.stats.json',import.meta.url)));
const byId=new Map([...CHAPEL_CONGREGATION,...CHAPEL_DRESSING].map(p=>[p.id,p]));
function read(pack,index){
  const a=pack.json.accessors[index],v=pack.json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3}[a.type];
  const size={5126:4,5125:4,5123:2}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE'}[a.componentType];
  const off=(v.byteOffset||0)+(a.byteOffset||0);
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,axis)=>pack.bin[method](off+i*(v.byteStride||width*size)+axis*size)));
}
// A figure is drawn in parts (lower, upper, head, each about its own pivot); its
// rest silhouette is the parts put back on their pivots.
const geometry=name=>pack.json.meshes.find(m=>m.name===name).primitives.flatMap(p=>read(pack,p.attributes.POSITION));
const at=(points,offset)=>points.map(p=>p.map((v,i)=>v+offset[i]));
function assembled(kind){
  const pivots=CHAPEL_PRESENCE_PIVOTS[kind],head=at(geometry(CHAPEL_DRESSING_MESH.head),pivots.head);
  if(kind==='celebrant'||kind==='acolyte')return[...geometry(CHAPEL_DRESSING_MESH[kind]),...head];
  return[...geometry(CHAPEL_DRESSING_MESH[`${kind}Lower`]),...at(geometry(CHAPEL_DRESSING_MESH[`${kind}Upper`]),pivots.upper),...head];
}

test('the entire service occupies the actual chapel; no invisible fixtures in old sealed footprint',()=>{
  assert.equal(CHAPEL_CONGREGATION.length,48);
  assert.equal(CHAPEL_DRESSING.length,26);
  assert.equal(placed.length,74);
  assert.equal(new Set(placed.map(p=>p.id)).size,74);
  for(const p of [...CHAPEL_CONGREGATION,...CHAPEL_DRESSING]){
    assert.equal(FP.isSolid(Math.round(p.x*2),Math.round(p.y*2)),false,p.id);
    assert.ok([ZONE.chapel,ZONE.chapelOuter].includes(FP.zoneAt(Math.round(p.x*2),Math.round(p.y*2))),p.id);
  }
  assert.deepEqual(chapelDressingWorldPlacements({isLoaded:()=>false}),[]);
});

test('paint faces the real side-wall and stays within reach and actual ceiling height',()=>{
  for(const p of placed.filter(p=>p.kind==='writing')){
    const source=byId.get(p.id),b=CHAPEL_DRESSING_BOUNDS[p.mesh];
    const nx=-Math.sin(p.yaw),nz=Math.cos(p.yaw);
    assert.ok(nx*source.mountNormal.nx+nz*source.mountNormal.ny>.999,p.id);
    assert.ok(source.mountNormal.nx>0?Math.abs(p.x-87)<.01:Math.abs(p.x-99)<.01,`${p.id} on physical wall`);
    const floor=FP.floorAt(Math.round(source.x*2),Math.round(source.y*2));
    const ceiling=FP.ceilAt(Math.round(source.x*2),Math.round(source.y*2));
    assert.ok(p.y-floor>=.49&&p.y+b.max[1]*p.scale<ceiling-.1,p.id);
    const m=pack.json.meshes.find(m=>m.name===p.mesh);
    for(const primitive of m.primitives){
      const normals=read(pack,primitive.attributes.NORMAL);
      assert.ok(normals.every(n=>n[2]>.999),`${p.id} is an outward paint film, not a back-facing billboard`);
    }
  }
});

test('seated bodies agree with the pew seats and backs; kneeling knees are in the clear row gap',()=>{
  const pews=PROPS.renderInstances({group:'upper'}).filter(p=>/^chapel-pew-/.test(p.id));
  assert.equal(pews.length,18);
  assert.ok(pews.every(p=>p.yaw===Math.PI),'the service faces its existing altar');
  for(const p of placed.filter(p=>p.role==='congregant')){
    const a=byId.get(p.id),pew=pews.find(q=>q.id===`chapel-pew-${a.bank?'r':'l'}-${a.row}`);
    const b=CHAPEL_DRESSING_BOUNDS[p.mesh],top=Math.max(...assembled(p.figure).map(q=>q[1]));
    assert.equal(p.mesh,CHAPEL_DRESSING_MESH[`${p.figure}Lower`],'the placed mesh is the body\'s lower part');
    assert.ok(Math.abs(p.y-pew.y)<.002,'body feet share the pew floor datum');
    assert.ok(b.min[1]*p.scale<.004,'final packed feet meet the actual floor');
    assert.ok(top*p.scale>1.35&&top*p.scale<1.7,'human seated/kneeling stature');
    assert.ok(Math.abs(p.x-pew.x)<1,'all bodies lie within the existing 2.7m pew banks');
    if(p.figure==='kneeling'){
      assert.ok(p.z-pew.z>.9,'kneeler is ahead of its pew, toward the altar');
    }else{
      assert.ok(Math.abs(p.z-pew.z+.045)<.002,'hips occupy the actual seat, not its backrest');
      assert.ok(.57*p.scale>.53-.01&&.43*p.scale<.53+.01,'pelvis meets the 530mm seat top');
    }
  }
});

test('centre aisle, ritual tables and tower threshold remain free; no collision or interaction added',()=>{
  for(const p of placed){
    assert.equal(p.blocks,false);assert.equal(p.interactive,false);assert.equal(p.noShadow,true);
    if(p.role==='congregant'){
      // The upper body twists in the pew, so its reach is its radius, not its width.
      const lower=CHAPEL_DRESSING_BOUNDS[p.mesh],upper=CHAPEL_DRESSING_BOUNDS[CHAPEL_DRESSING_MESH[`${p.figure}Upper`]];
      const reach=Math.max(Math.abs(lower.min[0]),Math.abs(lower.max[0]),
        Math.hypot(Math.max(Math.abs(upper.min[0]),Math.abs(upper.max[0])),Math.max(Math.abs(upper.min[2]),Math.abs(upper.max[2]))));
      const half=reach*p.scale+.04;
      assert.ok(p.x+half<91||p.x-half>94,'full three-metre centre aisle remains visually clear');
      assert.ok(byId.get(p.id).y<88,'the congregation remains outside the existing altar/confrontation station');
    }
  }
  FP.forEachDoor(p=>{if(!p.keyId)FP.setDoorOpen(p.id,true);});
  for(let y=119;y<175;y++){
    const step=FP.canStep(185,y,185,y+1,{keys:new Set(['chapel'])});
    assert.equal(step.ok,true,`existing centre aisle row ${y}`);
    assert.equal(PROPS.propCanOccupy(185,y),true,`no collision in centre aisle ${y}`);
  }
  assert.equal(PROPS.propCanOccupy(185,176),false,'the existing altar table keeps its physical collision');
  assert.deepEqual(chapelDressingRenderInstances(placed,{group:'academic'}),[]);
  assert.deepEqual(chapelDressingRenderInstances(placed,{group:'tower'}),[]);
});

test('light states reuse the apparition family; protection and flash-off remove actors without erasing the room',()=>{
  const p=placed.find(p=>p.kind==='presence');
  assert.equal(chapelPresenceLightState(p),'unlit');
  assert.equal(chapelPresenceLightState(p,{torchOn:true}),'emergency-off');
  const lights=[{x:p.x,z:p.z,radius:8,intensity:1,kind:'sky'}];
  assert.equal(chapelPresenceLightState(p,{lights}),'emergency-on');
  const modes=[{options:{},variant:12},{options:{torchOn:true},variant:11},{options:{lights},variant:10}];
  for(const {options,variant} of modes){
    const frame=chapelDressingRenderInstances([p],{group:'upper',...options});
    assert.equal(frame[0].apparitionVariant,variant);
    assert.deepEqual([frame[0].x,frame[0].y,frame[0].z,frame[0].yaw,frame[0].mesh],[p.x,p.y,p.z,p.yaw,p.mesh],
      'a light transition does not restage or retarget the body');
  }
  for(const options of [{suppressActors:true},{effectsMode:'off'}]){
    const frame=chapelDressingRenderInstances(placed,{group:'upper',...options});
    assert.equal(frame.length,26);assert.equal(frame.some(p=>p.kind==='presence'),false);
  }
  const quiet=chapelDressingRenderInstances(placed,{group:'upper',effectsMode:'reduced'});
  assert.equal(quiet.length,74,'reduced dread keeps the whole congregation without adding timed events');
});

test('without a runtime the congregation is drawn as authored; with one it moves, and spends no scare budget',()=>{
  const a=chapelDressingRenderInstances(placed,{group:'upper',listener:{x:92.5,z:65}});
  const b=chapelDressingRenderInstances(placed,{group:'upper',listener:{x:92.5,z:65},timeSec:86400,viewYaw:Math.PI});
  assert.deepEqual(a,b);
  const apparitions=createChapelApparitions(),eye={x:92.5,y:6.42,z:66};
  let frames=0;
  const moving=t=>chapelDressingRenderInstances(placed,{group:'upper',listener:{x:92.5,z:65},apparitions,eye,timeSec:t,onFrame:()=>frames++});
  const first=moving(0),later=moving(3);
  assert.equal(frames,2);
  assert.equal(first.filter(p=>p.kind!=='presence').length,26,'paint, tallow and traces are still architecture');
  const heads=list=>new Map(list.filter(p=>String(p.id).endsWith(':head')).map(p=>[p.id,p.matrix]));
  const h0=heads(first),h3=heads(later);
  assert.ok(h0.size>=48,'every body has a head of its own');
  assert.ok([...h3].some(([id,m])=>m.some((v,i)=>Math.abs(v-h0.get(id)[i])>1e-3)),'heads have moved by three seconds');
  for(const options of [{suppressActors:true},{effectsMode:'off'}]){
    const hidden=chapelDressingRenderInstances(placed,{group:'upper',apparitions,eye,timeSec:4,...options});
    assert.equal(hidden.some(p=>p.kind==='presence'),false);
  }
  const source=fs.readFileSync(new URL('../src/game/chapel-dressing.js',import.meta.url),'utf8');
  for(const pattern of ['saveCommit','flagSet','scareBudget','playSound','dialogue','REC.'])assert.equal(source.includes(pattern),false,pattern);
});

test('bounded original pack fits the instanced budget and includes every production mesh',()=>{
  assert.equal(pack.json.meshes.length,CHAPEL_DRESSING_BUDGET.meshes);
  assert.deepEqual(pack.json.meshes.map(m=>m.name).sort(),Object.values(CHAPEL_DRESSING_MESH).sort());
  assert.ok(stats.bytes<=CHAPEL_DRESSING_BUDGET.packBytes);
  assert.ok(stats.triangles<=CHAPEL_DRESSING_BUDGET.packedTriangles);
  assert.ok(pack.json.nodes.every(n=>!n.matrix&&!n.translation&&!n.rotation&&!n.scale&&!n.children));
  assert.equal(pack.json.animations,undefined);assert.equal(pack.json.skins,undefined);
  for(const m of pack.json.meshes)for(const p of m.primitives)assert.equal(p.mode??4,4);
  assert.equal(Object.keys(CHAPEL_DRESSING_BOUNDS).length,CHAPEL_DRESSING_BUDGET.meshes);
});

test('a single held Mass has credible congregation and service roles, not a random crowd',()=>{
  const congregation=placed.filter(p=>p.role==='congregant');
  const celebrants=placed.filter(p=>p.role==='celebrant');
  const acolytes=placed.filter(p=>p.role==='acolyte');
  assert.equal(CHAPEL_MASS.moment,'held-eucharistic-prayer');
  assert.equal(congregation.length,45);assert.equal(celebrants.length,1);assert.equal(acolytes.length,2);
  assert.equal(congregation.filter(p=>p.posture==='kneeling-prayer').length,36);
  assert.equal(congregation.filter(p=>p.posture==='seated-prayer').length,9);
  assert.ok(congregation.every(p=>Math.abs(p.yaw-Math.PI)<.04),'every prayer remains addressed to the same altar');
  assert.ok(congregation.every(p=>!p.mesh.includes('turned')),'no unrelated looking-around idle pose');
  for(const p of [...celebrants,...acolytes]){
    const source=byId.get(p.id);
    assert.equal(p.yaw,Math.PI);assert.equal(p.blocks,false);assert.equal(p.interactive,false);
    assert.ok(source.y>87.9&&source.y<88.4,'the service station is on the clear north side of the existing altar');
    assert.ok(FP.floorAt(Math.round(source.x*2),Math.round(source.y*2))<5,'clergy stands/kneels on the actual lower sanctuary floor');
    assert.ok(CHAPEL_DRESSING_BOUNDS[p.mesh].min[1]*p.scale<.004,'vested feet remain anchored');
  }
  const priest=celebrants[0],priestSource=byId.get(priest.id);
  assert.equal(priestSource.x,CHAPEL_MASS.altar.x);
  assert.equal(priest.posture,'orans');
  assert.ok(priestSource.y<CHAPEL_MASS.altar.y-.65,'the celebrant does not occupy the altar or the crowded organ-console gap');
  assert.ok(acolytes.every(p=>p.x<91.1||p.x>93.9),'servers flank the table and its central working line');
});

test('packed clergy silhouettes carry full vestments and an orans gesture at human scale',()=>{
  const priest=assembled('celebrant');
  const widthAt=(points,lo,hi)=>{
    const section=points.filter(p=>p[1]>=lo&&p[1]<=hi);
    return Math.max(...section.map(p=>p[0]))-Math.min(...section.map(p=>p[0]));
  };
  assert.ok(widthAt(priest,.65,1.38)>.94,'the chasuble drapes wider than anatomical shoulders');
  assert.ok(widthAt(priest,.035,.10)>.62,'the alb reaches a weighted floor-level hem');
  assert.ok(Math.max(...priest.map(p=>p[1]))>1.74&&Math.max(...priest.map(p=>p[1]))<1.84,'ordinary standing clergy stature');
  for(const side of [-1,1]){
    assert.ok(priest.some(p=>side*p[0]>.43&&p[1]>1.53&&p[2]<-.22),'each hand is lifted beyond the sleeve, not a horizontal T-pose');
  }
  const server=assembled('acolyte');
  assert.ok(widthAt(server,.04,.10)>.59,'the server wears a full kneeling alb, not bare articulated limbs');
  assert.ok(Math.max(...server.map(p=>p[1]))<1.5,'the kneeling server cannot read as a short standing cone');
  assert.ok(server.some(p=>Math.abs(p[0])<.11&&p[1]>1.06&&p[2]<-.22),'the server holds joined prayer hands');
  const kneeler=assembled('kneeling');
  assert.ok(kneeler.some(p=>Math.abs(p[0])<.11&&p[1]>1.06&&p[2]<-.22),'congregant prayer hands are raised from the former slack knee position');
});
