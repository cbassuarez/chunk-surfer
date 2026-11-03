import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseSourceRestNoteScore} from '../src/game/source-rest-note-score.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
const score=parseSourceRestNoteScore(JSON.parse(readFileSync(new URL('../public/audio/source-rest/seb-bach-chaconne-notes.json',import.meta.url))));
const seat=SOURCE_REST_SEATS[0];
const state=time=>({...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{seatId:seat.id,progress:1,
  look:seat.view,degradation:0,musicTime:time,audibleSeconds:time,musicSignal:.3}});

test('the note map belongs to the exact prepared recording, including its polyphony',()=>{
  const audio=readFileSync(new URL('../public/audio/source-rest/seb-bach-chaconne-105.mp3',import.meta.url));
  assert.equal(createHash('sha256').update(audio).digest('hex'),score.sourceSha256);
  assert.equal(score.notes.length,4009);assert.ok(score.notes.some((n,i)=>i&&n.onset<score.notes[i-1].onset+score.notes[i-1].duration));
});

test('the production frame carries the Ophanim horizon instead of the semiangel, and its outer wheels fall in the second passage',()=>{
  const run=time=>{
    const s=state(time);
    s.sourceRestView.affliction={...sourceRestAfflictionFrame({active:true,currentTime:time,progress:.43}),embodied:true,bodyProgress:1,canLeave:true};
    return sourceContinuationRenderFrame(s,{noteScore:score});
  };
  const before=run(200),second=run(469.99),later=run(500);
  for(const r of [before,second,later]){
    assert.equal(r.props.filter(p=>p.restNoteArchitecture||p.angelAssemblyId||p.cubieId).length,0,'no organism meshes are submitted');
    assert.ok(r.restHorizon?.active);assert.equal(r.destruction.physicalCollisionChanged,false);
    const intact=sourceContinuationRenderFrame(state(r.restHorizon.time),{noteScore:score});
    assert.deepEqual(r.geometry,intact.geometry,'the hole and its tides do not alter the walking world');
  }
  assert.deepEqual(before.restHorizon.rings.map(r=>r.alive),[1,1,1]);
  assert.equal(later.restHorizon.rings[0].alive,1,'the inner wheel keeps turning');
  assert.ok(later.restHorizon.rings[1].alive===0&&later.restHorizon.rings[2].alive===0,'the two outer wheels fall at the authored bearing moments');
  assert.ok(second.lights.some(l=>l.id.endsWith('rest-horizon-wheels')),'the wheels light the vista from the old pivot');
});

test('recognized events are still accounted exactly and breathe the wheels without adding geometry',()=>{
  const s=state(420),ordinary=sourceContinuationRenderFrame(s),represented=sourceContinuationRenderFrame(s,{noteScore:score});
  assert.equal(represented.noteArchitecture.represented,score.notes.filter(n=>n.onset<=420).length);
  assert.equal(represented.noteArchitecture.represented,represented.noteArchitecture.expectedPlayed);
  assert.ok(represented.restHorizon.breath>0,'heard note mass brightens the wheels');assert.equal(ordinary.restHorizon.breath,0);
  assert.deepEqual(ordinary.geometry,represented.geometry);assert.ok(represented.counts.lights<=8);
  assert.ok(represented.counts.props<1000,'bounded full Source scene');
  const absent=sourceContinuationRenderFrame({...s,phase:'catch'},{noteScore:score});
  assert.equal(absent.restHorizon,null,'the Source III treatment remains separate');
});
