// Validate the emitted asset and actual coat apertures, independently of rendering.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
import {BUS_WOMAN_RIG,BUS_WOMAN_CONTACTS} from '../../../src/data/bus-woman-rig.js';
import {busWomanPose,BUS_WOMAN_CLIPS} from '../../../src/render/bus-woman-performance.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=JSON.parse(fs.readFileSync(path.join(root,'artifacts/bus-woman-production/anatomy.json')));
const bytes=fs.readFileSync(path.join(root,'public/assets/bus-woman-character.glb'));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const aliases=['exterior_bus_woman','outskirts_bus_woman'];
const body=aliases.map(name=>asset.entries.find(e=>e.name===name));
assert(body.every(Boolean));assert.equal(body[0].skin,body[1].skin);
assert.deepEqual(body[0].primitives,body[1].primitives);
assert.equal(body[0].skin.joints.length,54);assert.equal(BUS_WOMAN_RIG.length,54);
for(const side of ['L','R'])for(const finger of ['thumb','index','middle','ring','little'])for(const segment of ['', '_mid','_tip'])assert(BUS_WOMAN_RIG.some(b=>b.name===finger+segment+'_'+side));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,s)=>a.map(v=>v*s);const add=(a,b)=>a.map((v,i)=>v+b[i]);
const coat=source.meshes.find(m=>m.name.includes('continuous-tailored-coat'));
function rayHits(origin,direction){const hits=[];
 for(let i=0;i<coat.indices.length;i+=3){const[a,b,c]=coat.indices.slice(i,i+3).map(j=>coat.positions.slice(j*3,j*3+3)),e=sub(b,a),f=sub(c,a),p=cross(direction,f),det=dot(e,p);if(Math.abs(det)<1e-8)continue;
  const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)continue;const q=cross(t,e),v=dot(direction,q)/det;if(v<0||u+v>1)continue;const distance=dot(f,q)/det;if(distance>=0)hits.push(distance);
 }return hits.sort((a,b)=>a-b);
}
const apertures={};
for(const [side,sign]of [['L',-1],['R',1]]){
 const mouth=BUS_WOMAN_CONTACTS.pockets[side],normal=[sign*.5,0,-.866],origin=add(mouth,scale(normal,.2)),direction=scale(normal,-1),hits=rayHits(origin,direction);
 assert(hits.length>=2);assert(hits[0]>.4,'Pocket centre must pass through coat opening before reaching back cloth');
 const clothHits=rayHits(add(origin,[0,.055,0]),direction);
 assert(clothHits.some(v=>v>.14&&v<.27),'Cloth must remain alongside the cut pocket');
 assert(source.meshes.some(m=>m.name==='option2-open-pocket-lining-'+sign));
 apertures[side]={center:mouth,firstCoatHitMetres:hits[0],adjacentClothHitMetres:clothHits[0],physicalOpening:true};
}
let samples=0,maxPoseMatrixError=0;
for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(let frame=0;frame<=Math.round(duration*30);frame++){
 const time=Math.min(duration,frame/30),expected=busWomanPose(mode,time),descriptor={clip:'bus_woman_'+mode.replaceAll('-','_'),time,loop:false};
 for(const entry of asset.entries){const sampled=sampleCharacterPose(asset,entry,descriptor);assert([...sampled.bones].every(Number.isFinite));
  for(let j=0;j<entry.skin.joints.length;j++){
   const matrix=sampled.bones.subarray(j*16,j*16+16),name=asset.nodes[entry.skin.joints[j]].name;
   const p=name==='bus_woman_bag_joint'?expected.attachments.bag:name==='bus_woman_ticket_joint'?expected.attachments.ticket:expected.joints[name.replace('bus_woman_','')];
   const bone=BUS_WOMAN_RIG.find(b=>name==='bus_woman_'+b.name),point=bone?.head||[0,0,0];
   const result=[0,1,2].map(k=>matrix[k]*point[0]+matrix[4+k]*point[1]+matrix[8+k]*point[2]+matrix[12+k]);
   maxPoseMatrixError=Math.max(maxPoseMatrixError,Math.hypot(...sub(result,p.translation)));
  }
  samples++;
 }
}
assert(maxPoseMatrixError<.000002);
const report={passed:true,assetBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),canonicalAliasesIdentical:true,bodyJoints:54,fingerSegments:3,apertures,clips:[...asset.clips.keys()],sampledEntryFrames:samples,maxBakedJointHeadErrorMetres:maxPoseMatrixError,body:source.stats,newScenePlacements:0};
fs.writeFileSync(path.join(root,'artifacts/bus-woman-production/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
