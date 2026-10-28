import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
import * as REC from '../src/game/recordist.js';
import {CHAPEL_DAMAGE_ROOMS,makeTapeDamage,normalizeTapeDamage,selectChapelDamageTarget,tapeDamageEnvelope,tapeDamageGainAt} from '../src/game/tape-damage.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const fixture=(roomId='main_b3',ordinal=1)=>({id:`take:${ordinal}`,ordinal,roomId,status:'accepted',counted:true,sealed:true,startSeconds:(ordinal-1)*60,endSeconds:ordinal*60,durationSeconds:60,
  cleanSeconds:45,at:ordinal*1000,slate:{text:`${roomId}. Take ${ordinal}.`,mode:'fallback',atSeconds:0},
  audible:[['original-room-buffer',.27]],discrete:[{cueId:'original-event',atSec:12,gain:.4,pan:-.2}],guest:{key:'original-guest'},presence:{peak:.2,atSec:18},cell:{x:15,y:12},place:'original station'});
function reset(rows=[fixture()]){PB.stopPlayback();PB.loadTakes(copy(rows));}
const apply=(id='take:1',damageId='chapel:loss:2')=>PB.damageTake(id,{damageId});

test('a deterministic target is an existing ordinary take, preferring real work without an intact backup',()=>{
  const rows=[fixture('main_b3',1),fixture('main_b3',2),fixture('the_tub',3),fixture('lux_nova',4),fixture('soundnoisemusic',5)];
  rows[4].debug=true;
  const target=selectChapelDamageTarget(rows,{rooms:[...CHAPEL_DAMAGE_ROOMS,'lux_nova']});
  assert.equal(target.takeId,'take:3');assert.equal(target.roomId,'the_tub');
  assert.deepEqual(selectChapelDamageTarget(copy(rows)),target);
  for(const field of ['continuous','authored','voided']){const row=fixture();row[field]=true;assert.equal(selectChapelDamageTarget([row]),null,field);}
  assert.equal(selectChapelDamageTarget([{...fixture(),status:'abandoned'}]),null);
  assert.equal(selectChapelDamageTarget([fixture()],{rooms:['the_tub']}),null);
});

test('damage removes one usable interval without changing its original material, identity, timing or tape head',()=>{
  reset([fixture(),fixture('the_tub',2)]);PB.loadTapeTransport({headSeconds:17});
  const original=copy(PB.tapeTake('take:1')),transport=copy(PB.tapeTransport());
  const result=apply();assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(result.hasBackup,false);
  const damaged=PB.tapeTake('take:1');
  for(const field of ['id','ordinal','roomId','startSeconds','endSeconds','slate','audible','discrete','guest','place','presence'])assert.deepEqual(damaged[field],original[field],field);
  assert.equal(damaged.sealed,true);assert.equal(damaged.status,'accepted');assert.equal(damaged.counted,false);assert.equal(damaged.voided,false);
  assert.equal(PB.hasTake('take:1'),true);assert.equal(PB.hasTake('main_b3'),false);assert.deepEqual(PB.takeRoomIds(),['the_tub']);
  assert.deepEqual(PB.tapeTransport(),transport);assert.equal(PB.tapeTakes().length,2);
});

test('an earlier intact accepted backup really preserves the room credit, including across JSON reload',()=>{
  reset([fixture(),fixture('main_b3',2)]);
  const result=apply('take:2');assert.equal(result.hasBackup,true);assert.equal(PB.takeFor('main_b3').id,'take:1');
  const saved=copy(PB.serializeTakes());PB.loadTakes(saved);
  assert.equal(PB.takeFor('main_b3').id,'take:1');assert.deepEqual(PB.takeRoomIds(),['main_b3']);assert.deepEqual(PB.serializeTakes(),saved);
  assert.equal(PB.tapeTake('take:2').damage.id,'chapel:loss:2');
});

test('recordist load projects valid damage immediately, while old and malformed metadata keep their prior rules',()=>{
  REC.setTakeSink(null);reset([fixture(),fixture('the_tub',2)]);apply();
  const saved=copy(PB.serializeTakes());REC.loadRecState({tapes:saved});
  assert.equal(REC.hasTake('main_b3'),false);assert.equal(REC.takePlace('main_b3'),null);assert.equal(REC.hasTake('the_tub'),true);
  const validBackup=fixture('main_b3',3);REC.loadRecState({tapes:[...saved,validBackup]});assert.equal(REC.hasTake('main_b3'),true);
  const malformed={...fixture(),damage:{schema:1,id:'bad',takeId:'foreign'}};REC.loadRecState({tapes:[malformed]});assert.equal(REC.hasTake('main_b3'),true);
  REC.loadRecState({takes:['main_b3'],contaminated:['main_b3'],places:{main_b3:'old station'}});
  assert.equal(REC.hasTake('main_b3'),true);assert.equal(REC.takeIsContaminated('main_b3'),true);assert.equal(REC.takePlace('main_b3'),'old station');
});

test('duplicate loss callbacks remain one loss and a damage ID cannot be reassigned to another interval',()=>{
  reset([fixture(),fixture('the_tub',2)]);assert.equal(apply().changed,true);
  const after=copy(PB.serializeTakes());
  assert.equal(apply().changed,false);assert.equal(apply('take:1','another-id').changed,false);
  const collision=apply('take:2');assert.equal(collision.ok,false);assert.equal(collision.reason,'DAMAGE_ID_ALREADY_USED');
  assert.deepEqual(PB.serializeTakes(),after);
  PB.loadTakes(after);assert.equal(apply().changed,false);assert.deepEqual(PB.serializeTakes(),after);
});

test('a rerecording appends and restores work while the damaged recording remains accessible',()=>{
  reset();apply();const damaged=copy(PB.tapeTake('take:1'));
  PB.beginTake('main_b3',{x:15,y:12});const replacement=PB.startTapeTake('main_b3',{text:'New take.',mode:'fallback'});
  PB.markTake('main_b3');PB.finishTapeTake('main_b3',{elapsed:45,tapeElapsed:47,completed:true});
  assert.equal(replacement.id,'take:2');assert.equal(replacement.startSeconds,60);assert.equal(replacement.endSeconds,107);
  assert.deepEqual(PB.takeRoomIds(),['main_b3']);assert.equal(PB.takeFor('main_b3').id,'take:2');
  assert.deepEqual(copy(PB.tapeTake('take:1')),damaged);
  const saved=copy(PB.serializeTakes());PB.loadTakes(saved);
  assert.deepEqual(PB.serializeTakes(),saved);assert.equal(PB.takeFor('main_b3').id,'take:2');assert.equal(PB.tapeTakes().length,2);
});

test('failed rerecording cannot resurrect the ruined take or discard its history',()=>{
  reset();apply();
  PB.beginTake('main_b3',{});PB.startTapeTake('main_b3');PB.finishTapeTake('main_b3',{elapsed:12,completed:false,spoiled:true});
  assert.equal(PB.hasTake('main_b3'),false);assert.equal(PB.tapeTakes().length,2);
  PB.loadTakes(copy(PB.serializeTakes()));assert.equal(PB.hasTake('main_b3'),false);assert.equal(PB.tapeTake('take:1').damage.cause,'chapel-spill');
});

test('malformed or foreign damage metadata cannot damage a different recording during load',()=>{
  const row=fixture(),damage=makeTapeDamage(row,{damageId:'loss'});assert.ok(damage);
  for(const patch of [{schema:2},{id:''},{cause:'other'},{takeId:'take:99'},{roomId:'the_tub'},{fromSeconds:-1},{toSeconds:61},{toSeconds:Infinity}]){
    assert.equal(normalizeTapeDamage({...damage,...patch},row),null);
    reset([{...row,damage:{...damage,...patch}}]);assert.deepEqual(PB.takeRoomIds(),['main_b3']);assert.equal(PB.tapeTake('take:1').damage,undefined);
  }
  reset();const before=copy(PB.serializeTakes());assert.equal(PB.damageTake('take:1',{damageId:''}).ok,false);assert.equal(PB.damageTake('missing',{damageId:'loss'}).ok,false);assert.deepEqual(PB.serializeTakes(),before);
});

test('an open recording is not replaced or silently sealed by an older interval being targeted',()=>{
  reset();PB.beginTake('the_tub',{});PB.startTapeTake('the_tub');PB.advanceTape('the_tub',9);
  const before=copy(PB.serializeTakes()),head=copy(PB.tapeTransport());
  assert.equal(apply().reason,'RECORDER_RUNNING');assert.deepEqual(PB.serializeTakes(),before);assert.deepEqual(PB.tapeTransport(),head);assert.equal(PB.hasOpenTake(),true);
  PB.abortTake('the_tub');
});

class Param{constructor(){this.events=[];this.value=0;}setValueAtTime(value,at){this.events.push(['set',value,at]);this.value=value;}linearRampToValueAtTime(value,at){this.events.push(['linear',value,at]);this.value=value;}exponentialRampToValueAtTime(value,at){this.events.push(['exponential',value,at]);this.value=value;}}
class AudioNode{constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param();this.pan=new Param();this.connections=[];}connect(node){this.connections.push(node);return node;}disconnect(){}start(){}stop(){}}
class Context{constructor(){this.currentTime=10;this.sampleRate=8000;}createGain(){return new AudioNode();}createBufferSource(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}createStereoPanner(){return new AudioNode();}createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,getChannelData:index=>data[index]};}}

test('actual playback puts slate, room and events through one deterministic damaged-output envelope',()=>{
  reset();apply();const ctx=new Context(),bus=new AudioNode(),slates=[],events=[];
  PB.playbackInit({ctx,bus,pickGuest:()=>null,chunkById:()=>null,chunkByKey:()=>null,
    playSlate:(_slate,options)=>slates.push(options.output),scheduleDiscrete:(_cue,_at,options)=>events.push(options.output)});
  const play=PB.playTake('take:1',{atHead:true});assert.ok(play);
  const gate=play.output.connections[0];assert.notEqual(gate,bus);assert.equal(gate.connections[0],bus);
  assert.ok(gate.gain.events.filter(([,gain])=>gain<.03).length>20,'the actual audio path contains deep dropouts, not merely a DAMAGED label');
  ctx.currentTime=play.startedAt+.1;PB.tickPlayback();assert.deepEqual(slates,[play.output]);assert.deepEqual(events,[play.output]);
  const points=copy(tapeDamageEnvelope(PB.tapeTake('take:1'))),scheduled=copy(gate.gain.events);PB.stopPlayback();
  const saved=copy(PB.serializeTakes());PB.loadTakes(saved);ctx.currentTime=10;
  const replay=PB.playTake('take:1',{atHead:true});assert.deepEqual(replay.output.connections[0].gain.events,scheduled);assert.deepEqual(tapeDamageEnvelope(PB.tapeTake('take:1')),points);
  const silent=points.find(p=>p.gain<.01);assert.ok(tapeDamageGainAt(PB.tapeTake('take:1'),silent.at)<.01);
  const snapshot=PB.buildPlaybackSnapshot({take:PB.tapeTake('take:1'),playing:replay,now:replay.startedAt+silent.at,duration:60});assert.ok(snapshot.signalLeft<.01&&snapshot.signalRight<.01);
  PB.stopPlayback();
});
