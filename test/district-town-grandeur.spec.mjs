import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {isSignAssembly} from '../tools/chunk_surfer/lettering/sign-assemblies.mjs';
import {BUILDING_WINDOW_HOST_ORIGINS,subtractBuildingWindowBoxes} from '../tools/chunk_surfer/building-window-geometry.mjs';

// Exercise the actual generator and its vertex helpers without importing the
// asset-building entry point, which writes the entire shared prop pack.
const source=fs.readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} is present`);
  let cursor=source.indexOf('(',start),parameters=1;
  while(parameters){cursor++;if(source[cursor]==='(')parameters++;else if(source[cursor]===')')parameters--;}
  cursor=source.indexOf('{',cursor);let depth=1;
  while(depth){cursor++;if(source[cursor]==='{')depth++;else if(source[cursor]==='}')depth--;}
  return source.slice(start,cursor+1);
}
const start=source.indexOf("  const m=mesh('district_outer_sprawl');");
const end=source.indexOf('\nbuildDistrictSceneryRoads(',start);
assert.ok(start>=0&&end>start,'the existing town is a bounded authored region');
const region=source.slice(start,end)
  .replace('    const mat=palette[index%palette.length];',
    '    globalThis.parcels.push({x,z,w,d,h,axis,inward,index,explicit,mansion});\n    const mat=palette[index%palette.length];')
  .replace('  // Gaps between the rows',
    '  globalThis.townBuilding=townBuilding;\n  // Gaps between the rows');
const MAT={stone:10,black:2,wood:1,steel:3,agedWhite:17,warmWindow:21,
  brickRed:22,brickDark:23,slate:24,concrete:25,glazedBrick:26,terracotta:28,pubGreen:27,deadLeaf:14};
// Run the current primitive helpers with their real routing predicates. This
// town mesh is neither a fabricated sign nor a cut conservatory window host.
assert.equal(isSignAssembly('district_outer_sprawl'),false);
assert.equal(Object.hasOwn(BUILDING_WINDOW_HOST_ORIGINS,'district_outer_sprawl'),false);
const context={MAT,parcels:[],meshes:new Map(),signAssemblies:{isCarrier:isSignAssembly},
  BUILDING_WINDOW_HOST_ORIGINS,subtractBuildingWindowBoxes};
vm.createContext(context);
vm.runInContext(`
  const mesh=(name)=>{const m={name,groups:new Map()};meshes.set(name,m);return m;};
  const group=(m,mat)=>{
    if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],indices:[],uvs:[]});
    return m.groups.get(mat);
  };
  ${['addBox','addCylinder','addBeam','addQuad','addTriangle','addPitchedRoof'].map(functionSource).join('\n')}
  {${region}
`,context);
const parcels=JSON.parse(JSON.stringify(context.parcels));
const town=context.meshes.get('district_outer_sprawl');
const triangles=[...town.groups.values()].reduce((sum,g)=>sum+g.indices.length/3,0);
const civic=p=>p.mansion||p.h>=10.5&&(p.index%7===0||p.index%13===0);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

// Ellery Square cleared the sprawl round the square and replaced it with an
// authored outer shell: townhouses north-west, mansions north-east.
test('the town keeps its parcels, gaps and park exclusion around Ellery Square',()=>{
  assert.equal(parcels.length,206);
  assert.equal(digest(JSON.stringify(parcels)),
    '703270430eaec3998ab9d94c12c43de23968e58f1c2d39e0d590d11c149c4168',
    'parcel positions, dimensions, heights and row ordering are unchanged');
  assert.equal(parcels.filter(civic).length,32,'ornament stays a sparse 32 of 206 houses');
  assert.ok(parcels.filter(p=>p.mansion).length>=6,'the north-east mansions are their own block');
  assert.ok(parcels.some(p=>civic(p)&&p.axis==='x')&&parcels.some(p=>civic(p)&&p.axis==='z'));
  assert.ok(triangles<=155296*1.15,'city detail stays within 15% of its previous triangle count');
});

test('all houses stay inside their exact prior roof and chimney envelopes',()=>{
  for(const p of parcels){
    town.groups.clear();context.townBuilding(p);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const group of town.groups.values()){
      assert.equal(group.positions.length,group.normals.length);
      assert.ok(group.indices.every(index=>index>=0&&index<group.positions.length/3));
      for(let i=0;i<group.positions.length;i++){
        const value=group.positions[i],axis=i%3;
        assert.ok(Number.isFinite(value));
        min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
      }
    }
    const rise=1.3+(p.index%3)*.32;
    const halfX=p.w/2+(p.axis==='x'?.30:.345);
    const halfZ=p.d/2+(p.axis==='x'?.345:.30);
    const expectedMin=[p.x+7-halfX,0,p.z+7-halfZ];
    const expectedMax=[p.x+7+halfX,p.h+rise+(p.index%3===0?1.7:.05),p.z+7+halfZ];
    for(let axis=0;axis<3;axis++){
      assert.ok(Math.abs(min[axis]-expectedMin[axis])<1e-9,`lower envelope ${p.x},${p.z}, axis ${axis}`);
      assert.ok(Math.abs(max[axis]-expectedMax[axis])<1e-9,`upper envelope ${p.x},${p.z}, axis ${axis}`);
    }
  }
});

test('the 174 ordinary neighbours preserve their actual vertices and materials',()=>{
  const ordinary=crypto.createHash('sha256');
  for(const p of parcels.filter(p=>!civic(p))){
    town.groups.clear();context.townBuilding(p);
    ordinary.update(digest(JSON.stringify([...town.groups])));
  }
  assert.equal(ordinary.digest('hex'),
    '43dbe870cca038a8ca6ba066054a1b09d8dfc8a6579b70546a07722e29ce4819',
    'ordinary buildings match the geometry captured with the Ellery Square plan');
});
