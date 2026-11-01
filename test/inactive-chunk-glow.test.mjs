import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=source.indexOf('        if(needChunkGlow&&uChunkA[i].w != 0.0)');
const end=source.indexOf(';',start)+1;
assert.ok(start>=0&&end>start,'production chunk glow block exists');
const branch=source.slice(start,end)
  .replace('float(i)','Number(i)')
  .replace('uChunkC[i]','color');
assert.doesNotMatch(branch,/\bvec[234]\b|\bfloat\(/,'production expression can be exercised as a scalar channel');
const run=new Function('uChunkA','i','color','dd','CELL_METERS','uTime','exp','sin','needChunkGlow',
  `let glow=0;${branch};return glow;`);

test('inactive chunks retain zero glow without evaluating the expensive terms',()=>{
  let reads=0;
  const value=run([{w:0}],0,.6,42,.5,5,()=>{reads++;return 1;},()=>{reads++;return 1;},true);
  assert.equal(value,0);
  assert.equal(reads,0);
});

test('active chunks retain the original animated glow, including negative activity',()=>{
  for(const time of [0,1,100])for(const dd of [0,5,100])for(const activity of [-1,.1,1]){
    let calls=0;
    const exp=x=>{calls++;return Math.exp(x);};
    const sin=x=>{calls++;return Math.sin(x);};
    const color=.6,index=3;
    const expected=color*Math.exp(-(dd*.5*.5)*.09)*activity*(.9+.4*Math.sin(time*1.7+index*1.3));
    const actual=run(Array.from({length:4},()=>({w:activity})),index,color,dd,.5,time,exp,sin,true);
    assert.equal(actual,expected);
    assert.equal(calls,2);
  }
});

test('inactive glow does not remove a chunk from the biome blend',()=>{
  const from=source.lastIndexOf('    vec3 biome =',start);
  assert.match(source.slice(from,start),/if\(needBiome\)\{\s*float w = exp[\s\S]*?biome \+= uChunkC\[i\] \* w; bw \+= w;/);
});
