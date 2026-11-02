import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeB3ConsoleScene} from '../src/game/b3-console-scene.js';
import {b3ConsoleLayout,b3ConsoleHit} from '../src/render/b3-console-view.js';

function fixture(){
  let state={active:true,phase:'sounding',fader:Array(16).fill(.5),intensity:.5,powerOn:true},closes=0;
  const actions=[];
  const scene=makeB3ConsoleScene({getState:()=>state,
    onFader:(channel,value)=>{state.fader[channel-1]=value;if(channel===3)state.intensity=value;actions.push(['fader',channel,value]);},
    onPower:on=>{state.powerOn=on;actions.push(['power',on]);},onClose:()=>closes++});
  scenes.push(scene);return{scene,actions,state,get closes(){return closes;}};
}

test('the player can turn a specific fader and power off without pausing the room',()=>{
  const f=fixture(),s=f.scene;
  assert.equal(s.blocksWorld,false);assert.equal(s.worldPresentation,'visible');
  s.key({key:'ArrowRight'});s.key({key:'ArrowRight'});assert.equal(s.view().selected,3);
  for(let i=0;i<5;i++)s.key({key:'ArrowDown'});
  assert.ok(f.state.fader[2]<.0001);assert.ok(f.state.intensity<.0001);
  assert.equal(f.state.fader[1],.5,'other channels are unchanged');
  s.key({key:'p'});assert.equal(f.state.powerOn,false);
  assert.ok(f.state.intensity<.0001,'the power switch is independent of source state');
  s.key({key:'e',code:'KeyE'});assert.equal(f.closes,1);assert.equal(scenes.has('b3-console'),false);
  s.key({key:'Escape'});assert.equal(f.closes,1);
});

test('pointer control moves the physical slider and all sixteen channels remain reachable',()=>{
  const f=fixture(),s=f.scene,l=s.view().layout,third=l.strips[2];
  s.pointer({type:'pointerdown',button:0,pointerId:7,cellX:third.x+third.w/2,cellY:third.track.y+third.track.h/2});
  s.pointer({type:'pointermove',pointerId:7,cellX:third.x+third.w/2,cellY:third.track.y+third.track.h});
  s.pointer({type:'pointerup',pointerId:7});assert.equal(f.state.fader[2],0);
  for(let i=0;i<3;i++){
    const next=s.view().layout.next;
    s.pointer({type:'pointerdown',button:0,pointerId:8,cellX:next.x+next.w/2,cellY:next.y+next.h/2});
    s.pointer({type:'pointerup',button:0,pointerId:8,cellX:next.x+next.w/2,cellY:next.y+next.h/2});
  }
  assert.equal(s.view().selected,16);assert.deepEqual(s.view().layout.strips.map(x=>x.channel),[9,10,11,12,13,14,15,16]);
  const leave=s.view().layout.close;
  s.pointer({type:'pointerdown',button:0,pointerId:8,cellX:leave.x+leave.w/2,cellY:leave.y+leave.h/2});
  s.pointer({type:'pointerup',button:0,pointerId:8,cellX:leave.x+leave.w/2,cellY:leave.y+leave.h/2});
  assert.equal(f.closes,1,'pointer users can leave without the keyboard');
});

test('large text and a compact viewport keep control hit targets separate; blur releases drag',()=>{
  const l=b3ConsoleLayout({cols:20,rows:8},3);
  assert.ok(l.strips.every(x=>x.w>0&&x.track.h>0));
  for(const s of l.strips){const hit=b3ConsoleHit(l,s.x+s.w/2,s.track.y+s.track.h/2);assert.equal(hit.channel,s.channel);}
  assert.equal(b3ConsoleHit(l,l.power.x+l.power.w/2,l.power.y+l.power.h/2).kind,'power');
  const f=fixture(),s=f.scene,t=s.view().layout.strips[2];
  s.pointer({type:'pointerdown',button:0,pointerId:2,cellX:t.x+t.w/2,cellY:t.track.y});
  s.blur();const before=f.actions.length;
  s.pointer({type:'pointermove',pointerId:2,cellX:t.x+t.w/2,cellY:t.track.y+t.track.h});
  assert.equal(f.actions.length,before,'no stuck drag after focus loss');s.key({key:'Escape'});
});

test('the live disturbance obeys the actual console controls and not its power switch',async()=>{
  const {createB3SpeakerDisturbance}=await import('../src/game/b3-speaker-disturbance.js');
  const speaker=createB3SpeakerDisturbance();
  speaker.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45});
  const scene=makeB3ConsoleScene({getState:()=>speaker.snapshot(),onFader:(c,v)=>speaker.setFader(c,v),onPower:v=>speaker.setPower(v),onClose:()=>speaker.flush()});
  scenes.push(scene);const before=speaker.snapshot();assert.ok(before.active&&before.intensity>0);
  scene.key({key:'p'});
  assert.equal(speaker.snapshot().powerOn,false);assert.equal(speaker.snapshot().intensity,before.intensity,'power cut does not stop the impossible sound');
  scene.key({key:'ArrowRight'});scene.key({key:'ArrowRight'});
  scene.key({key:'ArrowDown'});assert.ok(speaker.snapshot().intensity<before.intensity,'moving the actual channel changes audible intensity');
  scene.key({key:'End'});assert.equal(speaker.snapshot().phase,'silenced');scene.key({key:'Escape'});
});

test('world fader movement follows the user’s actual value without moving its collider',async()=>{
  const {b3FaderCapId,b3FaderDrift,syncB3FaderProps}=await import('../src/game/b3-console-faders.js');
  assert.deepEqual(b3FaderDrift(.75),{dx:0});
  assert.ok(b3FaderDrift(0).dx>0,'a lowered fader moves towards the operator');
  assert.ok(b3FaderDrift(1).dx<0,'raising moves away from the operator');
  const calls=[];assert.equal(syncB3FaderProps({setPropDrift:(id,drift)=>{calls.push([id,drift]);return{id};}},[1,.75,0]),16);
  assert.equal(calls[2][0],b3FaderCapId(3));assert.deepEqual(calls[2][1],b3FaderDrift(0));
});

test('R stops a running take through the existing host callback, but never starts one or repeats',()=>{
  let recording=false,stops=0;
  const scene=makeB3ConsoleScene({isRecording:()=>recording,onRecord:()=>{stops++;recording=false;}});
  scenes.push(scene);
  scene.key({key:'r',code:'KeyR'});assert.equal(stops,0,'R does not initiate a new recording from the desk');
  recording=true;scene.key({key:'r',code:'KeyR',repeat:true});assert.equal(stops,0,'autorepeat cannot stop the take');
  scene.key({key:'r',code:'KeyR',metaKey:true});assert.equal(stops,0,'a modified shortcut cannot stop the take');
  scene.key({key:'r',code:'KeyR'});assert.equal(stops,1);assert.equal(recording,false);
  scene.key({key:'r',code:'KeyR'});assert.equal(stops,1,'subsequent R does not reopen transport');
  scene.key({key:'Escape'});
});
