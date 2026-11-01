import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestNoteArchitecture as render} from '../src/game/source-rest-note-architecture.js';
import {sourceRestCubeGeometryLibrary} from '../src/render/source-rest-cube-models.js';
import {SOURCE_REST_SEATS,SOURCE_REST_EYE_HEIGHT} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_ALCOVE} from '../src/data/source-rest-alcove.js';
const notes=[{midi:50,onset:1,duration:1,velocity:.8,confidence:.9},{midi:62,onset:1.02,duration:1.2,velocity:.7,confidence:.85},
  {midi:69,onset:1.05,duration:.4,velocity:.9,confidence:.8},{midi:50,onset:2,duration:.6,velocity:.6,confidence:.9}],
  at=(time,extra={})=>render({notes,currentTime:time,playedSeconds:time,duration:12,...extra}),
  cells=view=>view.parts.filter(p=>p.kind==='note-cube-cell'),
  point=(part,local)=>[0,1,2].map(r=>part.matrix[r]*local[0]+part.matrix[r+4]*local[1]+part.matrix[r+8]*local[2]+part.matrix[r+12]);

test('the retained lattice never turns, respawns, or changes its physical addresses as notes accumulate',()=>{
  const base=at(0),ids=base.parts.map(p=>p.id),positions=base.parts.filter(p=>p.cubieId).map(p=>[p.id,p.x,p.y,p.z]);
  for(const time of[.9,1,1.3,3,10,50]){
    const view=at(time);assert.equal(view.parts.length,91);assert.deepEqual(view.parts.map(p=>p.id),ids);
    assert.deepEqual(cells(view).map(p=>p.matrix),cells(base).map(p=>p.matrix),'the shell lattice is fixed, not a slower version of the old quarter-turn mechanism');
    assert.deepEqual(view.parts.filter(p=>p.cubieId).map(p=>[p.id,p.x,p.y,p.z]),positions);
    assert.equal(view.diagnostics.turn,null);assert.equal(view.diagnostics.completedTurns,0);assert.equal(view.diagnostics.queued,0);
    assert.ok(view.parts.every(p=>!p.articulation&&(!p.turnAngle||p.turnAngle===0)));
  }
  assert.equal(at(1-1e-10).diagnostics.represented,0);assert.equal(at(1).diagnostics.represented,1);
  assert.equal(at(1.02).diagnostics.represented,2);assert.equal(at(4).diagnostics.represented,4);
  assert.equal(at(4,{progress:.96}).parts.length,0);assert.equal(base.lights.length,0);
});

test('real onsets feed localized chamber pressure and dark socket recession without early animation',()=>{
  const one=[{midi:50,onset:1,duration:2,velocity:1,confidence:1}],frame=t=>render({notes:one,currentTime:t,playedSeconds:t}),
    before=frame(.9),onset=frame(1),active=frame(2.2),changed=active.parts.filter(p=>p.cubieId&&p.aperture>.01);
  assert.deepEqual(before.parts.map(p=>p.matrix),onset.parts.map(p=>p.matrix));
  assert.ok(onset.parts.filter(p=>p.cubieId).every(p=>p.aperture===0),'no future note leaks through temporal interpolation');
  assert.equal(new Set(changed.map(p=>p.cubieId)).size,1,'a pitch has a stable anatomical chamber rather than moving the entire organism');
  const chamber=changed.find(p=>p.kind==='note-cube-chamber'),eye=changed.find(p=>p.kind==='note-cube-watch');
  assert.ok(chamber.chamberExcursion>.1);assert.ok(eye.irisDepth>.1);assert.ok(eye.sx<1);
  assert.notDeepEqual(chamber.matrix,before.parts.find(p=>p.id===chamber.id).matrix);
  assert.ok(active.parts.every(p=>p.matrix.every(Number.isFinite)));
});

test('dense passages saturate pressure while local response and phrase motion retain explicit velocity caps',()=>{
  const dense=Array.from({length:180},(_,i)=>({midi:50,onset:i*.025,duration:.8,velocity:1,confidence:1}));
  let previous=null,peak=0;
  for(let t=0;t<=8;t+=.05){
    const view=render({notes:dense,currentTime:t,playedSeconds:t});peak=Math.max(peak,...view.parts.map(p=>p.chamberExcursion||0));
    assert.ok(view.parts.filter(p=>p.cubieId).every(p=>p.aperture>=0&&p.aperture<=1));
    assert.ok(view.parts.filter(p=>p.wheelId!==undefined).every(p=>Math.abs(p.breathTilt)<=.100001));
    if(previous){
      for(const p of view.parts.filter(p=>p.cubieId))assert.ok(Math.abs(p.aperture-previous.parts.find(q=>q.id===p.id).aperture)<=.40*.05+1e-6);
      const phaseRate=(view.diagnostics.breathPhase-previous.diagnostics.breathPhase)/.05;
      assert.ok(phaseRate>=-1e-5&&phaseRate<=Math.PI*2/9+.001,'onset density cannot accelerate the phrase breath beyond a nine-second cycle');
      for(const wing of view.parts.filter(p=>p.kind==='note-cube-wing'))assert.ok(Math.abs(wing.wingElevation-previous.parts.find(q=>q.id===wing.id).wingElevation)<=.15*.05+1e-5);
    }
    previous=view;
  }
  assert.ok(peak>.15&&peak<=.25,'the chamber excursion remains visible without a rigid-body turn');
});

test('held audio clocks are exact, reduced motion removes respiration, and completed passes retain legitimate history counts',()=>{
  assert.deepEqual(at(2.3),at(2.3));assert.deepEqual(at(2.3).parts,at(2.3,{signal:1}).parts);
  assert.deepEqual(at(2,{reducedMotion:true}).parts.map(p=>p.matrix),at(5,{reducedMotion:true}).parts.map(p=>p.matrix));
  const loop=at(0,{playedSeconds:12}),repeat=at(4,{playedSeconds:16});
  assert.equal(loop.diagnostics.completedPasses,1);assert.equal(loop.diagnostics.represented,4);
  assert.equal(loop.parts.find(p=>p.kind==='note-cube-core').eventCount,4);
  assert.equal(repeat.parts.find(p=>p.kind==='note-cube-core').eventCount,8);
  for(const p of cells(loop)){
    const count=notes.filter(n=>loop.parts.find(q=>q.id===p.id).noteIds.includes(`recognized-note:${notes.indexOf(n)}:${n.midi}:${n.onset.toFixed(4)}`)).length;
    assert.equal(p.eventCount,count,'the first completed cycle is counted once, including inactive anatomical sites');
  }
  assert.deepEqual(at(80).parts,at(90).parts,'an exhausted score invents no continuing wall-clock motion');
});

test('all recognized events remain accounted for within the same 91 parts and 45k triangle ceiling',()=>{
  const score=JSON.parse(readFileSync(new URL('../public/audio/source-rest/seb-bach-chaconne-notes.json',import.meta.url),'utf8')),
    view=render({notes:score.notes,currentTime:720,playedSeconds:720}),models=sourceRestCubeGeometryLibrary();
  assert.equal(view.diagnostics.recognized,4009);assert.equal(view.diagnostics.represented,4009);
  assert.equal(new Set(view.parts.flatMap(p=>p.noteIds)).size,4009);assert.equal(view.parts.length,91);
  assert.ok(view.parts.reduce((sum,p)=>sum+models[p.mesh].i.length/3,0)<=45000);
  for(const model of Object.values(models))assert.ok(model.p.every(Number.isFinite)&&model.i.length%3===0&&model.i.every(i=>i>=0&&i<model.p.length/3));
  const invalid=render({notes:[...notes,{midi:Infinity,onset:3,duration:1}],currentTime:4});
  assert.equal(invalid.diagnostics.invalid,1);assert.equal(invalid.diagnostics.represented,4);
});

test('the broad feather mantle and complete breathing silhouette fit through the actual seated opening',()=>{
  const models=sourceRestCubeGeometryLibrary(),seat=SOURCE_REST_SEATS[0],eye=[seat.x,seat.feet+SOURCE_REST_EYE_HEIGHT,seat.z],w=SOURCE_REST_ALCOVE.window,
    held=[38,50,62,74,86,98].map(midi=>({midi,onset:0,duration:40,velocity:1,confidence:1})),feather=models['rest-note-cube-wing'];
  const vertical=feather.p.filter((_,i)=>i%3===1);assert.ok(Math.max(...vertical)-Math.min(...vertical)>2.7,'the mantle has broad layered flight feathers, not thin horn-like ribs');
  for(const time of[0,5,10,15,20,30])for(const part of render({notes:held,currentTime:time}).parts){
    const mesh=models[part.mesh];for(let i=0;i<mesh.p.length;i+=3){
      const v=point(part,mesh.p.slice(i,i+3)),t=(w.x-eye[0])/(v[0]-eye[0]),y=eye[1]+t*(v[1]-eye[1]),z=eye[2]+t*(v[2]-eye[2]);
      assert.ok(y>w.minY&&y<w.maxY&&z>w.minZ&&z<w.maxZ,`occluded organism vertex at ${time}: ${y},${z}`);
    }
  }
});

test('eyes remain real concave sockets, wings keep their bearing, and nested wheels retain clearance',()=>{
  const view=at(3),models=sourceRestCubeGeometryLibrary(),pivot=view.parts.find(p=>p.kind==='note-cube-core').cubePivot;
  assert.equal(view.diagnostics.eyes,228);assert.equal(view.parts.filter(p=>p.kind==='note-cube-wing').length,6);
  const radialBounds=parts=>{const radii=[];for(const part of parts){const m=models[part.mesh];for(let i=0;i<m.p.length;i+=3){const p=point(part,m.p.slice(i,i+3));radii.push(Math.hypot(...p.map((v,k)=>v-pivot[k])));}}return[Math.min(...radii),Math.max(...radii)];};
  let maximum=radialBounds(view.parts.filter(p=>p.cubieId))[1];
  for(let id=0;id<3;id++){
    const group=view.parts.filter(p=>p.wheelId===id),wheel=group.find(p=>p.kind==='note-cube-wheel');assert.equal(group.length,4);
    const bounds=radialBounds(group.filter(p=>p.kind!=='note-cube-wing'));assert.ok(bounds[0]>maximum);maximum=bounds[1];
    for(const wing of group.filter(p=>p.kind==='note-cube-wing'))assert.ok(Math.abs(Math.hypot(...wing.bearing.map((v,k)=>v-pivot[k]))-wheel.sx*6.05)<1e-8);
  }
  for(const name of['rest-note-cube-watch','rest-note-cube-wheel-watch']){
    assert.deepEqual(models[name].base,[0,0,0,1]);assert.equal(models[name].material,'dark');assert.equal(models[name].roughness,1);
  }
  assert.ok(models['rest-note-cube-watch'].p.some((v,i)=>i%3===0&&Math.abs(v-.865)<1e-9));
});
