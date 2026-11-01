import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {busWomanPassagePose,busWomanPassageDescriptor} from '../src/render/bus-woman-passage-performance.js';
import {busBodyPassageInstances,busSeatIntrusionInstances} from '../src/render/bus-body-presentation.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';

const load=name=>{const b=fs.readFileSync(new URL('../public/assets/'+name+'.glb',import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const source=load('outskirts-bus-woman-wrong-origin'),split=load('bus-body-passage'),landscape=load('source-drive/cut/cut-landscape');
const sourceEntry=source.entries.find(e=>e.name==='outskirts_bus_woman_wrong_origin_3');
const H={clock:4,noticeAt:0,passAt:1,closeAt:.8,exitedAt:null,gazeYaw:-1.5};
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const passage=(gazeYaw,elapsed)=>({...H,clock:10+elapsed,openAt:10,gazeYaw});
function vertex(p,v,pose){
 const q=Array.from(p.positions.subarray(v*3,v*3+3));
 for(let k=0;k<p.targets.length;k++)for(let a=0;a<3;a++)q[a]+=p.targets[k].positions[v*3+a]*pose.morphs[k];
 const out=[0,0,0];for(let s=0;s<4;s++){const i=v*4+s,w=p.weights[i];if(!w)continue;const j=p.joints[i]*16;for(let a=0;a<3;a++)out[a]+=w*(pose.bones[j+a]*q[0]+pose.bones[j+4+a]*q[1]+pose.bones[j+8+a]*q[2]+pose.bones[j+12+a]);}return out;
}

test('opening settles the actual cervical chain into the baked split pose without moving useful hands or the root',()=>{
 for(const mode of['wait','ticket-wait'])for(const gazeYaw of[-2.75,-.8,.3]){
  const options={stretch:7,passage:passage(gazeYaw,0)},start=busWomanPassagePose(mode,4,options),ordinary=busWomanPassagePose(mode,4,{...options,passage:{...options.passage,openAt:null}});
  for(const name of['neck','head','jaw']){assert.ok(distance(start.joints[name].translation,ordinary.joints[name].translation)<1e-10);assert.ok(Math.abs(start.joints[name].rotation.reduce((n,v,i)=>n+v*ordinary.joints[name].rotation[i],0))>1-1e-10);}
  const baked=busWomanPassagePose(mode,4,{stretch:7,passage:H}),held=busWomanPassagePose(mode,4,{stretch:7,passage:passage(gazeYaw,.319)});
  for(const name of['neck','head','jaw']){assert.ok(distance(held.joints[name].translation,baked.joints[name].translation)<1e-9);assert.ok(Math.abs(held.joints[name].rotation.reduce((n,v,i)=>n+v*baked.joints[name].rotation[i],0))>1-1e-9);}
  for(let i=0;i<=30;i++){
   const p=busWomanPassagePose(mode,4,{stretch:7,passage:passage(gazeYaw,i/100)});
   for(const name of Object.keys(start.joints))if(!['neck','head','jaw'].includes(name))assert.deepEqual(p.joints[name],start.joints[name]);
   assert.deepEqual(p.attachments,start.attachments);
   assert.ok(Math.abs(distance(p.joints.head.translation,p.joints.neck.translation)-distance(start.joints.head.translation,start.joints.neck.translation))<1e-9,'the neck stretches during the settle');
   assert.ok(distance(p.joints.jaw.translation,p.passage.rigidJaw)<=.004+1e-9);
  }
 }
});

test('the final living packed surface matches the installed closed split surface at the actual .32s mesh handoff',t=>{
 const key=p=>p.map(v=>Math.round(v*1e4)).join(','),c=Math.cos(C.woman.yaw),s=Math.sin(C.woman.yaw);let total=0,matched=0;
 for(const[mode,paper]of[['wait',0],['ticket-wait',1]]){
  const target=new Set();for(const e of split.entries.filter(e=>e.name.endsWith('left')||e.name.endsWith('right'))){
   const pose=sampleCharacterPose(split,e,{time:0,loop:false,morphs:{unfold:0,paper,paperUnfold:0,strain:0}});
   for(const p of e.primitives)for(let v=0;v<p.vertexCount;v++)target.add(key(vertex(p,v,pose)));
  }
  for(const gazeYaw of[-2.75,-.8,.3])for(const reducedMotion of[false,true]){
   const pose=sampleCharacterPose(source,sourceEntry,busWomanPassageDescriptor(mode,4,{stretch:7,reducedMotion,passage:passage(gazeYaw,.319)}));let n=0,same=0;
   for(const p of sourceEntry.primitives)for(let v=0;v<p.vertexCount;v++){
    const a=vertex(p,v,pose),world=[C.woman.x+a[0]*c+a[2]*s,C.woman.y+a[1],C.woman.z-a[0]*s+a[2]*c];n++;if(target.has(key(world)))same++;
   }
   assert.ok(same/n>.995,`${mode}/${gazeYaw}/reduced=${reducedMotion} living-to-split surface coverage ${same}/${n}`);total+=n;matched+=same;
  }
 }
 t.diagnostic(JSON.stringify({packedSourceVertices:total,matchedClosedSurfaceVertices:matched,matchedFraction:matched/total,handoffSeconds:.32}));
});

test('the parted halves are joined by her throat, and the pocket owns the view once crossed',()=>{
 const frame={bodyOpening:{active:true,elapsed:3,progress:1,paperReady:true},lighting:{origin:{x:84,y:15.5,z:-270,yaw:Math.PI/2}}};
 // The black absorbing arch is gone; bus-body-throat.spec covers the rear wall.
 assert.deepEqual(busBodyPassageInstances(frame).map(i=>i.mesh),['bus_body_passage_left','bus_body_passage_right','bus_body_passage_bag','bus_body_passage_ticket','bus_body_throat_lining','bus_body_throat_strands']);
 assert.deepEqual(busBodyPassageInstances({...frame,interior:{active:true}}),[]);
 assert.deepEqual(busBodyPassageInstances({...frame,bodyOpening:{...frame.bodyOpening,elapsed:.319}}),[]);
});

test('all actual breathing lung vertices emerge within the seats and leave the complete physical aisle clear',t=>{
 const e=landscape.entries.find(e=>e.name==='cut_lungs');assert.ok(e);let vertices=0;const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(const clock of[1.35,1.5,2,2.7,3.5,4.8,7.1,10,15,21]){
  const frame={transit:{clock,trapAt:0},lighting:{origin:{x:0,y:0,z:0,yaw:0}}},instances=busSeatIntrusionInstances(frame);
  assert.deepEqual(instances,busSeatIntrusionInstances(structuredClone(frame)));
  for(const instance of instances){const row=Number(instance.id.split(':').at(-1))<2?-1.22:.54;
   const pose=sampleCharacterPose(landscape,e,instance.character);
   for(const p of e.primitives)for(let v=0;v<p.vertexCount;v++){
    const a=point(instance.matrix,vertex(p,v,pose));vertices++;
    for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],a[k]);bounds.max[k]=Math.max(bounds.max[k],a[k]);}
    assert.ok(Math.abs(a[0])>=.56&&Math.abs(a[0])<=1.12,'actual lung geometry enters the aisle or coach side');
    assert.ok(a[2]>=row-.335&&a[2]<=row+.365,'growth leaves its existing seat footprint');
    assert.ok(a[1]>=1.10&&a[1]<2.90,'growth intersects floor or ceiling');
   }
  }
 }
 assert.ok(vertices>100000);t.diagnostic(JSON.stringify({posedLungVertices:vertices,bounds,unobstructedAisleWidth:1.12}));
 assert.deepEqual(busSeatIntrusionInstances({transit:{clock:10,trapAt:0},lighting:{origin:{}},interior:{active:true}}),[]);
 const fixed=clock=>busSeatIntrusionInstances({transit:{clock,trapAt:0},lighting:{origin:{}}},{reducedMotion:true}).map(p=>p.character);
 assert.deepEqual(fixed(10),fixed(15));
});
