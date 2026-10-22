import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoofWordLock} from '../src/game/roof-word-lock.js';

test('six physical alphabet wheels begin at A with detached public state',()=>{
  const lock=createRoofWordLock();
  assert.deepEqual(lock.view(),{letters:['A','A','A','A','A','A'],word:'AAAAAA',cursor:0,turns:[0,0,0,0,0,0]});
  const snapshot=lock.view();snapshot.letters[0]='Z';snapshot.turns[0]=25;snapshot.cursor=5;
  assert.equal(lock.view().word,'AAAAAA');assert.equal(lock.view().cursor,0);assert.equal(lock.view().turns[0],0);
});

test('manual turns cross A/Z in both directions without animation rewinds',()=>{
  const lock=createRoofWordLock();
  assert.deepEqual(lock.cycle(-1),{kind:'turn',index:0,delta:-1});
  assert.equal(lock.view().letters[0],'Z');assert.equal(lock.view().turns[0],-1);
  lock.cycle(1);assert.equal(lock.view().letters[0],'A');assert.equal(lock.view().turns[0],0);
  lock.cycle(27);assert.equal(lock.view().letters[0],'B');assert.equal(lock.view().turns[0],27);
  lock.cycle(-54);assert.equal(lock.view().letters[0],'Z');assert.equal(lock.view().turns[0],-27);
  lock.cycle(3,4);assert.equal(lock.view().letters[4],'D');assert.equal(lock.view().cursor,0);
});

test('typing uses the shortest detent route, including a stable half-alphabet tie',()=>{
  const lock=createRoofWordLock();
  assert.deepEqual(lock.type('z'),{kind:'turn',index:0,delta:-1});
  assert.deepEqual(lock.view().turns,[-1,0,0,0,0,0]);assert.equal(lock.view().cursor,1);
  assert.deepEqual(lock.type('N'),{kind:'turn',index:1,delta:13});
  lock.select(0);assert.deepEqual(lock.type('A'),{kind:'turn',index:0,delta:1});
  lock.select(1);assert.deepEqual(lock.type('A'),{kind:'turn',index:1,delta:13});
  assert.equal(lock.view().turns[1],26,'shortest typing preserves the unwrapped wheel position');
});

test('typing repeated letters advances physical selection and repeats overwrite the last wheel',()=>{
  const lock=createRoofWordLock();
  for(const letter of 'AAAAAA')lock.type(letter);
  assert.equal(lock.view().word,'AAAAAA');assert.equal(lock.view().cursor,5);
  lock.type('Z');assert.equal(lock.view().word,'AAAAAZ');assert.equal(lock.view().cursor,5);
  assert.deepEqual(lock.type('Z'),{kind:'none',index:5,delta:0});
  lock.type('B');assert.equal(lock.view().word,'AAAAAB');assert.equal(lock.view().turns[5],1);
});

test('six backspaces after a full typed word restore AAAAAA and the first selection',()=>{
  const lock=createRoofWordLock();
  for(const letter of 'SALMON')lock.type(letter);
  assert.equal(lock.view().word,'SALMON');assert.equal(lock.view().cursor,5);
  const words=['SALMOA','SALMAA','SALAAA','SAAAAA','SAAAAA','AAAAAA'];
  words.forEach((word,i)=>{lock.backspace();assert.equal(lock.view().word,word);assert.equal(lock.view().cursor,5-i);});
  lock.backspace();assert.equal(lock.view().cursor,0);assert.equal(lock.view().word,'AAAAAA');
  for(const letter of 'VESPER')lock.type(letter);
  assert.equal(lock.view().word,'VESPER');
});

test('partial typing, direct selection and Delete support predictable correction',()=>{
  const lock=createRoofWordLock();
  for(const letter of 'VAP')lock.type(letter);
  assert.equal(lock.view().cursor,3);lock.backspace();assert.equal(lock.view().word,'VAAAAA');assert.equal(lock.view().cursor,2);
  lock.backspace();assert.equal(lock.view().cursor,1,'a typed A is a real position in the deletion sequence');
  lock.type('E');lock.type('S');assert.equal(lock.view().word,'VESAAA');
  lock.select(0);lock.backspace();assert.equal(lock.view().word,'AESAAA');assert.equal(lock.view().cursor,0);
  lock.select(2);lock.delete();assert.equal(lock.view().word,'AEAAAA');assert.equal(lock.view().cursor,2);
  lock.cycle(1);lock.backspace();assert.equal(lock.view().letters[2],'A');assert.equal(lock.view().cursor,2);
  lock.backspace();assert.equal(lock.view().letters[1],'A');assert.equal(lock.view().cursor,1);
});

test('selection clamps while invalid detents and non-letter typing cannot alter the mechanism',()=>{
  const lock=createRoofWordLock();
  assert.deepEqual(lock.select(500),{kind:'select',index:5,delta:0});
  lock.move(-500);assert.equal(lock.view().cursor,0);lock.move(2);assert.equal(lock.view().cursor,2);
  const baseline=lock.view();
  for(const invalid of [NaN,Infinity,.5,'1',null,undefined]){lock.select(invalid);lock.move(invalid);lock.cycle(invalid);}
  for(const invalid of [-1,6,NaN,.5,'1'])lock.cycle(1,invalid);
  for(const invalid of ['','AA','1','é',' ','Enter',null,undefined])lock.type(invalid);
  assert.deepEqual(lock.view(),baseline);
  assert.deepEqual(lock.cycle(0),{kind:'none',index:2,delta:0});
});

test('a single-wheel mechanism has the same wrap, typing and deletion guarantees',()=>{
  const lock=createRoofWordLock({wordLength:1});
  lock.type('z');assert.deepEqual(lock.view(),{letters:['Z'],word:'Z',cursor:0,turns:[-1]});
  lock.type('a');assert.deepEqual(lock.view().turns,[0]);lock.backspace();assert.equal(lock.view().word,'A');
  for(const wordLength of [0,-1,.5,Infinity,'6'])assert.throws(()=>createRoofWordLock({wordLength}),RangeError);
});
