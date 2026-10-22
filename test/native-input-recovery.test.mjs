import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {InputManager} from '../src/input/input-manager.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const motion=main.slice(main.indexOf('function resetMotionInput('),main.indexOf('function recoverInteractionAudio('));
const native=main.slice(main.indexOf('function handleNativeGameplayFocus('),main.indexOf('function resumeGameplayInput('));
function fixture(){
 const input=new InputManager();const c=vm.createContext({motionInput:input,REC:{setSlow(){}},document:{hidden:false},paused:false,
 scenes:{top:()=>null},bellPealPerformance:null,
 snapMotionRig(){},setUiCueFocused(){},recoverInteractionAudio(){},refreshStageLayoutSoon(){},
 gameplayWantsPointerCapture:()=>true,ensureInteractionFocus(){}});
 vm.runInContext('let motionFocusSuspended=true, keysDown=new Set(), nextMoveAtMs=0, nextTurnAtMs=0, motionResetReason="", lastLoopMs=0, renderMove=null;'+motion+native+'; function onBlur(){resetMotionInput("window-blur",{stopRenderMove:true});}',c);
 return {input,c,run:code=>vm.runInContext(code,c)};
}
test('native blur clears held movement even when the DOM never emits blur',()=>{
 const f=fixture();f.input.keyDown({code:'KeyW'});f.run('handleNativeGameplayFocus(false,"native-window-blur")');
 assert.equal(f.input.snapshot().moveY,0);assert.equal(f.input.debugState().focused,false);
});
test('late DOM focus/visibility return does not erase fresh movement after native return',()=>{
 const f=fixture();f.run('handleNativeGameplayFocus(false);handleNativeGameplayFocus(true)');
 f.input.keyDown({code:'KeyW'});const generation=f.input.generation;
 f.run('recoverMotionFocus("window-focus");recoverMotionFocus("visibility-visible");recoverMotionFocus("pageshow")');
 assert.equal(f.input.snapshot().moveY,1);assert.equal(f.input.generation,generation);
 f.input.keyUp({code:'KeyW'});assert.equal(f.input.snapshot().moveY,0);
});
test('the next real lifecycle loss clears a newly held key and permits a fresh press',()=>{
 const f=fixture();f.run('handleNativeGameplayFocus(false);handleNativeGameplayFocus(true)');f.input.keyDown({code:'KeyW'});
 f.run('resetMotionInput("visibility-hidden",{stopRenderMove:true});recoverMotionFocus("visibility-visible")');
 assert.equal(f.input.snapshot().moveY,0);f.input.keyDown({code:'KeyW'});assert.equal(f.input.snapshot().moveY,1);
});
test('native return leaves a modal keyboard owner alone',()=>{
 const f=fixture();f.c.gameplayWantsPointerCapture=()=>false;let calls=0;f.c.ensureInteractionFocus=()=>{calls++};
 f.run('handleNativeGameplayFocus(false);handleNativeGameplayFocus(true)');assert.equal(calls,0);
});
