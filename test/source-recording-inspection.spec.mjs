import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRecordingInspectionScene,sourceRecordingInspectionIdentity} from '../src/game/source-recording-inspection.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const recording=()=>({id:'source-custody:test:1',takeId:'take:4',takeKey:'exact-original-interval',takeOrdinal:4,roomId:'main_b3',place:'Studio B3',
 chapter:'I',durationSeconds:65,status:'held',destination:{chapter:'II',locationId:'source-ii-recording-return',chartId:0,x:16,z:-22,feet:0},
 take:{id:'take:4',ordinal:4,startSeconds:100,endSeconds:165,slate:{text:'Studio B3. Fourth take.'}}});
function fixture(options={}){
 const calls={recover:[],audition:[],exit:[],frames:[],ui:[],errors:[],seek:[],pause:0,resume:0,stop:0,disposed:0},
  row=options.recording||recording(),presentation={},transportState={available:true,playing:true,paused:false,positionSeconds:0,durationSeconds:65};
 const transport={snapshot:()=>({...transportState}),seek:position=>{calls.seek.push(position);transportState.positionSeconds=position;return true;},
  pause:()=>{calls.pause++;transportState.playing=false;transportState.paused=true;},resume:()=>{calls.resume++;transportState.playing=true;transportState.paused=false;},stop:()=>{calls.stop++;transportState.playing=false;}};
 const renderer={initialize:()=>true,ready:()=>true,render:frame=>{calls.frames.push(frame);return true;},drawUI:frame=>calls.ui.push(frame),dispose:()=>calls.disposed++,hitTest:()=>null,...options.renderer};
 const s=createSourceRecordingInspectionScene({recording:row,renderer,presentation:()=>presentation,
  onAudition:request=>{calls.audition.push(request);return transport;},onRecover:request=>{calls.recover.push(request);return true;},
  onExit:event=>calls.exit.push(event),onError:err=>calls.errors.push(err),...options,renderer});
 return{s,calls,row,presentation,transport,transportState,renderer};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('cassette identity retains the exact take, original slate and custody destination without copying or changing audio',()=>{
 const row=recording();row.take.events=[{kind:'original-event',time:7}];row.take.samples=[.1,.2,.3];const before=copy(row),identity=sourceRecordingInspectionIdentity(row);
 assert.equal(identity.takeId,row.takeId);assert.equal(identity.takeKey,row.takeKey);assert.equal(identity.takeOrdinal,4);assert.equal(identity.slateText,'Studio B3. Fourth take.');
 assert.deepEqual(row,before);identity.take.slate.text='changed preview';assert.deepEqual(row,before);
 assert.equal(identity.take.events,undefined);assert.equal(identity.take.samples,undefined,'held-object identity carries metadata only; preview reads the original take by stable key');
 const bare=recording();delete bare.take.slate;assert.equal(sourceRecordingInspectionIdentity(bare).slateText,'');
 assert.throws(()=>sourceRecordingInspectionIdentity({...row,takeKey:null}),/receipt/);
});

test('opening, turning and putting back never recovers or auditions the cassette',async()=>{
 const {s,calls,row}=fixture(),before=copy(row);await s.initialize();s.render();assert.equal(calls.frames.length,1);assert.equal(calls.ui.length,1);
 s.lookBy(.7,.4);s.setLook({yaw:Math.PI,pitch:0});assert.equal(s.view().side,'back');s.setLook({yaw:Math.PI/2,pitch:0});assert.equal(s.view().side,'edge');
 s.pointer({type:'wheel',deltaY:-100});assert.ok(s.view().zoom>1);s.key({key:'Escape'});
 assert.equal(calls.recover.length,0);assert.equal(calls.audition.length,0);assert.equal(calls.exit[0].reason,'put-back');assert.equal(calls.exit[0].recovered,false);assert.deepEqual(row,before);assert.equal(calls.disposed,1);
 s.exit();assert.equal(calls.exit.length,1);
});

test('an immediate deliberate keep works without mandatory rotation or audition',async()=>{
 const {s,calls}=fixture();await s.initialize();s.key({key:'e'});await settle();
 assert.deepEqual(calls.recover,[{receiptId:'source-custody:test:1',takeId:'take:4',takeKey:'exact-original-interval',chapter:'II',locationId:'source-ii-recording-return'}]);
 assert.equal(calls.audition.length,0);assert.equal(s.view().closed,true);assert.equal(calls.exit[0].reason,'recovered');assert.equal(calls.exit[0].recovered,true);
});

test('repeat keys and a pending host commit cannot duplicate custody recovery',async()=>{
 let resolve,requests=0;const {s,calls}=fixture({onRecover:()=>{requests++;return new Promise(done=>resolve=done);}});await s.initialize();
 s.key({key:'e',repeat:true});assert.equal(requests,0);s.key({key:'e'});s.key({key:'e'});s.activate('take');s.key({key:'Escape'});
 assert.equal(requests,1);assert.equal(s.view().committing,true);assert.equal(calls.exit.length,0);resolve(true);await settle();assert.equal(calls.exit.length,1);assert.equal(calls.exit[0].recovered,true);
});

test('a rejected physical-owner recheck keeps the same held cassette available to put back',async()=>{
 const {s,calls}=fixture({onRecover:()=>false});await s.initialize();s.key({key:'e'});await settle();assert.equal(s.view().notice,'NOT RETURNED');assert.equal(s.view().closed,false);
 s.key({key:'Escape'});assert.equal(calls.exit[0].recovered,false);
});

test('only explicit play auditions the original interval; reel cues become exact readonly start positions',async()=>{
 const {s,calls,transportState}=fixture();await s.initialize();s.seekBy(12.5);assert.equal(calls.audition.length,0);assert.equal(s.view().positionSeconds,12.5);
 transportState.positionSeconds=12.5;s.key({key:' '});await settle();assert.equal(calls.audition.length,1);assert.equal(calls.audition[0].readOnly,true);assert.equal(calls.audition[0].recording.takeKey,'exact-original-interval');assert.equal(calls.audition[0].positionSeconds,12.5);
 s.seekBy(5);assert.equal(calls.seek.at(-1),17.5);assert.equal(s.view().positionSeconds,17.5);assert.ok(Math.abs(s.view().reelAngle[0])>0);
 transportState.positionSeconds=20;s.update(.1);assert.equal(s.view().positionSeconds,20);assert.equal(s.view().playing,true);s.key({key:'Escape'});assert.equal(calls.stop,1);assert.equal(calls.recover.length,0);
});

test('play/pause is responsive without creating a second preview or advancing a fake timer',async()=>{
 const {s,calls,transportState}=fixture();await s.initialize();s.activate('play');await settle();assert.equal(s.view().playing,true);
 s.activate('play');await settle();assert.equal(calls.pause,1);assert.equal(s.view().playing,false);const before=s.view().positionSeconds;s.update(.1);assert.equal(s.view().positionSeconds,before);
 s.activate('play');await settle();assert.equal(calls.resume,1);assert.equal(calls.audition.length,1);assert.equal(transportState.playing,true);s.exit();
});

test('missing original media remains silent and honest, while physical recovery stays possible',async()=>{
 const {s,calls}=fixture({onAudition:()=>null});await s.initialize();s.activate('play');await settle();assert.equal(s.view().available,false);assert.equal(s.view().playing,false);assert.equal(s.view().notice,'NO RECORDED SIGNAL');
 s.key({key:'e'});await settle();assert.equal(calls.recover.length,1);assert.equal(calls.exit[0].recovered,true);
});

test('late preview decoding after putting back is stopped and cannot resurrect the inspection',async()=>{
 let resolve;const {s,calls,transport}=fixture({onAudition:()=>new Promise(done=>resolve=done)});await s.initialize();s.activate('play');s.key({key:'Escape'});resolve(transport);await settle();
 assert.equal(calls.stop,1);assert.equal(s.view().closed,true);assert.equal(s.view().playing,false);assert.equal(calls.recover.length,0);
});

test('pause/focus/protected ownership holds manipulation and pauses preview without automatic sound on return',async()=>{
 const {s,calls,presentation}=fixture();await s.initialize();s.activate('play');await settle();s.key({key:'ArrowRight'});s.update(.1);
 for(const gate of['paused','hidden','focused','protected']){
  presentation[gate]=gate==='focused'?false:true;const before=s.view();s.update(.1);s.lookBy(1,1);assert.equal(s.view().yaw,before.yaw);assert.equal(s.view().elapsed,before.elapsed);assert.equal(s.view().playing,false);
  presentation[gate]=gate==='focused'?true:false;s.update(.1);assert.equal(calls.resume,0);assert.equal(s.view().playing,false);
 }
 s.exit();assert.equal(calls.stop,1);
});

test('the protected shutter is inspectable; direct reel picking is absent and body dragging never cues audio',async()=>{
 const {s,calls,renderer}=fixture();await s.initialize();renderer.hitTest=()=>({id:'shutter'});
 s.pointer({type:'pointerdown',button:0,clientX:100,clientY:100});assert.equal(s.view().shutterOpen,1);assert.equal(calls.audition.length,0);assert.equal(calls.recover.length,0);
 renderer.hitTest=()=>null;const yaw=s.view().yaw;s.pointer({type:'pointerdown',button:0,clientX:100,clientY:100});s.pointer({type:'pointermove',clientX:150,clientY:100});assert.ok(s.view().yaw>yaw);assert.equal(calls.seek.length,0);s.exit();
});
test('actual TAKES auto-seats the cartridge, STOP stops, and REC honestly remains readonly',async()=>{
 const {s,calls}=fixture();await s.initialize();s.activate('takes');await settle();assert.equal(calls.audition.length,1);assert.equal(s.view().mediaDocked,true);assert.equal(s.view().inspectDevice,true);
 for(let i=0;i<10;i++)s.update(.1);assert.equal(s.view().dockProgress,1);assert.equal(s.view().shutterOpen,1,'the well opens the protective shutter only inside its pocket');
 s.activate('rec');assert.equal(s.view().notice,'RETURNED TAKE · READ ONLY');assert.equal(calls.recover.length,0);assert.equal(calls.audition.length,1);
 s.activate('stop');assert.equal(calls.stop,1);assert.equal(s.view().playing,false);s.exit();
});
test('complete recorder can be turned while playing; withdrawing the cartridge pauses without changing custody',async()=>{
 const {s,calls}=fixture();await s.initialize();s.activate('takes');await settle();for(let i=0;i<10;i++)s.update(.1);
 const before=s.view();s.lookBy(.5,.25);assert.notEqual(s.view().deviceYaw,before.deviceYaw);assert.equal(s.view().playing,true);assert.equal(s.view().yaw,before.yaw);
 s.key({key:'v'});s.lookBy(.5,0);assert.equal(s.view().mediaDocked,false);assert.equal(s.view().playing,false);assert.equal(calls.pause,1);assert.equal(calls.recover.length,0);
 for(let i=0;i<10;i++)s.update(.1);assert.equal(s.view().dockProgress,0);s.key({key:'Escape'});assert.equal(calls.exit[0].reason,'put-back');assert.equal(calls.recover.length,0);
});
test('reduced-motion seating is immediate, while E KEEP remains available before any loading or audition',async()=>{
 const {s,presentation,calls}=fixture();presentation.reducedMotion=true;await s.initialize();s.activate('takes');await settle();s.update(.01);assert.equal(s.view().dockProgress,1);
 s.key({key:'e'});await settle();assert.equal(calls.recover.length,1);assert.equal(calls.exit[0].recovered,true);
});
test('the model may be put back while still loading or after a render fault, with no blind recovery',async()=>{
 let resolve;const pending=fixture({renderer:{initialize:()=>new Promise(done=>resolve=done)}});pending.s.enter();await Promise.resolve();pending.s.key({key:'e'});assert.equal(pending.calls.recover.length,0);pending.s.key({key:'Escape'});resolve(true);await settle();assert.equal(pending.s.view().ready,false);assert.equal(pending.calls.exit[0].reason,'put-back');
 const failed=fixture({renderer:{render:()=>false}});await failed.s.initialize();failed.s.render();assert.equal(failed.s.view().notice,'VIEW UNAVAILABLE');failed.s.key({key:'e'});assert.equal(failed.calls.recover.length,0);failed.s.key({key:'Escape'});assert.equal(failed.calls.exit[0].recovered,false);
});

test('reduced-motion flip is immediate and all repeated manipulation remains finite',async()=>{
 const {s,presentation}=fixture();presentation.reducedMotion=true;await s.initialize();s.activate('flip');assert.equal(s.view().side,'back');s.activate('flip');assert.equal(s.view().side,'front');
 for(let i=0;i<100;i++){s.lookBy(80,-80);s.seekBy(i%2?100:-100);s.pointer({type:'wheel',deltaY:i%2?10000:-10000});}
 const v=s.view();assert.ok([v.yaw,v.pitch,v.roll,v.zoom,v.positionSeconds,...v.reelAngle].every(Number.isFinite));assert.ok(v.positionSeconds>=0&&v.positionSeconds<=65);assert.ok(v.zoom>=.65&&v.zoom<=1.5);s.exit();
});

test('failed transport snapshots and asynchronous seek failures remain silent without trapping custody',async()=>{
 const {s,calls,transport}=fixture();await s.initialize();s.activate('play');await settle();transport.seek=()=>Promise.reject(Error('media gone'));s.seekBy(1);await settle();
 assert.equal(s.view().available,false);assert.equal(s.view().notice,'NO RECORDED SIGNAL');assert.equal(calls.stop,1);assert.equal(calls.recover.length,0);s.exit();
 const other=fixture();await other.s.initialize();other.s.activate('play');await settle();other.transport.snapshot=()=>{throw Error('decoder lost');};other.s.update(.1);assert.equal(other.s.view().playing,false);assert.equal(other.calls.stop,1);other.s.key({key:'Escape'});assert.equal(other.calls.exit[0].recovered,false);
});

test('world/input release runs exactly once even if renderer disposal fails',async()=>{
 const {s,calls}=fixture({renderer:{dispose:()=>{throw Error('renderer already gone');}}});await s.initialize();assert.throws(()=>s.exit(),/renderer already gone/);
 assert.equal(calls.exit.length,1);assert.equal(calls.exit[0].reason,'removed');assert.equal(calls.exit[0].recovered,false);s.exit();assert.equal(calls.exit.length,1);
});

test('an admitted sounding audition may finish across the deadline but cannot seek or recover to hold the night',async()=>{
 const {s,calls,presentation,transportState}=fixture();await s.initialize();s.activate('play');await settle();transportState.positionSeconds=63;
 presentation.deadlinePending=true;s.update(.1);assert.equal(s.view().closed,false);assert.equal(s.view().playing,true);
 assert.equal(s.seekBy(-50),false);assert.equal(calls.seek.length,0);assert.equal(s.view().positionSeconds,63);
 transportState.positionSeconds=65;transportState.playing=false;s.update(.1);assert.equal(s.view().closed,true);assert.equal(calls.exit[0].reason,'deadline');assert.equal(calls.recover.length,0);assert.equal(calls.stop,1);
});

test('pending deadline closes silent or paused inspection instead of admitting a new preview/resume or custody change',async()=>{
 for(const action of['none','paused-preview','play','take']){
  const {s,calls,presentation}=fixture();await s.initialize();
  if(action==='paused-preview'){s.activate('play');await settle();s.activate('play');await settle();}
  presentation.deadlinePending=true;
  if(action==='play')s.activate('play');else if(action==='take')s.activate('take');else s.update(.1);
  await settle();assert.equal(s.view().closed,true,action);assert.equal(calls.exit[0].reason,'deadline');assert.equal(calls.recover.length,0);assert.equal(calls.resume,0);
  assert.equal(calls.audition.length,action==='paused-preview'?1:0);
 }
});

test('global pause/focus still holds the deadline handoff, then a silent inspection puts back on foreground return',async()=>{
 const {s,calls,presentation}=fixture();await s.initialize();presentation.deadlinePending=true;presentation.hidden=true;s.update(.1);assert.equal(s.view().closed,false);
 presentation.hidden=false;s.update(.1);assert.equal(s.view().closed,true);assert.equal(calls.exit[0].reason,'deadline');assert.equal(calls.recover.length,0);
 const active=fixture();await active.s.initialize();active.s.activate('play');await settle();active.presentation.deadlinePending=true;active.s.activate('play');await settle();assert.equal(active.s.view().closed,true);assert.equal(active.calls.stop,1,'pausing the admitted preview releases its low-level owner too');assert.equal(active.calls.resume,0);
});

test('pending deadline cancels a not-yet-sounding decode and stops its late readonly handle',async()=>{
 let resolve;const {s,calls,transport,presentation}=fixture({onAudition:()=>new Promise(done=>resolve=done)});await s.initialize();s.activate('play');
 assert.equal(s.view().loadingAudio,true);presentation.deadlinePending=true;s.update(.1);assert.equal(s.view().closed,true);assert.equal(calls.exit[0].reason,'deadline');
 resolve(transport);await settle();assert.equal(calls.stop,1);assert.equal(calls.recover.length,0);assert.equal(s.view().playing,false);
});


test('missing recorder leaves physical inspection and immediate keep available while denying all new auditions',async()=>{
 for(const close of['Escape','e']){const {s,calls,presentation}=fixture();presentation.recorderAvailable=false;await s.initialize();s.update(.01);assert.equal(s.view().recorderAvailable,false);assert.equal(s.view().showTransport,false);
  for(const action of['play','takes','rec','device'])s.activate(action);await settle();assert.equal(calls.audition.length,0);assert.equal(s.view().notice,'RECORDER MISSING');assert.equal(s.view().mediaDocked,false);
  s.lookBy(.4,.2);assert.ok(s.view().yaw>.3);s.activate('shutter');assert.equal(s.view().shutterOpen,1);s.key({key:close});await settle();assert.equal(calls.recover.length,close==='e'?1:0);assert.equal(calls.exit[0].recovered,close==='e');}
});
test('losing the recorder withdraws and stops only the preview handle, and cannot silently resume it',async()=>{
 const {s,calls,presentation}=fixture();await s.initialize();s.activate('takes');await settle();for(let i=0;i<10;i++)s.update(.1);assert.equal(s.view().dockProgress,1);
 presentation.recorderAvailable=false;s.update(.01);assert.equal(calls.stop,1);assert.equal(s.view().playing,false);assert.equal(s.view().dockProgress,0);assert.equal(s.view().inspectDevice,false);assert.equal(s.view().notice,'RECORDER MISSING');
 s.activate('play');await settle();assert.equal(calls.resume,0);assert.equal(calls.audition.length,1);assert.equal(calls.recover.length,0);
 presentation.recorderAvailable=true;s.update(.01);assert.equal(s.view().notice,'');assert.equal(calls.resume,0);s.exit();
});
test('recorder loss revokes an asynchronous prepared preview before it can be installed',async()=>{
 let resolve;const {s,calls,presentation,transport}=fixture({onAudition:()=>new Promise(done=>resolve=done)});await s.initialize();s.activate('play');assert.equal(s.view().loadingAudio,true);
 presentation.recorderAvailable=false;resolve(transport);await settle();assert.equal(calls.stop,1);assert.equal(s.view().playing,false);assert.equal(s.view().loadingAudio,false);assert.equal(s.view().mediaDocked,false);assert.equal(s.view().notice,'RECORDER MISSING');assert.equal(calls.recover.length,0);s.exit();
});
