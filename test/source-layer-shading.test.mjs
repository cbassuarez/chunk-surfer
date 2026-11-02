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
  .replace('vec2 sourceUv=surfaceUv(surf,receiverPosM,receiverNormal)*vec2(.34,.46);','let sourceUv=scale(surfaceUv(surf,receiverPosM,receiverNormal),[.34,.46]);')
  .replace('float sourceLayer=','let sourceLayer=')
  .replace('sourceUv=vec2(sourceUv.x,fract(sourceUv.y)/8.0+sourceLayer/8.0);',
    'sourceUv={x:sourceUv.x,y:fract(sourceUv.y)/8.0+sourceLayer/8.0}; uv=sourceUv;');
assert.doesNotMatch(branch,/\bfloat\b|\bvec2\b/,'production expressions were adapted for scalar testing');
const run=new Function('sourceMaterial','surfaceUv','sourceLayerAt','surf','receiverPosM','pos','receiverNormal','scale','clamp','fract',
  `${branch}} return uv;`);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fract=v=>v-Math.floor(v);
const scale=(v,s)=>({x:v.x*s[0],y:v.y*s[1]});

test('ordinary surfaces never read Source UVs or Source layers',()=>{
  const noRead=()=>{throw new Error('unexpected Source texture read');};
  assert.equal(run(false,noRead,noRead,1,{}, {xz:{}}, {},scale,clamp,fract),null);
});

test('Source UVs follow the receiver plane while the layer still comes from the real world cell',()=>{
  const receiver={x:3.4,z:-2.3},normal={x:0,y:0,z:1},worldCell={x:19,z:27},calls=[];
  const result=run(true,(surf,pos,n)=>{calls.push({surf,pos,n});return{x:pos.x,y:pos.z};},cell=>{
    assert.equal(cell,worldCell);return 4;
  },3,receiver,{xz:worldCell},normal,scale,clamp,fract);
  assert.deepEqual(calls,[{surf:3,pos:receiver,n:normal}]);
  assert.deepEqual(result,{x:receiver.x*.34,y:fract(receiver.z*.46)/8+3/8});
});

test('Source surfaces keep their original layer and UV mapping',()=>{
  for(const layer of [0,1,2,8,20])for(const uv of [{x:2,y:-1.2},{x:-4,y:3.1}]){
    let reads=0;
    const result=run(true,()=>uv,()=>{reads++;return layer;},1,{}, {xz:{}}, {},scale,clamp,fract);
    assert.deepEqual(result,{x:uv.x*.34,y:fract(uv.y*.46)/8+clamp(layer-1,0,7)/8});
    assert.equal(reads,1);
  }
});
