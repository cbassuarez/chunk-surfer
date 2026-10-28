import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoorAudio,createDoorTakeSelector,doorSoundSpatial,DOOR_SOUND_FAMILY} from '../src/audio/door-audio.js';
import {DOOR_ARCHETYPES} from '../src/data/conservatory-doors.js';

const param=(value=0)=>({value,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}});
function fixture({legacyOpening=false}={}){
  const sources=[],requests=[];
  const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
  const ctx={state:'running',currentTime:1,sampleRate:44100,
    createBufferSource(){const s={...node(),playbackRate:param(1),start(time,offset){this.started=true;this.offset=offset;},stop(){this.stopped=true;}};sources.push(s);return s;},
    createGain:()=>({...node(),gain:param(1)}),createBiquadFilter:()=>({...node(),frequency:param(),Q:param()}),createStereoPanner:()=>({...node(),pan:param()}),
    decodeAudioData:async()=>({duration:1.6}),
  };
  const portal={id:'pub-west-entry',definition:{archetype:'public-glazed-pair'}},destination=node();
  const assets=Object.fromEntries(['a','b','c','d','open','close','motion','legacy-open'].map(id=>[id,{url:`audio/doors/${id}.wav`,gainDb:-7}]));
  const families={bell:{bell:['a','b','c','d']},glazed:{open:[legacyOpening?'legacy-open':'open'],close:['close']},metal:{motionClose:['motion'],close:['close']}};
  families['heritage-glazed']=families.glazed;
  const engine=createDoorAudio({getAudio:()=>({ctx,destination}),assets,families,random:()=>.5,
    fetchImpl:url=>new Promise(resolve=>requests.push({url,resolve}))});
  const input={active:true,listener:{x:0,y:1.6,z:0,yaw:0},nearDoors:[portal]};
  const load=async()=>{await Promise.resolve();for(const r of requests.splice(0))r.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await engine.whenReady();};
  return{ctx,sources,requests,portal,engine,input,load};
}

test('door take bag uses four genuine variants and prevents boundary repetition',()=>{
  const selector=createDoorTakeSelector(()=>.01),ids=['a','b','c','d'];
  const played=Array.from({length:40},()=>selector.next('pub:bell',ids));
  for(let i=0;i<played.length;i+=4)assert.equal(new Set(played.slice(i,i+4)).size,4);
  for(let i=1;i<played.length;i++)assert.notEqual(played[i],played[i-1]);
});

test('recorded door perspective follows bearing, distance, floor height and obstruction',()=>{
  const listener={x:0,y:1.6,z:0,yaw:0};
  const left=doorSoundSpatial(listener,{x:-2,y:2,z:0}),right=doorSoundSpatial(listener,{x:2,y:2,z:0});
  assert.ok(left.pan<0&&right.pan>0);
  const away=doorSoundSpatial(listener,{x:15,y:2,z:0}),above=doorSoundSpatial(listener,{x:2,y:16,z:0});
  assert.ok(away.gain<right.gain&&above.gain<right.gain);
  const wall=doorSoundSpatial(listener,{x:2,y:2,z:0},24);
  assert.ok(wall.gain<right.gain*.07&&wall.cutoff<right.cutoff*.2);
});

test('all ordinary archetypes have an explicit material-family decision',()=>{
  for(const archetype of Object.keys(DOOR_ARCHETYPES))assert.ok(DOOR_SOUND_FAMILY[archetype],archetype);
});

test('a late decode cannot ring after pause, reset or a missed contact deadline',async()=>{
  for(const operation of ['pause','reset','deadline']){
    const f=fixture();f.engine.update(f.input);
    f.engine.event({type:'bell',portal:f.portal,fraction:.12},{x:2,y:2,z:0});
    if(operation==='deadline')f.ctx.currentTime+=.2;else f.engine[operation]();
    await f.load();assert.equal(f.sources.length,0,'decoding never schedules playback');
    f.engine.update(f.input);
    assert.equal(f.sources.length,0,operation);assert.equal(f.engine.snapshot().queued,0);
  }
});

test('live voice spatial response updates and pause releases its nodes without replay',async()=>{
  const f=fixture();f.engine.update(f.input);await f.load();
  f.engine.event({type:'bell',portal:f.portal,fraction:.12},{x:2,y:2,z:0});
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].playbackRate.value,1,'no fake performance from pitch randomisation');
  assert.ok(f.engine.snapshot().active[0].pan>0);
  f.engine.update({...f.input,listener:{...f.input.listener,yaw:Math.PI},occlusion:()=>24});
  assert.ok(f.engine.snapshot().active[0].pan<0);
  f.engine.pause();assert.equal(f.engine.snapshot().voices,0);assert.ok(f.sources[0].stopped);
  f.engine.update(f.input);assert.equal(f.sources.length,1,'returning focus does not replay the strike');
});

test('close movement stops on an occupied sweep while contact tails remain finite',async()=>{
  const f=fixture();f.portal.definition.archetype='bay-goods-pair';f.engine.update(f.input);await f.load();
  f.engine.event({type:'closing-start',portal:f.portal,fraction:1},{x:2,y:1,z:0});
  assert.equal(f.sources.length,0,'intent without travel is silent');
  f.engine.event({type:'movement',started:true,direction:-1,portal:f.portal,fraction:.9},{x:2,y:1,z:0});
  assert.equal(f.engine.snapshot().voices,1);
  f.engine.event({type:'movement',started:false,direction:-1,portal:f.portal,fraction:.8},{x:2,y:1,z:0});
  assert.equal(f.sources.length,1,'continuous travel does not retrigger a loop each frame');
  f.engine.event({type:'movement-stop',portal:f.portal,fraction:.8},{x:2,y:1,z:0});
  assert.equal(f.engine.snapshot().voices,0,'held sweep releases the hinge voice');
  f.engine.event({type:'movement',started:true,direction:-1,portal:f.portal,fraction:.5},{x:2,y:1,z:0});
  assert.equal(f.sources.at(-1).offset,.8,'resumed friction seeks the actual halfway travel phase');
  f.engine.event({type:'closed',portal:f.portal,fraction:0},{x:2,y:1,z:0});
  assert.equal(f.engine.snapshot().voices,1);
  f.ctx.currentTime+=2;f.engine.update(f.input);assert.equal(f.engine.snapshot().voices,0);
});

test('the selected Lyric bell is not masked by an inherited closing file on opening',async()=>{
  const f=fixture({legacyOpening:true});f.engine.update(f.input);await f.load();
  f.engine.event({type:'opening-start',portal:f.portal,fraction:0},{x:2,y:1,z:0});
  assert.equal(f.sources.length,0);
  f.engine.event({type:'bell',portal:f.portal,fraction:.12},{x:2,y:2,z:0});
  assert.equal(f.sources.length,1);assert.equal(f.engine.snapshot().active[0].action,'bell');
});

test('a world hold releases travel while letting an already struck bell finish',async()=>{
  const f=fixture();f.engine.update(f.input);await f.load();
  f.engine.event({type:'opening-start',portal:f.portal,fraction:0},{x:2,y:1,z:0});
  f.engine.event({type:'bell',portal:f.portal,fraction:.12},{x:2,y:2,z:0});
  assert.equal(f.engine.snapshot().voices,2);f.engine.holdMotion();
  assert.equal(f.engine.snapshot().voices,1);assert.equal(f.engine.snapshot().active[0].action,'bell');
});
