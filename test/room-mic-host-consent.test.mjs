// Execute the actual main.js consent boundary with browser/game services stubbed.
// node --test test/room-mic-host-consent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const mic=await readFile(new URL('../src/game/mic.js',import.meta.url),'utf8');
function section(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert(from>=0&&to>from,`Missing production function ${start}`);
  return source.slice(from,to);
}
function fixture({consent=null,disabled=false,existingState='idle'}={}){
  let save={settings:{mic:'off',micInput:{deviceId:'stale-input',channelMode:'right',
    echoCancellation:true,noiseSuppression:false,autoGainControl:false,lastDeviceLabel:'Old input'}}};
  const requests=[],cards=[];
  let stopped=0,ensureCalls=0;
  const pending=Promise.resolve({state:'on',active:true});
  const context=vm.createContext({
    roomMicRunConsent:consent,actx:{id:'audio-context'},
    getSave:()=>save,saveCommit:next=>{save={...save,...next};},
    currentPsychProfileSettings:()=>({modules:{microphone:false}}),
    mirrorPsychProfileCompatibility:(settings,profile)=>({...settings,mic:profile.modules.microphone?'on':'off'}),
    params:()=>new Set(disabled?['nomic']:[]),
    ensureCtx:()=>{ensureCalls++;},
    MIC:{micInit:(context,options)=>{requests.push({context,options});return pending;},
      micSnapshot:()=>({state:existingState,active:existingState==='on'}),micStop:()=>{stopped++;}},
    DEFAULT_INPUT:{deviceId:'default',channelMode:'mono',echoCancellation:true,noiseSuppression:false,
      autoGainControl:false,lastDeviceLabel:''},
    scenes:{push:scene=>cards.push(scene)},makeWarningScene:options=>options,
  });
  vm.runInContext(section(mic,'export function normalizeMicInput(', '\nfunction setState').replace('export ',''),context);
  vm.runInContext('MIC.normalizeMicInput=normalizeMicInput;',context);
  vm.runInContext(section(main,'function roomMicInputOptions(', '// This grant lives'),context);
  vm.runInContext(section(main,'function startRoomMic(', '\nfunction applyStoryChoice'),context);
  vm.runInContext(section(main,'function chooseRoomMicForRun(', '\nasync function applyPsychProfileSettingsChange'),context);
  vm.runInContext(section(main,'function requestFrontEndContinue(', '\nfunction requestFrontEndNewRun'),context);
  return {context,requests,cards,pending,get save(){return save;},get stopped(){return stopped;},get ensureCalls(){return ensureCalls;}};
}

test('Allow invokes capture synchronously and returns the actual pending result',()=>{
  const f=fixture(),result=f.context.chooseRoomMicForRun(true);
  assert.equal(result,f.pending);
  assert.equal(f.context.roomMicRunConsent,true);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].options.deviceId,'stale-input');
  assert.equal(f.requests[0].options.force,true);
});

test('Use Default is an explicit persisted choice and preserves channel/processing preferences',()=>{
  const f=fixture();
  f.context.chooseRoomMicForRun(true,{deviceId:'default',lastDeviceLabel:''});
  assert.equal(f.save.settings.micInput.deviceId,'default');
  assert.equal(f.save.settings.micInput.lastDeviceLabel,'');
  assert.equal(f.save.settings.micInput.channelMode,'right');
  assert.equal(f.requests[0].options.deviceId,'default');
  f.context.chooseRoomMicForRun(true);
  assert.equal(f.requests[1].options.deviceId,'default','Subsequent retry must not restore stale saved input');
});

test('decline never requests capture or alters input selection',()=>{
  const f=fixture();
  f.context.chooseRoomMicForRun(false,{deviceId:'default'});
  assert.equal(f.context.roomMicRunConsent,false);
  assert.equal(f.requests.length,0);
  assert.equal(f.ensureCalls,0);
  assert.equal(f.stopped,1);
  assert.equal(f.save.settings.micInput.deviceId,'stale-input');
});

test('session consent and the explicit nomic launch option remain capture gates',()=>{
  const unknown=fixture();
  assert.equal(unknown.context.startRoomMic(),null);
  assert.equal(unknown.requests.length,0);
  const disabled=fixture({disabled:true});
  const result=disabled.context.chooseRoomMicForRun(true);
  assert.equal(result.state,'unavailable');
  assert.equal(result.reason,'disabled-by-launch-option');
  assert.equal(disabled.requests.length,0);
});

test('Continue card forwards the default-device recovery through the real host callback',()=>{
  const f=fixture();
  f.context.requestFrontEndContinue();
  assert.equal(f.cards.length,1);
  assert.equal(f.cards[0].askMic,true);
  f.cards[0].onMicAllow({deviceId:'default',lastDeviceLabel:''});
  assert.equal(f.requests[0].options.deviceId,'default');
  assert.equal(f.save.settings.micInput.deviceId,'default');
});

test('new-run card forwards the same recovery without granting profile consent',()=>{
  const f=fixture();
  Object.assign(f.context,{syncControllerSettingsFromSave(){},applyCurrentRunDifficulty(){},
    warmGameAudio:()=>Promise.resolve(),PSYCH_PROFILE_CONSENT_VERSION:1,
    applyPsychProfileConsent:()=>{throw Error('Microphone choice must not choose the profile');},
    finishFrontEndRunStart(){}});
  vm.runInContext(section(main,'function enterSelectedRun(', '\n// Story mode hides'),f.context);
  f.context.enterSelectedRun();
  assert.equal(f.cards.length,1);
  f.cards[0].onMicAllow({deviceId:'default',lastDeviceLabel:''});
  assert.equal(f.requests[0].options.deviceId,'default');
  assert.equal(f.save.settings.micInput.deviceId,'default');
});
