import test from 'node:test';
import assert from 'node:assert/strict';
import { freshEndingWrongDoorDemolition, stepEndingWrongDoorDemolition } from '../src/game/ending-wrong-door.js';
import { freshSourceIV, stepSourceIV } from '../src/game/source-iv.js';
import { endingSourceResume, endingSourceIVHandoff, endingSourceIVCanFinish } from '../src/game/ending-source-journey.js';
import { freshSourceEarthfall } from '../src/game/source-earthfall.js';
import { freshSourceContinuation } from '../src/game/source-continuation.js';
import { SOURCE_EARTHFALL as EARTH } from '../src/data/source-earthfall.js';
import { SOURCE_IV as IV } from '../src/data/source-iv.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';
import { freshRunRecord } from '../src/progression/schema.js';

const runId='ending-source-journey-test',copy=value=>JSON.parse(JSON.stringify(value));
const initial=()=>freshEndingWrongDoorDemolition({runId,returnPose:{x:254,y:367,yaw:.2,pitch:-.1}});
function advance(engine,state,seconds,input={}){
  const events=[];
  for(let time=0;time+1e-9<seconds;){const dt=Math.min(1/60,seconds-time),result=engine(state,{...input,dt});
    state=result.state;events.push(...result.events);time+=dt;}return{state,events};
}
function collapsed(){
  let state=advance(stepEndingWrongDoorDemolition,initial(),.25,{forward:1}).state;
  state=advance(stepEndingWrongDoorDemolition,state,10).state;
  const distance=state.physical.z-(EARTH.passage.exitZ+1.4);
  state=advance(stepEndingWrongDoorDemolition,state,distance/EARTH.walkSpeed,{forward:1}).state;
  state=stepEndingWrongDoorDemolition(state,{interact:true}).state;
  state=advance(stepEndingWrongDoorDemolition,state,EARTH.door.openSeconds).state;
  const result=advance(stepEndingWrongDoorDemolition,state,.6,{forward:1});
  assert.equal(result.state.status,'ready-for-source-IV');
  assert.equal(result.events.filter(event=>event.type==='enter-source-IV').length,1);return result.state;
}
function saveBase(){
  const save=freshSave({run:freshRunRecord({id:runId,now:1000})});
  save.flags['journey-preserved']=true;save.items=['recorder','torch'];save.takes=[{room:'amplifications',clean:true}];
  save.chunkSurf.sourceEarthfall=freshSourceEarthfall({runId});
  save.chunkSurf.sourceContinuation=freshSourceContinuation({runId});
  save.chunkSurf.sourceDemolition={...save.chunkSurf.sourceDemolition,committed:true,status:'active',elapsed:4,clock:4};
  return save;
}
function hostFields(save){return copy({chunkSurf:save.chunkSurf,flags:save.flags,items:save.items,takes:save.takes,
  sourceDrive:save.sourceDrive,sourcePub:save.sourcePub,run:save.run});}

test('actual physical ending completion hands off in one save transaction without advancing ordinary Source or finishing the run',async()=>{
  const ending=collapsed();
  await withTransientGameState({save:saveBase()},async scope=>{
    const before=hostFields(getSave());saveCommit({endingWrongDoor:ending});
    assert.equal(endingSourceResume(getSave()).stage,'source-IV');
    const patch=endingSourceIVHandoff(ending,getSave());
    assert.deepEqual(Object.keys(patch).sort(),['endingCutscene','endingWrongDoor','sourceIV']);
    assert.equal(patch.endingWrongDoor.exitReceipt.delivered,true);
    assert.equal(patch.sourceIV.status,'active');assert.equal(patch.sourceIV.runId,runId);
    assert.equal(patch.sourceIV.returnPose.x,ending.returnPose.x);
    saveCommit(patch);
    assert.deepEqual(hostFields(getSave()),before);
    assert.equal(getSave().endingCutscene,null);assert.equal(getSave().run.status,'active');
    assert.equal(endingSourceIVCanFinish(getSave()),false);
    assert.deepEqual(scope.writes.at(-1).patch,patch,'all handoff fields share one durable patch');
    const restored=endingSourceResume(copy(getSave()));
    assert.equal(restored.stage,'source-IV');assert.deepEqual(restored.checkpoint,getSave().sourceIV);
  });
});

test('fresh, ordinary Source and foreign-run checkpoints cannot acquire this ending or its terminal authority',async()=>{
  const base=saveBase();assert.equal(endingSourceResume(base),null);
  assert.equal(endingSourceIVHandoff(initial(),base),null);
  assert.equal(endingSourceIVHandoff(freshSourceEarthfall({runId}),base),null);
  const other={...collapsed(),runId:'different-run'};
  assert.equal(endingSourceIVHandoff(other,base),null);
  assert.equal(endingSourceResume({...base,endingWrongDoor:other,sourceIV:freshSourceIV({runId:'different-run'})}),null);
  assert.equal(endingSourceIVCanFinish({...base,sourceIV:{...freshSourceIV({runId:'different-run'}),status:'completed'}}),false);
  const finishedRun={...base,run:{...base.run,status:'completed'},endingWrongDoor:collapsed()};
  assert.equal(endingSourceIVHandoff(finishedRun.endingWrongDoor,finishedRun),null);
  assert.equal(endingSourceResume(finishedRun),null);
  await withTransientGameState({save:{...base,endingWrongDoor:other,sourceIV:freshSourceIV({runId:'different-run'})}},()=>{
    assert.equal(getSave().endingWrongDoor,null);assert.equal(getSave().sourceIV,null);
  });
});

test('acknowledged demolition resumes directly in Source IV and a repeat handoff preserves exploration position',async()=>{
  await withTransientGameState({save:saveBase()},async()=>{
    saveCommit(endingSourceIVHandoff(collapsed(),getSave()));
    let state=advance(stepSourceIV,getSave().sourceIV,3,{forward:1,side:.4}).state;
    state=stepSourceIV(state,{look:{yaw:2.1,pitch:.25}}).state;saveCommit({sourceIV:state});
    assert.ok(state.z<IV.spawn.z-8);assert.ok(state.x>3);
    const stored=copy(getSave()),resume=endingSourceResume(stored);
    assert.equal(resume.stage,'source-IV');assert.deepEqual(resume.checkpoint,state);
    const repeated=endingSourceIVHandoff(stored.endingWrongDoor,stored);
    assert.deepEqual(repeated.sourceIV,state,'a repeated host callback cannot respawn an exploring body');
    await withTransientGameState({save:stored},()=>{
      assert.deepEqual(endingSourceResume(getSave()).checkpoint,state);
      assert.equal(getSave().sourceIV.yaw,state.yaw);assert.equal(getSave().sourceIV.pitch,state.pitch);
      assert.equal(endingSourceIVCanFinish(getSave()),false);
    });
  });
});

test('walking, waiting, reaching the far side and opening the door cannot finish before its actual body crossing',async()=>{
  await withTransientGameState({save:saveBase()},()=>{
    saveCommit(endingSourceIVHandoff(collapsed(),getSave()));
    let state=advance(stepSourceIV,getSave().sourceIV,40,{forward:1}).state;
    saveCommit({sourceIV:state});assert.equal(state.status,'active');assert.ok(state.z>IV.exit.z);
    assert.equal(endingSourceIVCanFinish(getSave()),false);
    const aside=advance(stepSourceIV,{...state,x:8},1,{forward:1}).state;
    assert.ok(aside.z<IV.exit.z);saveCommit({sourceIV:aside});
    assert.equal(endingSourceIVCanFinish(getSave()),false,'passing beside the threshold is not taking its door');
    state=stepSourceIV(state,{interact:true}).state;
    state=advance(stepSourceIV,state,IV.doorSeconds).state;saveCommit({sourceIV:state});
    assert.equal(state.exitDoor.open,true);assert.equal(endingSourceIVCanFinish(getSave()),false);
    const result=advance(stepSourceIV,state,.5,{forward:1});saveCommit({sourceIV:result.state});
    assert.equal(result.state.status,'completed');assert.equal(result.events.filter(event=>event.type==='complete').length,1);
    assert.equal(endingSourceIVCanFinish(getSave()),true);
    assert.equal(getSave().run.status,'active','only the host may commit the terminal return after this receipt');
  });
});

test('pending completed receipt survives reload, then acknowledgement removes resume and repeat-finish authority',async()=>{
  await withTransientGameState({save:saveBase()},async()=>{
    saveCommit(endingSourceIVHandoff(collapsed(),getSave()));
    let state=advance(stepSourceIV,getSave().sourceIV,40,{forward:1}).state;
    state=stepSourceIV(state,{interact:true}).state;state=advance(stepSourceIV,state,IV.doorSeconds).state;
    state=advance(stepSourceIV,state,.5,{forward:1}).state;saveCommit({sourceIV:state});
    const saved=copy(getSave());
    await withTransientGameState({save:saved},()=>{
      const resume=endingSourceResume(getSave());assert.equal(resume.stage,'source-IV');assert.equal(resume.checkpoint.status,'completed');
      assert.equal(endingSourceIVCanFinish(getSave()),true);
      const untouched=stepSourceIV(resume.checkpoint,{dt:99,interact:true,forward:-1});assert.deepEqual(untouched.events,[]);
      saveCommit({sourceIV:{...resume.checkpoint,exitReceipt:{...resume.checkpoint.exitReceipt,delivered:true}}});
      assert.equal(endingSourceIVCanFinish(getSave()),false);assert.equal(endingSourceResume(getSave()),null);
    });
  });
});

test('old saves retain null journey fields and a returned demolition never becomes an involuntary reentry',async()=>{
  const base=saveBase();delete base.endingWrongDoor;delete base.sourceIV;
  await withTransientGameState({save:base},()=>{
    assert.equal(getSave().endingWrongDoor,null);assert.equal(getSave().sourceIV,null);assert.equal(endingSourceResume(getSave()),null);
  });
  const returned=advance(stepEndingWrongDoorDemolition,initial(),.7,{forward:-1}).state;
  assert.equal(returned.status,'returned');assert.equal(endingSourceResume({...base,endingWrongDoor:returned}),null);
});
