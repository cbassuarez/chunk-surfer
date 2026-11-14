import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METRONOME_TEMPO, PRACTICE_METRONOMES, freshMetronomeState, stepMetronomes,
  setMetronomeTempo, holdMetronomeWeight, setMetronomeRunning, metronomeVoiceState,
  serializeMetronomeState, restoreMetronomeState, rebaseMetronomePresentation, createMetronomeCoincidenceAccumulator,
} from '../src/game/practice-metronomes.js';
import {createMetronomeFieldRuntime,METRONOME_FIELD} from '../src/audio/metronome-field.js';

const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,a+' versus '+b);
function advance(state,seconds,{ease=1,drift=true,step=.01}={}){
  let left=seconds;const ticks=[];
  while(left>1e-9){const dt=Math.min(step,left),result=stepMetronomes(state,dt,ease,{drift});state=result.state;ticks.push(...result.ticks);left-=dt;}
  return{state,ticks};
}

test('the extended scale preserves authored values and manual input preserves phase',()=>{
  let state=freshMetronomeState();
  assert.deepEqual(state.controls.map(c=>c.bpm),[112,126,134.4,168,224,252]);
  assert.deepEqual([METRONOME_TEMPO.min,METRONOME_TEMPO.max],[40,300]);
  state=advance(state,.231,{ease:0}).state;const phase=state.phases[2],parity=state.parity[2];
  state=setMetronomeTempo(state,2,134.4);near(state.phases[2],phase);assert.equal(state.parity[2],parity);
  near(metronomeVoiceState(state,2).tempo,134.4);
  assert.equal(setMetronomeTempo(state,2,10000).controls[2].bpm,300);
  assert.equal(setMetronomeTempo(state,2,1).controls[2].bpm,40);
});

test('each edit restarts visible drift after the old floor settling cap, and off-floor time cannot move the weight',()=>{
  let state=advance(freshMetronomeState(),2,{ease:1}).state;
  state=setMetronomeTempo(state,0,60);state=advance(state,20,{ease:1,drift:false}).state;
  near(state.controls[0].bpm,60);near(state.controls[0].driftElapsed,0);
  state=advance(state,20,{ease:1}).state;assert.ok(state.controls[0].bpm>60&&state.controls[0].bpm<168);
  state=setMetronomeTempo(state,0,240);near(state.controls[0].bpm,240);near(state.controls[0].driftElapsed,0);
  state=advance(state,1,{ease:1}).state;assert.ok(state.controls[0].bpm<240&&state.controls[0].bpm>230,'release does not snap to the old168 cap');
  state=advance(state,44,{ease:1}).state;near(state.controls[0].bpm,168);
});

test('a caught weight freezes phase, parity, drift and ticks while other clocks keep going',()=>{
  let state=advance(freshMetronomeState(),.437,{ease:.5}).state;
  const visible=metronomeVoiceState(state,0).swing;
  state=holdMetronomeWeight(state,0,true);near(metronomeVoiceState(state,0).swing,visible);
  const phase=state.phases[0],parity=state.parity[0],age=state.controls[0].driftElapsed;
  const result=advance(state,2,{ease:1});state=result.state;
  near(state.phases[0],phase);assert.equal(state.parity[0],parity);near(state.controls[0].driftElapsed,age);
  assert.equal(result.ticks.some(t=>t.index===0),false);assert.ok(result.ticks.some(t=>t.index===1));
  assert.equal(metronomeVoiceState(state,0).running,true,'a grip is not the persistent stop');
});

test('brief catch and release cannot jump onto the cancelled120ms-ahead trajectory',()=>{
  let state=advance(freshMetronomeState(),.437,{ease:0}).state;
  const visible=metronomeVoiceState(state,0).swing;
  state=holdMetronomeWeight(state,0,true);near(metronomeVoiceState(state,0).swing,visible);
  state=holdMetronomeWeight(state,0,false);near(metronomeVoiceState(state,0).swing,visible);
  state=advance(state,.06,{ease:1,drift:false}).state;near(metronomeVoiceState(state,0).swing,visible);
  state=advance(state,.1,{ease:1,drift:false}).state;assert.ok(Math.abs(metronomeVoiceState(state,0).swing-visible)>.001);
});

test('a brief lifecycle hold rebases cancelled lookahead without changing tempo, drift, or player stop/grip state',()=>{
  let state=advance(setMetronomeTempo(freshMetronomeState(),0,120),.49,{ease:0,drift:false}).state;
  state=setMetronomeRunning(state,1,false);state=holdMetronomeWeight(state,2,true);
  const controls=structuredClone(state.controls),poses=PRACTICE_METRONOMES.map((_,i)=>metronomeVoiceState(state,i).swing);
  const stoppedPhase=state.phases[1],heldPhase=state.phases[2],time=state.time;
  state=rebaseMetronomePresentation(state);
  assert.deepEqual(state.controls,controls);near(state.time,time);near(state.phases[1],stoppedPhase);near(state.phases[2],heldPhase);
  for(let i=0;i<6;i++)near(metronomeVoiceState(state,i).swing,poses[i]);
  // A60ms pause advances neither model nor its drift. On resume, the cancelled
  // pre-pause history must not move the visible rod before the sound catches up.
  state=advance(state,.06,{ease:0,drift:false}).state;near(metronomeVoiceState(state,0).swing,poses[0]);
  let tick;
  while(!tick){const result=stepMetronomes(state,.001,0,{drift:false});state=result.state;tick=result.ticks.find(t=>t.index===0);}
  const remaining=tick.at+METRONOME_FIELD.lookahead-state.time;
  state=advance(state,remaining,{ease:0,drift:false,step:.001}).state;
  near(Math.abs(metronomeVoiceState(state,0).swing),1,1e-6);
});

test('stopped phase/parity/drift stay frozen until an explicit restart; serial state preserves them and clears transient grip',()=>{
  let state=advance(setMetronomeTempo(freshMetronomeState(),3,90),3).state;
  const visible=metronomeVoiceState(state,3).swing;state=setMetronomeRunning(state,3,false);
  near(metronomeVoiceState(state,3).swing,visible);
  const phase=state.phases[3],parity=state.parity[3],age=state.controls[3].driftElapsed;
  const result=advance(state,60);state=result.state;
  near(state.phases[3],phase);assert.equal(state.parity[3],parity);near(state.controls[3].driftElapsed,age);
  assert.equal(result.ticks.some(t=>t.index===3),false);
  state=holdMetronomeWeight(state,0,true);
  const serialized=serializeMetronomeState(state);assert.equal('history'in serialized,false);assert.equal(serialized.controls[0].held,false);
  state=restoreMetronomeState(JSON.parse(JSON.stringify(serialized)));
  assert.equal(state.controls[3].stopped,true);near(state.phases[3],phase);assert.equal(state.parity[3],parity);near(state.controls[3].driftElapsed,age);
  state=setMetronomeRunning(state,3,true);const resumed=advance(state,1);assert.ok(resumed.ticks.some(t=>t.index===3));
});

test('stopping an untouched mechanism preserves its rate across the old global settling deadline',()=>{
  let state=advance(freshMetronomeState(),.437,{ease:.5}).state;
  const tempo=metronomeVoiceState(state,0).tempo,visible=metronomeVoiceState(state,0).swing;
  state=setMetronomeRunning(state,0,false);near(metronomeVoiceState(state,0).swing,visible);
  near(state.controls[0].requestedBpm,tempo);near(state.controls[0].driftFromBpm,tempo);
  assert.equal(state.controls[0].manual,true);
  state=advance(state,60,{ease:1}).state;near(state.controls[0].bpm,tempo);near(state.controls[0].driftElapsed,0);
  state=setMetronomeRunning(state,0,true);state=advance(state,.01,{ease:1}).state;
  near(state.controls[0].bpm,tempo,.001);assert.ok(Math.abs(state.controls[0].bpm-168)>1);
  state=advance(state,44.99,{ease:1}).state;near(state.controls[0].bpm,168);
});

test('same BPM preserves different phases instead of silently synchronizing manually touched clocks',()=>{
  let state=freshMetronomeState();state.phases=[.03,.19,.37,.48,.65,.87];state.parity=[0,1,0,1,0,1];
  for(let i=0;i<6;i++)state=setMetronomeTempo(state,i,120);
  const before=state.phases.slice();state=advance(state,10,{ease:1,drift:false}).state;
  for(let i=0;i<6;i++){near(state.phases[i],before[i],1e-7);near(state.controls[i].bpm,120);}
  assert.ok(new Set(state.phases.map(v=>v.toFixed(2))).size>1);
});

test('audible-time swing reaches alternating travel limits at each scheduled click, not120ms early',()=>{
  let state=setMetronomeTempo(freshMetronomeState(),0,120);let tick;
  while(state.time<1.11999){const result=stepMetronomes(state,Math.min(.01,1.12-state.time),0,{drift:false});state=result.state;tick=result.ticks.find(t=>t.index===0)||tick;}
  near(tick.at,1);near(state.time,1+METRONOME_FIELD.lookahead);
  near(metronomeVoiceState(state,0).swing,1,1e-7);
  assert.ok(metronomeVoiceState(state,0,{presentationDelay:0}).swing<.8,'raw model is visibly ahead and cannot be the UI phase');
  state=advance(state,.5,{ease:0,drift:false}).state;
  near(metronomeVoiceState(state,0).swing,-1,1e-7);
});

test('rolling coincidence is independent of a frame boundary and forced transport flush excludes post-take future ticks',()=>{
  const split=createMetronomeCoincidenceAccumulator(),together=createMetronomeCoincidenceAccumulator();
  assert.deepEqual(split.push([{index:0,at:.012,level:.1}],1/60),[]);
  assert.deepEqual(split.push([{index:1,at:.024,level:.1}],2/60),[]);
  const a=split.flush(.05),b=together.push([{index:0,at:.012,level:.1},{index:1,at:.024,level:.1}],.05);
  assert.deepEqual(a,b);near(a[0].level,.2);assert.deepEqual(a[0].indices,[0,1]);
  const end=createMetronomeCoincidenceAccumulator();end.push([{index:0,at:.99,level:.1},{index:1,at:1.005,level:.1}],.995);
  const last=end.flush(1,{force:true});near(last[0].level,.1);assert.deepEqual(last[0].indices,[0]);assert.equal(end.pending,1);
});

test('future voice cancellation cannot erase ticks already heard but still awaiting coincidence maturity',()=>{
  const events=createMetronomeCoincidenceAccumulator();events.push([{index:0,at:.99,level:.1},{index:0,at:1.1,level:.1},{index:1,at:.995,level:.1}],1);
  events.clearVoice(0,{after:1});const groups=events.flush(1.03);near(groups[0].level,.2);assert.equal(events.pending,0);
});

test('audio owns queued primary and return nodes per voice and cancels only the edited/caught voice',()=>{
  const created=[];let id=0;
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
  const node=extra=>({connect(){},disconnect(){},...extra});
  const context={currentTime:10,createGain:()=>node({gain:param()}),createStereoPanner:()=>node({pan:param()}),createOscillator:()=>{
    const item={id:id++,starts:[],stops:[]};created.push(item);return node({frequency:param(),start:at=>item.starts.push(at),stop:at=>item.stops.push(at)});
  }};
  const frame={active:true,voices:PRACTICE_METRONOMES.map(()=>({gain:.03,pan:0,running:true}))};
  const runtime=createMetronomeFieldRuntime({context,destination:node()});runtime.update(frame,10);
  assert.equal(runtime.sound([{index:0,audioAt:10.5},{index:1,audioAt:10.6}],frame,10),2);
  near(created[0].starts[0],10.5);near(created[2].starts[0],10.6);
  runtime.silenceVoice(0,10.05);assert.ok(created.slice(0,2).every(x=>x.stops.includes(10.05)));assert.ok(created.slice(2).every(x=>!x.stops.includes(10.05)));
  runtime.update({...frame,voices:frame.voices.map((v,i)=>i===1?{...v,held:true}:v)},10.1);
  assert.ok(created.slice(2).every(x=>x.stops.includes(10.1)));
  assert.equal(runtime.sound([{index:0}],{...frame,voices:frame.voices.map(v=>({...v,held:true}))},10.2),0);
  runtime.stop();assert.equal(runtime.sound([{index:0}],frame),0);
});
