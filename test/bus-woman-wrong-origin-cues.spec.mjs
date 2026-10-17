import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutskirtsExperience } from '../src/game/outskirts-experience.js';
import { busWomanWrongOriginCuePlan, crossedBusWomanWrongOriginCues } from '../src/game/bus-woman-wrong-origin-cues.js';
import { createOutskirtsStreetAudio } from '../src/audio/outskirts-street.js';

const actorId='r7-bus-woman', position={x:4,z:-20};
function sample(experience,seconds,{mode='receive',stage=3,...options}={}){
  return experience.womanWrongOrigin({actorId,mode,seconds,stage,position,near:true,clock:experience.characterFrame().clock,...options});
}
function advance(experience,amount,options={}){
  experience.tickCharacters(amount,{record:false});
  return sample(experience,experience.characterFrame().clock,options);
}
const receiving=()=>createOutskirtsExperience({clock:0,woman:{receivedAt:0,receiveId:actorId,ticketReturned:true}});

test('the wrong-origin audio plan is a finite sparse consequence of the saved gesture',()=>{
  const woman={receivedAt:40,acknowledgedAt:48,stepAt:50};
  assert.equal(busWomanWrongOriginCuePlan({mode:'search',stage:0,clock:40,seconds:1}),null);
  assert.equal(busWomanWrongOriginCuePlan({mode:'ticket-wait',stage:4,clock:40,seconds:4}),null);
  for(const mode of ['search','receive','ready','acknowledge','acknowledge-ticket','step','step-ticket']){
    const plan=busWomanWrongOriginCuePlan({mode,stage:4,clock:50,seconds:1,woman});
    assert.ok(plan.cues.length>=1&&plan.cues.length<=3);
    assert.ok(plan.cues.every(c=>c.strength<.20&&[0,1].includes(c.variant)));
    assert.deepEqual(plan,busWomanWrongOriginCuePlan({mode,stage:4,clock:50,seconds:1,woman}));
  }
  const before=busWomanWrongOriginCuePlan({mode:'search',stage:3,clock:.5,seconds:.5});
  const after=busWomanWrongOriginCuePlan({mode:'search',stage:3,clock:.7,seconds:.7});
  assert.equal(crossedBusWomanWrongOriginCues(before,after).length,1);
  assert.equal(crossedBusWomanWrongOriginCues(null,after).length,0);
  assert.equal(crossedBusWomanWrongOriginCues(after,before).length,0);
  assert.equal(crossedBusWomanWrongOriginCues(before,{...after,clock:5}).length,0,'jumping into a pose catches up an old sound');
});

test('receipt has at most three cloth cues; save/reload does not replay the current gesture',()=>{
  let experience=receiving();
  assert.equal(sample(experience,0),false);
  assert.equal(advance(experience,.25),false);
  assert.equal(advance(experience,.10),true);
  const first=experience.events();
  assert.equal(first.length,1);assert.equal(first[0].cue,'woman-traction');assert.match(first[0].id,/:guard:/);
  assert.deepEqual({x:first[0].x,z:first[0].z},position);
  experience=createOutskirtsExperience(JSON.parse(JSON.stringify(experience.snapshot())));
  assert.equal(sample(experience,.35),false);
  const later=[];
  for(let i=0;i<15;i++){advance(experience,.25);later.push(...experience.events());}
  assert.equal(later.length,2);assert.match(later[0].id,/:pull:/);assert.match(later[1].id,/:release:/);
  assert.equal(experience.snapshot().actions.filter(id=>id.startsWith('woman-traction:')).length,3);
  const reloaded=createOutskirtsExperience(experience.snapshot());
  assert.equal(sample(reloaded,4),false);assert.deepEqual(reloaded.events(),[]);
});

test('unseen, distant, paused, reduced motion and replayed samples are silent and do not catch up',()=>{
  for(const options of [{near:false},{visible:false},{paused:true},{suspended:true},{replayed:true},{reducedMotion:true},{stage:0}]){
    const experience=receiving();sample(experience,0,options);
    advance(experience,.25,options);advance(experience,.10,options);
    assert.deepEqual(experience.events(),[]);
    advance(experience,.10);
    assert.deepEqual(experience.events(),[],'returning to an actor replays a passed bracing sound');
  }
  const late=receiving();late.tickCharacters(.25,{record:false});late.tickCharacters(.25,{record:false});
  assert.equal(sample(late,.5),false,'first approach catches up guard sound');
  const replay=receiving();sample(replay,0);
  const frame={...replay.characterFrame(),clock:.35};
  replay.applyCharacterFrame(frame);sample(replay,.35,{replayed:true});
  assert.deepEqual(replay.events(),[]);
});

test('search emits once per 24 second saved cycle and retains a bounded high-water action marker',()=>{
  const experience=createOutskirtsExperience();
  sample(experience,0,{mode:'search'});
  let heard=0;
  for(let i=0;i<96*60;i++){
    experience.tickCharacters(.25,{record:false});
    const clock=experience.characterFrame().clock;
    sample(experience,Math.min(6,clock%24),{mode:'search'});
    heard+=experience.events().length;
  }
  assert.equal(heard,60);
  const snapshot=experience.snapshot(),markers=snapshot.actions.filter(id=>id.startsWith('woman-traction:'));
  assert.equal(markers.length,1,'an indefinite wait grows an audio history');
  assert.match(markers[0],/:search:pull:59$/);
  // Rewind a causal frame, then sample it in normal time: persisted high-water
  // ownership still prevents an old cycle being delivered a second time.
  experience.applyCharacterFrame({...experience.characterFrame(),clock:.5});
  sample(experience,.5,{mode:'search'});experience.tickCharacters(.25,{record:false});
  assert.equal(sample(experience,.75,{mode:'search'}),false);assert.deepEqual(experience.events(),[]);
  const restored=createOutskirtsExperience(snapshot);
  sample(restored,6,{mode:'wait'});
  assert.deepEqual(restored.events(),[]);
});

function fakeAudio(){
  const nodes=[],destination={};
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
  const node=kind=>{const n={kind,connections:[],gain:param(),pan:param(),frequency:param(),Q:param(),playbackRate:param(),connect(v){this.connections.push(v);},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};nodes.push(n);return n;};
  const ctx={state:'running',currentTime:0,decodeAudioData:async()=>({}),createGain:()=>node('gain'),createBufferSource:()=>node('source'),createBiquadFilter:()=>node('filter'),createStereoPanner:()=>node('pan'),createOscillator:()=>node('oscillator')};
  return {ctx,nodes,destination,getAudio:()=>({ctx,destination})};
}

test('woman consequences use only the licensed recorded cloth, without voice, synthesis or fallback',async()=>{
  const audio=fakeAudio();
  const sound=createOutskirtsStreetAudio({...audio,loadSample:async id=>({id,duration:.8})});
  sound.update({events:[]},{listener:{x:4,z:-20,yaw:0}});
  await new Promise(resolve=>setImmediate(resolve));
  const events=[{id:'woman-test-guard',cue:'woman-traction',variant:0,strength:.12,...position},{id:'woman-test-pull',cue:'woman-traction',variant:1,strength:.18,...position}];
  sound.update({events},{listener:{x:4,z:-20,yaw:0}});
  const sources=audio.nodes.filter(n=>n.kind==='source');
  assert.deepEqual(sources.map(n=>n.buffer.id),['fold-cloth-b','fold-cloth-c']);
  assert.ok(sources.every(n=>n.loop===false&&n.started&&n.stopped));
  assert.equal(audio.nodes.filter(n=>n.kind==='oscillator').length,0);
  assert.ok(audio.nodes.some(n=>n.connections.includes(audio.destination)));
  const count=audio.nodes.length;sound.update({events});assert.equal(audio.nodes.length,count);
  sound.pause();assert.equal(sound.snapshot().voices,0);sound.resume();sound.update({events});assert.equal(sound.snapshot().voices,0);
  sound.destroy();
  const unavailable=fakeAudio(),silent=createOutskirtsStreetAudio({...unavailable,loadSample:async()=>{throw new Error('offline');}});
  silent.update({events:[{...events[0],id:'missing-cloth'}]});
  assert.equal(silent.snapshot().voices,0);assert.equal(unavailable.nodes.length,0,'missing cloth produced a synthetic substitute');
  silent.destroy();
});
