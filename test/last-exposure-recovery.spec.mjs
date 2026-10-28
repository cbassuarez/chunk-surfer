import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {DEATH_BEATS,deathFrameState,makeDeathScene} from '../src/game/death-scene.js';
import {makeRecoveryScene,recoveryCopy,recoverySceneLayout} from '../src/game/last-exposure-recovery.js';

const press=(scene,code,extra={})=>scene.key({code,...extra});
const release=(scene,code)=>scene.keyup({code});
const tap=(scene,code)=>{press(scene,code);release(scene,code);};

test('recovery explains only committed losses in ordinary language',()=>{
  const copy=recoveryCopy({kind:'taken',roomName:'Concert Hall',minutes:8,lostItem:'tape recorder'});
  assert.equal(copy.title,'YOU WERE TAKEN');
  assert.equal(copy.body,'You woke in Concert Hall. 8 minutes are gone. Your tape recorder is missing.');
  assert.doesNotMatch(copy.body,/status|signal|ledger|receipt|resumed|recovery/i);
  const unknown=recoveryCopy({kind:'recoverable-defeat'});
  assert.equal(unknown.title,'YOU LOST THE FIGHT');
  assert.equal(unknown.body,'You are still alive.');
  assert.doesNotMatch(unknown.body,/minute|missing|uninjured|saved/);
});

test('Continue is the default and dispatches the real continuation exactly once',()=>{
  let count=0;
  const scene=makeRecoveryScene({onContinue:()=>count++});
  assert.equal(scene.view().selected,'continue');
  assert.deepEqual(scene.view().items.map(i=>i.id),['continue','restart','title']);
  tap(scene,'Enter');tap(scene,'Enter');tap(scene,'ArrowDown');
  assert.equal(count,1);assert.equal(scene.view().finished,true);
});

test('held, repeated and duplicate confirmation cannot dismiss a new screen',()=>{
  let count=0;
  const scene=makeRecoveryScene({onContinue:()=>count++,heldKeys:['Enter']});
  press(scene,'Enter');press(scene,'Enter',{repeat:true});assert.equal(count,0);
  release(scene,'Enter');press(scene,'Enter');assert.equal(count,1);
});

test('restart requires explicit second-stage confirmation and fresh input',()=>{
  let restarts=0,continues=0;
  const scene=makeRecoveryScene({onRestart:()=>restarts++,onContinue:()=>continues++});
  tap(scene,'ArrowDown');press(scene,'Enter');
  assert.equal(scene.view().stage,'confirm-restart');
  assert.equal(scene.view().selected,'cancel');
  assert.match(scene.view().body,/current game progress will be lost/);
  assert.match(scene.view().body,/Unlocked content stays/);
  press(scene,'Enter',{repeat:true});press(scene,'Enter');assert.equal(restarts,0);
  release(scene,'Enter');tap(scene,'ArrowDown');tap(scene,'Enter');
  assert.equal(restarts,1);assert.equal(continues,0);
});

test('confirmation defaults to keeping the current run; Escape does not quit',()=>{
  let restarts=0,titles=0;
  const scene=makeRecoveryScene({onRestart:()=>restarts++,onTitle:()=>titles++});
  tap(scene,'ArrowDown');tap(scene,'Enter');tap(scene,'Enter');
  assert.equal(scene.view().stage,'recovery');assert.equal(scene.view().selected,'restart');
  tap(scene,'Escape');assert.equal(restarts,0);assert.equal(titles,0);
});

test('Quit to Title is a deliberate callback and does not execute a restart',()=>{
  let titles=0,restarts=0;
  const scene=makeRecoveryScene({onTitle:()=>titles++,onRestart:()=>restarts++});
  tap(scene,'ArrowDown');tap(scene,'ArrowDown');tap(scene,'Enter');tap(scene,'Enter');
  assert.equal(titles,1);assert.equal(restarts,0);
});

test('pointer-up from a previous scene is swallowed; activation needs matching down and up',()=>{
  let count=0;
  const scene=makeRecoveryScene({onContinue:()=>count++}),hit=scene.view().hitRegions[0];
  const at={cellX:hit.x+2,cellY:hit.y+.5,pointerId:8,button:0};
  scene.pointer({type:'pointerup',...at});assert.equal(count,0);
  scene.pointer({type:'pointerdown',...at});assert.equal(count,0);
  scene.pointer({type:'pointerup',...at,pointerId:9});assert.equal(count,0);
  scene.pointer({type:'pointerdown',...at});scene.pointer({type:'pointerup',...at});
  assert.equal(count,1);
});

test('pointer restart cannot click through its own confirmation',()=>{
  let count=0;
  const scene=makeRecoveryScene({onRestart:()=>count++});
  const hit=scene.view().hitRegions.find(h=>h.id==='restart');
  const at={cellX:hit.x+2,cellY:hit.y+.5,pointerId:2,button:0};
  scene.pointer({type:'pointerdown',...at});scene.pointer({type:'pointerup',...at});
  assert.equal(scene.view().stage,'confirm-restart');assert.equal(scene.view().selected,'cancel');
  scene.pointer({type:'pointerup',...at});assert.equal(count,0);
});

test('recovery freezes play and hides HUD while leaving the actual world presentation available',()=>{
  scenes.clear();const scene=makeRecoveryScene();scenes.push(scene);
  assert.equal(scenes.blocksWorld(),true);assert.equal(scenes.blocksInput(),true);
  assert.equal(scenes.suppressesHud(),true);assert.equal(scenes.worldPresentation(),'visible');
  assert.equal(scene.view().fade,0);scene.update(.5);assert.equal(scene.view().fade,.5);
  scene.update(.5);assert.equal(scene.view().fade,1);assert.equal(scene.view().snapshotAlpha,0,'actual woken room is revealed, not covered by the contact frame forever');
  const overlay={id:'test-owned-overlay'};scenes.push(overlay);scenes.remove(scene);
  assert.equal(scenes.top(),overlay,'the recovery presenter must never remove unrelated scene owners');
  scenes.clear();
});

test('compact recovery keeps consequence copy above actual menu targets',()=>{
  for(const [cols,rows]of [[80,30],[40,20],[20,16]]){
    const copy=recoveryCopy({kind:'recoverable-defeat',roomName:'Concert Hall',minutes:8,lostItem:'tape recorder'});
    const l=recoverySceneLayout({cols,rows,...copy,itemCount:3});
    assert.ok(l.bodyY>=l.titleY+l.titleLines.length*l.scale);
    assert.ok(l.menuY>l.bodyY+l.bodyLines.length-1);
    assert.ok(l.menuY+2*l.menuStep<rows);
    assert.ok(l.titleLines.every(line=>line.length*l.scale<=l.w));
    assert.ok(l.bodyLines.every(line=>line.length<=l.w));
  }
});

test('recovery cancellation cannot later dispatch callbacks or advance its clock',()=>{
  let count=0;const scene=makeRecoveryScene({onContinue:()=>count++});
  scene.exit();scene.update(4);tap(scene,'Enter');
  assert.equal(count,0);assert.equal(scene.view().elapsed,0);
});

test('whole-frame defeat keeps 5.2 seconds, one dark seam, and a monotonic final loss',()=>{
  assert.equal(DEATH_BEATS.loop,5.2);
  assert.equal(deathFrameState(0).phase,'last-view');
  assert.equal(deathFrameState(1.4).phase,'exposure-seam');
  assert.ok(deathFrameState(1.4).seamAmount>0);
  assert.equal(deathFrameState(2.6).phase,'recede');
  assert.equal(deathFrameState(4.1).phase,'black');
  assert.equal(deathFrameState(5.2).complete,true);
  assert.equal(deathFrameState(5.2).imageAlpha,0);
  const samples=Array.from({length:53},(_,i)=>deathFrameState(i/10));
  for(let i=1;i<samples.length;i++){
    assert.ok(samples[i].imageAlpha<=samples[i-1].imageAlpha);
    assert.ok(samples[i].scale<=samples[i-1].scale);
    assert.ok(samples[i].imageAlpha>=0&&samples[i].imageAlpha<=1);
  }
  assert.equal(deathFrameState(1.4,{reducedMotion:true}).seamAmount,0);
  assert.equal(deathFrameState(3,{reducedMotion:true}).scale,1);
  assert.equal(deathFrameState(1.4,{reduceFlash:true}).seamAmount,0);
});

test('defeat handoff happens once, ignores malformed deltas and never attacks or auto-restarts',()=>{
  let count=0;const scene=makeDeathScene({title:'STUDIO B3',endingBound:true,onDone:()=>count++});
  scene.update(NaN);scene.update(-5);assert.equal(scene.view().elapsed,0);
  scene.key({code:'Enter'});scene.pointer({type:'pointerdown'});assert.equal(count,0);
  scene.update(5.2);scene.update(10);assert.equal(count,1);
  assert.equal(scene.view().composition,'whole-final-view');assert.equal(scene.view().endingBound,true);
  assert.doesNotMatch(JSON.stringify(scene.view()),/night continues|retry/i);
  let late=0;const cancelled=makeDeathScene({onDone:()=>late++});cancelled.exit();cancelled.update(10);assert.equal(late,0);
});
