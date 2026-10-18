import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';

const ids=['b2-barre-south','b2-barre-east','b1-barre-south','b5-barre-north'];
const bytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
assert.equal(bytes.readUInt32LE(0),0x46546c67,'real GLB pack required');
const jsonLength=bytes.readUInt32LE(12), glb=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binStart=20+jsonLength+8;
const positions=primitive=>{
  const a=glb.accessors[primitive.attributes.POSITION],v=glb.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
  const start=binStart+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||12;
  return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>bytes.readFloatLE(start+i*stride+k*4)));
};
const meshFor=name=>glb.meshes.find(m=>m.name===name);
const pointsFor=name=>meshFor(name)?.primitives.flatMap(positions)||[];
const box=points=>({min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))});
const worldPoints=(points,p)=>{const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),u=p.scale||1;return points.map(q=>{
  const x=q[0]*u*(p.scaleX??1),y=q[1]*u*(p.scaleY??1),z=q[2]*u*(p.scaleZ??1);
  return[p.x+c*x-s*z,p.y+y,p.z+s*x+c*z];
});};

test('packed dance rails run horizontally at useful heights and B1 retains its hanging end',()=>{
  const meshNames=new Set(ids.map(id=>CONSERVATORY_PROPS.find(p=>p.id===id)?.mesh));
  for(const name of meshNames){
    const mesh=meshFor(name);assert.ok(mesh,`${name} missing from actual pack`);
    const wood=mesh.primitives.filter(p=>glb.materials[p.material]?.name==='worn wood').flatMap(positions);
    assert.ok(wood.length,'wooden rails missing');const b=box(wood),span=b.max.map((v,k)=>v-b.min[k]);
    assert.ok(span[0]>=2.8&&span[2]<.06,`${name}: rails do not extend across the wall: ${span}`);
    assert.ok(b.min[1]>.4&&b.max[1]<1.12,`${name}: rails extend below floor or above useful hand height: ${b.min[1]}..${b.max[1]}`);
    const full=box(pointsFor(name)),spec=PROP_MESH[name];
    assert.ok(full.max[0]-full.min[0]<=spec.w+.001&&full.max[1]<=spec.h+.001,`${name}: actual mesh exceeds its advertised dimensions`);
    if(name===CONSERVATORY_PROPS.find(p=>p.id==='b1-barre-south').mesh){
      const mean=ps=>ps.reduce((n,p)=>n+p[1],0)/ps.length;
      const drop=mean(wood.filter(p=>p[0]<-1.2))-mean(wood.filter(p=>p[0]>1.2));
      assert.ok(drop>.17&&drop<.28,`B1 must visibly retain the damaged hanging end, measured drop ${drop}`);
    }else assert.ok(span[1]<.31,`${name}: ordinary double rail should be level`);
  }
});

let ready=false,props,rendered;
function prepare(){if(ready)return;FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});props=PROPS.propsInit(FP);rendered=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));ready=true;}
const overlaps=(a,b,pad=0)=>a.min.every((v,k)=>v<b.max[k]+pad)&&a.max.every((v,k)=>v>b.min[k]-pad);

test('all four actual scaled barres have continuous wall backing, no doorway crossing and a usable approach',()=>{
  prepare();
  for(const id of ids){
    const p=props.find(p=>p.id===id),r=rendered.get(id);assert.ok(p&&r,`${id} silently disappeared`);assert.ok(p.wallContact,`${id} lost its wall contact`);
    const pts=pointsFor(r.mesh),b=box(worldPoints(pts,r));
    const local=box(pts),normal={x:-Math.sin(r.yaw),z:Math.cos(r.yaw)};
    // Measure the full rail span on the masonry side. A centre-only wall snap
    // previously accepted a long object crossing a corridor aperture.
    for(let i=0;i<=30;i++){
      const x=local.min[0]+(local.max[0]-local.min[0])*i/30;
      const rear=worldPoints([[x,.94,local.min[2]]],r)[0];
      const rt={x:2*(rear[0]-normal.x*.03),y:2*(rear[2]-normal.z*.03)};
      assert.ok(FP.isSolid(rt.x,rt.y)&&!FP.doorAt(rt.x,rt.y),`${id}: rail span crosses an aperture or leaves masonry near ${rear[0]},${rear[2]}`);
    }
    for(const q of props.filter(q=>q.architectureFitting&&q.category!=='finish'&&q.renderGroup===p.renderGroup)){
      const qr=rendered.get(q.id),qb=PROP_BOUNDS[q.mesh];if(!qr||!qb)continue;
      const corners=[];for(const x of[qb.min[0],qb.max[0]])for(const y of[qb.min[1],qb.max[1]])for(const z of[qb.min[2],qb.max[2]])corners.push([x,y,z]);
      assert.ok(!overlaps(b,box(worldPoints(corners,qr)),.04),`${id}: rail/support intersects existing fitting ${q.id}`);
    }
    // Approach the central working face and both ends, with the same 200mm
    // body margin as production prop collision. No invented collision map.
    for(const along of[-1,0,1])for(const distance of[.6,1,1.4]){
      const t=worldPoints([[along,.94,local.max[2]]],r)[0],x=2*(t[0]+normal.x*distance)-.5,y=2*(t[2]+normal.z*distance)-.5;
      assert.ok(!FP.isSolid(x,y)&&PROPS.propCanOccupy(x,y),`${id}: working approach obstructed at ${x/2},${y/2}`);
    }
  }
});
