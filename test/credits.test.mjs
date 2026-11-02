import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { uiWithLayoutSize, uiWrap } from '../src/render/ui.js';
import { shouldOpenPauseForEvent } from '../src/game/pause.js';
import { CREDITS } from '../src/data/credits.js';
import { createCreditProgram, creditRecordPages, creditRecognitionCards, creditCardMinimumSeconds, isCreditRecognitionLine, CREDIT_PROGRAM_BLACK_HOLD } from '../src/game/credit-program.js';
import { CLOSING_QUOTE, END_CREDITS_CLOSING_HOLD, END_CREDITS_OPENING_DURATION,
  closingQuoteAlpha, closingQuoteBlock, makeCreditsScene } from '../src/game/credits.js';
import * as CREDIT_RENDER from '../src/render/credit-signal.js';
import { creditSignalLayout, creditRecordLayout } from '../src/render/credit-signal.js';
const fixture = Array.from({ length: 8 }, (_, i) => ({ heading: `Section ${i + 1}`, lines: [`Person ${i} A`, `Person ${i} B`, `Person ${i} C`] }));
const press = (scene, event) => { scene.key(event); scene.keyup(event); };

test('programme recognises all actual credited creators without promoting process notes', () => {
  const expected = {0:[0],1:[0,1,2,3,4,5,6,7,8],2:[0,1,2,3,4],3:[0,1],4:[0,4],5:[0],6:[0,1,2,3,4,5,6,7,8,9,13],7:[0,1,2,3,4,5],8:[1,2,5,8],9:[0,2,6],10:[0],11:[0,1,2,3,4,5,6,7,8,9,10],12:[0,4,8,12,16,20,24,28],13:[0,4,8,12,16,20,24,28,32,36,40,44],14:[0,4],15:[0,3,6,9,12,15],16:[0],17:[0,4,8,12,16],18:[0,4,8]};
  const cards = creditRecognitionCards();
  for (const [section, indices] of Object.entries(expected)) for (const line of indices)
    assert.ok(cards.some(card => card.sectionIndex === Number(section) && card.sourceLineIndices.includes(line)), `section ${section} line ${line} recognised`);
  const all = cards.flatMap(card => card.lines).join('\n');
  for (const name of ['Kristen Browne', 'Triplegangers', 'Dr. W.E. Burr', 'William Heise', 'Walter Murch', 'Sean Cullen', 'Lucy Hattemer', 'Kipp Teague', 'Victor Eijkhout', 'Paul Yorke'])
    assert.ok(all.toLowerCase().includes(name.toLowerCase()), name);
  assert.equal(isCreditRecognitionLine('Adapted: excerpts and downmix'), false);
  assert.equal(isCreditRecognitionLine('https://creativecommons.org/licenses/by/4.0/'), false);
  assert.ok(cards.some(card => card.label === 'Website'));
  assert.ok(cards.some(card => card.label === 'Copyright'));
});

test('complete source record preserves every canonical line and source identity', () => {
  const sections = creditRecordPages({ capacity: 3, wrapLine: value => value.match(/.{1,17}/gu) || [''] });
  assert.equal(sections.length, CREDITS.length);
  assert.equal(sections.reduce((sum, section) => sum + section.sourceLines.length, 0), 252);
  sections.forEach((section, index) => {
    assert.deepEqual(section.sourceLines, [...CREDITS[index].lines]);
    for (const [lineIndex, text] of section.sourceLines.entries()) {
      const fragments = section.pages.flatMap(page => page.fragments).filter(part => part.sourceLineIndex === lineIndex);
      assert.equal(fragments.map(part => part.text).join(''), text);
      assert.ok(fragments.every(part => part.sourceText === text));
    }
    assert.ok(section.pages.every(page => page.lines.length <= 3));
  });
});

test('fixed cards have a readable minimum, and small viewports add pages instead of clipping', () => {
  for (const size of [{cols:38,rows:20},{cols:80,rows:30},{cols:151,rows:45}]) {
    const scene = makeCreditsScene({ ...{initialCols:size.cols,initialRows:size.rows} });
    press(scene,{key:'Home'});
    for (let i = 0; i < scene.view().cards; i++) {
      const item = scene.view().content;
      const layout = creditSignalLayout({...size,label:item.label,lines:item.lines,kind:item.kind});
      assert.ok(layout.fits, `${size.cols} x ${size.rows}: ${item.label}`);
      assert.ok(scene.view().cardDuration >= creditCardMinimumSeconds(item));
      for (const run of layout.runs) assert.ok(run.x >= 0 && run.y >= 0);
      press(scene,{key:'ArrowRight'});
    }
  }
  const compact = makeCreditsScene({initialCols:38,initialRows:20});
  const wide = makeCreditsScene({initialCols:151,initialRows:45});
  assert.ok(compact.view().cards > wide.view().cards);
  assert.ok(createCreditProgram({ credits: fixture }).totalSeconds >= 196.008 - 1e-7);
});

test('menu fixed-card controls pause, navigate, inspect and require deliberate website focus', () => {
  let website = 0, done = 0;
  const scene = makeCreditsScene({credits:fixture,onWebsite:()=>website++,onDone:()=>done++});
  assert.equal(scene.view().phase,'opening');
  scene.update(END_CREDITS_OPENING_DURATION+.2);
  assert.equal(scene.view().phase,'card');
  press(scene,{key:'Enter'}); assert.equal(website,0); assert.equal(scene.view().paused,true);
  press(scene,{key:'ArrowRight'}); assert.equal(scene.view().card,1);
  const before = scene.view().cardElapsed; scene.update(100); assert.equal(scene.view().cardElapsed,before);
  press(scene,{key:'r'}); assert.equal(scene.view().phase,'record');
  const record = scene.view(); scene.update(100); assert.equal(scene.view().elapsed,record.elapsed);
  press(scene,{key:'PageDown'}); assert.equal(scene.view().section,record.section+1);
  press(scene,{key:'Escape'}); assert.equal(scene.view().phase,'card'); assert.equal(done,0);
  // Return from RECORD focuses RECORD. The next explicit focus is WEBSITE.
  press(scene,{key:'Tab'}); assert.equal(scene.view().focus,'website');
  press(scene,{key:'Enter'}); assert.equal(website,1);
  press(scene,{key:'Escape'}); assert.equal(done,1);
  press(scene,{key:'Escape'}); assert.equal(done,1);
});

test('held confirms cannot accidentally open a site or issue repeated callbacks', () => {
  let websites=0,done=0;const scene=makeCreditsScene({onWebsite:()=>websites++,onDone:()=>done++});
  scene.key({key:'Enter',repeat:true});assert.equal(scene.view().paused,false);
  scene.key({key:'Escape',repeat:true});assert.equal(done,0);
  press(scene,{key:'Escape'});press(scene,{key:'Escape'});assert.equal(done,1);assert.equal(websites,0);
});

test('Escape reaches credit scene before global pause and finishes once',()=>{
  let completed=0,blacked=0,pauses=0;const scene=makeCreditsScene({context:'ending',onDone:()=>completed++,onBlack:()=>blacked++});
  for(const event of [{key:'Escape'},{code:'Escape'}]){
    if(shouldOpenPauseForEvent({storyMode:true,...event,topSceneId:scene.id,localEscape:scene.handlesEscape}))pauses++;
    else scene.key(event);
  }
  assert.equal(pauses,0);assert.equal(completed,1);assert.equal(blacked,1);
});

test('ending closes with pausable Butler quote, then held black, with exactly-once ordered handoff',()=>{
  const calls=[];const scene=makeCreditsScene({credits:fixture,context:'ending',onQuote:()=>calls.push('quote'),onBlack:()=>calls.push('black'),onDone:()=>calls.push('done')});
  press(scene,{key:'End'});press(scene,{code:'Space'});scene.update(END_CREDITS_CLOSING_HOLD);
  assert.equal(scene.view().phase,'quote');assert.deepEqual(calls,['quote']);
  press(scene,{code:'Space'});const elapsed=scene.view().elapsed;scene.update(100);assert.equal(scene.view().elapsed,elapsed);
  press(scene,{code:'Space'});scene.update(CLOSING_QUOTE.fadeIn+CLOSING_QUOTE.hold+CLOSING_QUOTE.fadeOut);
  assert.equal(scene.view().phase,'black');assert.deepEqual(calls,['quote','black']);
  scene.update(1.6);assert.deepEqual(calls,['quote','black','done']);scene.update(100);assert.equal(calls.length,3);
});

test('closing quote uses whole-word wrapping and fades to true black',()=>{
  assert.equal(closingQuoteAlpha(0),0);assert.equal(closingQuoteAlpha(CLOSING_QUOTE.fadeIn),1);
  assert.equal(closingQuoteAlpha(CLOSING_QUOTE.fadeIn+CLOSING_QUOTE.hold+CLOSING_QUOTE.fadeOut),0);
  for(const width of [24,46])for(const line of closingQuoteBlock(width).lines)assert.ok(line.length<=width);
});
test('pointer controls activate on a matched release, with exact visible picking and black-frame silence',()=>{
  let website=0;const scene=makeCreditsScene({context:'ending',onWebsite:()=>website++});
  uiWithLayoutSize({cols:114,rows:30},()=>scene.render());
  const hit=scene.view().hitRegions.find(item=>item.id==='website');assert.ok(hit);
  const x=hit.x+hit.w/2,y=hit.y+hit.h/2;
  scene.pointer({type:'pointerdown',cellX:x,cellY:y});assert.equal(website,0);
  scene.pointer({type:'pointerup',cellX:0,cellY:0});assert.equal(website,0);
  scene.pointer({type:'pointerdown',cellX:x,cellY:y});scene.pointer({type:'pointerup',cellX:x,cellY:y});assert.equal(website,1);assert.equal(scene.view().paused,true,'external navigation freezes the current reading place');
  press(scene,{key:'End'});press(scene,{code:'Space'});scene.update(END_CREDITS_CLOSING_HOLD+11.8);
  assert.equal(scene.view().phase,'black');uiWithLayoutSize({cols:114,rows:30},()=>scene.render());assert.deepEqual(scene.view().hitRegions,[]);
});

test('actual resize restarts the current readable hold and preserves source-line anchors',()=>{
  const scene=makeCreditsScene({initialCols:114,initialRows:30});
  press(scene,{key:'Home'});press(scene,{code:'Space'});scene.update(3);
  const before=scene.view();assert.ok(before.cardElapsed>0);
  scene.resize(80,30);const resized=scene.view();
  assert.equal(resized.content.sectionIndex,before.content.sectionIndex);assert.equal(resized.cardElapsed,0);
  assert.ok(resized.cardDuration>=creditCardMinimumSeconds(resized.content));
  scene.update(.5);const unchanged=scene.view();scene.resize(80,30);assert.deepEqual(scene.view(),unchanged,'a repeated same-size render cannot reset the hold');
  press(scene,{key:'r'});press(scene,{key:'PageDown'});press(scene,{key:'ArrowRight'});
  const anchor=scene.view().content.fragments[0];scene.resize(38,20);
  assert.ok(scene.view().content.fragments.some(part=>part.sourceLineIndex===anchor.sourceLineIndex),'record resizing retains the current original source line');
});

test('actual scene renders manually selected and paused zero-fade cards at full readable light',()=>{
  const calls=[];
  const source=readFileSync('src/game/credits.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const factory=runInNewContext(source+'\nmakeCreditsScene;',{
    uiSize:()=>({cols:80,rows:30}),uiCellMetrics:()=>({cellW:8.45,cellH:20}),uiWrap,CREDITS,
    ...CREDIT_RENDER,renderCreditSignal:payload=>{calls.push(payload);return{};},renderCreditSignalControls:()=>[],
    createCreditProgram,creditRecordPages,CREDIT_PROGRAM_BLACK_HOLD,AUDIO:{},
  });
  const scene=factory({credits:fixture,context:'ending'});
  press(scene,{key:'Home'});scene.render();assert.equal(calls.at(-1).alpha,1,'manual Home is readable at time zero');
  press(scene,{key:'ArrowRight'});scene.render();assert.equal(calls.at(-1).alpha,1,'manual arrow is readable at time zero');
  press(scene,{code:'Space'});scene.render();assert.equal(calls.at(-1).alpha,0,'natural unpaused entrance retains its fade');
  scene.update(.325);scene.render();assert.ok(calls.at(-1).alpha>0&&calls.at(-1).alpha<1,'natural entrance interpolates');
  press(scene,{key:'End'});press(scene,{code:'Space'});scene.update(END_CREDITS_CLOSING_HOLD);
  assert.equal(scene.view().phase,'quote');scene.render();assert.equal(calls.at(-1).alpha,0,'unpaused quotation starts from black');
  press(scene,{code:'Space'});scene.render();assert.equal(calls.at(-1).alpha,1,'pausing the quotation at fade zero exposes its complete text');
});

test('ending routing places cinematic credits between the epilogue and return report', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const epilogueStart = source.indexOf('presentFinale(guardEpilogue(variant),');
  const epilogueEnd = source.indexOf('\n  });', epilogueStart);
  assert.ok(epilogueStart >= 0 && epilogueEnd > epilogueStart, 'the ending presents its gate epilogue');
  const callback = source.slice(epilogueStart, epilogueEnd).match(/onDone:\(\)=>\{([^]*?)\},/);
  assert.ok(callback, 'the epilogue supplies a completion callback');
  for (const hasPlayback of [true, false]) {
    const calls = [], summary = { ending: 'tower-won' };
    let api;
    api = new Function('summary', 'openEndingCredits', 'initialPlayback', `
      let towerEndingPlayback=initialPlayback;
      const onDone=()=>{${callback[1]}};
      return {onDone,playback:()=>towerEndingPlayback};
    `)(summary, (actualSummary) => {
      assert.equal(actualSummary, summary);
      assert.equal(api.playback(), null, 'the ended recording is released before credits open');
      calls.push('credits');
    }, hasPlayback ? { stop() { calls.push('stop'); } } : null);
    api.onDone();
    assert.deepEqual(calls, hasPlayback ? ['stop', 'credits'] : ['credits']);
  }
  const creditsStart=source.indexOf('function openEndingCredits('),creditsEnd=source.indexOf('\nasync function revealFieldReturn(',creditsStart);
  assert.ok(creditsStart>=0&&creditsEnd>creditsStart,'the production ending-credit host is present');
  const summary={ending:'tower-won'},reported=[];let credits=null;
  runInNewContext(source.slice(creditsStart,creditsEnd)+'\nopenEndingCredits(summary);',{
    summary,ensureCtx(){},emitProgress(){},EVENT_TYPES:{CREDITS_VIEWED:'credits-viewed'},
    presentCredits(options){credits=options;},showReturnReport(value){reported.push(value);},
    scenes:{push(){assert.fail('an ordinary ending must not enter the Source rest final black');}},
  });
  assert.ok(credits);assert.equal(credits.context,'ending');assert.equal(credits.sourceRestBlack,false);
  assert.deepEqual(reported,[],'the real host defers the return report until credits complete');
  credits.onDone();assert.deepEqual(reported,[summary]);
  assert.doesNotMatch(source, /makeCreditsIntroScene|credits-intro/);
});
