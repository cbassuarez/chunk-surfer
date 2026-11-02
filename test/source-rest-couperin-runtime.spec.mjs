import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_PERFORMANCE} from '../src/data/source-rest-performance.js';
import {freshSourceContinuation,normalizeSourceContinuation,continuationFocus} from '../src/game/source-continuation.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function fixture(seat){
  const dx=seat.x-seat.approach.x,dz=seat.z-seat.approach.z;
  let state=normalizeSourceContinuation({...freshSourceContinuation({runId:'couperin-runtime-test'}),status:'active',phase:seat.phase,
    chartId:seat.chartId,level:seat.level,feet:seat.feet,...seat.approach,yaw:Math.atan2(dx,-dz)}),
    narrative={progress:0,locked:false},music={currentTime:0,playedSeconds:0,duration:seat.phase==='catch'?843.157120:SOURCE_REST_PERFORMANCE.duration},
    callbacks=null,rendered=null;
  const stack=[],progressCalls=[],changes=[],commits=[],held=new Set(),instruments=[];
  const renderer={render(value){rendered=value;return true;}};
  const scene={id:`source-${seat.phase}`,blocksInput:true,get allowsLook(){return state.phase!=='catch';},
    view:()=>({...state,ready:true,focus:continuationFocus(state)}),serialize:()=>structuredClone(state),
    update(){},render(){return renderer.render(state);},
    key(event){held.add(event.key);return true;},keyup(event){held.delete(event.key);return true;},
    lookBy(){return 'ordinary-look';},setLook(){return 'ordinary-set';},lookAngles(){return{yaw:state.yaw,pitch:state.pitch};},exit(){}};
  const manager={push(overlay){stack.push(overlay);},remove(overlay){const i=stack.indexOf(overlay);if(i>=0)stack.splice(i,1);overlay?.exit?.();}};
  const original={render:renderer.render,update:scene.update,key:scene.key,lookBy:scene.lookBy,setLook:scene.setLook,
    allowsLook:Object.getOwnPropertyDescriptor(scene,'allowsLook')};
  const api=installSourceRest(scene,renderer,{stack:manager,paintPrompt(){},
    conversationOptions:{getMusicState:()=>music,onRestProgress:(...values)=>progressCalls.push(values)},
    makeConversation(options){callbacks=options;return{id:`rest-${seat.phase}`,allowsLook:true,blocksInput:true,
      restProgress:()=>narrative.progress,view:()=>({nodeId:'test',restLocked:narrative.locked,lineSourceId:'test:0',line:{text:'Listen.'},typed:7}),exit(){}};},
    drawRestInstrument:value=>instruments.push(value),onChange:value=>changes.push(value),
    onCommit(context){assert.equal(stack.length,0);commits.push(context);return true;}});
  return{scene,renderer,api,original,stack,progressCalls,changes,commits,held,instruments,
    get frame(){return rendered?.sourceRestView;},get options(){return callbacks;},
    narrative(values){narrative={...narrative,...values};},music(values){music={...music,...values};},state(values){state={...state,...values};},
    render(){scene.update(.1);scene.render();return rendered.sourceRestView;},
    settle(){for(let i=0;i<8;i++)scene.update(.2);scene.render();},
    decide(outcome){const overlay=stack.at(-1);if(overlay)manager.remove(overlay);callbacks.onDone(outcome);}};
}

test('Couperin decline is narrative-driven, deterministic and never invents a performer mistake report',()=>{
  let destruction=0,loss=0;
  for(const progress of [0,.25,.43,.55,.7,.879,.88,.96,1]){
    const input={active:true,progress,currentTime:700.7,playedSeconds:700.7,duration:843.157120},cue=sourceRestCouperinAffliction(input);
    assert.deepEqual(sourceRestCouperinAffliction(input),cue,'an unchanged audible clock yields unchanged physical cues');
    assert.equal(cue.pain,0);assert.equal(cue.painAge,null);assert.equal(cue.latestMistake,null);
    assert.deepEqual(cue.mistakeIds,[]);assert.equal(cue.mistakeCount,0);assert.equal(cue.passage,null);assert.deepEqual(cue.passageIds,[]);
    assert.equal(cue.syntheticMistakeAudio,false);assert.match(cue.mistakeSource,/no Couperin performance report/);
    assert.ok(cue.destruction>=destruction);assert.ok(cue.facultyLoss>=loss);destruction=cue.destruction;loss=cue.facultyLoss;
    assert.equal(cue.inputLost,progress>=.88);if(progress<.88)assert.ok(cue.motorGain>0);
    if(progress<=.55){assert.equal(cue.motorGain,1);assert.equal(cue.facultyLoss,0);}
    for(const field of ['strain','destruction','facultyLoss','motorGain','pressure'])assert.ok(cue[field]>=0&&cue[field]<=1);
  }
  const quiet=sourceRestCouperinAffliction({active:false,progress:1,currentTime:800});
  for(const field of ['pain','strain','destruction','facultyLoss','pressure'])assert.equal(quiet[field],0);
  assert.equal(quiet.motorGain,1);assert.equal(quiet.inputLost,false);
  for(const row of SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake')){
    const cue=sourceRestCouperinAffliction({active:true,progress:.6,currentTime:row.start+.03});
    assert.equal(cue.latestMistake,null);assert.equal(cue.pain,0,'a Chaconne mark cannot hurt a Couperin performance');
  }
});

test('both supported phases sit and leave through the same body owner and phase-labelled progress callback',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat),before=f.scene.serialize();
    try{
      f.scene.key({key:'w'});assert.ok(f.held.has('w'));assert.equal(f.api.sit(),true);assert.equal(f.held.size,0);
      assert.equal(f.options.phase,seat.phase);assert.equal(f.api.view().phase,seat.phase);assert.equal(f.stack.length,1);
      f.narrative({progress:.48,locked:false});f.settle();
      assert.equal(f.api.view().mode,'seated');assert.equal(f.frame.affliction.active,true);assert.equal(f.frame.affliction.embodied,true);
      assert.equal(f.frame.affliction.canLeave,true);assert.equal(f.scene.allowsLook,true);
      assert.equal(f.instruments.length,0,'no device appears until the player explicitly requests it');
      assert.equal(f.api.recorderFrame().phase,seat.phase,'the external presenter receives the real phase');
      assert.ok(f.progressCalls.some(([p,active,,phase])=>p===.48&&active&&phase===seat.phase));
      assert.deepEqual(f.scene.serialize(),before,'rest writes no body position, checkpoint or progression');
      f.decide('leave');const standing=f.render().affliction;
      assert.equal(standing.embodied,false);assert.equal(standing.motorGain,1);assert.equal(standing.inputLost,false);
      for(const field of ['pain','strain','pressure','facultyLoss'])assert.equal(standing[field],0);
      assert.ok(f.progressCalls.some(([p,active,,phase])=>p===.48&&!active&&phase===seat.phase));
      assert.equal(f.scene.lookBy(.2,.1),'ordinary-look');f.settle();
      assert.equal(f.api.view().mode,'idle');assert.equal(f.scene.allowsLook,seat.phase!=='catch');
      f.scene.key({key:'w'});assert.ok(f.held.has('w'));assert.equal(f.commits.length,0);
      assert.equal(f.progressCalls.at(-1)[0],0);assert.equal(f.progressCalls.at(-1)[1],false);
    }finally{f.api.dispose();}
    assert.equal(f.renderer.render,f.original.render);assert.equal(f.scene.lookBy,f.original.lookBy);
    assert.equal(Object.getOwnPropertyDescriptor(f.scene,'allowsLook').get,f.original.allowsLook.get);
  }
});

test('Source III media lateness and apparent narrative decline cannot steal an unclosed departure',()=>{
  const f=fixture(SOURCE_REST_SEATS.find(seat=>seat.phase==='catch'));
  try{
    f.api.sit();f.settle();f.music({currentTime:830,playedSeconds:830});f.narrative({progress:.95,locked:false});
    const cue=f.render().affliction;
    assert.equal(cue.active,true);assert.ok(cue.destruction>0&&cue.facultyLoss>0);
    assert.equal(cue.canLeave,true);assert.equal(cue.motorGain,1);assert.equal(cue.inputLost,false);
    const before=f.scene.lookAngles();assert.equal(f.scene.lookBy(.45,.12),true);
    near(f.scene.lookAngles().yaw,before.yaw+.45);near(f.scene.lookAngles().pitch,before.pitch+.12);
    f.decide('leave');f.settle();assert.equal(f.api.view().mode,'idle');assert.equal(f.scene.allowsLook,false);
  }finally{f.api.dispose();}
});

test('Source III lock weakens actual relative and absolute look before its intentional final loss',()=>{
  const f=fixture(SOURCE_REST_SEATS.find(seat=>seat.phase==='catch'));
  try{
    f.api.sit();f.settle();f.narrative({progress:.5,locked:true});assert.equal(f.render().affliction.motorGain,1);
    f.narrative({progress:.72,locked:true});const weak=f.render().affliction;
    assert.equal(weak.canLeave,false);assert.ok(weak.motorGain>0&&weak.motorGain<1);assert.equal(weak.inputLost,false);
    const before=f.scene.lookAngles();assert.equal(f.scene.lookBy(.4,.1),true);
    const relative=f.scene.lookAngles();near(relative.yaw-before.yaw,.4*weak.motorGain);near(relative.pitch-before.pitch,.1*weak.motorGain);
    f.scene.setLook({yaw:relative.yaw+.6,pitch:relative.pitch+.1});const absolute=f.scene.lookAngles();
    near(absolute.yaw-relative.yaw,.6*weak.motorGain);near(absolute.pitch-relative.pitch,.1*weak.motorGain);
    f.narrative({progress:.879,locked:true});assert.equal(f.render().affliction.inputLost,false);
    f.narrative({progress:.88,locked:true});const lost=f.render().affliction;
    assert.equal(lost.motorGain,0);assert.equal(lost.inputLost,true);assert.equal(f.scene.allowsLook,true);
    const still=f.scene.lookAngles();assert.equal(f.scene.lookBy(1,.2),true);assert.deepEqual(f.scene.lookAngles(),still);
    assert.equal(f.scene.setLook({yaw:still.yaw+1,pitch:still.pitch+.1}),true);assert.deepEqual(f.scene.lookAngles(),still);
  }finally{f.api.dispose();}
});

test('both committed checkpoints restore their phase without replaying conversation or committing twice',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat);
    try{
      assert.equal(f.api.restoreCommitted(),true);assert.equal(f.stack.length,0);assert.equal(f.options,null);
      assert.equal(f.commits.length,0);assert.equal(f.api.view().phase,seat.phase);assert.equal(f.api.view().mode,'committed');
      const cue=f.render().affliction;assert.equal(cue.active,true);assert.equal(cue.embodied,true);
      assert.equal(cue.canLeave,false);assert.equal(cue.motorGain,0);assert.equal(cue.inputLost,true);
      assert.equal(f.api.stand(),false);assert.equal(f.scene.allowsLook,true);
      assert.equal(f.api.release(),true);f.render();assert.equal(f.api.view().mode,'idle');assert.equal(f.frame.affliction.motorGain,1);
      assert.equal(f.frame.affliction.inputLost,false);assert.equal(f.scene.allowsLook,seat.phase!=='catch');
      assert.equal(f.commits.length,0);
    }finally{f.api.dispose();}
    const outside=fixture(seat);outside.state({x:0,z:0});assert.equal(outside.api.restoreCommitted(),false);outside.api.dispose();
  }
});

test('the actual terminal callback hands off the matching phase and supported checkpoint once',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat);
    try{
      f.api.sit();f.settle();f.decide('commit');assert.equal(f.commits.length,1);
      const context=f.commits[0];assert.equal(context.phase,seat.phase);assert.equal(context.seat.id,seat.id);
      assert.deepEqual(context.checkpoint,f.scene.serialize());assert.equal(f.api.view().mode,'committed');
      f.options.onDone('commit');assert.equal(f.commits.length,1);
      assert.equal(context.release(),true);assert.equal(f.api.view().mode,'idle');
      f.render();assert.equal(f.frame.affliction.inputLost,false);
    }finally{f.api.dispose();}
  }
});

test('Source II keeps the exact human report while Source III never borrows its event IDs or pain',()=>{
  const row=SOURCE_REST_PERFORMANCE.annotations.find(row=>row.type==='mistake'),cues=[];
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat);
    try{
      f.api.sit();f.settle();f.music({currentTime:row.start+.03,playedSeconds:row.start+.03});f.narrative({progress:.3,locked:false});
      cues.push(f.render().affliction);
    }finally{f.api.dispose();}
  }
  assert.equal(cues[0].latestMistake.id,row.id);assert.ok(cues[0].pain>0);assert.ok(cues[0].mistakeIds.includes(row.id));
  assert.equal(cues[1].latestMistake,null);assert.equal(cues[1].pain,0);assert.deepEqual(cues[1].mistakeIds,[]);
  assert.equal(cues[1].mistakeCount,0);assert.equal(cues[1].syntheticMistakeAudio,false);
});
