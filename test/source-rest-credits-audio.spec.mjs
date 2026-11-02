import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCreditsScene, END_CREDITS_CLOSING_HOLD } from '../src/game/credits.js';
const pages = Array.from({length:8},(_,i)=>({heading:`Section ${i}`,lines:[`Creator ${i} a`,`Creator ${i} b`,`Creator ${i} c`]}));
const press=(scene,event)=>{scene.key(event);scene.keyup(event);};
const advance=(scene,state,limit=500)=>{for(let i=0;i<limit*10&&!scene.view().done;i++){state.time+=.1;scene.update(.1);}};

test('Source rest credits never start or release another soundtrack, including skip',()=>{
  const calls=[];let done=0,quote=0,black=0;
  const scene=makeCreditsScene({context:'ending',suppressSoundtrack:true,soundtrack:{startSoundtrack:()=>calls.push('start'),fadeSoundtrack:()=>calls.push('fade')},onDone:()=>done++,onQuote:()=>quote++,onBlack:()=>black++});
  scene.enter();press(scene,{key:'Escape'});scene.exit();assert.deepEqual(calls,[]);assert.equal(done,1);assert.equal(quote,1);assert.equal(black,1);
});

test('ordinary credits retain their existing soundtrack contract',()=>{
  const calls=[];const scene=makeCreditsScene({soundtrack:{startSoundtrack:a=>calls.push(['start',a]),fadeSoundtrack:a=>calls.push(['fade',a])}});
  scene.enter();scene.exit();assert.deepEqual(calls,[['start',{track:'credits',fade:2.2}],['fade',{fade:3.2}]]);
});

test('quiet programme follows actual media to black without a quotation or replacement sound',()=>{
  const state={time:0};const duration=120,phases=new Set();
  const scene=makeCreditsScene({credits:pages,context:'ending',quietEnding:true,suppressSoundtrack:true,
    getMusicPosition:()=>({currentTime:state.time,duration,playing:state.time<duration,ended:state.time>=duration})});
  for(let i=0;i<1400&&!scene.view().done;i++){state.time+=.1;scene.update(.1);phases.add(scene.view().phase);}
  assert.equal(scene.view().done,true);assert.ok(Math.abs(state.time-duration)<.6,`finished ${state.time}`);assert.equal(phases.has('quote'),false);
});

test('retained ordinary performance reserves quote and black at its actual end',()=>{
  const state={time:20},calls=[];const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',suppressSoundtrack:true,
    getMusicPosition:()=>({currentTime:state.time,duration,playing:state.time<duration,ended:state.time>=duration}),
    onQuote:()=>calls.push(['quote',state.time]),onBlack:()=>calls.push(['black',state.time]),onDone:()=>calls.push(['done',state.time])});
  advance(scene,state,130);assert.equal(scene.view().done,true);assert.deepEqual(calls.map(c=>c[0]),['quote','black','done']);
  assert.ok(Math.abs(state.time-duration)<.7,`finished ${state.time}`);assert.ok(calls[0][1]>=106&&calls[0][1]<=108);
});

test('manual pause and source-record inspection do not stop or restart media',()=>{
  const state={time:0},sounds=[];const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',suppressSoundtrack:true,
    soundtrack:{startSoundtrack:()=>sounds.push('start'),fadeSoundtrack:()=>sounds.push('fade')},
    getMusicPosition:()=>({currentTime:state.time,duration,playing:state.time<duration,ended:state.time>=duration})});
  scene.enter();state.time=10;scene.update(10);press(scene,{key:'ArrowRight'});const before=scene.view();
  state.time=20;scene.update(10);assert.equal(scene.view().cardElapsed,before.cardElapsed);assert.equal(scene.view().paused,true);
  press(scene,{key:'r'});state.time=30;scene.update(10);assert.equal(scene.view().phase,'record');assert.equal(scene.view().elapsed,before.elapsed);
  press(scene,{key:'Escape'});press(scene,{code:'Space'});advance(scene,state,200);assert.equal(scene.view().done,true);
  scene.exit();assert.deepEqual(sounds,[]);
});

test('late media cannot truncate a name card or manufacture a quote over unread credits',()=>{
  const state={time:116},duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',getMusicPosition:()=>({currentTime:Math.min(state.time,duration),duration,playing:state.time<duration,ended:state.time>=duration})});
  const seen=new Map();let previous=null,realHold=0;
  for(let i=0;i<2000&&!scene.view().done;i++){
    const view=scene.view();if(view.phase==='card'){
      if(previous!==view.card){if(previous!==null)seen.set(previous,realHold);previous=view.card;realHold=0;}realHold+=.1;
    }
    state.time+=.1;scene.update(.1);
  }
  assert.ok(state.time>duration+30);assert.equal(scene.view().done,true);
  assert.ok([...seen.values()].every(seconds=>seconds>=5.4),'no remaining creator card is sped below its minimum');
});

test('full canonical quiet programme remains complete after normal or late media completion',()=>{
  for(const start of [520,585.25]){
    const state={time:start},duration=716.397868,sounds=[],seen=new Set();
    const scene=makeCreditsScene({context:'ending',quietEnding:true,suppressSoundtrack:true,initialCols:151,initialRows:45,
      soundtrack:{startSoundtrack:()=>sounds.push('start'),fadeSoundtrack:()=>sounds.push('fade')},
      getMusicPosition:()=>({currentTime:Math.min(state.time,duration),duration,playing:state.time<duration,ended:state.time>=duration})});
    scene.enter();for(let i=0;i<6000&&!scene.view().done;i++){
      const view=scene.view();assert.notEqual(view.phase,'quote');if(view.phase==='card')seen.add(view.card);
      state.time+=.1;scene.update(.1);
    }
    assert.equal(scene.view().done,true);assert.equal(seen.size,scene.view().cards);assert.equal(scene.view().sourceLines,252);
    scene.exit();assert.deepEqual(sounds,[]);
  }
});

test('failed, paused or missing media cannot impersonate natural completion',()=>{
  for(const state of [null,{currentTime:40,duration:120,playing:false,failed:'unavailable'},{currentTime:40,duration:120,playing:false,paused:true},{currentTime:null,duration:120,playing:true}]){
    const base=makeCreditsScene({credits:pages,context:'ending'}),other=makeCreditsScene({credits:pages,context:'ending',getMusicPosition:()=>state});
    base.update(10);other.update(10);assert.equal(other.view().card,base.view().card);assert.equal(other.view().cardDuration,base.view().cardDuration);
  }
});

test('lifecycle hold freezes programme and quote without catch-up, preserves manual pause',()=>{
  let held=false;const scene=makeCreditsScene({credits:pages,context:'ending',quietEnding:true,suppressSoundtrack:true,getPresentationHeld:()=>held});
  scene.update(10);const before=scene.view();held=true;scene.update(100);assert.deepEqual(scene.view(),before);
  held=false;scene.update(.1);assert.ok(Math.abs(scene.view().elapsed-before.elapsed-.1)<1e-7);
  press(scene,{code:'Space'});const paused=scene.view();held=true;scene.update(100);held=false;scene.update(.1);assert.deepEqual(scene.view(),paused);
  const ordinary=makeCreditsScene({context:'ending',getPresentationHeld:()=>true});ordinary.update(10);assert.equal(ordinary.view().elapsed,0,'all explicit host holds are honoured');
});

test('End is a deliberate short path to quote and once-only callbacks rather than a media wait',()=>{
  const calls=[];const scene=makeCreditsScene({credits:pages,context:'ending',getMusicPosition:()=>({currentTime:20,duration:787,playing:true}),onQuote:()=>calls.push('quote'),onBlack:()=>calls.push('black'),onDone:()=>calls.push('done')});
  press(scene,{key:'End'});press(scene,{code:'Space'});scene.update(END_CREDITS_CLOSING_HOLD+.01);assert.equal(scene.view().phase,'quote');
  press(scene,{key:'Escape'});scene.update(100);assert.deepEqual(calls,['quote','black','done']);
});
