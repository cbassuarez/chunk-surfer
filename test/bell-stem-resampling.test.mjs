import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bellStemTemplate,loadBellStemBank} from '../src/audio/bell-stem-manifest.js';
import {createBellTowerAudio} from '../src/audio/bell-tower-audio.js';
import {ELLERY_BELLS} from '../src/data/bell-tower.js';

const manifest=bellStemTemplate();
const real=readFileSync(new URL('../public/assets/audio/bell-tower/bell-01-hand-01.wav',import.meta.url));
const realBytes=()=>real.buffer.slice(real.byteOffset,real.byteOffset+real.byteLength);
const fetchBytes=bytes=>async()=>({ok:true,arrayBuffer:async()=>bytes.slice(0)});
function wav({rate=48000,channels=1,seconds=12,junk=false}={}){
 const data=rate*channels*2*seconds,extra=junk?10:0,buffer=new ArrayBuffer(44+extra+data),view=new DataView(buffer);
 const tag=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
 tag(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');let at=12;
 if(junk){tag(at,'JUNK');view.setUint32(at+4,1,true);view.setUint8(at+8,42);at+=10;}
 tag(at,'fmt ');view.setUint32(at+4,16,true);view.setUint16(at+8,1,true);view.setUint16(at+10,channels,true);
 view.setUint32(at+12,rate,true);view.setUint32(at+16,rate*channels*2,true);view.setUint16(at+20,channels*2,true);view.setUint16(at+22,16,true);
 tag(at+24,'data');view.setUint32(at+28,data,true);return buffer;
}
for(const rate of[44100,48000])test(`48kHz source remains a stem at a ${rate}Hz Web Audio context`,async()=>{
 let decoded=0;const buffer={sampleRate:rate,numberOfChannels:1,length:rate*12,duration:12};
 const bank=await loadBellStemBank({sampleRate:rate,decodeAudioData:async bytes=>{assert.ok(bytes.byteLength>1000000);decoded++;return buffer;}},manifest,{fetchImpl:fetchBytes(realBytes())});
 assert.equal(decoded,16);assert.equal(bank.size,16);assert.equal(bank.manifest.sampleRate,48000);
 for(const bell of ELLERY_BELLS)for(const stroke of['hand','back']){const entry=bank.pick({bell:bell.id,stroke});assert.equal(entry.buffer,buffer);assert.equal(entry.buffer.sampleRate,rate);assert.equal(entry.contactOffsetSamples,0);}
});
test('callback-style decoding also accepts context-rate output and preserves 48kHz contact offsets',async()=>{
 const altered={...manifest,entries:manifest.entries.map(e=>({...e,contactOffsetSamples:2400}))};
 const bank=await loadBellStemBank({sampleRate:44100,decodeAudioData(_bytes,done){queueMicrotask(()=>done({sampleRate:44100,numberOfChannels:1,duration:12}));}},altered,{fetchImpl:fetchBytes(wav({junk:true}))});
 assert.equal(bank.pick({bell:1,stroke:'hand'}).contactOffsetSamples/48000,.05);
});
for(const[source,pattern]of[
 [wav({rate:44100}),/source sampleRate must equal 48000/],
 [wav({channels:2}),/source must be mono/],
 [wav({seconds:11}),/source must be at least 12 seconds/],
 [realBytes().slice(0,30),/truncated RIFF payload/],
 [new ArrayBuffer(8),/complete RIFF\/WAVE/],
])test(`invalid encoded source is rejected before a nominally valid resampled decode: ${pattern}`,async()=>{
 let decodes=0;await assert.rejects(loadBellStemBank({sampleRate:44100,decodeAudioData:async()=>{decodes++;return{sampleRate:44100,numberOfChannels:1,duration:12};}},manifest,{fetchImpl:fetchBytes(source)}),pattern);
 assert.equal(decodes,0,'a 44.1k context is not permission to accept a wrong-rate, stereo, short or truncated source');
});
for(const[decoded,pattern]of[
 [{sampleRate:48000,numberOfChannels:1,duration:12},/instead of context 44100/],
 [{sampleRate:44100,numberOfChannels:2,duration:12},/decode as mono/],
 [{sampleRate:44100,numberOfChannels:1,duration:11},/at least 12 seconds/],
 [{sampleRate:44100,numberOfChannels:1,duration:NaN},/at least 12 seconds/],
 [{sampleRate:44100,numberOfChannels:1,duration:13},/changed duration during decode/],
])test(`decoded context/mono/duration contract is retained: ${pattern}`,async()=>{
 await assert.rejects(loadBellStemBank({sampleRate:44100,decodeAudioData:async()=>decoded},manifest,{fetchImpl:fetchBytes(wav())}),pattern);
});

test('44.1kHz tower scheduling uses the real loaded stem with source-clock contact alignment',async()=>{
 const starts=[],param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=extra=>({connect(){return this;},disconnect(){},...extra});
 const stem={sampleRate:44100,numberOfChannels:1,duration:12};
 const context={sampleRate:44100,currentTime:10,destination:node(),decodeAudioData:async()=>stem,
  createGain:()=>node({gain:param()}),createBiquadFilter:()=>node({frequency:param(),Q:param()}),createStereoPanner:()=>node({pan:param()}),
  createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)}),
  createBufferSource:()=>node({buffer:null,start(when,offset=0){if(this.buffer===stem)starts.push({when,offset});},stop(){}}),
  createOscillator:()=>node({frequency:param(),detune:param(),start(){},stop(){}}),
 };
 const aligned={...manifest,entries:manifest.entries.map(e=>({...e,contactOffsetSamples:2400}))};
 const audio=createBellTowerAudio({context,stemManifest:aligned,stemManifestUrl:null,fetchImpl:fetchBytes(realBytes())});
 try{
  await audio.loadStems(aligned);audio.start();audio.strike({bell:1,stroke:'hand',rowIndex:0,place:0},ELLERY_BELLS[0],{delaySec:.2});
  assert.equal(audio.snapshot().stemStatus,'ready');assert.equal(audio.snapshot().audioMode,'stems');assert.equal(audio.snapshot().stemError,null);
  assert.equal(starts.length,1);assert.ok(Math.abs(starts[0].when-10.15)<1e-10,'48k source offset is still 50ms after hardware resampling');
 }finally{audio.destroy();}
});
