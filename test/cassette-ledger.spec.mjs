import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASSETTES_ISSUED,CASSETTE_LOSS_ON_CONTACT,createCassetteLedger,normalizeCassetteLedger,signWorkOrder,recordLevelCheck,
  nextCassette,recordOnCassette,loseCassetteOnContact,recoverCassette,takeB3Store,acceptedRooms,blankCassettes,
  marksSince,cassetteSummary,takeNote,ledgerTextIsWritable,
} from '../src/game/cassette-ledger.js';
import {layoutRecordistHand,recordistHandCovers} from '../src/data/recordist-hand.js';

const take=(ledger,roomId,outcome,extra={})=>{const at=nextCassette(ledger);assert.ok(at.n,`a cassette for ${roomId}`);return recordOnCassette(ledger,at.n,{roomId,outcome,...extra}).ledger;};
const never=()=>.99,always=()=>0;

test('each shift issues its own cassettes; a custom shift is issued as a Contract',()=>{
  assert.deepEqual(CASSETTES_ISSUED,{story:12,contract:8,night:6,'dead-air':5});
  for(const [shift,n] of Object.entries(CASSETTES_ISSUED))assert.equal(blankCassettes(createCassetteLedger(shift)),n);
  assert.equal(createCassetteLedger('custom').issued,8);
});

test('the level check goes on cassette 1 and the first take of the night goes over it',()=>{
  let l=recordLevelCheck(signWorkOrder(createCassetteLedger('night'),{time:'21:52'}));
  assert.deepEqual(nextCassette(l),{n:1,over:'tutorial',options:[]});
  const blanks=blankCassettes(l);
  l=take(l,'main_b3','clean');
  assert.equal(blankCassettes(l),blanks-1,'going over the level check spends cassette 1, no extra');
  assert.equal(l.marks.find(m=>m.kind==='note').text,'1  OVER THE LEVEL CHECK. CLEAN');
  assert.ok(l.marks.some(m=>m.kind==='label-strike'&&m.n===1));
  assert.deepEqual(nextCassette(l).n,2);
});

test('a failed first attempt still used cassette 1; the next takes cassette 2',()=>{
  let l=recordLevelCheck(createCassetteLedger('contract'));
  l=take(l,'main_b3','spoilt',{atSec:23,cause:'HANDLING'});
  assert.equal(nextCassette(l).n,2);assert.deepEqual(acceptedRooms(l),[]);
});

test('every attempt uses a cassette, kept or not, and the client rejects weak takes',()=>{
  let l=createCassetteLedger('night');
  l=take(l,'the_tub','spoilt',{atSec:23,cause:'HANDLING'});l=take(l,'the_tub','rejected',{atSec:41,cause:'BREATH'});
  assert.deepEqual(acceptedRooms(l),[],'a rejected take does not count');
  assert.equal(blankCassettes(l),4);
  l=take(l,'the_tub','clean');assert.deepEqual(acceptedRooms(l),['the_tub']);
  assert.deepEqual(l.marks.filter(m=>m.kind==='note').map(m=>m.text),
    ['1  SPOILT 0:23 HANDLING','2  BREATH 0:41 - REJECT. REDO','3  CLEAN']);
});

test('out of blanks you record over a take: spoilt first, then rejected, then clean, and a clean one erases its room',()=>{
  let l=createCassetteLedger('dead-air');
  l=take(l,'main_b3','clean');l=take(l,'the_tub','rejected',{cause:'BREATH'});l=take(l,'amplifications','clean');
  l=take(l,'soundnoisemusic','spoilt');l=take(l,'lux_nova','clean');
  const at=nextCassette(l);assert.equal(at.n,null);
  assert.deepEqual(at.options.map(o=>[o.n,o.outcome,o.erases]),[[4,'spoilt',null],[2,'rejected',null],[1,'clean','main_b3'],[3,'clean','amplifications'],[5,'clean','lux_nova']]);
  let r=recordOnCassette(l,4,{roomId:'soundnoisemusic',outcome:'clean'});
  assert.deepEqual(r.erased,[],'recording over a spoilt take costs nothing on the sheet');l=r.ledger;
  r=recordOnCassette(l,2,{roomId:'main_b3',outcome:'rejected',cause:'BREATH'});
  assert.deepEqual(r.erased,[]);assert.ok(!r.ledger.marks.some(m=>m.kind==='untick'),'a room never ticked is never un-ticked');l=r.ledger;
  r=recordOnCassette(l,1,{roomId:'the_tub',outcome:'clean'});
  assert.deepEqual(r.erased,['main_b3']);l=r.ledger;
  assert.deepEqual(acceptedRooms(l).sort(),['amplifications','lux_nova','soundnoisemusic','the_tub']);
  assert.ok(l.marks.some(m=>m.kind==='untick'&&m.roomId==='main_b3'));
  assert.ok(l.marks.some(m=>m.kind==='note'&&m.roomId==='main_b3'&&m.text==='1  ERASED'));
});

test('being taken: never on Story, rarely on Contract, more on Night Shift and Dead Air',()=>{
  assert.equal(CASSETTE_LOSS_ON_CONTACT.story,0);
  assert.ok(CASSETTE_LOSS_ON_CONTACT.contract>0&&CASSETTE_LOSS_ON_CONTACT.contract<CASSETTE_LOSS_ON_CONTACT.night);
  assert.equal(CASSETTE_LOSS_ON_CONTACT.night,CASSETTE_LOSS_ON_CONTACT['dead-air']);
  assert.equal(loseCassetteOnContact(createCassetteLedger('story'),{random:always}).lost,null);
  assert.equal(loseCassetteOnContact(createCassetteLedger('night'),{random:never}).lost,null);
  assert.equal(loseCassetteOnContact(createCassetteLedger('contract'),{random:always}).lost,1);
});

test('a lost cassette takes its clean take with it, and finding it gives the room back',()=>{
  let l=take(createCassetteLedger('night'),'main_b3','clean');
  const r=loseCassetteOnContact(l,{random:always});assert.equal(r.lost,1);assert.deepEqual(r.erased,['main_b3']);
  l=r.ledger;assert.deepEqual(acceptedRooms(l),[]);assert.ok(l.marks.some(m=>m.kind==='ring'&&m.n===1));
  assert.notEqual(nextCassette(l).n,1,'a lost cassette cannot be recorded on');
  assert.throws(()=>recordOnCassette(l,1,{roomId:'the_tub',outcome:'clean'}));
  const back=recoverCassette(l,1);assert.deepEqual(back.restored,['main_b3']);assert.deepEqual(acceptedRooms(back.ledger),['main_b3']);
});

test('the B3 store adds two blanks, once, numbered after the issued ones',()=>{
  const first=takeB3Store(createCassetteLedger('night'));assert.deepEqual(first.added,[7,8]);
  assert.equal(blankCassettes(first.ledger),8);assert.deepEqual(takeB3Store(first.ledger).added,[]);
  assert.equal(first.ledger.marks.at(-1).text,'FOUND 2 - B3 STORE');
});

test('his ink only grows, every mark has its own id, and the check-off sees only what is new',()=>{
  let l=recordLevelCheck(signWorkOrder(createCassetteLedger('night'),{time:'21:52'}));
  const seen=l.order;l=take(l,'main_b3','clean');
  const fresh=marksSince(l,seen);
  assert.deepEqual(fresh.map(m=>m.kind),['label-strike','slash','note','tick','strike']);
  let before=l.marks.length;
  for(const step of [x=>take(x,'the_tub','rejected',{cause:'BREATH',atSec:41}),x=>takeB3Store(x).ledger,x=>loseCassetteOnContact(x,{random:always}).ledger]){
    const next=step(l);assert.deepEqual(next.marks.slice(0,before),l.marks,'nothing already written changes');l=next;before=l.marks.length;
  }
  assert.equal(new Set(l.marks.map(m=>m.id)).size,l.marks.length);
  assert.ok(ledgerTextIsWritable(l));
});

test('a ledger survives a save round trip, and a broken one becomes a fresh issue for the shift',()=>{
  const l=take(recordLevelCheck(createCassetteLedger('night')),'main_b3','clean');
  assert.deepEqual(normalizeCassetteLedger(JSON.parse(JSON.stringify(l))),l);
  assert.equal(normalizeCassetteLedger({schema:99},{shift:'dead-air'}).issued,5);
  assert.equal(normalizeCassetteLedger(null,{shift:'story'}).issued,12);
});

test('the summary is what the ending metrics need',()=>{
  let l=recordLevelCheck(createCassetteLedger('night'));
  l=take(l,'main_b3','clean');l=take(l,'the_tub','spoilt');l=take(l,'the_tub','rejected',{cause:'BREATH'});l=take(l,'amplifications','clean');
  l=loseCassetteOnContact(l,{random:()=>.999*0}).ledger;l=takeB3Store(l).ledger;
  const s=cassetteSummary(l);
  assert.deepEqual({shift:s.shift,issued:s.issued,found:s.found,attempts:s.attempts,clean:s.clean,rejected:s.rejected,spoilt:s.spoilt,lost:s.lost},
    {shift:'night',issued:6,found:2,attempts:4,clean:2,rejected:1,spoilt:1,lost:1});
  assert.ok(Array.isArray(s.notes)&&s.notes.length>=4);
});

test('his notes use only glyphs his hand has, and the hand is deterministic',()=>{
  for(const outcome of ['clean','rejected','spoilt'])for(const cause of ['BREATH','HANDLING','CLOTHING','PRESENCE','NOISE'])
    assert.ok(recordistHandCovers(takeNote({n:12,outcome,atSec:59,cause,over:'tutorial'})));
  assert.ok(recordistHandCovers('FOUND 2 - B3 STORE'));assert.ok(!recordistHandCovers('@'));
  const a=layoutRecordistHand('3  BREATH 0:41 - REJECT. REDO',{x:10,y:20,h:3}),b=layoutRecordistHand('3  BREATH 0:41 - REJECT. REDO',{x:10,y:20,h:3});
  assert.deepEqual(a,b);assert.deepEqual(a.unsupported,[]);assert.ok(a.width>40&&a.width<110);
  assert.deepEqual(layoutRecordistHand('O0').strokes.length,3,'the zero is slashed, the O is not');
});
