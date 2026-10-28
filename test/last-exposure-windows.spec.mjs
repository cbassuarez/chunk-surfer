import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  deathCompositionPlan,returnCompositionPlan,compilePaneScore,paneScoreStateAt,
  compositionAssetIds,WINDOW_MEDIA_SURFACE_LABELS,MAX_MEDIA_SURFACES,
} from '../src/platform/window-composition.js';

// The director's native decision is captured at module initialization. Supply
// a runtime marker only for import; all native operations below are fake APIs.
const previousWindow=globalThis.window;
globalThis.window={__TAURI_INTERNALS__:{}};
const {createWindowChoreographyDirector}=await import('../src/platform/window-choreography.js');
if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve};}
const IMAGE='data:image/webp;base64,AAAA';

test('Last Exposure death and return echo the same whole already-dithered image at most twice',()=>{
  for(const reducedMotion of [false,true])for(const flashMode of ['full','reduced','off']){
    const plans=[
      deathCompositionPlan({lastExposure:true,battleId:'source-final',snapshotToken:'snapshot-final',epochMs:1000,reducedMotion,flashMode}),
      returnCompositionPlan({lastExposure:true,snapshotTokens:['snapshot-final','snapshot-wrong'],epochMs:1000,reducedMotion,flashMode}),
    ];
    for(const plan of plans){
      assert.equal(plan.surfaces.length,2);assert.equal(plan.score.loop,false);
      assert.deepEqual(compositionAssetIds(plan),[],'no external, clinical or unrelated video imagery');
      for(const surface of plan.surfaces){
        assert.deepEqual(surface.content,{kind:'snapshot',token:'snapshot-final'});
        assert.deepEqual(surface.crop,{x:0,y:0,w:1,h:1},'retained image is never quartered');
        assert.equal(surface.draggable,false);assert.equal(surface.sensitivity,'none');
        assert.equal(surface.shader,'terminal','direct-RGB profile avoids a second dither pass');
        assert.deepEqual(surface.entry,surface.initial);
      }
      assert.equal(plan.fault.intensity,0);
    }
    assert.equal(plans[0].score.durationMs,5200);
  }
  const legacy=deathCompositionPlan({battleId:'chapel',snapshotToken:'snapshot-legacy'});
  assert.equal(legacy.surfaces.length,4,'unselected callers keep the legacy plan');
  assert.equal(returnCompositionPlan({snapshotTokens:['snapshot-a','snapshot-b','snapshot-c']}).surfaces.length,3);
});

test('death echoes yield rather than loop or introduce a new image during recovery',()=>{
  const plan=deathCompositionPlan({lastExposure:true,battleId:'hall',snapshotToken:'snapshot-final',epochMs:1000});
  const states=ms=>plan.surfaces.map(surface=>paneScoreStateAt(compilePaneScore(plan,surface.id),{nowMs:1000+ms}));
  assert.equal(states(200).filter(value=>value.visible).length,2);
  assert.equal(states(3000).filter(value=>value.visible).length,1);
  assert.equal(states(4200).filter(value=>value.visible).length,0);
  assert.equal(states(12000).filter(value=>value.visible).length,0,'a long pause cannot restart an exposure');
});

function directorHarness({register,prepare,show}={}){
  const shown=[],released=[],states=[],commands=[];
  let count=0;
  const effects={
    sessionToken:()=>'test-session',ensure:()=>true,captureSnapshot:()=>'snapshot-actual',
    registerSnapshot:register||(()=>`snapshot-${++count}`),
    releaseSnapshots:tokens=>released.push(...tokens),
    prepareMedia:prepare||(async()=>true),
    showComposition:async(plan,options)=>{shown.push({plan,options});return show?show(plan,options):true;},
    hideComposition:async()=>true,hidePanes:async()=>true,suspendSurfaces:()=>true,
  };
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{commands.push(command);return true;}},
    effects,documentApi:null,onState:state=>states.push(state),waitFn:async()=>{},
  });
  return{director,shown,released,states,commands};
}

test('selected director result uses a real snapshot and schedules passive Last Exposure only',async()=>{
  const h=directorHarness();h.director.prepareBattle({battleId:'chapel'});
  const result=await h.director.result({battleId:'chapel',result:'lose'});await flush();
  assert.equal(result.scheduled,true);assert.ok(result.plan.cueId.includes('last-exposure'));
  assert.equal(result.plan.surfaces.length,2);assert.equal(result.plan.score.loop,false);
  await h.director.suspend();await flush();
  assert.equal(h.director.debug().composition,null,'focus/pause retires optional wall-clock echoes');
});

test('selected account registers only its explicit ending frame once and missing frame stays in main window',async()=>{
  const registered=[];const h=directorHarness({register:image=>{registered.push(image);return'snapshot-ending';}});
  assert.equal(await h.director.beginReturn([{image:IMAGE}],{lastExposure:true}),null,'account page is not a substitute ending image');
  const result=await h.director.beginReturn([{image:'data:image/png;base64,WRONG'}],{lastExposure:true,snapshotImage:IMAGE});
  assert.deepEqual(registered,[IMAGE]);assert.equal(result.plan.surfaces.length,2);
  assert.ok(result.plan.surfaces.every(surface=>surface.content.token==='snapshot-ending'));
  assert.equal(await h.director.finishReturn(),true);
});

test('finishReturn invalidates a pending register before composition exists',async()=>{
  const gate=deferred();const h=directorHarness({register:()=>gate.promise});
  const opening=h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});await flush();
  assert.equal(await h.director.finishReturn(),true);gate.resolve('snapshot-late');
  assert.equal(await opening,null);assert.equal(h.shown.length,0);
  assert.equal(h.director.debug().composition,null);assert.deepEqual(h.released,['snapshot-late']);
});

test('finishReturn invalidates a pending prepare and cannot install panes after leaving details',async()=>{
  const gate=deferred();let preparing=0;const h=directorHarness({prepare:()=>{preparing++;return gate.promise;}});
  const opening=h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});await flush();
  assert.equal(preparing,1);assert.equal(await h.director.finishReturn(),true);
  gate.resolve(true);assert.equal(await opening,null);assert.equal(h.shown.length,0);
  assert.deepEqual(h.released,['snapshot-1']);assert.equal(h.director.debug().composition,null);
});

test('restore and suspend invalidate registrations synchronously before their native awaits',async()=>{
  for(const action of ['restore','suspend']){
    const gate=deferred();const h=directorHarness({register:()=>gate.promise});
    const opening=h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});await flush();
    if(action==='restore')await h.director.restore('credits');else h.director.suspend();
    gate.resolve('snapshot-late');assert.equal(await opening,null);
    assert.equal(h.shown.length,0);assert.equal(h.director.debug().composition,null);
  }
});

test('a superseded registration releases only its own token and never removes a newer return',async()=>{
  const gate=deferred();let calls=0;const h=directorHarness({register:()=>++calls===1?gate.promise:'snapshot-new'});
  const first=h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});await flush();
  const second=await h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});
  gate.resolve('snapshot-old');assert.equal(await first,null);
  assert.equal(h.shown.length,1);assert.equal(second.plan.surfaces[0].content.token,'snapshot-new');
  assert.deepEqual(h.released,['snapshot-old']);assert.equal(h.director.debug().composition.purpose,'return');
  await h.director.finishReturn();
});

test('cancellation after dispatch invalidates the predicate and avoids stale simulated fallback',async()=>{
  const gate=deferred(),entered=deferred();
  const h=directorHarness({show:(_plan,options)=>{entered.resolve(options);return gate.promise;}});
  const opening=h.director.beginReturn([],{lastExposure:true,snapshotImage:IMAGE});
  const options=await entered.promise;assert.equal(options.isCurrent(),true);
  await h.director.finishReturn();assert.equal(options.isCurrent(),false);
  gate.resolve(false);assert.equal(await opening,null);
  assert.ok(!h.states.some(state=>state.type==='composition'),'expired native attempt cannot resurrect an in-frame composition');
});

// Execute the actual effects method with its closure dependencies controlled.
// This reaches the prepare/assignment/place awaits without creating OS windows.
const effectsSource=readFileSync(new URL('../src/platform/personalized-window-effects.js',import.meta.url),'utf8');
const methodStart=effectsSource.indexOf('async function showComposition(');
const methodEnd=effectsSource.indexOf('\n  async function snapComposition(',methodStart);
function effectsMethodHarness({prepareGate=null,assignGate=null,placeGate=null}={}){
  const calls=[],session={token:'test-session',compositionGeneration:0,activeComposition:null,
    manualMediaPanes:new Set(),mediaRevisions:new Map()};
  let live=true;
  const mediaSurfaces=new Map(WINDOW_MEDIA_SURFACE_LABELS.slice(0,2).map(label=>[label,{hide:async()=>calls.push(['hide',label])}]));
  const scope={
    current:session,WINDOW_MEDIA_SURFACE_LABELS,MAX_MEDIA_SURFACES,mediaSurfaces,
    begin:()=>assert.fail('session is already available'),
    prepareMedia:()=>prepareGate?.promise??Promise.resolve(true),
    safe:task=>Promise.resolve().then(task).catch(()=>null),
    assignMediaScore:(_session,_plan,_pane,label)=>{
      calls.push(['assign',label]);session.mediaRevisions.set(label,(session.mediaRevisions.get(label)||0)+1);
      return assignGate?.promise??Promise.resolve(true);
    },
    hideComposition:async()=>calls.push(['global-hide']),quiesceComposition:async()=>true,
    api:{invoke:async(command,payload)=>{calls.push([command,payload]);return placeGate?.promise??{shown:true,origin:{x:0,y:0}};},
      emitTo:async(...args)=>calls.push(['emit',...args])},
    dispatch:(...args)=>calls.push(['dispatch',...args]),wait:async()=>{},
  };
  const show=runInNewContext(`(${effectsSource.slice(methodStart,methodEnd).trim()})`,scope);
  return{calls,session,show:(plan)=>show(plan,{isCurrent:()=>live}),cancel:()=>{live=false;},
    replace(plan){live=false;session.compositionGeneration++;session.activeComposition=plan;session.mediaRevisions.set('window-media-1',99);session.mediaRevisions.set('window-media-2',100);},
    restore(){live=false;session.compositionGeneration++;session.activeComposition=null;session.mediaRevisions.clear();},
  };
}

test('real effects method checks selected ownership after its own media preparation',async()=>{
  const gate=deferred(),h=effectsMethodHarness({prepareGate:gate});
  const plan=returnCompositionPlan({lastExposure:true,snapshotTokens:['snapshot-actual']});
  const opening=h.show(plan);h.cancel();gate.resolve(true);
  assert.equal(await opening,false);assert.equal(h.calls.length,0);
  assert.equal(h.session.activeComposition,null);
});

test('real effects method cannot place stale assignments or globally flush a newer owner',async()=>{
  const gate=deferred(),h=effectsMethodHarness({assignGate:gate});
  const plan=returnCompositionPlan({lastExposure:true,snapshotTokens:['snapshot-actual']});
  const opening=h.show(plan);await flush();h.replace({cueId:'new-owner'});gate.resolve(true);
  assert.equal(await opening,false);
  assert.ok(!h.calls.some(call=>call[0]==='chunk_window_media_place'||call[0]==='global-hide'||call[0]==='hide'));
  assert.equal(h.session.activeComposition.cueId,'new-owner');
});

test('a late placement hides only retired labels and leaves a newer revision untouched',async()=>{
  for(const replace of [false,true]){
    const gate=deferred(),h=effectsMethodHarness({placeGate:gate});
    const plan=returnCompositionPlan({lastExposure:true,snapshotTokens:['snapshot-actual']});
    const opening=h.show(plan);await flush();
    if(replace)h.replace({cueId:'new-owner'});else h.restore();
    gate.resolve({shown:true,origin:{x:0,y:0}});assert.equal(await opening,false);
    assert.equal(h.calls.filter(call=>call[0]==='hide').length,replace?0:2);
    assert.ok(!h.calls.some(call=>call[0]==='global-hide'||call[0]==='emit'||call[0]==='dispatch'));
  }
});
