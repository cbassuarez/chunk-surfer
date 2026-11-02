// Execute the actual main.js consent boundary with browser/game services stubbed.
// node --test test/room-mic-host-consent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as SAVE from '../src/game/save.js';
import {normalizePsychProfileSettings,psychProfileChoice,PSYCH_PROFILE_CONSENT_VERSION} from '../src/game/psychological-profile.js';

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const mic=await readFile(new URL('../src/game/mic.js',import.meta.url),'utf8');
function section(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert(from>=0&&to>from,`Missing production function ${start}`);
  return source.slice(from,to);
}
function fixture({consent=null,disabled=false,existingState='idle',saveOwner=null}={}){
  let save={settings:{mic:'off',micInput:{deviceId:'stale-input',channelMode:'right',
    echoCancellation:true,noiseSuppression:false,autoGainControl:false,lastDeviceLabel:'Old input'}}};
  const requests=[],cards=[],calls=[];
  let stopped=0,ensureCalls=0,micState=existingState;
  const pending=Promise.resolve({state:'on',active:true});
  const context=vm.createContext({
    roomMicRunConsent:consent,actx:{id:'audio-context'},
    getSave:()=>saveOwner?saveOwner.getSave():save,saveCommit:next=>{
      calls.push(['save',next.settings?.mic]);if(saveOwner)return saveOwner.saveCommit(next);save={...save,...next};},
    currentPsychProfileSettings:()=>({modules:{microphone:false}}),
    mirrorPsychProfileCompatibility:(settings,profile)=>({...settings,mic:profile.modules.microphone?'on':'off'}),
    params:()=>new Set(disabled?['nomic']:[]),
    ensureCtx:()=>{ensureCalls++;calls.push(['ensure-context']);},
    MIC:{micInit:(context,options)=>{requests.push({context,options});micState='asking';calls.push(['capture']);return pending;},
      micSnapshot:()=>({state:micState,active:micState==='on',osPermission:'granted'}),micStop:()=>{stopped++;micState='idle';calls.push(['stop']);},
      micRefreshDevices:()=>{calls.push(['refresh-devices']);}},
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
  return {context,requests,cards,pending,calls,get save(){return saveOwner?saveOwner.getSave():save;},get stopped(){return stopped;},get ensureCalls(){return ensureCalls;}};
}

function newRunFixture({profileAccepted=true}={}){
  // The real save/newGame functions run only in this Node process. In Node
  // there is no browser storage or native persistence bridge to a user's save.
  const profile=psychProfileChoice(true);if(!profileAccepted)profile.consentVersion='';
  SAVE.saveCommit(SAVE.freshSave({settings:{...SAVE.getSave().settings,mic:'on',psychProfile:profile}}));
  const f=fixture({consent:true,existingState:'on',saveOwner:SAVE}),ctx=f.context;
  Object.assign(ctx,{normalizePsychProfileSettings,psychProfileChoice,PSYCH_PROFILE_CONSENT_VERSION,
    syncControllerSettingsFromSave:()=>f.calls.push(['sync-controls']),applyCurrentRunDifficulty:()=>f.calls.push(['difficulty']),
    warmGameAudio:()=>{f.calls.push(['warm']);return Promise.resolve();},battleInterference:{settingsChanged:async()=>f.calls.push(['profile-effects'])},
    personalWindowEffects:{emergencyRestore:async()=>{}},openingVehicleScene:null,openingOvertureScene:null,
    godClearSpecialWorlds:()=>f.calls.push(['clear-worlds']),retireStudentStrike:()=>{},activeBattleId:null,godBattleOpen:false,
    STORY:{stopTapeHiss:()=>{}},resetMotionInput:()=>{},frontEndSession:null,
    newGame:options=>{f.calls.push(['newGame']);return SAVE.newGame(options);},
    flagSet:name=>SAVE.saveCommit({flags:{...SAVE.getSave().flags,[name]:true}}),
    enterStory:()=>{f.calls.push(['enter-story']);if(SAVE.getSave().settings.mic==='on')ctx.startRoomMic();},
  });
  ctx.scenes.remove=id=>f.calls.push(['remove',id]);
  vm.runInContext(section(main,'function currentPsychProfileSettings(', '\n// Compatibility adapter'),ctx);
  vm.runInContext(section(main,'function mirrorPsychProfileCompatibility(', '\nfunction chooseRoomMicForRun('),ctx);
  vm.runInContext(section(main,'async function applyPsychProfileSettingsChange(', '\n// A CONSENT THIS'),ctx);
  vm.runInContext(section(main,'function finishFrontEndRunStart(', '\n// Story mode hides'),ctx);
  return f;
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

test('real newGame preserves OS-granted settings but renews run consent, and explicit decline survives the real handoff',async()=>{
  const f=newRunFixture();f.context.beginNewGameFlow();
  assert.equal(f.context.roomMicRunConsent,null);assert.equal(f.cards.length,1);assert.equal(f.cards[0].askMic,true);
  assert.equal(f.cards[0].askProfile,false);assert.equal(f.save.settings.mic,'on','actual newGame retains saved equipment preferences, not run permission');
  assert.equal(f.requests.length,0);assert.equal(f.context.MIC.micSnapshot().state,'idle');
  assert.equal(f.context.MIC.micSnapshot().osPermission,'granted','an OS grant is independent of this run decision');
  const stop=f.calls.findIndex(([name])=>name==='stop'),newGame=f.calls.findIndex(([name])=>name==='newGame'),warm=f.calls.findIndex(([name])=>name==='warm');
  assert.ok(stop>=0&&stop<newGame&&newGame<warm,'old capture stops before the actual saved run is replaced and warming begins');
  f.cards[0].onMicDeny();f.cards[0].onDone();await Promise.resolve();
  assert.equal(f.context.roomMicRunConsent,false);assert.equal(f.save.settings.mic,'off');assert.equal(f.save.settings.psychProfile.modules.microphone,false);
  assert.equal(f.context.MIC.micSnapshot().state,'idle');assert.equal(f.requests.length,0);
  assert.equal(f.calls.filter(([name])=>name==='enter-story').length,1);
  assert.equal(f.context.startRoomMic({force:true}),null,'even an ordinary delayed start cannot bypass the run decline');
  assert.equal(f.requests.length,0);assert.equal(f.ensureCalls,0);
});

test('profile consent, unrelated settings callbacks and their async completions cannot resurrect a declined run',async()=>{
  const f=newRunFixture({profileAccepted:false});f.context.beginNewGameFlow();const card=f.cards[0];
  assert.equal(card.askProfile,true);card.onProfileOn();assert.equal(f.save.settings.mic,'on');assert.equal(f.requests.length,0);
  // Keep an actual settings callback suspended across the player's newer No.
  // Its old profile still has microphone=true, but its awaited completion must
  // not rewrite that newer decision or start capture from retained OS access.
  let restore;
  f.context.personalWindowEffects.emergencyRestore=()=>new Promise(resolve=>{restore=resolve;});
  const before=normalizePsychProfileSettings(f.save.settings.psychProfile);
  const restoring=f.context.applyPsychProfileSettingsChange({previous:before,
    next:{...before,modules:{...before.modules,windowChoreography:false}},changedKey:'windowChoreography'});
  assert.equal(typeof restore,'function');assert.equal(f.save.settings.mic,'on');
  card.onMicDeny();card.onDone();
  restore();await restoring;
  assert.equal(f.context.roomMicRunConsent,false);assert.equal(f.save.settings.mic,'off');assert.equal(f.requests.length,0);
  const declined=normalizePsychProfileSettings(f.save.settings.psychProfile),next={...declined,windowIntensity:'hostile'};
  await f.context.applyPsychProfileSettingsChange({previous:declined,next,changedKey:'windowIntensity'});
  assert.equal(f.context.roomMicRunConsent,false);assert.equal(f.save.settings.mic,'off');assert.equal(f.requests.length,0);
  // Even an out-of-order profile result can only change profile preferences.
  // It is not a new explicit permission for this already-declined run.
  card.onProfileOn();await Promise.resolve();assert.equal(f.context.roomMicRunConsent,false);
  assert.equal(f.context.startRoomMic(),null);assert.equal(f.requests.length,0);
  f.context.chooseRoomMicForRun(false);assert.equal(f.save.settings.mic,'off');
});

test('every real new-run flow asks again, while an explicit settings microphone enable remains an intentional new consent',async()=>{
  const f=newRunFixture();f.context.beginNewGameFlow();const first=f.cards.at(-1);
  first.onMicAllow();assert.equal(f.context.roomMicRunConsent,true);assert.equal(f.requests.length,1);
  first.onDone();const previousRequests=f.requests.length;
  f.context.beginNewGameFlow();assert.equal(f.cards.length,2);assert.equal(f.cards.at(-1).askMic,true);assert.equal(f.context.roomMicRunConsent,null);
  f.cards.at(-1).onMicDeny();f.cards.at(-1).onDone();assert.equal(f.requests.length,previousRequests);
  const previous=normalizePsychProfileSettings(f.save.settings.psychProfile),next={...previous,modules:{...previous.modules,microphone:true}};
  await f.context.applyPsychProfileSettingsChange({previous,next,changedKey:'microphone'});
  assert.equal(f.context.roomMicRunConsent,true);assert.equal(f.save.settings.mic,'on');
  assert.equal(f.requests.length,previousRequests+1,'the actual settings control is a deliberate opt-in, not an OS-grant callback');
});
