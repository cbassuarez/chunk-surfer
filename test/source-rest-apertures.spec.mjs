import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestAperturePair,sourceRestAperturePairAsync,sourceRestOwnedFramesValid,SOURCE_REST_APERTURES} from '../src/render/source-rest-apertures.js';
import {createSourceRestMediaPresentation,sourceRestAperturePlan} from '../src/platform/source-rest-media.js';
import {sourceRestApertureFrame} from '../src/render/source-rest-aperture-frame.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const geometry=[{id:'actual-chamber',role:'chamber',p:[-1,-1,0,1,-1,0,0,1,0],i:[0,1,2],base:[.6,.4,.2,1],matrix}];
const sample=(patch={})=>({phase:'wrong-return',mediaTime:160,eye:[0,0,4],basis:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},geometry,...patch});
const tick=(patch={})=>({owner:'one-rest',phase:'wrong-return',music:{currentTime:160,duration:716.4},rest:{mode:'seated',narrativeProgress:.3},...patch});
const png=(w=240,h=160)=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return'data:image/png;base64,'+b.toString('base64');};
const encoded=()=>['rest:source','rest:answer'].map(surfaceId=>({surfaceId,dataUrl:png()}));
function harness(options={}){
  let time=0,current=sample();const calls=[];
  const director={beginStudy:async(plan,{key})=>{calls.push(['begin',plan,key]);return{native:true};},
    updateStudyFrames:async value=>{calls.push(['frames',value]);return true;},endStudy:async key=>calls.push(['end',key]),
    holdComposition:value=>calls.push(['hold',value]),compositionEvent:value=>calls.push(['event',value])};
  const presenter=createSourceRestMediaPresentation({director,getFrame:()=>current,encodePair:encoded,now:()=>time,...options});
  return{presenter,calls,setTime:v=>{time=v;},setFrame:v=>{current=v;},director};
}
test('a pair contains deterministic actual geometry with incompatible nested views and bounded work',()=>{
  const a=sourceRestAperturePair(sample()),b=sourceRestAperturePair(sample({mediaTime:555,signal:1}));
  assert.equal(a.frames.length,2);assert.deepEqual(a.frames,b.frames,'a new note clock never invents motion');
  assert.notDeepEqual(a.frames[0].rgba,a.frames[1].rgba);
  assert.deepEqual(a.diagnostics.sourceIds,['actual-chamber']);assert.equal(a.diagnostics.newWorldGeometry,false);
  assert.equal(a.diagnostics.recursiveDepth,2);assert.ok(a.diagnostics.selectedTriangles<=384);assert.ok(a.diagnostics.rasterWork<=180000);
  for(const frame of a.frames){assert.equal(frame.width,240);assert.equal(frame.height,160);assert.equal(frame.rgba.length,240*160*4);}
});
test('both production listening places provide material-bearing bounded source meshes without a graphics context',()=>{
  const notes={duration:716.4,notes:[{id:'note',onset:159.8,duration:.8,midi:67,velocity:.8,confidence:1}]};
  for(const seat of SOURCE_REST_SEATS){
    const state={...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{seatId:seat.id,mode:'seated',progress:1,degradation:.3,musicTime:160,musicSignal:.4,look:seat.view}},
      world=sourceContinuationRenderFrame(state,{noteScore:notes}),frame=sourceRestApertureFrame(world,state),pair=sourceRestAperturePair(frame);
    assert.ok(pair);assert.ok(pair.diagnostics.drawnTriangles>12);assert.ok(pair.diagnostics.candidateTriangles<=SOURCE_REST_APERTURES.maxCandidateTriangles);
    assert.ok(pair.diagnostics.selectedTriangles<=384);assert.ok(pair.diagnostics.rasterWork<=180000);
    assert.ok(pair.diagnostics.sourceIds.every(id=>frame.geometry.some(g=>g.id===id)));
    assert.ok(pair.frames.every(frame=>new Set(frame.rgba).size>12),'the actual forms produce multiple material tones');
  }
});
test('malformed or missing geometry yields no invented replacement, and oversized output is clamped',()=>{
  assert.equal(sourceRestAperturePair(sample({geometry:[]})),null);
  assert.equal(sourceRestAperturePair(sample({phase:'outside'})),null);
  assert.equal(sourceRestAperturePair(sample({geometry:[{...geometry[0],matrix:[NaN]}]})),null);
  const p=sourceRestAperturePair(sample(),{width:99999,height:99999});assert.equal(p.frames[0].width,240);assert.equal(p.frames[0].height,160);
});
test('owned content accepts only known bounded PNG frames, never other URIs or duplicate panes',()=>{
  assert.equal(sourceRestOwnedFramesValid(encoded()),true);
  for(const frames of [[],[...encoded(),encoded()[0]],[encoded()[0],encoded()[0]],[{surfaceId:'other',dataUrl:png()}],[{surfaceId:'rest:source',dataUrl:'https://outside.test/a.png'}],[{surfaceId:'rest:source',dataUrl:png(241)}],[{surfaceId:'rest:source',dataUrl:'data:image/png;base64,eA=='}]])assert.equal(sourceRestOwnedFramesValid(frames),false);
});
test('runtime opens one source-owned pair, changes at most twice per second, and skips identical transforms',async()=>{
  const f=harness();f.presenter.update(tick());await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);assert.equal(f.calls.filter(c=>c[0]==='frames').length,1);
  const plan=f.calls.find(c=>c[0]==='begin')[1];assert.ok(plan.surfaces.every(p=>p.content.kind==='procedural'));assert.equal(plan.score.cues.length,3);
  f.setTime(501);f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='frames').length,1);
  const moved=sample({geometry:[{...geometry[0],matrix:matrix.map((v,k)=>k===12?v+.2:v)}]});f.setFrame(moved);
  f.setTime(200);f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='frames').length,1);
  f.setTime(501);f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='frames').length,2);
  assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);assert.equal(f.calls.filter(c=>c[0]==='end').length,0);
});
test('changed canonical vertices are not confused with unchanged lengths or a second music clock',async()=>{
  const f=harness();f.presenter.update(tick());await f.presenter.whenIdle();f.setTime(500);
  const changed={...geometry[0],p:[-1,-1,0,1,-1,0,0,1.4,0],revision:0};
  f.setFrame(sample({geometry:[changed]}));f.presenter.update(tick());await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='frames').length,2);
  f.setTime(1000);changed.p[0]-=.2;changed.revision++;f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='frames').length,3,'an explicitly versioned in-place deformation is a new supplied pose');
});
test('missing geometry never starts a random-film fallback, even on a late arrival',async()=>{
  const f=harness();f.setFrame(null);f.presenter.update(tick({music:{currentTime:650,duration:716}}));await f.presenter.whenIdle();
  assert.equal(f.calls.length,0);assert.equal(f.presenter.snapshot().owner,null);
});
test('only actual memory or weather can substitute a film, and the architecture resumes afterward',async()=>{
  const f=harness();f.presenter.update(tick());await f.presenter.whenIdle();f.setTime(500);
  f.presenter.update(tick({rest:{mode:'seated',memory:{listener:'practice'}}}));await f.presenter.whenIdle();
  assert.deepEqual(f.calls.filter(c=>c[0]==='event').map(c=>c[1]),['aperture:making']);assert.deepEqual(f.calls.filter(c=>c[0]==='frames').at(-1)[1].frames.map(v=>v.surfaceId),['rest:source']);
  f.setTime(1000);f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='frames').at(-1)[1].frames.length,2);
  assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);
});
test('pause stops CPU work and delivery, while reduced motion retains one stable still',async()=>{
  let renders=0;const f=harness({renderPair:v=>{renders++;return sourceRestAperturePair(v);}});
  f.presenter.update(tick({held:true}));await f.presenter.whenIdle();assert.equal(renders,0);
  f.presenter.update(tick());await f.presenter.whenIdle();f.setTime(500);f.setFrame(sample({revision:1}));f.presenter.update(tick({held:true}));await f.presenter.whenIdle();assert.equal(renders,1);
  f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(renders,2);
  const r=harness({getSettings:()=>({reducedMotion:true})});r.presenter.update(tick());await r.presenter.whenIdle();r.setTime(1000);r.setFrame(sample({revision:1}));r.presenter.update(tick());await r.presenter.whenIdle();assert.equal(r.calls.filter(c=>c[0]==='frames').length,1);
});
test('a hold arriving after reduced-motion dispatch retains that one pending still rather than retiring the lease',async()=>{
  let finish;const gate=new Promise(resolve=>finish=resolve),f=harness({getSettings:()=>({reducedMotion:true}),renderPair:sourceRestAperturePair});f.director.updateStudyFrames=async value=>{f.calls.push(['frames',value]);await gate;return true;};
  f.presenter.update(tick());for(let n=0;n<20&&!f.calls.some(c=>c[0]==='frames');n++)await Promise.resolve();assert.ok(f.calls.some(c=>c[0]==='frames'));
  f.presenter.update(tick({held:true}));finish();await f.presenter.whenIdle();f.setTime(1000);f.presenter.update(tick());await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='frames').length,1);assert.equal(f.calls.filter(c=>c[0]==='end').length,0);
});
test('black, disabled effects and reduced dread end the owned lease without late frame resurrection',async()=>{
  const f=harness();f.presenter.update(tick());await f.presenter.whenIdle();f.presenter.update(tick({rest:{mode:'seated',narrativeProgress:.96}}));await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='end').length,1);
  for(const settings of[{reduceDread:true},{effectsMode:'off'}]){const r=harness({getSettings:()=>settings});r.presenter.update(tick());await r.presenter.whenIdle();assert.equal(r.calls.length,0);}
});
test('a rejected frame retires cleanly rather than deadlocking its own asynchronous queue',async()=>{
  const f=harness();f.director.updateStudyFrames=async()=>false;f.presenter.update(tick());await f.presenter.whenIdle();await f.presenter.whenIdle();assert.equal(f.presenter.snapshot().owner,null);assert.equal(f.calls.filter(c=>c[0]==='end').length,1);
  f.presenter.update(tick());await f.presenter.whenIdle();assert.equal(f.calls.filter(c=>c[0]==='begin').length,1,'an unavailable optional surface is not reopened every game frame');
});
test('cooperative acquisition yields between real work and honours cancellation before making a late pair',async()=>{
  let yields=0;const actual=sourceRestAperturePair(sample()),asyncPair=await sourceRestAperturePairAsync(sample(),{yieldTask:async()=>{yields++;}});
  assert.deepEqual(asyncPair,actual);assert.ok(yields>=6);
  yields=0;assert.equal(await sourceRestAperturePairAsync(sample(),{yieldTask:async()=>{yields++;},isCurrent:()=>yields<3}),null);
});
test('cancellation during preparation invalidates frame delivery and retains the existing optional-window policy',async()=>{
  let release;const gate=new Promise(yes=>release=yes),f=harness({beforeBegin:()=>gate});f.presenter.update(tick());await Promise.resolve();void f.presenter.stop();release();await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='begin').length,0);assert.equal(f.calls.filter(c=>c[0]==='frames').length,0);
  const plan=sourceRestAperturePlan({phase:'catch',reducedMotion:true,flashMode:'off'});assert.equal(plan.purpose,'source-study');assert.ok(plan.surfaces.every(p=>!p.draggable&&p.sensitivity==='none'&&p.width<=240&&p.height<=160));assert.ok(plan.score.cues.every(c=>c.event));
});
