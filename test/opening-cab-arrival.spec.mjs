import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {Ray,Vector3} from 'three';
import {createHash} from 'node:crypto';
import {OPENING_CAB_GEOMETRY} from '../src/data/opening-cab-object-geometry.js';
import {OPENING_CAB_OBJECTS,OPENING_CAB_VISIBLE_OBJECTS,OPENING_CAB_PLACEMENT,OPENING_CAB_PAPERS} from '../src/data/opening-cab-objects.js';
import * as scenes from '../src/game/scenes.js';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {createOpeningArrivalDrive,stepOpeningArrivalDrive,openingArrivalSnapshot} from '../src/game/opening-arrival-drive.js';
import {openingCabInstances,openingCabFocus,openingCabInspectionModel,openingCabInspectionLayout,makeOpeningCabInspectionScene,openingCabTargets,openingCabDoorTarget,OPENING_CAB_REQUIRED_MESHES} from '../src/game/opening-cab-inspection.js';
import {OPENING_VEHICLE,openingVehiclePoint} from '../src/data/opening-vehicle.js';
import {WORK_ORDER} from '../src/data/conservatory-script.js';
import {STORY_TARGET} from '../src/game/story-guidance.js';
import {freshFieldKit} from '../src/game/field-kit.js';
import {TECHNIQUE_DEFS} from '../src/game/combat-progression.js';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';

const target={x:16,y:0,z:8,yaw:Math.PI/2,zone:1,group:'ground'};
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function freeze(v){if(v&&typeof v==='object'){for(const value of Object.values(v))freeze(value);Object.freeze(v);}return v;}
function lookAt(frame,p){const dx=p.x-frame.eye.x,dz=p.z-frame.eye.z;return{...frame,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(p.y-frame.eye.y,Math.hypot(dx,dz))};}
function stationaryCheckpoint(){
  const drive=createOpeningArrivalDrive(target,{spawn:target});for(let n=0;n<60;n++)stepOpeningArrivalDrive(drive,1/120,{brake:true});
  assert.equal(drive.parked,true);return{schema:1,phase:'parked',reveal:1,drive:openingArrivalSnapshot(drive),headYaw:0,headPitch:-.04};
}
const ready=(extra={})=>{const s=makeOpeningVehicleScene({getAnchor:()=>target,getAssetStatus:()=>({loaded:true}),...extra});s.update(0);return s;};

test('a fresh driving arrival is already moving under power, while a checkpoint never restores a pedal or moving body',()=>{
  const d=createOpeningArrivalDrive(target,{alreadyDriving:true}),before={x:d.x,z:d.z};assert.ok(d.speed>0);assert.ok(d.throttle>0);
  for(let n=0;n<20;n++)stepOpeningArrivalDrive(d,1/120,{forward:true});assert.ok(Math.hypot(d.x-before.x,d.z-before.z)>.1);assert.ok(d.longitudinalAcceleration>0);
  const saved=openingArrivalSnapshot(d),resumed=createOpeningArrivalDrive(target,{alreadyDriving:true,checkpoint:copy(saved)});
  near(resumed.x,d.x);near(resumed.z,d.z);near(resumed.elapsed,d.elapsed);assert.equal(resumed.speed,0);assert.equal(resumed.throttle,0);
});

test('the actual scene advances vehicle physics during the fade before the first unobscured frame, without a start or confirm',()=>{
  const s=ready(),before=s.view();assert.equal(before.phase,'driving');assert.equal(before.reveal,0);assert.ok(before.drive.speed>0);
  s.update(1/60);const early=s.view();assert.ok(early.reveal>0&&early.reveal<1);assert.ok(early.drive.elapsed>0);
  assert.ok(Math.hypot(early.anchor.x-before.anchor.x,early.anchor.z-before.anchor.z)>.01);assert.ok(early.drive.speed>before.drive.speed);
  s.key({key:'Enter'});assert.equal(s.view().phase,'driving','confirm does not start or skip a moving vehicle');
  s.exit();
});

test('the final approach owns its pedals while blur and checkpoint recovery retain no player input',()=>{
  const s=ready(),initial=s.view();s.key({code:'Space'});s.key({code:'KeyA'});for(let n=0;n<60;n++)s.update(1/60);assert.ok(s.view().anchor.x>initial.anchor.x);near(s.view().anchor.yaw,initial.anchor.yaw);
  s.blur();const paused=copy(s.serialize());s.update(1);assert.deepEqual(s.serialize(),paused);s.resume();s.update(.1);assert.ok(s.view().drive.elapsed>paused.drive.elapsed);s.exit();
  const resumed=ready({checkpoint:{...paused,reveal:.2}});assert.equal(resumed.view().drive.speed,0);assert.equal(resumed.view().drive.throttle,0);resumed.update(.1);assert.ok(resumed.view().drive.speed>0,'the authored approach resumes without waiting for a pedal');resumed.exit();
});

test('asset preparation holds a black view, then the newly revealed body already has motion; no loading-time physics is fabricated',()=>{
  let loaded=false;const s=ready({getAssetStatus:()=>({loaded})});s.update(12);assert.equal(s.view().phase,'loading');assert.equal(s.view().drive,null);
  loaded=true;s.update(.1);assert.equal(s.view().phase,'driving');assert.equal(s.view().drive.elapsed,0);assert.equal(s.view().reveal,0);
  const at=s.view().anchor;s.update(.1);assert.ok(s.view().drive.elapsed>0);assert.ok(Math.hypot(s.view().anchor.x-at.x,s.view().anchor.z-at.z)>0);s.exit();
});

test('parked interaction follows the actual paper or door handle, never an empty-view exit shortcut',()=>{
  let inspect=0,doors=0;const s=ready({checkpoint:stationaryCheckpoint(),onInspect:value=>{inspect++;assert.equal(value.id,'job-papers');assert.equal(value.sectionId,undefined);return true;},onDoor:()=>doors++});
  const frame=s.view(),paper=openingCabInstances(frame.anchor)[0],aim=lookAt(frame,{x:paper.x,y:paper.y+.02,z:paper.z});
  s.lookBy(aim.yaw-frame.yaw,aim.pitch-frame.pitch);assert.equal(s.view().focus?.type,'inspect');s.key({code:'KeyE'});
  assert.equal(inspect,1);assert.equal(doors,0);assert.equal(s.view().phase,'parked');s.key({code:'KeyE',repeat:true});assert.equal(inspect,1);
  const looked=s.view();s.lookBy(target.yaw-looked.yaw,-.04-looked.pitch);s.key({code:'KeyE'});assert.equal(doors,0);assert.equal(s.view().phase,'parked');aimOpeningCabDoor(s);s.key({code:'KeyE'});assert.equal(doors,1);assert.equal(s.view().phase,'exiting');s.exit();
  const direct=ready({checkpoint:stationaryCheckpoint(),onDoor:()=>doors++});direct.key({controllerAction:'interact'});assert.equal(direct.view().phase,'parked');aimOpeningCabDoor(direct);direct.key({controllerAction:'interact'});assert.equal(direct.view().phase,'exiting');assert.equal(doors,2);direct.exit();
});

test('paper interaction follows the cabin in world space and is unavailable while moving or beyond the actual page',()=>{
  for(const yaw of[0,Math.PI/2,-1.1,Math.PI]){
    const anchor={...target,yaw},eye=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),instance=openingCabInstances(anchor,{paperIndex:27})[0],frame=lookAt({phase:'parked',anchor,eye},{x:instance.x,y:instance.y+.02,z:instance.z});
    const focus=openingCabFocus(frame);assert.equal(focus?.type,'inspect');assert.equal(instance.mesh,'loose_note');assert.equal(instance.paperIndex,27);
    near(instance.matrix[12],instance.x);near(instance.matrix[13],instance.y);near(instance.matrix[14],instance.z);
    assert.equal(openingCabFocus({...frame,phase:'driving'}),null);assert.equal(openingCabFocus({...frame,yaw:frame.yaw+1}),null);
  }
});

test('missing physical cab objects suppress inspection while preserving the actual door handle as the exit',()=>{
  let inspected=0,exited=0;
  const s=ready({checkpoint:stationaryCheckpoint(),getCabState:()=>({ready:false}),onInspect:()=>{inspected++;return true;},onDoor:()=>exited++});
  const frame=s.view(),paper=openingCabTargets(frame.anchor).find(t=>t.id==='job-papers'),aim=lookAt(frame,paper.position);
  s.lookBy(aim.yaw-frame.yaw,aim.pitch-frame.pitch);assert.equal(s.view().focus,null);s.key({key:'e'});
  assert.equal(inspected,0);assert.equal(exited,0);assert.equal(s.view().phase,'parked');aimOpeningCabDoor(s);s.key({key:'e'});assert.equal(exited,1);assert.equal(s.view().phase,'exiting');s.exit();
});

test('the real parked owner invokes each genuine cab belonging without routing it through the work order',()=>{
  const fieldKit={headphones:'closed',microphone:'wide',recorder:'headroom',flashlight:'throw',cosmetics:{faceplate:'olive',buttons:'signal',flashlightHousing:'ivory'}};
  for(const id of['notebook','self-check']){
    const received=[];const s=ready({checkpoint:stationaryCheckpoint(),getCabState:()=>({ready:true,fieldKit}),onInspect:value=>{received.push(value);return true;}});
    const frame=s.view(),aim=lookAt(frame,openingCabTargets(frame.anchor,{fieldKit}).find(t=>t.id===id).position);
    s.lookBy(aim.yaw-frame.yaw,aim.pitch-frame.pitch);assert.equal(s.view().focus?.id,id);s.key({key:'e'});
    assert.deepEqual(received.map(v=>v.id),[id]);assert.equal(s.view().phase,'parked');s.exit();
  }
});

test('the actual production opening filter retains the printed cab paper while still excluding unrelated world actors',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),filter=source.split('\n').find(line=>line.includes('if(openingAllowed){let write=0;'));
  assert.ok(filter,'the final production opening-owner filter must be reviewed if its owner changes');
  const apply=new Function('openingAllowed','doorDynamicCombined','count',`${filter}\nreturn doorDynamicCombined.slice(0,count);`),paper=openingCabInstances(target,{paperIndex:27})[0];
  const result=apply(new Set(),[paper,{id:'unrelated-courtyard-actor',mesh:'chair'}],2);
  assert.deepEqual(result,[paper]);assert.equal(result[0].paperIndex,27);assert.equal(result[0].mesh,'loose_note');
});

test('the real resident dashboard triangles cannot bury the lower face of the inspectable sheet',async()=>{
  const document=await new NodeIO().read(new URL('../public/assets/source-vehicle-interior.glb',import.meta.url).pathname),
    mesh=document.getRoot().listMeshes().find(m=>m.getName()==='opening_drive_cabin');assert.ok(mesh);
  const anchor={x:0,y:0,z:0,yaw:0},paper=openingCabInstances(anchor)[0],samples=[[0,0],[-.16,-.21],[-.16,.21],[.16,-.21],[.16,.21]];
  let supportSamples=0;
  for(const[lx,lz]of samples){
    const x=paper.matrix[0]*lx+paper.matrix[8]*lz+paper.x,z=paper.matrix[2]*lx+paper.matrix[10]*lz+paper.z-OPENING_VEHICLE.cabinMount[2];
    let highest=-Infinity;
    for(const primitive of mesh.listPrimitives()){
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
      for(let i=0;i<indices.length;i+=3){
        const a=positions.getElement(indices[i],[]),b=positions.getElement(indices[i+1],[]),c=positions.getElement(indices[i+2],[]),den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
        if(Math.abs(den)<1e-10)continue;
        const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
        if(u<-.00001||v<-.00001||w<-.00001)continue;
        const y=u*a[1]+v*b[1]+w*c[1];if(y>.9&&y<1.5)highest=Math.max(highest,y);
      }
    }
    if(Number.isFinite(highest)){supportSamples++;assert.ok(paper.y>=highest+.001,`paper base ${paper.y} must clear resident dash ${highest} at ${x},${z}`);}
  }
  assert.ok(supportSamples>=3,'the actual centre and rear edge retain a measured supporting fascia');
});

test('separate cab objects expose their own truthful live facts without granting ownership or accepting the assignment',()=>{
  const state=freeze({flags:{'bag.taken':false},fieldKit:{...freshFieldKit(),headphones:'closed'},
    recordist:{injuries:2,battery:.4,composure:6,composureCeiling:10},build:{unspent:1,techniques:['existing-technique']},
    guidance:STORY_TARGET.van,workOrder:WORK_ORDER,job:{done:0,total:5,rooms:[{roomId:'main_b3',label:'Studio B3',recorded:false}]},journal:[]});
  const before=copy(state),paper=openingCabInspectionModel(state,'job-papers'),notes=openingCabInspectionModel(state,'notebook'),mirror=openingCabInspectionModel(state,'self-check'),recorder=openingCabInspectionModel(state,'recorder');
  assert.equal(paper.workOrder,WORK_ORDER);assert.equal(paper.accepted,false);assert.equal(paper.instrument,null);assert.deepEqual(paper.facts,[]);
  assert.equal(notes.destination,STORY_TARGET.van.label);assert.deepEqual(notes.notes,[]);assert.equal(notes.workOrder,null);
  assert.deepEqual(mirror.facts.find(f=>f[0]==='COMPOSURE'),['COMPOSURE','6 / 10']);assert.deepEqual(mirror.facts.find(f=>f[0]==='INJURIES'),['INJURIES','2']);
  assert.equal(mirror.facts.some(f=>f[0]==='FIELD CELL'),false,'body status is not displayed on the recorder');assert.equal(mirror.reflectionSimulated,false);
  assert.deepEqual(recorder.instrument.facts.find(f=>f[0]==='FIELD CELL'),['FIELD CELL','40%']);assert.deepEqual(recorder.facts,[]);assert.equal(recorder.instrument.battleCapable,false);
  for(const id of['recorder','headphones','microphone','flashlight','amp']){const m=openingCabInspectionModel(state,id);assert.equal(m.kind,'instrument');assert.equal(m.workOrder,null);assert.deepEqual(m.notes,[]);assert.ok(!m.instrument.facts.some(f=>['POSITION','BATTLE','INJURIES'].includes(f[0])));}
  assert.match(openingCabInspectionModel(state,'headphones').instrument.description,/15%/);assert.equal('timeRemaining' in notes,false);assert.deepEqual(state,before);
});

test('cab belongings have reachable seated targets while all preparation equipment stays at the existing rear workbench',()=>{
  const ids=['job-papers','notebook','self-check','practice-note','first-take-note','recital-programme','radio'];
  assert.deepEqual(OPENING_CAB_VISIBLE_OBJECTS.map(object=>object.id),ids);
  assert.deepEqual(OPENING_CAB_OBJECTS.filter(object=>object.location==='rear-workbench').map(object=>object.id),
    ['recorder','headphones','microphone','flashlight','amp']);
  for(const yaw of[0,Math.PI/2,-1.1,Math.PI])for(const fieldKit of[freshFieldKit(),{headphones:'closed',microphone:'directional',recorder:'headroom',flashlight:'throw',cosmetics:{faceplate:'olive',buttons:'signal',flashlightHousing:'ivory'}},{headphones:'open',microphone:'wide',recorder:'low-draw',flashlight:'flood',cosmetics:{faceplate:'black',buttons:'sea-glass',flashlightHousing:'olive'}}]){
    const anchor={...target,yaw},eye=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),instances=openingCabInstances(anchor,{fieldKit}),meshNames=new Set(instances.map(p=>p.mesh));
    assert.deepEqual(openingCabTargets(anchor,{fieldKit}).map(object=>object.id),ids);
    assert.equal(instances.length,7,'the job paper and six dressing meshes are separate from the resident dashboard receiver');
    assert.ok(instances.every(p=>!p.mesh.includes('field_')&&!p.mesh.includes('headphones')&&!p.mesh.includes('microphone')&&!p.mesh.includes('flashlight')),
      'moving inspection targets also removes the visible duplicate kit and case');
    for(const object of openingCabTargets(anchor,{fieldKit})){
      const frame=lookAt({phase:'parked',anchor,eye},object.position),focus=openingCabFocus(frame,{fieldKit});assert.equal(focus?.id,object.id,object.id+' must remain a distinct physical target');
      const turn=Math.atan2(Math.sin(frame.yaw-yaw),Math.cos(frame.yaw-yaw));assert.ok(Math.abs(turn)<2.4);assert.ok(frame.pitch>=-1.2&&frame.pitch<=.75);
      if(object.id==='radio')assert.deepEqual(object.meshIds,['opening_drive_radio']);
      else assert.ok(object.meshIds.every(mesh=>meshNames.has(mesh)));
      assert.equal(openingCabFocus({...frame,phase:'driving'},{fieldKit}),null);
      assert.equal(openingCabFocus(frame,{fieldKit,ready:false})?.id||null,object.id==='radio'?'radio':null);
    }
    assert.ok(instances.every(p=>p.id.startsWith('opening:')),'production opening-owner filtering retains every separate object');
  }
});

test('the physical right-hand exit remains reachable even if optional cab objects have not loaded',()=>{
  for(const yaw of[0,Math.PI/2,-1.1,Math.PI]){
    const anchor={...target,yaw},eye=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),handle=openingCabDoorTarget(anchor).position,
      frame=lookAt({phase:'parked',anchor,eye},handle),turn=Math.atan2(Math.sin(frame.yaw-yaw),Math.cos(frame.yaw-yaw));
    assert.ok(Math.abs(turn)<2.4&&frame.pitch>=-1.2&&frame.pitch<=.75,"the actual driver's head can reach the exit handle");
    for(const ready of[true,false]){
      const focus=openingCabFocus(frame,{ready});assert.equal(focus?.type,'exit');assert.equal(focus.id,'driver-door');
      assert.deepEqual(focus.position,handle);
      assert.equal(openingCabFocus({...frame,yaw:frame.yaw+.4},{ready}),null,'the physical handle remains a deliberate look target');
    }
    assert.equal(openingCabFocus({...frame,phase:'driving'},{ready:false}),null,'no object or door interaction while moving');
  }
});

test('each direct close-up is fixed to its world object; tabs, number keys and arrows never traverse other belongings',()=>{
  const state=freeze({flags:{},fieldKit:freshFieldKit(),recordist:{injuries:0,battery:1},build:{unspent:0,techniques:[]},workOrder:WORK_ORDER,journal:[],guidance:STORY_TARGET.van});
  for(const object of OPENING_CAB_VISIBLE_OBJECTS.filter(object=>object.kind!=='radio')){let closed=0,papers=0,inspections=[],rotations=0,disposed=0;
    const s=makeOpeningCabInspectionScene({id:object.id,getState:()=>state,onClose:()=>closed++,makeReader:(value,options)=>{papers++;assert.equal(value,object.id==='job-papers'?WORK_ORDER:OPENING_CAB_PAPERS.find(paper=>paper.id===object.documentId));assert.equal(typeof options.onSceneClose,'function');return{enter(){},view:()=>({reading:false}),key(){},render(){},update(){}};},makeInspection:value=>{inspections.push(value.id);return{draw(){},key(){rotations++;},dispose(){disposed++;}};}});
    s.enter();s.render();const original=copy(s.view().model);assert.equal(s.view().objectId,object.id);assert.equal(s.view().readOnly,true);assert.equal(typeof s.selectSection,'undefined');
    for(const key of['Tab','1','2','3','4','ArrowDown','ArrowLeft'])s.key({key});s.key({controllerAction:'tabNext'});s.render();assert.equal(s.view().objectId,object.id);assert.deepEqual(s.view().model,original);
    assert.equal(papers,object.kind==='document'?1:0);assert.equal(inspections.length,object.kind==='instrument'?1:0);if(object.kind==='instrument')assert.equal(rotations,2);
    assert.deepEqual(s.view().hitRegions.map(h=>h.id),['cab-object:close']);
    s.key({code:'KeyE',repeat:true});assert.equal(closed,0);s.key({code:'KeyE'});assert.equal(closed,1);s.key({code:'KeyE'});assert.equal(closed,1);assert.equal(disposed,object.kind==='instrument'?1:0);
  }
  assert.equal(state.flags['bag.taken'],undefined);assert.equal(state.flags['work-order.accepted'],undefined);assert.equal(state.flags['radio.work-order-read'],undefined);
});

test('self-check lists the genuine patched techniques without medical paperwork, a simulated face or skill editing',()=>{
  const technique=TECHNIQUE_DEFS.find(t=>t.id==='nerve.deep-reserve'),state=freeze({flags:{'kit.fitted':false},build:{techniques:[technique.id],unspent:2},fieldKit:{...freshFieldKit(),headphones:'closed'}});
  const m=openingCabInspectionModel(state,'self-check');assert.deepEqual(m.techniques,[{id:technique.id,label:technique.label,detail:technique.detail,branch:technique.branch,tier:technique.tier}]);
  assert.equal(m.reflectionSimulated,false);assert.equal(m.workOrder,null);assert.equal(m.instrument,null);assert.equal('actions' in m,false);
});

test('the actual instrument description and live facts use readable light ink on the charcoal inspection field',()=>{
  const source=readFileSync(new URL('../src/game/opening-cab-inspection.js',import.meta.url),'utf8'),start=source.indexOf('        const entry=m.instrument,wide='),end=source.indexOf('\n      }else{',start);
  assert.ok(start>=0&&end>start,'review the instrument-render fixture when its owner changes');
  const draw=new Function('m','l','instrument','scenes','scene','uiWrap','uiInk','ink','color',source.slice(start,end)),calls=[];
  const m=openingCabInspectionModel({fieldKit:freshFieldKit(),recordist:{battery:.4}},'recorder'),l=openingCabInspectionLayout({cols:120,rows:40});
  draw(m,l,()=>({draw(){}}),{isFrozen:()=>false},{},(line)=>[line],(x,y,line,options)=>calls.push({line,options}),()=>{},'#c5c9b9');
  assert.ok(calls.some(row=>row.line===m.instrument.description));assert.ok(calls.some(row=>row.line==='FIELD CELL / 40%'));
  assert.ok(calls.every(row=>row.options?.color==='#c5c9b9'),'every instrument body row receives explicit light ink instead of the dark paper default');
});

test('a direct object freezes the parked cabin and E returns to the same owner without inspection prerequisites for exit',()=>{
  scenes.clear();const cab=ready({checkpoint:stationaryCheckpoint()});scenes.push(cab);const initial=copy(cab.serialize());
  const object=makeOpeningCabInspectionScene({id:'self-check',getState:()=>({recordist:{injuries:0}})});scenes.push(object);scenes.update(2);assert.deepEqual(cab.serialize(),initial);
  object.key({key:'e'});assert.equal(scenes.top(),cab);assert.equal(cab.view().phase,'parked');assert.equal(cab.view().drive.throttle,0);cab.key({key:'e'});assert.equal(cab.view().phase,'parked');aimOpeningCabDoor(cab);cab.key({key:'e'});assert.equal(cab.view().phase,'exiting');scenes.clear();
});

test('the close control activates only on matching press/release and its layout remains within the viewport',()=>{
  let closed=0;const s=makeOpeningCabInspectionScene({id:'self-check',onClose:()=>closed++}),hit=s.view().hitRegions[0];
  s.pointer({type:'pointerdown',cellX:hit.x+.1,cellY:hit.y+.1,pointerId:1,button:0});s.pointer({type:'pointerup',cellX:0,cellY:0,pointerId:1});assert.equal(closed,0);
  s.pointer({type:'pointerdown',cellX:hit.x+.1,cellY:hit.y+.1,pointerId:2,button:0});s.pointer({type:'pointerup',cellX:hit.x+.1,cellY:hit.y+.1,pointerId:2});assert.equal(closed,1);
  for(const size of[{cols:20,rows:12},{cols:80,rows:30},{cols:140,rows:52}]){const l=openingCabInspectionLayout(size);assert.ok(l.x>=0);assert.ok(l.x+l.w<=size.cols);assert.ok(l.footer.y<size.rows);assert.equal(l.tabs,undefined);}
});

test('the separate cab pack contains the actual declared models, bounded geometry and provenance of each canonical source',async()=>{
  const bytes=readFileSync(new URL('../public/assets/opening-cab-objects.glb',import.meta.url)),stats=JSON.parse(readFileSync(new URL('../public/assets/opening-cab-objects.stats.json',import.meta.url),'utf8')),doc=await new NodeIO().readBinary(bytes),meshes=new Map(doc.getRoot().listMeshes().map(m=>[m.getName(),m]));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),OPENING_CAB_GEOMETRY.sha256);assert.equal(stats.sha256,OPENING_CAB_GEOMETRY.sha256);assert.deepEqual([...meshes.keys()].sort(),[...OPENING_CAB_REQUIRED_MESHES].sort());
  assert.ok(bytes.length<stats.limits.maxBytes);assert.ok(stats.totalTriangles<stats.limits.maxStoredTriangles);assert.equal(doc.getRoot().listTextures().length,0);
  for(const source of stats.sources){assert.equal(createHash('sha256').update(readFileSync(new URL('../'+source.file,import.meta.url))).digest('hex'),source.sha256);}
  const selected=openingCabInstances(target),triangles=selected.reduce((sum,p)=>sum+(OPENING_CAB_GEOMETRY.meshes.find(m=>m.mesh===p.mesh)?.triangles||0),0);assert.ok(triangles<stats.limits.maxDisplayedTriangles);
  for(const record of OPENING_CAB_GEOMETRY.meshes){const mesh=meshes.get(record.mesh);assert.ok(mesh);for(const primitive of mesh.listPrimitives()){const p=primitive.getAttribute('POSITION'),idx=primitive.getIndices().getArray();assert.equal(idx.length%3,0);for(let i=0;i<p.getCount();i++){const v=p.getElement(i,[]);for(let k=0;k<3;k++)assert.ok(v[k]>=record.bounds.min[k]-1e-6&&v[k]<=record.bounds.max[k]+1e-6);}}}
  assert.equal(stats.registration.case.yaw,-Math.PI/2,'the original open face is physically turned toward the seated driver');
});

test('the notebook and mirror are visually unobstructed from the seated eye in the actual exported cabin geometry',async()=>{
  const io=new NodeIO(),doc=await io.read(new URL('../public/assets/source-vehicle-interior.glb',import.meta.url).pathname),pack=await io.read(new URL('../public/assets/opening-cab-objects.glb',import.meta.url).pathname),anchor={x:0,y:0,z:0,yaw:0},eye=new Vector3(...OPENING_VEHICLE.eye),selected=new Set(openingCabInstances(anchor).map(p=>p.mesh)),triangles=[];
  for(const d of[doc,pack])for(const m of d.getRoot().listMeshes())if(d===doc?m.getName()==='opening_drive_cabin':selected.has(m.getName()))for(const primitive of m.listPrimitives()){const p=primitive.getAttribute('POSITION'),idx=primitive.getIndices().getArray();for(let i=0;i<idx.length;i+=3)triangles.push({mesh:m.getName(),points:[0,1,2].map(k=>new Vector3(...p.getElement(idx[i+k],[])))});}
  for(const target of openingCabTargets(anchor).filter(t=>['notebook','self-check'].includes(t.id))){const end=new Vector3(...target.localPoint),ray=new Ray(eye,end.clone().sub(eye).normalize());let nearest=null;
    for(const row of triangles){const hit=ray.intersectTriangle(...row.points,false,new Vector3());if(hit){const distance=hit.distanceTo(eye);if(!nearest||distance<nearest.distance)nearest={mesh:row.mesh,distance};}}
    assert.ok(nearest,target.id);assert.ok(target.meshIds.includes(nearest.mesh),target.id+' is occluded by '+nearest.mesh);assert.ok(nearest.distance<=eye.distanceTo(end)+.02);
  }
});
