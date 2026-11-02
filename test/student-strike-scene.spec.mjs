import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentStrikeScene} from '../src/game/student-strike-scene.js';

const pose=()=>({x:67.8,y:35.7,floor:10,yaw:-1.8157749899217608,pitch:-.09671159884252922,
  facing:3,renderGroup:'academic',lens:{focusDistanceM:7.75,maxBlurPx:0},eye:[67.8,11.62,35.7]});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const drain=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function fixture(extra={}){
  const calls={done:[],exit:[],restore:[],errors:[],shots:[],cues:[],pauses:[],covers:[],subtitles:[],prepare:[]};
  const duration=extra.durationSeconds??3,threshold=extra.returnAtSeconds??2;
  const scene=createStudentStrikeScene({returnPose:pose(),durationSeconds:duration,returnAtSeconds:threshold,
    sampleFilm:(elapsed,{returnPose})=>({seconds:elapsed,shotId:elapsed>=threshold?'return':elapsed>=1?'refusal':'present',
      camera:{eye:[1,2,3]},nativeReturn:elapsed>=threshold,black:elapsed>=threshold?Math.max(0,1-(elapsed-threshold)/.5):0,
      dialogue:elapsed>=.2&&elapsed<.7?{id:'first',text:'They called them absent.',actorId:'odette'}:
        elapsed>=threshold+.6&&elapsed<threshold+.9?{id:'last',text:'I can keep the stair clear.',actorId:'odette'}:null,
      returnPoseSeen:returnPose}),
    prepare:payload=>{calls.prepare.push(payload);return true;},
    toWorldView:frame=>({...frame,studentStrike:true}),
    onRestore:payload=>{calls.restore.push(payload);return true;},
    onDone:value=>calls.done.push(value),onExit:value=>calls.exit.push(value),onError:error=>calls.errors.push(error.message),
    onShot:frame=>calls.shots.push(frame.shotId),onNarration:(cue,meta)=>calls.cues.push({cue,elapsed:meta.elapsed}),
    onPause:()=>calls.pauses.push('pause'),onResume:()=>calls.pauses.push('resume'),
    paintCover:alpha=>calls.covers.push(alpha),paintSubtitle:cue=>calls.subtitles.push(cue),...extra});
  return{scene,calls};
}
async function start(h){h.scene.enter();await h.scene.pending();assert.equal(h.scene.view().phase,'awaiting-frame');assert.equal(h.scene.presented(),true);}
function tick(h,seconds){for(let left=seconds;left>1e-8;left-=.05)h.scene.update(Math.min(.05,left));}

test('captures the complete entry pose immutably and spends no film during preparation or hidden presentation',async()=>{
  const original=pose(),ready=deferred();let visible=false;
  const h=fixture({returnPose:original,prepare:()=>ready.promise,getPresentationReady:()=>visible});
  original.yaw=9;original.eye[0]=999;original.lens.focusDistanceM=999;
  h.scene.enter();tick(h,4);assert.equal(h.scene.view().elapsed,0);assert.equal(h.scene.worldView(),null);
  ready.resolve(true);await h.scene.pending();h.scene.render();assert.equal(h.calls.covers.at(-1),1);
  assert.equal(h.scene.presented(),false);assert.equal(h.calls.shots.length,0);
  visible=true;assert.equal(h.scene.presented(),true);assert.equal(h.scene.presented(),false);
  assert.equal(h.scene.worldView().studentStrike,true);assert.deepEqual(h.scene.serialize().returnPose,pose());
  const copy=h.scene.serialize();copy.returnPose.eye[0]=42;assert.equal(h.scene.serialize().returnPose.eye[0],67.8);
});

test('pause, blur, text review and renderer loss hold time; presentation recovery does not undo another hold',async()=>{
  let visible=true;const h=fixture({getPresentationReady:()=>visible});await start(h);tick(h,.4);
  const elapsed=h.scene.view().elapsed;h.scene.pause();h.scene.blur();tick(h,3);h.scene.resume();tick(h,2);
  assert.equal(h.scene.view().elapsed,elapsed);h.scene.focus();tick(h,.1);assert.ok(h.scene.view().elapsed>elapsed);
  visible=false;h.scene.update(.1);const held=h.scene.view().elapsed;tick(h,2);assert.equal(h.scene.view().elapsed,held);
  assert.equal(h.scene.view().presentationHeld,true);h.scene.pause();visible=true;tick(h,1);assert.equal(h.scene.view().elapsed,held);
  h.scene.resume();h.scene.update(.1);assert.ok(h.scene.view().elapsed>held);assert.equal(h.scene.view().presentationHeld,false);
  h.scene.textReviewSuspend();const review=h.scene.view().elapsed;tick(h,1);assert.equal(h.scene.view().elapsed,review);
  h.scene.textReviewResume();h.scene.update(.1);assert.ok(h.scene.view().elapsed>review);
});

test('normal cut restores at the return threshold under black, then continues final narration and ends automatically',async()=>{
  const restore=deferred();const h=fixture({onRestore:payload=>{h.calls.restore.push(payload);return restore.promise;}});
  await start(h);tick(h,2.2);assert.equal(h.scene.view().phase,'restoring');assert.equal(h.scene.view().elapsed,2);
  assert.equal(h.scene.worldView(),null);h.scene.render();assert.equal(h.calls.covers.at(-1),1);
  await drain();assert.equal(h.calls.restore.length,1);assert.deepEqual(h.calls.restore[0].returnPose,pose());
  assert.equal(h.calls.restore[0].naturalReturn,true);assert.equal(h.calls.restore[0].completed,false);
  tick(h,5);assert.equal(h.scene.view().elapsed,2);assert.equal(h.calls.done.length,0);
  restore.resolve(true);await h.scene.returnPending();assert.equal(h.scene.view().phase,'returning');assert.equal(h.scene.view().restored,true);
  assert.equal(h.scene.worldView(),null);tick(h,1.1);
  assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,true);assert.equal(h.calls.done[0].restored,true);
  assert.equal(h.calls.done[0].skipped,false);assert.equal(h.scene.blocksInput,false);assert.equal(h.scene.blocksWorld,false);
  assert.ok(h.calls.cues.some(event=>event.cue?.id==='last'));assert.equal(h.calls.cues.at(-1).cue,null);
  tick(h,4);h.scene.presented();assert.equal(h.calls.done.length,1);assert.equal(h.calls.restore.length,1);
});

test('the actual65-second contract restores once at59, without a second black at completion',async()=>{
  const h=fixture({durationSeconds:65,returnAtSeconds:59});await start(h);tick(h,59.2);await h.scene.returnPending();
  assert.equal(h.scene.view().elapsed,59);assert.equal(h.calls.restore.length,1);assert.equal(h.scene.view().phase,'returning');
  tick(h,6.2);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,true);assert.equal(h.calls.restore.length,1);
  assert.equal(h.scene.view().elapsed,65);assert.equal(h.scene.view().black,0);
});

test('narration and shot changes dispatch once, while subtitles retain their own readable window',async()=>{
  const h=fixture();await start(h);tick(h,.25);h.scene.render();h.scene.render();
  assert.equal(h.calls.cues.filter(e=>e.cue?.id==='first').length,1);assert.equal(h.calls.subtitles.length,2);
  h.scene.pause();tick(h,1);h.scene.render();assert.equal(h.calls.cues.filter(e=>e.cue?.id==='first').length,1);
  h.scene.resume();tick(h,.7);assert.equal(h.calls.cues.at(-1).cue,null);tick(h,.2);
  assert.deepEqual(h.calls.shots,['present','refusal']);
});

test('fresh skip returns safely even during loading and a late preparation cannot restart the film',async()=>{
  const prepared=deferred(),h=fixture({prepare:()=>prepared.promise});h.scene.enter();await drain();
  h.scene.key({code:'KeyX',repeat:true});assert.equal(h.scene.view().phase,'loading');
  h.scene.keyup({code:'KeyX'});h.scene.key({code:'KeyX'});await h.scene.returnPending();
  assert.equal(h.scene.view().phase,'returning');assert.equal(h.scene.worldView(),null);assert.equal(h.calls.shots.length,0);
  prepared.resolve(true);await h.scene.pending();assert.equal(h.scene.view().phase,'returning');
  tick(h,.6);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].skipped,true);assert.equal(h.calls.done[0].completed,false);
  assert.equal(h.calls.done[0].restored,true);
});

test('failed assets and sample errors restore the original body without granting completed knowledge',async()=>{
  for(const options of[{prepare:()=>Promise.reject(Error('missing asset'))},{prepare:()=>({ready:false})},{sampleFilm:()=>{throw Error('bad frame');}}]){
    const h=fixture(options);h.scene.enter();await h.scene.pending();
    if(h.scene.view().phase==='awaiting-frame')h.scene.presented();
    await h.scene.returnPending();tick(h,.6);
    assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,false);assert.equal(h.calls.done[0].restored,true);
    assert.ok(h.calls.done[0].error);assert.deepEqual(h.calls.done[0].returnPose,pose());
  }
});

test('skip, failed preparation and reload reveals all wait for ordinary presentation, including a second readiness loss',async()=>{
  for(const route of ['skip','prepare-error','reload']){
    let visible=false;
    const h=fixture({getPresentationReady:()=>visible,
      ...(route==='prepare-error'?{prepare:()=>Promise.reject(Error('missing asset'))}:{}),
      ...(route==='reload'?{returnPose:null,checkpoint:{kind:'student-strike',elapsed:1.2,returnPose:pose()}}:{})});
    h.scene.enter();
    if(route==='skip')h.scene.withdraw('skipped');
    await h.scene.pending();await h.scene.returnPending();
    assert.equal(h.scene.view().phase,'returning',route);assert.equal(h.scene.view().black,1,route);
    const elapsed=h.scene.view().elapsed;tick(h,2);h.scene.render();
    assert.equal(h.scene.view().elapsed,elapsed,route);assert.equal(h.scene.view().black,1,route);
    assert.equal(h.calls.covers.at(-1),1,route);assert.equal(h.calls.done.length,0,route);
    visible=true;tick(h,.2);assert.ok(h.scene.view().black<1,route);assert.equal(h.calls.done.length,0,route);
    visible=false;tick(h,1);h.scene.render();assert.equal(h.scene.view().black,1,route);assert.equal(h.calls.done.length,0,route);
    visible=true;tick(h,.4);assert.equal(h.calls.done.length,1,route);
    assert.equal(h.calls.done[0].completed,false,route);assert.equal(h.calls.done[0].restored,true,route);
  }
});

test('failed restoration stays covered rather than revealing an unconfirmed world; retry can recover',async()=>{
  let attempts=0;const h=fixture({onRestore:()=>++attempts>1});await start(h);h.scene.withdraw();await h.scene.returnPending();
  assert.equal(h.scene.view().phase,'restore-failed');assert.equal(h.scene.view().black,1);assert.equal(h.scene.worldView(),null);
  assert.equal(h.calls.done.length,0);assert.equal(h.scene.key({key:'Escape'}),false);assert.equal(h.scene.blocksInput,true);
  await h.scene.retryRestore();assert.equal(h.scene.view().phase,'returning');tick(h,.6);
  assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].restored,true);assert.equal(h.calls.done[0].completed,false);
});

test('preparation and restoration timeouts are bounded and cancel stale restore attempts',async()=>{
  const prepare=deferred(),h=fixture({prepare:()=>prepare.promise,preparationTimeoutSeconds:.2});h.scene.enter();tick(h,.4);await h.scene.returnPending();
  assert.equal(h.scene.view().phase,'returning');assert.match(h.scene.view().error,/did not become ready/);tick(h,.6);assert.equal(h.calls.done.length,1);
  const stale=deferred();let payload;const r=fixture({restoreTimeoutSeconds:.2,onRestore:value=>{payload=value;return stale.promise;}});await start(r);r.scene.withdraw();await drain();tick(r,.4);
  assert.equal(r.scene.view().phase,'restore-failed');assert.equal(payload.signal.aborted,true);assert.equal(payload.isCurrent(),false);
  stale.resolve(true);await r.scene.returnPending();assert.equal(r.scene.view().phase,'restore-failed');assert.equal(r.calls.done.length,0);
  const unavailable=fixture({getPresentationReady:()=>false,preparationTimeoutSeconds:.2});unavailable.scene.enter();await unavailable.scene.pending();
  tick(unavailable,.4);await unavailable.scene.returnPending();assert.equal(unavailable.scene.view().phase,'returning');
  assert.equal(unavailable.calls.shots.length,0);assert.ok(unavailable.scene.view().error);
});

test('external removal aborts preparation/restoration and never revives the old owner or calls completion',async()=>{
  const prepared=deferred(),h=fixture({prepare:()=>prepared.promise});h.scene.enter();await drain();
  const preparation=h.scene.pending();assert.equal(h.scene.exit(),true);assert.equal(h.scene.exit(),false);
  prepared.resolve(true);await preparation;tick(h,2);h.scene.presented();
  assert.equal(h.calls.done.length,0);assert.equal(h.calls.exit.length,1);assert.equal(h.calls.exit[0].completed,false);
  const restoring=deferred();let payload;const r=fixture({onRestore:value=>{payload=value;return restoring.promise;}});
  await start(r);r.scene.withdraw();await drain();r.scene.exit();assert.equal(payload.signal.aborted,true);
  restoring.resolve(true);await r.scene.returnPending();tick(r,2);assert.equal(r.calls.done.length,0);assert.equal(r.calls.exit.length,1);
  assert.equal(r.scene.blocksInput,false);assert.equal(r.scene.blocksWorld,false);assert.equal(r.scene.worldView(),null);
});

test('a reload restores the saved exact entry and never automatically resumes or replays the film',async()=>{
  const h=fixture({returnPose:null,checkpoint:{kind:'student-strike',elapsed:1.2,returnPose:pose()}});
  h.scene.enter();await h.scene.pending();assert.equal(h.calls.prepare.length,0);assert.equal(h.scene.worldView(),null);
  assert.equal(h.calls.restore.length,1);assert.deepEqual(h.calls.restore[0].returnPose,pose());assert.equal(h.calls.shots.length,0);
  tick(h,.6);assert.equal(h.calls.done[0].reason,'reload');assert.equal(h.calls.done[0].completed,false);
});

test('an unavailable entry pose cannot produce a fabricated successful restoration',async()=>{
  let current=null;const h=fixture({returnPose:null,getReturnPose:()=>current});h.scene.enter();await h.scene.pending();
  assert.equal(h.scene.view().phase,'restore-failed');assert.equal(h.scene.view().black,1);
  assert.equal(h.calls.restore.length,0);assert.equal(h.calls.done.length,0);
  current=pose();await h.scene.retryRestore();tick(h,.6);
  assert.equal(h.calls.done.length,1);assert.deepEqual(h.calls.done[0].returnPose,pose());assert.equal(h.calls.done[0].restored,true);
});

test('Escape remains available to pause; modified keys and pointer clicks cannot accidentally skip or consent',async()=>{
  const h=fixture();await start(h);
  assert.equal(h.scene.key({key:'Escape'}),false);assert.equal(h.scene.key({controllerAction:'back'}),false);
  h.scene.key({code:'KeyX',metaKey:true});h.scene.keyup({code:'KeyX'});h.scene.pointer({type:'click'});
  assert.equal(h.scene.view().phase,'playing');assert.equal(h.calls.restore.length,0);
  assert.equal('contact' in h.scene.serialize(),false);assert.equal('consent' in h.scene.serialize(),false);
});
