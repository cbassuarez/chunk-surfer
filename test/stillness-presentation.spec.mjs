import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createStillnessDread} from '../src/game/stillness-dread.js';
import {setStillnessPresentation,stillnessPresentation,bindStillnessPresentation,stillnessSurfaceEligible} from '../src/render/stillness-presentation.js';
import {sourceContinuationGeometry,installSourceContinuationMeshes} from '../src/render/source-continuation-renderer.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {createSourceIVScene} from '../src/game/source-iv-scene.js';
import {freshSourceIV} from '../src/game/source-iv.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {freshSourceEarthfallElleryAside} from '../src/game/source-earthfall-ellery-aside.js';
import {makeSourceRepriseScene,SOURCE_REPRISE_CAST_SECONDS,SOURCE_REPRISE_UNFOLD_SECONDS,SOURCE_REPRISE_RECOGNITION_SECONDS} from '../src/game/source-reprise-scene.js';

function asset(path){
  const bytes=readFileSync(new URL('../'+path,import.meta.url)),length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length));
  return name=>{const mesh=json.meshes.find(mesh=>mesh.name===name);assert.ok(mesh,name+' must exist in the actual pack');
    return{name:mesh.name,extras:mesh.extras||{},primitives:mesh.primitives.map(p=>{
      const m=json.materials[p.material];return{materialName:m.name,printedSurface:m.extras?.printedSurface,
        materialRole:m.extras?.renRole||m.extras?.openingStreetRole||m.extras?.fireEscapeRole||m.extras?.roofRole,
        portrait:m.name==='portrait surface',vegetationClass:m.extras?.vegetationClass,
        cutTissue:m.extras?.cutTissue,tissueSurface:m.extras?.tissueSurface,alphaCut:m.alphaMode==='MASK'?(m.alphaCutoff??.5):0};
    })};};
}
function installedCatalog(){
  // Exercise the real runtime installer without creating a GL context. The
  // test needs its actual names and semantic primitive metadata, not pixels.
  const noop=()=>{},gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_INT:5,
    createVertexArray:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getParameter:()=>0,
    bindVertexArray:noop,bindBuffer:noop,bufferData:noop,enableVertexAttribArray:noop,
    vertexAttribPointer:noop,vertexAttribDivisor:noop,disableVertexAttribArray:noop,vertexAttrib1f:noop,
    bindTexture:noop,pixelStorei:noop,texImage2D:noop,generateMipmap:noop,texParameteri:noop,activeTexture:noop};
  const pack={catalog:new Map()};
  installSourceContinuationMeshes(gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{version:1}}});
  return pack.catalog;
}
const catalog=installedCatalog();
const installed=name=>{const entry=catalog.get(name);assert.ok(entry,'Actual runtime mesh '+name+' must exist');return entry;};
const eligible=mesh=>mesh.primitives.some(material=>stillnessSurfaceEligible(mesh,material));

test('actual institutional masonry admits faces while physical writing and glazing keep their existing identity',()=>{
  const base=asset('public/assets/conservatory-props.glb'),front=asset('public/assets/ellery-public-front.glb');
  const wall=base('arch_wall_repair_service');assert.ok(wall.primitives.every(p=>stillnessSurfaceEligible(wall,p)));
  const elevation=front('conservatory_west_elevation'),brick=elevation.primitives.find(p=>p.materialName==='ellery red brick'),glass=elevation.primitives.find(p=>p.materialName==='wired roof glass');
  assert.ok(brick&&glass);assert.equal(stillnessSurfaceEligible(elevation,brick),true);assert.equal(stillnessSurfaceEligible(elevation,glass),false);
  const civic=front('ellery_public_front'),writing=civic.primitives.filter(p=>p.printedSurface);assert.ok(writing.length>=2);
  for(const p of writing)assert.equal(stillnessSurfaceEligible(civic,p),false,p.materialName);
  assert.equal(eligible(base('yard_look_bench')),false);
});

test('Source blueprint walls, the real II loggia and III receiving floors remain eligible despite their print metadata',()=>{
  const geometry=sourceContinuationGeometry({phase:'catch'}),receivers=geometry.filter(p=>p.region==='catch'&&p.role==='catch'&&p.kind==='surface');
  assert.equal(receivers.length,4);for(const p of receivers)assert.equal(eligible(installed(p.name)),true,p.name);
  const walls=geometry.filter(p=>p.role==='rest-alcove');assert.ok(walls.length>=5);
  for(const p of walls)assert.equal(eligible(installed(p.name)),true,p.name);
  const printed=[...catalog.values()].find(mesh=>mesh.primitives.some(p=>p.printedSurface)&&/solid/.test(mesh.name));
  assert.ok(printed);assert.equal(eligible(printed),true,'Source structural print is substrate rather than a protected written document');
  for(const name of['source-continuation-rest-oak','source-continuation-rest-stone','source-continuation-rest-vista-arch'])assert.equal(eligible(installed(name)),true,name);
});

test('real II roof glazing and runtime bench parts cannot grow faces',()=>{
  for(const name of['source-continuation-rest-roof-glass','source-continuation-rest-settle-frame','source-continuation-rest-settle-cloth','source-continuation-rest-settle-piping'])
    assert.equal(eligible(installed(name)),false,name);
});

test('living or handled Source details do not inherit architecture eligibility from their runtime prefix',()=>{
  for(const name of['source-continuation-operator-jacket','source-continuation-operator-yoke','source-continuation-operator-toes','source-continuation-rest-weather-sheet'])
    assert.equal(eligible(installed(name)),false,name);
  const wall={name:'source_iii_wall',extras:{sourceContinuation:true}};
  for(const material of[{materialName:'glass'},{materialName:'wall',portrait:true},{materialName:'wall',cutTissue:true},{materialName:'wall',tissueSurface:{version:1}},{materialName:'wall',vegetationClass:'leaf'},{materialName:'wall',materialRole:'missing-man'}])
    assert.equal(stillnessSurfaceEligible(wall,material),false,JSON.stringify(material));
  assert.equal(stillnessSurfaceEligible({...wall,characterAsset:true},{materialName:'wall'}),false);
});

function bound(frame){
  setStillnessPresentation(frame);const uploads=[];
  bindStillnessPresentation({uniform4f:(name,...values)=>uploads.push({name,values:new Float32Array(values)}),
    uniform1f:(name,value)=>uploads.push({name,values:new Float32Array([value])}),
    uniform3fv:(name,values)=>uploads.push({name,values:new Float32Array(values)})},name=>name);
  return{frame:stillnessPresentation(),uploads};
}
test('native uniform encoding normalizes directions, remains finite in GPU precision and completely clears',()=>{
  const a=bound({amount:.7,profile:2,time:20,motionTime:3,anchor:[2,4,6],direction:[3,0,4],reduceFlash:true});
  assert.deepEqual(a.uploads.map(x=>x.name),['uStillnessState','uStillnessAnchor','uStillnessDirection','uStillnessTreatment']);
  assert.equal(a.uploads[3].values[0],1,'anatomical geometry is the default treatment');
  assert.ok(Math.abs(Math.hypot(...a.frame.direction)-1)<1e-10);assert.equal(a.frame.time,3);assert.equal(a.frame.reducedMotion,true);
  assert.equal(a.uploads[0].values[3],1);
  for(const value of[{amount:NaN},{amount:-1},null]){
    const off=bound(value);assert.equal(off.frame.amount,0);assert.deepEqual(off.frame.anchor,[0,0,0]);
    for(const u of off.uploads)assert.ok([...u.values].every(Number.isFinite));
  }
  const bad=bound({amount:1e300,profile:Infinity,time:1e300,anchor:[1e300,-1e300,1e300],direction:[1e300,1e300,1e300]});
  for(const u of bad.uploads)assert.ok([...u.values].every(Number.isFinite),u.name+' must not overflow a native float uniform');
  assert.ok(Math.hypot(...bad.frame.direction)>.99,'finite extreme vectors still produce a defined face orientation');
  const zero=bound({amount:1,direction:[0,0,0],anchor:[NaN,0,0],time:Infinity});
  assert.ok(Math.hypot(...zero.frame.direction)>.99);assert.equal(zero.frame.time,0);
  assert.ok(Object.isFrozen(zero.frame));assert.ok(Object.isFrozen(zero.frame.anchor));
});

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function lifecycle(){
  const begin=main.indexOf('function tickStillnessDread('),end=main.indexOf('\nlet lastFearOverlayFrame',begin);
  assert.ok(begin>0&&end>begin);let material;
  const camera={eye:{x:4,y:1.62,z:5},yaw:0},sceneState={blocks:false,input:false,allowsLook:true,hidden:false,frozen:false,owner:null,top:null};
  const c={RENDERER:'3d',storyMode:true,inRogue:true,paused:false,focused:true,sourceContinuationScene:null,
    buildingLoadPromise:null,activeEndingCutscene:null,planName:'conservatory',source:false,camera,sceneState,
    createStillnessDread,shakeMode:()=> 'full',flashMode:()=> 'full',
    gameplayInputLifecycleActive:()=>c.focused,scenePresentationHidesWorld:()=>sceneState.hidden,
    usingSourceSpace:()=>c.source,scenes:{top:()=>sceneState.top,blocksWorld:()=>sceneState.blocks,blocksInput:()=>sceneState.input,allowsLook:()=>sceneState.allowsLook,lookOwner:()=>sceneState.owner,isFrozen:()=>sceneState.frozen},
    R3:{r3dSetStillnessDread:value=>material=value,r3dViewCamera:()=>camera}};
  vm.createContext(c);vm.runInContext('const stillnessDread=createStillnessDread();\n'+main.slice(begin,end),c);
  const step=(dt=.05,options)=>{c.tickStillnessDread(dt,options);return material;};
  const wait=seconds=>{let f;for(let t=0;t<seconds-1e-8;t+=.05)f=step();return f;};
  return{c,step,wait,frame:()=>material};
}
test('actual main lifecycle freezes pause, focus loss and interruption, and clears loading or cinematic ownership',()=>{
  const h=lifecycle();h.step();const before=h.wait(12);assert.ok(before.amount>.5);
  h.c.paused=true;assert.strictEqual(h.step(90),before);h.c.paused=false;
  h.c.focused=false;assert.strictEqual(h.step(90),before);h.c.focused=true;
  assert.strictEqual(h.step(90,{away:true}),before);assert.ok(h.step().stillSeconds-before.stillSeconds<.051);
  h.c.buildingLoadPromise={};assert.equal(h.step().amount,0);h.c.buildingLoadPromise=null;
  h.c.sceneState.blocks=true;assert.equal(h.wait(20).amount,0,'an authored cinematic or menu cannot count as chosen stillness');
});
test('both actual bench modes have independent clocks and continuation observation never clones the pursuit trail',()=>{
  const h=lifecycle(),seat=SOURCE_REST_SEATS[1],pose={...seat,status:'active',ready:true,closed:false,paused:false,leaving:false,error:null,transitioning:false,foldSerial:0};
  let rest={mode:'seated',seatId:seat.id};
  h.c.sceneState.blocks=true;h.c.sourceContinuationScene={stillnessPose:()=>pose,sourceRest:{view:()=>rest},view(){throw Error('Full pursuit snapshot is not a material observation');}};
  h.step();let f=h.wait(9);assert.equal(f.profile,2);assert.equal(f.amount,1,'III does not depend on II music or affliction progress');
  rest={mode:'committed',seatId:seat.id};assert.equal(h.step().amount,0,'an ending hold is not chosen stillness');
  rest={mode:'seated',seatId:seat.id};
  Object.assign(pose,SOURCE_REST_SEATS[0]);rest={mode:'seated',seatId:SOURCE_REST_SEATS[0].id};
  assert.equal(h.step().amount,0,'crossing back to the other Source world clears the old surface');f=h.wait(11);assert.equal(f.profile,1);assert.equal(f.amount,1);
  pose.transitioning=true;assert.equal(h.step().amount,0);pose.transitioning=false;pose.ready=false;assert.equal(h.wait(20).amount,0);
});
test('a frozen overlay above continuation cannot advance dread while the actual Source scene is held',()=>{
  const h=lifecycle(),seat=SOURCE_REST_SEATS[1],pose={...seat,status:'active',ready:true};
  h.c.sourceContinuationScene={stillnessPose:()=>pose,sourceRest:{view:()=>({mode:'seated',seatId:seat.id})}};
  h.c.sceneState.blocks=true;h.step();const before=h.wait(4);assert.ok(before.amount>0);
  h.c.sceneState.frozen=true;assert.strictEqual(h.step(60),before);
});

test('the real fixed-camera Source IV controller accrues bodily stillness and releases on an actual accepted step',async()=>{
  const scene=createSourceIVScene({checkpoint:freshSourceIV({runId:'stillness-iv'}),renderer:{initialize:async()=>true,ready:()=>true,render:()=>true}});
  await scene.initialize();assert.equal(scene.allowsLook,false);
  const h=lifecycle();h.c.sourceContinuationScene=scene;h.c.sceneState.blocks=true;h.step();
  assert.equal(h.wait(18).amount,1);const before=scene.view();
  scene.key({key:'w'});scene.update(.1);scene.keyup({key:'w'});const after=scene.view();
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.06,'the real controller accepted body movement');
  const released=h.step();assert.equal(released.stillSeconds,0);assert.ok(released.releasing);
  assert.deepEqual(h.c.camera.eye,{x:4,y:1.62,z:5},'a fixed camera cannot stand in for the moving body');
  scene.pause();assert.equal(h.step().amount,0,'a nonlive Source IV view cannot accrue');scene.exit();
});

async function earthfall(checkpoint){
  const scene=createSourceEarthfallScene({checkpoint,renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,renderAside:()=>true}});
  await scene.initialize();return scene;
}
test('real Earthfall supported exploration and familiar-room chase accrue while falling and contact phases clear',async()=>{
  const h=lifecycle();h.c.sceneState.blocks=true;
  const upper=await earthfall(freshSourceEarthfall({runId:'stillness-earth'}));h.c.sourceContinuationScene=upper;h.step();
  assert.equal(upper.view().phase,'intact');assert.equal(h.wait(18).amount,1);upper.exit();
  const falling=await earthfall({...freshSourceEarthfall({runId:'stillness-fall'}),committed:true,committedAt:0,elapsed:8,phase:'falling',feet:75,velocityY:-10});
  h.c.sourceContinuationScene=falling;assert.equal(falling.view().phase,'falling');assert.equal(h.step().amount,0);assert.equal(h.wait(18).amount,0);falling.exit();
  for(const phase of['recognition','quiet','chase','contact','collapse']){
    const aside=freshSourceEarthfallElleryAside({runId:'stillness-'+phase});aside.chase.phase=phase;
    const scene=await earthfall({...freshSourceEarthfall({runId:'stillness-'+phase}),phase:'catching',feet:0,committed:true,elleryAside:aside});
    h.c.sourceContinuationScene=scene;assert.equal(scene.view().aside.chase.phase,phase);h.step();const amount=h.wait(18).amount;
    assert.equal(amount,['recognition','quiet','chase'].includes(phase)?1:0,phase);scene.exit();
  }
});

test('the real borrowed reprise only accrues in its player-held walk and fresh record choice',()=>{
  const plan={id:'call-site',segments:[{kind:'recording-room',id:'take:1:main_b3',roomId:'main_b3',mark:{x:4,y:0},frames:[{x:0,y:0},{x:4,y:0}]}]};
  const scene=makeSourceRepriseScene({plan,worldBacked:true}),h=lifecycle();h.c.sceneState.blocks=true;h.c.sceneState.top=scene;
  h.step();assert.equal(h.wait(20).amount,0,'the cast is not chosen stillness');
  scene.update(SOURCE_REPRISE_CAST_SECONDS);assert.equal(h.wait(20).amount,0,'the room acquisition is not chosen stillness');
  scene.update(SOURCE_REPRISE_UNFOLD_SECONDS);assert.equal(scene.view().phase,'traverse');h.step();assert.equal(h.wait(18).amount,1);
  h.c.sceneState.frozen=true;const before=h.frame();assert.strictEqual(h.step(90),before);h.c.sceneState.frozen=false;
  for(let i=0;i<100&&scene.view().phase==='traverse';i++)scene.key({code:'KeyW'});
  assert.equal(scene.view().phase,'recognition');assert.equal(h.step().amount,0,'the recognition turn clears the walking material owner');
  scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS);assert.equal(scene.view().phase,'armed');h.step();assert.equal(h.wait(18).amount,1);
  scene.key({key:'r'});assert.equal(scene.view().committed,true);assert.equal(h.step().amount,0);scene.exit();
});

test('nonlooking instruments and ending cinematics never inherit an ordinary stillness owner',()=>{
  const h=lifecycle();h.step();assert.equal(h.wait(18).amount,1);
  h.c.sceneState.input=true;h.c.sceneState.allowsLook=false;h.c.sceneState.top={id:'b3-console'};assert.equal(h.step().amount,0);
  h.c.sceneState.input=false;h.c.sceneState.allowsLook=true;h.c.sceneState.top=null;h.step();assert.equal(h.wait(18).amount,1);
  h.c.activeEndingCutscene={};h.c.paused=true;assert.equal(h.step().amount,0,'an ending clears even if it arrives at an interruption boundary');
  h.c.activeEndingCutscene=null;h.c.paused=false;
  for(const id of['ending-action:out','ending-resolution:rest','finale','credits','source-rest-ending-hold']){
    h.c.sceneState.top={id};assert.equal(h.wait(20).amount,0,id);
  }
});

test('look-permitting modal speech does not accrue, while voluntary ordinary seats and authored Source-rest speech do',()=>{
  const h=lifecycle();h.c.sceneState.input=true;h.c.sceneState.allowsLook=true;h.c.sceneState.top={id:'dialogue:iona',blocksInput:true,allowsLook:true};
  assert.equal(h.wait(20).amount,0,'being held in conversation is not a voluntary stopped body');
  for(const id of['academic-roof-sit','yard-look-bench','roof-city-seat','tower-tenor-performance']){
    h.c.sceneState.top={id,blocksInput:true,allowsLook:true};h.step();assert.equal(h.wait(18).amount,1,id);
    h.c.sceneState.top={id:'dialogue:guard',blocksInput:true,allowsLook:true};assert.equal(h.step().amount,0);
  }
  const seat=SOURCE_REST_SEATS[1],scene={stillnessPose:()=>({...seat,status:'active',ready:true}),sourceRest:{view:()=>({mode:'seated',seatId:seat.id})}};
  h.c.sourceContinuationScene=scene;h.c.sceneState.blocks=true;
  h.c.sceneState.top={id:'source-rest:catch',blocksInput:true,allowsLook:true};h.step();assert.equal(h.wait(9).amount,1);
  h.c.sceneState.top={id:'dialogue:unrelated',blocksInput:true,allowsLook:true};assert.equal(h.step().amount,0);
});
