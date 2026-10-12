import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {RECORDIST_CHARACTER_RIG} from '../src/data/recordist-character-rig.js';
import {recordistCharacterPose} from '../src/render/recordist-character-performance.js';
const bytes=fs.readFileSync(new URL('../public/assets/recordist-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const point=(p,v,pose)=>{const x=p.positions[v*3],y=p.positions[v*3+1],z=p.positions[v*3+2],out=[0,0,0];for(let k=0;k<4;k++){const w=p.weights[v*4+k],b=p.joints[v*4+k]*16,m=pose.bones;for(let j=0;j<3;j++)out[j]+=w*(m[b+j]*x+m[b+4+j]*y+m[b+8+j]*z+m[b+12+j]);}return out;};

test('production anatomy uses the approved rest bones, bounded geometry and real facial absence',()=>{
  for(const actor of ['boy','contractor']){
    const source=JSON.parse(fs.readFileSync(new URL(`../public/assets/recordist-characters/${actor}.json`,import.meta.url)));
    assert.equal(JSON.stringify(source.bones),JSON.stringify(RECORDIST_CHARACTER_RIG[actor]));
    const body=asset.entries.find(e=>e.name==='recordist_'+actor);
    assert.ok(body.primitives.reduce((n,p)=>n+p.vertexCount,0)<50000);
    assert.equal(body.skin.joints.length,34);
    if(actor==='boy'){
      assert.ok(!source.meshes.some(m=>/eye|mouth|nose/i.test(m.name)));
      const cavity=source.meshes.find(m=>m.name==='boy-closed-facial-absence');
      assert.ok(cavity&&cavity.indices.length>100,'absence has no physical backing');
      const rim=source.meshes.find(m=>m.name==='boy-receding-aperture-rim');
      const depths=Array.from({length:rim.positions.length/3},(_,i)=>rim.positions[i*3+2]);
      assert.ok(Math.max(...depths)-Math.min(...depths)>.03,'the aperture is a painted flat patch');
    }else assert.ok(source.meshes.some(m=>/eye/i.test(m.name)),'contractor loses ordinary facial features');
  }
  assert.ok(bytes.length<5*1024*1024);
});

test('exported poses retain supported feet and exact limb contacts throughout the saved transfer',()=>{
  for(const body of asset.entries){
    const actor=body.name.replace('recordist_','');
    for(let step=0;step<=40;step++){
      const progress=step/40,pose=sampleCharacterPose(asset,body,{clip:actor+'_transfer',time:progress*4,loop:false});
      assert.ok([...pose.bones,...pose.bounds.min,...pose.bounds.max].every(Number.isFinite));
      for(const c of recordistCharacterPose(actor,'transfer',progress).contacts)assert.ok(c.reachError<1e-6&&c.legError<1e-6,'a limb stretches to hit its target');
      let floor=Infinity;
      for(const p of body.primitives)for(let v=0;v<p.vertexCount;v++){
        const q=point(p,v,pose);floor=Math.min(floor,q[1]);
        if(v%41===0)for(let i=0;i<3;i++)assert.ok(q[i]>=pose.bounds.min[i]-.001&&q[i]<=pose.bounds.max[i]+.001,'skin escapes its culling bounds');
      }
      assert.ok(floor>-.015&&floor<.02,`${actor} feet leave floor: ${floor}`);
    }
  }
});

test('idle clips close their breathing loop and move while the saved transfer does not loop',()=>{
  for(const body of asset.entries){const actor=body.name.replace('recordist_',''),clip=actor+(actor==='boy'?'_wait':'_work');
    const duration=asset.clips.get(clip).duration,a=sampleCharacterPose(asset,body,{clip,time:0,loop:false}),b=sampleCharacterPose(asset,body,{clip,time:duration,loop:false}),mid=sampleCharacterPose(asset,body,{clip,time:duration/4});
    assert.ok(a.bones.every((x,i)=>Math.abs(x-b.bones[i])<1e-5),'breathing snaps at loop');
    assert.ok(a.bones.some((x,i)=>Math.abs(x-mid.bones[i])>.0001),'idle never moves');
    assert.equal(asset.clips.get(actor+'_transfer').duration,4);
  }
});
