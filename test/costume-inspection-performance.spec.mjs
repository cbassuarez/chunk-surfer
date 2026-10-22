import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {costumeExchangeParts,adversaryWorldMatrix,COSTUME_INSPECTION_MARKS} from '../src/render/conservatory-adversary-performance.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {NodeIO} from '@gltf-transform/core';

const bytes=fs.readFileSync(new URL('../public/assets/costume-exchange.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const actor=(phase,elapsed=0)=>({phase,elapsed,inStore:true,lungeAt:{x:2.7,y:17.55},
  playerAt:{x:2.8,y:18.85},inspectAt:{x:2.8,y:18.85},cameraAt:{x:2.8,y:18.85}});
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP,CONSERVATORY_PROPS);

// The original inspection looked into a rolled rug passing through the chair.
// Test the final emitted placements and the actual isolated mesh envelopes,
// rather than asserting the new authored coordinates happen to be a constant.
async function staticBounds(file,name){
  const doc=await new NodeIO().read(new URL('../public/assets/'+file,import.meta.url).pathname),mesh=doc.getRoot().listMeshes().find(m=>m.getName()===name);assert.ok(mesh);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const primitive of mesh.listPrimitives()){
    const positions=primitive.getAttribute('POSITION').getArray();
    for(let i=0;i<positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);max[axis]=Math.max(max[axis],positions[i]);}
  }
  return{min,max};
}
const [rugBounds,chairBounds]=await Promise.all([
  staticBounds('conservatory-textiles.glb','textile_rolled'),
  staticBounds('conservatory-adversary-scenery.glb','costume_stained_chair'),
]);
const emitted=PROPS.renderInstances({group:'basement'}),rugFrame=emitted.find(p=>p.id==='store-rolled-rug'),chairFrame=emitted.find(p=>p.id==='store-empty-chair');assert.ok(rugFrame&&chairFrame);
function propPoint(frame,point){
  const c=Math.cos(frame.yaw||0),s=Math.sin(frame.yaw||0),scale=frame.scale||1;
  const [x,y,z]=point.map((n,i)=>n*scale*(frame[['scaleX','scaleY','scaleZ'][i]]??1));
  return[frame.x+c*x-s*z,frame.y+y,frame.z+s*x+c*z];
}
function footprint(frame,b){return[[b.min[0],0,b.min[2]],[b.max[0],0,b.min[2]],[b.max[0],0,b.max[2]],[b.min[0],0,b.max[2]]].map(p=>{const q=propPoint(frame,p);return[q[0],q[2]];});}
function overlaps(a,b){
  for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],axis=[q[1]-p[1],p[0]-q[0]],project=poly=>poly.map(v=>v[0]*axis[0]+v[1]*axis[1]),A=project(a),B=project(b);
    if(Math.max(...A)<=Math.min(...B)||Math.max(...B)<=Math.min(...A))return false;
  }
  return true;
}
function sightBlocked(frame,b,start,end,pad=.08){
  // Eight centimetres around the pin retains the visible lining and pinhead,
  // rather than permitting a tall object immediately behind an infinitesimal
  // ray that happens to finish on the frontmost edge of the chair.
  const c=Math.cos(frame.yaw||0),s=Math.sin(frame.yaw||0),scale=frame.scale||1;
  const inverse=point=>{const x=point[0]-frame.x,z=point[2]-frame.z;return[(c*x+s*z)/(scale*(frame.scaleX??1)),(point[1]-frame.y)/(scale*(frame.scaleY??1)),(-s*x+c*z)/(scale*(frame.scaleZ??1))];};
  const a=inverse(start),z=inverse(end);let enter=0,leave=1;
  for(let i=0;i<3;i++){
    const delta=z[i]-a[i],lo=b.min[i]-pad,hi=b.max[i]+pad;
    if(Math.abs(delta)<1e-10){if(a[i]<lo||a[i]>hi)return false;continue;}
    const u=(lo-a[i])/delta,v=(hi-a[i])/delta;enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));if(enter>leave)return false;
  }
  return true;
}
const camera=[COSTUME_INSPECTION_MARKS.cameraPhysical.x,chairFrame.y+COSTUME_INSPECTION_MARKS.cameraPhysical.inspectEye,COSTUME_INSPECTION_MARKS.cameraPhysical.z];
const pin=propPoint(chairFrame,[.045,.491,-.235]);
assert.equal(overlaps(footprint(rugFrame,rugBounds),footprint(chairFrame,chairBounds)),false,'the emitted rolled rug cannot pass through the actual work chair');
assert.equal(sightBlocked(rugFrame,rugBounds,camera,pin),false,'the emitted rug clears the camera-to-pin lining sightline');
const intersectingRug={...rugFrame,x:chairFrame.x,z:chairFrame.z};
assert.equal(overlaps(footprint(intersectingRug,rugBounds),footprint(chairFrame,chairBounds)),true,'the original rug-on-chair placement is detected as a real footprint overlap');
assert.equal(sightBlocked(intersectingRug,rugBounds,camera,pin),true,'the original tall rug blocks the concrete seam inspection composition');

function worldAnchor(part){
  const origin=part.anchorAt||part.at,p=FP.toRuntimePoint(origin),at=FP.logicalToPhysical(p.x,p.y);
  return{x:at.x*CELL+(part.at.x-origin.x),y:at.y+(part.height||0),z:at.z*CELL+(part.at.y-origin.y)};
}
function geometry(part){
  const entry=asset.entries.find(e=>e.name===part.mesh);assert.ok(entry);
  const pose=sampleCharacterPose(asset,entry,part.character),at=worldAnchor(part),world=adversaryWorldMatrix(at.x,at.y,at.z,part.yaw,part.pitch,part.scale||1);
  assert.ok([...world,...pose.bones].every(Number.isFinite));
  return{entry,at,primitives:entry.primitives.map(p=>{
    const positions=new Float64Array(p.positions.length),local=new Float64Array(p.positions.length);
    for(let v=0;v<p.vertexCount;v++){
      const point=[0,0,0];for(let axis=0;axis<3;axis++)for(let k=0;k<4;k++){
        const j=p.joints[v*4+k]*16,w=p.weights[v*4+k];point[axis]+=w*(pose.bones[j+axis]*p.positions[v*3]+pose.bones[j+axis+4]*p.positions[v*3+1]+pose.bones[j+axis+8]*p.positions[v*3+2]+pose.bones[j+axis+12]);
      }
      for(let axis=0;axis<3;axis++){
        local[v*3+axis]=point[axis];positions[v*3+axis]=world[axis]*point[0]+world[4+axis]*point[1]+world[8+axis]*point[2]+world[12+axis];
        assert.ok(Number.isFinite(positions[v*3+axis]));
      }
    }
    return{...p,positions,local};
  })};
}
function bounds(value,{local=false}={}){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of value.primitives)for(const v of new Set(p.indices))for(let a=0;a<3;a++){
    const n=(local?p.local:p.positions)[v*3+a];min[a]=Math.min(min[a],n);max[a]=Math.max(max[a],n);
  }
  return{min,max};
}
const work=costumeExchangeParts(actor('work')),inspect=costumeExchangeParts(actor('inspect',.8)),notice=costumeExchangeParts(actor('notice',.3));
assert.ok(work.some(p=>p.id==='exchange-hanging-cover'),'the uninvited work figure wears its opaque front cover');
assert.ok(inspect.some(p=>p.id==='exchange-hanging-cover'),'the player inspects the lining before the cover drops');
const workCover=bounds(geometry(work.find(p=>p.id==='exchange-hanging-cover')),{local:true});
const workFace=bounds(geometry(work.find(p=>p.id==='exchange-features')),{local:true});
assert.ok(workCover.max[1]>workFace.max[1],'the covered work pose conceals the anatomical crown');
assert.ok(workCover.max[2]<workFace.min[2]-.03,'the work cover stands in front of the actual face surface');
const noticedFace=notice.find(p=>p.id==='exchange-features');
assert.notDeepEqual(noticedFace.character.joints.head.rotation,work.find(p=>p.id==='exchange-features').character.joints.head.rotation,'the head addresses the player during the notice beat');
assert.equal(noticedFace.character.joints.crown_left.rotation[2],0,'the stare precedes the cranial opening');

const footRest=new Map();let samples=0,vertices=0,lowest=Infinity,highestCover=-Infinity;
const phases=[['work',[0,1]],['inspect',[0,.7,1.44]],['notice',[0,.08,.18,.64]],['startle',[0,.10,.27]],['exchange',[0,.25,.65,1.2,1.8,2.54]],['threshold',Array.from({length:35},(_,i)=>i*1.25/34)],['done',[0]]];
for(const[phase,times]of phases)for(const elapsed of times){
  const parts=costumeExchangeParts(actor(phase,elapsed));assert.ok(parts.length);
  for(const part of parts){
    const value=geometry(part),b=bounds(value),floor=worldAnchor({...part,height:0}).y;samples++;
    lowest=Math.min(lowest,b.min[1]-floor);
    assert.ok(b.min[1]>=floor-.006,`${phase} ${elapsed} ${part.id}: actual skin/cloth cannot sink through the store floor (${b.min[1]-floor})`);
    assert.ok(b.max[1]<floor+2.20,`${phase}: the head and cloth fit below the actual 2.60m ceiling`);
    if(part.mesh==='costume_exchange_features'){
      assert.ok(b.max[0]-b.min[0]<.70&&b.max[1]-b.min[1]<.65&&b.max[2]-b.min[2]<.75,'the near face remains an anatomical head rather than a stretched screen-filling proxy');
    }
    if(part.id==='exchange-cover'){
      highestCover=Math.max(highestCover,b.max[1]-floor);
      assert.ok(b.max[1]<floor+1.57,'the empty cover misses below the player’s 1.62m eye');
    }
    if(part.mesh==='costume_exchange_body')for(const[pIndex,p]of value.primitives.entries())for(let v=0;v<p.vertexCount;v++){
      const foot=p.joints.subarray(v*4,v*4+4).some((j,k)=>p.weights[v*4+k]>.5&&/^(foot|toe)_/.test(asset.nodes[value.entry.skin.joints[j]].name));
      if(!foot)continue;const point=Array.from(p.local.subarray(v*3,v*3+3)),key=pIndex+':'+v;
      if(!footRest.has(key))footRest.set(key,point);else assert.ok(Math.hypot(...point.map((n,i)=>n-footRest.get(key)[i]))<1e-7,'actual foot vertices stay planted while the upper body breaks its costume');
    }
    vertices+=value.primitives.reduce((n,p)=>n+p.vertexCount,0);
  }
}
const finalCover=costumeExchangeParts(actor('threshold',1.25)).find(p=>p.id==='exchange-cover'),remnant=costumeExchangeParts({phase:'done',elapsed:0})[0];
assert.equal(remnant.mesh,'costume_exchange_cover');assert.equal(costumeExchangeParts({phase:'done'}).length,1,'reload restores an empty cloth aftermath without the creature');
assert.ok(!costumeExchangeParts({phase:'done'}).some(p=>/body|features|attachments/.test(p.mesh)));
assert.deepEqual(worldAnchor(finalCover),worldAnchor(remnant),'the continuous moving cover and independently restored remnant meet at the exact same world mark');
const resting=bounds(geometry(remnant)),floor=worldAnchor({...remnant,height:0}).y;
assert.ok(resting.min[1]-floor>=0&&resting.min[1]-floor<.006,'the collapsed lining contacts the concrete within six millimetres');
assert.ok(resting.max[1]-floor<.15,'the aftermath reads as empty collapsed fabric');
assert.equal(worldAnchor(remnant).x,COSTUME_INSPECTION_MARKS.chairPhysical.x);assert.equal(worldAnchor(remnant).z,COSTUME_INSPECTION_MARKS.chairPhysical.z);
console.log(JSON.stringify({ok:true,samples,vertices,plantedFootVertices:footRest.size,lowestAboveFloor:lowest,highestNearMissCover:highestCover,remnantBounds:resting,assetRebuilt:false}));
