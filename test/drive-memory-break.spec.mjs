import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoorDriveTeaser} from '../src/game/source-drive/door-teaser.js';
import {DRIVE_TIME_SKIPS,createTimeSkipDirector} from '../src/game/source-drive/time-skips.js';
import {DRIVE_MEMORY_BREAK,driveMemoryBreakFrame} from '../src/game/source-drive/memory-break.js';
import {openingWorldAt,openingRoadSurfaceAt} from '../src/game/source-drive/opening-road.js';
import {driveMemoryBreakUniforms,radioDialStaticAlpha} from '../src/render/radio-dial-static.js';
import {createRadioDialCut,renderRadioDialCut} from '../src/audio/radio-dial-cut.js';

const custom={cut:DRIVE_MEMORY_BREAK,stretches:[
 {...DRIVE_TIME_SKIPS.stretches[0],until:{metres:10}},
 {...DRIVE_TIME_SKIPS.stretches.at(-1),start:{d:-470,lateral:-1.35,speed:4}},
]};
function begin(options={}){const c=createDoorDriveTeaser({timeSkips:custom,...options});c.start();for(let i=0;i<200&&!c.snapshot().vehiclePose.tuning;i++)c.update(1/60,{input:{forward:true}});assert(c.snapshot().vehiclePose.tuning);return c;}
const advance=(c,seconds,input)=>{for(let t=0;t<seconds-1e-9;t+=1/120)c.update(1/120,{input});};

test('world replacement requires both destination readiness and an acknowledged fully covered picture',()=>{
 const c=begin({requireDestinationReady:true,requireCoveredPresentation:true});advance(c,1);
 let s=c.snapshot(),t=s.vehiclePose.tuning;assert(t.waiting&&!t.placed);assert.equal(t.cover,1);assert.equal(s.vehiclePose.stretch.index,0);
 assert.equal(c.setDestinationReady(t.serial+1),false,'late preparation cannot claim another break');
 assert.equal(c.presented({...t,cover:.98}),false,'a partial static image cannot authorize replacement');
 assert.equal(c.setDestinationReady(t.serial,true),true);advance(c,.1);assert.equal(c.snapshot().vehiclePose.tuning.placed,false);
 t=c.snapshot().vehiclePose.tuning;assert.equal(c.presented(t),true);advance(c,1/120);
 s=c.snapshot();t=s.vehiclePose.tuning;assert(t.placed);assert.equal(t.cover,1);assert.equal(s.vehiclePose.stretch.index,1);
 assert.equal(c.presented({...t,serial:t.serial-1}),false);
 advance(c,1);assert.equal(c.snapshot().vehiclePose.tuning,null);assert(c.snapshot().controlsEnabled);c.dispose();
});

test('the carried van, pedal, wheel, weather and receiver clocks survive changed exterior ownership',()=>{
 const c=begin();advance(c,.4,{forward:true});const before=c.snapshot();
 assert.equal(before.vehiclePose.tuning.cover,1);assert.equal(before.vehiclePose.tuning.placed,false);
 advance(c,.4,{forward:true});const after=c.snapshot();assert(after.vehiclePose.tuning.placed);
 for(const key of ['speed','throttle','gear','wheelRotation','steering','bodyPitch','bodyRoll','bodyHeave'])assert.equal(after.driveState[key],before.driveState[key],key+' is carried through replacement');
 assert(after.driveState.programTime>before.driveState.programTime);assert(after.weatherClock>before.weatherClock);assert(after.weatherRevision>before.weatherRevision);
 assert(after.wiperPhase!==before.wiperPhase,'wet glass is not restarted on the repeated bend');
 advance(c,1,{forward:true});assert(c.snapshot().driveState.throttle>.5,'held accelerator returns without a new key edge');c.dispose();
});

test('releasing a held pedal during the covered interval cannot leave it latched on return',()=>{
 const c=begin();advance(c,.4,{forward:true});const throttle=c.snapshot().driveState.throttle;
 assert.equal(c.input('forward',false),true);advance(c,1.7);
 assert(c.snapshot().driveState.throttle<throttle,'the return applies the released state without a replacement key edge');c.dispose();
});

test('clearing the figure earns a continuous road and no later copy of that same collision cut',()=>{
 const d=createTimeSkipDirector({worldAt:openingWorldAt,distanceOf:v=>openingRoadSurfaceAt(v.x,v.z).distance});d.advance();
 const hazard=DRIVE_TIME_SKIPS.stretches[1].hazard,car=distance=>{const p=openingWorldAt(distance,1.8);return{x:p.x,z:p.z,heading:p.heading,speed:10,lateralSpeed:0};};
 assert.equal(d.update(car(hazard.d-12),.1),null);const request=d.update(car(hazard.d+9),.1);
 assert.equal(request.kind,'continuous');assert.equal(request.reason,'avoided-figure');assert.equal(request.to,3);
 const cuts=d.cuts();d.advance({to:request.to,continuous:true,distance:request.distance});assert.equal(d.cuts(),cuts);
 assert.equal(d.update(car(hazard.d+10),.1),null,'the next authored event is still far ahead');
 assert.deepEqual(d.outcomes().at(-1),{from:1,to:3,kind:'uninterrupted-avoidance'});
});

test('construction cover is complete for every replacement frame and never weakened by effects settings',()=>{
 for(const age of [.34,.5,.76,1,1.04]){const frame=driveMemoryBreakFrame({age,serial:1});assert.equal(frame.cover,1);
  assert.equal(driveMemoryBreakUniforms({...frame,effectsMode:'off',reducedFlash:true})[0],1);}
 assert.equal(radioDialStaticAlpha(.5),1);assert.equal(radioDialStaticAlpha(0),0);assert.equal(radioDialStaticAlpha(1),0);
 assert.deepEqual([...driveMemoryBreakUniforms(null)],[0,0,0,0]);
});

function audio(){
 const sources=[],nodes=[],c={sampleRate:8000,currentTime:0};
 const node=()=>{const n={connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];}};nodes.push(n);return n;};
 c.createGain=()=>Object.assign(node(),{gain:{value:1}});c.createStereoPanner=()=>Object.assign(node(),{pan:{value:0}});
 c.createBuffer=(channels,length,sampleRate)=>{const pcm=new Float32Array(length);return{length,duration:length/sampleRate,sampleRate,getChannelData:()=>pcm};};
 c.createBufferSource=()=>{const n=Object.assign(node(),{start(at,offset){this.started={at,offset};},stop(){this.stopped=true;}});sources.push(n);return n;};
 return{c,sources,nodes,destination:c.createGain()};
}

test('the finite receiver exception ignores only its own power switch and follows the supplied master bus',()=>{
 const f=audio(),v=createRadioDialCut({context:f.c,destination:f.destination,authoredPowerException:true,receiverPowered:false});
 assert(v.sync({age:0,receiverPowered:false}));assert.equal(v.snapshot().receiverPowered,false);
 assert(f.nodes.some(n=>n.connections.includes(f.destination)),'there is no route around the host master');
 f.c.currentTime=.3;v.setPaused(true);assert.equal(v.snapshot().offsetSeconds,.3);f.c.currentTime=50;assert.equal(v.snapshot().offsetSeconds,.3);
 v.sync({age:.3,receiverPowered:false});assert.equal(f.sources.at(-1).started.offset,.3);
 v.sync({age:.4,protectedAudio:true});assert.equal(v.snapshot().playing,false);assert.equal(v.snapshot().protectedCancelled,true);
 assert.equal(v.sync({age:.5}),false,'protected material cannot return as a delayed burst');v.dispose();assert(f.nodes.every(n=>n.connections.length===0));
 const ordinary=createRadioDialCut({context:f.c,destination:f.destination,receiverPowered:false});assert.equal(ordinary.sync({age:0}),false);ordinary.dispose();
});

test('a completed or retired receiver source releases its graph and cannot stop a replacement source',()=>{
 const f=audio(),v=createRadioDialCut({context:f.c,destination:f.destination});v.sync({age:0});const first=f.sources.at(-1),oldEnded=first.onended;
 f.c.currentTime=.2;v.setPaused(true);v.sync({age:.2});const second=f.sources.at(-1);oldEnded();assert.equal(v.snapshot().playing,true);
 second.onended();assert.equal(v.snapshot().disposed,true);assert(f.nodes.every(n=>n.connections.length===0));
 const pcm=renderRadioDialCut({sampleRate:8000}),same=renderRadioDialCut({sampleRate:8000});assert.deepEqual(pcm,same);assert(pcm.some(v=>v!==0));assert(pcm.every(v=>Number.isFinite(v)&&Math.abs(v)<.4));
});

// This fixture traverses the production scene/controller with authored road
// data and its real generated vehicle metrics. Only the final renderer/audio
// device is replaced; it is host-contract evidence, not a native capture.
import {readFile} from 'node:fs/promises';
import {makeGetInDriveTeaserScene} from '../src/game/get-in-drive-teaser-scene.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
const metrics=JSON.parse(await readFile(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function hostFixture({protectedAudio=false,rejectBreak=false,prepareDestination=null}={}){
 const events=[],signals=[],control={protectedAudio,held:false,restores:0,errors:[],done:0},bus={id:'physical-cabin'},context={id:'host-context'};
 let controller;
 const scene=makeGetInDriveTeaserScene({context,destination:{id:'host-output'},prepareDestination,
  createController:options=>controller=createDoorDriveTeaser({...options,timeSkips:custom}),
  fetcher:async()=>({ok:true,json:async()=>metrics}),
  createRenderer:()=>({initialize:async()=>true,ready:()=>true,dispose(){events.push('release');},setRecorderReadout(){},
   render(frame){events.push({type:'frame',break:frame.memoryBreak&&{...frame.memoryBreak},storm:frame.storm});return!(rejectBreak&&frame.memoryBreak?.active);}}),
  createAcoustics:()=>({cabin:bus,initialize:async()=>{},setPaused(){},sync(){},dispose(){},setStormPresentation(value){events.push({type:'storm-policy',...value});},stormFrame:()=>({flash:.2,bearing:-1}),receiverMaterial:()=>null}),
  createIntrusionAudio:()=>({setPaused(){},dispose(){},play(){}}),
  createMemorySignal:options=>{const signal={options,disposed:false,sync(value){events.push({type:'signal',...value});},setPaused(value){events.push({type:'signal-pause',value});},dispose(){this.disposed=true;}};signals.push(signal);return signal;},
  getPresentation:()=>({effectsMode:'full',flashMode:'off',protectedAudio:control.protectedAudio}),isHeld:()=>control.held,
  onRestore(){control.restores++;},onDone(){control.done++;},onError(error){control.errors.push(error);},
 });
 async function advance(seconds){for(let t=0;t<seconds-1e-8;t+=.05){scene.update(.05);scene.render();await flush();}}
 return{scene,events,signals,control,controller:()=>controller,advance,async prepare(){await advance(.3);await scene.pending();}};
}

test('the actual get-in host starts its owned exception only after the corresponding accepted frame',async()=>{
 const f=hostFixture();await f.prepare();await f.advance(3);
 assert.equal(f.signals.length,1);assert.equal(f.signals[0].options.destination.id,'physical-cabin');assert(f.signals[0].options.authoredPowerException);
 const first=f.events.findIndex(e=>e.type==='signal'&&!e.paused);assert(first>0);
 assert(f.events.slice(0,first).some(e=>e.type==='frame'&&e.break?.active),'the signal cannot precede its first submitted picture');
 assert(f.events.some(e=>e.type==='frame'&&e.break?.placed&&e.break.cover===1),'replacement was presented fully covered');
 assert(f.events.some(e=>e.type==='storm-policy'&&e.flashMode==='off'));
 f.scene.exit();assert(f.signals[0].disposed);assert.equal(f.control.restores,1);
});

test('rejected picture, protected recording and unavailable destinations cannot sound or silently complete a break',async()=>{
 const rejected=hostFixture({rejectBreak:true});await rejected.prepare();await rejected.advance(3);
 assert.equal(rejected.control.errors.length,1);assert(rejected.signals.every(s=>s.disposed));assert(!rejected.events.some(e=>e.type==='signal'&&!e.paused));rejected.scene.exit();
 const protectedHost=hostFixture({protectedAudio:true});await protectedHost.prepare();await protectedHost.advance(3);
 assert(protectedHost.events.filter(e=>e.type==='signal').every(e=>e.protectedAudio));
 assert(protectedHost.events.some(e=>e.type==='frame'&&e.break?.placed),'mandatory chronology still has a coherently covered handoff');protectedHost.scene.exit();
 const waiting=hostFixture({prepareDestination:()=>new Promise(()=>{})});await waiting.prepare();await waiting.advance(15);
 assert.equal(waiting.control.errors.length,1);assert.match(waiting.control.errors[0].message,/unavailable/);assert.equal(waiting.control.done,1);
 assert(!waiting.events.some(e=>e.type==='frame'&&e.break?.placed));waiting.scene.exit();
});

test('both final acquisition and normal presentation have an exact black guard independent of effects',async()=>{
 const source=await readFile(new URL('../src/render/r3d.js',import.meta.url),'utf8');
 assert(PIXEL_MESH_FRAG.indexOf('if(uDriveMemoryBreak.x>=.99999)')<PIXEL_MESH_FRAG.indexOf('vec4 srcFull = texture'));
 assert(PIXEL_MESH_FRAG.indexOf('c=driveMemoryBreakAcquire')<PIXEL_MESH_FRAG.indexOf('float tone = levels(y)'));
 assert(source.includes("gl.uniform4fv(pixelMeshU('uDriveMemoryBreak'),driveMemoryBreak)"));
 assert(source.includes("gl.uniform4fv(postU('uDriveMemoryBreak'),driveMemoryBreak)"));
 assert(source.includes('if(uDriveMemoryBreak.x>=.99999){o=vec4(0.0,0.0,0.0,1.0);return;}'));
});
