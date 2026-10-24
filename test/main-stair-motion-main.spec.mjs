import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  createMainStairMotionStep,sampleMainStairMotion,mainStairContactCrossed,
} from '../src/render/main-stair-motion.js';

// Execute the production adapters with a two-tread floorplan, rather than
// copying their logic or paying for the complete conservatory compiler.
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=(typeof e==='number'?e:1e-8),`${a} differs from ${b}${typeof e==='string'?`: ${e}`:''}`);
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
  near(Math.hypot(pose.x-126,pose.z-72),3.8);
  near(pose.x,126+Math.sin(.1)*3.8);
  near(pose.floorH,4.885);
  near(pose.yawOffset,.5);
  near(h.c.planYawOffset(),pose.yawOffset);
  const frame=h.c.frameFloor(pose);
  near(frame.floorH,pose.floorH);
  assert.equal(frame.resolvedStairFloor,true);
  near(h.c.cameraHeight(frame),(4.885+1.62)/.5);
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
