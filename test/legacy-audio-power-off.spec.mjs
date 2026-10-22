import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
const materialsStart=source.indexOf('const materials = ['),materialsEnd=source.indexOf('\n};',source.indexOf('const MAT =',materialsStart))+3;
assert.ok(materialsStart>=0&&materialsEnd>materialsStart);
const {materials,MAT}=new Function(`${source.slice(materialsStart,materialsEnd)};return {materials,MAT};`)();
const groups=(m,material)=>{
  if(!m.groups.has(material))m.groups.set(material,{positions:[],normals:[],indices:[],uvs:[]});
  return m.groups.get(material);
};
// Execute the production primitive writers and only the two existing factories.
// Their normal geometry path cannot invoke sign carriers or window subtraction.
const box=source.slice(source.indexOf('function addBox('),source.indexOf('// A FLAT PLATE'));
const cylinder=source.slice(source.indexOf('function addCylinder('),source.indexOf('function addCylinderX('));
const {addBox,addCylinder}=new Function('group','signAssemblies','BUILDING_WINDOW_HOST_ORIGINS',`${box}\n${cylinder}\nreturn {addBox,addCylinder};`)(groups,{isCarrier:()=>false},{});
const meshes=new Map();
for(const name of ['legacy_patchbay','legacy_transfer_deck']){
  const factory=source.match(new RegExp(`\\{\\n  const m=mesh\\('${name}'\\);[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(factory,`${name}: production factory must exist`);
  new Function('mesh','addBox','addCylinder','MAT',factory)(name=>{
    const mesh={name,groups:new Map()};meshes.set(name,mesh);return mesh;
  },addBox,addCylinder,MAT);
}
const pointKey=point=>{const bytes=Buffer.alloc(12);point.forEach((value,axis)=>bytes.writeFloatLE(value,axis*4));return bytes.toString('hex');};
const digest=values=>createHash('sha256').update(values.sort().join('\n')).digest('hex');
function fingerprints(mesh){
  const vertices=[],triangles=[];
  for(const group of mesh.groups.values()){
    const points=Array.from({length:group.positions.length/3},(_,index)=>pointKey(group.positions.slice(index*3,index*3+3)));
    vertices.push(...points);
    for(let i=0;i<group.indices.length;i+=3){
      const t=group.indices.slice(i,i+3).map(index=>points[index]);
      // Material regrouping and a cyclic change of triangle start vertex do
      // not change geometry; reversed winding or changed positions do.
      triangles.push([t.join(''),[t[1],t[2],t[0]].join(''),[t[2],t[0],t[1]].join('')].sort()[0]);
    }
  }
  return {vertexCount:vertices.length,triangleCount:triangles.length,verticesSha:digest(vertices),trianglesSha:digest(triangles)};
}
// Measured from the actual native refinement GLB, c49c5364489c7ade06aafa20d3df041a83ab3b9080fbcfa79e9dcff0a6c8571e.
// This protects the existing physical objects while correcting material only.
const baseline={
  legacy_patchbay:{vertexCount:2400,triangleCount:1200,verticesSha:'c7ee6bf7ae5b4ce5f9c8137f25c538c3a5450c4e762db33b0cb000460c4bb4df',trianglesSha:'0da32757636678646c43d4b374edc34a344f08a3ceed768f3bb75bf7f7079bc3'},
  legacy_transfer_deck:{vertexCount:608,triangleCount:428,verticesSha:'081337f788ce5dda72bc535aa17a808d3a693a69aadd64d7201c04f613d65950',trianglesSha:'1867e033b3d47ac3a37d9ff608935fb61317e73ed17becd12c95cb484fcf0973'},
};

test('disconnected legacy patchbay and transfer deck have no emissive primitive material',()=>{
  for(const [name,mesh]of meshes){
    assert.ok(mesh.groups.size>=3,`${name}: preserve the complete multi-material object`);
    for(const [index,geometry]of mesh.groups){
      assert.ok(geometry.positions.length>0);
      const material=materials[index];assert.ok(material,`${name}: material ${index} must resolve`);
      assert.ok((material.emissiveFactor||[0,0,0]).every(value=>value===0),`${name}: disconnected ${material.name} must not emit`);
    }
  }
});

test('the power-off repair preserves every vertex and oriented triangle of the c49 native objects',()=>{
  for(const [name,mesh]of meshes)assert.deepEqual(fingerprints(mesh),baseline[name],`${name}: material correction changed physical geometry`);
});

test('the shared VFD material remains emissive for separately powered gameplay instruments',()=>{
  assert.deepEqual(materials[MAT.vfd].emissiveFactor,[.04,.82,.20]);
});
