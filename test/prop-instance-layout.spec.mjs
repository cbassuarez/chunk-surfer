import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS,writePropInstanceFlags,propPoweredMaterialScale} from '../src/render/prop-instance-layout.js';
test('a switched emitter can be genuinely dark without changing ordinary material or existing circuit power',()=>{
 for(const scale of[0,.3,1,2.4]){
  assert.equal(propPoweredMaterialScale({},scale),1,'ordinary props never inherit a practical switch');
  assert.equal(propPoweredMaterialScale({sourceMemoryFixture:true},scale),scale,'existing Source circuit response stays exact');
 }
 for(const power of[0,.25,1]){
  assert.equal(propPoweredMaterialScale({fixturePower:power}),power);
  assert.equal(propPoweredMaterialScale({fixturePower:power,sourceMemoryFixture:true},.6),power*.6);
 }
 assert.equal(propPoweredMaterialScale({fixturePower:NaN}),1);
 assert.equal(propPoweredMaterialScale({fixturePower:-1}),0);
 assert.equal(propPoweredMaterialScale({fixturePower:8}),1);
});
test('instance channels fit the native attribute budget without overlapping paper or emission',()=>{
 const occupied=new Set(Array.from({length:16},(_,i)=>i));
 for(const[,size,bytes]of PROP_INSTANCE_BINDINGS)for(let i=bytes/4;i<bytes/4+size;i++){assert.ok(!occupied.has(i));occupied.add(i);}
 assert.equal(occupied.size,PROP_INSTANCE_FLOATS);
 const locations=[0,1,2,3,4,5,6,8,...PROP_INSTANCE_BINDINGS.map(([location])=>location),13,14];
 assert.ok(new Set(locations).size<=15,'reserve one of the minimum 16 locations for ANGLE gl_VertexID');
 const data=new Float32Array(PROP_INSTANCE_FLOATS*2).fill(-7);
 writePropInstanceFlags(data,PROP_INSTANCE_FLOATS,{zone:6,portrait:12,structural:true,fixturePower:0});
 assert.deepEqual([...data.slice(45,49)],[6,12,1,0]);
 assert.equal(data[49],-7,'flags must not overwrite emissive red');
 assert.equal(data[16],-7,'a later instance must not change an earlier one');
 const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 assert.match(source,/layout\(location=7\) in vec4 aInstanceFlags/);
 assert.doesNotMatch(source,/layout\(location=15\)/);
});

test('runtime mesh installers bind the same instance channels and leave baked-zone location8 at zero',()=>{
 for(const file of ['source-divide-meshes.js','source-last-reception-meshes.js','tower-personal-meshes.js']){
  const source=readFileSync(new URL(`../src/render/${file}`,import.meta.url),'utf8');
  assert.match(source,/import\s*\{\s*PROP_INSTANCE_FLOATS,\s*PROP_INSTANCE_BINDINGS\s*\}\s*from\s*['"]\.\/prop-instance-layout\.js['"]/);
  // Execute the real binding section against a tiny GL recorder. This catches
  // byte-vs-float offsets and accidental live attributes without generating the
  // Source/tower geometry or needing a GPU/context.
  const section=source.match(/gl\.bindBuffer\(gl\.ARRAY_BUFFER,\s*instanceBuffer\);[\s\S]*?gl\.vertexAttrib1f\(8,\s*0\);/)?.[0];
  assert.ok(section,`${file}: instance binding section`);
  const enabled=new Set(),disabled=new Set(),pointers=[],divisors=new Map(),constants=new Map();
  const gl={ARRAY_BUFFER:34962,FLOAT:5126,bindBuffer(){},
   enableVertexAttribArray(location){enabled.add(location);},disableVertexAttribArray(location){disabled.add(location);enabled.delete(location);},
   vertexAttribPointer(location,size,type,normalized,stride,offset){pointers.push([location,size,type,normalized,stride,offset]);},
   vertexAttribDivisor(location,divisor){divisors.set(location,divisor);},vertexAttrib1f(location,value){constants.set(location,value);}};
  new Function('gl','instanceBuffer','PROP_INSTANCE_FLOATS','PROP_INSTANCE_BINDINGS',section)(gl,{},PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS);
  const expected=[...Array.from({length:4},(_,column)=>[3+column,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,column*16]),
   ...PROP_INSTANCE_BINDINGS.map(([location,size,offset])=>[location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset])];
  assert.deepEqual(pointers,expected,file);
  assert.ok([...enabled].every(location=>divisors.get(location)===1),file);
  assert.ok(!enabled.has(8)&&!enabled.has(9)&&!enabled.has(15),`${file}: spare attributes must stay free`);
  assert.ok(disabled.has(8));assert.equal(constants.get(8),0,`${file}: no accidental dressing-zone override`);
 }
});
