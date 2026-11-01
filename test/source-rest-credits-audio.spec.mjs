import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreditsScene,creditRollLayout,END_CREDITS_OPENING_DURATION,END_CREDITS_CLOSING_HOLD} from '../src/game/credits.js';

test('Source rest credits leave the existing music owner untouched, including when skipped',()=>{
  const calls=[];let done=0,quote=0,black=0;
  const soundtrack={startSoundtrack:()=>calls.push('start'),fadeSoundtrack:()=>calls.push('fade')};
  const scene=makeCreditsScene({context:'ending',suppressSoundtrack:true,soundtrack,
    onDone:()=>done++,onQuote:()=>quote++,onBlack:()=>black++});
  scene.enter();scene.key({key:'Escape'});scene.exit();
  assert.deepEqual(calls,[]);assert.equal(done,1);assert.equal(quote,1);assert.equal(black,1);
});

test('ordinary credits still start and release their own soundtrack by default',()=>{
  const calls=[],soundtrack={startSoundtrack:args=>calls.push(['start',args]),fadeSoundtrack:args=>calls.push(['fade',args])};
  const scene=makeCreditsScene({soundtrack});scene.enter();scene.exit();
  assert.deepEqual(calls,[['start',{track:'credits',fade:2.2}],['fade',{fade:3.2}]]);
});

const pages=Array.from({length:8},(_,i)=>({heading:`Section ${i}`,lines:[`Item ${i} a`,`Item ${i} b`,`Item ${i} c`]}));
test('the quiet ending finishes on black without presenting the ordinary quotation',()=>{
  let time=0,done=0;const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',quietEnding:true,suppressSoundtrack:true,
    getMusicPosition:()=>({currentTime:time,duration,playing:time<duration}),onDone:()=>done++});
  while(!done&&time<duration+30){time+=.2;scene.update(.2);assert.notEqual(scene.view().phase,'quote');}
  assert.equal(done,1);assert.ok(Math.abs(time-duration)<.5,`quiet roll uses the actual passage, finishing at ${time} without an unused quote budget`);
});
test('an ending roll follows the live performance and reaches black at its end',()=>{
  let time=20,completed=0,quoteAt=null,blackAt=null;const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',suppressSoundtrack:true,initialCols:80,initialRows:30,
    getMusicPosition:()=>({currentTime:time,duration,playing:time<duration}),
    onQuote:()=>{quoteAt=time;},onBlack:()=>{blackAt=time;},onDone:()=>{completed++;}});
  while(!completed&&time<duration+4){time+=.2;scene.update(.2);}
  assert.equal(completed,1);assert.ok(Math.abs(time-duration)<.6,`finished at ${time}`);
  assert.ok(quoteAt>=duration-14&&quoteAt<=duration-12,`quote at ${quoteAt}`);
  assert.ok(blackAt>=duration-2.1&&blackAt<=duration,`black at ${blackAt}`);
});

test('pausing and scrolling do not stop music, and the resumed roll adapts to the remaining passage',()=>{
  let time=0,done=0;const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',initialCols:80,initialRows:30,
    getMusicPosition:()=>({currentTime:time,duration,playing:time<duration}),onDone:()=>{done++;}});
  for(let i=0;i<100;i++){time+=.1;scene.update(.1);}
  scene.key({key:'ArrowDown'});const held=scene.view().scroll;
  for(let i=0;i<100;i++){time+=.1;scene.update(.1);}
  assert.equal(scene.view().scroll,held,'manual navigation pauses the roll');
  scene.key({code:'Space'});scene.keyup({code:'Space'});
  while(!done&&time<duration+3){time+=.1;scene.update(.1);}
  assert.equal(done,1);assert.ok(Math.abs(time-duration)<.5,`finished at ${time}`);
});

test('unavailable or ended music uses the ordinary roll, and End/Escape remain deliberate exits',()=>{
  const base=makeCreditsScene({credits:pages,context:'ending'}),unavailable=makeCreditsScene({credits:pages,context:'ending',
    getMusicPosition:()=>({currentTime:null,duration:120,playing:true})});
  for(let i=0;i<100;i++){base.update(.1);unavailable.update(.1);}
  assert.equal(base.view().scroll,unavailable.view().scroll);
  let done=0;const scene=makeCreditsScene({credits:pages,context:'ending',getMusicPosition:()=>({currentTime:20,duration:787,playing:true}),onDone:()=>done++});
  scene.key({key:'End'});scene.key({code:'Space'});scene.update(4.01);
  assert.equal(scene.view().phase,'quote','End does not make the player wait for the entire recording');
  scene.key({key:'Escape'});assert.equal(done,1);
});

test('a late arrival keeps the roll legible even when the performance must end first',()=>{
  let time=116;const duration=120;
  const scene=makeCreditsScene({credits:pages,context:'ending',initialCols:80,initialRows:30,
    getMusicPosition:()=>({currentTime:time,duration,playing:time<duration})});
  for(let i=0;i<80;i++){
    const before=scene.view().scroll;time+=.1;scene.update(.1);
    assert.ok(scene.view().scroll-before<=.25000001,'roll never exceeds 2.5 rows per second');
  }
  assert.ok(time>duration,'the recording ends naturally');assert.notEqual(scene.view().phase,'quote','remaining credits are still readable');
});

test('the full production quiet roll stays readable after normal and late media completion without restarting the score',()=>{
  const duration=716.397868,layout=creditRollLayout({cols:151,rows:45});
  for(const start of [520,585.25]){
    let time=start,done=0,black=0,afterEnd=0;const sounds=[];
    const scene=makeCreditsScene({context:'ending',quietEnding:true,suppressSoundtrack:true,initialCols:151,initialRows:45,
      soundtrack:{startSoundtrack:()=>sounds.push('start'),fadeSoundtrack:()=>sounds.push('fade')},
      getMusicPosition:()=>({currentTime:Math.min(time,duration),duration,playing:time<duration,ended:time>=duration}),
      onDone:()=>done++,onBlack:()=>black++});
    scene.enter();
    while(!done&&time<start+300){
      const before=scene.view().scroll;time+=.1;scene.update(.1);const delta=scene.view().scroll-before;
      assert.ok(delta<=.25000001,'even an ending deadline cannot accelerate beyond the readable cap');
      assert.notEqual(scene.view().phase,'quote');
      if(time>duration+.2&&scene.view().phase==='roll'){
        afterEnd++;assert.ok(delta>.2499,'natural completion retains the last fitted cadence instead of prolonging dead static');
      }
    }
    assert.equal(done,1);assert.equal(black,1);assert.ok(afterEnd>0);assert.ok(time>duration,'readability takes priority over truncating the full credits');
    const fastest=END_CREDITS_OPENING_DURATION+layout.maxScroll/2.5+END_CREDITS_CLOSING_HOLD;
    assert.ok(Math.abs(time-start-fastest)<.3,`full roll completes in its readable budget, not an added ordinary-speed tail: ${time-start}`);
    scene.exit();assert.deepEqual(sounds,[],'the retained performance is never replaced or restarted');
  }
});

test('failed or unavailable quiet-ending audio cannot impersonate a naturally completed retained performance',()=>{
  for(const replacement of [null,{currentTime:40,duration:120,playing:false,failed:'unavailable'},{currentTime:40,duration:120,playing:false,paused:true}]){
    let music={currentTime:20,duration:120,playing:true};
    const scene=makeCreditsScene({credits:pages,context:'ending',quietEnding:true,suppressSoundtrack:true,getMusicPosition:()=>music});
    scene.update(10);music=replacement;const before=scene.view().scroll;scene.update(.1);
    assert.ok(Math.abs(scene.view().scroll-before-.072)<1e-7,'only verified media end retains its fitted cadence');
  }
});

test('quiet ending presentation freezes through a real lifecycle hold and resumes without catching up',()=>{
  let held=false,time=520,done=0;
  const scene=makeCreditsScene({context:'ending',quietEnding:true,suppressSoundtrack:true,initialCols:151,initialRows:45,
    getMusicPosition:()=>({currentTime:time,duration:716.397868,playing:!held,paused:held}),
    getPresentationHeld:()=>held,onDone:()=>done++});
  for(let i=0;i<100;i++){time+=.1;scene.update(.1);}
  const before=scene.view();held=true;
  for(let i=0;i<100;i++)scene.update(1);
  assert.deepEqual(scene.view(),before,'elapsed, scrolling and closing hold do not advance behind an unfocused window');
  held=false;time+=.1;scene.update(.1);const resumed=scene.view();
  assert.ok(Math.abs(resumed.elapsed-before.elapsed-.1)<1e-7);
  assert.ok(resumed.scroll>before.scroll&&resumed.scroll-before.scroll<=.25000001);assert.equal(done,0);
  scene.key({code:'Space'});scene.keyup({code:'Space'});const manuallyPaused=scene.view();
  held=true;scene.update(60);held=false;scene.update(.1);
  assert.equal(scene.view().paused,true);assert.equal(scene.view().scroll,manuallyPaused.scroll,'a lifecycle return cannot revoke a deliberate pause');
  const ordinary=makeCreditsScene({context:'ending',getPresentationHeld:()=>true});ordinary.update(5);
  assert.equal(ordinary.view().elapsed,5,'ordinary credits retain their existing presentation clock');
});
