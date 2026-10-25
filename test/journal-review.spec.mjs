import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalReview,journalRevision,journalPinnedEntry,normalizeJournalReview} from '../src/game/journal-review.js';

const service={id:'quest:lyric',nature:'undertaking',state:'active',commitment:'accepted',
  stage:{id:'waters',label:'WATERS TO CARRY'},next:'Take the waters to Mavis and Ed.',trackable:true,
  trackingKey:'quest:lyric:service',hasOpenCommitment:true};

test('first and legacy openings establish a quiet baseline without mutating source facts',()=>{
  const entry=structuredClone(service),before=JSON.stringify(entry);
  const review=createJournalReview(null),[shown]=review.decorate([entry]);
  assert.equal(shown.updated,false);assert.equal(shown.unseen,false);
  assert.equal(JSON.stringify(entry),before);
  assert.ok(normalizeJournalReview(review.memory()));
  assert.equal(normalizeJournalReview({version:0,seen:{}}),null);
});

test('progress coalesces per file, survives reopening and is acknowledged by presentation only',()=>{
  const first=createJournalReview();first.decorate([service]);
  const stored=first.memory();
  const progressed={...service,stage:{id:'return',label:'RETURN THE TRAY'},next:'Return to Iona.'};
  const review=createJournalReview(stored),[shown]=review.decorate([progressed]);
  assert.equal(shown.unseen,true);assert.equal(shown.updated,true);
  assert.deepEqual(stored,first.memory(),'decorating never mutates the persisted receipt');
  assert.equal(review.presented('unknown'),false);
  assert.equal(review.presented(service.id),true);
  const [sameOpening]=review.decorate([progressed]);
  assert.equal(sameOpening.unseen,false);assert.equal(sameOpening.updated,true,'the visible UPDATED context remains for this opening');
  assert.equal(review.presented(service.id),false,'steady rendering does not repeat a save');
  assert.equal(createJournalReview(review.memory()).decorate([progressed])[0].updated,false);
  assert.equal(progressed.stage.id,'return','presentation cannot move the quest');
});

test('newly discovered files show a quiet update only after a baseline exists',()=>{
  const review=createJournalReview();review.decorate([]);
  const result=review.decorate([service]);assert.equal(result[0].unseen,true);
  assert.equal(review.decorate([service])[0].unseen,true,'refresh does not consume an unread update');
});

test('navigation, rendering and live timers do not fabricate progress revisions',()=>{
  const revision=journalRevision(service);
  assert.equal(journalRevision({...service,updated:true,unseen:true,pinned:true,mapEnabled:false,loanRemaining:3}),revision);
  assert.notEqual(journalRevision({...service,commitment:'fulfilled',closure:{label:'HELP GIVEN',text:'Tray returned.'}}),revision);
});

test('a completed undertaking pin cannot turn into a later favor without another TRACK action',()=>{
  const memory={journalPinnedId:service.id,journalPinnedKey:service.trackingKey};
  assert.equal(journalPinnedEntry([service],memory),service);
  const followUp={...service,state:'resolved',commitment:'fulfilled',trackingKey:'quest:lyric:opener',followUp:{id:'opener',commitment:'accepted'}};
  assert.equal(journalPinnedEntry([followUp],memory),null);
  assert.equal(journalPinnedEntry([followUp],{journalPinnedId:service.id}),null,'old pins cannot infer a new promise');
  assert.equal(journalPinnedEntry([followUp],{journalPinnedId:service.id,journalPinnedKey:followUp.trackingKey}),followUp);
  assert.equal(journalPinnedEntry([{...service,trackable:false}],memory),null);
});
