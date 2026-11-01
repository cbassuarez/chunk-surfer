import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRadioInstrument } from '../src/game/radio-instrument.js';
import { radioContactFrame, RADIO_CHANNELS, RADIO_DESK_CHANNEL, RADIO_HIDDEN_CHANNEL,
  RADIO_CHANNEL_SETTLE } from '../src/render/radio-contact-performance.js';

function fixture(extra={}){
  const controls=[],volumes=[],eggs=[];let away=0,eligible=true,heard=false;
  const instrument=createRadioInstrument({
    onControl:(kind,detail)=>controls.push({kind,...detail}),onVolume:value=>volumes.push(value),
    onTuneAway:()=>away++,canEgg:()=>eligible,eggHeard:()=>heard,
    onEgg:()=>{const promise=new Promise((resolve,reject)=>eggs.push({resolve,reject}));return promise;},...extra,
  });
  return {instrument,controls,volumes,eggs,away:()=>away,
    eligible:value=>{eligible=value;},heard:value=>{heard=value;}};
}
function advance(instrument,seconds,context={quiet:true}){
  for(let remaining=seconds;remaining>1e-8;remaining-=.05)instrument.update(Math.min(.05,remaining),context);
}
function tuneTo(instrument,channel){
  for(let n=0;n<RADIO_CHANNELS&&instrument.view().channel!==channel;n++)instrument.tune(1,true);
  assert.equal(instrument.view().channel,channel);
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('the real preset ring wraps in both directions and always remains within its 16 channels',()=>{
  const f=fixture(),i=f.instrument;
  assert.equal(RADIO_CHANNELS,16);assert.equal(RADIO_DESK_CHANNEL,2);assert.equal(i.view().channel,2);
  const forward=[];for(let n=0;n<16;n++){assert.equal(i.tune(1,true),true);forward.push(i.view().channel);}
  assert.deepEqual(new Set(forward),new Set(Array.from({length:16},(_,n)=>n+1)));
  assert.equal(i.view().channel,2);
  for(let n=0;n<48;n++){i.tune(-1,true);assert.ok(i.view().channel>=1&&i.view().channel<=16);}
  tuneTo(i,1);i.tune(-1,true);assert.equal(i.view().channel,16);i.tune(1,true);assert.equal(i.view().channel,1);
  assert.equal(f.eggs.length,0,'tuning alone does not emit a voice');i.stop();
});

test('prohibited tuning neither changes the preset nor creates a detent, a tune-away or an egg request',()=>{
  const f=fixture(),i=f.instrument;
  for(const direction of [-1,1])assert.equal(i.tune(direction,false),false);
  assert.equal(i.view().channel,2);assert.equal(f.away(),0);assert.equal(f.eggs.length,0);
  assert.deepEqual(f.controls,[{kind:'denied'},{kind:'denied'}]);i.stop();
});

test('held physical keys retain pressure until release and one press has one matching release',()=>{
  const f=fixture(),i=f.instrument;
  assert.equal(i.press('ptt',{hold:true}),true);advance(i,2,{quiet:false});
  assert.deepEqual(i.view().interaction,{id:'ptt',pressure:1});
  i.release();i.release();assert.equal(i.view().interaction.pressure,0);
  assert.deepEqual(f.controls,[{kind:'press',id:'ptt'},{kind:'release',id:'ptt'}]);
  advance(i,.1,{quiet:false});assert.deepEqual(i.view().interaction,{id:null,pressure:0});i.stop();
});

test('a tap retains finite physical travel; changing controls releases the previous key without a stranded hold',()=>{
  const f=fixture(),i=f.instrument;
  i.press('ptt');advance(i,.1,{quiet:false});assert.equal(i.view().interaction.pressure,1);
  advance(i,.03,{quiet:false});assert.equal(i.view().interaction.pressure,0);
  assert.deepEqual(f.controls.map(c=>c.kind),['press','release']);
  i.press('ptt',{hold:true});i.press('volume');
  assert.deepEqual(f.controls.slice(-3),[{kind:'press',id:'ptt'},{kind:'release',id:'ptt'},{kind:'press',id:'volume'}]);
  advance(i,.2,{quiet:false});assert.equal(f.controls.at(-1).kind,'release');i.stop();
});

test('volume reaches actual mute and full output without crossing either boundary',()=>{
  const f=fixture(),i=f.instrument;assert.equal(i.view().volume,.75);
  for(let n=0;n<12;n++)i.adjustVolume(-1);
  assert.equal(i.view().volume,0);assert.ok(f.volumes.every(v=>v>=0&&v<=1));
  const mutedAway=f.away();assert.ok(mutedAway>=1,'mute cancels any owned reception');
  for(let n=0;n<12;n++)i.adjustVolume(1);
  assert.equal(i.view().volume,1);assert.ok(f.volumes.every(v=>[0,.25,.5,.75,1].includes(v)));
  assert.equal(f.eggs.length,0);i.stop();
});

test('the hidden channel requires stable active time, quiet, permission, volume and unheard state',()=>{
  assert.equal(RADIO_HIDDEN_CHANNEL,13);assert.equal(RADIO_CHANNEL_SETTLE,1.4);
  const f=fixture(),i=f.instrument;tuneTo(i,13);
  advance(i,1.35);assert.equal(f.eggs.length,0,'a brief accidental pass is silent');
  f.eligible(false);advance(i,.2);assert.equal(f.eggs.length,0,'settling cannot bypass the owner permission');
  f.eligible(true);advance(i,1,{quiet:false});assert.equal(f.eggs.length,0,'a live conversation is not interrupted');
  f.heard(true);advance(i,.2);assert.equal(f.eggs.length,0,'saved delivery state wins over the local timer');
  f.heard(false);advance(i,.1);assert.equal(f.eggs.length,1);
  assert.equal(i.view().eggPlaying,false,'requesting is not proof that audio started');i.stop();
});

test('ordinary channels and muted listening remain silent even after a long stable dwell',()=>{
  const a=fixture();advance(a.instrument,60);assert.equal(a.eggs.length,0);a.instrument.stop();
  const b=fixture();tuneTo(b.instrument,13);
  for(let n=0;n<3;n++)b.instrument.adjustVolume(-1);
  advance(b.instrument,60);assert.equal(b.eggs.length,0);b.instrument.stop();
});

test('the hidden fragment is requested once per entry, including after completion or a failed attempt',async()=>{
  for(const success of [true,false]){
    const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);assert.equal(f.eggs.length,1);
    advance(i,15);assert.equal(f.eggs.length,1,'an outstanding decode does not receive duplicates');
    f.eggs[0].resolve(success);await settle();assert.equal(i.view().eggPlaying,success);
    i.eggEnded();advance(i,15);assert.equal(f.eggs.length,1,'a finished or failed exposure cannot become a loop');
    i.tune(1,true);i.tune(-1,true);advance(i,1.5);
    assert.equal(f.eggs.length,2,'a new physical entry may retry an unheard delivery');i.stop();
  }
});

test('a saved heard result prevents repeat delivery after tuning away and returning',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);
  f.eggs[0].resolve(true);await settle();f.heard(true);i.eggEnded();
  i.tune(1,true);i.tune(-1,true);advance(i,20);assert.equal(f.eggs.length,1);i.stop();
});

test('tuning away cancels acceptance of a stale async success without consuming a future entry',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);const old=f.eggs[0];
  i.tune(1,true);old.resolve(true);await settle();assert.equal(i.view().eggPlaying,false);
  i.tune(-1,true);advance(i,1.5);assert.equal(f.eggs.length,2);
  f.eggs[1].resolve(true);await settle();assert.equal(i.view().eggPlaying,true);i.stop();
});

test('muting invalidates in-flight reception and a late audio result cannot restore it',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);
  for(let n=0;n<3;n++)i.adjustVolume(-1);
  f.eggs[0].resolve(true);await settle();assert.equal(i.view().eggPlaying,false);
  i.adjustVolume(1);advance(i,10);assert.equal(f.eggs.length,1,'volume restoration does not replay the interrupted fragment');i.stop();
});

test('suspension freezes settling, releases the physical key, and invalidates pending audio without a resume replay',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,.7);
  i.press('ptt',{hold:true});i.suspend();
  assert.equal(i.view().interaction.pressure,0);assert.equal(i.press('ptt'),false);
  assert.equal(i.adjustVolume(1),false);const channel=i.view().channel;
  assert.equal(i.tune(1,true),false);assert.equal(i.view().channel,channel);
  advance(i,120);assert.equal(f.eggs.length,0);i.resume();advance(i,.6);assert.equal(f.eggs.length,0);
  advance(i,.2);assert.equal(f.eggs.length,1);i.suspend();f.eggs[0].resolve(true);await settle();
  assert.equal(i.view().eggPlaying,false);i.resume();advance(i,10);assert.equal(f.eggs.length,1);i.stop();
});

test('dead state cancels pending reception and cannot request a fragment or render a carrier lamp',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);
  const before=f.away();i.update(.05,{quiet:true,dead:true});
  assert.equal(f.away(),before+1);f.eggs[0].resolve(true);await settle();assert.equal(i.view().eggPlaying,false);
  advance(i,30,{quiet:true,dead:true});assert.equal(f.eggs.length,1);
  const frame=radioContactFrame({who:'martin',typing:true,radio:{dead:true,stage:'live',time:100,
    instrument:{channel:2,eggPlaying:true,interaction:{id:'ptt',pressure:1}}}});
  assert.equal(frame.dead,true);assert.equal(frame.carrier,'off');
  for(const stage of ['break','after'])assert.equal(radioContactFrame({who:'martin',radio:{stage,instrument:{eggPlaying:true}}}).carrier,'off');i.stop();
});

test('stop releases ownership once and rejects later controls, updates and async delivery',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);
  i.press('ptt',{hold:true});i.stop();const away=f.away();i.stop();i.resume();
  assert.equal(f.away(),away);assert.equal(i.press('ptt'),false);assert.equal(i.adjustVolume(1),false);
  f.eggs[0].resolve(true);await settle();advance(i,30);assert.equal(i.view().eggPlaying,false);assert.equal(f.eggs.length,1);
});

test('decode rejection is contained and never converts subsequent update frames into a repeated request',async()=>{
  const f=fixture(),i=f.instrument;tuneTo(i,13);advance(i,1.5);f.eggs[0].reject(Error('missing audio'));
  await settle();advance(i,30);assert.equal(f.eggs.length,1);assert.equal(i.view().eggPlaying,false);i.stop();
});

test('real authored rupture IDs provide presentation states; elapsed uptime cannot invent a failure or advance the conversation',()=>{
  const stages=new Set(['onset','relay','decision','reseat','still','break','after']);
  for(const name of ['radio.pre_third_room_breakdown','radio.hush_help_rupture']){
    const story=JSON.parse(readFileSync(new URL(`../content/narrative/${name}.story.json`,import.meta.url),'utf8'));
    const sourceIds=Object.values(story.nodes).flatMap(node=>node.lines||[]).map(line=>line.id).filter(id=>id?.startsWith('rupture.'));
    assert.deepEqual(new Set(sourceIds.map(id=>id.split('.').at(-1))),stages,name);
    for(const id of sourceIds){
      const stage=id.split('.').at(-1),view={radio:{stage,time:1e6,age:0}};
      const before=JSON.stringify(view),a=radioContactFrame(view),b=radioContactFrame(view);
      assert.equal(a.stage,stage);assert.deepEqual(a,b,'rendering has no independent running clock');assert.equal(JSON.stringify(view),before);
    }
  }
  const live=radioContactFrame({radio:{stage:'live',time:1e6,age:1e6}});
  assert.equal(live.stage,'live');assert.equal(live.batteryGap,0);assert.equal(live.ptt,0);assert.equal(live.dead,false);
});

test('PTT travel follows the actual control or spoken player line and does not infer speech from captions alone',()=>{
  const receive=radioContactFrame({who:'martin',typing:true,radio:{instrument:{channel:2}}});
  assert.equal(receive.carrier,'rx');assert.equal(receive.ptt,0);assert.equal(receive.thumb,0);
  const player=radioContactFrame({who:'me',typing:true,radio:{}});
  assert.equal(player.ptt,1);assert.equal(player.thumb,1);assert.equal(player.carrier,'tx');
  const thought=radioContactFrame({who:'you',typing:true,radio:{}});assert.equal(thought.carrier,'off');assert.equal(thought.ptt,0);
  const options=radioContactFrame({who:'me',typing:true,pending:{options:[{}]},radio:{}});
  assert.equal(options.ptt,0);assert.equal(options.carrier,'off');
  const pressed=radioContactFrame({radio:{instrument:{interaction:{id:'ptt',pressure:.6}}}});
  assert.equal(pressed.ptt,.6);assert.equal(pressed.thumb,.6);assert.equal(pressed.carrier,'off','mechanical inspection alone does not claim a transmission');
});

test('key and seam revelation follow their actual authored flags rather than the age of a relay stage',()=>{
  const plain=radioContactFrame({radio:{stage:'relay',age:100,time:100}});
  assert.equal(plain.batteryGap,0);assert.equal(plain.ptt,0);
  const stuck=radioContactFrame({radio:{stage:'relay',age:0,keyStuck:true}});
  assert.equal(stuck.ptt,1);assert.equal(stuck.thumb,0);assert.equal(stuck.carrier,'weak');
  const seam=radioContactFrame({radio:{stage:'relay',age:0,seamRevealed:true}});
  assert.equal(seam.batteryGap,1);assert.equal(seam.handAction,'battery');
});

test('battery contact is visibly compressed by the actual uninterrupted hold; keeping still does not reseat it',()=>{
  const options=[{goto:'reseat'},{goto:'still'}];
  const frame=(hold,index=0)=>radioContactFrame({pending:{options,index},radio:{stage:'decision',hold}});
  assert.equal(frame(0).batteryPress,0);assert.equal(frame(.325).batteryPress,.5);
  assert.equal(frame(.65).batteryPress,1);assert.equal(frame(6.5).batteryPress,1);
  assert.equal(frame(-1).batteryPress,0);assert.equal(frame(.65,1).batteryPress,0);
  assert.equal(frame(.325).handPressure,.5);assert.equal(frame(.65,1).handPressure,0);
  const reseat=radioContactFrame({radio:{stage:'reseat',age:.325}});
  assert.equal(reseat.batteryPress,.5);assert.equal(reseat.batteryGap,.5);
  assert.equal(radioContactFrame({radio:{stage:'still',age:10}}).batteryGap,1);
});

test('reduced motion removes whole-body raising while retaining the physical failure and chosen contact pressure',()=>{
  for(const stage of ['live','decision','reseat','still','break','after']){
    const view={pending:{index:0,options:[{goto:'reseat'}]},radio:{time:.2,age:.325,stage,hold:.325,
      instrument:{channel:13,interaction:{id:'battery',pressure:.5}}}};
    const normal=radioContactFrame(view),reduced=radioContactFrame(view,{reducedMotion:true});
    assert.ok(normal.raise<1);assert.equal(reduced.raise,1);
    for(const key of ['ptt','thumb','channel','batteryGap','batteryPress','handAction','handPressure','dead','carrier'])
      assert.deepEqual(reduced[key],normal[key],`${stage}:${key}`);
    assert.equal(reduced.reducedMotion,true);
  }
});
