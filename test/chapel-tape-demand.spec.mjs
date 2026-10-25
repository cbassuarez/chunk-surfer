import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import * as D from '../src/game/chapel-tape-demand.js';
import {buildChapelTapeDemandWalls,chapelTapeDemandInstances,chapelTapeDemandOverlapsWindow,chapelTapeDemandHasPhysicalHost} from '../src/render/chapel-tape-demand.js';
import {BUILDING_WINDOWS} from '../src/data/building-windows.js';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE,CELL} from '../src/data/floorplan/legend.js';
import * as PB from '../src/game/playback.js';
import {wallContactAt} from '../src/world/wall-contact.js';
import {cameraBasis} from '../src/render/camera-basis.js';

const context={runId:'tape-demand-test',chapelWon:true},fresh=()=>D.freshChapelTapeDemand(context.runId);
const depart=(route='inversion')=>D.reduceChapelTapeDemand(D.reduceChapelTapeDemand(fresh(),{type:'arm'},context),{type:'depart',route,departure:{kind:route,stage:route==='inversion'?'door':'public-doors',position:{x:186,y:117},view:{yaw:0,pitch:0},remainingMs:53000}},context);
const caught=()=>D.reduceChapelTapeDemand(depart(),{type:'catch',catch:{doorId:'chapel-c17',anchor:{x:0,y:.94,z:0},position:{x:186,y:117},group:'upper',wallYaw:1.2}},context);
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<tolerance,`${a} != ${b}`);
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const block=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,start);return main.slice(a,b);};

test('only a real chapel victory can arm the demand; counted fifth take, loss and other branches cannot',()=>{
  for(const c of [{...context,chapelWon:false},{...context,chapelRoute:false},{...context,runId:''}])assert.equal(D.reduceChapelTapeDemand(fresh(),{type:'arm'},c).status,'dormant');
  assert.equal(D.reduceChapelTapeDemand(fresh(),{type:'arm'},context).status,'armed');
  assert.equal(D.reduceChapelTapeDemand(depart(),{type:'depart',route:'sacrifice'},context).route,'inversion');
  assert.equal(D.reduceChapelTapeDemand(caught(),{type:'stay'},context).status,'armed');
  assert.equal(D.chapelTapeDemandVisible(caught(),{...context,chapelWon:false}),false);
  assert.equal(D.chapelTapeDemandVisible(caught(),{...context,chapelRoute:false}),false);
});

test('catch requires a walked aperture crossing, never a remote infinite plane or just an opened leaf',()=>{
  const door={id:'chapel-c17',open:true,widthAxis:'x',cx:3.5,cy:5.5,cells:[{x:2,y:5},{x:3,y:5},{x:4,y:5}]};
  assert.equal(D.chapelTapeDemandCrossesDoor({x:3,y:6},{x:3,y:5},door),true);
  assert.equal(D.chapelTapeDemandCrossesDoor({x:2,y:6},{x:2,y:5},door),true,'a legal edge cell is not a bypass lane');
  assert.equal(D.chapelTapeDemandCrossesDoor({x:1.9,y:6},{x:1.9,y:5},door),false);
  assert.equal(D.chapelTapeDemandCrossesDoor({x:30,y:6},{x:30,y:5},door),false);
  assert.equal(D.chapelTapeDemandCrossesDoor({x:3,y:6},{x:3,y:6},door),false);
  assert.equal(D.chapelTapeDemandCrossesDoor({x:3,y:6},{x:3,y:5},{...door,open:false}),false);
  assert.equal(D.chapelTapeDemandCrossesDoor({x:3,y:6},{x:3,y:5},{...door,id:'unrelated-door'}),false);
});

test('steady pull is frame-rate independent; waits, key counts and pauses cannot complete or lose it',()=>{
  for(const hz of [30,60,144]){
    let state=caught();for(let n=0;n<Math.round(hz*D.CHAPEL_TAPE_DEMAND_PULL_SECONDS);n++)state=D.reduceChapelTapeDemand(state,{type:'pull',seconds:1/hz},context);
    assert.equal(state.status,'released');assert.equal(state.progress,1);
  }
  let state=caught();for(let n=0;n<500;n++){state=D.reduceChapelTapeDemand(state,{type:'press'},context);state=D.reduceChapelTapeDemand(state,{type:'pull',seconds:.1,paused:true},context);}
  assert.deepEqual(state,caught());
  assert.equal(D.chapelTapeDemandBlocksProgress(state),true);
  assert.equal(D.chapelTapeDemandBlocksProgress(D.reduceChapelTapeDemand(state,{type:'recover-missing-asset'},context)),false);
});

test('caught checkpoint restores the same tether/progress; foreign runs and Source IV retain their authority',()=>{
  const state=D.reduceChapelTapeDemand(caught(),{type:'pull',seconds:.1},context),save={run:{id:context.runId,status:'active'},encounters:{cleared:['chapel']},area:'conservatory'};
  assert.deepEqual(D.normalizeChapelTapeDemand(JSON.parse(JSON.stringify(state)),context),state);
  assert.deepEqual(D.chapelTapeDemandResume(state,save),state);
  for(const patch of [{run:{id:'another-run',status:'active'}},{encounters:{cleared:[]}},{endingCutscene:{endingId:'surfaced'}},{area:'source-space'},
    {sourceIV:{runId:context.runId,status:'active'}},{sourceIV:{runId:context.runId,status:'completed',exitReceipt:{delivered:false}}},
    {endingWrongDoor:{runId:context.runId,status:'ready-for-source-IV'}},{chunkSurf:{finale:{route:'tower'}}}])assert.equal(D.chapelTapeDemandResume(state,{...save,...patch}),null);
  assert.equal(D.normalizeChapelTapeDemand({...state,catch:null},context).status,'departing','damaged catch fails open');
});

test('tether permits slack/backing toward its actual anchor and prevents leaving with an unresolved catch',()=>{
  const state=caught();
  assert.equal(D.chapelTapeDemandMove(state,{physicalFrom:{x:1,z:0},physicalTo:{x:1.5,z:0}}).allowed,false);
  assert.ok(D.chapelTapeDemandMove(state,{physicalFrom:{x:1,z:0},physicalTo:{x:1.5,z:0}}).effortM>.49);
  assert.equal(D.chapelTapeDemandMove(state,{physicalFrom:{x:1,z:0},physicalTo:{x:.5,z:0}}).allowed,true);
  const released=D.reduceChapelTapeDemand(state,{type:'recover-missing-asset'},context);
  assert.equal(D.chapelTapeDemandMove(released,{physicalFrom:{x:1,z:0},physicalTo:{x:1.5,z:0}}).allowed,true);
});

test('real physical tape records, media references, order and transport survive catch/pull/reload unchanged',()=>{
  PB.loadTakes([{id:'take:1',ordinal:1,roomId:'main_b3',startSeconds:0,endSeconds:60,durationSeconds:60,status:'accepted',sealed:true,counted:true,audible:[['real-buffer',.2]],discrete:[{cueId:'preserved',atSec:9}],slate:{key:'local-indexeddb-key'},guest:'fixed-guest'}]);
  PB.loadTapeTransport({headSeconds:23});const before=JSON.stringify({takes:PB.serializeTakes(),transport:PB.tapeTransport()});
  let state=caught();for(let n=0;n<110;n++)state=D.reduceChapelTapeDemand(D.normalizeChapelTapeDemand(state,context),{type:'pull',seconds:1/60},context);
  assert.equal(state.status,'released');assert.equal(JSON.stringify({takes:PB.serializeTakes(),transport:PB.tapeTransport()}),before);
});

test('actual host uses elapsed held effort, freezes progress under pause, blocks route completion and restores original remaining deadline',()=>{
  let state=caught(),held=true,now=1000,commits=0;
  const host={chapelTapeDemandState:()=>state,chapelTapeDemandContext:()=>context,reduceChapelTapeDemand:D.reduceChapelTapeDemand,
    paused:false,scenes:{blocksWorld:()=>false},usingSpecialSpace:()=>false,gameplayInputLifecycleActive:()=>true,document:{hasFocus:()=>true},arrowDelta:()=>[0,0],
    R3:{r3dChapelTapeDemandStatus:()=>({ready:true})},chapelTapeTugHeld:held,chapelTapeSavedProgress:0,
    chapelTapeDemandMove:D.chapelTapeDemandMove,chapelTapeDemandPhysical:point=>({x:point.x,y:0,z:point.y}),px:0,py:0,
    commitChapelTapeDemand:(next)=>{state=next;commits++;},fireCue:()=>{},rememberChapelTapeDemandDeparture:()=>{},
    performance:{now:()=>now},escape:{kind:'inversion',stage:'rescue',deadlineMs:null},chapelTapeDemandBlocksProgress:D.chapelTapeDemandBlocksProgress};
  vm.createContext(host);vm.runInContext(block('function tickChapelTapeDemand(dt){','function restoreChapelTapeDemandDeparture'),host);
  for(let n=0;n<30;n++)vm.runInContext('tickChapelTapeDemand(1/60)',host);
  assert.ok(state.progress>.29&&state.progress<.31);const pausedAt=state.progress;host.paused=true;vm.runInContext('tickChapelTapeDemand(60)',host);assert.equal(state.progress,pausedAt);assert.equal(host.chapelTapeTugHeld,false);
  host.paused=false;host.chapelTapeTugHeld=true;for(let n=0;n<80;n++)vm.runInContext('tickChapelTapeDemand(1/60)',host);
  assert.equal(state.status,'released');assert.equal(host.escape.deadlineMs,now+53000);assert.ok(commits>0);
  host.escape={kind:'inversion',stage:'rescue',deadlineMs:0};state=caught();vm.runInContext(block('function tickFinale(){','// Commit the return before'),host);vm.runInContext('tickFinale()',host);assert.equal(host.escape.stage,'rescue','even a reached exit cannot resolve the caught route');
  assert.ok(main.indexOf('chapelTapeDemandBeforeStep({x:px,y:py}')>main.indexOf('let move=geometry.canStep'));
  assert.ok(main.indexOf('chapelTapeDemandBeforeStep({x:px,y:py}')<main.indexOf('const stairMotion=beginRenderStep'));
});

test('caught effort follows native focus authority while hidden, paused and blocked worlds cannot consume a held pull',()=>{
  let state=caught(),nativeFocused=true,domFocused=false,worldBlocked=false,specialSpace=false;
  const host={chapelTapeDemandState:()=>state,chapelTapeDemandContext:()=>context,reduceChapelTapeDemand:D.reduceChapelTapeDemand,
    paused:false,IS_TAURI:true,pointerMode:{status:()=>({nativeBackend:{focused:nativeFocused}})},
    document:{hidden:false,visibilityState:'visible',hasFocus:()=>domFocused},scenes:{blocksWorld:()=>worldBlocked},usingSpecialSpace:()=>specialSpace,
    R3:{r3dChapelTapeDemandStatus:()=>({ready:true})},chapelTapeTugHeld:true,chapelTapeSavedProgress:0,arrowDelta:()=>[0,0],
    chapelTapeDemandMove:D.chapelTapeDemandMove,chapelTapeDemandPhysical:point=>({x:point.x,y:0,z:point.y}),px:0,py:0,
    commitChapelTapeDemand:next=>{state=next;},fireCue:()=>{},rememberChapelTapeDemandDeparture:()=>{},escape:null,performance:{now:()=>1000}};
  vm.createContext(host);
  vm.runInContext(block('function gameplayInputLifecycleActive(){','function holdUnavailableGameplayInput(){')+block('function tickChapelTapeDemand(dt){','function restoreChapelTapeDemandDeparture'),host);
  vm.runInContext('tickChapelTapeDemand(.1)',host);
  assert.ok(state.progress>.06,'confirmed native focus permits a pull while DOM focus is stale');
  const progress=state.progress;
  for(const reason of ['native-blur','hidden','visibility-hidden','paused','world-blocked','special-space']){
    nativeFocused=reason!=='native-blur';domFocused=true;
    host.document.hidden=reason==='hidden';host.document.visibilityState=reason==='visibility-hidden'?'hidden':'visible';
    host.paused=reason==='paused';worldBlocked=reason==='world-blocked';specialSpace=reason==='special-space';host.chapelTapeTugHeld=true;
    vm.runInContext('tickChapelTapeDemand(.1)',host);
    assert.equal(state.progress,progress,reason+' cannot advance the tether');
    assert.equal(host.chapelTapeTugHeld,false,reason+' drops held intent');
  }
  host.paused=false;host.document.hidden=false;host.document.visibilityState='visible';nativeFocused=true;worldBlocked=false;specialSpace=false;
  vm.runInContext('tickChapelTapeDemand(.1)',host);assert.equal(state.progress,progress,'returning focus does not replay the dropped pull');
});

test('isolated pack is current, opaque solid pigment with filled forward-facing geometry and credible physical case construction',async()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/chapel-tape-demand.glb',import.meta.url)),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/chapel-tape-demand.stats.json',import.meta.url)));
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(sha(bytes),stats.sha256);for(const[file,hash]of Object.entries(stats.sourceSha256))assert.equal(sha(fs.readFileSync(new URL('../'+file,import.meta.url))),hash);
  const doc=await new NodeIO().readBinary(bytes),meshes=doc.getRoot().listMeshes();assert.equal(meshes.length,7);assert.ok(stats.bytes<900000&&stats.triangles<20000);
  for(const mesh of meshes.filter(m=>m.getName().includes('_paint_')))for(const primitive of mesh.listPrimitives()){
    const material=primitive.getMaterial();assert.equal(material.getAlphaMode(),'OPAQUE');assert.equal(material.getExtras().printedSurface.coverage,'solid');assert.equal(material.getExtras().printedSurface.emission,'none');
    const normals=primitive.getAttribute('NORMAL').getArray();for(let i=2;i<normals.length;i+=3)assert.ok(normals[i]>.75,'filled paint faces its actual room');
  }
  const caseMesh=meshes.find(m=>m.getName()==='tape_demand_field_case');assert.ok(caseMesh.listPrimitives().length>=5,'canvas, leather, piping, webbing and actual metal remain separate materials');
});

test('the production carried case uses the rendered eye and its whole GLB remains visible at every ordinary bearing',async()=>{
  FP.compile(conservatory.levels,conservatory);
  const camera={eye:{x:92.75+.137,y:6.42,z:49.25-.081},yaw:.63,pitch:-.12};
  let submitted;
  const host={storyMode:true,planName:'conservatory',usingSpecialSpace:()=>false,
    R3:{r3dChapelTapeDemandReady:()=>true,r3dViewCamera:()=>camera},FP,CELL,
    logicalX:185,logicalY:117,group:'upper',timeSec:1,shakeMode:()=> 'full',mapWorldHeading:()=>-2,
    chapelTapeDemandState:()=>caught(),chapelTapeDemandContext:()=>context,
    chapelTapeDemandInstances:(_state,options)=>{submitted=options;return[];},doorDynamicCombined:[],count:0};
  vm.createContext(host);
  vm.runInContext(block("  if(storyMode&&planName==='conservatory'&&!usingSpecialSpace()&&R3.r3dChapelTapeDemandReady?.())",'  for(const instance of endingWorldPropInstances(timeSec))'),host);
  assert.equal(submitted.listener.eye,camera.eye);assert.equal(submitted.listener.yaw,camera.yaw);
  assert.equal(submitted.listener.x,camera.eye.x);assert.equal(submitted.listener.z,camera.eye.z);
  const doc=await new NodeIO().readBinary(fs.readFileSync(new URL('../public/assets/chapel-tape-demand.glb',import.meta.url)));
  const mesh=doc.getRoot().listMeshes().find(m=>m.getName()==='tape_demand_field_case');
  const positions=mesh.listPrimitives().map(p=>p.getAttribute('POSITION').getArray());
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.63])for(const pitch of [0,-.12,-.25])for(const aspect of [4/3,1100/760,16/9])for(const progress of [0,.5,.95]){
    const eye=camera.eye,listener={...submitted.listener,eye,yaw};
    const frame=chapelTapeDemandInstances({...caught(),progress},{plan:FP,context,group:'upper',listener,reducedMotion:true});
    const bag=frame.find(p=>p.mesh==='tape_demand_field_case'),basis=cameraBasis(yaw,pitch),c=Math.cos(bag.yaw),s=Math.sin(bag.yaw);
    const bounds={minX:1,minY:1,maxX:0,maxY:0};
    for(const vertices of positions)for(let n=0;n<vertices.length;n+=3){
      // The production P3 model matrix rotates local +Z to (-sin yaw,cos yaw).
      const delta=[bag.x+c*vertices[n]-s*vertices[n+2]-eye.x,bag.y+vertices[n+1]-eye.y,bag.z+s*vertices[n]+c*vertices[n+2]-eye.z];
      const dot=v=>delta.reduce((sum,d,i)=>sum+d*v[i],0),depth=dot(basis.forward);
      assert.ok(depth>.25,'all real case vertices are in front of the actual camera');
      const x=(dot(basis.right)/(depth*.95*aspect)+1)/2,y=(1-dot(basis.up)/(depth*.95))/2;
      assert.ok(x>.02&&x<.98&&y>.02&&y<.98,`case clipped at yaw ${yaw}, pitch ${pitch}, aspect ${aspect}: ${x},${y}`);
      bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);
    }
    assert.ok(bounds.maxX-bounds.minX>.11&&bounds.maxY-bounds.minY>.15,'the complete case has enough screen area to read its construction');
    if(pitch===0)assert.ok(bounds.minY>.57&&bounds.maxY<.96,'neutral view carries the physical case in the lower third');
    const strap=frame.find(p=>p.id==='chapel-tape-demand:strap-b');
    near([strap.matrix[12]+strap.matrix[4],strap.matrix[13]+strap.matrix[5],strap.matrix[14]+strap.matrix[6]],[bag.x-c*.145,bag.y+.17,bag.z-s*.145],1e-5);
    const anchor=frame.find(p=>p.id==='chapel-tape-demand:strap-a');near([anchor.matrix[12],anchor.matrix[13],anchor.matrix[14]],[caught().catch.anchor.x,caught().catch.anchor.y,caught().catch.anchor.z]);
  }
});

test('current compiled room walls carry dense staggered paint with correct physical normal, bounded faces and no exterior invasion',()=>{
  FP.compile(conservatory.levels,conservatory);const walls=buildChapelTapeDemandWalls(FP);assert.ok(walls.length>500);
  assert.deepEqual([...new Set(walls.map(w=>w.group))].sort(),['academic','basement','ground','hall','upper']);
  assert.ok(walls.some(w=>w.zone===ZONE.chapel&&w.y-w.fit.floor>3),'the nave has high compulsive writing as well as low marks');
  assert.ok(walls.filter(w=>[ZONE.chapel,ZONE.chapelOuter].includes(w.zone)).every(w=>w.mesh.endsWith('_pale')),'dark screened chapel stone uses actual pale paint, rather than dark pigment disappearing into the wall');
  for(const p of walls){
    near([-Math.sin(p.yaw),Math.cos(p.yaw)],[p.wallContact.nx,p.wallContact.ny]);
    assert.ok(p.fit.centre-p.fit.width/2>=p.fit.from+.09999&&p.fit.centre+p.fit.width/2<=p.fit.to-.09999,'paint cannot wrap past an actual corner');
    assert.ok(p.y+p.fit.height<=p.fit.ceiling-.13999);assert.equal(FP.logicalToPhysical(p.wallContact.cell.x,p.wallContact.cell.y).renderGroup,p.group);
    assert.ok(![ZONE.street,ZONE.civicCourt,ZONE.church,ZONE.pub,ZONE.stationers].includes(p.zone));
    assert.equal(chapelTapeDemandOverlapsWindow(p),false,'writing keeps the true window aperture and its frame clear');
    assert.equal(chapelTapeDemandHasPhysicalHost(FP,p),true,'the entire width and height belongs to physical masonry in the actual observer slice');
  }
  assert.ok(!walls.some(p=>p.id==='chapel-tape-demand:upper:174,122:0:0'),'the original logical wall crossing the physical room opening is excluded');
  assert.ok(walls.some(p=>p.id==='chapel-tape-demand:upper:179,118:0:0'),'the legal native frontal narthex target remains on its real wall');
  for(const window of BUILDING_WINDOWS){const p=window.physical,n=window.inwardNormal,plane=p.axis==='x'?(n.x>0?p.x1:p.x0):(n.z>0?p.z1:p.z0);
    const fake={group:window.group,x:p.axis==='x'?plane:(p.from+p.to)/2,z:p.axis==='z'?plane:(p.from+p.to)/2,y:window.sill+.2,wallContact:{nx:n.x,ny:n.z},fit:{width:1,height:.4}};
    assert.equal(chapelTapeDemandOverlapsWindow(fake),true,'actual clear-window groups cannot accept a floating sign across their view');
  }
  const chapel=walls.find(p=>p.zone===ZONE.chapel),state={...caught(),catch:{...caught().catch,group:'upper'}};
  const frame=chapelTapeDemandInstances(state,{plan:FP,context,group:'upper',listener:{x:chapel.x,y:chapel.fit.floor,z:chapel.z,yaw:0,zone:ZONE.chapel}});
  assert.ok(frame.length<=116&&frame.some(p=>p.mesh==='tape_demand_field_case'));assert.ok(frame.filter(p=>p.mesh.includes('_paint_')).length>35);
  for(const yaw of [0,.7,Math.PI])for(const progress of [0,.4,.9]){
    const f=chapelTapeDemandInstances({...state,progress},{plan:FP,context,group:'upper',listener:{x:chapel.x,y:chapel.fit.floor,z:chapel.z,yaw,zone:ZONE.chapel}}),bag=f.find(p=>p.mesh==='tape_demand_field_case'),strap=f.find(p=>p.id==='chapel-tape-demand:strap-b');
    near([strap.matrix[12]+strap.matrix[4],strap.matrix[13]+strap.matrix[5],strap.matrix[14]+strap.matrix[6]],[bag.x-Math.cos(bag.yaw)*.145,bag.y+.17,bag.z-Math.sin(bag.yaw)*.145],1e-5);
  }
  for(const id of ['chapel-c17','front-main']){const door=FP.doorState().find(d=>d.id===id);assert.ok(door);const axis=door.widthAxis==='x'?'y':'x',a={x:door.cx,y:door.cy},b={...a};a[axis]+=.5;b[axis]-=.5;assert.equal(D.chapelTapeDemandCrossesDoor(a,b,{...door,open:true}),true);}
});

test('production before-step and restore hooks bind a real legal chapel aperture without taking tape ownership',()=>{
  FP.compile(conservatory.levels,conservatory);FP.setDoorOpen('chapel-c17',true);
  const from={x:186,y:116},to={x:186,y:115};
  assert.equal(FP.canStep(from.x,from.y,to.x,to.y,{keys:new Set(['chapel'])}).ok,true,'fixture is a legal ordinary production step through the active door leaf');
  const save={run:{id:context.runId,status:'active'},flags:{[D.CHAPEL_TAPE_DEMAND_FLAG]:depart()},encounters:{cleared:['chapel']},area:'conservatory',chunkSurf:{finale:{route:'chapel'}}};
  let writes=0;
  const host={...D,FP,CELL,CHAPEL_TAPE_DEMAND_FLAG:D.CHAPEL_TAPE_DEMAND_FLAG,px:from.x,py:from.y,storyMode:true,usingPlan:()=>true,usingSpecialSpace:()=>false,
    ENCOUNTERS:{encounterCleared:()=>true},SOURCE_FINALE_ROUTE:{CHAPEL:'chapel'},normalizeChunkSurfState:value=>value,getSave:()=>save,
    saveCommit:patch=>{Object.assign(save,patch);writes++;},tapeDemandWallContact:wallContactAt,performance:{now:()=>5000},
    escape:{kind:'inversion',stage:'door',deadlineMs:58000},activeEndingCutscene:null,sourceContinuationScene:null,endingTimeline:null,endingManifest:()=>null,
    R3:{r3dChapelTapeDemandReady:()=>true,r3dLookAngles:()=>({yaw:0,pitch:-.1}),r3dSetLookAngles:()=>{}},fireCue:()=>{},
    PROPS:{propCanOccupy:()=>true},applyLensPreset:()=>{},renderMove:null,motionRig:null,trail:[],finaleActive:false,
    MAIN_EXIT_CELL:{x:79,y:3}};
  vm.createContext(host);vm.runInContext('let chapelTapeTugHeld=false,chapelTapeSavedProgress=0;'+block('function chapelTapeDemandContext(){','// The last walk owns a physical progression'),host);
  assert.equal(vm.runInContext('chapelTapeDemandBeforeStep({x:186,y:116},{x:186,y:115})',host),true);
  const caughtState=save.flags[D.CHAPEL_TAPE_DEMAND_FLAG];assert.equal(caughtState.status,'caught');assert.equal(caughtState.catch.group,'upper');assert.equal(caughtState.departure.remainingMs,53000);assert.equal(host.escape.deadlineMs,null);assert.ok(writes>0);
  host.escape=null;host.px=10;host.py=10;
  assert.equal(vm.runInContext('restoreChapelTapeDemandDeparture()',host),true);assert.equal(host.px,186);assert.equal(host.py,116);assert.equal(host.escape.stage,'door');assert.equal(host.escape.deadlineMs,null);
  save.encounters.cleared=[];host.ENCOUNTERS.encounterCleared=()=>false;
  assert.equal(vm.runInContext('chapelTapeDemandState().status',host),'dormant','a raw checkpoint cannot substitute for an actual encounter win');
});
