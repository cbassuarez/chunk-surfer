import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaticTexture} from '../src/audio/static-texture.js';

function fixture(){
 const sources=[],nodes=[],ctx={currentTime:12,sampleRate:8000,state:'running'};
 const param=value=>({value,cancelScheduledValues(){},cancelAndHoldAtTime(){},setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
 const node=()=>{const n={links:[],connect(to){this.links.push(to);return to;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
 ctx.createGain=()=>({...node(),gain:param(1)});
 ctx.createBiquadFilter=()=>({...node(),frequency:param(350),Q:param(1)});
 ctx.createBuffer=(channels,length,sampleRate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/sampleRate,getChannelData:i=>data[i]};};
 ctx.createBufferSource=()=>{const n={...node(),starts:[],stops:[],start(at){this.starts.push(at);},stop(at){this.stops.push(at);}};sources.push(n);return n;};
 return{ctx,sources,output:node(),menu:node()};
}

test('production story ownership preserves an adopted carrier through return cleanup and title acquisition',async()=>{
 const h=fixture(),audio=await import('../src/audio/story-audio.js?static-handoff-test');
 audio.storyAudioInit(h.ctx,h.menu,{menu:h.menu,static:h.output,getStaticSfxLevel:()=>.45,getStaticHeld:()=>false});
 const carrier=createStaticTexture({context:h.ctx,destination:h.output,gain:.018});
 assert.equal(audio.adoptMenuHiss(carrier),true);h.ctx.currentTime=17.25;
 audio.stopAll({preserveMenuHiss:true});audio.startMenuHiss();audio.startMenuHiss();
 const snapshot=audio.menuHissSnapshot();
 assert.equal(snapshot.active,true);assert.equal(snapshot.adopted,true);assert.equal(snapshot.carrier.phase,.75);
 assert.equal(snapshot.carrier.startedAt,12);assert.equal(snapshot.carrier.outputLevel,.45);
 assert.equal(h.sources.length,1);assert.equal(h.sources[0].starts.length,1);assert.deepEqual(carrier.gate.links,[h.output]);
 audio.stopAll();assert.equal(audio.menuHissSnapshot().active,false);assert.equal(h.sources[0].stops.length,1);
});

test('fresh boot title requests are idempotent and the new static bus applies no menu-bus SFX multiplier',async()=>{
 const h=fixture(),audio=await import('../src/audio/story-audio.js?static-boot-test');
 audio.storyAudioInit(h.ctx,h.menu,{menu:h.menu,static:h.output,getStaticSfxLevel:()=>.6});
 audio.startMenuHiss();const before=audio.menuHissSnapshot();h.ctx.currentTime=13;audio.startMenuHiss();
 assert.equal(h.sources.length,1);assert.equal(audio.menuHissSnapshot().carrier.startedAt,before.carrier.startedAt);
 assert.equal(audio.menuHissSnapshot().carrier.outputLevel,.6);
 assert.ok(!h.sources[0].disconnected);audio.stopMenuHiss();
});
