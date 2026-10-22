import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createAcademicAdversaries} from '../src/game/academic-adversaries.js';
import {ACADEMIC_ADVERSARY_TIMING as T,ACADEMIC_ADVERSARY_SOCIAL_REPLIES,ACADEMIC_HELD_GEOMETRY} from '../src/data/academic-adversaries.js';
import {academicAdversaryParts} from '../src/render/academic-adversaries.js';
import {adversaryWorldMatrix,costumeExchangeParts} from '../src/render/conservatory-adversary-performance.js';
import {freshConservatoryAdversaries,stepConservatoryAdversaries,CONSERVATORY_ADVERSARY_FLAGS} from '../src/game/conservatory-adversaries.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {academicBouncerSocialAudible as bouncerSocialAudible,academicBouncerSegmentClear} from '../src/game/academic-bouncer-audibility.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';
import {flagGet,flagSet} from '../src/game/flags.js';
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
  const a=source.indexOf(`function ${name}(`);assert.ok(a>=0,`${name}: production function exists`);
  const next=source.slice(a+1).search(/\n(?:export )?function /);
  return source.slice(a,next<0?source.length:a+1+next).trim();
}
function island(start,end){const a=main.indexOf(start),b=main.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'production staging boundary');return main.slice(a,b);}
const stage=island("  if(group==='basement'||group==='academic'){",'  // Recording hallucinations borrow');
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});

// Production core, save normalization, recordist, scene ownership, physical
// audibility, presentation layout and main adapters run together. Only audio
// device/paint operations are recorded, rather than claiming native pixels.
async function adapter(run,{saved,demonstrated=true}={}){
  const initial=saved||{...freshSave(),academicAdversaries:{version:1,outcome:null,demonstrated},rec:{composure:40}};
  const priorRec=structuredClone(REC.recState());
  return withTransientGameState({save:initial},async scope=>{
    scenes.clear();PROPS.propsInit(FP);PROPS.loadPropState({});REC.recState().phase='idle';REC.loadRecState(getSave().rec||{});
    const calls={audio:[],paint:[],lines:[],messages:[],sight:[]},leases=[];let activeSpeech=null;
    const c={FP,PROPS,REC,CELL,scenes,ACADEMIC_SOCIETY_ACTORS,ACADEMIC_BOUNCER_ACTORS,ACADEMIC_ADVERSARY_SOCIAL_REPLIES,
      bouncerSocialAudible,academicBouncerSegmentClear,academicAdversaryParts,adversaryWorldMatrix,costumeExchangeParts,
      createAcademicAdversaries,freshConservatoryAdversaries,stepConservatoryAdversaries,CONSERVATORY_ADVERSARY_FLAGS,
      academicAdversaries:createAcademicAdversaries(getSave().academicAdversaries),conservatoryAdversaries:freshConservatoryAdversaries(),
      academicSociety:createAcademicSociety(getSave().academicSociety),academicBouncerActors:()=>[],
      academicAdversaryAudio:null,conservatoryAdversaryAudio:null,academicAdversaryReactionDispatch:null,
      academicAdversaryHudAt:-Infinity,academicAdversaryHudPhase:null,academicAdversaryCueFrames:0,
      academicAdversaryLastResolution:null,academicAdversaryWarned:false,academicAdversaryAftermath:null,
      academicAdversaryNoticeRemaining:0,academicAdversaryPresentedCue:null,
      storyMode:true,inRogue:true,planName:'conservatory',RENDERER:'3d',IS_TAURI:true,paused:false,activeBattleId:null,
      usingPlan:()=>true,usingSpecialSpace:()=>false,px:18,py:503,domFocused:true,nativeFocused:true,ready:true,now:1000,
      document:{hidden:false,visibilityState:'visible',hasFocus:()=>c.domFocused},
      pointerMode:{status:()=>({nativeBackend:{focused:c.nativeFocused}})},
      R3:{r3dHeldNoteStatus:()=>({ready:c.ready}),r3dFacing:()=>0,r3dWorldYaw:()=>0,r3dLookAngles:()=>({yaw:0,pitch:0})},
      performance:{now:()=>c.now},PRES:{isActive:()=>c.hushBusy},hushBusy:false,shakeMode:()=>'full',mapHeading:()=>0,
      getSave,saveCommit,flagGet,flagSet,basementWatcher:{roomId:null,resolved:false},costumeInspectionScene:null,
      pushEvent:message=>calls.messages.push(message),sightCrossesClosedDoor:(...args)=>{calls.sight.push(args);return false;},
      actx:{currentTime:0,createStereoPanner:()=>({pan:{setTargetAtTime(){}},connect(){},disconnect(){}}),
        createGain:()=>({gain:{setTargetAtTime(){}},connect(){},disconnect(){}})},sfxGain:{id:'world-sfx'},dialogGain:{id:'dialog'},master:null,
      academicBouncerDialogueLine:null,academicSocietyDialogueLine:null,academicBouncerSocialScene:null,academicSocietyDialogueScene:null,
      academicSocietyPresentation:{view:()=>({timeSec:0})},academicGhostPanner:null,academicGhostGain:null,
      academicGhostAudioContext:null,academicGhostAudioBus:null,academicGhostAudioFrame:{},
      SPEECH:{isSpeaking:()=>!!activeSpeech,isVoicing:()=>!!activeSpeech,speaking:()=>activeSpeech?.lines[0]||null,
        sayAll(lines,options){const lease={lines,options,cancelled:false,cancel(){this.cancelled=true;if(activeSpeech===this)activeSpeech=null;}};
          calls.lines.push(...lines);leases.push(lease);activeSpeech=lease;return lease;}},
      createConservatoryAdversaryAudio:()=>{const audio={events:[],disposed:0,play(event,options){this.events.push({event,options});},dispose(){this.disposed++;}};calls.audio.push(audio);return audio;},
      uiSize:()=>c.viewport,viewport:{cols:100,rows:40},uiWrap,machinePanelBody,
      uiText:(...args)=>calls.paint.push(args),withMachinePanel:(x,y,w,h,options,paint)=>paint(machinePanelBody(x,y,w,h,options)),
      group:'academic',doorDynamicCombined:[],count:0,
    };
    vm.createContext(c);
    const names=['gameplayInputLifecycleActive','inAcademicSociety','academicSocietyListener','academicGhostSuspended',
      'academicBouncerPhysicalActor','academicBouncerSocialContext','academicBouncerSocialAudible',
      'academicSocietyActors','updateAcademicGhostAudio','academicGhostSpeechDestination','conservatoryAdversaryPoint',
      'loadConservatoryAdversaries','academicAdversaryClaimsQuiet','academicAdversaryPresentationAvailable',
      'academicAdversarySocialReply','dispatchAcademicAdversaryEvents','tickAcademicAdversaries','drawAcademicAdversaryCue','advanceConservatoryAdversaries'];
    vm.runInContext(production('academicAdversaryCueLayout',renderer)+'\n'+production('renderAcademicAdversaryCue',renderer)+'\n'+names.map(name=>production(name)).join('\n')+
      '\nfunction productionStage(){count=0;doorDynamicCombined=[];'+stage+'return doorDynamicCombined;}',c);
    const h={c,calls,leases,scope,stand(x,y){c.px=FP.toRuntimeDistance(x);c.py=FP.toRuntimeDistance(y);},
      finishVoice(){activeSpeech?.cancel();},foreignVoice(){const lease={lines:[{text:'An unrelated line',actorId:'foreign'}],cancel(){if(activeSpeech===lease)activeSpeech=null;}};activeSpeech=lease;},
      paint:()=>c.drawAcademicAdversaryCue(),step(dt=.1,{paint=true,finishVoice=true}={}){if(paint)c.drawAcademicAdversaryCue();c.now+=dt*1000;c.tickAcademicAdversaries(dt);if(finishVoice)activeSpeech?.cancel?.();},
      until(phase){for(let n=0;n<500&&c.academicAdversaries.view().phase!==phase;n++)this.step();assert.equal(c.academicAdversaries.view().phase,phase,`production adapter reaches ${phase}`);},
      reload(){REC.loadRecState(getSave().rec||{});c.loadConservatoryAdversaries();},};
    try{return await run(h);}finally{scenes.clear();Object.assign(REC.recState(),priorRec);}
  });
}

// This catches the original missing renderer return instead of replacing the
// presentation-available predicate with a test-only true boolean.
test('actual cue renderer returns its painted layout and main records only a fitted phase receipt',async()=>adapter(h=>{
  h.stand(9,247.5);h.step();assert.equal(h.c.academicAdversaries.view().phase,'reveal');
  const layout=h.c.renderAcademicAdversaryCue(h.c.academicAdversaries.view());assert.equal(layout.fits,true);
  assert.equal(h.paint(),true);assert.equal(h.c.academicAdversaryHudPhase,'reveal');assert.ok(h.c.academicAdversaryCueFrames>0);
  h.c.viewport={cols:20,rows:8};assert.equal(h.paint(),false);assert.equal(h.c.academicAdversaryHudPhase,null);
},{demonstrated:false}));

test('production paint receipt arms the full warning and cannot spend unpainted phase time',async()=>adapter(h=>{
  // The dormant state has no cue, so use the fresh harmless reveal to acquire
  // presentation; no warning clock or encounter phase is assigned by tests.
  h.stand(9,247.5);h.until('warning');
  assert.equal(h.c.academicAdversaryHudPhase,'demonstration');
  const before=h.c.academicAdversaries.view().elapsed;h.step(.1,{paint:false});
  assert.equal(h.c.academicAdversaries.view().elapsed,before,'new warning is never advanced against the old demonstration HUD');
  assert.equal(h.paint(),true);assert.equal(h.c.academicAdversaryHudPhase,'warning');assert.ok(h.calls.paint.length>0);
  for(let n=0;n<31;n++)h.step();assert.equal(h.c.academicAdversaries.view().phase,'warning');
  h.step();assert.equal(h.c.academicAdversaries.view().phase,'strike');
  const start=h.c.academicAdversaries.view().elapsed;h.step(.1,{paint:false});assert.equal(h.c.academicAdversaries.view().elapsed,start,'strike waits for its own paint');
  assert.equal(REC.composure(),40);
},{demonstrated:false}));

test('authoritative native focus overrides lagging DOM focus but hidden always holds encounter time',async()=>adapter(h=>{
  h.stand(9,247.5);h.c.domFocused=false;h.until('warning');assert.equal(h.c.gameplayInputLifecycleActive(),true);
  h.paint();h.step();const elapsed=h.c.academicAdversaries.view().elapsed;assert.ok(elapsed>0);
  h.c.nativeFocused=false;h.c.domFocused=true;h.step();assert.equal(h.c.academicAdversaries.view().phase,'suspended');
  assert.equal(h.c.gameplayInputLifecycleActive(),false);assert.equal(REC.composure(),40);
  h.c.nativeFocused=true;h.c.document.hidden=true;h.c.document.visibilityState='hidden';h.step();
  assert.equal(h.c.academicAdversaries.view().phase,'suspended');assert.equal(h.c.gameplayInputLifecycleActive(),false);
},{demonstrated:false}));

for(const reason of['pause','hidden','native blur','input scene','world scene','foreign speech','HUSH','borrowed voice'])test(`production ${reason} revokes the strike and stops only its owned cue`,async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.stand(9,251.5);h.until('strike');h.paint();
  const own=h.c.academicAdversaryAudio,other={disposed:0,dispose(){this.disposed++;}};h.c.conservatoryAdversaryAudio=other;
  if(reason==='pause')h.c.paused=true;
  if(reason==='hidden')h.c.document.hidden=true;
  if(reason==='native blur')h.c.nativeFocused=false;
  if(reason==='input scene')scenes.push({id:'test-input-owner',blocksInput:true});
  if(reason==='world scene')scenes.push({id:'test-world-owner',blocksWorld:true});
  if(reason==='foreign speech')h.foreignVoice();
  if(reason==='HUSH')h.c.hushBusy=true;
  if(reason==='borrowed voice')h.c.academicSociety.load({consent:'lent',loanRemaining:17,loanElapsed:3});
  const society=plain(h.c.academicSociety.save());h.stand(9,247.5);h.step(.1,{finishVoice:false});
  assert.equal(h.c.academicAdversaries.view().phase,'suspended');assert.equal(h.c.academicAdversaries.frame().threatActive,false);
  assert.ok(own.disposed>=1);assert.equal(other.disposed,0);assert.equal(REC.composure(),40);
  assert.deepEqual(plain(h.c.academicSociety.save()),society,'threat cannot grant, withdraw or advance the existing voice loan');
},{demonstrated:false}));

test('missing actual HeldNote readiness fails closed, and restored readiness restarts a full warning',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.step();h.c.ready=false;h.step();
  assert.equal(h.c.academicAdversaries.view().phase,'suspended');assert.equal(REC.composure(),40);
  for(let n=0;n<50;n++)h.step();assert.equal(h.c.academicAdversaries.view().phase,'suspended');
  h.c.ready=true;h.step();assert.equal(h.c.academicAdversaries.view().phase,'warning');assert.equal(h.c.academicAdversaries.view().elapsed,0);
  assert.equal(h.c.academicAdversaries.view().warningComplete,false);
},{demonstrated:false}));

test('an absent or expired fitted HUD never advances contact behind another presentation',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.paint();h.step();
  h.c.viewport={cols:20,rows:8};assert.equal(h.paint(),false);assert.equal(h.c.academicAdversaryHudPhase,null);h.step(.1,{paint:false});
  assert.equal(h.c.academicAdversaries.view().phase,'suspended');assert.equal(REC.composure(),40);
  h.c.viewport={cols:100,rows:40};h.step();h.paint();h.c.now+=300;h.step(.1,{paint:false});
  assert.equal(h.c.academicAdversaries.view().elapsed,0,'new warning without current paint spends no time');
},{demonstrated:false}));

for(const starting of[40,22,20])test(`actual contact commits one matching receipt, held flag and clamped composure${starting} atomically; reload cannot charge twice`,async()=>adapter(h=>{
  REC.setComposure(starting);h.stand(9,247.5);h.until('warning');
  const bounds=ACADEMIC_HELD_GEOMETRY.damageBounds;h.stand((bounds.x0+bounds.x1)/2,(bounds.y0+bounds.y1)/2);
  h.until('strike');h.paint();h.scope.writes.length=0;
  h.until('withdraw');const resolution=h.c.academicAdversaryLastResolution,expected=Math.max(REC.COMPOSURE_FLOOR,starting-5);
  assert.equal(resolution.outcome,'struck');assert.equal(resolution.before,starting);assert.equal(resolution.after,expected);
  assert.equal(REC.composure(),expected);assert.equal(h.scope.writes.length,1,'no flag-only or cost-only intermediate save may escape');
  const patch=h.scope.writes[0].patch;assert.equal(patch.academicAdversaries.outcome,'struck');assert.equal(patch.rec.composure,expected);
  assert.equal(patch.flags[CONSERVATORY_ADVERSARY_FLAGS.held],true);assert.equal(patch.academicSociety,undefined);
  const terminal=plain(getSave());h.reload();assert.equal(h.c.academicAdversaries.view().phase,'done');
  for(let n=0;n<50;n++)h.step();assert.equal(REC.composure(),expected);assert.deepEqual(plain(getSave().academicAdversaries),terminal.academicAdversaries);
  assert.equal(h.c.academicAdversaryLastResolution,null,'load cannot replay a resolution');
},{demonstrated:false}));

test('ordinary clear-rest crossing saves clean outcome without charging composure or rewriting consent',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.stand(9,251.5);h.until('rest');h.stand(9,249);h.step();h.scope.writes.length=0;
  h.stand(9,247.5);h.step();assert.equal(h.c.academicAdversaries.view().outcome,'clean');assert.equal(REC.composure(),40);
  assert.equal(h.scope.writes.length,1);assert.equal(h.scope.writes[0].patch.academicAdversaries.outcome,'clean');
  assert.equal(h.scope.writes[0].patch.rec.composure,40);assert.equal(h.scope.writes[0].patch.flags[CONSERVATORY_ADVERSARY_FLAGS.held],true);
},{demonstrated:false}));

test('the real struck notice visibly reports clamped before-to-after cost independently of optional cue captions',async()=>adapter(h=>{
  REC.setComposure(22);getSave().settings.hushCueCaptions=false;h.stand(9,247.5);h.until('warning');
  const b=ACADEMIC_HELD_GEOMETRY.damageBounds;h.stand((b.x0+b.x1)/2,(b.y0+b.y1)/2);h.until('withdraw');
  assert.equal(h.c.academicAdversaries.view().cue,null,'the core withdraw has no cue; main must supply this outcome');
  assert.equal(h.paint(),true);const cue=h.c.academicAdversaryPresentedCue;
  assert.equal(cue.instruction,'COMPOSURE 22 → 20');assert.equal(cue.state,'ONE CONTACT');assert.match(cue.text,/catches you once/);
  assert.ok(h.calls.paint.some(args=>String(args[2]).includes('COMPOSURE 22 → 20')),'cost is painted rather than only pushed to the eventfeed');
  assert.equal(h.c.academicAdversaryClaimsQuiet(),true);assert.ok(h.c.academicAdversaryNoticeRemaining>4);
  assert.equal(h.c.academicAdversaryLastResolution.actualCost,2);assert.equal(getSave().rec.composure,20);
},{demonstrated:false}));

test('clean notice keeps its own visible outcome and delays the resident aftermath until the full active notice finishes',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.stand(9,251.5);h.until('rest');h.stand(9,249);h.step();h.stand(9,247.5);h.step();
  assert.equal(h.paint(),true);assert.equal(h.c.academicAdversaryPresentedCue.instruction,'COMPOSURE 40 → 40');
  assert.equal(h.c.academicAdversaryPresentedCue.state,'PASSED IN THE GAP');assert.match(h.c.academicAdversaryPresentedCue.text,/pass in the silence/);
  const aftermath=ACADEMIC_ADVERSARY_SOCIAL_REPLIES.clean.text;
  h.until('done');assert.ok(h.c.academicAdversaryNoticeRemaining>0);assert.equal(h.calls.lines.filter(line=>line.text===aftermath).length,0);
  for(let n=0;n<50&&h.c.academicAdversaryNoticeRemaining>0;n++)h.step();
  assert.equal(h.c.academicAdversaryNoticeRemaining,0);assert.equal(h.calls.lines.filter(line=>line.text===aftermath).length,1);
  assert.equal(h.c.academicAdversaryClaimsQuiet(),false);for(let n=0;n<5;n++)h.step();
  assert.equal(h.calls.lines.filter(line=>line.text===aftermath).length,1,'notice completion cannot replay its local aftermath');
},{demonstrated:false}));

test('outcome notice freezes on pause, focus loss, foreign speech and scene ownership; leaving or reloading clears it',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.stand(9,251.5);h.until('rest');h.stand(9,249);h.step();h.stand(9,247.5);h.step();h.paint();
  const remaining=h.c.academicAdversaryNoticeRemaining;
  h.c.paused=true;for(let n=0;n<10;n++)h.step();assert.equal(h.c.academicAdversaryNoticeRemaining,remaining);assert.equal(h.paint(),false);
  h.c.paused=false;h.c.nativeFocused=false;for(let n=0;n<10;n++)h.step();assert.equal(h.c.academicAdversaryNoticeRemaining,remaining);
  h.c.nativeFocused=true;scenes.push({id:'notice-cover',blocksInput:true,blocksWorld:true});for(let n=0;n<10;n++)h.step();
  assert.equal(h.c.academicAdversaryNoticeRemaining,remaining);scenes.pop();h.foreignVoice();
  for(let n=0;n<10;n++)h.step(.1,{finishVoice:false});assert.equal(h.c.academicAdversaryNoticeRemaining,remaining);h.finishVoice();
  h.step(5);assert.ok(Math.abs(h.c.academicAdversaryNoticeRemaining-(remaining-.1))<1e-9,'a stalled frame spends at most one .1s active tick');
  h.stand(3,18);h.step();assert.equal(h.c.academicAdversaryNoticeRemaining,0);assert.equal(h.c.academicAdversaryAftermath,null);assert.equal(h.c.academicAdversaryClaimsQuiet(),false);
  h.reload();assert.equal(h.c.academicAdversaryPresentedCue,null);assert.equal(h.c.academicAdversaryNoticeRemaining,0);assert.equal(h.c.academicAdversaryLastResolution,null);
},{demonstrated:false}));

test('legacy spent saves migrate harmlessly while an explicit unresolved current receipt remains eligible',async()=>{
  await adapter(h=>{h.c.loadConservatoryAdversaries();assert.equal(h.c.academicAdversaries.view().outcome,'legacy-spent');
    assert.equal(h.c.academicAdversaries.view().phase,'done');h.stand(9,247.5);for(let n=0;n<50;n++)h.step();assert.equal(REC.composure(),40);assert.equal(h.calls.audio.length,0);
  },{saved:{...freshSave(),flags:{[CONSERVATORY_ADVERSARY_FLAGS.held]:true},rec:{composure:40}}});
  await adapter(h=>{h.c.loadConservatoryAdversaries();assert.equal(h.c.academicAdversaries.view().outcome,null);h.stand(9,247.5);h.until('warning');},
    {saved:{...freshSave(),flags:{[CONSERVATORY_ADVERSARY_FLAGS.held]:true},academicAdversaries:{version:1,outcome:null,demonstrated:false},rec:{composure:40}}});
});

test('new main always skips the legacy academic Held controller without suppressing the existing basement owner',async()=>adapter(h=>{
  const before=plain(h.c.conservatoryAdversaries.held);h.stand(9,247.5);
  for(let n=0;n<150;n++)h.c.advanceConservatoryAdversaries(.1);
  assert.deepEqual(plain(h.c.conservatoryAdversaries.held),before);assert.equal(h.calls.audio.length,0);
  h.stand(3,18);h.c.advanceConservatoryAdversaries(.1);assert.notEqual(h.c.conservatoryAdversaries.costume.phase,'dormant');
}));

test('warning and outcome replies use the real local speaker, society mouth and physical dialog bus; distant listeners receive none',async()=>adapter(h=>{
  h.stand(9,247.5);
  for(const kind of['warning','clean','struck']){
    h.finishVoice();assert.equal(h.c.academicAdversarySocialReply(kind),true);const line=h.calls.lines.at(-1),actor=ACADEMIC_SOCIETY_ACTORS.find(a=>a.id===ACADEMIC_ADVERSARY_SOCIAL_REPLIES[kind].actorId);
    assert.equal(line.actorId,actor.id);assert.equal(line.propId,`academic-person-${actor.id}`);assert.equal(line.voiceSpeaker,actor.voiceSpeaker);assert.equal(line.text,ACADEMIC_ADVERSARY_SOCIAL_REPLIES[kind].text);
    assert.equal(line.academicSociety,true);assert.equal(h.leases.at(-1).options.replace,false);assert.equal(h.leases.at(-1).options.valid(),true);
    const frames=h.c.academicSocietyActors();assert.equal(frames.find(a=>a.id===actor.id).speaking,true);
    assert.ok(h.c.academicGhostSpeechDestination());assert.equal(h.c.academicGhostAudioFrame.propId,line.propId);assert.equal(h.c.academicGhostAudioFrame.active,true);
    h.stand(14.5,274.5);assert.equal(h.leases.at(-1).options.valid(),false);h.finishVoice();assert.equal(h.c.academicAdversarySocialReply(kind),false);h.stand(9,247.5);
  }
}));

test('actual dynamic-part wrapper preserves continuous authored anchor, actor marker, skin and threat provenance',async()=>adapter(h=>{
  h.stand(9,247.5);h.until('warning');h.until('strike');h.paint();h.stand(11.5,248.5);h.step();h.step();
  const parts=academicAdversaryParts(h.c.academicAdversaries.frame()),staged=h.c.productionStage();assert.equal(staged.length,4);
  for(const part of parts){const body=staged.find(p=>p.id===part.id),point=h.c.conservatoryAdversaryPoint(part),at=FP.logicalToPhysical(point.x,point.y);
    assert.equal(body.mesh,part.mesh);assert.equal(body.academicAdversaryActor,'held-note');assert.equal(body.threatActive,part.threatActive);
    assert.equal(body.structural,false);assert.deepEqual(plain(body.character),plain(part.character));assert.deepEqual([...body.matrix],[...adversaryWorldMatrix(at.x*CELL,at.y+part.height,at.z*CELL,part.yaw,part.pitch,part.scale||1)]);
  }
  const frame=h.c.academicAdversaries.frame(),point=h.c.conservatoryAdversaryPoint({at:ACADEMIC_HELD_GEOMETRY.at,anchorAt:ACADEMIC_HELD_GEOMETRY.anchorAt});
  const anchor=FP.toRuntimePoint(ACADEMIC_HELD_GEOMETRY.anchorAt);
  assert.ok(Math.abs(point.x-(anchor.x+(ACADEMIC_HELD_GEOMETRY.at.x-ACADEMIC_HELD_GEOMETRY.anchorAt.x)*FP.toRuntimeDistance(1)))<1e-10);
  assert.equal(frame.visible,true);assert.equal(scenes.depth(),0,'cue owns no scene or input lease');
},{demonstrated:false}));
