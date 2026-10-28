import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { PLAZA_SHOPFRONTS } from '../src/data/plaza-shopfronts.js';
import { EXTERIOR_PUB } from '../src/data/exterior-pub.js';
import { SOURCE_OUTSKIRTS_TOWN, canonicalOutskirtsExteriorPose, exteriorToOutskirts,
  outskirtsTownPlacement, outskirtsTownSet } from '../src/data/source-outskirts-town.js';
import { OUTSKIRT_BUS_ENCOUNTER, OUTSKIRT_STRETCH, OUTSKIRT_STRETCH_METRES,
  outskirtsPassLayout } from '../src/data/source-outskirts-arrival.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const actual=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-6,`${msg}: ${a} vs ${b}`);
const local=(p,parent)=>{
  const dx=p.across-parent.across,dz=-(p.along-parent.along),c=Math.cos(parent.yaw),s=Math.sin(parent.yaw);
  return [dx*c-dz*s,p.y,dz*c+dx*s];
};
const localWorld=(p,[x,z])=>({across:p.across+x*Math.cos(p.yaw)+z*Math.sin(p.yaw),
  along:p.along+x*Math.sin(p.yaw)-z*Math.cos(p.yaw)});

test('Source uses actual exterior rendered poses, not an independently arranged resemblance',()=>{
  const ids=new Set([...outskirtsTownSet().map(p=>p.canonicalId),
    ...OUTSKIRT_STRETCH.map(p=>p.canonicalId).filter(Boolean)]);
  ids.delete('ellery-west-roofline-closure');
  for(const id of ids){
    const p=canonicalOutskirtsExteriorPose(id),r=actual.get(id);assert.ok(r,`real exterior dropped ${id}`);
    near(p.x,r.x,`${id} x`);near(p.z,r.z,`${id} z`);near(p.y,r.y,`${id} height`);near(p.yaw,r.yaw,`${id} yaw`);
  }
  const lodge=OUTSKIRT_STRETCH.find(p=>p.id==='booth'),van=OUTSKIRT_STRETCH.find(p=>p.id==='van');
  near(Math.hypot(lodge.across-van.across,lodge.along-van.along),10,'original10m lodge/van relationship');
  assert.notEqual(van.along,31,'the independent19.3m relationship returned');
  assert.equal(OUTSKIRT_STRETCH_METRES,34.4);
});

test('the opposite renderer yaw conventions preserve arbitrary actual model points without reflection',()=>{
  for(const id of ['yard-booth','yard-van','yard-bus-shelter','yard-gate-piers','district-north-row-a','district-south-row-a','pub-complete-frontage','pub-complete-interior']){
    const a=actual.get(id),s=outskirtsTownPlacement(id);
    for(const [x,z]of[[1,0],[0,1],[-.73,-2.05],[2.1,3.7]]){
      const world={x:a.x+x*Math.cos(a.yaw)-z*Math.sin(a.yaw),z:a.z+x*Math.sin(a.yaw)+z*Math.cos(a.yaw)};
      const expected=exteriorToOutskirts(world),drawn=localWorld(s,[x,z]);
      near(drawn.across,expected.across,`${id} across`);near(drawn.along,expected.along,`${id} along`);
    }
  }
});

test('the remembered Lyric occupies its actual current two-deed place instead of the yard coordinate island',()=>{
  const set=outskirtsTownSet();
  for(const[id,anchor]of[['pub-complete-frontage',EXTERIOR_PUB.facadeAnchor],['pub-complete-interior',EXTERIOR_PUB.interiorAnchor]]){
    const context=set.find(p=>p.canonicalId===id);assert.ok(context,`${id}: no empty pub bays in the remembered town`);
    const ordinary=actual.get(id);assert.ok(ordinary,id);
    const canonical=canonicalOutskirtsExteriorPose(id);
    near(canonical.x,anchor.x,`${id} exact current worldX`);near(canonical.z,anchor.z,`${id} exact current worldZ`);
    near(canonical.y,EXTERIOR_PUB.floor,`${id} floor, without a second yard offset`);
    const expected=exteriorToOutskirts({x:ordinary.x,y:ordinary.y,z:ordinary.z,yaw:ordinary.yaw});
    near(context.across,expected.across,`${id} road across`);near(context.along,expected.along,`${id} road along`);
    near(context.yaw,expected.yaw,`${id} road heading`);
    assert.ok(context.bounds.across1< -11.5,'the canonical pub stays beyond the walking road rather than becoming an uncollidable obstacle');
  }
});

test('canonical shop and court assets retain the real lit/closed identities and period ownership',()=>{
  const set=outskirtsTownSet();assert.equal(SOURCE_OUTSKIRTS_TOWN.contextPeriodRows,4);
  assert.equal(SOURCE_OUTSKIRTS_TOWN.contextPeriodMetres,4*OUTSKIRT_STRETCH_METRES);
  assert.deepEqual(SOURCE_OUTSKIRTS_TOWN.shops,PLAZA_SHOPFRONTS);
  assert.equal(new Set(set.map(p=>p.id)).size,set.length);
  for(const id of ['district-south-row-a','district-north-row-a','district-west-court-walls','yard-former-stables','yard-baths-plant','opening-street-park-bench-west']){
    const p=set.find(p=>p.canonicalId===id);assert.ok(p,id);assert.equal(p.mesh,actual.get(id).mesh);
  }
  assert.deepEqual(set.filter(p=>p.initialOnly).map(p=>p.mesh).sort(),['ellery_west_roofline_closure','opening_street_frontage']);
  for(const p of set){assert.ok(Number.isFinite(p.across)&&Number.isFinite(p.along));assert.equal(p.lastPass,19);assert.ok(Object.isFrozen(p));}
});

test('every context mesh is in the current declared normal load chain, and its culling envelope contains packed geometry',()=>{
  const packed=new Map();
  for(const url of SOURCE_OUTSKIRTS_TOWN.packs){
    const b=fs.readFileSync(new URL(`../public${url}`,import.meta.url)),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
    for(const mesh of j.meshes){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(const p of mesh.primitives){const a=j.accessors[p.attributes.POSITION];for(let k=0;k<3;k++){min[k]=Math.min(min[k],a.min[k]);max[k]=Math.max(max[k],a.max[k]);}}
      packed.set(mesh.name,{min,max});
    }
  }
  for(const p of outskirtsTownSet()){
    const b=packed.get(p.mesh)||packed.get(p.fallbackMesh);assert.ok(b,p.mesh);
    for(const x of[b.min[0],b.max[0]])for(const z of[b.min[2],b.max[2]]){
      const at=localWorld(p,[x*(p.scaleX??1)*(p.scale??1),z*(p.scaleZ??1)*(p.scale??1)]);
      assert.ok(at.across>=p.bounds.across0-1e-3&&at.across<=p.bounds.across1+1e-3,`${p.id} across cull`);
      assert.ok(at.along>=p.bounds.along0-1e-3&&at.along<=p.bounds.along1+1e-3,`${p.id} along cull`);
    }
  }
});

test('the transformed civic opening permits the real drive and blocks its visible individual piers',()=>{
  const gate=OUTSKIRT_STRETCH.find(p=>p.id==='gate'),boxes=outskirtsCollisionBoxes(gate,PROP_BOUNDS[gate.mesh]);
  const blocked=(across,along)=>{const q=local({across,along,y:0},gate);return outskirtsPointBlocked(boxes,q[0],q[2]);};
  for(let a=-1.9;a<=1.9;a+=.1)assert.equal(blocked(a,gate.along),false,'one whole gate box sealed the drive');
  assert.equal(blocked(2.65,gate.along),true);assert.equal(blocked(-2.65,gate.along),true);
  for(const k of[0,1,6,13,17])assert.equal(outskirtsPassLayout(k,{break:null}).some(p=>/^boundary-/.test(p.id)),false,'synthetic wall hides the shop displays');
  assert.ok(outskirtsPassLayout(7).some(p=>/^boundary-/.test(p.id)),'the bus encounter lost its measured side barriers');
});

test('shelter details and both lodge/van attachment families follow their actual moved parents',()=>{
  for(const kind of[null,'mirrored','swapped','turned']){
    const set=outskirtsPassLayout(17,{break:kind}),shelter=set.find(p=>p.id==='shelter');
    for(const [id,expected]of[['shelter-bench',[-1,0,0]],['coat',[-.9,.5475,.2]]]){
      const p=set.find(p=>p.id===id);assert.ok(p);const q=local(p,shelter);q.forEach((v,k)=>near(v,expected[k],`${kind} ${id} local${k}`));
    }
    for(const p of set.filter(p=>p.attachedTo==='van'||p.attachedTo==='booth'))assert.ok(set.some(q=>q.id===p.attachedTo),`${p.id} orphaned`);
  }
  for(const [id,k]of[['van-bag',17],['page-dash',17],['page-ledger',12]]){
    const plain=outskirtsPassLayout(k,{break:null}),swapped=outskirtsPassLayout(k,{break:'swapped'});
    const p=plain.find(p=>p.id===id),q=swapped.find(p=>p.id===id);assert.ok(p&&q,id);
    const a=local(p,plain.find(v=>v.id===p.attachedTo)),b=local(q,swapped.find(v=>v.id===q.attachedTo));
    a.forEach((v,k)=>near(v,b[k],`${id} support${k}`));
  }
});

test('the forced bus and stranger remain authored events while ordinary court anchors are canonical',()=>{
  const set=outskirtsPassLayout(OUTSKIRT_BUS_ENCOUNTER.pass),bus=set.find(p=>p.id==='bus');
  near(bus.across,OUTSKIRT_BUS_ENCOUNTER.across,'bus across');near(bus.along,OUTSKIRT_BUS_ENCOUNTER.along,'bus along');near(bus.yaw,OUTSKIRT_BUS_ENCOUNTER.yaw,'bus yaw');
  const woman=set.find(p=>p.id==='bus-woman');assert.equal(woman.encounter,'bus-close');
  assert.ok(outskirtsPassLayout(20).some(p=>p.id==='dog-walker-handler'));
});
