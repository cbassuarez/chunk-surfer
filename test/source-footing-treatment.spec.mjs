import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSourceFootingTreatment,SOURCE_FOOTING_LIMITS as C} from '../src/audio/source-footing-treatment.js';
import {resolveFootContact} from '../src/audio/foot-contact.js';
import {MATERIAL} from '../src/data/floorplan/legend.js';
import {SOURCE_BRAIDED_DIVIDE,sourceDivideZ,sourceDivideGroundAt} from '../src/data/source-braided-divide.js';

const progress = value => ({domainCondition:{progress:value}});
function natural(value,label){
  assert.equal(value.gaitTreatment,'natural',label);
  assert.equal(value.humanize,1,label);
  assert.equal(value.resistanceStrength,0,label);
  assert.equal(value.responseLagSeconds,0,label);
  assert.equal(value.responseLagWanderSeconds,0,label);
}

test('actual compiled supports tighten the field and impose regularity on paths and faults',()=>{
  for(const [materialId,tone]of [[MATERIAL.sourceField,'field'],[MATERIAL.sourcePath,'path'],[MATERIAL.sourceFault,'fault']]){
    const footing=resolveFootContact({materialId});
    assert.equal(footing.profile,'compiled');assert.equal(footing.tone,tone);
    const entry=resolveSourceFootingTreatment({...footing,...progress(0)});
    const deep=resolveSourceFootingTreatment({...footing,...progress(1)});
    if(tone==='field'){
      assert.equal(entry.gaitTreatment,'natural');assert.equal(entry.humanize,1);
      assert.equal(deep.gaitTreatment,'natural');assert.equal(deep.humanize,.45);
    }else{
      assert.equal(entry.gaitTreatment,'locked');assert.equal(entry.humanize,0);
      assert.equal(deep.gaitTreatment,'locked');assert.equal(deep.humanize,0);
    }
    assert.equal(deep.responseLagSeconds,0,'compiled recurrence does not add another late-response treatment');
  }
});

test('direct compiled profile names have the same bounded production behavior',()=>{
  const path=resolveSourceFootingTreatment({surface:'tile',profile:'compiled-path'});
  assert.equal(path.gaitTreatment,'locked');
  const field=resolveSourceFootingTreatment({surface:'tile',profile:'compiled-field',...progress(.5)});
  assert.equal(field.gaitTreatment,'natural');assert.equal(field.humanize,.725);
});

test('the explicitly supported Braided Divide field tightens before its actual final-rise lock',()=>{
  assert.equal(C.divideLockProgress,SOURCE_BRAIDED_DIVIDE.finalRise.from/SOURCE_BRAIDED_DIVIDE.length,
    'the acoustic handoff must follow the production final rise if its geometry is revised');
  const footing=resolveFootContact({materialId:MATERIAL.sourceField,sourceDomain:'compiled-divide'});
  const entry=resolveSourceFootingTreatment({...footing,...progress(0)});
  const middle=resolveSourceFootingTreatment({...footing,...progress(.325)});
  const tightened=resolveSourceFootingTreatment({...footing,...progress(.65)});
  const beforeRise=resolveSourceFootingTreatment({...footing,...progress(118/150-1e-9)});
  assert.equal(entry.gaitTreatment,'natural');assert.equal(entry.humanize,1);
  assert.equal(middle.gaitTreatment,'natural');assert.equal(middle.humanize,.725);
  assert.equal(tightened.gaitTreatment,'natural');assert.equal(tightened.humanize,.45);
  assert.equal(beforeRise.gaitTreatment,'natural');assert.equal(beforeRise.humanize,.45);
  for(const depth of [118,146,148,150]){
    assert.ok(Number.isFinite(sourceDivideGroundAt(0,sourceDivideZ(depth))),`actual supported depth${depth}m`);
    const final=resolveSourceFootingTreatment({...footing,...progress(depth/150)});
    assert.equal(final.gaitTreatment,'locked',`supported depth${depth}m`);
    assert.equal(final.humanize,0);assert.equal(final.footingTreatment,'compiled-divide-lock');
    assert.equal(final.responseLagSeconds,0);assert.equal(final.resistanceStrength,0);
  }
});

test('the Divide lock requires its explicit field domain and cannot replace a physical support',()=>{
  const generic=resolveSourceFootingTreatment({surface:'tile',profile:'compiled',tone:'field',...progress(1)});
  assert.equal(generic.gaitTreatment,'natural');assert.equal(generic.humanize,.45);
  for(const surface of ['paper','wood','carpet','stone','concrete'])
    natural(resolveSourceFootingTreatment({surface,profile:'compiled',tone:'field',sourceDomain:'compiled-divide',...progress(1)}),surface);
  natural(resolveSourceFootingTreatment({surface:'void',profile:'physical',sourceDomain:'compiled-divide',...progress(1)}));
});

test('the actual living bus corridor receives resistance without delaying its dry or moving the body',()=>{
  const footing=resolveFootContact({materialId:MATERIAL.sourceVoid,busBody:true,sourceDomain:'body-corridor'});
  assert.equal(footing.surface,'body');assert.equal(footing.profile,'physical');
  for(const [p,amount]of [[0,.7],[.5,.85],[1,1]]){
    const treatment=resolveSourceFootingTreatment({...footing,...progress(p)});
    assert.equal(treatment.gaitTreatment,'resistance');
    assert.equal(treatment.resistanceStrength,amount);
    assert.equal(treatment.humanize,1);
    assert.equal(treatment.responseLagSeconds,0);
    for(const key of ['moveScale','speed','supported','surface','owner','noise','recording','playerPosition'])
      assert.equal(Object.hasOwn(treatment,key),false,`${key} remains with its existing owner`);
  }
});

test('bodily Source support requires an explicit bodily support and real Source context',()=>{
  natural(resolveSourceFootingTreatment({surface:'body',profile:'physical'}));
  assert.equal(resolveSourceFootingTreatment({surface:'body',profile:'physical',sourceActive:true}).gaitTreatment,'resistance');
  natural(resolveSourceFootingTreatment({surface:'metal',profile:'physical',sourceDomain:'body-corridor',sourceActive:true}));
  natural(resolveSourceFootingTreatment({surface:'body',profile:'compiled-path'}));
});

test('absence and white walk lag only the existing surface response within a finite ceiling',()=>{
  for(const [domain,min,max,kind]of [
    ['nothingness',.045,.075,'absence-lag'],['white-walk',.07,.095,'white-walk-lag'],
    ['source-iv',.07,.095,'white-walk-lag'],['source-iv-sheet',.07,.095,'white-walk-lag'],
  ]){
    const entry=resolveSourceFootingTreatment({surface:'tile',profile:'glazed',sourceDomain:domain,...progress(0)});
    const deep=resolveSourceFootingTreatment({surface:'tile',profile:'glazed',sourceDomain:domain,...progress(1)});
    assert.equal(entry.footingTreatment,kind);assert.equal(entry.responseLagSeconds,min);
    assert.equal(deep.responseLagSeconds,max);
    for(const treatment of [entry,deep]){
      assert.equal(treatment.gaitTreatment,'natural');assert.equal(treatment.humanize,1);
      assert.equal(treatment.resistanceStrength,0);
      assert.ok(treatment.responseLagWanderSeconds>=0&&treatment.responseLagWanderSeconds<=C.maxResponseLagWanderSeconds);
      assert.ok(treatment.responseLagSeconds+treatment.responseLagWanderSeconds<=C.maxResponseLagSeconds+1e-12);
      assert.equal(Object.hasOwn(treatment,'dryDelaySeconds'),false,'the reliable dry contact is not postponed');
    }
  }
});

test('the actual erased tape receives only a bounded response lag and keeps a natural contact clock',()=>{
  const footing=resolveFootContact({materialId:MATERIAL.none,horizon:{active:true,onTape:true},sourceDomain:'horizon'});
  assert.equal(footing.profile,'erased');assert.equal(footing.surface,'void');
  const entry=resolveSourceFootingTreatment({...footing,...progress(0)});
  const deep=resolveSourceFootingTreatment({...footing,...progress(1)});
  assert.equal(entry.responseLagSeconds,.08);assert.equal(deep.responseLagSeconds,.095);
  assert.equal(deep.footingTreatment,'erased-lag');
  assert.equal(deep.gaitTreatment,'natural');assert.equal(deep.humanize,1);
  assert.equal(deep.resistanceStrength,0);
});

test('remembered street and retained physical domains override broad Source presentation labels',()=>{
  for(const sourceDomain of ['outskirts','remembered-street','chapel-outskirts','bells','scene-dock',
    'coastal-memory','source-ii','source-continuation','ellery-aside','source-earthfall:ellery']){
    natural(resolveSourceFootingTreatment({surface:'tile',profile:'compiled-path',sourceDomain,...progress(1)}),sourceDomain);
    natural(resolveSourceFootingTreatment({surface:'tile',profile:'glazed',sourceDomain,...progress(1)}),sourceDomain);
  }
});

test('real shore, paper, Source II instruments and Ellery construction keep the natural baseline',()=>{
  for(const footing of [
    resolveFootContact({materialId:MATERIAL.sourceVoid,shore:{active:true,surface:'ledge'}}),
    resolveFootContact({materialId:MATERIAL.sourceVoid,shore:{active:true,surface:'lift'}}),
    resolveFootContact({materialId:MATERIAL.sourcePage}),
    resolveFootContact({surface:'piano-wood'}),resolveFootContact({surface:'case-lining'}),
    resolveFootContact({surface:'cold-stone'}),resolveFootContact({surface:'coastal-earth',sourceDomain:'coastal-memory'}),
    resolveFootContact({surface:'service-concrete',sourceDomain:'source-earthfall:ellery'}),
  ])natural(resolveSourceFootingTreatment({...footing,sourceActive:true,...progress(1)}),footing.surface);
});

test('a real physical covering or support wins over an inconsistent abstract profile',()=>{
  for(const surface of ['wood','carpet','paper','stone','concrete','tarmac','water','snow','ash','grass','metal'])
    natural(resolveSourceFootingTreatment({surface,profile:'glazed',sourceActive:true,...progress(1)}),surface);
  natural(resolveSourceFootingTreatment({surface:'tile',covering:'paper',profile:'compiled-fault'}));
});

test('sourceVoid and phase names alone do not activate any of the three exceptions',()=>{
  for(const input of [{materialId:MATERIAL.sourceVoid},{materialId:MATERIAL.sourceVoid,sourcePhase:'horizon'},
    {materialId:MATERIAL.sourceVoid,sourcePhase:'landscape'}]){
    const footing=resolveFootContact(input);
    natural(resolveSourceFootingTreatment({...footing,sourceActive:true,...progress(1)}));
  }
  natural(resolveSourceFootingTreatment({surface:'void',profile:'physical',sourceActive:true}));
});

test('progress is bounded, absent progress starts at entry, and the resolver has no hidden state',()=>{
  const descriptor={surface:'tile',profile:'glazed',sourceDomain:'source-iv',domainCondition:{progress:.3}};
  const before=JSON.stringify(descriptor),first=resolveSourceFootingTreatment(descriptor);
  assert.equal(JSON.stringify(descriptor),before);
  assert.deepEqual(resolveSourceFootingTreatment(descriptor),first);
  assert.ok(Object.isFrozen(first));
  for(const p of [undefined,NaN,Infinity,-Infinity,'1',-3]){
    const result=resolveSourceFootingTreatment({...descriptor,...progress(p)});
    assert.equal(result.treatmentProgress,0);assert.equal(result.responseLagSeconds,.07);
  }
  const max=resolveSourceFootingTreatment({...descriptor,...progress(8)});
  assert.equal(max.treatmentProgress,1);assert.equal(max.responseLagSeconds,.095);
});
