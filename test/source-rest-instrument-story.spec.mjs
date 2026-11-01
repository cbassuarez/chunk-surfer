import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sourceRestInstrumentStory} from '../src/render/source-rest-instrument-story.js';
import {sourceRestInstrumentDecay} from '../src/render/source-rest-instrument-decay.js';
import {sourceRestInterfacePresentation,sourceRestInterfaceView} from '../src/game/source-rest-interface.js';
const story=(p,options)=>sourceRestInstrumentStory(sourceRestInterfacePresentation(p),options);

test('one authored field progression moves from wrong readings through an intrusive voice and insistence to quiet',()=>{
  const phases=[.20,.28,.36,.48,.63,.68].map(p=>story(p));
  assert.deepEqual(phases.map(p=>p.phase),['misread','craft','voice','memory','insist','growlix']);
  assert.equal(phases[0].counter,'88:88');assert.deepEqual(phases[0].output.scale,['0','-12','-24','-36','-48']);
  assert.equal(phases[1].locationLabel,'DEFEND EVERY NOTE');assert.equal(phases[2].counterLabel,'I CAN HEAR YOU');
  assert.equal(phases[4].counterLabel,'KEEP PLAYING');assert.equal(phases[5].counterLabel,'@#%!');
  assert.equal(story(0),null);assert.equal(story(.75),null);
  for(const phase of phases)assert.match(phase.counter,/^[0-9: -]+$/,'the formed counter never receives unsupported prose');
});

test('memory fields respect the actual Sarah gate and only acquire Lyle after his name was heard',()=>{
  const early={nodeId:'distance',line:{text:'I played it for Lyle.'},typed:4,history:[]},unknown=story(.57,{conversationView:early});
  assert.equal(unknown.known.lyle,false);assert.ok(!JSON.stringify(unknown).includes('LYLE'));assert.ok(!JSON.stringify(unknown).includes('SARAH'));
  const known=story(.57,{sarahNamed:true,conversationView:{...early,typed:early.line.text.length}});
  assert.equal(known.locationLabel,'SARAH / LYLE');assert.equal(known.output.label,'SARAH');assert.equal(known.output.peakLabel,'LYLE');
  const remembered=story(.57,{conversationView:{nodeId:'teachers',history:[{text:'I played it for Lyle.'}]}});
  assert.equal(remembered.locationLabel,'HER / LYLE');assert.ok(!JSON.stringify(remembered).includes('SARAH'));
  assert.equal(story(.28,{conversationView:{nodeId:'organ'}}).locationLabel,'ANY INSTRUMENT / THE SAME HAND');
});

test('surviving annotation banks keep authored words readable while neighboring electrodes still fail',()=>{
  const s=story(.36),frame=sourceRestInstrumentDecay({stage:3,voiceBanks:s.voiceBanks});
  for(const area of [{x:20,y:19,w:260,h:14},{x:326,y:19,w:290,h:14},{x:20,y:155,w:620,h:20},{x:20,y:214,w:620,h:18}])
    assert.ok(frame.voiceBanks.some(bank=>area.x>=bank.x&&area.y>=bank.y&&area.x+area.w<=bank.x+bank.w&&area.y+area.h<=bank.y+bank.h));
  assert.ok(frame.coverage<.3,'unprotected electrodes are still badly broken');
  assert.equal(story(.63).voiceBanks.length,1,'late insistence keeps one actual location label, not another panel');
});

test('authored name and heading intrusions preserve dialogue, chosen response receipts and all picker actions',()=>{
  const option={text:'Let me hear it.',contentId:'real:hear',goto:'next'},raw={who:'unknown',line:{text:'Listen.'},typed:7,history:[],
    pending:{kind:'branch',index:0,options:[option]},restQueuedReply:{text:option.text,contentId:option.contentId},restCanLeave:true},original=structuredClone(raw),shown=sourceRestInterfaceView(raw,.36);
  assert.equal(shown.line.sourceLabel,'I CAN HEAR YOU');assert.equal(shown.choiceHeading,'HEAR / REPLY ▐');
  assert.equal(shown.line.text,'Listen.');assert.deepEqual(shown.pending,raw.pending);assert.deepEqual(shown.restQueuedReply,raw.restQueuedReply);
  assert.equal(shown.restCanLeave,true);assert.deepEqual(raw,original);
});

test('absent, wrong-return and unrelated phase preserve every existing Source II field byte-for-byte',()=>{
  const samples=[];
  for(let i=0;i<=100;i++)for(let stage=0;stage<=7;stage++)for(const named of [false,true]){
    const frame={progress:i/100,stage,suppressPeripheral:stage>=6},options={sarahNamed:named,
      conversationView:{nodeId:i%2?'organ':'distance',line:{text:'I played it for Lyle.'},typed:i%20,history:[]},musicTime:i*7},
      ordinary=sourceRestInstrumentStory(frame,options);
    assert.deepEqual(sourceRestInstrumentStory(frame,{...options,phase:'wrong-return'}),ordinary);
    assert.deepEqual(sourceRestInstrumentStory(frame,{...options,phase:'other'}),ordinary);
    samples.push(ordinary);
  }
  assert.equal(createHash('sha256').update(JSON.stringify(samples)).digest('hex'),'1603d2f518e8a5822f1834c576afe1befa5e2c8f80a2baf14b94f0051c685db3');
});

test('catch uses its own material and listening story in the existing face fields',()=>{
  const phases=[.20,.28,.36,.48,.58].map(p=>story(p,{phase:'catch'})),
    late=sourceRestInstrumentStory({...sourceRestInterfacePresentation(.78),suppressPeripheral:false},{phase:'catch'});
  assert.deepEqual([...phases,late].map(s=>s.phase),['touch','borrow','attention','recording','revoicing','return']);
  assert.equal(phases[0].locationLabel,'HARPSICHORD / MARIMBA');
  assert.equal(phases[1].locationLabel,'BACK TO THE MARIMBA');
  assert.equal(phases[3].locationLabel,'ROOM / RECORDING');
  assert.equal(phases[4].locationEnd,'ELECTRONIC');
  assert.equal(late.locationLabel,'TO THE MARIMBA');
  const words=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(words):[];
  assert.doesNotMatch(words([...phases,late]).join(' '),/BACH|CHACONNE|SARAH|LYLE|RECITAL|PROFESSOR|DEFEND/i);
  for(const s of [...phases,late]){
    assert.match(s.counter,/^[0-9: -]+$/);
    assert.equal(s.locationTicks.length,13);assert.equal(s.output.scale.length,5);
    assert.equal(s.presentationOnly,true);assert.equal(s.choiceHeading,'YOU / REPLY ▐');
    assert.ok(s.voiceBanks.every(bank=>bank.x>=0&&bank.y>=0&&bank.x+bank.w<=666&&bank.y+bank.h<=239));
  }
});

test('catch silence and disappearance still belong to the existing field owner',()=>{
  assert.equal(story(0,{phase:'catch'}),null);
  assert.equal(story(.78,{phase:'catch'}),null,'shared peripheral suppression is authoritative');
  assert.equal(sourceRestInstrumentStory({stage:5,progress:.58,suppressPeripheral:true},{phase:'catch'}),null);
  assert.equal(sourceRestInstrumentStory({stage:7,progress:.96,suppressPeripheral:false},{phase:'catch'}),null);
  assert.equal(sourceRestInstrumentStory({stage:6,progress:.78,empty:true},{phase:'catch'}),null);
});

test('catch inscriptions do not alter choices, recorded values or personal history and return fresh display arrays',()=>{
  const view={nodeId:'revoicing',line:{text:'There. That is the other sound.'},typed:12,
    history:[{text:'I played it for Lyle.'}],pending:{kind:'branch',options:[{text:'The line is still there.',contentId:'couperin:line',goto:'line'}]},
    restQueuedReply:{text:'The line is still there.',contentId:'couperin:line'},restCanLeave:false},
    frame={stage:5,progress:.58,elapsed:489.2,takes:7,signal:.25},before=structuredClone({frame,view}),
    first=sourceRestInstrumentStory(frame,{phase:'catch',conversationView:view,sarahNamed:true,musicTime:489.2});
  assert.deepEqual({frame,view},before);assert.deepEqual(first.known,{sarah:false,lyle:false});
  assert.equal(first.musicTime,489.2);assert.equal(first.elapsed,undefined);assert.equal(first.takes,undefined);assert.equal(first.signal,undefined);
  assert.equal(first.pending,undefined);assert.equal(first.restQueuedReply,undefined);
  first.locationTicks[0]='CHANGED';first.output.scale[0]='CHANGED';first.voiceBanks[0].x=999;
  const next=sourceRestInstrumentStory(frame,{phase:'catch',musicTime:489.2});
  assert.equal(next.locationTicks[0],'WOO');assert.equal(next.output.scale[0],'SAME');assert.equal(next.voiceBanks[0].x,320);
  assert.equal(sourceRestInstrumentStory(frame,{phase:'catch',musicTime:NaN}).musicTime,0);
});
