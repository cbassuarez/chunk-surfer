import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademicCrowdDread,ACADEMIC_CROWD_DREAD as T} from '../src/game/academic-crowd-dread.js';
import {ACADEMIC_FLOOR_HOLLOWS} from '../src/data/academic-floor-population.js';
const live={inside:true,ready:true,near:true,lookingAt:true,aware:true};
const run=(c,seconds,input=live)=>{const events=[];for(let n=0;n<Math.ceil(seconds/.05);n++)events.push(...c.tick(.05,input));return events;};
test('the encounter follows the actual authored hollow rather than a separate invisible anchor',()=>{
 const actor=ACADEMIC_FLOOR_HOLLOWS.find(actor=>actor.id===T.actorId);
 assert.ok(actor?.dreadVariant);assert.equal(actor.floor,10);assert.deepEqual(T.at,{x:actor.x,y:actor.y});
 assert.equal(ACADEMIC_FLOOR_HOLLOWS.filter(actor=>actor.dreadVariant).length,1);
});
test('watching is deliberate sustained local attention, not entering the floor or refusing a voice',()=>{
 for(const change of [{lookingAt:false},{near:false},{ready:false},{loanBusy:true},{threatBusy:true}]){const c=createAcademicCrowdDread();run(c,20,{...live,...change});assert.equal(c.save().outcome,null);assert.notEqual(c.view().phase,'warning');}
 const c=createAcademicCrowdDread();run(c,T.noticeSeconds+.05);assert.equal(c.view().phase,'warning');assert.match(c.view().cue.instruction,/TURN AWAY OR LEAVE/);
});
test('warning cannot advance or resolve before its actual paint is acknowledged',()=>{
 const c=createAcademicCrowdDread();run(c,2,{...live,aware:false});run(c,40,{...live,aware:false});assert.equal(c.view().elapsed,0);assert.equal(c.save().outcome,null);
});
test('looking away or retreating resolves for free using ordinary controls',()=>{
 for(const change of [{lookingAt:false},{near:false}]){const c=createAcademicCrowdDread();run(c,2);const e=run(c,.5,{...live,...change}).find(e=>e.type==='resolved');assert.equal(e.outcome,'escaped');assert.equal(e.composureCost,0);}
});
test('ignoring the full warning marks once, never repeatedly charges, and reload is spent',()=>{
 const c=createAcademicCrowdDread();run(c,2);const e=run(c,6).filter(e=>e.type==='resolved');assert.equal(e.length,1);assert.equal(e[0].outcome,'marked');assert.equal(e[0].composureCost,3);assert.deepEqual(run(c,60),[]);
 const loaded=createAcademicCrowdDread(c.save());assert.equal(loaded.view().phase,'done');assert.deepEqual(run(loaded,60),[]);
});
test('pause, focus, foreign speech, loan and competing threat freeze and rearm full warning',()=>{
 for(const change of [{suspended:true},{speechBusy:true},{loanBusy:true},{threatBusy:true},{ready:false}]){const c=createAcademicCrowdDread();run(c,2);run(c,2);const before=c.view().elapsed;run(c,20,{...live,...change});assert.equal(c.view().elapsed,before);c.tick(.05,live);assert.equal(c.view().elapsed,.05);assert.equal(c.save().outcome,null);}
});
test('floor departure and unresolved reload discard threat clocks while retaining terminal outcomes',()=>{
 const c=createAcademicCrowdDread();run(c,2);run(c,3);assert.deepEqual(c.save(),{version:1,outcome:null});c.tick(.1,{inside:false});assert.equal(c.view().phase,'idle');assert.equal(createAcademicCrowdDread(c.save()).view().phase,'idle');
});
