import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGetInDriveTeaserScene} from '../src/game/get-in-drive-teaser-scene.js';
import {DOOR_DRIVE_TEASER as C} from '../src/game/source-drive/door-teaser.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture({fetchGate=null,rendererGate=null,audioGate=null,fetchOK=true,rendererOK=true,audioError=null,onRestore=null,onDoorsClose=null,onReturnTick=null}={}){
 const calls=[],counts={fetch:0,rendererInitialize:0,rendererDispose:0,render:0,readout:0,audioCreate:0,audioInitialize:0,audioDispose:0,controllerStart:0,controllerDispose:0,restore:0,close:0,done:0,exit:0,pause:0,joint:0},errors=[],completed=[],covers=[];
 const state={held:false,time:0,started:false,controllerPaused:false,audioPaused:null,disposed:false,rejectRender:false},context={id:'existing-context'},destination={id:'existing-monitor'},metrics={id:'owned-metrics'};
 const mark=(event,detail)=>calls.push({event,time:state.time,detail});
 const renderer={
  async initialize(){counts.rendererInitialize++;mark('renderer-initialize');if(rendererGate)await rendererGate.promise;return rendererOK;},
  dispose(){counts.rendererDispose++;mark('renderer-dispose');},
  setRecorderReadout(value){counts.readout++;mark('readout',value);},
  render(value){counts.render++;mark('render',value);return!state.rejectRender;},
 };
 const audio={
  async initialize(){counts.audioInitialize++;mark('audio-initialize');if(audioGate)await audioGate.promise;if(audioError)throw audioError;},
  setPaused(value){state.audioPaused=value;mark('audio-pause',value);},
  sync(...args){mark('audio-sync',args);},joint(value){counts.joint++;mark('joint',value);},
  dispose(){counts.audioDispose++;mark('audio-dispose');},diagnostics(){return{paused:state.audioPaused};},
 };
 const phase=()=>state.time<C.soundLeadEnd?'sound-lead':state.time<C.impactStart?'approach':state.time<C.returnStart?'impact-black':state.time<C.duration?'return':'complete';
 const controller={
  start(){counts.controllerStart++;state.started=true;mark('controller-start');},
  setPaused(value){state.controllerPaused=value;mark('controller-pause',value);},
  update(dt){if(state.started&&!state.controllerPaused)state.time=Math.min(C.duration,state.time+dt);},
  frame(value){assert.equal(value,metrics);const returned=state.time>=C.impactStart;return{phase:phase(),timeSec:state.time,paused:state.controllerPaused,worldOwner:returned?'return':'drive',finished:state.time>=C.duration,coverAlpha:state.time<C.soundLeadEnd||returned&&state.time<C.returnStart?1:returned?Math.max(0,1-(state.time-C.returnStart)/(C.duration-C.returnStart)):0,renderFrame:returned?null:{driveState:{speed:7,time:state.time},scene:{cut:{sources:[]},predicaments:{sources:[]}},weather:{},evolution:{}}};},
  dispose(){counts.controllerDispose++;state.disposed=true;mark('controller-dispose');},
 };
 const scene=makeGetInDriveTeaserScene({context,destination,
  fetcher:async url=>{counts.fetch++;mark('fetch',url);if(fetchGate)await fetchGate.promise;return{ok:fetchOK,json:async()=>metrics};},
  createRenderer:()=>renderer,createController:()=>controller,
  createAcoustics:options=>{assert.equal(options.context,context);assert.equal(options.destination,destination);assert.equal(options.gain,.5);assert.equal(options.tapeTransport,undefined);counts.audioCreate++;mark('audio-create');return audio;},
  isHeld:()=>state.held,paintCover:value=>covers.push({time:state.time,alpha:value}),
  onRestore:()=>{counts.restore++;mark('restore');onRestore?.();},
  onDoorsClose:()=>{counts.close++;mark('doors-close');onDoorsClose?.();},
  onReturnTick:dt=>{mark('return-tick',dt);onReturnTick?.(dt);},
  onDone:value=>{counts.done++;completed.push(value);mark('done',value);},
  onPause:()=>{counts.pause++;mark('pause');},onError:error=>{errors.push(error);mark('error',error);},onExit:()=>{counts.exit++;mark('exit');},
 });
 const advance=seconds=>{for(let left=seconds;left>1e-8;left-=.1)scene.update(Math.min(.1,left));};
 const prepare=async()=>{advance(.3);assert.ok(scene.pending());await scene.pending();};
 return{scene,state,calls,counts,errors,completed,covers,advance,prepare};
}

test('the title stays opaque before async acquisition and one owned context supplies a transient drive',async()=>{
 const gate=deferred(),h=fixture({fetchGate:gate});assert.equal(h.scene.worldPresentation,'hidden');h.scene.render();assert.equal(h.covers.at(-1).alpha,1,'the very first host paint cannot flash the room after the title');assert.equal(h.counts.fetch,0);h.advance(.2);h.scene.render();assert.equal(h.scene.worldPresentation,'hidden');assert.equal(h.covers.at(-1).alpha,1);assert.equal(h.counts.fetch,0);
 h.advance(.1);h.scene.render();assert.equal(h.scene.worldPresentation,'hidden');assert.equal(h.covers.at(-1).alpha,1);assert.equal(h.counts.fetch,1);
 h.advance(1);assert.equal(h.state.time,0);assert.equal(h.counts.render,0);assert.equal(h.counts.audioCreate,0);
 gate.resolve();assert.equal(await h.scene.pending(),true);assert.equal(h.counts.controllerStart,1);assert.equal(h.counts.rendererInitialize,1);assert.equal(h.counts.readout,1);
 const create=h.calls.findIndex(c=>c.event==='audio-create'),initialize=h.calls.findIndex(c=>c.event==='audio-initialize');assert.ok(h.calls.slice(create+1,initialize).some(c=>c.event==='audio-pause'&&c.detail===true),'new audio is held before initialization');
 h.advance(.1);assert.equal(h.counts.render,1);assert.equal(h.calls.find(c=>c.event==='render').detail.cinematicLook,true);h.scene.exit();h.scene.exit();assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.audioDispose,1);assert.equal(h.counts.controllerDispose,1);assert.equal(h.counts.exit,1);
});

test('preparation completing under a held menu stays silent and its saved clock resumes exactly',async()=>{
 const gate=deferred(),h=fixture({fetchGate:gate});h.advance(.3);h.state.held=true;h.scene.update(.1);gate.resolve();await h.scene.pending();assert.equal(h.state.audioPaused,true);assert.equal(h.state.controllerPaused,true);
 h.advance(2);assert.equal(h.state.time,0);assert.equal(h.counts.render,0);h.state.held=false;h.advance(.2);assert.ok(Math.abs(h.state.time-.2)<1e-9);
 h.scene.key({key:'Escape'});assert.equal(h.scene.view().paused,true,'the key edge exposes pause before a covered scene stops updating');h.state.held=true;const t=h.state.time;h.advance(1);assert.equal(h.state.time,t);assert.equal(h.scene.view().paused,true);assert.equal(h.state.audioPaused,true);assert.equal(h.counts.pause,1);h.scene.key({key:'Escape',repeat:true});assert.equal(h.counts.pause,1);
 h.scene.resume();h.state.held=false;h.advance(.1);assert.ok(Math.abs(h.state.time-(t+.1))<1e-9);assert.equal(h.scene.view().paused,false,'the first resumed update refreshes the public snapshot');h.scene.exit();
});

test('the global pause route freezes audio and its public view without dispatching a scene key or update',async()=>{
 const h=fixture();await h.prepare();h.advance(2);const time=h.state.time,renders=h.counts.render,syncs=h.calls.filter(c=>c.event==='audio-sync').length;
 h.state.held=true;h.scene.setPaused(true);assert.equal(h.scene.view().paused,true);assert.equal(h.state.audioPaused,true);
 for(let i=0;i<20;i++)h.scene.render();assert.equal(h.state.time,time);assert.equal(h.counts.render,renders);assert.equal(h.calls.filter(c=>c.event==='audio-sync').length,syncs);assert.equal(h.counts.pause,0,'the global menu owns its own pause action');
 const unpauses=h.calls.filter(c=>c.event==='audio-pause'&&c.detail===false).length;h.state.held=false;h.scene.setPaused(false);h.scene.resume();h.scene.render();h.scene.render();assert.equal(h.scene.view().paused,false);assert.equal(h.state.audioPaused,false);assert.equal(h.calls.filter(c=>c.event==='audio-pause'&&c.detail===false).length,unpauses+1,'repeated render/resume hooks cannot create another release edge');
 h.advance(.3);assert.ok(Math.abs(h.state.time-(time+.3))<1e-9);assert.equal(h.counts.controllerStart,1);h.advance(C.duration);h.scene.exit();assert.equal(h.counts.done,1);assert.equal(h.counts.close,1);assert.equal(h.counts.controllerDispose,1);
});

test('render and focus lifecycle hooks hold the existing frame when a covering scene suppresses updates',async()=>{
 const h=fixture();await h.prepare();h.advance(1.5);const time=h.state.time,rendered=h.counts.render;
 h.state.held=true;h.scene.render();assert.equal(h.scene.view().paused,true);assert.equal(h.state.audioPaused,true);h.scene.blur();h.scene.focus();h.scene.render();assert.equal(h.state.time,time);assert.equal(h.counts.render,rendered);assert.equal(h.scene.view().paused,true);
 h.state.held=false;h.scene.focus();h.scene.resume();assert.equal(h.scene.view().paused,false);assert.equal(h.state.audioPaused,false);assert.equal(h.state.time,time);h.advance(.1);assert.ok(Math.abs(h.state.time-(time+.1))<1e-9);assert.equal(h.counts.controllerStart,1);h.scene.exit();h.scene.exit();assert.equal(h.counts.audioDispose,1);assert.equal(h.counts.rendererDispose,1);
});

test('impact restores under opaque cover and emits one door-close edge before the room fades back',async()=>{
 const h=fixture();await h.prepare();h.advance(C.impactStart-.1);assert.equal(h.counts.restore,0);h.advance(.2);h.scene.render();
 assert.equal(h.counts.restore,1);assert.equal(h.counts.close,1);assert.equal(h.counts.joint,1);assert.equal(h.covers.at(-1).alpha,1);assert.equal(h.scene.worldPresentation,'visible');
 const restoredAt=h.calls.find(c=>c.event==='restore').time,closedAt=h.calls.find(c=>c.event==='doors-close').time;assert.equal(restoredAt,closedAt);assert.ok(closedAt<C.returnStart,'door sound is an impact-black event, not the later reveal');
 const rendered=h.counts.render,restoreIndex=h.calls.findIndex(c=>c.event==='restore');h.advance(C.duration);assert.equal(h.counts.render,rendered,'the retired drive renderer never overwrites the returned room');
 assert.equal(h.counts.restore,1);assert.equal(h.counts.close,1);assert.equal(h.counts.joint,1);assert.equal(h.counts.done,1);assert.ok(!h.calls.slice(restoreIndex+1).some(c=>c.event==='audio-pause'&&c.detail===false),'van audio remains paused through the return');
 h.scene.exit();assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.audioDispose,1);assert.equal(h.counts.controllerDispose,1);
});

test('cancellation during fetch cannot acquire a late renderer, start a clock or complete the handoff twice',async()=>{
 const gate=deferred(),h=fixture({fetchGate:gate});h.advance(.3);h.scene.exit();h.scene.exit();gate.resolve();assert.equal(await h.scene.pending(),false);h.advance(20);
 assert.equal(h.counts.restore,1);assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.rendererInitialize,0);assert.equal(h.counts.audioCreate,0);assert.equal(h.counts.controllerStart,0);assert.equal(h.counts.done,0);assert.equal(h.counts.close,0);assert.equal(h.counts.exit,1);
});

test('cancellation during renderer or audio initialization disposes each resource once',async()=>{
 for(const phase of['renderer','audio']){const gate=deferred(),h=fixture({[phase+'Gate']:gate});h.advance(.3);await flush();assert.equal(h.counts[phase==='renderer'?'rendererInitialize':'audioInitialize'],1);h.scene.exit();gate.resolve();assert.equal(await h.scene.pending(),false);h.scene.exit();
  assert.equal(h.counts.restore,1);assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.controllerStart,0);assert.equal(h.counts.done,0);assert.equal(h.counts.audioDispose,phase==='audio'?1:0);
 }
});

test('asset or audio failure returns once without beginning a partial cinematic',async()=>{
 for(const failure of[{fetchOK:false},{audioError:Error('decode failed')}]){const h=fixture(failure);await h.prepare();assert.equal(h.counts.done,1);assert.equal(h.counts.restore,1);assert.equal(h.errors.length,1);assert.equal(h.counts.controllerStart,0);assert.equal(h.counts.close,0);h.advance(20);assert.equal(h.counts.done,1);h.scene.exit();assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.audioDispose,failure.audioError?1:0);}
});

test('renderer initialization rejection restores immediately without waiting behind a black timeout',async()=>{
 const h=fixture({rendererOK:false});await h.prepare();assert.equal(h.errors.length,1);assert.match(h.errors[0].message,/renderer.*initialized/);
 assert.equal(h.counts.restore,1);assert.equal(h.counts.done,1);assert.equal(h.state.time,0);assert.equal(h.counts.audioCreate,0);assert.equal(h.counts.controllerStart,0);assert.equal(h.counts.close,0);assert.equal(h.scene.worldPresentation,'visible');
 h.advance(30);h.scene.exit();assert.equal(h.counts.restore,1);assert.equal(h.counts.done,1);assert.equal(h.counts.rendererDispose,1);
});

test('a rejected final frame fails closed instead of continuing an invisible plunge',async()=>{
 const h=fixture();await h.prepare();h.state.rejectRender=true;h.advance(.1);assert.equal(h.errors.length,1);assert.equal(h.counts.restore,1);assert.equal(h.counts.done,1);const t=h.state.time;h.advance(20);assert.equal(h.state.time,t);assert.equal(h.counts.done,1);assert.equal(h.counts.close,0);h.scene.exit();assert.equal(h.counts.rendererDispose,1);assert.equal(h.counts.audioDispose,1);
});

test('a stalled preparation times out while held time is excluded and never emits a door sound',async()=>{
 const gate=deferred(),h=fixture({fetchGate:gate});h.advance(.3);h.state.held=true;h.advance(30);assert.equal(h.errors.length,0);h.state.held=false;h.advance(26);assert.equal(h.errors.length,1);assert.equal(h.counts.done,1);assert.equal(h.counts.restore,1);assert.equal(h.counts.close,0);h.scene.exit();gate.resolve();assert.equal(await h.scene.pending(),false);assert.equal(h.counts.audioCreate,0);
});

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
const grey='dock-grey-exterior',door=id=>FP.doorState().find(p=>p.id===id);
function liveDoors(){const out={};FP.forEachDoor(p=>{out[p.id]={runtime:structuredClone(p.runtime),autoCloseSide:p.autoCloseSide,passable:p.open};});return out;}
const withoutGrey=value=>Object.fromEntries(Object.entries(value).filter(([id])=>id!==grey));

test('the selected real goods closer advances both leaves while every other door stays exact',()=>{
 FP.resetDoors();FP.setDoorOpen('pool-lobby',false);assert.equal(FP.interactDoor(165,52,[0,1],new Set()).opened,true);const others=withoutGrey(liveDoors());
 assert.equal(FP.runDoorCloserCycle(grey),true);assert.equal(door(grey).state,'closing');assert.equal(door(grey).openFraction,1);assert.deepEqual(door(grey).activeLeaves,[0,1]);assert.deepEqual(withoutGrey(liveDoors()),others);
 const events=[...FP.tickDoors(.2,{onlyIds:[grey],playerX:118.5,playerY:20.5})];assert.ok(door(grey).openFraction<1&&door(grey).openFraction>0);assert.deepEqual(withoutGrey(liveDoors()),others);
 events.push(...FP.tickDoors(3,{onlyIds:[grey],playerX:118.5,playerY:20.5}));assert.equal(door(grey).openFraction,0);assert.equal(door(grey).state,'closed');assert.equal(door(grey).open,false);assert.equal(events.filter(e=>e.type==='closed').length,1);assert.ok(events.every(e=>e.id===grey));assert.deepEqual(withoutGrey(liveDoors()),others);
 assert.equal(FP.tickDoors(3,{onlyIds:[grey],playerX:118.5,playerY:20.5}).length,0,'a held closed endpoint cannot repeat its thud');
 const saved=FP.saveDoorState();assert.deepEqual(saved.states[grey],{state:'closed',wedge:false,closerArmed:true});FP.loadDoorState(saved);assert.equal(door(grey).openFraction,0);assert.equal(door(grey).state,'closed');
});

test('an empty or unknown selection is inert and default door ticking retains its ordinary behavior',()=>{
 FP.resetDoors();FP.runDoorCloserCycle(grey);FP.setDoorOpen('pool-lobby',false);FP.interactDoor(165,52,[0,1],new Set());const before=liveDoors();
 assert.equal(FP.runDoorCloserCycle('absent-door'),false);const nonCloser=FP.doorState().find(p=>p.closer==='none');assert.ok(nonCloser);assert.equal(FP.runDoorCloserCycle(nonCloser.id),false);assert.deepEqual(liveDoors(),before);
 assert.deepEqual([...FP.tickDoors(1,{onlyIds:[]})],[]);assert.deepEqual(liveDoors(),before);assert.deepEqual([...FP.tickDoors(1,{onlyIds:['absent-door']})],[]);assert.deepEqual(liveDoors(),before);
 FP.tickDoors(.2,{playerX:118.5,playerY:20.5});assert.ok(door(grey).openFraction<before[grey].runtime.openFraction);assert.ok(door('pool-lobby').openFraction>before['pool-lobby'].runtime.openFraction,'omitting onlyIds still advances ordinary doors');
});

test('the actual goods cycle completes under return black before the first room reveal',async()=>{
 FP.resetDoors();const baseline=withoutGrey(liveDoors()),events=[];let begun=false;
 const h=fixture({onRestore:()=>{assert.equal(FP.runDoorCloserCycle(grey),true);begun=true;},onReturnTick:dt=>events.push(...FP.tickDoors(dt,{onlyIds:[grey],playerX:118.5,playerY:20.5}))});
 await h.prepare();h.advance(C.impactStart+.15);assert.equal(begun,true);assert.equal(h.counts.close,1);assert.equal(h.scene.view().coverAlpha,1);h.advance(C.returnStart-h.state.time-.05);
 assert.equal(door(grey).state,'closed');assert.equal(door(grey).openFraction,0);assert.equal(h.scene.view().coverAlpha,1);assert.equal(events.filter(e=>e.type==='closed'&&e.id===grey).length,1);assert.deepEqual(withoutGrey(liveDoors()),baseline);
 const t=h.state.time;h.state.held=true;h.advance(2);assert.equal(h.state.time,t);assert.equal(h.counts.close,1);h.state.held=false;h.advance(C.duration);h.scene.exit();assert.equal(h.counts.close,1);assert.equal(events.filter(e=>e.type==='closed').length,1);
});
