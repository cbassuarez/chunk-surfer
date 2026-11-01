import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C,SOURCE_ELLERY_ASIDE_CHARGES as CHARGES}from'../src/data/source-earthfall-ellery-aside.js';
import {sourceElleryAsideDust as dust}from'../src/game/source-earthfall-ellery-aside-dust.js';
import {SOURCE_ELLERY_ASIDE_ASSET as A}from'../src/data/generated/source-earthfall-ellery-aside.js';
import {freshSourceEarthfallElleryAside as fresh,normalizeSourceEarthfallElleryAside as normalize,stepSourceEarthfallElleryAside as step,sourceEarthfallElleryAsideFrame as frame,sourceElleryAsidePanelMatrix as panel,sourceElleryAsideCanStand as stand,sourceElleryAsidePieceState as pieceState,sourceElleryAsideFooting as footing,sourceElleryAsideWallLean as wallLean,transformAsidePoint as transform}from'../src/game/source-earthfall-ellery-aside.js';
import {sourceEarthfallElleryAsideRenderFrame as render}from'../src/render/source-earthfall-ellery-aside.js';
import {freshSourceEarthfall}from'../src/game/source-earthfall.js';
import {createSourceEarthfallScene}from'../src/game/source-earthfall-scene.js';
import {parseGlb}from'../tools/chunk_surfer/rebuild-tree-crowns.mjs';import{readBusAccessor as read}from'../tools/chunk_surfer/build-outskirts-bus-passage.mjs';
// These mechanics tests deliberately exercise a migrated pre-loop physical
// collapse, not a fresh quiet room. Current noise/chase delivery is below.
const demoFresh=options=>normalize({...fresh(options),version:3,id:'source-earthfall:ellery-aside-v3',gag:undefined,chase:undefined});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const advance=(s,seconds,input={})=>{const events=[];for(let t=0;t<seconds-1e-8;t+=1/120){const r=step(s,{dt:1/120,...input});s=r.state;events.push(...r.events);}return{state:s,events};};
const bytes=fs.readFileSync('public/assets/source-earthfall-ellery-aside.glb'),pack=parseGlb(bytes);
function blocks(origin,target,a,b,c){const d=target.map((v,i)=>v-origin[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),p=[d[1]*v[2]-d[2]*v[1],d[2]*v[0]-d[0]*v[2],d[0]*v[1]-d[1]*v[0]],det=u.reduce((s,n,i)=>s+n*p[i],0);if(Math.abs(det)<1e-9)return false;const inv=1/det,t=origin.map((n,i)=>n-a[i]),s=t.reduce((n,x,i)=>n+x*p[i],0)*inv;if(s<0||s>1)return false;const q=[t[1]*u[2]-t[2]*u[1],t[2]*u[0]-t[0]*u[2],t[0]*u[1]-t[1]*u[0]],w=d.reduce((s,n,i)=>s+n*q[i],0)*inv;if(w<0||s+w>1)return false;const f=v.reduce((s,n,i)=>s+n*q[i],0)*inv;return f>1e-6&&f<1-1e-5;}
const triangles=pack.json.meshes.filter(m=>m.extras?.panel).flatMap(m=>m.primitives.flatMap(p=>{const v=read(pack,p.attributes.POSITION),i=read(pack,p.indices),rows=[];for(let k=0;k<i.length;k+=3)rows.push(i.slice(k,k+3).map(j=>v.slice(j*3,j*3+3)));return rows;}));
test('the actual remembered room preserves native geometry/material sources and uses bounded bonded construction pieces',()=>{
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),A.packSHA);assert.ok(bytes.length<2.5e6);assert.ok(A.panels.length>70&&A.panels.length<130);assert.equal(A.doors.length,3);assert.ok(A.props.some(p=>p.id==='dock-chandelier-frame'));assert.ok(A.props.some(p=>p.originalMesh==='scene_dock_dispatch_desk'));assert.equal(pack.json.meshes.filter(m=>m.extras?.preservedGeometry).length,12);assert.ok(pack.json.materials.some(m=>m.name==='municipal glazed brick'));assert.ok(pack.json.materials.some(m=>m.extras?.renRole==='missing-man-core'));
});
test('the retained legacy room pack has clear uploaded door apertures and original blind-return masonry',()=>{
 const origin=[C.spawn.x,C.eyeHeight,C.spawn.z];
 for(const d of A.doors){const target=[d.x,1.25,d.z];assert.equal(triangles.some(t=>blocks(origin,target,...t)),false,`${d.id}: a shell wall hides its real frame`);
 const back=[d.x+d.outward[0]*(d.blindDepth+.1),1.25,d.z+d.outward[2]*(d.blindDepth+.1)];assert.ok(triangles.some(t=>blocks(target,back,...t)),`${d.id}: the apparent dead end has no real back wall`);}
});
test('ordinary movement/look remain available and all construction keeps rigid dimensions through bond loss and consumption',()=>{
 let s=advance(fresh({runId:'aside'}),1,{forward:1,look:{yaw:-.5,pitch:-.2}}).state;assert.ok(Math.hypot(s.x-C.spawn.x,s.z-C.spawn.z)>.5);near(s.pitch,-.2);
 const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
 for(const t of[0,3,8,10,12,14,16,18,20])for(const p of A.panels){
  const k=pieceState(p.id,t),m=k.matrix,axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];assert.ok(m.every(Number.isFinite));for(let i=0;i<3;i++){near(Math.hypot(...axes[i]),1);for(let j=i+1;j<3;j++)near(dot(axes[i],axes[j]),0);}
  const a=p.bounds.min,b=p.bounds.max,ta=transform(m,a),tb=transform(m,b);near(Math.hypot(...a.map((v,i)=>v-b[i])),Math.hypot(...ta.map((v,i)=>v-tb[i])));
 }
 const a=render({...demoFresh(),elapsed:14}),b=render({...demoFresh(),elapsed:14,yaw:2,pitch:-1});assert.deepEqual(a.props.map(p=>[p.id,p.matrix]),b.props.map(p=>[p.id,p.matrix]),'geometry may not follow camera');
});
test('the demolition runs in the footage order: charges, a pause, the core, then the walls',()=>{
 // Charges: the ridge bearings first, then the piers in a quick ripple, all inside half a second.
 assert.deepEqual(CHARGES.slice(0,2).map(c=>c.core),[true,true]);assert.equal(CHARGES.length,14);
 for(let i=1;i<CHARGES.length;i++)near(CHARGES[i].at-CHARGES[i-1].at,C.chargeRipple);
 assert.ok(CHARGES[0].at===C.chargeAt&&CHARGES.at(-1).at<C.chargeAt+.5);
 // The pause: no structural piece has moved by the moment the core goes.
 assert.ok(C.coreAt-CHARGES.at(-1).at>=.4,'nothing moves for a beat after the last charge');
 for(const p of A.panels)assert.deepEqual(panel(p.id,C.coreAt-1e-3),panel(p.id,0),`${p.id} moved during the charges or the pause`);
 // The core first: the central roof bays, then the central floor, then any wall.
 const states=A.panels.map(p=>pieceState(p.id,0)),first=kind=>Math.min(...states.filter(s=>s.kind===kind).map(s=>s.releaseAt));
 assert.ok(first('timber')<first('floor')&&first('floor')<first('masonry'));
 const dropped=t=>A.panels.filter(p=>p.kind==='timber').filter(p=>pieceState(p.id,t).center[1]<p.pivot[1]-.3).map(p=>p.id);
 assert.ok(dropped(C.coreAt+.6).length>0&&dropped(C.coreAt+.6).every(id=>{const p=A.panels.find(q=>q.id===id);return Math.abs(p.pivot[0]-C.center.x)<4;}),'only the middle of the roof has gone');
 // Walls in the order their bases were cut, each hanging nearly still and then going.
 assert.deepEqual(Object.entries(C.wallsAt).sort((a,b)=>a[1]-b[1]).map(e=>e[0]),['north','west','east','south']);
 for(const host of['north','west','east','south']){const at=C.wallsAt[host],lean=t=>wallLean(host,t).angle;assert.equal(lean(at),0);assert.ok(lean(at+.5)<.03);assert.ok(lean(at+2.4)>.35);}
 // Sound sources follow the same order and each is anchored where it happens.
 const sources=frame({...demoFresh({runId:'cue'}),elapsed:C.fadeStart}).materialEvents;
 assert.deepEqual(sources.map(e=>e.type+(e.host?':'+e.host:'')),['charges','roof-bearing','floor-bond','masonry-bond:north','masonry-bond:south']);
 assert.equal(sources[0].charges.length,CHARGES.length);assert.ok(sources.every(e=>Number.isFinite(e.position.x)));assert.equal(new Set(sources.map(e=>e.id)).size,sources.length);
});

test('charges show only as dust jets, then dust leaves every wall base and reaches the arrival before black',()=>{
 const at=t=>render({...demoFresh(),elapsed:t});
 assert.equal(at(C.chargeAt-.01).props.filter(p=>p.asideRole==='dust').length,0);
 for(const c of CHARGES){const jets=dust(c.at+.3).puffs.filter(p=>p.id.startsWith(`jet:${c.id}:`));assert.equal(jets.length,3);
  const out=jets.at(-1).center;assert.ok((out[0]-c.position.x)*c.normal[0]+(out[2]-c.position.z)*c.normal[2]>1,`${c.id}: its jet leaves the pier into the room`);}
 const surge=dust(C.wallsAt.south+.5).puffs.filter(p=>p.kind==='surge');assert.deepEqual([...new Set(surge.map(p=>p.id.split(':')[1]))].sort(),['east','north','south','west']);
 const eye=[C.spawn.x,C.eyeHeight,C.spawn.z];assert.equal(dust(C.wallsAt.south,eye).cover,0,'the walls are seen coming in');
 const s=advance(demoFresh(),C.fadeStart).state;assert.equal(frame(s).dust.cover,1,'by black the dust has reached him');
 // No flash: once the charges fire no lamp ever brightens, and dust is never construction.
 let last=Infinity;for(let t=C.chargeAt;t<=C.fadeEnd;t+=1/60){const total=at(t).lights.reduce((n,l)=>n+l.intensity,0);assert.ok(total<=last+.08,`a lamp brightened at ${t.toFixed(2)}s`);last=Math.min(last,total);}
 assert.ok(at(5).props.filter(p=>p.asideRole==='dust').every(p=>p.structural===false&&/^earthfall_dust_(billow_|puff)/.test(p.mesh)));
});

test('foot contact uses transformed finite floor pieces and carries the body as those pieces sag',()=>{
 const start=demoFresh({runId:'floor'});assert.ok(footing(start.x,start.z,0));assert.equal(footing(C.room.minX-5,C.room.minZ-5,14),null);
 const resting=advance(start,5).state,contact=footing(resting.x,resting.z,5);assert.ok(contact);near(resting.feet,contact.y,.01);assert.ok(resting.feet<-.3&&resting.feet>-1,'the bay under him sags toward the hole and he goes with it');
});
test('retained door clocks earn bounded distinct physical cues, freeze and survive reload without repeating prior events',()=>{
 let r=advance(demoFresh({runId:'doors'}),7),s=r.state;assert.ok(r.events.some(e=>e.type==='closed'));assert.ok(r.events.some(e=>e.type==='opening-start'));assert.equal(new Set(r.events.map(e=>e.id)).size,r.events.length);
 for(const guard of[{paused:true},{protected:true},{assetsReady:false}])assert.deepEqual(step(s,{dt:.2,forward:1,...guard}).state,normalize(s));
 const restored=normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(step(s,{dt:.2,side:1}),step(restored,{dt:.2,side:1}));assert.ok(step(restored,{dt:.2}).events.every(e=>!s.receipts.some(old=>old.id===e.id)));
});
test('the retained physical-collapse sequence brings the room down once with its original bounded black endpoint',()=>{
 const r=advance(demoFresh(),C.duration+.2,{forward:1,side:1});assert.equal(r.state.status,'completed');assert.equal(r.state.consumed,true);assert.equal(r.events.filter(e=>e.type==='aside-complete').length,1);const f=render(r.state);assert.equal(f.blackoutAlpha,1);assert.equal(f.props.length,0);assert.deepEqual(step(r.state,{dt:.2}).state,r.state);
});
test('the current parent holds quiet, then noise, presented catches and collapse resume the existing fall exactly once',async()=>{
 let noisy=false,lastAsideDraw=null;const drawn=[],sounds=[],presented=new Set(),acceptedCounts=new Map(),checkpoints=[],traces=[];
 const renderer={initialize:async()=>true,ready:()=>true,render(s){drawn.push(['fall',s.phase]);return true;},renderAside(s){lastAsideDraw=frame(s);drawn.push(['aside',s.elapsed]);return true;},dispose(){}},audio={ready:async()=>true,prepareAside:async()=>true,stop(){},stopAside(){},update(f){sounds.push(...f.events.filter(e=>e.age<1/120+1e-5).map(e=>e.type));},updateAside(){}};
 // This is an after-render host protocol proof, not GPU/player validation.
 const create=checkpoint=>createSourceEarthfallScene({checkpoint,renderer,audio,getPlayerNoise:(_dt,{armed})=>noisy&&armed,
  onCheckpoint:(value,meta)=>checkpoints.push({value:JSON.parse(JSON.stringify(value)),reason:meta.reason}),onTrace:e=>traces.push(e),
  onHushContact:({eventId,elapsed,checkpoint})=>{assert.equal(lastAsideDraw.localHush?.eventId,eventId,'the parent asks only after rendering that contact');if(elapsed<.62)return false;
   assert.equal(checkpoint.elleryAside.chase.injuryApplied,true);assert.equal(checkpoint.elleryAside.chase.presentedEventId,eventId);presented.add(eventId);acceptedCounts.set(eventId,(acceptedCounts.get(eventId)||0)+1);return true;}});
 let scene=create(freshSourceEarthfall({runId:'aside-scene'}));await scene.initialize();scene.key({key:'w'});for(let i=0;i<30;i++)scene.update(1/120);scene.keyup({key:'w'});
 for(let i=0;i<1500&&!scene.view().aside;i++)scene.update(1/120);assert.ok(scene.view().aside);scene.render();assert.equal(scene.allowsLook,true);scene.lookBy(.3,-.2);scene.key({key:'a'});for(let i=0;i<500;i++)scene.update(1/120);scene.keyup({key:'a'});const saved=scene.serialize();scene.pause();for(let i=0;i<40;i++)scene.update(1/60);assert.deepEqual(scene.serialize(),saved);
 scene=create(JSON.parse(JSON.stringify(saved)));await scene.initialize();assert.ok(scene.view().aside);assert.deepEqual(scene.serialize().elleryAside,saved.elleryAside);
 for(let i=0;i<25*60;i++){scene.update(1/60);scene.render();}assert.equal(scene.serialize().elleryAside.elapsed,0);assert.equal(scene.serialize().elleryAside.chase.phase,'quiet');assert.equal(scene.serialize().impactPass,0,'quiet exploration cannot advance the fall');
 noisy=true;let resumed=null,reloadedPresented=false;for(let i=0;i<90*60&&!resumed;i++){
  scene.update(1/60);scene.render();const s=scene.serialize();
  if(!reloadedPresented&&s.elleryAside?.chase.presentedEventId){
   const receipt=s.elleryAside.chase.presentedEventId,before=s.elleryAside.chase.catches;scene.exit();scene=create(JSON.parse(JSON.stringify(s)));await scene.initialize();scene.render();
   assert.equal(acceptedCounts.get(receipt),1,'reload of an acknowledged render must not ask the host to apply that injury twice');
   assert.equal(scene.serialize().elleryAside.chase.catches,before,'the saved host receipt precedes reducer consequence delivery');reloadedPresented=true;
  }
  if(s.impactPass===1&&s.phase==='falling')resumed=s;
 }
 assert.ok(resumed);assert.equal(resumed.elleryAsideCompleted,true);assert.equal(resumed.elleryAside.consumed,true);near(resumed.feet,-resumed.velocityY*C.resumeFallSeconds,.001);
 assert.ok(presented.size>0,'the real parent must accept a rendered contact before worsening a catch');assert.equal(reloadedPresented,true);assert.ok([...acceptedCounts.values()].every(count=>count===1));assert.ok(resumed.elleryAside.chase.catches>0);assert.equal(resumed.elleryAside.chase.injuryApplied,true);assert.equal(resumed.elleryAside.exitKind,'collapse');
 assert.equal(traces.filter(e=>e.type==='aside-event'&&e.event.type==='chase-start').length,1);assert.equal(traces.filter(e=>e.type==='aside-event'&&e.event.type==='collapse-start').length,1);assert.ok(checkpoints.some(e=>e.reason==='hush-contact-pending'));assert.ok(checkpoints.some(e=>e.reason==='aside-consumed-before-second-impact'));
 for(let i=0;i<300&&scene.serialize().phase!=='landed';i++){scene.update(1/120);scene.render();}const end=scene.serialize();assert.equal(end.phase,'landed');assert.equal(end.receipts.filter(e=>e.type==='catch').length,1);assert.equal(end.receipts.filter(e=>e.type==='catch-return').length,1);assert.equal(end.receipts.filter(e=>e.type==='land-return').length,1);assert.equal(scene.view().aside,null);assert.ok(sounds.includes('catch-return'),'second impact must earn a distinct audible receipt');
});


test('a legacy open door admits its original short return and blind back wall',()=>{
 const d=A.doors.find(d=>d.id==='dock-foyer-service');assert.equal(d.x,74.25);assert.ok(d.blindStart<0,'the actual one-metre recessed frame needs a supported throat');
 assert.equal(stand(73.5,d.z,{elapsed:0}),true);assert.equal(stand(d.x+.6,d.z,{elapsed:0}),true);assert.equal(stand(d.x+d.blindDepth-.1,d.z,{elapsed:0}),false);
 let s={...demoFresh(),x:73,z:d.z,yaw:Math.PI/2};s=advance(s,1,{forward:1}).state;assert.ok(s.x>75,'a wall-sized invisible boundary may not replace an open real door');assert.ok(s.x<d.x+d.blindDepth-C.bodyRadius+1e-6);
});

test('native furnishings retain exact vertices, normals, UVs and referenced material-image bytes',()=>{
 const base=parseGlb(fs.readFileSync('public/assets/conservatory-props.glb')),byName=new Map(base.json.meshes.map(m=>[m.name,m]));
 const imageSHA=(p,i)=>{const image=p.json.images[p.json.textures[i].source],v=p.json.bufferViews[image.bufferView];return crypto.createHash('sha256').update(p.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex');};
 for(const mesh of pack.json.meshes.filter(m=>m.extras?.preservedGeometry)){
  const original=byName.get(mesh.extras.sourceMesh);assert.ok(original);assert.equal(mesh.primitives.length,original.primitives.length);
  for(let i=0;i<mesh.primitives.length;i++){
   const a=original.primitives[i],b=mesh.primitives[i];for(const attr of['POSITION','NORMAL','TEXCOORD_0'])assert.deepEqual(read(base,a.attributes[attr]),read(pack,b.attributes[attr]),`${mesh.name}:${attr}`);assert.deepEqual(read(base,a.indices),read(pack,b.indices));
   const ma=base.json.materials[a.material],mb=pack.json.materials[b.material];assert.equal(mb.name,ma.name);assert.deepEqual(mb.pbrMetallicRoughness?.baseColorFactor,ma.pbrMetallicRoughness?.baseColorFactor);assert.equal(mb.pbrMetallicRoughness?.roughnessFactor,ma.pbrMetallicRoughness?.roughnessFactor);
   for(const role of['baseColorTexture','metallicRoughnessTexture']){const x=ma.pbrMetallicRoughness?.[role],y=mb.pbrMetallicRoughness?.[role];if(x)assert.equal(imageSHA(base,x.index),imageSHA(pack,y.index));}
   for(const role of['normalTexture','occlusionTexture','emissiveTexture'])if(ma[role])assert.equal(imageSHA(base,ma[role].index),imageSHA(pack,mb[role].index));
  }
 }
});

async function residencyFixture(){
 const {createSourceEarthfallElleryAsideRenderer,SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED:required}=await import('../src/render/source-earthfall-ellery-aside.js'),catalog=new Set(required),calls=[];let gate=null,packLoads=0;
 const renderer={r3dBasePropsReady:async()=>true,r3dAuthoredPropsReady:async()=>true,r3dSetPlan:(...args)=>calls.push(['plan',args]),r3dFrame:(...args)=>{calls.push(['frame',args]);return true;},r3dSetProps(){},r3dSetLocalLights(){},r3dSetSourceScene(){},r3dSetLightingContext(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}};
 const props={propMeshCatalog:()=>[...catalog],async addPropPack(){packLoads++;if(gate)await gate;for(const name of required)catalog.add(name);}};
 const owner=createSourceEarthfallElleryAsideRenderer({renderer,props});await owner.initialize();owner.render({...fresh(),elapsed:5});
 return{owner,catalog,calls,loads:()=>packLoads,hold(value){gate=value;}};
}
test('missing unique aside construction freezes readiness and retains the last native frame through one deferred repair',async()=>{
 const h=await residencyFixture(),draws=h.calls.filter(c=>c[0]==='frame').length;let release;h.hold(new Promise(r=>release=r));h.catalog.delete(A.panels[0].mesh);
 assert.equal(h.owner.ready(),false);assert.equal(h.owner.render({...fresh(),elapsed:6}),true);assert.equal(h.owner.render({...fresh(),elapsed:6}),true);await Promise.resolve();assert.equal(h.loads(),1);assert.equal(h.owner.ready(),false);assert.equal(h.calls.filter(c=>c[0]==='frame').length,draws,'no incomplete or loading-black frame replaces the actual last frame');
 release();await h.owner.ensureResident();assert.equal(h.owner.ready(),true);assert.equal(h.owner.render({...fresh(),elapsed:6}),true);assert.equal(h.calls.filter(c=>c[0]==='frame').length,draws+1);assert.equal(h.owner.diagnostics().frame.elapsed,6);
});
test('disposing during deferred aside residency repair cannot reacquire the plan or redraw the retired scene',async()=>{
 const h=await residencyFixture();let release;h.hold(new Promise(r=>release=r));h.catalog.delete(A.panels[1].mesh);const restoring=h.owner.ensureResident();await Promise.resolve();h.owner.dispose();const plans=h.calls.filter(c=>c[0]==='plan').length,draws=h.calls.filter(c=>c[0]==='frame').length;release();assert.equal(await restoring,false);assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(fresh()),false);assert.equal(h.calls.filter(c=>c[0]==='plan').length,plans);assert.equal(h.calls.filter(c=>c[0]==='frame').length,draws);
});
