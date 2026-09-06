import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endingManifest } from '../src/data/endings.js';
import {
  MAX_MEDIA_SURFACES,
  WINDOW_MEDIA_PROTOCOL,
  apertureCompositionPlan,
  compilePaneScore,
  compileWindowCompositionPlan,
  createPaneScoreEnvelope,
  deathCompositionPlan,
  endingCompositionPlan,
  evaluateCompositionConstraints,
  paneScoreStateAt,
  proceduralMediaScore,
  scoreTimeAt,
  returnCompositionPlan,
  titleCompositionPlan,
  titleMemoryAsset,
  validatePaneScoreEnvelope,
  validateWindowCompositionPlan,
  windowMediaContentId,
  windowMediaManifest,
} from '../src/platform/window-composition.js';

test('media compositions use a separate eight-pane pool while fireballs stay at four',()=>{
  assert.equal(MAX_MEDIA_SURFACES,8);
  const plan=endingCompositionPlan('contact-lost');
  assert.equal(plan.surfaces.length,8);
  assert.equal(validateWindowCompositionPlan(plan).ok,true);
  assert.throws(()=>compileWindowCompositionPlan({compositionId:'too-many',sceneId:'test',purpose:'ending',surfaces:Array.from({length:9},()=>({content:{kind:'procedural',preset:'empty-field'}}))}),/surface count/);
});

test('composition content is repository-owned and strictly allowlisted',()=>{
  assert.throws(()=>compileWindowCompositionPlan({compositionId:'remote',sceneId:'test',purpose:'title',surfaces:[{content:{kind:'video',assetId:'https://example.com/video'}}]}),/unknown composition asset/);
  assert.throws(()=>compileWindowCompositionPlan({compositionId:'file',sceneId:'test',purpose:'death',surfaces:[{content:{kind:'snapshot',token:'/Users/player/photo.png'}}]}),/snapshot token/);
  const manifest=windowMediaManifest();
  assert.equal(manifest.networkAtRuntime,false);
  assert.equal(manifest.audioPolicy,'silent');
  assert.ok(manifest.assets.every((asset)=>asset.derivatives.webm&&asset.derivatives.mp4&&asset.derivatives.poster));
});

test('schema-2 scores compile legacy surface content into independent pane programs',()=>{
  const plan=compileWindowCompositionPlan({compositionId:'score-contract',sceneId:'test',purpose:'title',epochMs:1000,
    surfaces:[
      {id:'pane:a',content:{kind:'video',assetId:'clouds'}},
      {id:'pane:b',content:{kind:'video',assetId:'eclipse'}},
    ],
    score:{durationMs:4000,loop:true,cues:[
      {id:'clone',atMs:500,operations:[{type:'clone',targets:['pane:a','pane:b'],source:{paneId:'pane:a'},transition:'dissolve',durationMs:220}]},
      {id:'selection',event:'title:selection',operations:[{type:'swap',mapping:{'pane:a':'pane:b','pane:b':'pane:a'}}]},
    ]},
  });
  assert.equal(plan.schema,2);
  assert.equal(plan.surfaces[0].assignment.content.assetId,'clouds');
  const a=compilePaneScore(plan,'pane:a'),b=compilePaneScore(plan,'pane:b');
  assert.equal(a.initial.content.assetId,'clouds');
  assert.equal(b.initial.content.assetId,'eclipse');
  assert.equal(a.cues[0].action.assignment.content.assetId,'clouds');
  assert.equal(b.cues[0].action.assignment.content.assetId,'clouds');
  assert.equal(paneScoreStateAt(a,{nowMs:1600}).assignment.content.assetId,'clouds');
  assert.equal(paneScoreStateAt(a,{nowMs:1000,events:['title:selection']}).assignment.content.assetId,'eclipse');
  assert.equal(scoreTimeAt(a,5500),500,'looping scores converge to the same local time');
});

test('clone, echo, mosaic, relay and ripple lower deterministically per pane',()=>{
  const ids=['a','b','c','d'];
  const plan=compileWindowCompositionPlan({compositionId:'distribution',sceneId:'test',purpose:'ending',epochMs:0,
    surfaces:ids.map((id,index)=>({id,content:{kind:'video',assetId:['clouds','eclipse','flowers-seb','cathedral'][index]},initial:{x:.2+index*.2,y:.5}})),
    score:{durationMs:5000,cues:[
      {id:'echo',atMs:100,operations:[{type:'echo',targets:ids,source:{paneId:'a'},stepMs:250}]},
      {id:'mosaic',atMs:200,operations:[{type:'mosaic',targets:ids,source:{paneId:'b'}}]},
      {id:'relay',event:'relay',operations:[{type:'relay',sourcePane:'c',targetPane:'d',hideSource:true}]},
      {id:'ripple',event:'ripple',operations:[{type:'ripple',targets:ids,order:ids,intervalMs:70,operation:{type:'freeze',targets:ids}}]},
    ]},
  });
  const scores=ids.map((id)=>compilePaneScore(plan,id));
  assert.deepEqual(scores.map((score)=>score.cues.find((cue)=>cue.id.startsWith('echo'))?.action.assignment.phaseOffsetMs),[0,250,500,750]);
  assert.deepEqual(scores.map((score)=>score.cues.find((cue)=>cue.id.startsWith('mosaic'))?.action.assignment.crop),[
    {x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5},
  ]);
  assert.equal(scores[2].cues.find((cue)=>cue.event==='relay').action.visible,false);
  assert.equal(scores[3].cues.find((cue)=>cue.event==='relay').action.assignment.content.assetId,'flowers-seb');
  assert.deepEqual(scores.map((score)=>score.cues.find((cue)=>cue.event==='ripple').delayMs),[0,70,140,210]);
});

test('procedural scores author deterministic ripples, circular motion, cut bursts and mosaic breaths',()=>{
  const assets=['clouds','eclipse','flowers-seb','cathedral'];
  const surfaces=assets.map((assetId,index)=>({
    id:`procedural:${index}`,content:{kind:'video',assetId},crop:{x:0,y:0,w:1,h:1},phaseOffsetMs:index*200,
    initial:[{x:.15,y:.2},{x:.85,y:.2},{x:.85,y:.8},{x:.15,y:.8}][index],
  }));
  const first=proceduralMediaScore({id:'test',surfaces,seed:77,durationMs:20000});
  const replay=proceduralMediaScore({id:'test',surfaces,seed:77,durationMs:20000});
  const alternate=proceduralMediaScore({id:'test',surfaces,seed:91,durationMs:20000});
  assert.deepEqual(replay,first,'the same authored seed produces the same edit');
  assert.notDeepEqual(alternate,first,'another authored seed produces another edit');
  assert.ok(first.cues.some((cue)=>cue.id==='test-phase-ripple'));
  assert.ok(first.cues.some((cue)=>cue.id==='test-circle-one'&&cue.operations.filter((operation)=>operation.type==='geometry').length===4));
  assert.ok(first.cues.filter((cue)=>cue.id.startsWith('test-quick-cut-')).every((cue)=>cue.operations[0].transition==='cut'));
  assert.ok(first.cues.some((cue)=>cue.id==='test-mosaic-breath'&&cue.operations[0].type==='mosaic'));
  const reduced=proceduralMediaScore({id:'test',surfaces,seed:77,durationMs:20000,reducedMotion:true});
  assert.ok(reduced.cues.every((cue)=>cue.id==='test-geometry-home'||cue.operations.every((operation)=>operation.type!=='geometry')),
    'reduced motion removes travelling pane geometry while keeping the score');
});

test('pane envelopes bind one score to one label, session and monotonic revision',()=>{
  const plan=titleCompositionPlan({endingId:'contact-won',epochMs:1000});
  const envelopes=plan.surfaces.map((surface,index)=>createPaneScoreEnvelope(plan,surface.id,{
    targetLabel:`window-media-${index+1}`,sessionToken:'session-current',revision:index+1,
  }));
  assert.equal(envelopes.every((value)=>value.protocol===WINDOW_MEDIA_PROTOCOL),true);
  assert.equal(new Set(envelopes.map((value)=>windowMediaContentId(value.score.initial))).size,4,'title starts with four visibly distinct assignments');
  assert.equal(validatePaneScoreEnvelope(envelopes[0],{targetLabel:'window-media-1'}).ok,true);
  assert.equal(validatePaneScoreEnvelope(envelopes[0],{targetLabel:'window-media-2'}).reason,'target');
  assert.equal(validatePaneScoreEnvelope(envelopes[0],{targetLabel:'window-media-1',currentSession:'newer-session',currentRevision:8}).reason,'session');
});

test('reduced motion retains assignments and events while lowering optical transitions',()=>{
  const ordinary=titleCompositionPlan({endingId:'surfaced'}),reduced=titleCompositionPlan({endingId:'surfaced',reducedMotion:true});
  assert.deepEqual(reduced.surfaces.map((surface)=>surface.content),ordinary.surfaces.map((surface)=>surface.content));
  assert.deepEqual(reduced.score.cues.map((cue)=>cue.event||cue.atMs),ordinary.score.cues.map((cue)=>cue.event||cue.atMs));
  for(const cue of reduced.score.cues)for(const operation of cue.operations){
    assert.equal(operation.transition,'cut');assert.equal(operation.durationMs,0);
  }
});

test('return-title media selection is non-clinical and keyed by the last return',()=>{
  assert.equal(titleMemoryAsset('tower-lost'),'bellringers-datamosh');
  assert.equal(titleMemoryAsset('tower-won'),'cathedral');
  assert.equal(titleMemoryAsset('surfaced'),'pollination');
  assert.equal(titleMemoryAsset('inversion'),'demolition');
  assert.equal(titleMemoryAsset('contact-won'),'sunflower-datamosh');
  const plan=titleCompositionPlan({endingId:'contact-won'});
  assert.equal(plan.purpose,'title');
  assert.equal(plan.completion.mode,'nonblocking');
  assert.ok(plan.surfaces.every((surface)=>surface.sensitivity==='none'));
  assert.ok(plan.surfaces.every((surface)=>surface.target),'all return fragments own a nonblocking fold target');
  assert.equal(plan.fault.profile,'nvme-sector');
  assert.ok(plan.fault.intensity>0);
  assert.equal(plan.formation.mode,'memory-unfold');
  assert.ok(plan.surfaces.every((surface)=>surface.draggable===false),
    'title fragments are authored playback and cannot take walking focus');
  assert.ok(plan.surfaces.some((surface)=>surface.entry.x!==surface.initial.x||surface.entry.y!==surface.initial.y));
});

test('reduceDread replaces clinical death imagery without changing geometry or timing',()=>{
  const ordinary=deathCompositionPlan({battleId:'source-final',snapshotToken:'snapshot-final'});
  const reduced=deathCompositionPlan({battleId:'source-final',snapshotToken:'snapshot-final',reduceDread:true});
  assert.deepEqual(reduced.surfaces.map(({width,height})=>[width,height]),ordinary.surfaces.map(({width,height})=>[width,height]));
  assert.ok(ordinary.surfaces.some((surface)=>surface.sensitivity==='clinical'));
  assert.ok(reduced.surfaces.every((surface)=>surface.sensitivity!=='clinical'));
  assert.ok(ordinary.surfaces.every((surface)=>surface.draggable===false),
    'death fragments never borrow focus from retry input');
});

test('The Aperture requires the exact eye-and-path topology for 650ms',()=>{
  const plan=apertureCompositionPlan();
  assert.equal(plan.completion.holdMs,650);
  assert.equal(plan.fault.profile,'nvme-sector');
  assert.ok(plan.fault.intensity>.8,'Aperture owns the strongest window fault');
  assert.equal(plan.formation.mode,'aperture-breach');
  assert.ok(plan.surfaces.every((surface)=>surface.draggable===true),
    'only the authored aperture puzzle opts into desktop pointer interaction');
  assert.deepEqual(plan.constraints.map((constraint)=>constraint.tolerance),[12,12,16,24,16,24]);
  const state={
    'aperture:left':{x:800,y:500,width:240,height:180},
    'aperture:right':{x:1040,y:500,width:240,height:180},
    'aperture:eclipse':{x:920,y:320,width:240,height:180},
    'aperture:nave':{x:920,y:680,width:240,height:180},
  };
  assert.equal(evaluateCompositionConstraints(plan,state).ok,true);
  assert.equal(evaluateCompositionConstraints(plan,{...state,'aperture:right':{...state['aperture:right'],x:1080}}).ok,false);
  assert.equal(evaluateCompositionConstraints(plan,{...state,'aperture:right':{...state['aperture:right'],monitor:'right'},'aperture:left':{...state['aperture:left'],monitor:'left'}}).ok,false,'mixed-monitor edges cannot accidentally solve');
  const targetState=Object.fromEntries(plan.surfaces.map((surface)=>[surface.id,{
    x:surface.target.anchorX*1920+surface.target.offsetX,
    y:surface.target.anchorY*1000+surface.target.offsetY,
    width:surface.width,height:surface.height,monitor:'main',
  }]));
  assert.equal(evaluateCompositionConstraints(plan,targetState).ok,true,'monitor-relative auto assembly lands on the exact authored graph');
});

test('every ending has authored media and credits restore owns cleanup',()=>{
  for(const id of ['sacrifice','helped','inversion','drugged','surfaced','contact-won','contact-lost','tower-won','tower-lost']){
    const plan=endingCompositionPlan(id);
    assert.equal(plan.purpose,'ending',id);
    assert.ok(plan.surfaces.length>=2,id);
    assert.ok(plan.surfaces.every((surface)=>surface.target),`${id} owns a resolved movement target`);
    assert.ok(plan.surfaces.every((surface)=>surface.draggable===false),`${id} never steals cutscene focus`);
  }
  const choreography=readFileSync(new URL('../src/platform/window-choreography.js',import.meta.url),'utf8');
  // THE CREDITS RESTORE, AND DELIBERATELY DO NOT CLOSE THE POOL.
  //
  // This used to be `restore('credits',{closePool:true})` plus effects.end(),
  // which tore every desktop surface down at the exact moment before the return
  // report — so the last screen of the game was the one screen guaranteed to
  // have no surfaces. The lease now runs ending -> credits -> return -> title,
  // and is destroyed exactly once, by returnToTitle's emergencyRestore, which
  // is the only path that is supposed to destroy it (rebuilding under the same
  // labels is a race Tauri loses both ways).
  assert.match(choreography,/async function credits\(\)\{return restore\('credits'\);\}/,
    'the credits restore the frame');
  assert.doesNotMatch(choreography,/restore\('credits',\s*\{\s*closePool/,
    'the credits must not close the pool the return is about to use');
  assert.match(choreography,/async function beginReturn\(/,
    'the return has its own composition entry point');
});

test('every event-driven ending cue names a stable authored cutscene beat or the shared final hold',()=>{
  for(const id of ['sacrifice','helped','inversion','drugged','surfaced','contact-won','contact-lost','tower-won','tower-lost']){
    const beats=new Set((endingManifest(id)?.cutscene?.beats||[]).map((beat)=>beat.id));
    const events=endingCompositionPlan(id).score.cues.map((cue)=>cue.event).filter(Boolean);
    assert.ok(events.length>0,id);
    assert.ok(events.includes('ending:final-hold'),`${id}: media residue must clear the route-specific final image`);
    for(const event of events){
      if(event==='ending:final-hold')continue;
      assert.ok(event.startsWith('ending:beat:'),`${id}: ${event}`);
      assert.ok(beats.has(event.slice('ending:beat:'.length)),`${id}: ${event}`);
    }
  }
});

test('window faults respect flash accessibility without removing their sector grammar',()=>{
  for(const flashMode of ['full','reduced','off']){
    const plan=endingCompositionPlan('tower-lost',{flashMode});
    assert.equal(plan.fault.profile,'nvme-sector');
    assert.equal(plan.fault.flashMode,flashMode);
    assert.ok(plan.surfaces.every((surface)=>surface.shader==='nvme-sector'));
  }
});

// ── THE RETURN, ON THE SURFACES ──────────────────────────────────────────────
test('the return composition files the account across the panes as images',()=>{
  const tokens=['snapshot-a','snapshot-b','snapshot-c','snapshot-d'];
  const plan=returnCompositionPlan({sections:['THE JOB','TAKES','THE RECORDIST','EQUIPMENT'],snapshotTokens:tokens});
  assert.equal(plan.purpose,'return');
  assert.equal(plan.surfaces.length,4);

  // SNAPSHOTS, NOT TEXT. window-media-surface.js is a WebGL shader with an image
  // sampler and a few procedural forms and NO glyph path, so a `text` pane
  // renders in the in-canvas simulation and comes up black on the desktop —
  // backwards for a feature that exists for the desktop. Every pane here must
  // carry an image the caller rasterised.
  assert.ok(plan.surfaces.every((surface)=>surface.content.kind==='snapshot'),
    'a return pane is a rasterised section, never a text pane');
  assert.ok(plan.surfaces.every((surface)=>surface.target),'each section files to a resolved place');

  // Two is the floor: a one-pane return is the transport on its own and does not
  // need the desktop at all.
  assert.equal(returnCompositionPlan({snapshotTokens:['snapshot-a']}).surfaces.length,2,
    'a single token still composes a legal plan');

  // Reduced motion keeps the beats and removes the travel, like every other plan.
  const reduced=returnCompositionPlan({snapshotTokens:tokens,reducedMotion:true});
  assert.equal(reduced.reducedMotion,true);
  assert.ok(reduced.score.cues.length===plan.score.cues.length,'the same beats survive reduced motion');
});
