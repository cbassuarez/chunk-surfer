import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=source.indexOf('    vec3 biome = vec3(0.30, 0.36, 0.36);');
const end=source.indexOf('    // reaction-diffusion skin',start);
assert.ok(start>=0&&end>start,'production chunk shading block exists');
const block=source.slice(start,end)
  .replaceAll('${MAX_CHUNKS}','48')
  .replace('vec3 biome = vec3(0.30, 0.36, 0.36);','let biome = 0.30;')
  .replace('vec3 glow = vec3(0.0);','let glow = 0.0;')
  .replace('vec2 d = pos.xz - uChunkA[i].xy;','let d = [pos.x-uChunkA[i].x,pos.z-uChunkA[i].y];')
  .replace('dot(d,d)','(d[0]*d[0]+d[1]*d[1])')
  .replaceAll('float(i)','Number(i)')
  .replace(/\b(?:bool|float|int)\b/g,'let');
assert.doesNotMatch(block,/\bvec[234]\b|\bdot\(/,'all production vector operations were adapted');
const actual=new Function('surf','sourceMaterial','sourceVoidMaterial','hitMat','MAT_ROOF_GLASS',
  'brendanStone','uChunkGlowReady','uChunkCount','uChunkA','uChunkC','pos','CELL_METERS','uTime','exp','max','sin',
  `${block}\nreturn {biome,glow,needBiome,needChunkGlow};`);

function reference(chunks,pos,time){
  let biome=.30,bw=0,glow=0;
  for(let i=0;i<chunks.length;i++){
    const c=chunks[i],dx=pos.x-c.x,dz=pos.z-c.y,dd=dx*dx+dz*dz;
    const w=Math.exp(-dd/Math.max(c.z*c.z,1));biome+=c.color*w;bw+=w;
    if(c.w!==0)glow+=c.color*Math.exp(-(dd*.5*.5)*.09)*c.w*(.9+.4*Math.sin(time*1.7+i*1.3));
  }
  return {biome:biome/(1+bw),glow};
}

test('actual branch preserves every consumed biome and glow, including Source and water',()=>{
  const pos={x:4,z:-2},chunks=Array.from({length:26},(_,i)=>({x:i-15,y:i%4,z:2+i/4,w:i===7?.6:0,color:.04+i*.01}));
  for(const active of [false,true])for(const surf of [1,2,3,4])for(const material of ['ordinary','source','void','roof','stone']){
    const inputs=chunks.map(c=>({...c,w:active?c.w:0})),colours=inputs.map(c=>c.color),expected=reference(inputs,pos,3);
    let exponentials=0;
    const result=actual(surf,material==='source',material==='void',material==='roof'?5:0,5,
      material==='stone',active?1:0,inputs.length,inputs,colours,pos,.5,3,
      value=>{exponentials++;return Math.exp(value);},Math.max,Math.sin);
    const usesBiome=surf===2&&!['source','void','roof','stone'].includes(material);
    assert.equal(result.needBiome,usesBiome,`${surf}/${material}`);
    if(usesBiome)assert.equal(result.biome,expected.biome,`${surf}/${material} biome`);
    if(surf!==4)assert.equal(result.glow,expected.glow,`${surf}/${material} glow`);
    if(!active&&!usesBiome)assert.equal(exponentials,0,`${surf}/${material} inactive loop`);
  }
});

test('biome eligibility matches the actual albedo consumer and special material branches',()=>{
  const a=source.indexOf('vec3 materialBase('),b=source.indexOf('\nfloat materialSpec(',a);
  assert.ok(a>=0&&b>a);
  const material=source.slice(a,b);
  assert.match(material,/if\(surf == 2\) base = mix\(base, mix\(biome, tint, 0\.35\), 0\.22\)/);
  assert.equal((material.match(/\bbiome\b/g)||[]).length,2,'biome is consumed only by floor blend');
  const albedoStart=source.indexOf('      vec3 albedo;',end),albedoEnd=source.indexOf('// Roughness drives',albedoStart);
  assert.ok(albedoStart>=0&&albedoEnd>albedoStart);
  const albedo=source.slice(albedoStart,albedoEnd);
  assert.match(albedo,/if\(sourceVoidMaterial\)[\s\S]*?else if\(sourceMaterial\)[\s\S]*?else if\(hitMat==MAT_ROOF_GLASS\)[\s\S]*?else\{[\s\S]*?albedo=materialBase\(hitMat, surf, tint, biome, rdv\)/);
  const surfaceExpression=albedo.match(/albedo\s*=\s*(brendanStone\?[^;]+);/)?.[1];
  assert.ok(surfaceExpression,'the actual material-specific albedo expression exists');
  const resolveSurface=new Function('brendanStone','surf','receiverPosM','anatomicalRelief','receiverNormal','n','hitMat','albedo',
    'brendanStoneSurface','architecturalSurface',`return (${surfaceExpression});`);
  const receiver={x:4,y:2,z:-7},receiverNormal={x:0,y:0,z:1},normal={x:0,y:1,z:0},base={r:.3,g:.4,b:.5};
  for(const stone of [false,true])for(const relief of [false,true]){
    const calls=[],capture=kind=>(...args)=>{calls.push({kind,args});return kind;};
    assert.equal(resolveSurface(stone,2,receiver,relief,receiverNormal,normal,17,base,capture('stone'),capture('architecture')),stone?'stone':'architecture');
    assert.deepEqual(calls,[stone?{kind:'stone',args:[2,receiver,relief?receiverNormal:normal]}
      :{kind:'architecture',args:[17,2,receiver,relief?receiverNormal:normal,base]}]);
  }
});

test('the actual CPU upload uses the float32 values sent to WebGL for active detection',()=>{
  const a=source.indexOf('  const n = Math.min(state.chunks.length, MAX_CHUNKS);');
  const endMark="  gl.uniform1f(U('uChunkGlowReady'),hasChunkGlow?1:0);";
  const b=source.indexOf(endMark,a)+endMark.length;
  assert.ok(a>=0&&b>a,'production upload found');
  function upload(values){
    const writes={},state={chunks:values.map(act=>({x:1,y:2,r:3,act,col:[.1,.2,.3]}))};
    const ctx={state,MAX_CHUNKS:48,Float32Array,U:x=>x,gl:{uniform1i:(n,v)=>writes[n]=v,uniform1f:(n,v)=>writes[n]=v,uniform4fv:(n,v)=>writes[n]=[...v],uniform3fv:(n,v)=>writes[n]=[...v]}};
    vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);return writes;
  }
  for(const [values,expected] of [[[],0],[[0,-0,1e-90],0],[[0,1e-40],1],[[-.2],1],[[NaN],1],[[undefined],1]]){
    assert.equal(upload(values).uChunkGlowReady,expected,JSON.stringify(values));
  }
  assert.equal(upload([...Array(48).fill(0),1]).uChunkGlowReady,0,'activity beyond the shader limit is not submitted');
});
