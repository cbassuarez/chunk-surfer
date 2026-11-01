import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { attenuateSourceFearPressure } from '../src/game/source-sensory.js';
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const end=source.indexOf('\nfunction ',start+10);return source.slice(start,end);}
function harness(){
 const calls=[],gains=[],model={mix:1,focused:true};
 const clock={available:true,active:true,pulse:.7,phase:.23,cycle:21};
 const pressure={heartbeat:.8,visualDread:.5,monitorHiss:.2,overall:.8};
 const ctx=vm.createContext({window:{},storyMode:true,inRogue:true,paused:false,
   godFxOverride:{heartbeat:null,visualDread:null,monitorHiss:null},
   sourcePlayerSensoryMix:()=>model.mix,currentFearPressure:()=>pressure,
   gameplayInputLifecycleActive:()=>model.focused,attenuateSourceFearPressure,
   FEAR:{heartbeatFrame:()=>clock,startHeartbeat:()=>calls.push(['start']),setFear:n=>calls.push(['level',n]),setHeartbeatPaused:n=>calls.push(['pause',n])},
   setGainNode:(bus,level)=>gains.push([bus,level]),sfxGain:'world',sfxDirectGain:'direct',bodyGain:'body',dialogGain:'dialog',menuGain:'menu',
   radioWorldGain:()=>.5,setUiCueSfxLevel:()=>{},calls,gains,
 });
 for(const name of ['presentedFearPressure','syncHeartbeatPresentation','setSfxVolume','setDialogVolume'])vm.runInContext(production(name),ctx);
 return{ctx,model,calls,gains,clock};
}

test('actual presented pressure carries the audio clock without inventing a second phase',()=>{
 const h=harness(),p=h.ctx.presentedFearPressure();assert.equal(p.heartbeatClock,h.clock);
 assert.equal(p.heartbeat,.8);assert.equal(p.heartbeatClock.cycle,21);
});
test('Source withdrawal attenuates even a forced high-heartbeat review level',()=>{
 const h=harness();h.ctx.godFxOverride.heartbeat=1;
 for(const mix of [1,.75,.3,0]){h.model.mix=mix;h.ctx.syncHeartbeatPresentation();assert.equal(h.calls.at(-1)[1],mix);}
 assert.equal(h.ctx.presentedFearPressure().heartbeat,0);
});
test('paused and unavailable focus hold the audio-thread owner; returned gameplay releases it',()=>{
 const h=harness();h.ctx.paused=true;h.ctx.syncHeartbeatPresentation();assert.deepEqual(h.calls[0],['pause',true]);
 h.calls.length=0;h.ctx.paused=false;h.model.focused=false;h.ctx.syncHeartbeatPresentation();assert.deepEqual(h.calls[0],['pause',true]);
 h.calls.length=0;h.model.focused=true;h.ctx.syncHeartbeatPresentation();assert.deepEqual(h.calls[0],['pause',false]);
 h.ctx.inRogue=false;h.ctx.syncHeartbeatPresentation();assert.deepEqual(h.calls.at(-1),['level',0]);
});
test('body follows SFX and pause, independently of dialogue and world-radio ducking',()=>{
 const h=harness();h.ctx.setDialogVolume(0);assert.deepEqual(h.gains,[['dialog',0]]);
 h.gains.length=0;h.ctx.setSfxVolume(.7);assert.ok(h.gains.some(([b,v])=>b==='body'&&v===.7));assert.ok(h.gains.some(([b,v])=>b==='world'&&v===.35));
 h.gains.length=0;h.ctx.paused=true;h.ctx.setSfxVolume(.7);assert.ok(h.gains.some(([b,v])=>b==='body'&&v===0));
 assert.ok(h.gains.some(([b,v])=>b==='menu'&&v===.7));
});
