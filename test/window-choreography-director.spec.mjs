import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WINDOW_CHOREOGRAPHY_PRIMITIVES,
  battleChoreographyProfile,
  compileWindowChoreographyPlan,
  createWindowChoreographyDirector,
  endingChoreographyProfile,
  sourceLeakStage,
  validateWindowChoreographyPlan,
  windowChoreographyPolicy,
} from '../src/platform/window-choreography.js';

test('the director exposes the complete authored primitive vocabulary',()=>{
  assert.deepEqual(WINDOW_CHOREOGRAPHY_PRIMITIVES,[
    'Frame','Glide','Cinch','Bloom','Dock','Breach','Restore','Split','Cast',
    'Handoff','Orbit','Swarm','Recenter','Simulate',
  ]);
  const plan=compileWindowChoreographyPlan({
    cueId:'test:cue',sceneId:'test:scene',primitives:['Breach','Split'],
    surfaces:Array.from({length:4},(_,index)=>({id:`pane-${index}`,x:.2+index*.2,y:.5,size:128})),
  });
  assert.equal(validateWindowChoreographyPlan(plan).ok,true);
  assert.throws(()=>compileWindowChoreographyPlan({
    cueId:'too-many',sceneId:'test',primitives:['Split'],
    surfaces:Array.from({length:5},(_,index)=>({id:`pane-${index}`,x:.5,y:.5,size:128})),
  }),/invalid window choreography plan/);
});

test('battle profiles escalate monotonically and keep their authored formations',()=>{
  const ids=['natatorium','hall','practice','chapel','source-final'];
  const profiles=ids.map(battleChoreographyProfile);
  assert.deepEqual(profiles.map((profile)=>profile.formation),[
    'rise-drift','seat-align','retake-loop','orbit-cross','swarm-recombine',
  ]);
  for(let index=1;index<profiles.length;index+=1){
    assert.ok(profiles[index].activity>profiles[index-1].activity);
  }
});

test('the Source leak cannot begin before the physical FOH crossing',()=>{
  assert.equal(sourceLeakStage({approach:false,elapsedSeconds:18,progress:.7,redProgress:1}).id,'sealed');
  assert.equal(sourceLeakStage({approach:true,elapsedSeconds:0,progress:0,redProgress:0}).id,'white');
  assert.equal(sourceLeakStage({approach:true,elapsedSeconds:10,progress:.34,redProgress:.1}).id,'red');
  assert.equal(sourceLeakStage({approach:true,elapsedSeconds:23,progress:.76,redProgress:1}).id,'swarm');
  assert.equal(sourceLeakStage({approach:true,elapsedSeconds:29,progress:.97,redProgress:1}).id,'proper');
  assert.equal(sourceLeakStage({complete:true,approach:false,progress:1}).id,'proper','Source proper inherits the leak');
  assert.equal(sourceLeakStage({sourcePhase:false,phase:'horizon',complete:true,progress:1}).id,'sealed','the horizon seals even a completed Source approach');
});

test('top-level scene policy keeps all pre-Source exploration stable',()=>{
  for(const scene of ['setup','title','warning','dialogue','document','haystack','source:scene-dock','source:foh-door']){
    assert.equal(windowChoreographyPolicy(scene),'stable',scene);
  }
  assert.equal(windowChoreographyPolicy('natatorium'),'battle-only');
  assert.equal(windowChoreographyPolicy('source:white-crossing'),'source-leakage');
  assert.equal(windowChoreographyPolicy('ending:surfaced'),'ending-resolution');
  assert.equal(windowChoreographyPolicy('credits'),'credits-restoration');
});

test('prewarming a battle does not breach; its first actual fireball does',async()=>{
  const calls=[];
  const introductions=[];
  const runtimeApi={invoke:async(command,payload)=>{calls.push([command,payload]);return true;}};
  const effects={
    sessionToken:()=> 'fireball-session-test',
    showPanes:async()=>true,hidePanes:async()=>true,suspendSurfaces:()=>true,
  };
  const director=createWindowChoreographyDirector({runtimeApi,effects,documentApi:null,tokenFactory:()=> 'window-session-test',waitFn:async()=>{},onFirstBreach:(event)=>introductions.push(event)});
  director.prepareBattle({battleId:'natatorium'});
  assert.equal(calls.length,0,'arrival and prewarm leave the real frame untouched');
  await director.fireballCast({battleId:'natatorium'});
  assert.deepEqual(calls.map(([command])=>command),[
    'chunk_window_choreography_begin','chunk_window_choreography_execute',
  ]);
  await director.fireballCast({battleId:'natatorium'});
  assert.equal(calls.length,2,'the battle breaches once, not once per cast');
  assert.deepEqual(introductions.map((event)=>event.battleId),['natatorium'],'the durable title unlock is written by the first real Natatorium cast only');
  await director.finishBattle({result:'win'});
  assert.equal(calls.at(-1)[0],'chunk_window_choreography_restore');
});

test('first-launch title stays sealed and a pending return-title reveal is stale-token safe',async()=>{
  let introduced=false,release;
  const waitFn=()=>new Promise((resolve)=>{release=resolve;});
  let shown=0;
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,waitFn,
    effects:{sessionToken:()=>null,showComposition:async()=>{shown+=1;return true;},hideComposition:async()=>true,hidePanes:async()=>true},
    getCompositionContext:()=>({introduced,lastEndingId:'surfaced',reduceDread:false}),
  });
  assert.equal(await director.beginTitle(),null,'first launch does not reveal desktop panes');
  introduced=true;
  const pending=director.beginTitle();
  await Promise.resolve();
  await director.finishTitle();
  release?.();
  assert.equal(await pending,null);
  assert.equal(shown,0,'choosing a menu item while the collage settles cannot leak it into gameplay');
});

test('one failed native assignment converts the complete composition to Simulate',async()=>{
  const states=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,waitFn:async()=>{},
    effects:{sessionToken:()=> 'title-session',prepareMedia:async()=>true,showComposition:async()=>false,hidePanes:async()=>true},
    getCompositionContext:()=>({introduced:true,lastEndingId:'tower-won'}),onState:(state)=>states.push(state),
  });
  await director.beginTitle();
  const presentation=states.find((state)=>state.type==='composition');
  assert.equal(presentation.native,false);
  assert.equal(presentation.simulated,true,'native and simulated panes are never mixed');
});

test('death scoring schedules asynchronously and cannot extend retry timing',async()=>{
  let release;
  const blocked=new Promise((resolve)=>{release=resolve;});
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{captureSnapshot:()=> 'snapshot-death',sessionToken:()=> 'death-session',showComposition:()=>blocked,hidePanes:async()=>true},
  });
  director.prepareBattle({battleId:'natatorium'});
  const result=await director.result({battleId:'natatorium',result:'lose'});
  assert.equal(result.scheduled,true);
  release(false);
});

test('damage geometry is suppressed during a committed fireball catch',async()=>{
  const calls=[];
  const runtimeApi={invoke:async(command)=>{calls.push(command);return true;}};
  const director=createWindowChoreographyDirector({runtimeApi,effects:{hidePanes:async()=>true},documentApi:null});
  director.prepareBattle({battleId:'hall'});
  await director.damage({battleId:'hall',received:12,windowLock:true});
  assert.equal(calls.length,0);
  await director.damage({battleId:'hall',received:12,windowLock:false});
  assert.ok(calls.includes('chunk_window_choreography_execute'));
});

test('emergency restoration forgives a live fireball before closing its surfaces',async()=>{
  const target=new EventTarget();
  target.CustomEvent=CustomEvent;
  const reasons=[];
  target.addEventListener('chunk-surfer:fireball-forgive',(event)=>reasons.push(event.detail?.reason));
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:{defaultView:target},
    effects:{hideComposition:async()=>true,hidePanes:async()=>true,emergencyRestore:async()=>true},
  });
  await director.emergencyRestore({preservePuzzle:false});
  assert.deepEqual(reasons,['emergency-restore']);
});

test('near Source proper opens the required Aperture instead of the old enter pane',async()=>{
  let shown=null;
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{active:()=>true,sessionToken:()=> 'source-session',showComposition:async(plan)=>{shown=plan;return true;},hidePanes:async()=>true},
  });
  await director.sourceFrame({approach:true,elapsedSeconds:29,progress:.97,redProgress:1});
  assert.equal(shown?.compositionId,'source:aperture');
  assert.equal(shown?.completion?.holdMs,650);
  assert.equal(director.interactSource(),false,'the retired enter pane cannot bypass the arrangement');
});

test('leaving Source cancels its transaction and restores the desktop before Horizon',async()=>{
  const calls=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{calls.push(command);return true;}},documentApi:null,isApertureComplete:()=>true,
    effects:{sessionToken:()=>null,showPanes:async()=>true,hidePanes:async()=>true,hideComposition:async()=>true},
  });
  await director.sourceFrame({sourcePhase:true,complete:true,approach:false,progress:1});
  assert.equal(director.debug().source.stage,'proper');
  assert.equal(await director.leaveSource('source-horizon'),true);
  assert.equal(director.debug().source.stage,'sealed');
  assert.ok(calls.includes('chunk_window_choreography_restore'));
});

test('a near-correct Aperture settles over 120ms before its completion hold',async()=>{
  const snaps=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{
      active:()=>true,sessionToken:()=> 'source-session',showComposition:async()=>true,hidePanes:async()=>true,
      snapComposition:async(plan,options)=>{snaps.push([plan,options]);return true;},
      setCompositionCoherence:async()=>true,
    },
  });
  await director.sourceFrame({approach:true,elapsedSeconds:29,progress:.97,redProgress:1});
  const placements={
    'aperture:left':{x:800,y:500,width:240,height:180},
    'aperture:right':{x:1040,y:500,width:240,height:180},
    'aperture:eclipse':{x:920,y:320,width:240,height:180},
    'aperture:nave':{x:920,y:680,width:240,height:180},
  };
  for(const [paneId,center] of Object.entries(placements))director.noteCompositionMove({
    cueId:'source:aperture',paneId,placement:{shown:true,center,width:center.width,height:center.height,monitor:'main'},
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(snaps.length,1);
  assert.equal(snaps[0][1].durationMs,120);
  assert.equal(snaps[0][1].coherent,true);
});

test('named composition events queue until the scored panes are presented',async()=>{
  const events=[];
  const effects={
    sessionToken:()=> 'ending-session',prepareMedia:async()=>true,showComposition:async()=>true,hidePanes:async()=>true,
    triggerComposition:async(plan,event)=>{events.push([plan.compositionId,event]);return true;},
    snapComposition:async()=>true,
  };
  const director=createWindowChoreographyDirector({runtimeApi:{invoke:async()=>true},documentApi:null,effects,waitFn:async()=>{}});
  const pending=director.beginEnding('tower-lost');
  assert.equal(director.compositionEvent('ending:beat:strike-one-breath'),true);
  await pending;
  assert.deepEqual(events,[['ending:tower-lost','ending:beat:strike-one-breath']]);
  assert.equal(director.compositionEvent('ending:beat:not-authored'),false,'events cannot inject unauthored actions');
});

test('credits close the native surface pool after restoring the exact transaction',async()=>{
  const calls=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{calls.push(command);return true;}},documentApi:null,
    effects:{hideComposition:async()=>true,hidePanes:async()=>true,emergencyRestore:async()=>{calls.push('pool-close');return true;},end:async()=>true},
  });
  await director.runPlan(compileWindowChoreographyPlan({cueId:'credits-test',sceneId:'ending:surfaced',primitives:['Bloom']}));
  await director.credits();
  assert.ok(calls.includes('chunk_window_choreography_restore'));
  assert.ok(calls.includes('pool-close'));
});

test('every authored ending has a distinct resolution primitive',()=>{
  assert.equal(endingChoreographyProfile('sacrifice').resolution,'containment');
  assert.equal(endingChoreographyProfile('inversion').primitive,'Bloom');
  assert.equal(endingChoreographyProfile('drugged').primitive,'Dock');
  assert.equal(endingChoreographyProfile('surfaced').resolution,'two-names-returned');
  assert.equal(endingChoreographyProfile('contact-lost').resolution,'distant-dot');
  assert.equal(endingChoreographyProfile('tower-lost').resolution,'completed-peal');
});

test('live bounds animation latches framebuffer allocation until the final native size',()=>{
  const source=readFileSync('src/render/r3d.js','utf8');
  const resize=source.slice(source.indexOf('function resize()'),source.indexOf('// ── Facing / input hooks'));
  assert.match(resize,/if\(windowGeometryMotion\)\{windowGeometryResizePending=true;return;\}/);
  assert.match(resize,/r3dSetWindowGeometryMotion/);
  assert.match(resize,/windowGeometryResizePending=false;\s*resize\(\)/);
});

test('main samples Source leakage only from the runtime frame after movement crossing',()=>{
  const source=readFileSync('src/main.js','utf8');
  const onStep=source.indexOf('const sourceStep=chunkSurfRuntime.onStep');
  const branch=source.slice(onStep-80,onStep+1400);
  assert.match(branch,/chunkSurfRuntime\.onStep/);
  assert.match(branch,/windowChoreography\.sourceFrame\(chunkSurfRuntime\.sourceVoidFrame\(\)\)/);
  assert.ok(branch.indexOf('chunkSurfRuntime.onStep')<branch.indexOf('windowChoreography.sourceFrame'));
});

test('main bridges stable ending beat ids and title selection into the score director',()=>{
  const main=readFileSync('src/main.js','utf8'),title=readFileSync('src/game/title.js','utf8');
  assert.match(main,/compositionEvent\?\.\(`ending:beat:\$\{String\(beat\?\.id\|\|''\)\}`\)/);
  assert.match(main,/onSelectionChange:\(\)=>windowChoreography\?\.compositionEvent\?\.\('title:selection'\)/);
  assert.match(title,/onSelectionChange\(items\[sel\]\?\.id\|\|'',sel\)/);
});
