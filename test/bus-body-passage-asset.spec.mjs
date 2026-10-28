import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose,CHARACTER_LIMITS} from '../src/render/character-asset.js';
import {busWomanPassageDescriptor} from '../src/render/bus-woman-passage-performance.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {buildBusBodyPassage,BUS_BODY_PASSAGE_MESHES,BUS_BODY_PASSAGE_TARGETS,BUS_BODY_PASSAGE_APERTURE as APERTURE} from '../tools/chunk_surfer/build-bus-body-passage.mjs';
const path=new URL('../public/assets/bus-body-passage.glb',import.meta.url),bytes=fs.readFileSync(path),raw=parseGlb(bytes),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/bus-body-passage.stats.json',import.meta.url)));
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
function vertex(p,v,pose){
 const pos=Array.from(p.positions.subarray(v*3,v*3+3));for(let k=0;k<p.targets.length;k++)for(let a=0;a<3;a++)pos[a]+=p.targets[k].positions[v*3+a]*pose.morphs[k];
 const out=[0,0,0];for(let slot=0;slot<4;slot++){const i=v*4+slot,w=p.weights[i],j=p.joints[i]*16;if(!w)continue;for(let a=0;a<3;a++)out[a]+=w*(pose.bones[j+a]*pos[0]+pose.bones[j+4+a]*pos[1]+pose.bones[j+8+a]*pos[2]+pose.bones[j+12+a]);}return out;
}
const descriptor=(u,p=0,s=0)=>({time:0,loop:false,morphs:{unfold:u,paper:p,paperUnfold:u*p,strain:s}});
function inspect(u,p=0,s=0){return asset.entries.flatMap(entry=>{const pose=sampleCharacterPose(asset,entry,descriptor(u,p,s));return entry.primitives.flatMap(primitive=>Array.from({length:primitive.vertexCount},(_,v)=>({entry:entry.name,p:vertex(primitive,v,pose)})));});}

test('the literal passage is a bounded real character pack with actual anatomy, physical cuts and controlled material channels',()=>{
 assert.deepEqual(asset.entries.map(e=>e.name),BUS_BODY_PASSAGE_MESHES);
 assert.ok(stats.sourceTriangles>70000&&stats.medialCutSegments>1000&&stats.closedCutLoops>=15,'actual woman topology was replaced by a primitive frame');
 assert.ok(stats.totalVertices>40000&&stats.totalVertices<60000);assert.ok(stats.totalTriangles>80000&&stats.totalTriangles<100000);
 assert.ok(bytes.length<8*1024*1024);assert.equal(raw.json.images?.length||0,0,'a raster replaced the passage surface');
 assert.equal(asset.nodes.find(n=>n.name==='bus_body_passage_rest').translation.join(','),'0,0,0');
 for(const e of asset.entries){assert.equal(e.skin.joints.length,1);assert.ok(e.primitives.length<=CHARACTER_LIMITS.primitives);assert.deepEqual(e.morphNames,BUS_BODY_PASSAGE_TARGETS);assert.equal(e.morphCount,4);assert.ok(e.primitives.reduce((n,p)=>n+p.vertexCount,0)<CHARACTER_LIMITS.vertices);}
 const names=raw.json.materials.map(m=>m.name);
 for(const name of['warm deep-brown skin','weathered navy wool','black wool cap','Wrong origin exposed muscular plane','Wrong origin fascia and selectively exposed rib','body passage attached subcutaneous margin','body passage divided cortical folds'])assert.ok(names.includes(name),name);
 assert.ok(raw.json.materials.every(m=>!m.emissiveFactor?.some(v=>v>0)),'tissue should respond to the real lamp, never glow');
});

test('closed handoff preserves the actual posed woman, including the distinct paper-holding hand',()=>{
 const sourceBytes=fs.readFileSync(new URL('../public/assets/outskirts-bus-woman-wrong-origin.glb',import.meta.url)),source=parseCharacterAsset(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength)),entry=source.entries.find(e=>e.name==='outskirts_bus_woman_wrong_origin_3');
 const key=p=>p.map(x=>Math.round(x*10000)).join(','),co=Math.cos(C.woman.yaw),si=Math.sin(C.woman.yaw);
 for(const [mode,paper]of[['wait',0],['ticket-wait',1]]){
  const target=new Set(inspect(0,paper).filter(v=>!v.entry.endsWith('bag')&&!v.entry.endsWith('ticket')).map(v=>key(v.p)));
  const pose=sampleCharacterPose(source,entry,busWomanPassageDescriptor(mode,4,{stretch:7,passage:stats.handoff.passage}));let same=0,count=0;
  for(const primitive of entry.primitives)for(let v=0;v<primitive.vertexCount;v++){
   const a=vertex(primitive,v,pose),p=[C.woman.x+a[0]*co+a[2]*si,C.woman.y+a[1],C.woman.z-a[0]*si+a[2]*co];count++;if(target.has(key(p)))same++;
  }
  assert.ok(same/count>.995,`${mode}: source surface coverage${same}/${count} lost during parting`);
 }
});

test('both actual tissue halves, bag and paper clear the full physical aperture when open, including their finite strain',t=>{
 const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];let vertices=0;
 for(const paper of[0,1])for(const strain of[-1,0,1])for(const v of inspect(1,paper,strain)){
  const p=v.p;vertices++;assert.ok(p.every(Number.isFinite));for(let k=0;k<3;k++){low[k]=Math.min(low[k],p[k]);high[k]=Math.max(high[k],p[k]);}
  assert.ok(p[0]<APERTURE.minX-.035||p[0]>APERTURE.maxX+.035,`actual anatomy intrudes into useful passage: ${v.entry}/${p}`);
  assert.ok(Math.abs(p[0])<1.105,'opened anatomy intersects the side skin');
  assert.ok(p[1]>=C.floor-.001&&p[1]<2.90,'opened anatomy crosses floor or roof');
  assert.ok(p[2]>3.0&&p[2]<4.4,'opened tissue leaves its measured rear bay');
 }
 // Each indexed face belongs to one side. Clear vertices alone would not
 // exclude a triangle spanning the walkable hole between opposing rims.
 for(const entry of asset.entries)for(const primitive of entry.primitives){
  const pose=sampleCharacterPose(asset,entry,descriptor(1,entry.name.endsWith('ticket')?1:0));
  for(let i=0;i<primitive.indices.length;i+=3){const xs=Array.from(primitive.indices.subarray(i,i+3),v=>vertex(primitive,v,pose)[0]);assert.ok(xs.every(x=>x<APERTURE.minX)||xs.every(x=>x>APERTURE.maxX),'a cap closes the apparent hole');}
 }
 t.diagnostic(JSON.stringify({sampledVertices:vertices,bounds:{min:low,max:high},aperture:APERTURE}));
});

test('opening and paper cross-morphs stay finite and never jump or exceed the physical saloon',()=>{
 const previous=new Map();
 for(let i=0;i<=20;i++){
  const u=i/20;
  for(const paper of[0,1]){
   let n=0;for(const v of inspect(u,paper,Math.sin(u*Math.PI)*.5)){
    assert.ok(v.p.every(Number.isFinite));assert.ok(Math.abs(v.p[0])<1.105&&v.p[1]>=C.floor-.001&&v.p[1]<2.90&&v.p[2]>3&&v.p[2]<4.4);
    const key=`${paper}:${n++}`,last=previous.get(key);if(last)assert.ok(Math.hypot(...v.p.map((x,k)=>x-last[k]))<.13,'the finite opening jumps between sampled frames');previous.set(key,v.p);
   }
  }
 }
});

test('the installed body asset is reproducible and records its actual source hashes',()=>{
 const fresh=buildBusBodyPassage();assert.equal(SHA(bytes),fresh.stats.sha256);assert.equal(stats.sha256,fresh.stats.sha256);assert.equal(stats.bytes,bytes.length);
 for(const[file,field]of[['outskirts-bus-woman-wrong-origin.glb','body'],['bus-woman-character.glb','ordinary']])assert.equal(stats.sourceAssets[field],SHA(fs.readFileSync(new URL('../public/assets/'+file,import.meta.url))));
 assert.equal(stats.contractSha256,SHA(fs.readFileSync(new URL('../src/data/outskirts-bus-passage.js',import.meta.url))));
});
