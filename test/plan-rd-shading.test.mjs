import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=source.indexOf('    float rdv=.5, rim=0.0;');
const end=source.indexOf('\n    // Procedural courses',start);
assert.ok(start>=0&&end>start,'the production shading block exists');
const block=source.slice(start,end);

function runProductionBranch(usePlan,surf,first,second){
  let reads=0;
  const js=block
    .replace(/vec2 rdUv = \(surf == 1\)[\s\S]*?: posM\.xz \* 0\.05;/,"let rdUv = 'surface';")
    .replace('texture(uRD, rdUv).g','sample(first)')
    .replace('texture(uRD, rdUv * 0.28 + uTime * 0.002).g','sample(second)')
    .replace(/\bfloat\b/g,'let').replace(/\bmax\(/g,'Math.max(');
  assert.doesNotMatch(js,/texture\(|vec2|posM/,'the exercised block must not contain unconverted GLSL');
  const mix=(a,b,t)=>a+(b-a)*t;
  const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const sample=value=>{reads++;return value;};
  const fn=new Function('uUsePlan','surf','first','second','sample','mix','smoothstep',`${js}\nreturn {rdv,rim};`);
  return {...fn(usePlan,surf,first,second,sample,mix,smoothstep),reads};
}
function original(usePlan,surf,first,second){
  let rdv=Math.max(first,second*.85);
  if(surf===1)rdv=.5+(rdv-.5)*.45;
  const s=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  let rim=s(.16,.32,rdv)-s(.32,.58,rdv);
  if(usePlan>.5){rdv=.5;rim=0;}
  return {rdv,rim};
}

test('plan shading keeps its exact authored constants without RD texture reads',()=>{
  for(const surf of [1,2,3,4])for(const a of [0,.25,.5,1])for(const b of [0,.37,1]){
    const result=runProductionBranch(1,surf,a,b);
    assert.deepEqual({rdv:result.rdv,rim:result.rim},original(1,surf,a,b));
    assert.equal(result.reads,0);
  }
});

test('procedural shading retains both samples and the original wall and floor treatment',()=>{
  assert.match(block,/\? vec2\(mix\(posM\.z, posM\.x, abs\(n\.z\)\), posM\.y\) \* 0\.030\s*: posM\.xz \* 0\.05/);
  for(const plan of [0,.5])for(const surf of [1,2,3,4])for(const a of [0,.2,.5,1])for(const b of [0,.37,1]){
    const result=runProductionBranch(plan,surf,a,b);
    assert.deepEqual({rdv:result.rdv,rim:result.rim},original(plan,surf,a,b));
    assert.equal(result.reads,2);
  }
});
