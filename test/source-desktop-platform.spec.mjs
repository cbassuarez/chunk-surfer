import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowChoreographyDirector, compileWindowChoreographyPlan } from '../src/platform/window-choreography.js';

const placement={width:1440,height:860,scale:2,origin:{x:-1440,y:20},command:{x:200,y:444,width:1040,height:400}};
const snapshot=n=>({clock:n,progress:1,performance:{time:n},enemy:{coherence:17},recovery:{used:true}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({invoke,releaseFullscreen,enabled=true}={}){
  const calls=[],states=[],listeners=new Map();
  const runtimeApi={
    listen:async(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name);},
    invoke:async(command,payload)=>{
      calls.push({command,payload});
      if(invoke){const answer=await invoke(command,payload);if(answer!==undefined)return answer;}
      if(command==='chunk_window_metrics')return{native_fullscreen:false};
      if(command==='chunk_source_desktop_begin')return placement;
      return true;
    },
  };
  const director=createWindowChoreographyDirector({runtimeApi,documentApi:null,
    tokenFactory:()=> 'window-source-test',waitFn:async()=>{},getEnabled:()=>enabled,
    releaseFullscreen,onState:event=>states.push(event),
    effects:{hidePanes:async()=>true,hideComposition:async()=>true}});
  return{director,calls,states,emit:(name,payload)=>listeners.get(name)?.({payload})};
}

test('desktop begins through the measured fullscreen gate and sends immutable combat state',async()=>{
  const gate=[];
  const f=fixture({invoke:command=>command==='chunk_window_metrics'?{native_fullscreen:true}:undefined,
    releaseFullscreen:async(transition,{signal})=>{gate.push(signal);return transition();}});
  const original=snapshot(1);
  const report=await f.director.beginSourceDesktop(original);
  assert.equal(gate.length,1);
  assert.equal(report.mode,'native');assert.equal(report.active,true);
  assert.deepEqual(report.placement,placement);
  assert.deepEqual(f.calls.map(x=>x.command),['chunk_window_metrics','chunk_window_choreography_begin','chunk_source_desktop_begin']);
  assert.deepEqual(f.calls.at(-1).payload.request,{token:'window-source-test',revision:1,snapshot:original});
  assert.equal(await f.director.updateSourceDesktop(snapshot(2)),true);
  assert.equal(f.calls.at(-1).payload.request.revision,2);
  assert.equal(original.enemy.coherence,17,'presentation does not reset the enemy');
});

test('ordinary cast, damage, result and runPlan cannot replace a desktop lease',async()=>{
  const f=fixture();await f.director.beginSourceDesktop(snapshot(1));const count=f.calls.length;
  const plan=compileWindowChoreographyPlan({cueId:'ordinary',sceneId:'battle:source-final',primitives:['Frame'],mainFrame:[{dx:20}]});
  assert.equal(await f.director.runPlan(plan),null);
  assert.equal(await f.director.fireballCast({battleId:'source-final'}),null);
  assert.equal(await f.director.damage({battleId:'source-final',received:20}),null);
  assert.equal(await f.director.result({battleId:'source-final',result:'lose'}),null);
  assert.equal(f.calls.length,count);
});

test('a native capability failure restores and keeps the same fight in fallback',async()=>{
  const f=fixture({invoke:command=>{if(command==='chunk_source_desktop_begin')throw new Error('transparent compositor unavailable');}});
  const report=await f.director.beginSourceDesktop(snapshot(1));
  assert.equal(report.mode,'fallback');assert.match(report.reason,/compositor/);
  assert.ok(f.calls.some(x=>x.command==='chunk_source_desktop_end'));
  assert.ok(f.calls.some(x=>x.command==='chunk_window_choreography_restore'));
  const before=f.calls.length;
  assert.equal((await f.director.beginSourceDesktop(snapshot(2))).mode,'fallback');
  assert.equal(await f.director.updateSourceDesktop(snapshot(3)),false);
  assert.equal(f.calls.length,before,'failure cannot reoffer native recovery on every frame');
});

test('restoring during a native prewarm prevents a late overlay resurrection',async()=>{
  const opening=deferred();
  const f=fixture({invoke:command=>command==='chunk_source_desktop_begin'?opening.promise:undefined});
  const begin=f.director.beginSourceDesktop(snapshot(1));await tick();
  assert.equal(f.calls.at(-1).command,'chunk_source_desktop_begin');
  await f.director.endSourceDesktop('cancel-opening');opening.resolve(placement);
  assert.equal((await begin).reason,'cancelled');
  assert.equal(f.director.sourceDesktopState().active,false);
  assert.equal(f.director.sourceDesktopState().mode,'fallback');
  assert.equal(f.calls.filter(x=>x.command==='chunk_source_desktop_end').length,2,'late completion also relinquishes its exact token');
});

test('latest-frame coalescing keeps a single update in flight and monotonic revisions',async()=>{
  const pending=deferred();let updates=0;
  const f=fixture({invoke:command=>command==='chunk_source_desktop_update'&&++updates===1?pending.promise:undefined});
  await f.director.beginSourceDesktop(snapshot(1));
  const a=f.director.updateSourceDesktop(snapshot(2));
  const b=f.director.updateSourceDesktop(snapshot(3));
  f.director.updateSourceDesktop(snapshot(4));
  await tick();assert.equal(updates,1);pending.resolve(true);await Promise.all([a,b]);
  const frames=f.calls.filter(x=>x.command==='chunk_source_desktop_update').map(x=>x.payload.request);
  assert.deepEqual(frames.map(x=>x.snapshot.clock),[2,4]);assert.deepEqual(frames.map(x=>x.revision),[2,3]);
});

test('focus suspension preserves presentation ownership; native cancellation falls back',async()=>{
  const f=fixture();await f.director.beginSourceDesktop(snapshot(1));
  f.emit('source-desktop:visibility',{token:'stale',visible:false});assert.equal(f.director.sourceDesktopState().suspended,false);
  f.emit('source-desktop:visibility',{token:'window-source-test',visible:false});
  assert.equal(f.director.sourceDesktopState().mode,'native');assert.equal(f.director.sourceDesktopState().suspended,true);
  f.emit('source-desktop:visibility',{token:'window-source-test',visible:true});assert.equal(f.director.sourceDesktopState().suspended,false);
  f.emit('source-desktop:cancelled',{token:'window-source-test',reason:'display work area changed'});
  assert.equal(f.director.sourceDesktopState().mode,'fallback');assert.match(f.director.sourceDesktopState().reason,/display/);
});

test('desktop survives the battle and ending handoff, then credits restore it',async()=>{
  const f=fixture();await f.director.beginSourceDesktop(snapshot(1));const before=f.calls.length;
  await f.director.finishBattle({battleId:'source-final',result:'win'});
  await f.director.leaveSource('source-runtime-exit');
  assert.equal((await f.director.beginEnding('surfaced')).mode,'native');
  assert.equal(f.calls.length,before);
  await f.director.credits();assert.equal(f.director.sourceDesktopState().active,false);
  assert.ok(f.calls.some(x=>x.command==='chunk_source_desktop_end'));
});

test('cleanup failures are reported while the local lease still relinquishes ownership',async()=>{
  const f=fixture({invoke:command=>{if(command==='chunk_source_desktop_end')throw new Error('restore frame refused');}});
  await f.director.beginSourceDesktop(snapshot(1));
  assert.equal((await f.director.endSourceDesktop('test-end')).restored,false);
  assert.equal(f.director.sourceDesktopState().active,false);
  assert.ok(f.states.some(x=>x.type==='source-desktop-restore-error'&&/refused/.test(x.reason)));
});

test('an opted-out desktop never invokes native presentation or fullscreen release',async()=>{
  const f=fixture({enabled:false});
  assert.equal((await f.director.beginSourceDesktop(snapshot(1))).mode,'fallback');
  assert.equal(f.calls.length,0);
});
