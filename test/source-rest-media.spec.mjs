import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestMediaBeat,sourceRestMediaPlan,createSourceRestMediaPresentation} from '../src/platform/source-rest-media.js';
const frame=(time=0,patch={})=>({owner:'run:rest',phase:'wrong-return',rest:{mode:'seated',narrativeProgress:.2,presentation:{}},
  music:{currentTime:time,duration:716.4,playing:true},...patch});
function fixture(){const calls=[],director={beginStudy:async(plan,options)=>{calls.push(['begin',plan,options]);return{native:true};},
  endStudy:async key=>calls.push(['end',key]),compositionEvent:event=>calls.push(['event',event]),holdComposition:held=>calls.push(['hold',held])};
  return{calls,presenter:createSourceRestMediaPresentation({director,diagnosticLegacy:true})};}
test('the actual performance position selects one current media relationship on late arrival',()=>{
  assert.equal(sourceRestMediaBeat(frame(0)).id,'funeral');assert.equal(sourceRestMediaBeat(frame(420)).id,'return');
  assert.equal(sourceRestMediaBeat(frame(0,{rest:{mode:'idle'}})),null);
  assert.equal(sourceRestMediaBeat(frame(0,{rest:{mode:'seated',narrativeProgress:.96}})),null);
  assert.equal(sourceRestMediaBeat(frame(420,{rest:{mode:'seated',memory:{listener:'practice'}}})).id,'making');
  assert.equal(sourceRestMediaBeat(frame(80,{rest:{mode:'seated',weather:{stormAge:14}}})).id,'weather');
  for(const phase of ['wrong-return','catch']){
    const plan=sourceRestMediaPlan({phase,initial:'weather',reducedMotion:true,flashMode:'off'});
    assert.equal(plan.purpose,'source-study');assert.equal(plan.score.loop,false);assert.equal(plan.surfaces.length,2);
    assert.deepEqual(plan.surfaces.map(p=>p.content.assetId),['clouds','eclipse']);
    assert.ok(plan.score.cues.every(c=>c.event&&!Object.hasOwn(c,'atMs')),'frame/wall time cannot advance musical edits');
    assert.ok(plan.score.cues.every(c=>c.operations[0].durationMs===0));
  }
});
test('one native composition persists across beats without recurring geometry restore or replaying missed cues',async()=>{
  const f=fixture();f.presenter.update(frame(420));await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);
  assert.equal(f.presenter.snapshot().beat,'return');
  f.presenter.update(frame(560));f.presenter.update(frame(560));
  assert.deepEqual(f.calls.filter(c=>c[0]==='event').map(c=>c[1]),['rest:failing']);
  assert.equal(f.calls.filter(c=>c[0]==='end').length,0);
  f.presenter.update(frame(560,{rest:{mode:'standing'}}));await f.presenter.whenIdle();
  assert.equal(f.calls.filter(c=>c[0]==='end').length,1);
});
test('a paused sitting holds its windows and reconciles one current cue on resume',async()=>{
  const f=fixture();f.presenter.update(frame(0));await f.presenter.whenIdle();
  f.presenter.update(frame(560,{held:true}));assert.equal(f.calls.filter(c=>c[0]==='event').length,0);
  f.presenter.update(frame(560));assert.deepEqual(f.calls.filter(c=>c[0]==='event').map(c=>c[1]),['rest:failing']);
});
test('a world vision receives its own media, then returns to the still-continuing song chapter',async()=>{
  const f=fixture();f.presenter.update(frame(420));await f.presenter.whenIdle();
  f.presenter.update(frame(421,{rest:{mode:'seated',memory:{listener:'practice'}}}));
  f.presenter.update(frame(425));
  assert.deepEqual(f.calls.filter(c=>c[0]==='event').map(c=>c[1]),['rest:making','rest:return']);
});
test('a cancelled fullscreen/prewarm handoff never creates late windows',async()=>{
  let ready;const wait=new Promise(resolve=>ready=resolve),calls=[];
  const presenter=createSourceRestMediaPresentation({diagnosticLegacy:true,beforeBegin:()=>wait,director:{beginStudy:()=>calls.push('begin'),endStudy:()=>calls.push('end')}});
  presenter.update(frame());await Promise.resolve();presenter.stop();ready();await presenter.whenIdle();
  assert.ok(!calls.includes('begin'));assert.equal(presenter.snapshot().owner,null);
});


test('production apertures receive the existing visual-effects and reduced-dread preferences',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('const restMedia=createSourceRestMediaPresentation('),end=main.indexOf('scene=createSourceContinuationScene',start),block=main.slice(start,end),source=block.match(/getSettings:([^]*?),\n  \}\);/)[1];
  let enabled=true,reduced=false;
  const getSettings=Function('shakeMode','flashMode','visualEffectsEnabled','getSave','return ('+source+');')(()=> 'full',()=> 'reduced',()=>enabled,()=>({settings:{reduceDread:reduced}}));
  assert.equal(getSettings().effectsMode,'reduced');assert.equal(getSettings().reduceDread,false);
  enabled=false;reduced=true;assert.equal(getSettings().effectsMode,'off');assert.equal(getSettings().reduceDread,true);
});
