import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {HEARTBEAT_AUDIO_ASSETS as bank,HEARTBEAT_AUDIO_SOURCES as sources} from '../src/data/heartbeat-audio-assets.js';
import {CREDITS} from '../src/data/credits.js';
const root=new URL('../',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pcm24(name){
 const bytes=read(name);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 let format=null,data=null;
 for(let p=12;p+8<=bytes.length;){const id=bytes.toString('ascii',p,p+4),size=bytes.readUInt32LE(p+4),begin=p+8;
  if(id==='fmt ')format={tag:bytes.readUInt16LE(begin),channels:bytes.readUInt16LE(begin+2),rate:bytes.readUInt32LE(begin+4),bits:bytes.readUInt16LE(begin+14)};
  if(id==='data')data=bytes.subarray(begin,begin+size);p=begin+size+(size%2);
 }
 assert.ok(format&&data,'Expected real RIFF PCM format and data chunks');assert.equal(format.channels,1);assert.equal(format.rate,48000);assert.equal(format.bits,24);
 const samples=Float64Array.from({length:data.length/3},(_,i)=>{const offset=i*3;let value=data[offset]|data[offset+1]<<8|data[offset+2]<<16;if(value&0x800000)value-=0x1000000;return value/0x800000;});
 return{bytes,samples,format};
}
const clips=bank.clips.map(clip=>({...clip,...pcm24('public/'+clip.url)}));
const rms=(samples,a=0,b=samples.length)=>{let sum=0;for(let i=a;i<b;i++)sum+=samples[i]**2;return Math.sqrt(sum/Math.max(1,b-a));};
const peak=(samples,a,b)=>{let max=0;for(let i=a;i<b;i++)max=Math.max(max,Math.abs(samples[i]));return max;};
function strongestWindow(samples,center){
 let best=-1,at=-1;const width=96;
 for(let begin=Math.round((center-.035)*48000);begin<=Math.round((center+.035)*48000);begin+=24){const value=rms(samples,begin,Math.min(samples.length,begin+width));if(value>best){best=value;at=(begin+width/2)/48000;}}
 return at;
}

test('only the two unchanged CC0 original BWF sources feed the production bank and generated credits',()=>{
 assert.equal(sources.length,2);const text=CREDITS.flatMap(section=>section.lines).join('\n');
 for(const source of sources){assert.equal(source.licence,'CC0 1.0');assert.equal(source.deliveryKind,'original-bwf-pcm24');assert.equal(hash(read(source.sourceFile)),source.sourceFileSha256);
  assert.equal(hash(read(source.sourcePage)),source.sourcePageSha256);assert.match(read(source.sourcePage).toString(),/CC0 \(public domain\): Free and royalty-free/);
  for(const term of[source.title,source.author,source.url,source.licenceUrl])assert.ok(text.includes(term),`Missing public credit: ${term}`);
 }
 assert.doesNotMatch(JSON.stringify(sources),/hq-preview|freesound/);assert.equal(bank.dsp.bitDepth,10);assert.equal(bank.dsp.effectiveSampleRate,28000);
});

test('twelve separate full-resolution paired performances retain headroom and one common gain',()=>{
 assert.equal(clips.length,12);assert.equal(new Set(clips.map(c=>c.sha256)).size,12);
 assert.deepEqual([...new Set(clips.map(c=>c.processingGainDb))],[-6]);
 for(const family of['slow','fast']){const group=clips.filter(c=>c.family===family);assert.equal(group.length,6);assert.equal(new Set(group.map(c=>c.sourceStartSeconds)).size,6);
  const levels=group.map(c=>20*Math.log10(rms(c.samples)));assert.ok(Math.max(...levels)-Math.min(...levels)>1.5,'Performed relative dynamic range was flattened');
 }
 for(const clip of clips){assert.equal(hash(clip.bytes),clip.sha256);assert.equal(clip.samples.length,clip.sampleFrames);
  assert.ok(peak(clip.samples,0,clip.samples.length)<.502,'Exports need at least6dB sample headroom');
  assert.ok(Math.abs(clip.samples[0])<1e-7&&Math.abs(clip.samples.at(-1))<1e-7,'Boundary fades end at zero');
  const unique=new Set(clip.samples.slice(0,Math.min(24000,clip.samples.length)));assert.ok(unique.size>10000,'Production WAV must not already contain the runtime10-bit quantizer');
 }
});

test('both measured contacts belong to the same complete event and no extra primary survives its tail',()=>{
 for(const clip of clips){const{samples,firstPeakSeconds:first,secondPeakSeconds:second}=clip;
  assert.ok(first>=.04&&first<=.07);assert.ok(second-first>=.20&&second-first<=.26,'Paired contacts must not be confused with separate cycles');
  assert.ok(Math.abs(strongestWindow(samples,first)-first)<.003);assert.ok(Math.abs(strongestWindow(samples,second)-second)<.003);
  const firstEnergy=rms(samples,Math.round((first-.025)*48000),Math.round((first+.025)*48000));const secondEnergy=rms(samples,Math.round((second-.025)*48000),Math.round((second+.025)*48000));
  assert.ok(firstEnergy>.005&&secondEnergy>.005,'Both contacts must be retained');
  assert.ok(clip.durationSeconds-second>.18,'Retain settling after the second contact');
  const tail=peak(samples,Math.round((second+.18)*48000),samples.length);assert.ok(tail<Math.max(firstEnergy,secondEnergy)*.1,'No later sole-like primary contact belongs in this paired voice');
  assert.equal(clip.pulseEnvelopeStepSeconds,.005);assert.ok(clip.pulseEnvelope.length>=96);assert.ok(clip.pulseEnvelope.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
 const fast=clips.filter(c=>c.family==='fast');assert.ok(fast.every(c=>c.durationSeconds+bank.minimumTailMarginSeconds<=bank.minimumSuggestedPeriodSeconds+1e-9));
 assert.ok(bank.decodedFloat32BytesAt48k<1.3*1024*1024,'Heartbeat bank should remain a small bounded residency');
});
