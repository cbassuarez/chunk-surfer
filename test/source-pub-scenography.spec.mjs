import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {SOURCE_PUB_SCENOGRAPHY as SET,sourcePubDeckRectangles} from '../src/data/source-pub-scenography.js';
import {SOURCE_PUB,sourcePubFloorHoles} from '../src/data/source-pub.js';
import {sourcePubRenderFrame,sourcePubFallingItemPose} from '../src/render/source-pub-renderer.js';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stats=JSON.parse(read('public/assets/source-pub-scenography.stats.json')),credits=JSON.parse(read('public/assets/source-pub-scenography.credits.json'));
const doc=await new NodeIO().read(new URL('public/'+SET.asset,root).pathname),meshes=new Map(doc.getRoot().listMeshes().map(m=>[m.getName(),m]));
assert.deepEqual([...meshes.keys()].sort(),Object.values(SET.meshes).sort());assert.ok(stats.bytes<SET.maximumBytes);assert.ok(stats.triangles<SET.maximumTriangles);
assert.equal(sha(read('public/'+SET.asset)),stats.sha256);for(const[f,h]of Object.entries(credits.sourceSha256))assert.equal(sha(read(f)),h,`unchanged ${f}`);
for(const m of doc.getRoot().listMaterials()){assert.ok(m.getName().startsWith('Source Lyric / '));assert.ok(m.getBaseColorFactor().every(Number.isFinite));}
assert.ok(stats.omittedFixtures.some(f=>f.kind==='floor-finish'));assert.ok(stats.omittedFixtures.some(f=>f.kind==='ceiling-finish'));assert.ok(!stats.retainedFixtures.some(f=>['floor-finish','ceiling-finish','wall-finish'].includes(f.kind)));
// This catches an inside-out primitive helper even though positions/bounds
// still look plausible: visible cylindrical hoops need outward radial light.
let hoopNormals=0;for(const p of meshes.get(SET.meshes.cask).listPrimitives())if(p.getMaterial().getName().endsWith('dull iron')){const a=p.getAttribute('POSITION').getArray(),n=p.getAttribute('NORMAL').getArray();for(let i=0;i<a.length;i+=3)if(Math.abs(n[i+1])<.10){assert.ok(a[i]*n[i]+a[i+2]*n[i+2]>.30,'coopered cask hoops have outward visible normals');hoopNormals++;}}
assert.ok(hoopNormals>100);
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
const bounds=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],mesh=meshes.get(p.mesh);for(const prim of mesh.listPrimitives()){const a=prim.getAttribute('POSITION').getArray();for(let i=0;i<a.length;i+=3){const v=transform(p.matrix,a.slice(i,i+3));for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}}}return{min,max};};
const base={stage:0,task:0,layer:0,x:1.25,z:1.25,elapsed:2,yaw:.3,pitch:-.04,carried:null};
let floors=0,casks=0;
for(const stage of[0,1,2,3,4])for(const task of[0,2,3,4,8]){
 const state={...base,stage,task,layer:SOURCE_PUB.rounds[stage].layer},frame=sourcePubRenderFrame(state);assert.ok(frame.casks<=SET.maximumVisibleCasks);assert.ok(frame.props.filter(p=>p.cask).length<=SET.maximumVisibleCasks+2);assert.ok(!frame.props.some(p=>p.mesh==='exterior_pub_interior'));
 const O=SOURCE_PUB.room.renderAnchor;
 for(const p of frame.props.filter(p=>p.deckBounds)){
   const b=bounds(p);assert.ok(Math.abs(b.max[1]-p.deckTop)<1e-5);assert.ok(Math.abs(b.min[1]-(p.deckTop-SET.floorThickness))<1e-5);floors++;
   for(const h of sourcePubFloorHoles(state).filter(h=>h.layer===p.sourceLayer))assert.ok(b.max[0]<=O.x+h.x-h.radius+1e-5||b.min[0]>=O.x+h.x+h.radius-1e-5||b.max[2]<=O.z+h.z-h.radius+1e-5||b.min[2]>=O.z+h.z+h.radius-1e-5,'actual slab never covers the aperture');
 }
 for(const p of frame.props.filter(p=>p.cask&&!p.carried)){
   const b=bounds(p),floor=SOURCE_PUB.floor-p.sourceLayer*SOURCE_PUB.layerDrop;
   assert.ok(Math.abs(b.min[1]-(floor+(p.tier||0)*SET.cask.stackPitch))<1e-5,'cask stack rests on its deck and previous cask');
   if(p.stack==='rear'){assert.ok(b.min[0]>=O.x+14*frame.stretch+.06,'rear tower clears the actual WC front partition and bar end');assert.ok(b.max[0]<=O.x+16*frame.stretch,'rear tower stays inside the room end');}
   if(p.stack==='back'||p.stack==='bar'){const fittings=bounds(frame.props.find(f=>f.id===`source-pub-fittings-${p.sourceLayer}`));assert.ok(b.min[2]>fittings.max[2]+.20,'side casks clear the actual retained backbar/cabinet geometry');const ledger=frame.props.find(l=>l.id===`source-pub-stack-ledger-${p.sourceLayer}-${p.stack}`),lb=bounds(ledger);assert.ok(b.min[0]>=lb.min[0]-.001&&b.max[0]<=lb.max[0]+.001&&b.min[2]>=lb.min[2]&&b.max[2]<=lb.max[2],'side stack has an actual supporting ledger');}casks++;
 }
 for(const h of sourcePubFloorHoles(state)){
   const rectangles=sourcePubDeckRectangles(16*frame.stretch,5.4,h),area=rectangles.reduce((a,r)=>a+(r.x1-r.x0)*(r.z1-r.z0),0);assert.ok(Math.abs(area-(16*frame.stretch*5.4-4*h.radius*h.radius))<1e-8,'aperture removes its whole physical floor area');
 }
}
// Sample every dropped item through the real floor thickness. All vertices
// crossing the source slab lie within its aperture, and the item ends on the
// intact lower floor rather than vanishing when the prompt advances.
let crossing=0;
for(const kind of['tray','barrel'])for(let i=0;i<=120;i++){
 const state={...base,stage:kind==='tray'?2:3,task:3,layer:kind==='tray'?0:1,itemFall:{kind,elapsed:i/120*1.1,duration:1.1,fromLayer:kind==='tray'?0:1,toLayer:kind==='tray'?1:2,landing:{x:1.8*SOURCE_PUB.rounds[kind==='tray'?2:3].stretch+1.4,z:1.25}}};
 const pose=sourcePubFallingItemPose(state),frame=sourcePubRenderFrame(state),p=frame.props.find(p=>p.fallingItem);assert.ok(p&&pose);assert.ok([...p.matrix].every(Number.isFinite));
 const floor=SOURCE_PUB.floor-state.layer*SOURCE_PUB.layerDrop,hole=sourcePubFloorHoles(state).find(h=>h.layer===state.layer),mesh=meshes.get(p.mesh);
 // Use every actual vertex of both the coopered cask and bare tray.
 const points=[];for(const prim of mesh.listPrimitives()){const a=prim.getAttribute('POSITION').getArray();for(let v=0;v<a.length;v+=3)points.push(transform(p.matrix,a.slice(v,v+3)));}
 for(const v of points)if(v[1]>=floor-.16&&v[1]<=floor){assert.ok(Math.abs(v[0]-SOURCE_PUB.room.renderAnchor.x-hole.x)<hole.radius+.001&&Math.abs(v[2]-SOURCE_PUB.room.renderAnchor.z-hole.z)<hole.radius+.001,`${kind} really passes through its floor opening`);crossing++;}
 if(i===120){const minY=Math.min(...points.map(v=>v[1]));assert.ok(Math.abs(minY-(SOURCE_PUB.floor-state.itemFall.toLayer*SOURCE_PUB.layerDrop))<.002);}
}
assert.ok(crossing>10);console.log(JSON.stringify({ok:true,bytes:stats.bytes,triangles:stats.triangles,actualDecks:floors,actualCasks:casks,apertureVertexCrossings:crossing,sourcePacksUnchanged:true}));
