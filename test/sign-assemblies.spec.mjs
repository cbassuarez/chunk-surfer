import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chamferedBoxGeometry,createSignAssemblies,appendSignGeometry,carrierFinishTile,isSignAssembly} from '../tools/chunk_surfer/lettering/sign-assemblies.mjs';

test('fabricated bevels preserve the exact carrier envelope and outward triangle normals',()=>{
  for(const size of[[2.75,.48,.06],[.11,.48,.042],[1.08,.78,.0007],[.16,.075,.025]]){
    const center=[.3,.7,-.2],g=chamferedBoxGeometry(center,size);
    for(let k=0;k<3;k++){
      const c=g.positions.filter((_,i)=>i%3===k);
      assert.ok(Math.abs(Math.min(...c)-(center[k]-size[k]/2))<1e-10);
      assert.ok(Math.abs(Math.max(...c)-(center[k]+size[k]/2))<1e-10);
    }
    for(let i=0;i<g.indices.length;i+=3){
      const ids=g.indices.slice(i,i+3),p=ids.map(v=>g.positions.slice(v*3,v*3+3));
      const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      assert.ok(n.reduce((s,v,k)=>s+v*g.normals[ids[0]*3+k],0)>0,'Every bevel needs nondegenerate outward winding');
    }
    assert.ok(g.uvs.every(Number.isFinite));
    for(let i=0;i<g.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-10);
  }
});
test('wood rail and stile UVs retain the same physical grain scale',()=>{
  for(const [size,axis]of[[[1.08,.06,.042],0],[[.06,.90,.042],1]]){
    const g=chamferedBoxGeometry([0,0,0],size);assert.equal(g.grainAxis,axis);
    // On the public Z plane, V follows the actual long member in metres.
    const ids=g.normals.map((v,i)=>i%3===2&&v>.999?Math.floor(i/3):-1).filter(v=>v>=0);
    const distance=Math.max(...ids.map(i=>g.positions[i*3+axis]))-Math.min(...ids.map(i=>g.positions[i*3+axis]));
    const uvDistance=Math.max(...ids.map(i=>g.uvs[i*2+1]))-Math.min(...ids.map(i=>g.uvs[i*2+1]));
    assert.ok(Math.abs(distance-uvDistance)<1e-10,'One metre of grain must stay one metre on horizontal and vertical members');
  }
});
test('a thin banner reverse closes the exact approved curved print shape',()=>{
  const materials=Array.from({length:9},(_,i)=>({name:`material-${i}`,pbrMetallicRoughness:{baseColorFactor:[.5,.4,.3,1],metallicFactor:0,roughnessFactor:.6}}));
  const MAT={dark:0,wood:1,black:2,steel:3,ivory:4,brass:5,cloth:6,paper:7,agedWhite:8};
  const group=(m,i)=>{if(!m.groups.has(i))m.groups.set(i,{positions:[],normals:[],uvs:[],indices:[]});return m.groups.get(i);};
  const kit=createSignAssemblies({materials,group,MAT}),m={name:'vigil_part_banner',groups:new Map()};
  kit.sheet(m,{center:[0,.56,-.248],widthM:3.8,heightM:1.02,drapeM:-.010,thicknessM:.0012});
  const g=[...m.groups.values()][0],vertices=(20+1)*(6+1);
  for(let i=0;i<vertices;i++){
    assert.equal(g.positions[i*3],g.positions[(i+vertices)*3]);
    assert.equal(g.positions[i*3+1],g.positions[(i+vertices)*3+1]);
    assert.ok(Math.abs(g.positions[(i+vertices)*3+2]-g.positions[i*3+2]-.0012)<1e-10);
  }
  assert.equal(m.extras.signAssemblies[0].drapeM,-.010);
  assert.ok(g.positions.length/3>vertices*2,'The sheet perimeter must have real edge geometry');
});
test('shared finish maps are bounded, deterministic opaque layers with neutral AO',()=>{
  for(const family of['timber-frame','enamel','brass-plate','paper-stock','cloth-reverse']){
    const a=carrierFinishTile(family),b=carrierFinishTile(family);
    assert.deepEqual(a.albedo,b.albedo);assert.deepEqual(a.orm,b.orm);assert.equal(a.rgbaBaseLevelBytes,128*128*4*3);
    assert.equal(a.albedo.readUInt32BE(16),128);assert.equal(a.albedo.readUInt32BE(20),128);
  }
  assert.equal(isSignAssembly('city_phone_box'),false,'Approved phone geometry must not be rebuilt by the sign helper');
  assert.equal(isSignAssembly('hall_entrance_sign'),true);assert.equal(isSignAssembly('vigil_part_sign_save'),true);
});
test('appending a carrier does not discard an older group missing UVs',()=>{
  const g={positions:[0,0,0],normals:[0,1,0],uvs:[],indices:[]};appendSignGeometry(g,chamferedBoxGeometry([0,0,0],[1,.5,.02]));
  assert.equal(g.uvs.length,g.positions.length/3*2);assert.deepEqual(g.uvs.slice(0,2),[0,0]);
});
