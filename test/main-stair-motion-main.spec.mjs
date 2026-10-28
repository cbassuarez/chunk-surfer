import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  createMainStairMotionStep,sampleMainStairMotion,mainStairContactCrossed,
} from '../src/render/main-stair-motion.js';
import {InputManager,keyboardMotionAxes} from '../src/input/input-manager.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {academicBouncerAccessForMove} from '../src/game/academic-bouncer-access.js';
import {slideBlockedPropStep} from '../src/world/prop-body-contact.js';
import * as STAIR_AUDIT from '../tools/chunk_surfer/main-stair-audit.mjs';

// Execute the production adapters with a two-tread floorplan, rather than
// copying their logic or paying for the complete conservatory compiler.
const main=fs.readFileSync(process.env.CS_STAIR_MAIN_SOURCE||new URL('../src/main.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=(typeof e==='number'?e:1e-8),`${a} differs from ${b}${typeof e==='string'?`: ${e}`:''}`);
const cameraPointLine=renderer.match(/^\s*const nextCamX=authoredCamera[^\n]+/m)?.[0];
assert.ok(cameraPointLine,'production final camera-centre expression is missing');
const finalCameraPoint=new Function('state',`const authoredCamera=null,CELL=.5;${cameraPointLine}return{x:nextCamX*CELL,z:nextCamZ*CELL};`);
function mainFunction(name) {
  const start=main.indexOf(`function ${name}(`);
  assert.ok(start>=0,`production function ${name} is missing`);
  const end=main.indexOf('\nfunction ',start+10);
  return main.slice(start,end<0?main.length:end);
}

function harness({kind='main',quiet=1}={}) {
  let now=1000;
  const model={kind,quiet,active:true,blocksWorld:false,blocksInput:false,worldView:null};
  const events=[];
  const physical=(x,y)=>({
    x:126+Math.sin(x*.2)*3.8,z:72-Math.cos(x*.2)*3.8,
    flightId:kind==='ordinary'?0:1,y:4.8+x*.17,
  });
  const FP={
    logicalToPhysical:physical,
    floorAt:(x)=>4.8+x*.17,
    arcYawOffset:(x)=>.4+x*.2,
    floorplan:()=>({stairRuns:[{owner:kind==='unrelated'?'tower-stair':'main-open-well',analyticHelix:true,cx:126,cz:72}]}),
    renderedFloorAt:()=>999,
  };
  const context=vm.createContext({
    createMainStairMotionStep,sampleMainStairMotion,mainStairContactCrossed,
    CELL:.5,MOVE_MS:45,px:0,py:0,renderMove:null,motionRig:null,
    paused:false,document:{hidden:false},planName:'conservatory',FP,
    usingPlan:()=>kind!=='source',usingSpecialSpace:()=>kind==='source',usingSourceSpace:()=>kind==='source',
    activeGeometry:()=>({logicalToPhysical:physical,floorAt:()=>7,renderedFloorAt:()=>7}),
    performance:{now:()=>now},currentMoveIntervalMs:()=>45*quiet,
    D:(n)=>n*2,movementIntentActive:()=>false,
    gameplayInputLifecycleActive:()=>model.active,
    scenes:{blocksInput:()=>model.blocksInput,blocksWorld:()=>model.blocksWorld,worldView:()=>model.worldView},
    RT:{footstep:(level,options)=>events.push({level,...options})},
    REC:{setSlow:()=>{}},motionInput:{held:new Set(['KeyW']),reset(){this.held.clear();}},
    keysDown:new Set(['KeyW']),nextMoveAtMs:2000,nextTurnAtMs:2000,
    motionFocusSuspended:false,motionResetReason:'test',lastLoopMs:123,
    setupHandoffBlocksMovement:()=>false,
    chunkSurfRuntime:{lastReceptionFrame:()=>({}),traversalFrame:()=>({})},
    sourceShoreOutside:()=>false,
    sourceDoorArrival:null,
    holdUnavailableGameplayInput:()=>false,inCover:()=>false,
    arrowDelta:()=>[context.keysDown.has('KeyW')?1:0,0],
    maybeLockHushFromInputDelta:()=>{},
    accepted:0,RENDERER:'3d',
    R3:{r3dLookAngles:()=>({yaw:.3,pitch:.1}),r3dSetLookAngles:(v)=>{context.lastLook=v;},
      r3dShiftLookFrame:(turn)=>{context.lastFrameTurn=turn;}},
    approach:{camera:{eyeDropM:0}},outskirtsBody:null,outskirtsStride:0,
    viewX:1,viewY:0,floorHere:()=>12,
  });
  for(const name of ['physicalPointFor','motionTargetPoint','snapMotionRig','ensureMotionRig',
    'renderedPlayerPoint','mainStairRenderPose','mainStairMoveTouches','advanceMainStairRenderMove',
    'beginRenderStep','currentStepIntervalMs','planYawOffset','resetMotionInput','recoverMotionFocus',
    'armHeldMovement','tickHeldMovement']) vm.runInContext(mainFunction(name),context);

  // The actual step prefix contains the collision-ahead guard; finish with a
  // small valid commit so repeated key presses exercise that guard unchanged.
  const stepSource=mainFunction('step');
  const prefix=stepSource.slice(stepSource.indexOf('{')+1,stepSource.indexOf('// You can always run.'));
  assert.match(prefix,/renderMove\?\.mainStair/,'the production step gate disappeared');
  vm.runInContext(`function step(dx,dy){${prefix}
    accepted++;beginRenderStep(px+dx,py+dy,performance.now(),{footfall:{level:.12,muffle:.5}});
    px+=dx;py+=dy;
  }`,context);

  const floorLine=main.match(/^\s*floorH: worldView\?\.floorH\?\?\([^\n]+/m)?.[0]?.trim();
  const resolvedLine=main.match(/^\s*resolvedStairFloor:[^\n]+/m)?.[0]?.trim();
  assert.ok(floorLine&&resolvedLine,'production frame floor fields are missing');
  vm.runInContext(`function frameFloor(rendered,worldView=null){return{${floorLine}${resolvedLine}};}`,context);

  const goalLine=renderer.match(/^\s*const floorGoal =[^\n]+/m)?.[0];
  const heightLine=renderer.match(/^\s*camY = authoredCamera[^\n]+/m)?.[0];
  assert.ok(goalLine&&heightLine,'production renderer eye-height expression is missing');
  vm.runInContext(`function cameraHeight(state,{initial=0,dt=1/60,authoredCamera=null,snapCamera=false,driveFrameActive=false}={}){
    const EYE_METERS=1.62,CELL=.5;let camY=initial;
    ${goalLine}${heightLine}return camY;
  }`,context);
  const planTargetLine=renderer.match(/^\s*planYawTarget = authoredCamera[^\n]+/m)?.[0];
  const planDeltaLine=renderer.match(/^\s*const planYawDelta =[^\n]+/m)?.[0];
  const planYawLine=renderer.match(/^\s*planYaw = authoredCamera[^\n]+/m)?.[0];
  assert.ok(planTargetLine&&planDeltaLine&&planYawLine,'production renderer stair bearing is missing');
  vm.runInContext(`function cameraPlanYaw(state,{initial=0,dt=1/60,authoredCamera=null,snapCamera=false}={}){
    let planYaw=initial,planYawTarget=0;
    ${planTargetLine}${planDeltaLine}${planYawLine}return planYaw;
  }`,context);

  return {c:context,model,events,setTime:(time)=>{now=time;},
    commit(){context.step(1,0);return context.renderMove;},
    tick(time){now=time;return context.renderedPlayerPoint(time);}};
}

test('production main adapter uses runtime XY, metre floor and one shared intermediate pose',()=>{
  const h=harness(),move=h.commit();
  assert.ok(move.mainStair);
  near(move.durationMs,1000*.17/.42);
  near(move.mainStair.horizontalDistanceM,3.8*.2/2);
  const pose=h.tick(1000+move.durationMs/2);
  const eye=finalCameraPoint({px:pose.x,py:pose.z});
  near(Math.hypot(eye.x/.5-126,eye.z/.5-72),3.8);
  near(eye.x/.5,126+Math.sin(.1)*3.8);
  near(pose.floorH,4.885);
  near(pose.yawOffset,.5);
  near(h.c.planYawOffset(),pose.yawOffset);
  const frame=h.c.frameFloor(pose);
  near(frame.floorH,pose.floorH);
  assert.equal(frame.resolvedStairFloor,true);
  near(h.c.cameraHeight(frame),(4.885+1.62)/.5);
});

test('restoring directly onto a tread supplies its exact final camera centre, floor and first step without a prior motion',()=>{
  const h=harness(),standing=h.tick(1000);
  assert.equal(h.c.renderMove,null);
  assert.equal(standing.mainStair,true);assert.equal(standing.complete,true);
  const eye=finalCameraPoint({px:standing.x,py:standing.z});
  near(eye.x/.5,126);near(eye.z/.5,72-3.8);near(standing.floorH,4.8);near(standing.yawOffset,.4);
  const move=h.commit(),first=h.tick(1000);
  near(first.x,standing.x);near(first.z,standing.z);near(first.floorH,standing.floorH);
  const end=h.tick(1001+move.durationMs),final=finalCameraPoint({px:end.x,py:end.z});
  near(final.x/.5,126+Math.sin(.2)*3.8);near(final.z/.5,72-Math.cos(.2)*3.8);
});

test('production renderer bypasses its second height filter only for an explicitly resolved stair pose',()=>{
  const h=harness();
  near(h.c.cameraHeight({floorH:4.9,resolvedStairFloor:true}),(4.9+1.62)/.5);
  const eased=h.c.cameraHeight({floorH:4.9,resolvedStairFloor:false});
  assert.ok(eased>0&&eased<(4.9+1.62)/.5);
  near(eased,((4.9+1.62)/.5)*(1-Math.exp(-14/60)));
  near(h.c.cameraHeight({floorH:4.9,resolvedStairFloor:'true'}),eased,'the bypass is strictly boolean');
});

test('production renderer does not lag the resolved polar bearing, while ordinary look-frame easing remains',()=>{
  const h=harness();
  near(h.c.cameraPlanYaw({yawOffset:.6,resolvedStairFloor:true}),.6);
  near(h.c.cameraPlanYaw({yawOffset:.6,resolvedStairFloor:false}),.6*(1-Math.exp(-9/60)));
  near(h.c.cameraPlanYaw({yawOffset:.6,resolvedStairFloor:'true'}),.6*(1-Math.exp(-9/60)));
});

test('ordinary movement, Source and unrelated stairs retain the existing spring and floor paths',()=>{
  for(const kind of ['ordinary','source','unrelated']) {
    const h=harness({kind});h.commit();
    assert.equal(h.c.renderMove.mainStair,undefined,`${kind} entered main-stair presentation`);
    const pose=h.tick(1030);
    assert.equal(pose.mainStair,undefined);
    assert.equal(pose.floorH,undefined);
    assert.ok(h.c.motionRig,'ordinary spring remains installed');
    const frame=h.c.frameFloor(pose);
    assert.equal(frame.resolvedStairFloor,false);
    near(frame.floorH,kind==='source'?7:999);
  }
});

test('one deferred audible contact occurs at phase .8 and survives a frame jumping beyond contact',()=>{
  for(const phases of [[0,.4,.79,.8,.8,.95,1],[0,.1,1]]) {
    const h=harness(),move=h.commit();
    for(const phase of phases) {
      h.tick(1000+move.durationMs*phase);
      assert.equal(h.events.length,phase<.8?0:1);
    }
    assert.equal(h.events.length,1);
    near(h.events[0].level,.12);near(h.events[0].muffle,.5);
  }
});

test('actual early step gate refuses collision-ahead taps without queueing a burst',()=>{
  const h=harness(),move=h.commit();
  for(let i=0;i<100;i++) {h.setTime(1050);h.c.step(1,0);}
  assert.equal(h.c.px,1);assert.equal(h.c.accepted,1);
  h.tick(1001+move.durationMs);
  assert.equal(h.c.px,1,'render completion does not replay rejected input');
  h.c.step(1,0);
  assert.equal(h.c.px,2);assert.equal(h.c.accepted,2);
});

test('foreground frames slower than one second finish the committed tread in either direction without a queued walk',()=>{
  const h=harness(),up=h.commit();
  const top=h.tick(2500);
  assert.equal(top.complete,true,'a 1.5-second live frame must not strand the first rising tread');
  near(top.floorH,4.97);assert.equal(h.events.length,1);
  assert.equal(h.c.px,1);assert.equal(h.c.accepted,1,'presentation never invents another accepted step');
  h.setTime(2500);h.c.step(-1,0);
  const bottom=h.tick(5000);
  assert.equal(bottom.complete,true,'the same active-time rule permits descending');
  near(bottom.floorH,4.8);assert.equal(h.events.length,2);
  assert.equal(h.c.px,0);assert.equal(h.c.accepted,2);
  h.tick(15000);
  assert.equal(h.events.length,2,'repeated completed samples cannot replay contacts');
  assert.equal(h.c.accepted,2);
});

test('held movement after a delayed frame accepts at most one new committed tread',()=>{
  const h=harness();
  h.c.nextMoveAtMs=0;
  h.c.tickHeldMovement(1000);
  const move=h.c.renderMove;
  h.setTime(1000+move.durationMs+150);
  h.c.tickHeldMovement(1000+move.durationMs+150);
  assert.equal(h.c.accepted,2);
  assert.equal(h.c.px,2);
  h.c.tickHeldMovement(1000+move.durationMs+150);
  assert.equal(h.c.accepted,2,'the same frame cannot drain stale cadence into another tread');
});

test('pause and its long elapsed wall time preserve the committed phase and reset held intent',()=>{
  const h=harness(),move=h.commit();
  const before=h.tick(1000+move.durationMs*.35);
  h.c.paused=true;h.c.resetMotionInput('pause-enter',{stopRenderMove:true});
  assert.equal(h.c.keysDown.size,0);assert.equal(h.c.nextMoveAtMs,0);
  const during=h.tick(30_000);
  near(during.phase,before.phase);near(during.floorH,before.floorH);
  h.c.paused=false;
  const resumed=h.tick(60_000);
  near(resumed.phase,before.phase,'the first active sample must rearm rather than catch up');
  const next=h.tick(60_010);
  near(next.phase,before.phase+10/move.durationMs);
  assert.equal(h.events.length,0);
});

test('actual blur and focus recovery retain the same unfinished tread instead of snapping to its target',()=>{
  const h=harness(),move=h.commit();
  const before=h.tick(1000+move.durationMs*.35);
  h.model.active=false;
  h.c.resetMotionInput('window-blur',{stopRenderMove:true});
  assert.equal(h.c.motionFocusSuspended,true);
  near(h.tick(20_000).phase,before.phase);
  h.setTime(30_000);h.model.active=true;
  assert.equal(h.c.recoverMotionFocus('window-focus'),true);
  assert.equal(h.c.renderMove,move,'focus recovery discarded the preserved committed stair');
  const after=h.tick(30_000);
  near(after.phase,before.phase);near(after.floorH,before.floorH);
  assert.equal(h.c.keysDown.size,0);
});

test('production portal frame turn rebases look without targeting it and compensates the motion offset',()=>{
  const h=harness();
  const from=h.c.mainStairRenderPose(0,0),turn=Math.PI;
  const stepSource=mainFunction('step');
  const start=stepSource.indexOf('  const stairMotion=beginRenderStep(');
  const end=stepSource.indexOf('  lastMoveAtMs=',start);
  assert.ok(start>=0&&end>start,'portal motion integration is missing');
  Object.assign(h.c,{nx:1,ny:0,nowMs:1000,planEdgeTurn:turn,deferredStairFootfall:null});
  vm.runInContext(stepSource.slice(start,end),h.c);
  near(h.c.lastFrameTurn,turn);
  assert.equal(h.c.lastLook,undefined,'a frame rebase must not set or snap requested mouse-look');
  const pose=h.c.renderedPlayerPoint(1000);
  near(Math.atan2(Math.sin(.3+turn+pose.yawOffset-(.3+from.yawOffset)),
    Math.cos(.3+turn+pose.yawOffset-(.3+from.yawOffset))),0);
});

test('actual renderer frame rebase preserves pending look, both world bearings, pitch and image memory',()=>{
  const start=renderer.indexOf('export function r3dShiftLookFrame(');
  const end=renderer.indexOf('\nexport function ',start+10);
  assert.ok(start>=0&&end>start,'renderer frame rebase is missing');
  const context=vm.createContext({
    yaw:.1,yawTarget:.35,planYaw:.6,planYawTarget:.8,
    pitch:-.2,pitchTarget:-.3,facing:0,imageResets:0,
    r3dResetVfdMemory:()=>{context.imageResets++;},
  });
  vm.runInContext(renderer.slice(start,end).replace('export function ','function '),context);
  const before={live:context.yaw+context.planYaw,requested:context.yawTarget+context.planYawTarget,
    pending:context.yawTarget-context.yaw};
  assert.equal(context.r3dShiftLookFrame(Math.PI),true);
  near(context.yaw+context.planYaw,before.live);
  near(context.yawTarget+context.planYawTarget,before.requested);
  near(context.yawTarget-context.yaw,before.pending);
  near(context.pitch,-.2);near(context.pitchTarget,-.3);
  assert.equal(context.imageResets,0);
  assert.equal(context.facing,2);
  assert.equal(context.r3dShiftLookFrame(-Math.PI),true);
  near(context.yaw,.1);near(context.yawTarget,.35);
  near(context.planYaw,.6);near(context.planYawTarget,.8);
  assert.equal(context.r3dShiftLookFrame(NaN),false);
  near(context.yaw,.1);near(context.planYaw,.6);
});

test('authored camera floor takes precedence and never requests the resolved stair filter bypass',()=>{
  const h=harness();
  const frame=h.c.frameFloor({floorH:4.9,mainStair:true},{floorH:9});
  near(frame.floorH,9);assert.equal(frame.resolvedStairFloor,false);
});

test('all 232 actual tread standing points reach their packed mesh after the real renderer adds its cell centre',()=>{
  const {FP,plan}=STAIR_AUDIT.compileConservatory(),bvh=STAIR_AUDIT.buildBVH(STAIR_AUDIT.stairMeshTriangles());
  const scope=vm.createContext({FP,usingPlan:()=>true,usingSpecialSpace:()=>false,planName:'conservatory'});
  vm.runInContext(mainFunction('mainStairRenderPose'),scope);
  let samples=0,oldOffsetFailures=0;
  for(const run of plan.stairRuns.filter(run=>run.owner==='main-open-well'))for(let lane=0;lane<run.width;lane++)for(let tread=0;tread<run.rises;tread++){
    const x=run.logical0[0]+run.logicalDx*tread+run.logicalPx*lane,y=run.logical0[1]+run.logicalDy*tread+run.logicalPy*lane;
    const canonical=FP.logicalToPhysical(x,y),pose=scope.mainStairRenderPose(x,y);
    const eye=finalCameraPoint({px:pose.x,py:pose.z}),oldEye=finalCameraPoint({px:canonical.x,py:canonical.z});
    near(eye.x,canonical.x*CELL);near(eye.z,canonical.z*CELL);
    near(pose.arc.cx+.5,run.cx);near(pose.arc.cz+.5,run.cz);
    // A tread address is exactly on its nose. Query 2mm along that tread, as
    // the construction audit does, so shared-edge ray precision cannot select
    // the preceding tread instead of the surface the player stands on.
    const angle=Math.atan2(eye.x-run.cx*CELL,-(eye.z-run.cz*CELL));
    const nudge={x:Math.cos(angle)*.002,z:Math.sin(angle)*.002};
    const hit=point=>STAIR_AUDIT.meshUpSurfaceBelow(bvh,point.x+nudge.x,pose.floorH+.2,point.z+nudge.z,.6);
    const mesh=hit(eye),oldMesh=hit(oldEye);samples++;
    assert.ok(mesh!=null&&Math.abs(mesh-pose.floorH)<.01,`${run.flight} lane${lane} tread${tread}: final renderer centre must stand on its actual mesh (${mesh} vs ${pose.floorH})`);
    if(oldMesh==null||Math.abs(oldMesh-pose.floorH)>.01)oldOffsetFailures++;
  }
  assert.equal(samples,232);assert.ok(oldOffsetFailures>0,'negative control: the former extra cell offset must reproduce wrong/unsupported treads');
  console.log(JSON.stringify({actualTreadSamples:samples,formerRendererOffsetFailures:oldOffsetFailures,finalRendererOffsetFailures:0}));
});

function compiledKeyboardHost({frameMs=16}={}){
  const {FP,PROPS}=STAIR_AUDIT.compileConservatory();
  let now=1000,collisionChecks=0;const input=new InputManager(),seams=[];
  const rendererScope=vm.createContext({yaw:Math.PI/2,yawTarget:Math.PI/2,pitch:0,pitchTarget:0,planYaw:0,planYawTarget:0,facing:1,
    lookPitchFloor:()=>-1.25,r3dResetVfdMemory:()=>{}});
  const ring=renderer.match(/^const STEP_RING =[^\n]+/m)?.[0];assert.ok(ring);
  vm.runInContext(ring,rendererScope);
  for(const name of ['r3dStepDelta','r3dShiftLookFrame','r3dLookAngles','r3dSetLookAngles']){
    const start=renderer.indexOf(`export function ${name}(`),end=renderer.indexOf('\nexport function ',start+10);
    assert.ok(start>=0&&end>start,name);
    vm.runInContext(renderer.slice(start,end).replace('export function ','function '),rendererScope);
  }
  const geometry={...FP,canStep(...args){collisionChecks++;const move=FP.canStep(...args);geometry.lastMove=move;return move;}};
  const c=vm.createContext({FP,PROPS,CELL,ZONE,keyboardMotionAxes,createMainStairMotionStep,sampleMainStairMotion,mainStairContactCrossed,
    px:278,py:59,planName:'conservatory',RENDERER:'3d',storyMode:true,depth:0,renderMove:null,motionRig:null,paused:false,
    document:{hidden:false},performance:{now:()=>now},MOVE_MS:45,currentMoveIntervalMs:()=>45,D:n=>n*2,
    usingPlan:()=>true,usingSourceSpace:()=>false,usingStairAnomaly:()=>false,usingSpecialSpace:()=>false,activeGeometry:()=>geometry,
    scenes:{blocksInput:()=>false,blocksWorld:()=>false,worldView:()=>null},setupHandoffBlocksMovement:()=>false,sourceDoorArrival:null,
    // An ordinary exploration run: no active tape/tutorial, carry, Chapel
    // demand, impossible stair or Source handoff owns these physical steps.
    REC:{isRecording:()=>false},TUT:{tutorialActive:()=>false},hasEnteredGetIn:()=>true,setupComplete:()=>true,
    playerKeys:new Set(),escape:null,chapelTowerState:()=>({}),CHAPEL_TOWER_PHASE:{},
    academicBouncerAccessForMove,academicBouncers:{view:()=>({admitted:true})},academicBouncerRefusalAt:0,
    natatoriumWaterBlocksAt:()=>false,chapelTapeDemandBeforeStep:()=>false,tryStandingTearCrossing:()=>false,stairTriggerCrossed:()=>false,
    slideBlockedPropStep,pushEvent:()=>{},flagTest:()=>true,stepCount:0,lastMoveAtMs:0,
    isOnboardingActive:()=>false,
    motionInput:input,keysDown:input.held,controllerGameplayAxes:()=>({moveX:0,moveY:0}),clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
    holdUnavailableGameplayInput:()=>false,inCover:()=>false,nextMoveAtMs:0,maybeLockHushFromInputDelta:()=>{},gameplayInputLifecycleActive:()=>true,
    R3:Object.fromEntries(['r3dStepDelta','r3dShiftLookFrame','r3dLookAngles','r3dSetLookAngles'].map(name=>[name,rendererScope[name]])),RT:{footstep:()=>{}},
  });
  for(const name of ['physicalPointFor','motionTargetPoint','snapMotionRig','ensureMotionRig','renderedPlayerPoint','mainStairRenderPose',
    'mainStairMoveTouches','advanceMainStairRenderMove','beginRenderStep','currentStepIntervalMs','armHeldMovement','tickHeldMovement',
    'independentControls','combinedIndependentMotionAxes','movementIntentActive','arrowDelta'])vm.runInContext(mainFunction(name),c);
  // Execute main's complete input/collision/portal policy and its exact pose/
  // logical commit. Only the intervening audio and following story accounting
  // are omitted; no canStep, prop collision, movement or look rule is copied.
  const source=mainFunction('step'),prefix=source.slice(0,source.indexOf('  const stairFootContact='));
  const position=source.slice(source.indexOf('  const stepFrom='),source.indexOf('  // An edge portal changes logical drawings,'));
  const commit=source.slice(source.indexOf('  const stairMotion=beginRenderStep('),source.indexOf("  if(escape?.kind==='cathedral-carry')saveCathedralExtraction();"));
  assert.ok(prefix&&position&&commit);
  vm.runInContext(prefix+'\nconst deferredStairFootfall=null,sx=dx,sy=dy;\n'+position+commit+'\n}',c);
  const frame=()=>{
    now+=frameMs;const before=c.renderedPlayerPoint(now),from={x:c.px,y:c.py};
    c.tickHeldMovement(now);const pose=c.renderedPlayerPoint(now);
    if((from.x!==c.px||from.y!==c.py)&&c.renderMove?.mainStair){
      near(pose.x,before.x);near(pose.z,before.z);
      near(pose.floorH,Number.isFinite(before.floorH)?before.floorH:FP.floorAt(from.x,from.y));
      if(geometry.lastMove?.edgePortal)seams.push(geometry.lastMove.edgePortal);
    }
    return pose;
  };
  const settle=()=>{for(let i=0;i<200;i++){
    const pose=frame(),remaining=Math.hypot(c.motionRig.x-c.motionRig.targetX,c.motionRig.z-c.motionRig.targetZ);
    if(c.renderMove?.mainStair?pose.complete:!c.renderMove&&remaining<.002)return pose;
  }assert.fail('a released step did not settle');};
  const walk=(x,y,{yaw,key='KeyW',maxFrames=5000}={})=>{
    if(yaw!=null)c.R3.r3dSetLookAngles({yaw,pitch:0,immediate:true});
    input.keyDown({key:key.slice(3).toLowerCase(),code:key});
    let frames=0;while((c.px!==x||c.py!==y)&&frames++<maxFrames)frame();
    input.keyUp({key:key.slice(3).toLowerCase(),code:key});
    assert.deepEqual({x:c.px,y:c.py},{x,y},`ordinary ${key} stopped before the requested landing (phase ${c.renderMove?.phase})`);
    return settle();
  };
  return{c,FP,seams,walk,frame,collisionChecks:()=>collisionChecks};
}

test('ordinary held keyboard input climbs all four real flights and reverses every seam with collision and camera continuity intact',()=>{
  const h=compiledKeyboardHost(),start=h.c.renderedPlayerPoint();
  assert.deepEqual(finalCameraPoint({px:start.x,py:start.z}),{x:62.25,z:34.75},'ordinary flat-grid body centre remains unchanged');
  h.walk(300,103,{yaw:Math.PI/2});near(h.FP.floorAt(h.c.px,h.c.py),4.8,1e-5);
  h.walk(302,103);
  // W enters the lower flight, D crosses the flat upper landing and climbs
  // the next two flights; A/S reverse it. Only real seam rebases change the
  // look frame after the initial facing. No test look/position update turns it.
  const top=h.walk(300,128,{key:'KeyD'});near(top.floorH,10);
  h.walk(302,103,{key:'KeyA'});near(h.FP.floorAt(h.c.px,h.c.py),4.8,1e-5);
  h.walk(278,59,{key:'KeyS'});near(h.FP.floorAt(h.c.px,h.c.py),0);
  for(const id of ['ground-hall-to-lower-flight','lower-half-flight-seam','lower-flight-to-upper-floor-landing',
    'upper-floor-landing-to-academic-flight','upper-half-flight-seam','academic-flight-to-floor-landing']){
    assert.equal(h.seams.filter(value=>value===id).length,2,`${id} must be walked forward and back`);
  }
  assert.ok(h.c.stepCount>100&&h.collisionChecks()>100,'the route consists of accepted ordinary collision steps, not coordinate replacements');
  const returned=h.c.renderedPlayerPoint();
  near(finalCameraPoint({px:returned.x,py:returned.z}).x,62.25,.002);
  near(finalCameraPoint({px:returned.x,py:returned.z}).z,34.75,.002);
});

test('the real keyboard, prop collision and seam path remain bidirectional below one frame per second',()=>{
  const h=compiledKeyboardHost({frameMs:1600});
  h.walk(300,103,{yaw:Math.PI/2,maxFrames:160});
  near(h.FP.floorAt(h.c.px,h.c.py),4.8,1e-5);
  h.walk(302,103,{maxFrames:20});
  h.walk(300,128,{key:'KeyD',maxFrames:160});
  near(h.FP.floorAt(h.c.px,h.c.py),10,1e-5);
  h.walk(302,103,{key:'KeyA',maxFrames:160});
  h.walk(278,59,{key:'KeyS',maxFrames:160});
  near(h.FP.floorAt(h.c.px,h.c.py),0,1e-5);
  for(const id of ['ground-hall-to-lower-flight','lower-half-flight-seam','lower-flight-to-upper-floor-landing',
    'upper-floor-landing-to-academic-flight','upper-half-flight-seam','academic-flight-to-floor-landing'])
    assert.equal(h.seams.filter(value=>value===id).length,2,`${id} still crosses both ways under delayed frames`);
});

test('a restored real tread can start slow-frame ascent and descent without stale motion metadata',()=>{
  const h=compiledKeyboardHost({frameMs:1600}),run=h.FP.floorplan().stairRuns.find(run=>run.owner==='main-open-well');
  const at=tread=>({x:run.logical0[0]+run.logicalDx*tread+run.logicalPx,
    y:run.logical0[1]+run.logicalDy*tread+run.logicalPy});
  const saved=at(5);Object.assign(h.c,{px:saved.x,py:saved.y,renderMove:null,motionRig:null});
  const restored=h.c.renderedPlayerPoint(),height=h.FP.floorAt(saved.x,saved.y);
  near(restored.floorH,height,1e-5);assert.equal(restored.complete,true);
  const yaw=Math.atan2(run.logicalDx,-run.logicalDy),up=at(9),down=at(3);
  h.walk(up.x,up.y,{yaw,maxFrames:40});
  assert.ok(h.FP.floorAt(h.c.px,h.c.py)>height);
  // A second load on the higher tread has no in-memory transition either.
  Object.assign(h.c,{renderMove:null,motionRig:null});
  h.walk(down.x,down.y,{key:'KeyS',maxFrames:40});
  assert.ok(h.FP.floorAt(h.c.px,h.c.py)<height);
});
