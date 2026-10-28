import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {EXTERIOR_GRAFFITI_COURTS} from '../src/data/exterior-graffiti.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

const bytes=readFileSync(new URL('../public/assets/exterior-graffiti.glb',import.meta.url));
const stats=JSON.parse(readFileSync(new URL('../public/assets/exterior-graffiti.stats.json',import.meta.url)));
const asset=parseGlb(bytes);

test('each court receives its own nonblocking pigment aligned to the real wall instance',()=>{
  for(const {id} of EXTERIOR_GRAFFITI_COURTS){
    const wall=CONSERVATORY_PROPS.find(p=>p.id===`district-${id}-court-walls`);
    const paint=CONSERVATORY_PROPS.find(p=>p.id===`district-${id}-graffiti`);
    assert.ok(wall&&paint);
    for(const k of ['x','y','yaw','scale','scaleZ'])assert.equal(paint[k],wall[k],`${id} ${k}`);
    assert.equal(paint.blocks,false);assert.equal(paint.interactive,false);
    assert.equal(PROP_MESH[paint.mesh].blocks,false);
    assert.ok(asset.json.meshes.some(m=>m.name===paint.mesh));
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'),stats.sha256);
});

test('paint lies on masonry between doors, above the plinth, with inward facing triangles',()=>{
  for(const [court,marks] of Object.entries(stats.marks))for(const mark of marks){
    const doorCenters=mark.side===-1?[2.5,6.7,10.9]:[13.5,9.3,5.1];
    for(const z of doorCenters)assert.ok(mark.maxZ<z-.64||mark.minZ>z+.64,`${court} ${mark.text} touches a door or jamb`);
    assert.ok(mark.minY>.60&&mark.maxY<2.75);
    assert.ok(Math.abs(Math.abs(mark.plane)-4.442)<1e-7);
  }
  const components={SCALAR:1,VEC2:2,VEC3:3};
  function data(index){const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView];
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components[a.type]*4;
    return Array.from({length:a.count},(_,j)=>Array.from({length:components[a.type]},(_,k)=>a.componentType===5126
      ?asset.bin.readFloatLE(start+j*stride+k*4):asset.bin.readUInt32LE(start+j*stride+k*4)));}
  for(const mesh of asset.json.meshes)for(const p of mesh.primitives){
    const positions=data(p.attributes.POSITION),normals=data(p.attributes.NORMAL),indices=data(p.indices).map(x=>x[0]);
    for(const [x,y,z] of positions){
      const side=Math.sign(x),doors=side<0?[2.5,6.7,10.9]:[13.5,9.3,5.1];
      assert.ok(Math.abs(Math.abs(x)-4.45)<.011,`${mesh.name} pigment stays on the wall`);
      assert.ok(y>.60&&y<2.75,`${mesh.name} stays above the plinth and below window height`);
      for(const door of doors)assert.ok(Math.abs(z-door)>.64,`${mesh.name} paint clears the door jamb`);
    }
    for(let i=0;i<indices.length;i+=3){
      const [a,b,c]=indices.slice(i,i+3).map(j=>positions[j]);
      const crossX=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
      assert.ok(crossX*normals[indices[i]][0]>0,`${mesh.name} must face into the court`);
    }
  }
});
