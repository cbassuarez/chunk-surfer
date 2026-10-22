import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourcePubRenderFrame,createSourcePubRenderer} from '../src/render/source-pub-renderer.js';
import {SOURCE_PUB,sourcePubFloorHeight,sourcePubStretch} from '../src/data/source-pub.js';
import {SOURCE_PUB_SCENOGRAPHY_ASSET,SOURCE_PUB_SCENOGRAPHY_MESHES as MESH,SOURCE_PUB_SCENOGRAPHY as SET} from '../src/data/source-pub-scenography.js';
import {sourcePubCanOccupy,stepSourcePub,freshSourcePubCheckpoint} from '../src/game/source-pub.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import * as R3 from '../src/render/r3d.js';
const initial=()=>({...freshSourcePubCheckpoint({returnPose:{x:1,y:2}}),status:'active',elapsed:1.25,yaw:.3});
const b=readFileSync(new URL('../public/assets/pub-characters.glb',import.meta.url)),asset=parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const door=doorAssembly('public-glazed-pair',{activeLeaves:'all'});
const staticPacks={'source-pub-scenography.glb':Object.values(MESH),'conservatory-doors.glb':[door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean),'pub-quest-props.glb':['pub_service_tray_loaded','pub_service_tray_empty','pub_bottle_opener','pub_order_book']};
function fixture({catalog=[],skinned=[],loadGate=null,baseGate=null,omit=[],rejectPack=null}={}){
 let rejectedPack=rejectPack;const calls=[],loaded=new Set(catalog),characters=new Set(skinned),renderer=Object.fromEntries(Object.keys(R3).filter(name=>typeof R3[name]==='function').map(name=>[name,(...args)=>calls.push({name,args})]));
 if(baseGate)renderer.r3dBasePropsReady=async()=>{calls.push({name:'r3dBasePropsReady',args:[]});return await baseGate;};
 const install=async(url,character)=>{const name=String(url).split('/').at(-1);calls.push({name:character?'addCharacterPack':'addPropPack',args:[url]});if(loadGate)await loadGate;if(rejectedPack===name)throw Error(`failed ${name}`);const meshes=character?asset.entries.map(entry=>entry.name):staticPacks[name];for(const mesh of meshes)if(!omit.includes(mesh)){loaded.add(mesh);if(character)characters.add(mesh);}};
 const props={propMeshCatalog:()=>[...loaded],characterStats:()=>({meshes:[...characters]}),addPropPack:url=>install(url,false),addCharacterPack:url=>install(url,true),setPressureInstances:instances=>calls.push({name:'setPressureInstances',args:[instances]})};
 let released=0;const owner=createSourcePubRenderer({renderer,props,resolveAsset:path=>'fixture:'+path,onRelease:()=>{released++;calls.push({name:'hostRestore',args:[]});}});return{owner,calls,loaded,reject:name=>{rejectedPack=name;},released:()=>released};
}
test('five cold rounds use selective strata and bounded cask stacks, with Iona present once',()=>{
 for(let stage=0;stage<SOURCE_PUB.rounds.length;stage++){
  const state={...initial(),stage,layer:SOURCE_PUB.rounds[stage].layer},frame=sourcePubRenderFrame(state);assert.equal(frame.layers,3);assert.equal(frame.copies,1);assert.equal(frame.stretch,sourcePubStretch(state));
  assert.ok(!frame.props.some(p=>p.mesh==='exterior_pub_interior'||p.mesh==='pub_warm_interior'));
  assert.equal(frame.props.filter(p=>p.pubActorId==='pub-bartender-iona').length,1);assert.equal(frame.props.filter(p=>p.pubActorId).length,stage<2?3:1);
  assert.ok(frame.casks>=80);assert.ok(frame.casks<=SET.maximumVisibleCasks);assert.ok(frame.props.filter(p=>p.cask).length<=SET.maximumVisibleCasks+2);
  assert.equal(frame.props.filter(p=>p.mesh===MESH.fittings).length,3);assert.ok(frame.props.filter(p=>p.mesh===MESH.deck).length>=3);
  assert.ok(frame.lights.length>=3);for(const l of frame.lights)assert.ok(l.color[2]>l.color[0],'cold motivated local light');
  for(const p of frame.props)assert.ok([...p.matrix].every(Number.isFinite),p.id);
 }
});
test('Iona has a visible local practical at every stretch and nearest lamps follow the actual falling eye',()=>{
 for(let stage=0;stage<5;stage++){
  const layer=SOURCE_PUB.rounds[stage].layer,stretch=SOURCE_PUB.rounds[stage].stretch,state={...initial(),stage,layer,x:11.3*stretch,z:2.5},frame=sourcePubRenderFrame(state);
  const lamp=frame.props.find(p=>p.id===`source-pub-practical-${layer}-iona`),light=frame.lights.find(l=>l.id===`source-pub-cold-${layer}-iona`);assert.ok(lamp&&light);assert.ok(Math.hypot(lamp.x-(SOURCE_PUB.room.renderAnchor.x+11.3*stretch),lamp.z-SOURCE_PUB.room.renderAnchor.z-3.9)<1e-5);assert.ok(frame.lights.length<=8);
 }
 const frame=sourcePubRenderFrame({...initial(),stage:3,task:4,layer:1,x:6.84,z:1.25,fall:{elapsed:1.10,duration:1.35,fromLayer:1,toLayer:2,landing:{x:6.84,z:1.25},origin:{x:5.8,z:1.25},kind:'player'}});
 assert.ok(frame.lights.some(l=>l.id.startsWith('source-pub-cold-2-')),'destination lamps survive the common eight-light limit');
 const d=l=>(l.x-frame.eye[0])**2+(l.y-frame.eye[1])**2+(l.z-frame.eye[2])**2;for(let i=1;i<frame.lights.length;i++)assert.ok(d(frame.lights[i])>=d(frame.lights[i-1]));
});
test('stack worklamps illuminate every camera-facing cask tier from the genuine late return pose',()=>{
 const bytes=readFileSync(new URL('../public/assets/source-pub-scenography.glb',import.meta.url)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),bin=bytes.subarray(28+bytes.readUInt32LE(12));
 const read=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],out=[];for(let n=0;n<a.count;n++)for(let k=0;k<3;k++)out.push(bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||12)+k*4));return out;};
 const cask=json.meshes.find(m=>m.name===MESH.cask),surfaces=cask.primitives.filter(p=>!/iron|recess/.test(json.materials[p.material].name)).map(p=>({positions:read(p.attributes.POSITION),normals:read(p.attributes.NORMAL)}));
 for(const stage of[0,1,2,3,4])for(const[stack,at]of[['bar',9.4],['back',4.5]]){
  const layer=SOURCE_PUB.rounds[stage].layer,stretch=SOURCE_PUB.rounds[stage].stretch,frame=sourcePubRenderFrame({...initial(),stage,layer,x:stage===4?52.2265:at*stretch,z:stage===4?1.65:1.25});
  const fixture=frame.props.find(p=>p.stackWorklamp&&p.stack===stack&&p.sourceLayer===layer),light=frame.lights.find(l=>l.stackWorklamp&&l.stack===stack&&l.sourceLayer===layer);assert.ok(fixture&&light,'high worklamp survives nearest-eight selection at its own stack');
  const floor=SOURCE_PUB.floor-layer*SOURCE_PUB.layerDrop;assert.ok(fixture.y-floor>=4.5-1e-5&&fixture.y-floor<=11+1e-5);assert.ok(Math.abs(fixture.x-light.x)<1e-5&&Math.abs(fixture.z-light.z)<1e-5&&Math.abs(fixture.y+.025-light.y)<1e-5,'light is motivated by the actual visible fixture');assert.ok(frame.lights.length<=8);assert.ok(light.radius<=14&&light.intensity<=1.85);
  const tierSamples=frame.props.filter(p=>p.cask&&p.stack===stack&&(stage===4||p.sourceLayer===layer));
  for(const top of tierSamples){let strongest=0;
   const eye=stage===4?[SOURCE_PUB.room.renderAnchor.x+52.2265,floor+SOURCE_PUB.eyeHeight,SOURCE_PUB.room.renderAnchor.z+1.65]:frame.eye;
   for(const s of surfaces)for(let i=0;i<s.positions.length;i+=3){const m=top.matrix,p=[0,1,2].map(a=>m[a]*s.positions[i]+m[a+4]*s.positions[i+1]+m[a+8]*s.positions[i+2]+m[a+12]),n=[0,1,2].map(a=>m[a]*s.normals[i]+m[a+4]*s.normals[i+1]+m[a+8]*s.normals[i+2]);
    const toEye=p.map((v,k)=>eye[k]-v),eyeDistance=Math.hypot(...toEye),facing=n.reduce((sum,v,k)=>sum+v*toEye[k]/eyeDistance,0);if(facing<.25)continue;
    let irradiance=0;for(const lamp of frame.lights){const d=[lamp.x-p[0],lamp.y-p[1],lamp.z-p[2]],distance=Math.hypot(...d),lambert=Math.max(0,n.reduce((sum,v,k)=>sum+v*d[k]/distance,0)),attenuation=Math.max(0,1-distance/lamp.radius)**2;irradiance+=lambert*attenuation*lamp.intensity;}
    strongest=Math.max(strongest,irradiance);
   }
   assert.ok(strongest>.035,`${stage}/${stack}/layer${top.sourceLayer}/tier${top.tier} has a locally lit camera-facing stave from the actual return side (${strongest})`);
  }
 }
});
test('every carried service object and fallen order remains a physical object at its actual stratum',()=>{
 for(const carried of['waters','empty-tray','barrel']){
  const frame=sourcePubRenderFrame({...initial(),stage:3,layer:1,carried}),p=frame.props.find(p=>p.carried);assert.ok(p);assert.equal(p.mesh,carried==='barrel'?MESH.cask:carried==='waters'?'pub_service_tray_loaded':MESH.emptyTray);assert.ok(p.y<frame.eye[1]);
  assert.ok(Math.abs(Math.hypot(p.matrix[0],p.matrix[2])-1)<1e-6,'a carried cask retains its floor-level size');
 }
 for(const kind of['tray','barrel']){const frame=sourcePubRenderFrame({...initial(),stage:3,layer:2,fallenItem:{kind,layer:2,x:8.24,z:1.25}}),p=frame.props.find(p=>p.fallenItem);assert.ok(p);assert.ok(p.y<-14);assert.ok(!frame.props.some(p=>p.carried));}
});
test('renderer reuses the supplied context, loads isolated cold scenery and releases ownership once',async()=>{
 const h=fixture();assert.equal(h.owner.render(initial()),false);await h.owner.initialize();assert.equal(h.owner.ready(),true);
 const packs=h.calls.filter(c=>c.name==='addCharacterPack'||c.name==='addPropPack').map(c=>c.args[0]);assert.ok(packs.includes('fixture:'+SOURCE_PUB_SCENOGRAPHY_ASSET));assert.ok(!packs.some(p=>/conservatory-props|hospitality|vigil-characters/.test(p)));
 const plan=h.calls.find(c=>c.name==='r3dSetPlan');assert.ok(plan);assert.equal(plan.args[1],256);for(let i=0;i<plan.args[0].length;i+=4)assert.deepEqual([...plan.args[0].slice(i,i+3)],[0,0,0],'no retained opaque plan floor or ceiling can close the aperture');
 assert.equal(h.owner.render(initial()),true);assert.ok(h.calls.some(c=>c.name==='r3dSetProps'&&c.args[0].some(p=>p.pubActorId==='pub-bartender-iona')));
 assert.equal(h.owner.dispose(),true);assert.equal(h.owner.dispose(),false);assert.equal(h.released(),1);assert.equal(h.calls.at(-1).name,'hostRestore');assert.equal(h.owner.render(initial()),false);
 const source=readFileSync(new URL('../src/render/source-pub-renderer.js',import.meta.url),'utf8');assert.doesNotMatch(source,/getContext\(|new\s+(?:WebGLRenderer|Worker)|requestAnimationFrame\(/);
});
test('actual fall state drives r3d camera floor continuously while horizontal crossing and look stay simulation-owned',async()=>{
 const h=fixture();await h.owner.initialize();
 let state={...initial(),stage:2,task:3,layer:0,x:4,z:1.25,yaw:1.2,pitch:-.45,fall:{elapsed:0,duration:1.35,fromLayer:0,toLayer:1,landing:{x:5.04,z:1.25},origin:{x:4,z:1.25},kind:'player'}};
 let previous=Infinity,frames=0;
 for(let i=0;i<109;i++){
  state=stepSourcePub(state,{dt:1.35/108,look:{yaw:1.2+i*.001,pitch:-.45}}).state;const frame=sourcePubRenderFrame(state);h.owner.render(state);
  const r=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.ok(Math.abs(r.floorH-sourcePubFloorHeight(state))<1e-9);assert.ok(Math.abs(frame.eye[1]-SOURCE_PUB.eyeHeight-r.floorH)<1e-9);
  assert.ok(frame.eye[1]<=previous+1e-6);previous=frame.eye[1];assert.equal(frame.eye[0],SOURCE_PUB.room.renderAnchor.x+state.x);assert.equal(frame.eye[2],SOURCE_PUB.room.renderAnchor.z+state.z);assert.equal(frame.yaw,state.yaw);frames++;
 }
 assert.equal(state.layer,1);assert.ok(previous<-5);assert.equal(frames,109);assert.ok(h.calls.filter(c=>c.name==='r3dSnapCameraOnNextFrame').length>=108,'scripted physical fall bypasses a second walking-camera height filter');h.owner.dispose();
});
test('selective cold fittings still agree with furniture collision at all five stretches',()=>{
 for(let stage=0;stage<5;stage++){
  const frame=sourcePubRenderFrame({...initial(),stage}),m=frame.props.find(p=>p.id==='source-pub-fittings-0').matrix;
  for(const f of SOURCE_PUB.furniture){const b=f.bounds,local=[(b.z0+b.z1)/2+32,0,-(b.x0+b.x1)/2],x=m[0]*local[0]+m[8]*local[2]+m[12]-SOURCE_PUB.room.renderAnchor.x,z=m[2]*local[0]+m[10]*local[2]+m[14]-SOURCE_PUB.room.renderAnchor.z;assert.equal(sourcePubCanOccupy(x,z,{stage,layer:0,task:0}),false,f.id);}
 }
});
test('actual anatomical Iona and first-table vertices stay finite without patron multiplication',()=>{
 let vertices=0;
 for(let stage=0;stage<5;stage++)for(const instance of sourcePubRenderFrame({...initial(),stage,layer:SOURCE_PUB.rounds[stage].layer,elapsed:stage*17.3}).props.filter(p=>p.character)){
  const entry=asset.entries.find(e=>e.name===instance.mesh),pose=sampleCharacterPose(asset,entry,instance.character);assert.ok([...pose.bones].every(Number.isFinite));assert.equal(instance.noShadow,undefined);
  for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++){
   const point=[0,0,0];for(let a=0;a<3;a++)for(let slot=0;slot<4;slot++){const at=p.joints[v*4+slot]*16,w=p.weights[v*4+slot];point[a]+=w*(pose.bones[at+a]*p.positions[v*3]+pose.bones[at+a+4]*p.positions[v*3+1]+pose.bones[at+a+8]*p.positions[v*3+2]+pose.bones[at+a+12]);}
   const m=instance.matrix,world=[0,1,2].map(a=>m[a]*point[0]+m[a+4]*point[1]+m[a+8]*point[2]+m[a+12]);assert.ok(world.every(Number.isFinite));assert.ok(world.every(n=>Math.abs(n)<200));vertices++;
  }
 }
 assert.ok(vertices>50000);
});
test('static anatomical fallback names do not replace a loaded skin palette',async()=>{const h=fixture({catalog:asset.entries.map(e=>e.name)});await h.owner.initialize();assert.equal(h.calls.filter(c=>c.name==='addCharacterPack').length,1);h.owner.dispose();});
test('the adapter keeps the shared material/depth/skin/dither path and motivated cold lights',async()=>{
 const h=fixture();await h.owner.initialize();h.owner.render(initial());const scene=h.calls.find(c=>c.name==='r3dSetSourceScene').args[0],frame=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.equal(scene.look.roomMemoryActive,true);assert.equal(frame.textSpace,true);assert.equal(frame.sourceVoidPhysical,false);
 const source=readFileSync(new URL('../src/render/source-pub-renderer.js',import.meta.url),'utf8');for(const name of new Set([...source.matchAll(/renderer\.(r3d\w+)/g)].map(m=>m[1])))assert.equal(typeof R3[name],'function',name);assert.ok(h.calls.some(c=>c.name==='setPressureInstances'&&c.args[0].length===0));h.owner.dispose();
});
test('Source waits for the current base catalog before installing any isolated scene pack',async()=>{
 let release;const h=fixture({baseGate:new Promise(r=>release=r)}),loading=h.owner.initialize();await Promise.resolve();
 assert.ok(h.calls.some(c=>c.name==='r3dBasePropsReady'));assert.ok(!h.calls.some(c=>c.name==='addPropPack'||c.name==='addCharacterPack'));
 release(true);assert.equal(await loading,true);assert.equal(h.owner.ready(),true);h.owner.dispose();
 const failed=fixture({baseGate:Promise.resolve(false)});await assert.rejects(failed.owner.initialize(),/base prop catalog/);assert.ok(!failed.calls.some(c=>c.name==='addPropPack'));failed.owner.dispose();
});
test('a late host catalog replacement restores isolated scenery without resetting progress or acquiring a second scene',async()=>{
 const h=fixture();await h.owner.initialize();h.owner.render(initial());const plans=h.calls.filter(c=>c.name==='r3dSetPlan').length;
 for(const mesh of [...Object.values(MESH),door.leafMesh,'pub_service_tray_loaded','pub_bartender_iona'])h.loaded.delete(mesh);
 assert.equal(h.owner.ready(),false);assert.equal(h.owner.render({...initial(),stage:3,layer:2}),true);assert.equal(h.owner.render({...initial(),stage:3,layer:2}),true,'parallel frame attempts share one pack restore');
 assert.equal(h.owner.diagnostics().restoringScenery,true);await new Promise(r=>setImmediate(r));
 assert.equal(h.owner.ready(),true);assert.equal(h.owner.render({...initial(),stage:3,layer:2}),true);
 assert.equal(h.calls.filter(c=>c.name==='addPropPack'&&c.args[0]==='fixture:'+SOURCE_PUB_SCENOGRAPHY_ASSET).length,2,'one initial load and one residency restore');
 assert.ok(h.loaded.has(door.leafMesh)&&h.loaded.has('pub_service_tray_loaded')&&h.loaded.has('pub_bartender_iona'),'repair restores doors, service props and actual character catalog entries too');
 assert.equal(h.calls.filter(c=>c.name==='addCharacterPack').length,2,'a host reset reinstalls anatomical entries even if bundle names survive');
 assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,plans,'residency repair does not reinstall the scene or reset its state');
 assert.ok(h.calls.findLast(c=>c.name==='r3dSetProps').args[0].some(p=>p.mesh===MESH.deck&&p.sourceLayer===2));h.owner.dispose();
});
test("a failed late scenery restore becomes the scene's recoverable load error",async()=>{
 const h=fixture();await h.owner.initialize();for(const mesh of Object.values(MESH))h.loaded.delete(mesh);h.reject('source-pub-scenography.glb');
 assert.equal(h.owner.render(initial()),true);await new Promise(r=>setImmediate(r));assert.throws(()=>h.owner.render(initial()),/failed source-pub-scenography/);assert.ok(h.owner.diagnostics().error);assert.equal(h.owner.dispose(),true);assert.equal(h.released(),1);
});
test('dispose during loading cannot reinstall any scene after host restoration',async()=>{let release;const h=fixture({loadGate:new Promise(r=>release=r)}),loading=h.owner.initialize();await Promise.resolve();assert.equal(h.owner.dispose(),true);const n=h.calls.length;release();assert.equal(await loading,false);assert.equal(h.calls.length,n);assert.ok(!h.calls.some(c=>c.name==='r3dSetPlan'));});
test('failed or incomplete cold/skin/door packs leave no acquired Source plan',async()=>{for(const options of[{omit:[MESH.deck]},{rejectPack:'pub-characters.glb'},{omit:[door.leafMesh]}]){const h=fixture(options);await assert.rejects(h.owner.initialize());assert.equal(h.owner.ready(),false);assert.ok(h.owner.diagnostics().error);assert.ok(!h.calls.some(c=>c.name==='r3dSetPlan'));assert.equal(h.owner.dispose(),true);assert.equal(h.released(),1);}});
