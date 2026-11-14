import test from 'node:test';
import assert from 'node:assert/strict';
import {stationFieldVisit,STATION_FIELD_VISITS} from '../src/data/station-field-visits.js';
import {MEMORY_FIELD_VISIT} from '../src/data/memory-field.js';
import {memoryFieldRenderFrame} from '../src/render/memory-field-frame.js';
import {createStationFieldScene,normalizeStationFieldCheckpoint,walkStationField,stationFieldFocus,stationFieldReceipt} from '../src/game/station-field-scene.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChapelOutskirtsGodPreset} from '../src/game/chunk-surf-god.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`);
const clone=value=>JSON.parse(JSON.stringify(value));
async function make(fieldId='third',options={}){
 const visit=stationFieldVisit(fieldId,{connectionId:options.connectionId||'field-return'}),frames=[],saves=[],returns=[],overlays=[];
 const renderer={initialize:async v=>{assert.equal(v,visit.memoryVisit);return true;},render(state,look){frames.push({state:structuredClone(state),look,actual:memoryFieldRenderFrame(state,visit.memoryVisit,{hasWheel:false})});return true;},disposed:0,dispose(){this.disposed++;}};
 const audio={started:0,stopped:0,updates:[],events:[],event(v){this.events.push(v);},start(v){this.started++;assert.equal(v,visit.memoryVisit);},update(...values){this.updates.push(values);},setPaused(value){this.paused=value;},stop(){this.stopped++;}};
 const scene=createStationFieldScene({visit,renderer,audio,onCheckpoint:(value,reason)=>saves.push({value,reason}),onDone:value=>returns.push(value),paintOverlay:value=>overlays.push(value),...options});
 await scene.initialize();return{scene,visit,renderer,audio,frames,saves,returns,overlays};
}
function walkToward(scene,x,z,maxDistance=1.4){
 for(let n=0;n<2000;n++){
  const at=scene.serialize(),dx=x-at.x,dz=z-at.z,distance=Math.hypot(dx,dz);if(distance<=maxDistance+1e-7)return;
  scene.setLook({yaw:Math.atan2(dx,-dz)});scene.input('forward',true);scene.update(Math.min(.1,(distance-maxDistance)/2.4));scene.input('forward',false);
 }
 throw Error('No ordinary field approach');
}
function inspect(scene,visit){const at=scene.serialize(),target=visit.landmark,d=Math.hypot(target.x-at.x,target.z-at.z);scene.setLook({yaw:Math.atan2(target.x-at.x,-(target.z-at.z)),pitch:Math.atan2(target.height-1.62,Math.max(.05,d))});assert.equal(scene.interact(),true);}
function leave(scene,visit){walkToward(scene,visit.returnDoor.x,visit.returnDoor.z,.5);scene.setLook({yaw:Math.PI,pitch:0});assert.equal(scene.interact(),true);for(let n=0;n<6;n++){scene.update(.1);scene.render();}}

test('station data references the actual first-fourth templates and reserves canonical fifth',()=>{
 assert.deepEqual(Object.keys(STATION_FIELD_VISITS),['first','second','third','fourth']);assert.equal(stationFieldVisit('fifth'),null);
 for(const id of Object.keys(STATION_FIELD_VISITS)){
  const v=stationFieldVisit(id,{connectionId:'field-return-a'});assert.equal(v.memoryVisit,MEMORY_FIELD_VISIT[id]);assert.equal(v.connectionId,'field-return-a');assert.equal(v.returnDoor.open,true);
 }
 assert.equal(stationFieldVisit('third',{connectionId:'forged-lock'}).connectionId,'field-return');
});

test('actual field render frames retain their source objects, while ant and breath never seize look or the body',async()=>{
 for(const id of ['first','second','third','fourth']){
  const h=await make(id);assert.equal(h.scene.allowsLook,true);const before=h.scene.lookAngles();h.scene.lookBy(.7,-.4);h.scene.update(.1);near(h.scene.lookAngles().yaw,before.yaw+.7);near(h.scene.lookAngles().pitch,before.pitch-.4);
  h.scene.render();assert.ok(h.frames.at(-1).actual.props.some(p=>p.mesh==='mf_ground'));
  if(id==='second')assert.ok(h.frames.at(-1).actual.props.some(p=>p.id==='memory-field:ant'));
  if(id==='third'||id==='fourth')assert.ok(h.frames.at(-1).actual.props.some(p=>p.mesh==='mf_door_leaf'));
  assert.equal(h.frames.at(-1).state.connectionId,'field-return');assert.deepEqual(h.frames.at(-1).state.returnDoor,h.visit.returnDoor);h.scene.exit();
 }
});

test('walking is exactly2.4m/s at ordinary frame cadences, with normalized diagonal and bounded stalled frames',()=>{
 const visit=stationFieldVisit('first'),fresh=normalizeStationFieldCheckpoint(null,visit);fresh.yaw=0;
 for(const dt of [.1,.05,1/60]){let state={...fresh};for(let n=0;n<Math.round(1/dt);n++)state=walkStationField(state,visit,{dt,forward:1}).state;near(Math.hypot(state.x-fresh.x,state.z-fresh.z),2.4);}
 const cardinal=walkStationField(fresh,visit,{dt:.1,forward:1}),diagonal=walkStationField(fresh,visit,{dt:.1,forward:1,side:1});near(cardinal.distance,.24);near(diagonal.distance,.24);
 near(walkStationField(fresh,visit,{dt:99,forward:1}).distance,.24);
});

test('unlimited waiting does not force a visit to end or manufacture a witness',async()=>{
 const h=await make('fourth');for(let n=0;n<5000;n++)h.scene.update(.1);
 assert.ok(h.scene.serialize().elapsed>499);assert.equal(h.scene.serialize().stage,'active');assert.equal(h.scene.serialize().witness.inspected,false);assert.equal(h.returns.length,0);
 assert.equal(h.scene.view().deformation.active,false,'unexplained time pressure does not start on entry');h.scene.exit();
});

test('the familiar van leaf and actual return posts refuse the body, while the clear opening exits only outward',()=>{
 const visit=stationFieldVisit('third');let at=normalizeStationFieldCheckpoint(null,visit);at.x=visit.memoryVisit.door.x;at.z=visit.memoryVisit.door.z+1;at.yaw=0;
 for(let n=0;n<15;n++)at=walkStationField(at,visit,{dt:.1,forward:1}).state;
 assert.ok(at.z>=visit.memoryVisit.door.z+.22,'no ordinary body tunnels through the closed van leaf');assert.equal(at.stage,'active');
 for(const x of [-.62,.62]){at=normalizeStationFieldCheckpoint(null,visit);at.x=x;at.z=2;at.yaw=Math.PI;for(let n=0;n<15;n++)at=walkStationField(at,visit,{dt:.1,forward:1}).state;assert.ok(at.z<3);assert.equal(at.stage,'active');}
 at=normalizeStationFieldCheckpoint(null,visit);at.z=2.9;at.yaw=Math.PI;let result=walkStationField(at,visit,{dt:.1,forward:1});assert.equal(result.returned,false,'head/body overlap with the door does not count as a whole-body exit');result=walkStationField(result.state,visit,{dt:.1,forward:1});assert.equal(result.returned,true);assert.equal(result.state.stage,'returning');near(result.state.z,3.22);
 at={...at,z:3.2,yaw:0};assert.equal(walkStationField(at,visit,{dt:.1,forward:1}).returned,false,'entering from behind cannot masquerade as leaving');
});

test('a return without a witnessed landmark is valid retreat and never releases a lock',async()=>{
 const h=await make('first');leave(h.scene,h.visit);assert.equal(h.returns.length,1);assert.equal(h.returns[0].meaningful,false);assert.equal(h.returns[0].receipt,null);h.scene.update(1);assert.equal(h.returns.length,1);h.scene.exit();assert.equal(h.audio.stopped,1);assert.equal(h.renderer.disposed,1);
});

test('each prescribed connection earns a receipt only after real approach, aimed inspection and actual outward return',async()=>{
 for(const[fieldId,connectionId]of[['first','field-return'],['second','field-return'],['third','field-return-a'],['fourth','field-return-b']]){
  const h=await make(fieldId,{connectionId});assert.equal(h.scene.interact(),false,'no remote source inspection from the spawn');
  walkToward(h.scene,h.visit.landmark.x,h.visit.landmark.z,1.2);inspect(h.scene,h.visit);
  assert.equal(h.scene.serialize().witness.inspected,true);assert.ok(h.saves.some(s=>s.reason==='landmark-inspected'));assert.equal(h.returns.length,0);
  for(let n=0;n<50;n++)h.scene.update(.1);assert.equal(h.scene.view().deformation.phase,'unmaking','Ophanim work follows recognition and an observable warning');
  leave(h.scene,h.visit);assert.equal(h.returns.length,1);assert.equal(h.returns[0].meaningful,true);
  assert.deepEqual(h.returns[0].receipt,{fieldId,landmarkWitnessed:true,returned:true,connectionId});h.scene.exit();
 }
});

test('reload preserves ordinary local pose, inspection and demolition state without claiming return ahead of crossing',async()=>{
 const first=await make('third',{connectionId:'field-return-a'});walkToward(first.scene,first.visit.landmark.x,first.visit.landmark.z);inspect(first.scene,first.visit);
 for(let n=0;n<80;n++)first.scene.update(.1);first.scene.lookBy(.31,-.1);const saved=first.scene.serialize(),deformation=first.scene.view().deformation;first.scene.exit();
 const resumed=await make('third',{connectionId:'field-return-a',checkpoint:clone(saved)});assert.deepEqual(resumed.scene.serialize(),saved);assert.deepEqual(resumed.scene.view().deformation,deformation);assert.equal(resumed.returns.length,0);
 leave(resumed.scene,resumed.visit);assert.equal(resumed.returns[0].meaningful,true);resumed.scene.exit();
 const mismatch=normalizeStationFieldCheckpoint(saved,stationFieldVisit('third',{connectionId:'field-return-b'}));assert.equal(mismatch.witness.inspected,false,'a checkpoint cannot lend its witnessed connection to another lock');
});

test('pause, focus loss and hidden rendering freeze both accepted movement and authored work, with held keys cleared',async()=>{
 let hidden=false,focused=true;const h=await make('first',{presentation:()=>({hidden,focused})});h.scene.key({key:'w'});h.scene.update(.1);h.scene.pause();const saved=h.scene.serialize();h.scene.update(1);assert.deepEqual(h.scene.serialize(),saved);h.scene.resume();h.scene.update(.1);near(h.scene.serialize().z,saved.z);
 h.scene.key({key:'w'});hidden=true;const before=h.scene.serialize();h.scene.update(5);assert.deepEqual(h.scene.serialize(),before);hidden=false;focused=false;h.scene.update(5);assert.deepEqual(h.scene.serialize(),before);focused=true;h.scene.update(.1);near(h.scene.serialize().z,before.z);
 assert.equal(h.scene.key({key:'Escape'}),false,'the normal pause owner retains Escape');h.scene.exit();
});

test('loading or failure cannot create progress, and a late initialization after exit releases its rendering once',async()=>{
 const visit=stationFieldVisit('first');let complete,disposed=0;const saves=[],returns=[];
 const scene=createStationFieldScene({visit,renderer:{initialize:()=>new Promise(r=>complete=r),render:()=>true,dispose:()=>disposed++},onCheckpoint:v=>saves.push(v),onDone:r=>returns.push(r)});
 const pending=scene.initialize();await Promise.resolve();scene.key({key:'w'});scene.update(1);assert.equal(scene.serialize().elapsed,0);scene.exit();complete(true);assert.equal(await pending,false);assert.equal(disposed,1);assert.equal(returns.length,0);
 const failed=createStationFieldScene({visit,renderer:{initialize:async()=>false,render:()=>true},onDone:r=>returns.push(r)});assert.equal(await failed.initialize(),false);assert.equal(returns.length,1);assert.equal(returns[0].meaningful,false);assert.equal(returns[0].receipt,null);failed.exit();
});

test('plain saved state strips unrelated canonical/recorder data and requires a physical return reason for a receipt',()=>{
 const visit=stationFieldVisit('third'),clean=normalizeStationFieldCheckpoint({version:1,fieldId:'third',connectionId:'field-return',x:Infinity,z:NaN,yaw:Infinity,pitch:Infinity,elapsed:NaN,witness:{landmarkId:'field-van-door',inspected:true,at:0},rec:{takes:['forged']},flags:{'memory.field.fifth':true}},visit);
 assert.equal(Number.isFinite(clean.x)&&Number.isFinite(clean.z)&&Number.isFinite(clean.yaw),true);assert.equal('rec' in clean,false);assert.equal('flags' in clean,false);assert.equal(stationFieldReceipt(clean,visit),null);
 assert.equal(stationFieldReceipt({...clean,stage:'returning',returnReason:'timer'},visit),null);
 assert.equal(stationFieldReceipt({...clean,stage:'returning',returnReason:'used-return',connectionId:'field-return-a'},visit),null);
 assert.equal(stationFieldFocus({...clean,x:100,z:100},visit),null);
});

test('inspection captions expire after five active seconds and van handles use the existing physical try sound',async()=>{
 const h=await make('third');walkToward(h.scene,h.visit.landmark.x,h.visit.landmark.z);inspect(h.scene,h.visit);h.scene.render();assert.equal(h.overlays.at(-1).caption,h.visit.landmark.text);assert.deepEqual(h.audio.events,[{type:'try'}]);
 h.scene.pause();for(let n=0;n<100;n++)h.scene.update(.1);h.scene.render();assert.equal(h.overlays.at(-1).caption,h.visit.landmark.text);h.scene.resume();for(let n=0;n<51;n++)h.scene.update(.1);h.scene.render();assert.equal(h.overlays.at(-1).caption,null);h.scene.exit();
});

test('foot contacts follow accepted body travel and neither waiting nor pause produces a contact',async()=>{
 const contacts=[],cleared=[],h=await make('first',{onFootContact:p=>contacts.push(p),clearFootContacts:owner=>cleared.push(owner)});
 for(let n=0;n<20;n++)h.scene.update(.1);assert.equal(contacts.length,0);h.scene.input('forward',true);for(let n=0;n<20;n++)h.scene.update(.1);h.scene.input('forward',false);
 assert.ok(contacts.length>=4&&contacts.length<12);assert.ok(contacts.every(p=>p.owner==='station-field'&&p.surface==='earth'&&p.distanceM>0));const before=contacts.length;h.scene.pause();for(let n=0;n<20;n++)h.scene.update(.1);assert.equal(contacts.length,before);assert.ok(cleared.includes('station-field'));h.scene.exit();
});

test('saved return-ready work retries its exact receipt after reload, and one scene never calls completion twice',async()=>{
 const h=await make('fourth',{connectionId:'field-return-b'});walkToward(h.scene,h.visit.landmark.x,h.visit.landmark.z);inspect(h.scene,h.visit);leave(h.scene,h.visit);const ready=h.scene.serialize();assert.equal(ready.stage,'returning');assert.equal(h.returns.length,1);
 const resumed=await make('fourth',{connectionId:'field-return-b',checkpoint:ready});resumed.scene.update(.1);assert.equal(resumed.returns.length,0,'reload cannot claim a black frame that belonged to the previous viewer');resumed.scene.render();assert.equal(resumed.overlays.at(-1).coverAlpha,1);assert.equal(resumed.returns.length,0);resumed.scene.update(.1);resumed.scene.update(.1);assert.equal(resumed.returns.length,1);assert.deepEqual(resumed.returns[0].receipt,h.returns[0].receipt);h.scene.exit();resumed.scene.exit();
});

test('actual scene receipt is consumed once by the real station runtime without changing canonical recording state',async()=>{
 const preset=buildChapelOutskirtsGodPreset(4,{seed:4417}),runtime=createSourceSpaceRuntime({initialState:preset.state});runtime.setPlayerPosition(preset.position);
 const before=structuredClone(runtime.state()),door=runtime.doorFieldDoors().find(d=>d.fieldId==='third'&&!d.shut);
 assert.equal(runtime.openDoorFieldDoor(door.id).opened,true);const side=sign=>({x:(door.threshold[0].x+door.threshold[1].x)/2+door.normal[0]*sign*1.5,y:(door.threshold[0].y+door.threshold[1].y)/2+door.normal[2]*sign*1.5,facing:0,yaw:.2,pitch:.1});
 const from=side(1),to=side(-1);runtime.setPlayerPosition(from);assert.equal(runtime.geometry.canStep(from.x,from.y,to.x,to.y).ok,true);runtime.onStep(from,to);
 const session=runtime.stationFieldFrame(),received=[],h=await make(session.fieldId,{connectionId:session.connectionId,onCheckpoint:value=>runtime.setStationFieldState(value),onDone:value=>received.push(runtime.finishStationFieldReturn(value))});
 walkToward(h.scene,h.visit.landmark.x,h.visit.landmark.z);inspect(h.scene,h.visit);leave(h.scene,h.visit);assert.equal(received.length,1);assert.equal(received[0].meaningful,true);assert.deepEqual(received[0].position,from);
 const consumed=structuredClone(runtime.state());assert.equal(runtime.finishStationFieldReturn(h.scene.serialize()),null);assert.deepEqual(runtime.state(),consumed,'retry after consumption is a no-op');
 for(const key of ['recorded','tuned','optionalTraces','recordingCustody'])assert.deepEqual(runtime.state()[key],before[key],`station receipt leaves ${key} intact`);
 assert.equal(Object.keys(runtime.state().flags||{}).some(k=>k.startsWith('memory.field.')),false);assert.equal(JSON.stringify(runtime.state()).includes('memory.field.fifth'),false);h.scene.exit();
});

test('async preparation completing under pause, hidden or lost focus cannot start audible field work',async()=>{
 for(const mode of ['paused','hidden','unfocused']){
  const visit=stationFieldVisit('first');let complete,hidden=false,focused=true,starts=0,stops=0;
  const scene=createStationFieldScene({visit,renderer:{initialize:()=>new Promise(resolve=>complete=resolve),render:()=>true},audio:{start(){starts++;},setPaused(){},stop(){stops++;}},presentation:()=>({hidden,focused})});
  const preparing=scene.initialize();await Promise.resolve();if(mode==='paused')scene.pause();if(mode==='hidden')hidden=true;if(mode==='unfocused')focused=false;
  complete(true);assert.equal(await preparing,true);assert.equal(starts,0,`${mode}: loading creates no unpaused bus`);scene.update(.1);scene.render();assert.equal(starts,0);assert.equal(scene.serialize().elapsed,0);
  scene.resume();hidden=false;focused=true;assert.equal(starts,0,'resume itself does not race the next active update');scene.update(.1);assert.equal(starts,1);scene.update(.1);assert.equal(starts,1);scene.exit();assert.equal(stops,1);
 }
});

test('an inspection before the first active update retains its handle sound until the lazy audio start',async()=>{
 const visit=stationFieldVisit('third'),checkpoint=normalizeStationFieldCheckpoint(null,visit);checkpoint.x=visit.landmark.x;checkpoint.z=visit.landmark.z+1.5;
 const h=await make('third',{checkpoint});assert.equal(h.audio.started,0);inspect(h.scene,h.visit);assert.deepEqual(h.audio.events,[]);h.scene.update(.1);assert.equal(h.audio.started,1);assert.deepEqual(h.audio.events,[{type:'try'}]);h.scene.exit();
});

test('return readiness cannot swap worlds until an opaque successful frame and the following active update',async()=>{
 const h=await make('first');h.scene.setLook({yaw:Math.PI,pitch:0});assert.equal(h.scene.interact(),true);
 for(let n=0;n<4;n++){h.scene.update(.1);h.scene.render();}assert.ok(h.overlays.at(-1).coverAlpha<1);assert.equal(h.returns.length,0);
 for(let n=0;n<20;n++)h.scene.update(.1);assert.equal(h.scene.serialize().returnElapsed,.45);assert.equal(h.returns.length,0,'update-only trigger tests cannot stand in for a presented final frame');assert.equal(h.saves.filter(s=>s.reason==='return-ready').length,1);
 h.scene.render();assert.equal(h.overlays.at(-1).coverAlpha,1);assert.equal(h.returns.length,0,'drawing the cover cannot retire the scene inside the render call');h.scene.update(.016);assert.equal(h.returns.length,1);h.scene.update(.1);assert.equal(h.returns.length,1);h.scene.exit();
});

test('a held or explicitly rejected opaque overlay cannot acknowledge a return presentation',async()=>{
 let accepted=false;const covers=[],h=await make('first',{paintOverlay:frame=>{covers.push(frame.coverAlpha);return accepted;}});h.scene.setLook({yaw:Math.PI,pitch:0});h.scene.interact();for(let n=0;n<5;n++)h.scene.update(.1);
 h.scene.render();h.scene.update(.1);assert.equal(h.returns.length,0,'overlay refusal is not a rendered cover');accepted=true;h.scene.pause();h.scene.render();h.scene.resume();h.scene.update(.1);assert.equal(h.returns.length,0,'a paused presentation did not earn an active-frame acknowledgement');
 h.scene.render();assert.equal(covers.at(-1),1);h.scene.update(.1);assert.equal(h.returns.length,1);h.scene.exit();
});
