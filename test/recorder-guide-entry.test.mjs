import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeRecorderScene} from '../src/game/recorder-scene.js';
import * as scenes from '../src/game/scenes.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('function openRecorder(){'),end=source.indexOf('\nfunction recorderMachineState(){',start);
assert.ok(start>=0&&end>start);
function harness({setup=true,handled=true,opensGuide=true}={}){
  const log=[];
  let created;
  const host={storyMode:true,chapelTapeCaseAvailable:()=>true,scenes:{has:()=>false,push:s=>log.push(['push',s.id])},RECORDER_SCENE_ID:'recorder',
    dreamFigure:null,itemLost:()=>false,toggleTowerPersonalRecorder:()=>false,tryRigCheck:()=>false,flagTest:()=>true,
    REC:{isRecording:()=>false},PB:{isPlaying:()=>false},setupComplete:()=>!setup,levelCheckHere:()=>true,
    recorderLate:{pending:false,bypass:false},usingSourceSpace:()=>false,CUES:{CUE:{bag:'bag'},playCue:()=>{}},
    recorderMachineState:()=>({}),recorderTapeRows:()=>[],resetMotionInput:()=>{},
    makeRecorderScene:options=>created={id:'recorder',options,beginGuide:c=>{log.push(['guide',c.id]);return true},close:()=>log.push(['close'])},
    firstTakeIntercept:({beginGuide}={})=>{log.push(['intercept',typeof beginGuide]);if(opensGuide)beginGuide({id:'level-check',nodes:{}});return handled;},
    recordAction:()=>log.push(['record']),stopTake:()=>{},playTakeFrom:()=>{},pendingTapeRoll:false,playbackRoom:null,saveCommit:()=>{},
  };
  vm.createContext(host);vm.runInContext(source.slice(start,end),host);
  return{run:()=>host.openRecorder(),log,get scene(){return created;}};
}
test('the setup shortcut opens the real recorder before beginning its guide',()=>{
  const h=harness();assert.equal(h.run(),true);
  assert.deepEqual(h.log,[['push','recorder'],['intercept','function'],['guide','level-check']]);
});
test('setup retry closes the instrument after an immediate roll, while a declined intercept leaves it available',()=>{
  const retry=harness({opensGuide:false});retry.run();assert.deepEqual(retry.log,[['push','recorder'],['intercept','function'],['close']]);
  const noGuide=harness({handled:false,opensGuide:false});noGuide.run();assert.deepEqual(noGuide.log,[['push','recorder'],['intercept','function']]);
  const usual=harness({setup:false});usual.run();assert.deepEqual(usual.log,[['push','recorder']]);
});
test('a directly started recorder guide uses the production conversation and closes on completion',()=>{
  scenes.clear();let completed=0;const scene=makeRecorderScene({getState:()=>({})});scenes.push(scene);
  assert.equal(scene.beginGuide({id:'level-check',nodes:{start:{lines:[],choices:[{text:'Ready',goto:'end'}]},end:{lines:[]}},onDone:()=>completed++}),true);
  assert.equal(scene.debugState().guide.id,'level-check');
  scene.key({key:'1',code:'Digit1'});scene.update(1);
  assert.equal(completed,1);assert.equal(scenes.has('recorder'),false);scenes.clear();
});
