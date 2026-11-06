import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {WHOSE_LIFE_OWNED,WHOSE_LIFE_PLACES,WHOSE_LIFE_HANDS} from '../src/data/whose-life.js';
import {whoseLifeLine,createWhoseLifeRatchet} from '../src/game/whose-life.js';
import {buildPubBartenderDialogue} from '../src/data/pub-dialogue.js';
import {VIGIL_VOICES} from '../src/data/exterior-vigil.js';

const propById=new Map(CONSERVATORY_PROPS.map(p=>[p.id,p]));
const flags=()=>{const set=new Set();return{isSet:k=>set.has(k),mark:k=>set.add(k),set};};

test('every row still matches the words in the building, so none can go stale in silence',()=>{
  for(const row of WHOSE_LIFE_OWNED){
    const p=propById.get(row.id);assert.ok(p,`${row.id} is gone`);
    const copy=`${p.inspect?.first||''} ${p.inspect?.again||''}`;
    for(const[from]of row.swap)assert.ok(copy.includes(from),`${row.id} no longer says: ${from}`);
  }
  for(const id of [...Object.keys(WHOSE_LIFE_PLACES),...WHOSE_LIFE_HANDS.ids])assert.ok(propById.has(id),`${id} is gone`);
});

test('it arrives late and in order: nothing is his at the start, and the last things come last',()=>{
  for(const row of WHOSE_LIFE_OWNED){
    const p=propById.get(row.id),before=whoseLifeLine(row.id,`${p.inspect.first} ${p.inspect.again}`,{meaning:row.at-.01});
    for(const[,to]of row.swap)assert.ok(!before.includes(to),`${row.id} is his too soon`);
  }
  const ats=WHOSE_LIFE_OWNED.map(r=>r.at);assert.deepEqual(ats,[...ats].sort((a,b)=>a-b));
  assert.ok(ats[0]>=.2,'not in the first stretch of the night');
  assert.equal(WHOSE_LIFE_OWNED.at(-1).id,'dock-work-order-clipboard','the job itself is the last thing he claims');
});

test('the same sentence comes back with him in it',()=>{
  assert.equal(whoseLifeLine('b2-piano-stool','A stool at the height somebody left it.',{meaning:.5}),'A stool at the height you left it.');
  assert.equal(whoseLifeLine('b2-piano-stool','Still at their height.',{meaning:.5}),'Still at your height.');
  assert.equal(whoseLifeLine('spur-substation-mcc','Dead switchgear. Tape, and a date, and a hand that is not yours.',{meaning:.9}),'Dead switchgear. Tape, and a date, and your hand.');
  assert.equal(whoseLifeLine('dock-work-order-clipboard','Your job is clipped over somebody else’s unfinished leaving.',{meaning:.59}),'Your job is clipped over somebody else’s unfinished leaving.');
  assert.equal(whoseLifeLine('not-listed','A chair.',{meaning:1}),'A chair.');
});

test('someone who read it early still sees it change, once, then the line moves on',()=>{
  const f=flags(),id='b2-piano-stool',first='A stool at the height somebody left it.',again='Still at their height.';
  assert.equal(whoseLifeLine(id,again,{first,meaning:.1,...f}),again,'early, the second read is just the second line');
  assert.equal(whoseLifeLine(id,again,{first,meaning:.5,...f}),'A stool at the height you left it.','the same sentence comes back');
  assert.equal(whoseLifeLine(id,again,{first,meaning:.5,...f}),'Still at your height.');
  const g=flags();assert.equal(whoseLifeLine(id,first,{first,meaning:.5,...g}),'A stool at the height you left it.');
  assert.equal(whoseLifeLine(id,again,{first,meaning:.5,...g}),'Still at your height.','a first read that was already his does not repeat');
  const frozen=flags();assert.equal(whoseLifeLine(id,again,{first,meaning:1,frozen:true,...frozen}),again);assert.equal(frozen.set.size,0);
});

test('a rung plays once a run, and a later one comes closer',()=>{
  const f=flags(),id='brendan-visitor-guidebooks',base='Guidebooks.';
  assert.equal(whoseLifeLine(id,base,{meaning:.2,...f}),base);
  const first=whoseLifeLine(id,base,{meaning:.5,...f});assert.match(first,/Someone’s school trip/);
  assert.equal(whoseLifeLine(id,base,{meaning:.5,...f}),base,'it does not repeat');
  assert.match(whoseLifeLine(id,base,{meaning:.85,...f}),/Cheese/);
  assert.equal(whoseLifeLine(id,base,{meaning:1,...f}),base);
});

test('the hands go first, and only once they have actually played',()=>{
  const f=flags(),id='hall-marimba-1',base='The concert marimba.';
  assert.equal(whoseLifeLine(id,base,{meaning:.9,heard:false,...f}),base,'nothing until he has played it');
  assert.match(whoseLifeLine(id,base,{meaning:0,heard:true,...f}),/hands went to the bars/);
  assert.equal(whoseLifeLine(id,base,{meaning:.1,heard:true,...f}),base);
  assert.match(whoseLifeLine('practice-ensemble-marimba','A rehearsal marimba.',{meaning:.45,heard:true,...f}),/taught you/,'the memory is in him, so it carries to another instrument');
  assert.match(whoseLifeLine(id,base,{meaning:.7,heard:true,...f}),/what comes next/);
});

test('the turn is one line, on the work order, and it is the client’s own list',()=>{
  const f=flags(),line=whoseLifeLine('dock-work-order-clipboard','Your job.',{meaning:.61,...f});
  assert.match(line,/No handling, no clothing, no breath/);
  const brief=readFileSync(new URL('../src/data/conservatory-script.js',import.meta.url),'utf8');
  assert.match(brief,/No handling noise, no clothing, no breath/,'the words he is reading are the ones he was given');
});

test('the crash loop keeps its opening: nothing changes while it is staged',()=>{
  const row=WHOSE_LIFE_OWNED[0],p=propById.get(row.id);
  assert.equal(whoseLifeLine(row.id,p.inspect.first,{meaning:1,frozen:true}),p.inspect.first);
  const f=flags();assert.equal(whoseLifeLine('dock-work-order-clipboard','x',{meaning:1,frozen:true,...f}),'x');assert.equal(f.set.size,0,'a frozen read spends no rung');
});

test('what has become his stays his, through a surge, and a new run starts over',()=>{
  const hold=createWhoseLifeRatchet();
  assert.equal(hold('a',.3),.3);assert.equal(hold('a',.6),.6);assert.equal(hold('a',.4),.6);
  assert.equal(hold('b',.1),.1);
});

test('no line here closes a reading',()=>{
  const lines=[...WHOSE_LIFE_OWNED.flatMap(r=>r.swap.map(s=>s[1])),...Object.values(WHOSE_LIFE_PLACES).flat().map(r=>r.text),...WHOSE_LIFE_HANDS.rungs.map(r=>r.text)];
  for(const line of lines){
    assert.doesNotMatch(line,/\b(dead|dying|died|death|crash|drown|ghost|hospital|cab|van|sarah|lyle|alan|surfer|hush)\b/i,`names too much: ${line}`);
    assert.doesNotMatch(line,/only a|just a|it was never|you are not|that was never/i,`shuts a door: ${line}`);
  }
});

test('two rooms of people carry a line each, and neither says who they mean',()=>{
  const rota=VIGIL_VOICES['vigil-ruth-mallory'].tree.rota.lines.map(l=>l.text).join(' ');
  assert.match(rota,/One or two say he\./);
  const pub=buildPubBartenderDialogue({favors:{opener:{},orderbook:{}},phase:'offered'},{}).regulars.lines.map(l=>l.text).join(' ');
  assert.match(pub,/Same signature as yours, near enough/);
});
