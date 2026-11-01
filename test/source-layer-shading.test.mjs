import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=source.indexOf('    float sourceHeight=0.0;\n    if(sourceMaterial){');
const end=source.indexOf('      sourceHeight=sourceGlyph(sourceUv);',start);
assert.ok(start>=0&&end>start,'production Source sampling block found');
const branch=source.slice(start,end)
  .replace('float sourceHeight=0.0;','let sourceHeight=0.0; let uv=null;')
  .replace(/\/\/[^\n]*/g,'')
  .replace('vec2 sourceUv=surfaceUv(surf,posM,n)*vec2(.34,.46);','let sourceUv=scale(surfaceUv(surf,posM,n),[.34,.46]);')
  .replace('float sourceLayer=','let sourceLayer=')
  .replace('sourceUv=vec2(sourceUv.x,fract(sourceUv.y)/8.0+sourceLayer/8.0);',
    'sourceUv={x:sourceUv.x,y:fract(sourceUv.y)/8.0+sourceLayer/8.0}; uv=sourceUv;');
assert.doesNotMatch(branch,/\bfloat\b|\bvec2\b/,'production expressions were adapted for scalar testing');
const run=new Function('sourceMaterial','surfaceUv','sourceLayerAt','surf','posM','pos','n','scale','clamp','fract',
  `${branch}} return uv;`);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fract=v=>v-Math.floor(v);
const scale=(v,s)=>({x:v.x*s[0],y:v.y*s[1]});

test('ordinary surfaces never read Source UVs or Source layers',()=>{
  const noRead=()=>{throw new Error('unexpected Source texture read');};
  assert.equal(run(false,noRead,noRead,1,{}, {xz:{}}, {},scale,clamp,fract),null);
});

test('Source surfaces keep their original layer and UV mapping',()=>{
  for(const layer of [0,1,2,8,20])for(const uv of [{x:2,y:-1.2},{x:-4,y:3.1}]){
    let reads=0;
    const result=run(true,()=>uv,()=>{reads++;return layer;},1,{}, {xz:{}}, {},scale,clamp,fract);
    assert.deepEqual(result,{x:uv.x*.34,y:fract(uv.y*.46)/8+clamp(layer-1,0,7)/8});
    assert.equal(reads,1);
  }
});
