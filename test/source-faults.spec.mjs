import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySourceObjectGlitch, applySourcePs2GeometryFault, sourceFaultFrame } from '../src/game/source-faults.js';

test('Source faults exist only from Source proper through the pre-Horizon boundary',()=>{
  assert.equal(sourceFaultFrame({sourcePhase:false}).active,false);
  assert.equal(sourceFaultFrame({sourcePhase:true,horizon:true}).active,false);
  const proper=sourceFaultFrame({sourcePhase:true,timeMs:9000,flashMode:'off'});
  const reveal=sourceFaultFrame({sourcePhase:true,transitionElapsedMs:0,timeMs:9000,flashMode:'off'});
  assert.equal(proper.active,true);
  assert.ok(reveal.nvme>proper.nvme);
  assert.ok(reveal.ps2>proper.ps2);
  assert.equal(reveal.flashMode,'off');
});

test('bad-sector overflow is a visible scored run and never leaks into the white approach',()=>{
  const approach=sourceFaultFrame({sourcePhase:true,proper:false,timeMs:1000});
  assert.equal(approach.overflowActive,false);
  assert.equal(approach.overflow,0);

  const starts=[];
  let previous=false;
  let strong=null;
  for(let timeMs=0;timeMs<=15000;timeMs+=25){
    const frame=sourceFaultFrame({sourcePhase:true,proper:true,timeMs,seed:193});
    if(frame.overflowActive&&!previous)starts.push({timeMs,run:frame.overflowRun});
    if(frame.overflow>.8&&!strong)strong={timeMs,frame};
    previous=frame.overflowActive;
  }
  assert.ok(starts.length>=3,'a player sees several discrete runs during Source proper');
  assert.ok(strong,'a run reaches a clearly visible strength');
  assert.ok(strong.frame.overflowHead>0&&strong.frame.overflowHead<1);
  assert.ok(Number.isInteger(strong.frame.overflowLane)&&strong.frame.overflowLane>=0&&strong.frame.overflowLane<=3);
  assert.ok([-1,1].includes(strong.frame.overflowDirection));

  const reduced=sourceFaultFrame({sourcePhase:true,proper:true,timeMs:strong.timeMs,seed:193,reducedMotion:true});
  assert.equal(Math.round(reduced.overflowHead*6),reduced.overflowHead*6,
    'reduced motion advances the run in six readable steps');
});

test('PS2 object deformation is deterministic, bounded, and render-only',()=>{
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const instances=Array.from({length:256},(_,index)=>({id:`source-object-${index}`,matrix:new Float32Array(identity)}));
  const frame=sourceFaultFrame({sourcePhase:true,transitionElapsedMs:0,timeMs:340});
  const first=applySourcePs2GeometryFault(instances,frame);
  const second=applySourcePs2GeometryFault(instances,frame);
  assert.deepEqual(first,second);
  assert.ok(first.some((instance)=>instance.sourceFaulted));
  assert.ok(instances.every((instance)=>!instance.sourceFaulted&&instance.matrix.every((value,index)=>value===identity[index])),'authoritative instances remain untouched');
  for(const instance of first.filter((entry)=>entry.sourceFaulted)){
    assert.ok(Math.abs(instance.matrix[12])<=.21);
    assert.ok(Math.abs(instance.matrix[14])<=.14);
  }
});

function objectGlitchFixture(id,x,z,extra={}){
  return {id,mesh:'shared-mesh',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,x,0,z,1],structural:true,sourceGlitchEligible:true,...extra};
}

function strongObjectGlitchFrame(options={}){
  return Array.from({length:84},(_,i)=>sourceFaultFrame({sourcePhase:true,timeMs:i*50,...options}))
    .find(frame=>frame.overflow>.8);
}

test('each treatment uses the same single instance and leaves its matrix intact',()=>{
  const first=objectGlitchFixture('first',2,0);
  const second=objectGlitchFixture('second',9,0);
  const original=[first,second],active=strongObjectGlitchFrame();
  const selection={},centre={x:2,y:0,z:0};
  assert.equal(applySourceObjectGlitch(original,active,{mode:0}),original,'preview can turn the treatments off');
  for(const mode of [1,2,3]){
    const stamped=applySourceObjectGlitch(original,active,{mode,selection,centre});
    assert.deepEqual(stamped[0].sourceObjectGlitch.slice(0,3),[mode,active.overflowHead,active.overflow]);
    assert.equal(stamped[1],second,'another copy of the same mesh keeps its own material');
    assert.equal(first.sourceObjectGlitch,undefined);
    assert.equal(applySourcePs2GeometryFault(stamped,active)[0].matrix,first.matrix);
  }
  assert.equal(selection.targetId,first.id);
});

test('a scored fault holds its target through movement and reacquires on the next run',()=>{
  const first=objectGlitchFixture('first',4,0),second=objectGlitchFixture('second',12,0);
  const original=[first,second],active=strongObjectGlitchFrame(),selection={};
  const opt={mode:2,selection,eye:{x:0,y:0,z:0,forwardX:1,forwardZ:0}};
  const chosen=applySourceObjectGlitch(original,active,opt)[0];
  assert.equal(selection.targetId,first.id);
  opt.eye={...opt.eye,x:8};
  const reverse=[second,first];
  const moved=applySourceObjectGlitch(reverse,active,opt)[1];
  assert.deepEqual(moved.sourceObjectGlitch,chosen.sourceObjectGlitch,'camera travel and instance order leave the read on the same object');
  const withoutTarget=[second];
  assert.equal(applySourceObjectGlitch(withoutTarget,active,opt),withoutTarget,'a culled object cannot jump the fault to another mesh');
  applySourceObjectGlitch(original,{...active,overflowRun:active.overflowRun+1},opt);
  assert.equal(selection.targetId,second.id);
});

test('fragment mixing borrows a different eligible mesh and holds it through the burst',()=>{
  const target=objectGlitchFixture('target',2,0);
  const duplicate=objectGlitchFixture('duplicate',3,0);
  const excluded=objectGlitchFixture('excluded',4,0,{mesh:'stair',sourceConnector:'crossing'});
  const near=objectGlitchFixture('near',5,0,{mesh:'table'});
  const far=objectGlitchFixture('far',12,0,{mesh:'stand'});
  const active=strongObjectGlitchFrame(),selection={},centre={x:2,y:0,z:0};
  const opts={mode:3,selection,centre};
  const mixed=applySourceObjectGlitch([target,duplicate,excluded,far,near],active,opts);
  assert.equal(mixed[0].sourceObjectGlitchDonor,'table');
  assert.equal(mixed[4],near,'the donor draw instance stays untouched');
  assert.equal(applySourceObjectGlitch([far,target],active,opts)[1].sourceObjectGlitchDonor,'table');
  assert.equal(applySourceObjectGlitch([target,near],active,{...opts,mode:1})[0].sourceObjectGlitchDonor,undefined);
  const next={...active,overflowRun:active.overflowRun+1};
  assert.equal(applySourceObjectGlitch([target,duplicate,excluded],next,opts)[0].sourceObjectGlitchDonor,undefined);
  assert.equal(selection.donorMesh,null);
});

test('normal Source play varies the treatment and admits one mesh mix per eight scored faults',()=>{
  const target=objectGlitchFixture('cabinet',6,0);
  const donor=objectGlitchFixture('donor',10,10,{mesh:'piano'});
  const eye={x:0,y:0,z:0,forwardX:1,forwardZ:0};
  const active=strongObjectGlitchFrame();
  const decisions=(entries,objectSeed)=>{
    const selection={};
    return Array.from({length:32},(_,overflowRun)=>{
      const result=applySourceObjectGlitch(entries,{...active,overflowRun},{eye,objectSeed,selection});
      const treated=result.find(instance=>instance.sourceObjectGlitch);
      assert.ok(treated);
      assert.equal(treated.sourceObjectGlitch[0],selection.mode);
      return {mode:selection.mode,donor:treated.sourceObjectGlitchDonor,pattern:treated.sourceObjectGlitch[3]};
    });
  };
  const entries=[target,donor],scheduled=decisions(entries,4417);
  assert.deepEqual(scheduled,decisions([...entries].reverse(),4417),'the same run is independent of submission order');
  assert.notDeepEqual(scheduled,decisions(entries,727),'Source seed drives the pattern without touching the desktop score');
  const mixes=scheduled.flatMap((beat,index)=>beat.mode===3?[index]:[]);
  assert.equal(mixes.length,4);
  assert.deepEqual(mixes.slice(1).map((index,i)=>index-mixes[i]),[8,8,8]);
  assert.equal(new Set(scheduled.map(beat=>beat.mode)).size,3);
  assert.equal(new Set(scheduled.map(beat=>beat.pattern)).size,32);
  assert.ok(scheduled.filter(beat=>beat.mode===3).every(beat=>beat.donor));
  assert.ok(decisions([target],4417).every(beat=>beat.mode!==3),'a missing donor falls back to a common treatment');
});

test('a natural read can acquire a newly visible object early and leaves later frames alone',()=>{
  const subject=objectGlitchFixture('first',4,0);
  const entries=[subject],selection={},active=strongObjectGlitchFrame();
  const options={selection,eye:{x:0,y:0,z:0,forwardX:-1,forwardZ:0}};
  assert.equal(applySourceObjectGlitch(entries,{...active,overflowHead:.10},options),entries);
  options.eye.forwardX=1;
  const during=applySourceObjectGlitch(entries,{...active,overflowHead:.40},options);
  assert.equal(during[0].id,subject.id);
  assert.ok(during[0].sourceObjectGlitch);
  options.eye.forwardX=-1;
  assert.ok(applySourceObjectGlitch(entries,{...active,overflowHead:.55},options)[0].sourceObjectGlitch);
  assert.equal(applySourceObjectGlitch(entries,{...active,overflowRun:active.overflowRun+1,overflowHead:.55},
    {...options,eye:{...options.eye,forwardX:1}}),entries);
});

test('different target parities cannot suppress a common treatment across the walk',()=>{
  const entries=[objectGlitchFixture('first',8,0),objectGlitchFixture('second',8,50)];
  const active=strongObjectGlitchFrame(),selection={};
  const modes=Array.from({length:6},(_,run)=>{
    const eye={x:0,y:0,z:run%2?50:0,forwardX:1,forwardZ:0};
    const context={eye,selection,objectSeed:4417};
    const frame={...active,overflowRun:run};
    const applied=applySourceObjectGlitch(entries,frame,context).find(instance=>instance.sourceObjectGlitch);
    assert.equal(applied.id,run%2?'second':'first');
    assert.deepEqual(applySourceObjectGlitch(entries,{...frame,overflowHead:.7},context)
      .find(instance=>instance.sourceObjectGlitch).sourceObjectGlitch.slice(0,1),applied.sourceObjectGlitch.slice(0,1));
    return selection.mode;
  });
  assert.deepEqual(modes,[1,1,2,1,1,2]);
});

test('a comparable visible object gets a turn before the last target repeats',()=>{
  const first=objectGlitchFixture('first',8,1),second=objectGlitchFixture('second',8,-1);
  const entries=[first,second],selection={},active=strongObjectGlitchFrame();
  const options={selection,eye:{x:0,y:0,z:0,forwardX:1,forwardZ:0}};
  applySourceObjectGlitch(entries,active,options);
  const previous=selection.targetId;
  applySourceObjectGlitch(entries,{...active,overflowRun:active.overflowRun+1},options);
  assert.notEqual(selection.targetId,previous);
});

test('route geometry, actors, text, fixtures, and reduced effects have explicit bounds',()=>{
  const active=strongObjectGlitchFrame(),reduced=strongObjectGlitchFrame({reducedMotion:true});
  const rejects=[{sourceGlitchEligible:false},{sourceGlitchEligible:undefined,roomMemory:{role:'survivor'}},
    {sourceDoorId:'door'},{sourceConnector:'crossing'},{character:{}},{sourceMemoryFixture:true},{sourceCodeOnly:true},{paperIndex:0}];
  for(const extra of rejects){
    const only=[objectGlitchFixture('excluded',4,0,extra)];
    assert.equal(applySourceObjectGlitch(only,active,{mode:1}),only);
  }
  const survivor=[objectGlitchFixture('survivor',4,0,{structural:false,sourceGlitchEligible:undefined,roomMemory:{role:'survivor'}})];
  assert.equal(applySourceObjectGlitch(survivor,{...active,flashMode:'off'},{mode:1}),survivor);
  const treated=applySourceObjectGlitch(survivor,reduced,{mode:1})[0];
  assert.ok(treated.sourceObjectGlitch[2]<reduced.overflow);
});

test('Source limits in-world corruption to prop instances and keeps the desktop terminal effect',()=>{
  const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const windows=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/SOURCE_FAULT_FRAG|runSourceFaultPass|sourceFaultTex[AB]/);
  assert.match(main,/submittedInstances=applySourceObjectGlitch\(visibleInstances,glitchFrame,/);
  assert.match(main,/windowChoreography\?\.sourceFault\?\.\(sourceFault\)/);
  assert.match(windows,/nvme-sector/);
  assert.doesNotMatch(windows,/uPs2|ps2uv|SOURCE_FAULT_FRAG/);
});

test('the runtime explicitly arms overflow only after the Source proper threshold',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const call=main.match(/const sourceFault=(sourceFaultFrame\(\{[\s\S]*?\}\));/)?.[1];
  assert.ok(call,'main must submit an explicit Source fault frame');
  const frameFor=new Function('sourceFaultFrame','sourceVoid','firstNothingness',
    'sourceFaultTransitionStartedAt','performance','reducedMotion','flashMode',`return ${call};`);
  const faultAt=(proper,firstNothingness)=>frameFor(sourceFaultFrame,{proper},firstNothingness,
    0,{now:()=>9000},false,()=> 'full');
  assert.equal(faultAt(false,false).active,false,'Scene Dock cannot arm Source faults');
  assert.equal(faultAt(true,false).active,true,'later Source proper retains its corruption');
  assert.equal(faultAt(true,true).active,false,'the first nothingness remains clear even with a stale proper flag');
});
