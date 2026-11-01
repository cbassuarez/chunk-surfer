import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {EARTHFALL_CHASE_OBSTACLES as O,EARTHFALL_CHASE_FURNITURE as F,earthfallChasePropMatrix,earthfallChasePropPenetration,earthfallChaseWorldPoint,earthfallChaseLocalPoint,earthfallChaseFactors} from '../src/data/source-earthfall-chase.js';
import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from '../src/data/generated/source-earthfall-ellery-aside.js';
import {freshSourceEarthfallElleryAside as fresh,stepSourceEarthfallElleryAside as step,sourceEarthfallElleryAsideFrame as frame,sourceElleryAsideCanStand as stand,transformAsidePoint as transform} from '../src/game/source-earthfall-ellery-aside.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED as REQUIRED,sourceEarthfallElleryAsideRenderFrame as render,createSourceEarthfallElleryAsideRenderer} from '../src/render/source-earthfall-ellery-aside.js';
const jsonPack=pack=>{const b=fs.readFileSync('public/assets/'+pack);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
const packs=new Map([...new Set(O.map(p=>p.sourcePack))].map(p=>[p,jsonPack(p)]));
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const staged=(compression=0)=>{const s=fresh();s.gag.complete=true;s.chase.phase='quiet';s.chase.compression=compression;Object.assign(s,earthfallChaseWorldPoint(s,s.chase));return s;};

test('recognizable obstacles reuse native shipped meshes, source bounds and credited material packs',()=>{
 assert.ok(O.length>=25&&O.length<=40);assert.ok(new Set(O.map(p=>p.domain)).size>=10);
 for(const p of O){const j=packs.get(p.sourcePack),m=j.meshes.find(m=>m.name===p.mesh);assert.ok(m,`${p.id}: missing native ${p.mesh} in ${p.sourcePack}`);assert.ok(p.provenance&&p.sourceId);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const primitive of m.primitives){const a=j.accessors[primitive.attributes.POSITION];for(let k=0;k<3;k++){min[k]=Math.min(min[k],a.min[k]);max[k]=Math.max(max[k],a.max[k]);}}
  min.forEach((v,k)=>near(v,p.bounds.min[k],.002));max.forEach((v,k)=>near(v,p.bounds.max[k],.002));
 }
 const r=render(staged());assert.equal(r.props.filter(p=>p.asideRole==='memory-obstacle').length,O.length);assert.ok(r.props.length<230,'stable drawing remains inside the agreed instance budget');
 assert.deepEqual([...new Set(O.map(p=>p.sourcePack))].sort(),['conservatory-props.glb','source-structures.glb','stop-listening.glb']);
});
test('rendered rotation/scale and body collision share each obstacle footprint, including stacked sculpture and ear tissue',()=>{
 for(const compression of[0,.5,1]){const s=staged(compression),r=render(s),q=earthfallChaseFactors(s.chase);
  for(const p of O){const b=p.collisionBounds||p.bounds,m=earthfallChasePropMatrix(p),local=transform(m,[(b.min[0]+b.max[0])/2,0,(b.min[2]+b.max[2])/2]),world=earthfallChaseWorldPoint({x:local[0],z:local[2]},s.chase),draw=r.props.find(d=>d.sourcePropId===p.sourceId&&d.asideRole==='memory-obstacle'&&d.id.endsWith(p.id));
   assert.ok(draw,p.id);const emitted=transform(draw.matrix,[(b.min[0]+b.max[0])/2,0,(b.min[2]+b.max[2])/2]);near(emitted[0],world.x);near(emitted[2],world.z);
   assert.ok(earthfallChasePropPenetration(local[0],local[2],.22/q.xz,p)>0,p.id);assert.equal(stand(world.x,world.z,s),false,p.id+' is visible and solid');
  }
 }
 const ear=O.find(p=>p.id==='memory-ear-on-cart');assert.ok(ear.collisionBounds.max[0]<ear.bounds.max[0],'liquid outside the anatomy may not become an invisible obstruction');
 const p=transform(earthfallChasePropMatrix(ear),[ear.bounds.max[0]-.01,0,0]);assert.equal(earthfallChasePropPenetration(p[0],p[2],.01,ear),0);
});
test('copied object volumes do not clip through one another or the original room furniture',()=>{
 const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),box=p=>{const b=p.bounds,m=earthfallChasePropMatrix(p),k=p.scale??1;return{p,center:transform(m,b.min.map((v,i)=>(v+b.max[i])/2)),half:b.min.map((v,i)=>(b.max[i]-v)*k/2),axes:[[Math.cos(p.yaw||0),0,-Math.sin(p.yaw||0)],[0,1,0],[Math.sin(p.yaw||0),0,Math.cos(p.yaw||0)]]};},
  intersects=(a,b)=>[a.axes[0],a.axes[2],b.axes[0],b.axes[2],[0,1,0]].every(axis=>{const d=Math.abs(dot(a.center.map((v,i)=>v-b.center[i]),axis)),radius=p=>p.half.reduce((n,v,i)=>n+v*Math.abs(dot(p.axes[i],axis)),0);return d<radius(a)+radius(b)-.001;});
 const all=[...O,...F,...ASSET.props.filter(p=>p.bounds)].map(box);
 for(const a of O.map(box))for(const b of all)if(a.p.id!==b.p.id)assert.equal(intersects(a,b),false,`${a.p.id} clips ${b.p.id}`);
});

function walkRoute(compression){
 let s=staged(compression);const route=[{x:64.75,z:14.5},{x:64.75,z:20},{x:65,z:22},{x:68,z:20.25},{x:70,z:20.25},{x:78,z:20.25},{x:78,z:18},{x:76.5,z:13.25},{x:70,z:13.25},{x:65,z:13.25},{x:65.15,z:11.65}];
 for(const target of route){let reached=false;for(let tick=0;tick<600;tick++){const to=earthfallChaseWorldPoint(target,s.chase),dx=to.x-s.x,dz=to.z-s.z,d=Math.hypot(dx,dz);if(d<.06){reached=true;break;}s=step(s,{dt:1/60,forward:Math.min(1,d/(2.8/60)),look:{yaw:Math.atan2(dx,-dz),pitch:0}}).state;}
  assert.equal(reached,true,'ordinary walk blocked before '+JSON.stringify(target));assert.equal(s.status,'active');assert.equal(s.chase.phase,'quiet');assert.ok(Math.abs(s.feet)<.02);
 }return s;
}
test('ordinary controls complete both obstacle-threaded branches and rejoin at normal and maximum chase compression',()=>{
 for(const compression of[0,1]){const s=walkRoute(compression),p=earthfallChaseLocalPoint(s,s.chase);assert.ok(Math.hypot(p.x-65.15,p.z-11.65)<.1);assert.ok(s.clock>8);}
});
test('the actual live hunter follows its cached collision-aware path through the clutter and contacts still require presentation',()=>{
 let s=staged(),contacts=0;for(let i=0;i<1400;i++){
  const r=step(s,{dt:1/60,playerNoise:true,contactPresented:s.chase.phase==='contact'&&s.chase.contactElapsed>.7});s=r.state;
  if(r.events.some(e=>e.type==='caught'))contacts++;if(s.chase.phase==='collapse')break;
  const h=frame(s).localHush;if(h&&s.chase.phase==='chase')for(const p of O)assert.equal(earthfallChasePropPenetration(s.chase.hushX,s.chase.hushZ,.19/earthfallChaseFactors(s.chase).xz,p),0,'hunter path intersects '+p.id);
 }
 assert.ok(contacts>0);assert.ok(s.chase.compression>0);assert.ok(s.chase.path.length||s.chase.phase==='contact'||s.chase.phase==='collapse');
});
test('a save occupying a newly copied object can walk out of penetration rather than becoming trapped',()=>{
 const p=O.find(p=>p.id==='memory-street-car'),s=staged();s.x=p.x;s.z=p.z;s.yaw=Math.PI/2;let state=s;
 const before=earthfallChasePropPenetration(state.x,state.z,.22,p);for(let i=0;i<75;i++)state=step(state,{dt:1/60,forward:1}).state;
 assert.ok(earthfallChasePropPenetration(state.x,state.z,.22,p)<before);assert.ok(state.x>s.x+.5);assert.equal(state.status,'active');
});
test('compression at a rotated obstacle allows ordinary backing out but cannot drive the capsule deeper or through a wall',()=>{
 const p=O.find(p=>p.id==='memory-street-car'),s=staged(),edge=transform(earthfallChasePropMatrix(p),[p.bounds.max[0]+.220001,0,0]);s.x=edge[0];s.z=edge[2];s.chase.phase='chase';s.chase.elapsed=20;s.chase.grace=2;
 const squeezed=step(s,{dt:.25}).state,depth=state=>{const v=earthfallChaseLocalPoint(state,state.chase);return earthfallChasePropPenetration(v.x,v.z,.22/earthfallChaseFactors(state.chase).xz,p);};assert.ok(depth(squeezed)>0,'the changing room can put a formerly tangent body into slight penetration');
 const outward=Math.PI/2-p.yaw,passive=step(squeezed,{dt:.1}).state,backed=step(squeezed,{dt:.1,forward:1,look:{yaw:outward,pitch:0}}).state,deeper=step(squeezed,{dt:.1,forward:1,look:{yaw:outward+Math.PI,pitch:0}}).state;
 assert.ok(depth(backed)<depth(passive),'a normal accepted step must clear increasing compression');assert.ok(depth(deeper)<=depth(passive)+1e-7,'input into the solid cannot increase penetration');
 const wall=earthfallChaseWorldPoint({x:81.4,z:18},squeezed.chase);assert.equal(stand(wall.x,wall.z,squeezed),false,'escape permission never bypasses the physical room boundary');
});
test('readiness explicitly acquires missing original obstacle packs and repairs only the missing owning pack',async()=>{
 const obstacleMeshes=new Set(O.map(p=>p.mesh)),catalog=new Set(REQUIRED.filter(n=>!obstacleMeshes.has(n))),loads=[];
 const renderer={r3dAuthoredPropsReady:async()=>true,r3dPrepareHushBody:async()=>true,r3dHushBodyReady:()=>true},props={propMeshCatalog:()=>[...catalog],async addPropPack(url){const name=url.replace(/^assets\//,'');loads.push(name);const j=packs.get(name);assert.ok(j,'unexpected pack '+name);j.meshes.forEach(m=>catalog.add(m.name));}};
 const owner=createSourceEarthfallElleryAsideRenderer({renderer,props,resolveAsset:u=>u});assert.equal(await owner.initialize(),true);assert.deepEqual([...loads].sort(),[...packs.keys()].sort());
 catalog.delete('stop_listening_heap_b');assert.equal(owner.ready(),false);assert.equal(await owner.ensureResident(),true);assert.equal(loads.at(-1),'stop-listening.glb');assert.equal(loads.length,4);owner.dispose();
});
