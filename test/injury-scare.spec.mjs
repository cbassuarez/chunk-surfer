import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createInjuryScareGate} from '../src/game/injury-scare.js';
import {recoveryOutcomeReceipt} from '../src/game/recovery-outcome.js';

test('a lasting injury requires an actually authorized scare event',()=>{
  let injuries=0;const gate=createInjuryScareGate({injure:()=>++injuries});
  assert.equal(gate.authorize({eventId:'quiet',kind:'contact',started:false}),null);
  assert.equal(gate.commit(null),null);assert.equal(gate.commit({eventId:'invented'}),null);
  assert.equal(injuries,0);
  const receipt=gate.authorize({eventId:'real',kind:'contact',started:true});
  assert.equal(gate.commit({...receipt}),null,'copying visible metadata does not manufacture authority');
  assert.equal(gate.commit(receipt),1);assert.equal(gate.commit(receipt),null);
  assert.equal(injuries,1,'one scare cannot apply a second lasting wound');
});
test('defeat and contact have separate receipts, retired across run changes',()=>{
  let count=0;const gate=createInjuryScareGate({injure:()=>++count});
  const defeat=gate.authorize({eventId:'loss',kind:'defeat',started:true});
  gate.reset();assert.equal(gate.commit(defeat),null);
  const contact=gate.authorize({eventId:'next-run',kind:'contact',started:true});
  assert.equal(gate.commit(contact),1);
});
test('defeat authorization waits for a decoded frame actually drawn while active',()=>{
  const source=readFileSync(new URL('../src/game/death-scene.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('export function makeDeathScene(')).replace('export function','function');
  const snapshot={naturalWidth:0,naturalHeight:0},gradient={addColorStop(){}},ctx={
    canvas:{width:640,height:360},save(){},restore(){},drawImage(){},fillRect(){},createLinearGradient:()=>gradient,
  };
  let suspended=false,injuries=0,draws=0;
  const gate=createInjuryScareGate({injure:()=>++injuries});let receipt=null;
  const context={uiSize:()=>({cols:80,rows:18}),uiFill(){},uiDraw:fn=>fn({ctx}),drawVfdText(){},
    deathFrameState:()=>({imageAlpha:1,scale:1,seamAmount:0,veil:0}),
    snapshot,isSuspended:()=>suspended,onPresented:()=>{draws++;receipt=gate.authorize({eventId:'drawn',kind:'defeat',started:true});}};
  vm.createContext(context);vm.runInContext(fn+'\nvar scene=makeDeathScene({snapshot,isSuspended,onPresented});',context);
  context.scene.render();assert.equal(gate.commit(receipt),null,'an unloaded image cannot authorize injury');
  snapshot.naturalWidth=640;snapshot.naturalHeight=360;suspended=true;
  context.scene.render();assert.equal(gate.commit(receipt),null,'a suspended presentation cannot authorize injury');
  suspended=false;context.scene.render();assert.equal(gate.commit(receipt),1);
  context.scene.render();assert.equal(gate.commit(receipt),null);assert.equal(draws,1);assert.equal(injuries,1);
});
test('real taking adapter starts its scare before committing its injury, and unavailable model cannot hurt',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function beginTaken(){'),source.indexOf('\nfunction wakeUp('));
  const calls=[],gate=createInjuryScareGate({injure:()=>{calls.push('injure');return 1;}});
  let ready=false;
  const context={R3:{r3dHushBodyStatus:()=>({ready})},lastExposureAnchor:()=>({x:1,y:1}),
    getSave:()=>({run:{id:'r'}}),currentWorld:()=> 'main_b3',REC:{isRecording:()=>false},
    PRES:{presenceState:()=>({x:1,y:1})},causalRecorder:{recordAnchor(){},noteInjuries(){}},
    FEAR:{setFear(){}},injuryScareGate:gate,recoveryOutcomeReceipt,wakeUp(){},
    makeHushContactSequenceScene:()=>({enter(){calls.push('scare');context.lastContactInjuryScare=gate.authorize({eventId:'contact',kind:'contact',started:true});}}),
    scenes:{push:s=>s.enter(),remove(){}}};
  vm.createContext(context);vm.runInContext(fn,context);
  assert.equal(context.beginTaken(),false);assert.deepEqual(calls,[]);
  ready=true;assert.equal(context.beginTaken(),true);assert.deepEqual(calls,['scare','injure']);
});
test('distant spoiled takes cannot silently injure and the independent fight callback cannot double-injure',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const spoil=source.slice(source.indexOf('function onTakeBroken('),source.indexOf('const pick =',source.indexOf('function onTakeBroken(')));
  assert.ok(!spoil.includes('REC.injure(')&&!spoil.includes('injuryScareGate.commit('));
  assert.ok(spoil.includes('onPresenceCatch('),'near contact still goes through its physical scare owner');
  const independent=source.slice(source.indexOf('function maybeIndependentBattle('),source.indexOf('// ── THE POOL COMES FOR YOU'));
  assert.ok(!independent.includes('REC.injure(')&&!independent.includes('injuryScareGate.commit('));
});
