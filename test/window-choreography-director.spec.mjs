import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENDING_CUTSCENES } from '../src/data/endings.js';
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

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

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
  // THE ONE EXPLORATION EXCEPTION, AND IT IS ADDRESSED BY ITS OWN SCENE ID.
  //
  // The box office key cabinet may place clue surfaces. It gets a policy of its
  // own rather than borrowing 'battle-only', so the compositor can hold it to a
  // narrower contract than a rupture — display only, no input, no main-window
  // move. Crucially it does NOT loosen anything above: every scene in the stable
  // list is still stable, including source:foh-door, which is the same threshold
  // this room sits on.
  assert.equal(windowChoreographyPolicy('box-office:key-cabinet'),'box-office');
  // AND THE SECOND, ON THE SAME TERMS. The plant header may place a service
  // card and two gauges while the wrench is on the tree. Its own scene id, its
  // own policy, the same narrow contract — and, again, nothing above it moves:
  // the plant room itself is not addressable here, only this one microgame.
  assert.equal(windowChoreographyPolicy('plant-header'),'stable','the room is not the exception; the header is');
  assert.equal(windowChoreographyPolicy('plant:header'),'plant-header');
  assert.equal(windowChoreographyPolicy('box-office'),'stable',
    'the room is not the cue: only the cabinet scene reaches outside the window');
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
  // The metrics probe comes FIRST and is the whole point: whether to leave
  // fullscreen is measured from the window, never read out of the settings file.
  assert.deepEqual(calls.map(([command])=>command),[
    'chunk_window_metrics','chunk_window_choreography_begin','chunk_window_choreography_execute',
  ]);
  await director.fireballCast({battleId:'natatorium'});
  assert.equal(calls.length,3,'the battle breaches once, not once per cast');
  assert.deepEqual(introductions.map((event)=>event.battleId),['natatorium'],'the durable title unlock is written by the first real Natatorium cast only');
  await director.finishBattle({result:'win'});
  assert.equal(calls.at(-1)[0],'chunk_window_choreography_restore');
});

// LEAVING FULLSCREEN IS DECIDED BY MEASUREMENT, NOT BY THE SETTINGS FILE.
//
// This was the bug: restoreGameMode came from a persisted display-mode string,
// so a fullscreen the app did not itself perform — the macOS green button, or
// Cmd+Ctrl+F — was invisible to it. The exit was skipped, base_center then
// refused every surface because nothing composites over a Space, and the whole
// authored cue silently did nothing until the window was restored by hand.
//
// display_policy.rs reports the three states separately now. Any of them means
// "leave first".
test('the fullscreen exit is driven by measured window state, not the saved setting',async()=>{
  const run=async(metrics,displayMode)=>{
    let begun=null;
    const runtimeApi={invoke:async(command,payload)=>{
      if(command==='chunk_window_metrics')return metrics;
      if(command==='chunk_window_choreography_begin'){begun=payload.request;return true;}
      return true;
    }};
    const director=createWindowChoreographyDirector({
      runtimeApi,documentApi:null,waitFn:async()=>{},
      tokenFactory:()=>'t',getDisplayMode:()=>displayMode,
      effects:{sessionToken:()=>'s',showPanes:async()=>true,hidePanes:async()=>true},
    });
    await director.fireballCast({battleId:'natatorium'});
    return begun;
  };

  // The reported case: settings say windowed, the player is in a macOS Space.
  assert.equal((await run({native_fullscreen:true,simple_fullscreen:false,fills_screen:true},'windowed'))
    .restoreGameMode,true,'a native Space is left even though the setting says windowed');

  // Game mode, which the old code did get right.
  assert.equal((await run({native_fullscreen:false,simple_fullscreen:true,fills_screen:true},'game-mode'))
    .restoreGameMode,true,'simple fullscreen is still left');

  // A frame dragged out to cover the screen: no mode was ever set, but a cue
  // still cannot move a window that has nowhere to move to.
  assert.equal((await run({native_fullscreen:false,simple_fullscreen:false,fills_screen:true},'windowed'))
    .restoreGameMode,true,'a frame that fills the monitor counts');

  // Genuinely windowed: nothing to leave.
  assert.equal((await run({native_fullscreen:false,simple_fullscreen:false,fills_screen:false},'windowed'))
    .restoreGameMode,false,'a real window is left alone');

  // The stale setting is the fallback ONLY when the probe itself fails.
  assert.equal((await run(null,'game-mode')).restoreGameMode,true,'falls back to the setting when metrics fail');
  assert.equal((await run(null,'windowed')).restoreGameMode,false);
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

test('near Source proper prints a nonblocking warning instead of requiring an Aperture',async()=>{
  let shown=null;const puzzleStates=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{active:()=>true,sessionToken:()=> 'source-session',showComposition:async(plan)=>{shown=plan;return true;},hidePanes:async()=>true},
    onPuzzleState:(active)=>puzzleStates.push(active),
  });
  await director.sourceFrame({approach:true,elapsedSeconds:29,progress:.97,redProgress:1});
  assert.equal(shown?.compositionId,'source:warning');
  assert.equal(shown?.completion?.mode,'nonblocking');
  assert.equal(shown?.constraints.length,0);
  assert.deepEqual(puzzleStates,[],'walking never acquires a puzzle input lock');
  assert.equal(await director.puzzleInteract(),false);
  assert.equal(director.interactSource(),false,'the first HUSH interaction must not pay an invisible enter-pane tax');
  await director.leaveSource();
});

test('the Source warning cannot repeat every time progress crosses another bucket',async()=>{
  const shown=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{showComposition:async(plan)=>{shown.push(plan);return true;},hidePanes:async()=>true},
  });
  await director.sourceFrame({approach:true,elapsedSeconds:29,progress:.97,redProgress:1});
  await director.sourceFrame({complete:true,progress:1});
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(shown.length,1);
  await director.leaveSource();
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

test('stale Aperture placements cannot settle a puzzle or acquire a movement gate',async()=>{
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
  assert.equal(snaps.length,0);
  assert.equal(director.debug().composition.purpose,'source-warning');
  assert.equal(await director.puzzleInteract(),false);
  await director.leaveSource();
});

test('HUSH battle retires Source warning and its timer without replaying it on return',async()=>{
  const shown=[],hidden=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{showComposition:async(plan)=>{shown.push(plan);return true;},hideComposition:async()=>{hidden.push(true);return true;},hidePanes:async()=>true},
  });
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(director.debug().composition.purpose,'source-warning');
  director.prepareBattle({battleId:'source-final'});
  assert.equal(director.debug().composition,null);
  await director.restore('battle:win');
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(shown.length,1,'the same Source journey does not replay its warning after combat');
  assert.ok(hidden.length>0);
  await director.leaveSource();
});

test('opening HUSH dialogue immediately retires the warning and never reoffers it after withdrawal',async()=>{
  const shown=[],hidden=[],events=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,onState:(event)=>events.push(event),
    effects:{showComposition:async(plan)=>{shown.push(plan);return true;},hideComposition:async()=>{hidden.push(true);return true;},hidePanes:async()=>true},
  });
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(director.debug().composition.purpose,'source-warning');
  const retiring=director.beginSourceContact();
  assert.equal(director.debug().composition,null,'the dialog is unobscured before the native cleanup promise resolves');
  await retiring;
  assert.ok(hidden.length>0);
  assert.ok(events.some((event)=>event.type==='restore'&&event.reason==='source-contact'));
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(shown.length,1,'backing out of HUSH dialogue cannot restart the warning');
  assert.equal(director.interactSource(),false);
  await director.leaveSource();
});

test('HUSH contact cancels an unpresented warning without allowing a late pane over dialogue',async()=>{
  const shown=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async()=>true},documentApi:null,
    effects:{showComposition:async(plan)=>{shown.push(plan);return true;},hideComposition:async()=>true,hidePanes:async()=>true},
  });
  const printing=director.sourceFrame({complete:true,progress:1});
  await director.beginSourceContact();
  await printing;
  assert.equal(shown.length,0);
  await director.sourceFrame({complete:true,progress:1});
  assert.equal(shown.length,0,'the canceled warning remains consumed');
  await director.leaveSource();
});

test('all eight Tower composition events queue until the scored panes are presented',async()=>{
  const events=[];
  const effects={
    sessionToken:()=> 'ending-session',prepareMedia:async()=>true,showComposition:async()=>true,hidePanes:async()=>true,
    triggerComposition:async(plan,event)=>{events.push([plan.compositionId,event]);return true;},
    snapComposition:async()=>true,
  };
  const director=createWindowChoreographyDirector({runtimeApi:{invoke:async()=>true},documentApi:null,effects,waitFn:async()=>{}});
  const pending=director.beginEnding('tower-lost');
  const strikes=ENDING_CUTSCENES['tower-lost'].beats.map((beat)=>`ending:beat:${beat.id}`);
  for(const event of strikes)assert.equal(director.compositionEvent(event),true,event);
  await pending;
  assert.deepEqual(events,strikes.map((event)=>['ending:tower-lost',event]));
  assert.equal(director.compositionEvent('ending:beat:strike-six-full-peal'),false,'the obsolete sixth-strike terminal cannot fire');
  assert.equal(director.compositionEvent('ending:beat:not-authored'),false,'events cannot inject unauthored actions');
});

// THE CREDITS RESTORE THE FRAME AND LEAVE THE POOL STANDING.
//
// They used to close it, which meant the surfaces were destroyed at the exact
// moment before the return report — the last screen of the game was the one
// screen guaranteed to have none. The lease runs ending -> credits -> return ->
// title now, and only returnToTitle's emergencyRestore destroys it. Rebuilding
// the pool under the same labels is a race Tauri loses both ways, so closing it
// early is not merely wasteful, it is the thing that used to kill the effect
// after a return to the title.
test('credits restore the exact transaction and leave the pool for the return',async()=>{
  const calls=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{calls.push(command);return true;}},documentApi:null,
    effects:{hideComposition:async()=>true,hidePanes:async()=>true,emergencyRestore:async()=>{calls.push('pool-close');return true;},end:async()=>true},
  });
  await director.runPlan(compileWindowChoreographyPlan({cueId:'credits-test',sceneId:'ending:surfaced',primitives:['Bloom']}));
  await director.credits();
  assert.ok(calls.includes('chunk_window_choreography_restore'),'the main frame is put back');
  assert.ok(!calls.includes('pool-close'),'the surfaces survive into the return');
});

test('a physical roof ending retires an earlier cue without closing return surfaces',async()=>{
  const calls=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{calls.push(command);return true;}},documentApi:null,
    effects:{
      showComposition:async()=>true,
      hideComposition:async()=>{calls.push('hide-composition');return true;},
      hidePanes:async()=>{calls.push('hide-panes');return true;},
      emergencyRestore:async()=>{calls.push('pool-close');return true;},
    },waitFn:async()=>{},
  });
  await director.beginEnding('sacrifice');
  assert.ok(director.debug().composition,'the preceding media cue is visible');
  await director.restore('roof-century-stay');
  assert.equal(director.debug().composition,null);
  assert.ok(calls.includes('hide-composition'));
  assert.ok(calls.includes('hide-panes'));
  assert.ok(!calls.includes('pool-close'),'the return can reuse its surface pool');
});

test('the return files its sections onto the surfaces as registered images',async()=>{
  const registered=[];
  const calls=[];
  const director=createWindowChoreographyDirector({
    runtimeApi:{invoke:async(command)=>{calls.push(command);return true;}},documentApi:null,
    effects:{
      sessionToken:()=>'return-session',
      prepareMedia:async()=>true,showComposition:async()=>true,hideComposition:async()=>true,hidePanes:async()=>true,
      registerSnapshot:(url)=>{registered.push(url);return `snapshot-${registered.length}`;},
    },
  });
  const page=(label)=>({label,image:'data:image/webp;base64,AAAA'});
  const result=await director.beginReturn([page('THE JOB'),page('TAKES'),page('EQUIPMENT')]);
  assert.equal(registered.length,3,'every section is registered before it is shown');
  assert.equal(result?.plan?.purpose,'return');
  assert.ok(result.plan.surfaces.every((surface)=>surface.content.kind==='snapshot'));

  // A section that failed to rasterise is not a pane. Below two there is no
  // composition at all — the transport reads the return on its own.
  const thin=await director.beginReturn([page('ONLY ONE')]);
  assert.equal(thin,null,'one section is not a composition');
  assert.equal(await director.beginReturn([{label:'BROKEN',image:null}]),null);
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
  const stepStart=mainSource.indexOf('function step(dx,dy){');
  const stepEnd=mainSource.indexOf('\nfunction teleport()',stepStart);
  assert.ok(stepStart>=0&&stepEnd>stepStart,'the movement function is bounded by its next declaration');
  const step=mainSource.slice(stepStart,stepEnd);
  const onStep=step.indexOf('const sourceStep=chunkSurfRuntime.onStep');
  const branchStart=step.lastIndexOf('  if(usingSourceSpace()){',onStep);
  const branchEnd=step.indexOf('\n  if(storyMode&&usingPlan()){',onStep);
  assert.ok(onStep>=0&&branchStart>=0&&branchEnd>onStep,'the Source movement branch is complete');
  const sourceBranch=step.slice(branchStart,branchEnd);
  const makeStep=new Function('chunkSurfRuntime','windowChoreography','usingSourceSpace','trace',`
    let px=10,py=20,sx=1,sy=0,lastStepDx=0,lastStepDy=0;
    const stepFrom={x:9,y:20},trail=[],TRAIL_LEN=8,stepCount=1;
    const R3={r3dFacing:()=>2,r3dLookAngles:()=>({yaw:.3,pitch:.1})};
    const syncSourceRender=()=>trace.push('render');
    const syncSourceWindowDecay=()=>trace.push('decay');
    const sourceShoreCameraPatch=()=>({});
    const saveCommit=()=>trace.push('save'),updateAudio=()=>trace.push('audio');
    return ()=>{${sourceBranch}};
  `);
  for(const mode of ['ready','not-ready','shore','released']){
    const trace=[],frames=[],runtimeOnly={},frame={sourcePhase:true,windowIntrusionReady:mode!=='not-ready',revision:'before'};
    let active=true;
    const runtime={
      crossesRouteDoor:()=>false,
      onStep(from,to){
        trace.push('crossing');assert.deepEqual(from,{x:9,y:20});
        assert.deepEqual(to,{x:10,y:20,facing:2,yaw:.3,pitch:.1});
        Object.assign(frame,{revision:'after',runtimeOnly});
        if(mode==='released')active=false;
        return null;
      },
      setPlayerPosition(position){trace.push('position');frame.position=position;},
      sourceVoidFrame(){trace.push('runtime-frame');return frame;},
      sourceShoreFrame:()=>({active:mode==='shore'}),state:()=>({}),
    };
    makeStep(runtime,{sourceFrame(next){trace.push('director');frames.push(next);}},()=>active,trace)();
    if(mode==='released'){
      assert.deepEqual(trace,['crossing'],'a completed route cannot leak a stale Source frame');
      assert.equal(frames.length,0);
      continue;
    }
    assert.equal(frames.length,1);
    assert.equal(frames[0].revision,'after');assert.equal(frames[0].runtimeOnly,runtimeOnly);
    assert.deepEqual(frames[0].position,{x:10,y:20,facing:2,yaw:.3,pitch:.1});
    assert.equal(frames[0].sourcePhase,mode==='ready','shore and unready intrusion retain their intentional suppression');
    for(const earlier of ['crossing','position','render'])assert.ok(trace.indexOf(earlier)<trace.indexOf('runtime-frame'));
    assert.ok(trace.indexOf('runtime-frame')<trace.indexOf('director'));
  }
});

test('main bridges stable ending beat ids and title selection into the score director',()=>{
  const main=readFileSync('src/main.js','utf8'),title=readFileSync('src/game/title.js','utf8');
  assert.match(main,/compositionEvent\?\.\(`ending:beat:\$\{String\(beat\?\.id\|\|''\)\}`\)/);
  assert.match(main,/onSelectionChange:\(\)=>windowChoreography\?\.compositionEvent\?\.\('title:selection'\)/);
  assert.match(title,/onSelectionChange\(items\[sel\]\?\.id\|\|'',sel\)/);
});

// A fullscreen cue must wait for the advisory, including its native exit.
test('fullscreen advisory gates native geometry and surfaces', async()=>{
  let acknowledge, prompted=0;
  const calls=[];
  const director=createWindowChoreographyDirector({
    documentApi:null,waitFn:async()=>{},
    runtimeApi:{invoke:async(command)=>{
      calls.push(command);
      return command==='chunk_window_metrics' ? {native_fullscreen:true} : true;
    }},
    releaseFullscreen:(transition)=>{
      prompted++;
      return new Promise(resolve=>{acknowledge=async()=>resolve(await transition());});
    },
    effects:{showPanes:async()=>{calls.push('show-panes');return true;},hidePanes:async()=>true},
  });
  director.prepareBattle({battleId:'natatorium'});
  const cast=director.fireballCast({battleId:'natatorium'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prompted,1);
  assert.deepEqual(calls,['chunk_window_metrics']);
  await acknowledge();
  await cast;
  assert.ok(calls.indexOf('chunk_window_choreography_begin')<calls.indexOf('show-panes'));
  await director.restore('test-complete');
});

test('restoring during the fullscreen advisory cancels the pending cue', async()=>{
  let signal, begin;
  const calls=[];
  const director=createWindowChoreographyDirector({
    documentApi:null,waitFn:async()=>{},
    runtimeApi:{invoke:async(command)=>{
      calls.push(command);
      return command==='chunk_window_metrics' ? {native_fullscreen:true} : true;
    }},
    releaseFullscreen:(transition,options)=>{
      begin=transition;signal=options.signal;
      return new Promise(resolve=>signal.addEventListener('abort',()=>resolve(false),{once:true}));
    },
  });
  director.prepareBattle({battleId:'natatorium'});
  const cast=director.fireballCast({battleId:'natatorium'});
  await new Promise(resolve=>setImmediate(resolve));
  await director.restore('scene-replaced');
  assert.equal(signal.aborted,true);
  assert.equal(await begin(),false);
  assert.equal(await cast,null);
  assert.deepEqual(calls,['chunk_window_metrics']);
});

test('an in-flight native exit is restored if its scene was cancelled', async()=>{
  let settle;
  const calls=[];
  const director=createWindowChoreographyDirector({
    documentApi:null,waitFn:async()=>{},
    runtimeApi:{invoke:async(command)=>{
      calls.push(command);
      if(command==='chunk_window_metrics')return {native_fullscreen:true};
      if(command==='chunk_window_choreography_begin')return new Promise(resolve=>{settle=resolve;});
      return true;
    }},
  });
  director.prepareBattle({battleId:'natatorium'});
  const cast=director.fireballCast({battleId:'natatorium'});
  await new Promise(resolve=>setImmediate(resolve));
  await director.restore('scene-replaced');
  settle(true);
  assert.equal(await cast,null);
  assert.deepEqual(calls,['chunk_window_metrics','chunk_window_choreography_begin','chunk_window_choreography_restore']);
});
