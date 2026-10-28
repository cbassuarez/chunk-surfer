import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makePayphoneScene } from '../src/game/payphone-scene.js';
import { PAYPHONE_NUMBERS, PAYPHONE_PASS, payphoneIncoming, payphoneLoopHolds, payphoneOutcome } from '../src/game/payphone.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

test('each key route rings in, and the sheet follows without dialling or paying',()=>{
  for(const [flags,id] of [[{},'office'],[{'cold.trunk.night':true},'lodge'],[{'cold.trunk.last':true},'clock']]){
    const call=payphoneIncoming({pass:0,flags});
    assert.equal(call.id,id);assert.equal(call.node,`${id}-key`);
    assert.deepEqual(call.grants,['chapel-key']);assert.equal(call.pays,false);assert.equal(call.rings,Infinity);
    const sheet=payphoneIncoming({flags:{...flags,'phone.key.granted':true},hasChapelKey:true});
    assert.equal(sheet.node,'hold');assert.deepEqual(sheet.grants,['sheet']);assert.equal(sheet.pays,false);
    assert.equal(payphoneIncoming({flags:{...flags,'phone.key.granted':true,'phone.sheet.granted':true},hasChapelKey:true}),null);
    assert.equal(payphoneIncoming({flags:{...flags,'phone.key.granted':true},hasChapelKey:true,hasPhoneSheet:true}),null);
    assert.equal(payphoneOutcome({digits:PAYPHONE_NUMBERS[id].digits,flags}).pays,id!=='clock','optional outgoing pay-on-answer was lost');
  }
});

test('pending story calls wait on hook, then connect by pickup with no tape',()=>{
  const flags={},calls=[],bells=[];
  let hasChapelKey=false,time=0;
  const scene=makePayphoneScene({startOnHook:true,clock:()=>time,
    incoming:()=>payphoneIncoming({flags,hasChapelKey}),line:{bell:options=>bells.push(options)},
    onFeed:()=>assert.fail('an incoming call asked for tape payment'),
    onCall:(outcome,detail)=>calls.push({outcome,detail}),
  });
  scene.enter();time=4;scene.update();
  assert.equal(scene.view().phase,'onhook');assert.equal(calls.length,0);assert.equal(bells.length,1);
  assert.equal(scene.view().incoming,'office');scene.lift();
  assert.equal(scene.view().phase,'connected');assert.deepEqual(calls[0].outcome.grants,['chapel-key']);
  assert.equal(calls[0].detail.incoming,true);assert.equal(scene.view().digits,'');assert.equal(scene.tapeIn(),false);
  flags['phone.key.granted']=true;hasChapelKey=true;scene.hangUp();
  assert.equal(scene.view().incoming,'office');scene.lift();
  assert.deepEqual(calls[1].outcome.grants,['sheet'],'replacing/lifting the receiver failed to refresh the waiting call');
  flags['phone.sheet.granted']=true;scene.hangUp();scene.lift();
  assert.equal(scene.view().phase,'dialtone','after receiving the story, the full rotary instrument should remain available');
});

test('the loop incoming call has no speech requirement and holds only until answered',()=>{
  const flags={};
  assert.equal(payphoneIncoming({pass:PAYPHONE_PASS.loop,flags}).node,'loop-answer');
  assert.equal(payphoneLoopHolds({pass:PAYPHONE_PASS.loop,flags}),true);
  flags['phone.loop.broken']=true;
  assert.equal(payphoneLoopHolds({pass:PAYPHONE_PASS.loop,flags}),false);
  const story=JSON.parse(readFileSync(new URL('../content/narrative/source-space.payphone.story.json',import.meta.url),'utf8'));
  assert.equal(story.nodes['loop-answer'].choices,undefined);assert.equal(story.nodes['loop-answer'].listen,undefined);
});

test('the personal loop call has a quiet aftermath while practical calls remain at the next kiosk',()=>{
 const flags={'phone.loop.broken':true};
 for(const hasChapelKey of[false,true]){
  assert.equal(payphoneIncoming({pass:PAYPHONE_PASS.loop,flags,hasChapelKey,lifting:true}),null,'the same released box started a practical incoming call');
  const next=payphoneIncoming({pass:PAYPHONE_PASS.loop+1,flags,hasChapelKey});
  assert.ok(next?.grants.includes(hasChapelKey?'sheet':'chapel-key'),'the next kiosk lost the existing delivery');
  assert.equal(next.pays,false);assert.equal(next.forced,false);
 }
 assert.equal(payphoneLoopHolds({pass:PAYPHONE_PASS.loop,flags}),false);
 const optional=payphoneOutcome({digits:PAYPHONE_NUMBERS.office.digits,pass:PAYPHONE_PASS.loop,flags});
 assert.ok(optional.grants.includes('chapel-key'),'voluntary outgoing calls remain available');
});

test('main releases the loop when pickup connects, before its conversation finishes',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const open=main.indexOf('function openPayphone('),begin=main.indexOf('    onCall:(outcome,',open),end=main.indexOf('\n    onClose:',begin);
  assert.ok(open>0&&begin>open&&end>begin);
  const flags=new Set(),conversation={update(){},view:()=>({pending:null}),key(){}};
  const sandbox={payphoneCall:null,flagApply:keys=>keys.forEach(key=>flags.add(key)),saveCommit(){},getSave:()=>({flags:Object.fromEntries([...flags].map(key=>[key,true]))}),
    runtimeTree:()=>({}),converse:()=>conversation,payphoneCue(){},autoplayPayphoneCall(){},actx:null,payphoneLine:null,payphoneScene:null,dialogGain:null,master:null};
  vm.createContext(sandbox);vm.runInContext(`globalThis.onCall=({${main.slice(begin,end)}}).onCall;`,sandbox);
  sandbox.onCall(payphoneIncoming({pass:PAYPHONE_PASS.loop}),{incoming:true,callEnded(){}});
  assert.equal(flags.has('phone.loop.broken'),true);
  assert.equal(sandbox.payphoneCall.over,false,'the test must observe pickup before the call ends');
  assert.equal(payphoneLoopHolds({pass:PAYPHONE_PASS.loop,flags:Object.fromEntries([...flags].map(key=>[key,true]))}),false);
});

test('incoming playback waits for full text and voice, then continues its authored lines automatically',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const begin=main.indexOf('function autoplayPayphoneCall('),end=main.indexOf('\nfunction grantChapelKeyByPhone',begin);
  assert.ok(begin>0&&end>begin);
  const sandbox={};vm.createContext(sandbox);vm.runInContext(main.slice(begin,end)+';globalThis.autoplay=autoplayPayphoneCall;',sandbox);
  let updates=0,presses=0;
  const view={line:{text:'Please hold.'},lineSerial:1,typing:true,voice:null,pending:null};
  const scene={update:()=>updates++,view:()=>view,key:event=>{assert.equal(event.key,'Enter');presses++;}};
  sandbox.autoplay(scene);scene.update(10);assert.equal(presses,0);
  view.typing=false;view.voice={};scene.update(10);assert.equal(presses,0);
  view.voice=null;scene.update(.4);scene.update(.4);assert.equal(presses,0);
  scene.update(.2);assert.equal(presses,1);
  view.pending={kind:'say'};scene.update(.1);assert.equal(presses,2,'a fixed authored reply still demanded another input');
  view.pending={kind:'branch'};scene.update(10);assert.equal(presses,2,'an optional choice was silently made');
  assert.equal(updates,7);
});

test('the runtime holds movement during recording and allows the same step after completion',()=>{
  const built=buildPreTapeGodPreset(2210,{seed:4417,marbleEyes:'returned'});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  const {x,y}=built.position;runtime.setPlayerPosition(built.position);
  assert.equal(runtime.geometry.canStep(x,y,x,y-1).ok,true);
  runtime.setLastLightHold(true);
  assert.equal(runtime.geometry.canStep(x,y,x,y-1).why,'last-light recording');
  runtime.setLastLightOut(true);runtime.setLastLightHold(false);
  assert.equal(runtime.geometry.canStep(x,y,x,y-1).ok,true);
});
