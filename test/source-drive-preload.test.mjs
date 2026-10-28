import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {r3dPresentationReady} from '../src/render/r3d.js';

const source=readFileSync(new URL('../src/game/source-drive-renderer.js',import.meta.url),'utf8');
const staticMeshes={
 'drive.glb':['drive_cabin','drive_radio','drive_road','drive_recorder_body'],
 'cut-static.glb':['cut_geology','cut_retaining'],
 'cut-roadside.glb':['cut_guardrail','drive_plain_paving','drive_uk_edge_markings','drive_uk_centre_and_edges'],
 'drive-predicaments.glb':['dp_wreck_saloon','dp_road_fold','dp_whiteout_pylon'],
 'coastal-memory.glb':['cm_limestone_coast','cm_seabed','cm_distant_pier','cm_limestone_outcrop_0','cm_limestone_outcrop_1','cm_limestone_outcrop_2','cm_limestone_outcrop_3'],
};
const characterMeshes={
 'wheel-hands.glb':['drive_right_hand','drive_left_hand'],
 'cut-living.glb':['cut_fascia','cut_membrane','cut_tethers'],
 'cut-landscape.glb':['cut_thoracic_bone','cut_wave_surface'],
};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 const loads=[],world=[],catalog=new Set(['source_existing_wall']),characters=new Map(),gates=new Map(),failures=new Set();let released=0;
 const presentation={ready:true,shaderReady:true,supported:true,framesRendered:0,skipFinal:false,loseDuringDraw:false,rejectDraw:false},base={ready:Promise.resolve(true)};
 const load=async(url,kind)=>{loads.push({url,kind});const file=url.split('/').at(-1);if(gates.has(file))await gates.get(file);if(failures.delete(file))throw Error('failed '+file);const meshes=(kind==='character'?characterMeshes:staticMeshes)[file];assert.ok(meshes,'fixture recognizes '+url);for(const name of meshes)catalog.add(name);if(kind==='character'){for(const[oldUrl,names]of characters)if(names.every(name=>meshes.includes(name)))characters.delete(oldUrl);characters.set(url,meshes);}return{catalog:new Map([...catalog].map(name=>[name,{}]))};};
 const P3={addPropPack:url=>load(url,'prop'),addCharacterPack:url=>load(url,'character'),propMeshCatalog:()=>[...catalog],characterStats:()=>({packs:[...characters].map(([url,meshes])=>({url,meshes}))}),setDriveStudyFrame:value=>world.push(['driveFrame',value]),setDriveStudyCanvas:()=>{}};
 const R3=new Proxy({r3dBasePropsReady:()=>base.ready,r3dPresentationReady:()=>presentation.ready,r3dPixelMeshStatus:()=>({...presentation}),r3dFrame:(...args)=>{world.push(['r3dFrame',...args]);if(!presentation.skipFinal)presentation.framesRendered++;if(presentation.loseDuringDraw)presentation.ready=false;return presentation.rejectDraw?false:undefined;}},{get:(target,name)=>target[name]||((...args)=>world.push([name,...args]))});
 const document={createElement:name=>{world.push(['canvas',name]);return{getContext:()=>({})};}};
 const moduleSource=source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const api=new Function('R3','P3','FP','F','CELL','MATERIAL','assetUrl','drawRecorderReadoutCanvas','document',moduleSource+'\nreturn{preloadSourceDriveAssets,createSourceDriveRenderer};')(R3,P3,{encodeH:x=>x},{SKY:1},1,{serviceConcrete:2},path=>'asset:'+String(path).replace(/^\/+/,''),()=>{},document);
 return{...api,loads,world,catalog,gates,failures,characters,presentation,base,owner:()=>api.createSourceDriveRenderer({onRelease:()=>{released++;}}),released:()=>released};
}

test('cold saved-drive preparation waits for the replacing building catalog before merging hero packs',async()=>{
 const h=fixture();let install;h.base.ready=new Promise(resolve=>{install=resolve;});
 const warm=h.preloadSourceDriveAssets(),owner=h.owner(),initial=owner.initialize();await flush();
 assert.equal(h.loads.length,0,'no hero pack may be erased by the pending base replacement');assert.deepEqual(h.world,[]);
 h.catalog.clear();h.catalog.add('new_building_wall');install(true);
 assert.deepEqual(await Promise.all([warm,initial]),[true,true]);assert.equal(h.loads.length,7);
 for(const name of['drive_cabin','drive_road','drive_recorder_body','dp_wreck_saloon','drive_right_hand'])assert.ok(h.catalog.has(name),name);
 assert.ok(h.catalog.has('new_building_wall'));
});

test('a failed base catalog cannot acquire a drive and a later explicit retry can recover',async()=>{
 const h=fixture(),owner=h.owner();h.base.ready=Promise.resolve(false);
 await assert.rejects(owner.initialize(),/base prop catalog/);assert.equal(h.loads.length,0);assert.deepEqual(h.world,[]);assert.equal(owner.ready(),false);
 h.base.ready=Promise.resolve(true);assert.equal(await owner.initialize(),true);assert.equal(h.loads.length,7);
});

test('door prewarming loads only the seven P3 packs without acquiring the scene, camera or canvas',async()=>{
 const h=fixture();assert.equal(await h.preloadSourceDriveAssets(),true);
 assert.deepEqual(h.loads.map(x=>x.url),['drive.glb','geometry/wheel-hands.glb','cut/cut-static.glb','cut/cut-living.glb','cut/cut-roadside.glb','cut/cut-landscape.glb','predicaments/drive-predicaments.glb'].map(x=>'asset:assets/source-drive/'+x));
 assert.equal(h.loads.filter(x=>x.kind==='character').length,3);assert.deepEqual(h.world,[]);assert.ok(h.catalog.has('source_existing_wall'));
 await h.preloadSourceDriveAssets();assert.equal(h.loads.length,7,'ready packs are reused rather than fetched and uploaded again');
 assert.doesNotMatch(source,/getContext\(['"]webgl|new\s+(?:WebGLRenderer|Worker)|requestAnimationFrame\(/,'prewarming cannot create another renderer or animation loop');
});

test('door warm, repeated warm and concurrent initialization share loads and acquire ownership only after completion',async()=>{
 const h=fixture();let release;h.gates.set('drive.glb',new Promise(resolve=>{release=resolve;}));
 const owner=h.owner(),warm=h.preloadSourceDriveAssets(),again=h.preloadSourceDriveAssets({assets:{drive:'/assets/source-drive/drive.glb',metrics:'/assets/source-drive/geometry/metrics.json'}}),initial=owner.initialize({assets:{drive:'/assets/source-drive/drive.glb'}});
 assert.equal(owner.initialize(),initial);await flush();assert.equal(h.loads.length,1);assert.deepEqual(h.world,[]);assert.equal(owner.ready(),false);
 release();assert.deepEqual(await Promise.all([warm,again,initial]),[true,true,true]);
 assert.equal(h.loads.length,7);assert.equal(new Set(h.loads.map(x=>x.kind+':'+x.url)).size,7);assert.equal(owner.ready(),true);assert.equal(h.world.filter(x=>x[0]==='r3dSetPlan').length,1);assert.equal(h.world.filter(x=>x[0]==='canvas').length,1);
});

test('one failed pack rejects all shared waiters, keeps successful packs, and permits renderer initialization retry',async()=>{
 const h=fixture(),owner=h.owner();h.failures.add('cut-living.glb');
 const failed=await Promise.allSettled([h.preloadSourceDriveAssets(),owner.initialize()]);
 assert.ok(failed.every(x=>x.status==='rejected'&&/failed cut-living/.test(x.reason.message)));assert.equal(owner.ready(),false);assert.deepEqual(h.world,[]);
 assert.equal(await owner.initialize(),true);assert.equal(h.loads.length,8);assert.equal(h.loads.filter(x=>x.url.endsWith('cut-living.glb')).length,2);
 for(const name of['drive.glb','wheel-hands.glb','cut-static.glb','cut-roadside.glb','cut-landscape.glb'])assert.equal(h.loads.filter(x=>x.url.endsWith('/'+name)).length,1,name);
 await h.preloadSourceDriveAssets();assert.equal(h.loads.length,8);
});

test('disposing during warm never clears the still-owned Source view and cannot acquire it after release',async()=>{
 const h=fixture();let release;h.gates.set('drive.glb',new Promise(resolve=>{release=resolve;}));const owner=h.owner(),loading=owner.initialize();await flush();assert.equal(owner.dispose(),true);assert.equal(owner.dispose(),false);assert.equal(h.released(),1);assert.deepEqual(h.world,[]);
 release();assert.equal(await loading,false);assert.equal(await owner.initialize(),false);assert.equal(owner.ready(),false);assert.deepEqual(h.world,[]);
 const next=h.owner();assert.equal(await next.initialize(),true);assert.equal(h.loads.length,7,'cancellation leaves successfully warmed packs reusable');next.dispose();assert.equal(h.world.filter(x=>x[0]==='driveFrame'&&x[1]===null).length,1,'a real owner still releases its scoped drive frame');
});

test('P3 character-cache invalidation also invalidates stale static GPU cache records',async()=>{
 const h=fixture();await h.preloadSourceDriveAssets();h.characters.clear(); // The real P3 re-init removes its context-owned bundles, while static names can remain.
 await h.preloadSourceDriveAssets();assert.equal(h.loads.length,14);assert.deepEqual(h.world,[]);
});

test('a missing static pack and a changed override are reloaded without replacing unrelated warmed packs',async()=>{
 const h=fixture();await h.preloadSourceDriveAssets();h.catalog.delete('cut_guardrail');await h.preloadSourceDriveAssets();assert.equal(h.loads.length,8);assert.ok(h.loads.at(-1).url.endsWith('cut-roadside.glb'));
 await h.preloadSourceDriveAssets({assets:{drive:'fixture://alternative/drive.glb'}});assert.equal(h.loads.length,9);assert.equal(h.loads.at(-1).url,'fixture://alternative/drive.glb');
 await h.preloadSourceDriveAssets();assert.equal(h.loads.length,10,'returning to the canonical variant cannot reuse the replaced GPU meshes');assert.equal(h.loads.at(-1).url,'asset:assets/source-drive/drive.glb');assert.deepEqual(h.world,[]);
});

test('presentation readiness requires the existing live context and a nonzero canvas',()=>{
 assert.equal(r3dPresentationReady(),false,'the real uninitialized renderer has no presentation target');
 const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),fn=renderer.match(/export function r3dPresentationReady\(\)\s*\{[^}]*\}/)?.[0];assert.ok(fn);
 const check=new Function('gl','canvas',fn.replace('export ','')+';return r3dPresentationReady();');
 assert.equal(check(null,{width:1280,height:800}),false);assert.equal(check({isContextLost:()=>true},{width:1280,height:800}),false);
 assert.equal(check({isContextLost:()=>false},null),false);assert.equal(check({isContextLost:()=>false},{width:0,height:800}),false);assert.equal(check({isContextLost:()=>false},{width:1280,height:0}),false);
 assert.equal(check({isContextLost:()=>false},{width:1280,height:800}),true);
});

test('the production drive renderer refuses unavailable, lost or unacquired frames and resumes on a successful final draw',async()=>{
 const h=fixture(),owner=h.owner();await owner.initialize();
 const frame={scene:{props:[],lamps:[],roadPitch:0,cut:{lights:[]},eye:[0,1.65,0]},weather:{},look:{yaw:0,pitch:0},driveState:{heading:0}};
 h.world.length=0;h.presentation.ready=false;assert.equal(owner.ready(),false);assert.equal(owner.render(frame),false);assert.deepEqual(h.world,[],'an unavailable presentation cannot mutate or submit the drive scene');
 h.presentation.ready=true;h.presentation.skipFinal=true;assert.equal(owner.render(frame),false,'a no-op draw cannot reuse an earlier successful final shader status');
 h.presentation.skipFinal=false;h.presentation.shaderReady=false;assert.equal(owner.render(frame),false,'a missing final shader cannot be presented as a completed drive frame');
 h.presentation.shaderReady=true;h.presentation.supported=false;assert.equal(owner.render(frame),false,'missing acquisition resources refuse presentation');
 h.presentation.supported=true;h.presentation.loseDuringDraw=true;assert.equal(owner.render(frame),false);assert.equal(owner.ready(),false,'context loss during draw revokes start readiness');
 h.presentation.ready=true;h.presentation.loseDuringDraw=false;h.presentation.rejectDraw=true;assert.equal(owner.render(frame),false,'an explicit failed submission is not success');
 h.presentation.rejectDraw=false;assert.equal(owner.render(frame),true);assert.equal(owner.ready(),true);assert.ok(h.world.some(call=>call[0]==='r3dFrame'));
});

test('opening preload replaces an earlier coast catalog missing any revised physical outcrop mesh',async()=>{const h=fixture();for(const name of ['cm_limestone_coast','cm_seabed','cm_distant_pier'])h.catalog.add(name);await h.preloadSourceDriveAssets({coastalMemory:true});assert.equal(h.loads.length,8);for(let i=0;i<4;i++)assert.ok(h.catalog.has('cm_limestone_outcrop_'+i));h.catalog.delete('cm_limestone_outcrop_2');await h.preloadSourceDriveAssets({coastalMemory:true});assert.equal(h.loads.length,9);assert.ok(h.loads.at(-1).url.endsWith('coastal-memory.glb'));assert.ok(h.catalog.has('cm_limestone_outcrop_2'));assert.deepEqual(h.world,[]);});

test('missing UK paint invalidates the roadside cache rather than silently leaving the road unmarked',async()=>{
 for(const name of ['drive_uk_edge_markings','drive_uk_centre_and_edges']){
  const h=fixture();await h.preloadSourceDriveAssets();h.catalog.delete(name);
  await h.preloadSourceDriveAssets();assert.equal(h.loads.length,8,name);
  assert.ok(h.loads.at(-1).url.endsWith('cut-roadside.glb'));assert.ok(h.catalog.has(name));
  assert.deepEqual(h.world,[],'repairing assets does not seize the world renderer');
 }
});
