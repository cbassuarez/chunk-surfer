import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeSettings } from '../src/progression/schema.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';

const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function functionSource(source, name, nextName) {
  const start=source.indexOf(`function ${name}(`), end=source.indexOf(`\n${nextName}`,start);
  assert.ok(start>=0 && end>start, `production ${name} found`);
  return source.slice(start,end).replace(/^function /,'function ');
}

function rendererHarness() {
  const ctx={yaw:.1,yawTarget:.3,pitch:-.1,pitchTarget:0,facing:0,
    LOOK_YAW_LIMIT:2.4, LOOK_PITCH_LIMIT:.7,LOOK_UP_LIMIT:1.1,lookPitchFloor:()=>-1.15,
    MOUSE_GLIDE_SECONDS:.09,MOUSE_GLIDE_GAIN:.08,MOUSE_GLIDE_MAX_SPEED:7.4,
    mouseGlideYaw:0,mouseGlidePitch:0,r3dResetVfdMemory(){},
    r3dCancelMouseLookGlide(){ctx.mouseGlideYaw=ctx.mouseGlidePitch=0;}};
  vm.createContext(ctx);
  vm.runInContext(functionSource(renderer,'advanceMouseLookGlide','export function r3dLook'),ctx);
  vm.runInContext(functionSource(renderer,'r3dLook','export function r3dLookAngles'),ctx);
  return ctx;
}

test('direct mouse displacement moves the camera immediately without consuming pending stick smoothing', () => {
  const h=rendererHarness();
  h.r3dLook(.2,.12,{immediate:true});
  assert.ok(Math.abs(h.yaw-.3)<1e-10);
  assert.ok(Math.abs(h.pitch-.02)<1e-10);
  assert.ok(Math.abs((h.yawTarget-h.yaw)-.2)<1e-10);
  assert.ok(Math.abs((h.pitchTarget-h.pitch)-.1)<1e-10);
  h.r3dLook(.1,-.1);
  assert.ok(Math.abs(h.yaw-.3)<1e-10,'stick or scripted input remains eased');
});

test('direct look respects the actual clamped change at pitch and input bounds', () => {
  const h=rendererHarness(); h.pitch=h.pitchTarget=1.08;
  h.r3dLook(20,20,{immediate:true});
  assert.ok(Math.abs(h.yaw-2.5)<1e-10);
  assert.ok(Math.abs(h.pitch-1.1)<1e-10);
  assert.ok(Math.abs(h.pitchTarget-1.1)<1e-10);
});

test('horizontal input is continuous through full revolutions and accepts a quick large sweep',()=>{
  const h=rendererHarness();const start=h.yaw;
  for(let i=0;i<8;i++)h.r3dLook(1,0,{immediate:true});
  assert.ok(Math.abs(h.yaw-start-8)<1e-10,'there is no left/right angular stop');
  const before=h.yaw;h.r3dLook(-2,0,{immediate:true});
  assert.ok(Math.abs(h.yaw-before+2)<1e-10,'a fast frame retains a two-radian sweep');
  assert.equal(h.pitch,-.1,'horizontal look does not change vertical view');
});

test('mouse glide begins with direct response, stays bounded and is frame-rate independent',()=>{
  const tail=(hz)=>{const h=rendererHarness();const initial=h.yaw;
    h.r3dLook(.1,.08,{immediate:true,glide:true,deltaSeconds:1/60});
    assert.ok(Math.abs(h.yaw-initial-.1)<1e-10,'no delayed input');
    for(let i=0;i<hz;i++)h.advanceMouseLookGlide(1/hz);
    return {extra:h.yaw-initial-.1,pitch:h.pitch,velocity:h.mouseGlideYaw};};
  const a=tail(30),b=tail(60);
  assert.ok(a.extra>0&&a.extra<.06,'a short positive tail');
  assert.ok(Math.abs(a.extra-b.extra)<.001,'same real-time decay at 30 and 60 fps');
  assert.equal(a.velocity,0);
});

test('a reversal changes glide direction immediately and cancellation prevents drift',()=>{
  const h=rendererHarness();h.r3dLook(.4,0,{immediate:true,glide:true,deltaSeconds:1/30});
  assert.ok(h.mouseGlideYaw>0);h.r3dLook(-.1,0,{immediate:true,glide:true,deltaSeconds:1/30});
  assert.ok(h.mouseGlideYaw<0);h.r3dCancelMouseLookGlide();const yaw=h.yaw;h.advanceMouseLookGlide(.1);
  assert.equal(h.yaw,yaw);assert.equal(h.mouseGlideYaw,0);
});

test('glide stops at pitch limits and preserves direction across the stair frame rebase',()=>{
  const h=rendererHarness();h.pitch=h.pitchTarget=1.09;
  h.r3dLook(.15,.5,{immediate:true,glide:true,deltaSeconds:1/60});
  h.advanceMouseLookGlide(.03);assert.equal(h.pitchTarget,1.1);assert.equal(h.mouseGlidePitch,0);
  h.planYaw=.4;h.planYawTarget=.6;
  vm.runInContext(functionSource(renderer,'r3dShiftLookFrame','export function r3dSetLookAngles'),h);
  const physicalBefore=h.yaw+h.planYaw,velocity=h.mouseGlideYaw;
  h.r3dShiftLookFrame(.5);
  assert.ok(Math.abs((h.yaw+h.planYaw)-physicalBefore)<1e-10);
  assert.equal(h.mouseGlideYaw,velocity,'rebasing a stair does not cancel or reverse the residual motion');
  h.advanceMouseLookGlide(.03);assert.ok(h.yaw+h.planYaw>physicalBefore);
});

test('the input path requests direct world look only for the mouse, not the stick or a scene owner', () => {
  const text=functionSource(main,'tickIndependentLook','function mouseLookSensitivity');
  const calls=[];let cancelled=0;
  const h={holdUnavailableGameplayInput:()=>false,RENDERER:'3d',paused:false,
    scenes:{blocksInput:()=>false,allowsLook:()=>false,lookOwner:()=>null},costumeInspectionScene:null,
    motionInput:{pointerDx:10,pointerDy:2,clearPointerDeltas(){}},controllerGameplayAxes:()=>({turnX:.5,lookY:0}),
    R3:{r3dLookAngles:()=>({yaw:0,pitch:0}),r3dLook:(...args)=>calls.push(args),r3dCancelMouseLookGlide:()=>{cancelled++;}},
    clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),mouseLookSensitivity:()=>1,mouseInvertY:()=>false,shakeMode:()=> 'full',
    noteExteriorArrivalControl(){}};
  vm.createContext(h);vm.runInContext(text,h);h.tickIndependentLook(.1);
  assert.equal(calls.length,2);
  assert.equal(calls[0][2],undefined);
  assert.equal(calls[1][2].immediate,true);
  assert.equal(calls[1][2].glide,true);assert.equal(calls[1][2].deltaSeconds,.1);
  assert.ok(Math.abs(calls[1][0]-.085)<1e-12,'horizontal sweep uses the tuned gain');
  assert.ok(Math.abs(calls[1][1]+.0136)<1e-12,'vertical speed remains unchanged');
  h.shakeMode=()=> 'reduced';calls.length=0;h.tickIndependentLook(.1);assert.equal(calls[1][2].glide,false);
  const owned=[]; h.scenes.lookOwner=()=>({lookAngles:()=>({yaw:0,pitch:0}),lookBy:(...args)=>owned.push(args)});
  calls.length=0;h.tickIndependentLook(.1);
  assert.equal(calls.length,0);assert.equal(owned.length,2);
  assert.ok(cancelled>0,'scene owners cancel the residual world-camera velocity');
  const before=cancelled;h.paused=true;h.tickIndependentLook(.1);assert.ok(cancelled>before,'pause cancels residual look');
});

test('the full offered sensitivity survives the real save commit and a serialized reload', async () => {
  for (const sensitivity of [.2,1,3,4.2,9,10]) {
    const saved=await withTransientGameState({save:freshSave()},async()=>{
      saveCommit({settings:{...getSave().settings,mouseSensitivity:sensitivity}});
      assert.equal(getSave().settings.mouseSensitivity,sensitivity);
      return JSON.parse(JSON.stringify(getSave()));
    });
    await withTransientGameState({save:saved},async()=>{
      assert.equal(getSave().settings.mouseSensitivity,sensitivity);
    });
    assert.equal(normalizeSettings(saved.settings).mouseSensitivity,sensitivity);
  }
});
