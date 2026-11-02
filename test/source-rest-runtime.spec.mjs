import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation,normalizeSourceContinuation,continuationFocus} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';

const fixtureState=seat=>{
  const dx=seat.x-seat.approach.x,dz=seat.z-seat.approach.z;
  return normalizeSourceContinuation({...freshSourceContinuation({runId:'rest-test'}),status:'active',phase:seat.phase,
    chartId:seat.chartId,level:seat.level,feet:seat.feet,...seat.approach,yaw:Math.atan2(dx,-dz)});
};
function fixture(seat=SOURCE_REST_SEATS[0],options={}){
  let state=fixtureState(seat),lastRender=null,updates=0,audioFrames=0,choices=null,commits=0,prompts=0;
  const renderEvents=[],instruments=[];
  let narrative={progress:0,locked:false},music={currentTime:0,playedSeconds:0,duration:716.397868,signal:0};
  const held=new Set(),stack=[];
  const scene={id:'source-continuation',get allowsLook(){return state.phase!=='catch';},
    view:()=>({...state,ready:true,focus:options.normalFocus||continuationFocus(state)}),serialize:()=>({...state}),
    update(dt){updates++;state={...state,elapsed:state.elapsed+dt};audioFrames++;},
    render(){renderer.render(state);},key(e){held.add(e.key);return true;},keyup(e){held.delete(e.key);return true;},
    lookBy(){return 'original-look';},setLook(){return 'original-set';},lookAngles(){return{yaw:state.yaw,pitch:state.pitch};},
    exit(){return 'original-exit';}};
  const renderer={render(value){renderEvents.push('world');lastRender=value;return true;}};
  const manager={push(s){stack.push(s);},remove(s){const i=stack.indexOf(s);if(i>=0)stack.splice(i,1);s.exit?.();}};
  const makeConversation=opts=>{choices=opts;return{id:'rest-dialogue',exit(){},restProgress:()=>narrative.progress,
    view:()=>({restLocked:narrative.locked,nodeId:'test',lineSourceId:'test:0',line:{text:'Listen.'},typed:7}),
    render:()=>renderEvents.push('subtitles')};};
  const original={rendererRender:renderer.render,update:scene.update,key:scene.key,lookBy:scene.lookBy,allowsLook:Object.getOwnPropertyDescriptor(scene,'allowsLook')};
  const api=installSourceRest(scene,renderer,{stack:manager,makeConversation,paintPrompt:()=>prompts++,conversationOptions:{getMusicState:()=>music},
    enableStudies:!!options.enableStudies,drawRestInstrumentInStudies:!!options.drawRestInstrumentInStudies,
    getRecorderVisible:()=>!!options.recorderVisible,
    drawRestInstrument:payload=>{renderEvents.push('instrument');instruments.push(payload);},
    onCommit:context=>{assert.equal(stack.length,0,'overlay is removed before ending handoff');commits++;options.onCommit?.(context);return options.commitResult;}});
  return{scene,renderer,api,stack,held,original,renderEvents,instruments,get render(){return lastRender},get updates(){return updates},get audioFrames(){return audioFrames},get prompts(){return prompts},get commits(){return commits},
    decide(value){manager.remove(stack.at(-1));choices.onDone(value);},setState(value){state={...state,...value};},
    setNarrative(value){narrative={...narrative,...value};},setMusic(value){music={...music,...value};}};
}

test('both actual protected seating pockets offer rest without taking an existing door interaction',()=>{
  for(const seat of SOURCE_REST_SEATS){const f=fixture(seat);assert.equal(f.api.focus()?.id,seat.id);f.scene.render();assert.equal(f.prompts,1);
    f.setState({focus:{id:'door'}}); // fixture view uses actual focus, so use separate explicit collision below
    f.api.dispose();
    const blocked=fixture(seat,{normalFocus:{id:'door'}});assert.equal(blocked.api.focus(),null);blocked.scene.key({key:'e'});assert.equal(blocked.stack.length,0);blocked.api.dispose();}
});

test('the real Source II rest keeps the recorder put away and exposes its canonical frame only for an explicit presentation',()=>{
  const f=fixture();f.scene.render();assert.equal(f.instruments.length,0,'no floating instrument before sitting');
  f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);f.setNarrative({progress:.26});f.scene.update(.1);
  f.renderEvents.length=0;f.scene.render();f.stack.at(-1).render();
  assert.deepEqual(f.renderEvents,['world','subtitles']);
  assert.equal(f.instruments.length,0);
  const p=f.api.recorderFrame();assert.equal(p.phase,'wrong-return');assert.equal(p.mode,'seated');
  assert.equal(p.presentation.stage,2);assert.equal(p.transitionProgress,1);assert.equal(p.narrativeProgress,.26);
  assert.equal(p.conversationView.line.text,'Listen.');assert.equal(p.conversationView.restLocked,false);
  const before=f.instruments.length;f.setNarrative({progress:.70});f.scene.update(.1);f.scene.render();
  assert.equal(f.instruments.length,before,'quiet corners return after the instrument presentation erodes');
  f.decide('leave');f.scene.render();assert.equal(f.instruments.length,before,'standing does not create a second device owner');f.api.dispose();
});

test('Source III also leaves its device put away while isolated studies require explicit opt-in',()=>{
  const catchSeat=fixture(SOURCE_REST_SEATS[1]);catchSeat.api.sit();for(let i=0;i<8;i++)catchSeat.scene.update(.2);catchSeat.scene.render();
  assert.equal(catchSeat.instruments.length,0);assert.equal(catchSeat.api.recorderFrame().phase,'catch');
  assert.equal(catchSeat.api.recorderFrame().mode,'seated');catchSeat.api.dispose();
  const study=fixture(SOURCE_REST_SEATS[0],{enableStudies:true});study.api.studyFrame({musicTime:100,degradation:.26});
  assert.equal(study.instruments.length,0);study.api.dispose();
  const opted=fixture(SOURCE_REST_SEATS[0],{enableStudies:true,drawRestInstrumentInStudies:true});opted.api.studyFrame({musicTime:100,degradation:.26});
  assert.equal(opted.instruments.length,1);assert.equal(opted.instruments[0].study,true);assert.equal(opted.api.view().mode,'idle');
  opted.api.studyFrame({musicTime:440,degradation:.8});assert.equal(opted.instruments.length,1,'study opt-in still respects peripheral loss');opted.api.dispose();
});

test('sitting releases held movement, keeps Source and its one audio owner ticking, and returns the original camera and input on leave',()=>{
  for(const seat of SOURCE_REST_SEATS){const f=fixture(seat);f.scene.key({key:'w'});assert.ok(f.held.has('w'));assert.equal(f.scene.key({key:'e'}),true);
    assert.equal(f.held.size,0);assert.equal(f.stack.length,1);assert.equal(f.api.view().mode,'sitting');
    for(let i=0;i<8;i++)f.scene.update(.2);f.scene.render();
    assert.equal(f.updates,8);assert.equal(f.audioFrames,8,'no second soundtrack owner replaces normal audio');
    assert.equal(f.api.view().mode,'seated');assert.equal(f.render.sourceRestView.seatId,seat.id);assert.equal(f.render.sourceRestView.progress,1);
    assert.equal(f.scene.allowsLook,true);const before=f.scene.lookAngles();assert.equal(f.scene.lookBy(.5,.2),true);assert.notEqual(f.scene.lookAngles().yaw,before.yaw);
    f.decide('leave');assert.equal(f.api.view().mode,'standing');for(let i=0;i<8;i++)f.scene.update(.2);
    assert.equal(f.api.view().mode,'idle');assert.equal(f.scene.allowsLook,seat.phase!=='catch');assert.equal(f.scene.lookBy(0,0),'original-look');
    f.scene.render();assert.equal(f.render.sourceRestView.seatId,undefined);assert.equal(f.commits,0);f.api.dispose();}
});

test('a healthy seated listener can examine the high string architecture before faculties decline',()=>{
  const f=fixture(SOURCE_REST_SEATS[1]);f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.scene.lookBy(0,2);assert.equal(f.scene.lookAngles().pitch,1.25);
  f.scene.setLook({pitch:1.1});assert.ok(Math.abs(f.scene.lookAngles().pitch-1.1)<1e-9);
  f.api.dispose();
});

test('commit is delivered once only after dialogue removal and holds the seated view until released',async()=>{
  const f=fixture(SOURCE_REST_SEATS[1],{commitResult:true});f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.decide('commit');assert.equal(f.commits,1);assert.equal(f.api.view().mode,'committed');f.scene.render();assert.equal(f.render.sourceRestView.progress,1);
  f.scene.key({key:'w'});assert.equal(f.held.has('w'),false);assert.equal(f.api.stand(),false);await Promise.resolve();assert.equal(f.commits,1);
  assert.equal(f.api.release(),true);assert.equal(f.api.view().mode,'idle');f.api.dispose();
});

test('a committed checkpoint restores the view without replaying dialogue or invoking a second ending',()=>{
  const f=fixture(SOURCE_REST_SEATS[1]);assert.equal(f.api.restoreCommitted(),true);assert.equal(f.stack.length,0);assert.equal(f.commits,0);
  f.scene.render();assert.equal(f.render.sourceRestView.mode,'committed');assert.equal(f.render.sourceRestView.progress,1);f.api.dispose();
  const outside=fixture();outside.setState({x:0,z:0});assert.equal(outside.api.restoreCommitted(),false);outside.api.dispose();
});

test('a failed ending handoff recovers to standing; disposal restores every wrapped method',()=>{
  const f=fixture(SOURCE_REST_SEATS[0],{commitResult:false});f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);f.decide('commit');
  assert.equal(f.api.view().mode,'standing');for(let i=0;i<8;i++)f.scene.update(.2);assert.equal(f.api.view().mode,'idle');
  assert.equal(f.api.dispose(),true);assert.equal(f.scene.update,f.original.update);assert.equal(f.scene.key,f.original.key);
  assert.equal(f.scene.lookBy,f.original.lookBy);assert.equal(f.renderer.render,f.original.rendererRender);
  assert.equal(Object.getOwnPropertyDescriptor(f.scene,'allowsLook').get,f.original.allowsLook.get);
});

test('real continuation scene keeps simulating and updating its source audio while the dialogue is open',async()=>{
  for(const seat of SOURCE_REST_SEATS){let frames=0;const renderer={render:()=>true,initialize:async()=>true,ready:()=>true,acousticFrame:()=>null};
    const audio={prepare:async()=>true,update:()=>frames++,event:()=>{},stop:()=>{},pause:()=>{}};
    const scene=createSourceContinuationScene({checkpoint:fixtureState(seat),renderer,audio});await scene.initialize();
    const stack={push(){},remove(){}};const api=installSourceRest(scene,renderer,{stack,makeConversation:()=>({}),paintPrompt:()=>{}});
    assert.equal(api.sit(),true,`seat ${seat.id} is reachable in actual scene`);const before=scene.serialize();
    for(let i=0;i<1200;i++)scene.update(.1);
    const after=scene.serialize();assert.ok(frames>=1200,'real Source audio update continues for two minutes');assert.ok(after.elapsed>before.elapsed+119);
    assert.equal(after.recovery,null,'protected refuge does not capture the seated player');assert.equal(after.phase,before.phase);
    api.dispose();scene.exit();}
});

test('the real scene stack lends seated look to Source III and restores overhead look ownership when standing',()=>{
  // Stack routing is the production arbiter; a true getter on the source
  // alone would not be enough if a modal overlay blocked look first.
  return import('../src/game/scenes.js').then(stack=>{
    stack.clear();let state=fixtureState(SOURCE_REST_SEATS[1]),done;
    const renderer={render:()=>true};
    const scene={id:'test-source',blocksInput:true,get allowsLook(){return state.phase!=='catch';},
      view:()=>({...state,ready:true,focus:continuationFocus(state)}),serialize:()=>({...state}),
      update(){},render(){},key(){return true;},keyup(){return true;},lookBy(){return false;},exit(){}};
    const rest=installSourceRest(scene,renderer,{stack,paintPrompt:()=>{},makeConversation:opts=>{
      done=opts.onDone;return{id:'test-rest',blocksInput:true,allowsLook:true,key(){return true;},exit(){}};}});
    stack.push(scene);assert.equal(stack.lookOwner(),null);assert.equal(rest.sit(),true);
    assert.equal(stack.lookOwner(),scene);assert.equal(stack.lookOwner().lookBy(.4,0),true);
    stack.remove('test-rest');done('leave');for(let i=0;i<8;i++)scene.update(.2);
    assert.equal(stack.lookOwner(),null);assert.equal(rest.view().mode,'idle');stack.clear();
  });
});

test('losing the protected pocket dismisses the conversation without committing an ending',()=>{
  const f=fixture();assert.equal(f.api.sit(),true);for(let i=0;i<8;i++)f.scene.update(.2);
  f.setState({x:0,z:0});f.scene.update(.1);
  assert.equal(f.stack.length,0);assert.equal(f.api.view().mode,'standing');assert.equal(f.commits,0);
  for(let i=0;i<8;i++)f.scene.update(.2);assert.equal(f.api.view().mode,'idle');f.api.dispose();
});

test('a scene-stack failure removes a partially pushed dialogue and restores control',()=>{
  const seat=SOURCE_REST_SEATS[0],s=fixtureState(seat),items=[];let error=null;
  const renderer={render:()=>true};const scene={view:()=>({...s,ready:true,focus:null}),update(){},key(){},keyup(){},render(){},exit(){}};
  const stack={push(value){items.push(value);throw Error('voice failed');},remove(value){const i=items.indexOf(value);if(i>=0)items.splice(i,1);}};
  const api=installSourceRest(scene,renderer,{stack,makeConversation:()=>({id:'rest'}),onError:e=>{error=e},paintPrompt:()=>{}});
  assert.equal(api.sit(),false);assert.equal(items.length,0);assert.match(error.message,/voice failed/);
  scene.update(.2);assert.equal(api.view().mode,'idle');api.dispose();
});

test('the real departure lock, rather than late media time or progress alone, authorizes loss of look',()=>{
  const f=fixture();f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.setMusic({currentTime:665,playedSeconds:665});f.setNarrative({progress:.94,locked:false});
  f.scene.update(.1);f.scene.render();
  assert.equal(f.api.view().affliction.active,true);assert.ok(f.api.view().affliction.destruction>0);
  assert.equal(f.api.view().affliction.canLeave,true);assert.equal(f.api.view().affliction.motorGain,1);
  assert.equal(f.api.view().affliction.inputLost,false,'a late performance cannot revoke an unclosed departure');
  const before=f.scene.lookAngles();assert.equal(f.scene.lookBy(.4,.1),true);
  assert.ok(Math.abs(f.scene.lookAngles().yaw-before.yaw-.4)<1e-10);
  assert.ok(Math.abs(f.scene.lookAngles().pitch-before.pitch-.1)<1e-10);
  f.api.dispose();
});

test('locked look weakens progressively through both relative and absolute input, then stops at the authored cutoff',()=>{
  const f=fixture();f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.setMusic({currentTime:457,playedSeconds:457});f.setNarrative({progress:.74,locked:true});
  f.scene.update(.1);f.scene.render();
  const weak=f.api.view().affliction,gain=weak.motorGain,before=f.scene.lookAngles();
  assert.equal(weak.canLeave,false);assert.ok(gain>0&&gain<1);assert.equal(weak.inputLost,false);
  assert.equal(f.scene.lookBy(.4,.1),true);
  const relative=f.scene.lookAngles();assert.ok(Math.abs(relative.yaw-before.yaw-.4*gain)<1e-10);
  assert.ok(Math.abs(relative.pitch-before.pitch-.1*gain)<1e-10);
  assert.equal(f.scene.setLook({yaw:relative.yaw+.8,pitch:relative.pitch+.15}),true);
  const absolute=f.scene.lookAngles();assert.ok(Math.abs(absolute.yaw-relative.yaw-.8*gain)<1e-10);
  assert.ok(Math.abs(absolute.pitch-relative.pitch-.15*gain)<1e-10);
  f.setNarrative({progress:.88,locked:true});f.scene.update(.1);f.scene.render();
  assert.equal(f.api.view().affliction.motorGain,0);assert.equal(f.api.view().affliction.inputLost,true);
  const lost=f.scene.lookAngles();assert.equal(f.scene.lookBy(1,.5),true);assert.deepEqual(f.scene.lookAngles(),lost);
  assert.equal(f.scene.setLook({yaw:lost.yaw+1,pitch:lost.pitch-.4}),true);assert.deepEqual(f.scene.lookAngles(),lost);
  assert.equal(f.scene.allowsLook,true,'zero motor response keeps ownership instead of falling through to another camera');
  f.api.dispose();
});

test('early standing restores normal input while retaining the witnessed structural damage',()=>{
  const f=fixture();f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.setMusic({currentTime:240,playedSeconds:240});f.setNarrative({progress:.4,locked:false});
  f.scene.update(.1);f.scene.render();const damaged=f.api.view().affliction;
  assert.ok(damaged.strain>0&&damaged.destruction>0);assert.equal(damaged.canLeave,true);
  f.decide('leave');f.scene.render();const standing=f.api.view().affliction;
  assert.equal(standing.embodied,false);assert.equal(standing.motorGain,1);assert.equal(standing.inputLost,false);
  assert.equal(standing.pain,0);assert.equal(standing.strain,0);assert.equal(standing.facultyLoss,0);
  assert.equal(standing.destruction,damaged.destruction,'standing does not repair the real rendered collapse');
  assert.equal(f.scene.lookBy(.4,.1),'original-look');
  for(let i=0;i<8;i++)f.scene.update(.2);
  assert.equal(f.api.view().mode,'idle');f.scene.key({key:'w'});assert.ok(f.held.has('w'));
  f.scene.keyup({key:'w'});assert.equal(f.held.size,0);assert.equal(f.commits,0);f.api.dispose();
});

test('Source III has its own locked narrative decline without importing Source II performance mistakes',()=>{
  const f=fixture(SOURCE_REST_SEATS[1]);f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  f.setMusic({currentTime:665,playedSeconds:665});f.setNarrative({progress:.95,locked:true});
  f.scene.update(.1);f.scene.render();const cue=f.api.view().affliction;
  assert.equal(cue.active,true);assert.equal(cue.motorGain,0);assert.equal(cue.inputLost,true);
  assert.equal(cue.pain,0);assert.equal(cue.latestMistake,null);assert.equal(cue.mistakeCount,0);assert.deepEqual(cue.mistakeIds,[]);
  assert.ok(cue.strain>0&&cue.destruction>0&&cue.facultyLoss>0);assert.equal(cue.syntheticMistakeAudio,false);
  const before=f.scene.lookAngles();assert.equal(f.scene.lookBy(.4,.1),true);assert.deepEqual(f.scene.lookAngles(),before);
  assert.equal(f.scene.allowsLook,true,'deliberate motor loss retains the seated camera owner');
  f.decide('leave');for(let i=0;i<8;i++)f.scene.update(.2);
  assert.equal(f.scene.allowsLook,false,'the original Catch overhead owner returns');f.api.dispose();
});

test('the actual stack continues routing look to Source II even when its authored motor response is zero',async()=>{
  const stack=await import('../src/game/scenes.js');stack.clear();
  const state=fixtureState(SOURCE_REST_SEATS[0]),renderer={render:()=>true};
  const scene={id:'test-afflicted-source',blocksInput:true,allowsLook:true,
    view:()=>({...state,ready:true,focus:continuationFocus(state)}),serialize:()=>({...state}),
    update(){},render(){renderer.render(state);},key(){return true;},keyup(){return true;},lookBy(){return false;},exit(){}};
  const rest=installSourceRest(scene,renderer,{stack,paintPrompt:()=>{},
    conversationOptions:{getMusicState:()=>({currentTime:480,playedSeconds:480,duration:716.397868})},
    makeConversation:()=>({id:'test-afflicted-rest',blocksInput:true,allowsLook:true,restProgress:()=>.88,
      view:()=>({restLocked:true,nodeId:'return',lineSourceId:'return:0'}),key(){return true;},exit(){}})});
  try{
    stack.push(scene);assert.equal(rest.sit(),true);for(let i=0;i<8;i++)scene.update(.2);scene.render();
    assert.equal(rest.view().affliction.inputLost,true);assert.equal(stack.lookOwner(),scene);
    const before=scene.lookAngles();assert.equal(stack.lookOwner().lookBy(.7,.2),true);assert.deepEqual(scene.lookAngles(),before);
  }finally{rest.dispose();stack.clear();}
});
