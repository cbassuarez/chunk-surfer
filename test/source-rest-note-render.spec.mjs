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

test('persistent paired cubies detach during the human hard passages and remain absent from the mechanism after recovery',()=>{
  const run=time=>{
    const s=state(time);
    s.sourceRestView.affliction={...sourceRestAfflictionFrame({active:true,currentTime:time,progress:.43}),embodied:true,bodyProgress:1,canLeave:true};
    return sourceContinuationRenderFrame(s,{noteScore:score});
  };
  const before=run(200),first=run(247.5),returning=run(300),second=run(469.99),later=run(500),
    cube=r=>r.props.filter(p=>p.restNoteArchitecture),ids=cube(before).map(p=>p.id),
    detached=r=>new Set(cube(r).filter(p=>p.restDetached&&p.cubieId).map(p=>p.cubieId));
  assert.equal(ids.length,91);assert.equal(detached(before).size,0);
  assert.ok(detached(first).size>0,'the first reported grueling passage removes mechanical members');
  assert.deepEqual(detached(returning),detached(first),'recovery does not reconstruct already detached cubies');
  assert.ok(detached(second).size>detached(first).size,'the second human passage removes further members');
  assert.deepEqual(detached(later),detached(second));
  for(const id of detached(first))assert.ok(detached(second).has(id),'historical damage remains cumulative');
  assert.ok(detached(second).size<26,'the remaining coherent mechanism keeps playing');
  for(const[time,r]of[[200,before],[247.5,first],[300,returning],[469.99,second],[500,later]]){
    const parts=cube(r),intact=sourceContinuationRenderFrame(state(time),{noteScore:score});
    assert.deepEqual(parts.map(p=>p.id),ids,'no one-off note architecture spawns or vanishes');
    assert.deepEqual(r.geometry,intact.geometry,'rendered breakage does not alter the walking world');
    assert.equal(r.destruction.physicalCollisionChanged,false);
    const core=parts.find(p=>p.noteKind==='note-cube-core'),plainCore=cube(intact).find(p=>p.noteKind==='note-cube-core');
    assert.ok(core&&!core.restDetached&&!core.restRebuilt);assert.deepEqual(core.matrix,plainCore.matrix);
    for(const id of new Set(parts.filter(p=>p.cubieId).map(p=>p.cubieId))){
      const pair=parts.filter(p=>p.cubieId===id);assert.equal(pair.length,3);
      assert.deepEqual(new Set(pair.map(p=>p.noteKind)),new Set(['note-cube-cell','note-cube-chamber','note-cube-watch']));
      for(const component of pair.slice(1)){
        assert.deepEqual(Array.from(pair[0].matrix.slice(12,15)),Array.from(component.matrix.slice(12,15)),
          'shell, breathing chamber and recessed eyes keep the same anatomical anchor while falling');
        assert.equal(!!pair[0].restDetached,!!component.restDetached);assert.equal(pair[0].fractureAt,component.fractureAt);
        assert.deepEqual(pair[0].lattice,component.lattice);assert.deepEqual(pair[0].homeLattice,component.homeLattice);
      }
      assert.ok(pair.every(p=>!p.restRebuilt),'turning a persistent cubie cannot exempt it as an ephemeral rebuilding aperture');
    }
    for(const part of parts.filter(p=>p.restDetached)){
      const unbroken=cube(intact).find(p=>p.id===part.id);
      assert.notDeepEqual(part.matrix,unbroken.matrix);assert.ok(part.y<unbroken.y,'gravity removes the member from its musical lattice address');
    }
  }
  const assemblies=cube(second).filter(p=>p.angelAssemblyId);
  assert.equal(assemblies.length,12);assert.equal(assemblies.filter(p=>p.restDetached).length,8);
  const intact=sourceContinuationRenderFrame(state(469.99),{noteScore:score});
  for(let wheelId=0;wheelId<3;wheelId++){
    const group=assemblies.filter(p=>p.wheelId===wheelId);assert.equal(group.length,4);
    assert.ok(group.every(p=>!!p.restDetached===(wheelId!==0)),'the inner wheel remains while the two outer bearing assemblies fall');
    for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
      const a=group[i],b=group[j],originalA=intact.props.find(p=>p.id===a.id),originalB=intact.props.find(p=>p.id===b.id),
        distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),original=Math.hypot(originalA.x-originalB.x,originalA.y-originalB.y,originalA.z-originalB.z);
      assert.ok(Math.abs(distance-original)<1e-4,'a falling eye-wheel and both wings keep their shared physical bearing');
    }
  }
});

test('actual recognized events become native-rendered geometry without changing the walking world',()=>{
  const s=state(420),ordinary=sourceContinuationRenderFrame(s),represented=sourceContinuationRenderFrame(s,{noteScore:score});
  const parts=represented.props.filter(p=>p.restNoteArchitecture);
  assert.ok(parts.length>40);assert.ok(parts.length<=240);
  assert.ok(parts.every(p=>p.decorative&&!p.structural&&Array.isArray(p.noteIds)));
  assert.ok(parts.find(p=>p.noteKind==='note-cube-core').noteIds.length>1000,'the retained core accounts for all legitimately heard notes, including quiet anatomical sites');
  assert.equal(represented.noteArchitecture.represented,score.notes.filter(n=>n.onset<=420).length);
  assert.equal(represented.noteArchitecture.represented,represented.noteArchitecture.expectedPlayed);
  assert.deepEqual(ordinary.geometry,represented.geometry);assert.ok(represented.counts.lights<=8);
  assert.ok(represented.counts.props<1000,'bounded full Source scene including the note architecture');
  const absent=sourceContinuationRenderFrame({...s,phase:'catch'} ,{noteScore:score});
  assert.equal(absent.props.filter(p=>p.restNoteArchitecture).length,0,'the Source III treatment remains separate');
  assert.equal(ordinary.props.filter(p=>p.restNoteArchitecture).length,0,'no synthetic fallback notes');
});
