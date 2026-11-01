import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SOURCE_REST_BODY,sourceRestBodyGeometryLibrary,sourceRestBodyThighHeight} from '../src/render/source-rest-body-models.js';
import {parseCharacterAsset} from '../src/render/character-asset.js';

const library=sourceRestBodyGeometryLibrary();
const handBytes=fs.readFileSync(new URL('../public/assets/source-rest/seated-hands.glb',import.meta.url));
const hands=parseCharacterAsset(handBytes.buffer.slice(handBytes.byteOffset,handBytes.byteOffset+handBytes.byteLength));
function components(indices,count){
  const adjacent=Array.from({length:count},()=>[]);
  for(let n=0;n<indices.length;n+=3){const tri=Array.from(indices.slice(n,n+3));for(const a of tri)for(const b of tri)if(a!==b)adjacent[a].push(b);}
  const seen=new Set(),sizes=[];
  for(let n=0;n<count;n++)if(!seen.has(n)){let size=0;const pending=[n];seen.add(n);while(pending.length){const a=pending.pop();size++;for(const b of adjacent[a])if(!seen.has(b)){seen.add(b);pending.push(b);}}sizes.push(size);}
  return sizes.sort((a,b)=>b-a);
}
test('complete bounded body library contains finite indexed geometry and authored surface normals',()=>{
  assert.deepEqual(Object.keys(library).sort(),['rest-body-lap','rest-body-jacket','rest-body-shoe-left','rest-body-shoe-right','rest-body-upper-sleeve','rest-body-fore-sleeve','rest-body-cuff'].sort());
  let triangles=0;
  for(const m of Object.values(library)){
    assert(m.p.length>0&&m.p.length%3===0);assert.equal(m.n.length,m.p.length);assert.equal(m.uv.length,m.p.length/3*2);
    assert(m.p.every(Number.isFinite)&&m.n.every(Number.isFinite)&&m.uv.every(Number.isFinite));
    assert(m.i.every(i=>Number.isInteger(i)&&i>=0&&i<m.p.length/3));
    for(let n=0;n<m.n.length;n+=3)assert(Math.hypot(...m.n.slice(n,n+3))>.98);
    assert(['case-lining','linen'].includes(m.material));assert.equal(m.base[3],1);assert(!m.emissive);triangles+=m.i.length/3;
  }
  assert(triangles<19000);
});
test('trousers remain one connected hip-to-both-shins garment rather than detached knees',()=>{
  const m=library['rest-body-lap'];assert.deepEqual(components(m.i,m.p.length/3),[m.p.length/3]);
  for(const sign of[-1,1]){
    assert(m.p.some((v,n)=>n%3===0&&v*sign>.12&&m.p[n+1]<-.50&&m.p[n+2]<-.45));
    assert(m.p.some((v,n)=>n%3===0&&v*sign>.09&&m.p[n+1]>.03&&m.p[n+2]<-.20));
  }
  const shoes=['left','right'].map(side=>library['rest-body-shoe-'+side]);
  for(const shoe of shoes)assert(Math.abs(shoe.bounds[1][0]+.654065)<1e-5);
  assert(library['rest-body-jacket'].bounds[1][1]<.50);
});
test('thigh support query intersects the actual surface and falls toward each knee',()=>{
  for(const r of[-.155,.155]){
    const back=sourceRestBodyThighHeight(.22,r),palm=sourceRestBodyThighHeight(.36,r),knee=sourceRestBodyThighHeight(.44,r);
    assert(back>.04&&back<.09);assert(palm<back);assert(knee<palm&&knee>-.06);
  }
  assert.equal(sourceRestBodyThighHeight(.10,.8),null);assert.equal(sourceRestBodyThighHeight(NaN,.1),null);
  const {p,i}=library['rest-body-lap'];let checked=0;
  for(let n=0;n<i.length;n+=3){const ids=i.slice(n,n+3),x=ids.reduce((s,v)=>s+p[v*3],0)/3,z=ids.reduce((s,v)=>s+p[v*3+2],0)/3,y=ids.reduce((s,v)=>s+p[v*3+1],0)/3;
    if(-z<.10||-z>.44||Math.abs(x)<.09||Math.abs(x)>.20||y<-.04)continue;
    const actual=sourceRestBodyThighHeight(-z,x);assert(actual!==null&&actual>=y-1e-6);checked++;
  }
  assert(checked>100);
});
test('complete sleeves span both joints and taper to the wrist under a separate cuff',()=>{
  for(const id of['rest-body-upper-sleeve','rest-body-fore-sleeve']){
    const m=library[id];assert.equal(m.bounds[1][0],0);assert.equal(m.bounds[1][1],1);
    const radiusAt=y=>{const r=[];for(let n=0;n<m.p.length;n+=3)if(Math.abs(m.p[n+1]-y)<.002)r.push(Math.hypot(m.p[n],m.p[n+2]));return Math.max(...r);};
    assert(radiusAt(0)>radiusAt(1));assert(radiusAt(1)>.025);
  }
  assert.equal(library['rest-body-cuff'].bounds[1][1],1);assert(library['rest-body-cuff'].bounds[1][0]>.88);
});
test('production hand GLB uses connected anatomical meshes and independently controllable morphs',()=>{
  assert.deepEqual(hands.entries.map(e=>e.name),['rest_hand_left','rest_hand_right']);
  assert(handBytes.length<400000);assert.equal(SOURCE_REST_BODY.handAsset,'assets/source-rest/seated-hands.glb');
  for(const e of hands.entries){
    assert.deepEqual(e.morphNames,['brace','slack']);assert.equal(e.skin.joints.length,1);
    const p=e.primitives[0];assert(p.vertexCount>1300&&p.vertexCount<1500);assert.deepEqual(components(p.indices,p.vertexCount),[p.vertexCount]);
    assert.equal(p.targets.length,2);
    const brace=Math.max(...p.targets[0].positions.map(Math.abs)),slack=Math.max(...p.targets[1].positions.map(Math.abs));
    assert(brace>.025&&brace<.06);assert(slack>.003&&slack<.015);
    assert.equal(e.extras.dorsum,'+Y');assert.equal(e.extras.forward,'-Z');
    const edge=new Map();for(let n=0;n<p.indices.length;n+=3){const t=p.indices.slice(n,n+3);for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);edge.set(key,(edge.get(key)||0)+1);}}
    assert.equal([...edge.values()].filter(n=>n===1).length,22,'only the cuff-hidden wrist boundary remains open');assert([...edge.values()].every(n=>n<=2));
  }
});
test('full anatomical hands can rest over the real sloping lap through all authored morphs',()=>{
  for(const e of hands.entries){const p=e.primitives[0],sign=e.name.includes('left')?-1:1,right=sign*.155,turn=sign*-.08,pitch=-.06;
    for(const brace of[0,.5,1])for(const slack of[0,1-brace]){
      const wristY=sourceRestBodyThighHeight(.29,right)+(sign<0?.030:.035)+.015*brace;
      let minimum=Infinity,supported=0;
      for(let v=0;v<p.vertexCount;v++){
        const q=[0,1,2].map(k=>p.positions[v*3+k]+p.targets[0].positions[v*3+k]*brace+p.targets[1].positions[v*3+k]*slack),[x,y,z]=q,
          r=right+Math.cos(turn)*x-Math.sin(turn)*Math.sin(pitch)*y-Math.sin(turn)*Math.cos(pitch)*z,
          f=.29-Math.sin(turn)*x-Math.cos(turn)*Math.sin(pitch)*y-Math.cos(turn)*Math.cos(pitch)*z,
          u=wristY+Math.cos(pitch)*y-Math.sin(pitch)*z,surface=sourceRestBodyThighHeight(f,r);
        if(surface===null)continue;supported++;minimum=Math.min(minimum,u-surface);
      }
      assert(supported>1200);assert(minimum>-.001,'the actual fingers must not be buried in the trousers');assert(minimum<.012,'the hand should make a plausible contact rather than hover');
    }
  }
});

test('repository-relative build reproduces the published hands and cloth byte for byte without touching production',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'source-rest-body-proof-')),
    script=fileURLToPath(new URL('../tools/chunk_surfer/build-source-rest-body.mjs',import.meta.url)),
    source=fileURLToPath(new URL('../src/render/source-rest-body-data.js',import.meta.url)),before=fs.readFileSync(source);
  try{
    execFileSync(process.execPath,[script,'--out-dir',temporary],{cwd:temporary,stdio:'pipe'});
    const rebuiltHands=fs.readFileSync(path.join(temporary,'public/assets/source-rest/seated-hands.glb')),
      rebuiltBody=fs.readFileSync(path.join(temporary,'src/render/source-rest-body-data.js')),
      credits=JSON.parse(fs.readFileSync(path.join(temporary,'public/assets/source-rest/seated-hands.credits.json')));
    assert.deepEqual(rebuiltHands,handBytes);assert.deepEqual(rebuiltBody,before);assert.deepEqual(fs.readFileSync(source),before);
    assert.equal(credits.licence,'CC0-1.0');
    assert.equal(credits.build.script,'tools/chunk_surfer/build-source-rest-body.mjs');
    assert(credits.build.inputs.some(input=>input.file.endsWith('vigil-tailoring.mjs')));
    for(const output of credits.build.outputs){const bytes=fs.readFileSync(path.join(temporary,output.file));assert.equal(output.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));}
    assert(!fs.readFileSync(script,'utf8').includes('/Users/'),'build must not depend on this workspace location');
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
