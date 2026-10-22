import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createAcademicCrowdDread,ACADEMIC_CROWD_DREAD as T} from '../src/game/academic-crowd-dread.js';
import {createAcademicAdversaries} from '../src/game/academic-adversaries.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_ADVERSARY_SOCIAL_REPLIES} from '../src/data/academic-adversaries.js';
import {CONSERVATORY_ADVERSARY_FLAGS,freshConservatoryAdversaries} from '../src/game/conservatory-adversaries.js';
import {academicBouncerSocialAudible as bouncerSocialAudible,academicBouncerSegmentClear} from '../src/game/academic-bouncer-audibility.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';
import * as REC from '../src/game/recordist.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as scenes from '../src/game/scenes.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {uiWrap} from '../src/render/ui.js';
import {machinePanelBody} from '../src/render/presentation.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/render/academic-adversaries.js',import.meta.url),'utf8');
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function production(name,source=main){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`${name}: production function exists`);
  const next=source.slice(start+1).search(/\n(?:export )?function /);
  return source.slice(start,next<0?source.length:start+1+next).trim();
}
const reloadSource=main.match(/  academicCrowdDread\.load\(getSave\(\)\.academicCrowdDread\);\n  academicCrowdDreadNotice=0;academicCrowdDreadResolution=null;academicCrowdDreadHudAt=-Infinity;/)?.[0];
assert.ok(reloadSource,'execute actual production crowd load/reset statements');
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});

// Real compiled map, props, state, save transaction, scene ownership and cue
// layout. Audio-device calls and glyph painting are observations at the edge;
// these tests do not claim native pixels, real mouse input or human attention.
async function adapter(run,{saved,heldFresh=false}={}){
  const initial=saved||{...freshSave(),academicAdversaries:{version:1,outcome:heldFresh?null:'legacy-spent',demonstrated:false},rec:{composure:40}};
  const priorRec=structuredClone(REC.recState());
  return withTransientGameState({save:initial},async scope=>{
    scenes.clear();PROPS.propsInit(FP);PROPS.loadPropState({});REC.recState().phase='idle';REC.loadRecState(getSave().rec||{});
    const calls={paint:[],messages:[],cancelled:[],audio:[]};
    const c={FP,PROPS,REC,CELL,scenes,ACADEMIC_CROWD_DREAD:T,ACADEMIC_SOCIETY_ACTORS,ACADEMIC_BOUNCER_ACTORS,
      ACADEMIC_ADVERSARY_SOCIAL_REPLIES,CONSERVATORY_ADVERSARY_FLAGS,academicBouncerSegmentClear,bouncerSocialAudible,
      academicCrowdDread:createAcademicCrowdDread(getSave().academicCrowdDread),academicCrowdDreadNotice:0,
      academicCrowdDreadResolution:null,academicCrowdDreadHudAt:-Infinity,
      academicAdversaries:createAcademicAdversaries(getSave().academicAdversaries),
      conservatoryAdversaries:freshConservatoryAdversaries(),academicAdversaryNoticeRemaining:0,
      academicAdversaryHudAt:-Infinity,academicAdversaryHudPhase:null,academicAdversaryCueFrames:0,
      academicAdversaryLastResolution:null,academicAdversaryPresentedCue:null,academicAdversaryWarned:false,
      academicAdversaryAftermath:null,academicAdversaryReactionDispatch:null,academicAdversaryAudio:null,
      academicSociety:createAcademicSociety(getSave().academicSociety),academicBouncerActors:()=>[],
      academicGhostDispatch:{cancel:()=>calls.cancelled.push('society')},
      academicPopulationDispatch:{cancel:()=>calls.cancelled.push('population')},
      academicBouncerDialogueLine:null,academicBouncerSocialScene:null,
      storyMode:true,inRogue:true,planName:'conservatory',RENDERER:'3d',IS_TAURI:true,usingPlan:()=>true,usingSpecialSpace:()=>false,
      px:FP.toRuntimeDistance(25),py:FP.toRuntimeDistance(248.1),paused:false,activeBattleId:null,
      now:1000,domFocused:true,nativeFocused:true,foreignSpeech:false,hushBusy:false,ready:true,heldReady:true,
      worldYaw:1.0824623757384937,localYaw:0,pitch:0,viewport:{cols:100,rows:40},
      document:{hidden:false,visibilityState:'visible',hasFocus:()=>c.domFocused},
      pointerMode:{status:()=>({nativeBackend:{focused:c.nativeFocused}})},
      R3:{r3dWorldYaw:()=>c.worldYaw,r3dLookAngles:()=>({yaw:c.localYaw,pitch:c.pitch}),
        r3dHeldNoteStatus:()=>({ready:c.heldReady})},
      academicCharacterStats:()=>({meshes:c.ready?['academic_population_unfinished_visitor']:[]}),
      SPEECH:{isSpeaking:()=>c.foreignSpeech,isVoicing:()=>c.foreignSpeech,
        sayAll:()=>null},PRES:{isActive:()=>c.hushBusy},performance:{now:()=>c.now},
      getSave,saveCommit,pushEvent:message=>calls.messages.push(message),
      mapHeading:()=>c.worldYaw,sightCrossesClosedDoor:()=>false,actx:null,sfxGain:null,
      createConservatoryAdversaryAudio:()=>{const a={disposed:0,play(event){calls.audio.push(event);},dispose(){this.disposed++;}};return a;},
      uiSize:()=>c.viewport,uiWrap,machinePanelBody,uiText:(...args)=>calls.paint.push(args),
      withMachinePanel:(x,y,w,h,options,paint)=>paint(machinePanelBody(x,y,w,h,options)),
    };
    vm.createContext(c);
    const names=['gameplayInputLifecycleActive','inAcademicSociety','academicSocietyListener','academicGhostSuspended',
      'academicBouncerPhysicalActor','academicBouncerSocialContext','academicBouncerSocialAudible',
      'academicCrowdDreadClaimsQuiet','academicAdversaryClaimsQuiet','tickAcademicCrowdDread','drawAcademicCrowdDreadCue',
      'academicAdversaryPresentationAvailable','academicAdversarySocialReply','dispatchAcademicAdversaryEvents',
      'tickAcademicAdversaries','drawAcademicAdversaryCue'];
    vm.runInContext(production('academicAdversaryCueLayout',renderer)+'\n'+production('renderAcademicAdversaryCue',renderer)+'\n'+names.map(n=>production(n)).join('\n'),c);
    const h={c,calls,scope,
      stand(x,y,{face=true}={}){c.px=FP.toRuntimeDistance(x);c.py=FP.toRuntimeDistance(y);if(face)this.faceTarget();},
      eye:()=>c.academicBouncerSocialContext()?.listener,
      target:()=>c.academicBouncerPhysicalActor({...T.at,floor:10}),
      faceTarget(){const eye=this.eye(),target=this.target();if(eye)c.worldYaw=Math.atan2(target.x-eye.x,-(target.z-eye.z));},
      paint(){return c.drawAcademicCrowdDreadCue();},
      step(dt=.1,{paint=true,held=false}={}){
        if(paint){if(!held||!c.drawAcademicAdversaryCue())c.drawAcademicCrowdDreadCue();}
        c.now+=dt*1000;if(held)c.tickAcademicAdversaries(dt);c.tickAcademicCrowdDread(dt);
      },
      run(seconds,options){for(let n=0;n<Math.ceil(seconds/.1);n++)this.step(.1,options);},
      until(phase,options){for(let n=0;n<160&&c.academicCrowdDread.view().phase!==phase;n++)this.step(.1,options);
        assert.equal(c.academicCrowdDread.view().phase,phase,`production reaches ${phase}`);},
      reload(){REC.loadRecState(getSave().rec||{});vm.runInContext(reloadSource,c);},
    };
    try{return await run(h);}finally{scenes.clear();Object.assign(REC.recState(),priorRec);}
  });
}

test('physical gaze is grounded in compiled floor and clear spans, not logical coordinates or local yaw',async()=>adapter(h=>{
  h.stand(25,248.1);assert.equal(FP.isSolid(h.c.px,h.c.py),false);
  assert.deepEqual(plain(h.eye()),{x:75,y:10,z:8.099999999999994});assert.deepEqual(plain(h.target()),{...T.at,floor:10,x:78.2,y:10,z:6.400000000000006});
  assert.equal(academicBouncerSegmentClear(FP,h.eye(),h.target(),{cellSize:CELL,
    anchor:{x:ACADEMIC_BOUNCER_ACTORS[0].x*2,y:ACADEMIC_BOUNCER_ACTORS[0].y*2}}),true);
  h.c.localYaw=-2;h.until('warning');assert.equal(REC.composure(),40,'physical world yaw, not renderer-local yaw, selects the real guest');
  assert.deepEqual(h.calls.cancelled,['society','population'],'only the newly noticed local encounter cancels old social deliveries');
}));

for(const condition of['away yaw','pitch','far','wall','lower floor','missing mesh','2d'])test(`production ${condition} cannot start the late guest warning`,async()=>adapter(h=>{
  if(condition==='away yaw')h.c.worldYaw+=.3;
  if(condition==='pitch')h.c.pitch=.28;
  if(condition==='far')h.stand(36,246.4);
  if(condition==='wall'){
    h.stand(21,246.4);assert.equal(FP.isSolid(h.c.px,h.c.py),false);
    assert.equal(h.eye().y,10);assert.ok(Math.hypot(h.eye().x-h.target().x,h.eye().z-h.target().z)<T.range);
    assert.equal(academicBouncerSegmentClear(FP,h.eye(),h.target(),{cellSize:CELL,
      anchor:{x:ACADEMIC_BOUNCER_ACTORS[0].x*2,y:ACADEMIC_BOUNCER_ACTORS[0].y*2}}),false,'an actual compiled wall blocks the gaze');
    FP.setAllDoorsOpen(true);assert.equal(academicBouncerSegmentClear(FP,h.eye(),h.target(),{cellSize:CELL,
      anchor:{x:ACADEMIC_BOUNCER_ACTORS[0].x*2,y:ACADEMIC_BOUNCER_ACTORS[0].y*2}}),false,'the blocker remains masonry even with every door open');FP.resetDoors();
  }
  if(condition==='lower floor')h.stand(53,54.2);
  if(condition==='missing mesh')h.c.ready=false;
  if(condition==='2d')h.c.RENDERER='2d';
  h.run(12);assert.notEqual(h.c.academicCrowdDread.view().phase,'warning');assert.equal(h.c.academicCrowdDread.view().outcome,null);
  assert.equal(REC.composure(),40);assert.equal(h.scope.writes.length,0);
}));

test('a glance and normal arrival are free; the complete warning waits for actual fitted paint',async()=>adapter(h=>{
  h.run(1.7,{paint:false});assert.equal(h.c.academicCrowdDread.view().phase,'watching');h.c.worldYaw+=1;h.step(.1,{paint:false});
  assert.equal(h.c.academicCrowdDread.view().phase,'idle');h.faceTarget();h.until('warning',{paint:false});
  for(let n=0;n<80;n++)h.step(.1,{paint:false});assert.equal(h.c.academicCrowdDread.view().elapsed,0);
  assert.equal(h.c.academicCrowdDreadHudAt,-Infinity);assert.equal(h.scope.writes.length,0);
  h.c.viewport={cols:20,rows:8};assert.equal(h.paint(),false);h.run(8);assert.equal(h.c.academicCrowdDread.view().elapsed,0);
  h.c.viewport={cols:100,rows:40};assert.equal(h.paint(),true);
  assert.ok(h.calls.paint.some(args=>String(args[2]).includes('TURN AWAY OR LEAVE')));
  h.run(4.4);assert.equal(h.c.academicCrowdDread.view().phase,'warning');assert.equal(REC.composure(),40);
  h.run(.2);assert.equal(h.c.academicCrowdDread.view().outcome,'marked');
}));

test('a failed or expired cue paint cannot spend hidden warning time',async()=>adapter(h=>{
  h.until('warning');h.paint();h.step();const elapsed=h.c.academicCrowdDread.view().elapsed;
  h.c.viewport={cols:20,rows:8};assert.equal(h.paint(),false);h.step(.1,{paint:false});
  assert.equal(h.c.academicCrowdDread.view().elapsed,0,'failed layout revokes the old paint receipt and rearms a complete warning immediately');
  h.c.viewport={cols:100,rows:40};h.paint();h.c.now+=300;h.step(.1,{paint:false});
  assert.equal(h.c.academicCrowdDread.view().elapsed,0,'expired paint cannot arm a warning');
}));

for(const starting of[40,22,20])test(`one atomic marked receipt saves the actual clamped three-point cost from ${starting}; reload is spent`,async()=>adapter(h=>{
  REC.setComposure(starting);const society=plain(h.c.academicSociety.save());h.until('warning');h.scope.writes.length=0;h.until('done');
  const expected=Math.max(REC.COMPOSURE_FLOOR,starting-3),r=h.c.academicCrowdDreadResolution;
  assert.deepEqual(plain(r),{outcome:'marked',before:starting,after:expected});assert.equal(REC.composure(),expected);
  assert.equal(h.scope.writes.length,1,'no cost-only intermediate save');
  const patch=h.scope.writes[0].patch;assert.equal(patch.academicCrowdDread.outcome,'marked');assert.equal(patch.rec.composure,expected);
  assert.equal(patch.academicSociety,undefined);assert.equal(patch.flags,undefined);assert.deepEqual(plain(h.c.academicSociety.save()),society);
  h.paint();assert.ok(h.calls.paint.some(args=>String(args[2]).includes(`COMPOSURE ${starting} → ${expected}`)),'the actual before/after cost is visible');
  assert.equal(h.c.academicCrowdDreadClaimsQuiet(),true);h.reload();assert.equal(h.c.academicCrowdDread.view().phase,'done');
  assert.equal(h.c.academicCrowdDreadNotice,0);assert.equal(h.c.academicCrowdDreadResolution,null);assert.equal(h.c.academicCrowdDreadHudAt,-Infinity);
  h.scope.writes.length=0;h.run(12);assert.equal(REC.composure(),expected);assert.equal(h.scope.writes.length,0);
}));

for(const response of['yaw','pitch','retreat'])test(`ordinary ${response} escapes for free after the warning is painted`,async()=>adapter(h=>{
  h.until('warning');h.paint();
  if(response==='yaw')h.c.worldYaw+=1;
  if(response==='pitch')h.c.pitch=.5;
  if(response==='retreat')h.stand(36,246.4);
  h.run(.5);assert.equal(h.c.academicCrowdDread.view().outcome,'escaped');assert.equal(REC.composure(),40);
  assert.equal(h.scope.writes.length,1);assert.equal(h.scope.writes[0].patch.rec.composure,40);
  h.paint();assert.ok(h.calls.paint.some(args=>String(args[2]).includes('COMPOSURE 40 → 40')));
}));

for(const reason of['pause','hidden','native blur','input scene','world scene','foreign speech','HUSH','voice loan','recording','battle','not ready'])test(`production ${reason} freezes and rearms a full warning without altering consent`,async()=>adapter(h=>{
  h.until('warning');h.run(2);const before=h.c.academicCrowdDread.view().elapsed;assert.ok(before>1);
  if(reason==='pause')h.c.paused=true;
  if(reason==='hidden')h.c.document.hidden=true;
  if(reason==='native blur')h.c.nativeFocused=false;
  if(reason==='input scene')scenes.push({id:'input-owner',blocksInput:true});
  if(reason==='world scene')scenes.push({id:'world-owner',blocksWorld:true});
  if(reason==='foreign speech')h.c.foreignSpeech=true;
  if(reason==='HUSH')h.c.hushBusy=true;
  if(reason==='voice loan')h.c.academicSociety.load({consent:'lent',loanRemaining:17,loanElapsed:3});
  if(reason==='recording')REC.recState().phase='recording';
  if(reason==='battle')h.c.activeBattleId='owned-battle';
  if(reason==='not ready')h.c.ready=false;
  const society=plain(h.c.academicSociety.save());h.run(9);assert.equal(h.c.academicCrowdDread.view().elapsed,before);
  assert.equal(h.c.academicCrowdDread.view().outcome,null);assert.equal(REC.composure(),40);assert.equal(h.scope.writes.length,0);
  assert.deepEqual(plain(h.c.academicSociety.save()),society);
  h.c.paused=false;h.c.document.hidden=false;h.c.nativeFocused=true;scenes.clear();h.c.foreignSpeech=false;h.c.hushBusy=false;
  h.c.academicSociety.load({consent:'unasked'});REC.recState().phase='idle';h.c.activeBattleId=null;h.c.ready=true;
  h.step();assert.equal(h.c.academicCrowdDread.view().phase,'warning');assert.ok(h.c.academicCrowdDread.view().elapsed<=.1);
  h.run(4.2);assert.equal(h.c.academicCrowdDread.view().outcome,null,'interruption cannot preserve almost-complete warning time');
}));

test('confirmed native focus wins over stale DOM blur; missing native focus falls back to DOM',async()=>adapter(h=>{
  h.c.domFocused=false;h.until('warning');assert.equal(h.c.gameplayInputLifecycleActive(),true);
  h.run(.5);assert.ok(h.c.academicCrowdDread.view().elapsed>0);
  h.c.nativeFocused=null;const elapsed=h.c.academicCrowdDread.view().elapsed;h.run(2);
  assert.equal(h.c.academicCrowdDread.view().elapsed,elapsed);assert.equal(h.c.gameplayInputLifecycleActive(),false);
}));

test('crowd and Held Note share quiet without circularly blocking the real Held lifecycle',async()=>adapter(h=>{
  h.until('warning');assert.equal(h.c.academicAdversaryClaimsQuiet(),true);assert.equal(h.c.academicAdversaries.view().phase,'dormant');
  h.stand(9,247.5);h.run(.1,{held:true});assert.equal(h.c.academicAdversaries.view().phase,'reveal','crowd quiet must not prevent the actual Held owner starting');
  const before=h.c.academicCrowdDread.view().elapsed;h.run(1,{held:true});assert.equal(h.c.academicCrowdDread.view().elapsed,before);
  for(let n=0;n<120&&h.c.academicAdversaries.view().phase!=='warning';n++)h.step(.1,{held:true});
  assert.equal(h.c.academicAdversaries.view().phase,'warning');assert.equal(h.c.academicCrowdDread.view().outcome,null);assert.equal(REC.composure(),40);
  h.stand(25,248.1);h.run(.3,{held:true});assert.equal(h.c.academicAdversaries.view().phase,'dormant');
  assert.equal(h.c.academicCrowdDread.view().phase,'warning');assert.ok(h.c.academicCrowdDread.view().elapsed<=.3,'crowd resumes its own complete warning');
},{heldFresh:true}));

test('notice freezes with focus/modal ownership, expires in active time and cannot hold another floor quiet',async()=>adapter(h=>{
  h.until('warning');h.c.worldYaw+=1;h.run(.5);const before=h.c.academicCrowdDreadNotice;assert.ok(before>3.9);
  h.c.nativeFocused=false;h.run(5);assert.equal(h.c.academicCrowdDreadNotice,before);assert.equal(h.paint(),false);
  h.c.nativeFocused=true;scenes.push({id:'notice-overlay',blocksWorld:true,blocksInput:true});h.run(5);assert.equal(h.c.academicCrowdDreadNotice,before);
  scenes.clear();h.c.foreignSpeech=true;h.run(5);assert.equal(h.c.academicCrowdDreadNotice,before);h.c.foreignSpeech=false;
  h.step(5);assert.ok(Math.abs(h.c.academicCrowdDreadNotice-(before-.1))<1e-8,'long frame is clamped');
  h.stand(53,54.2);h.step();assert.equal(h.c.academicCrowdDreadNotice,0);assert.equal(h.c.academicAdversaryClaimsQuiet(),false);
}));
