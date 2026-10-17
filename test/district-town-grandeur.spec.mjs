import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

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
    '    globalThis.parcels.push({x,z,w,d,h,axis,inward,index});\n    const mat=palette[index%palette.length];')
  .replace('  // Gaps between the rows',
    '  globalThis.townBuilding=townBuilding;\n  // Gaps between the rows');
const MAT={stone:10,black:2,wood:1,steel:3,agedWhite:17,warmWindow:21,
  brickRed:22,brickDark:23,slate:24,concrete:25,glazedBrick:26,terracotta:28,pubGreen:27,deadLeaf:14};
const context={MAT,parcels:[],meshes:new Map()};
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
const civic=p=>p.h>=10.5&&(p.index%7===0||p.index%13===0);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

test('richer houses leave every existing parcel, gap and park exclusion in place',()=>{
  assert.equal(parcels.length,247);
  assert.equal(digest(JSON.stringify(parcels)),
    '1ea98096ca35a576b699359c52056561a266c7dfffbd5eaf2247694bdde666c1',
    'pre-revision parcel positions, dimensions, heights and row ordering are unchanged');
  assert.equal(parcels.filter(civic).length,30,'ornament stays a sparse 30 of 247 houses');
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

test('the 217 ordinary neighbours preserve their previous actual vertices and materials',()=>{
  const ordinary=crypto.createHash('sha256');
  for(const p of parcels.filter(p=>!civic(p))){
    town.groups.clear();context.townBuilding(p);
    ordinary.update(digest(JSON.stringify([...town.groups])));
  }
  assert.equal(ordinary.digest('hex'),
    '9a22dc62d3d46102bc9979228886ee96ad75c26c1ec300ad5e5e227ebfc6b043',
    'ordinary buildings match the geometry captured before the ornament revision');
});
