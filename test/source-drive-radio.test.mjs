import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {RADIO_SCRATCH_CLIPS,programmeFrame,programmeCues,renderScratchProgramme} from '../src/game/source-drive/radio-programmes.js';
import {SourceDriveAcoustics} from '../src/game/source-drive/acoustics.js';
import {SourceDriveAcoustics as StudySourceDriveAcoustics} from '../artifacts/source-drive-study/acoustics.js';
const context={createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:c=>data[c]};}};
const hash=b=>createHash('sha256').update(Buffer.from(b.getChannelData(0).buffer)).digest('hex');
const state={station:'service',programTime:3,phase:0,phaseStarted:900,radioOn:true,volume:.65,paused:false,furthest:0,z:0};
test('station clock survives OFF, tuning, pause restoration and arbitrary phaseStarted values',()=>{
 assert.equal(programmeFrame(state).cue.id,'service-water');
 const later=programmeFrame({...state,programTime:147,phaseStarted:146});assert.equal(later.cycleSeconds,3);assert.equal(later.cue.id,'service-water');
 assert.equal(programmeFrame({...state,radioOn:false}).caption,null);assert.equal(programmeFrame({...state,volume:0}).caption,null);assert.equal(programmeFrame({...state,paused:true}).caption,null);
 assert.equal(programmeFrame({...state,programTime:80,station:'company'}).cycleSeconds,8);assert.equal(programmeFrame({...state,programTime:147,station:'music'}).cue.id,'music-link');
 assert.deepEqual(programmeFrame({...state,phaseStarted:0}),programmeFrame(state));
});
test('captions correspond only to actual bounded current anonymous programme utterances',()=>{
 for(const station of ['service','company','music'])for(let phase=0;phase<5;phase++){const cues=programmeCues(station,phase);for(const cue of cues){assert(cue.start>=0&&cue.end<72);const f=programmeFrame({...state,station,phase,programTime:cue.start+.2});assert.equal(f.caption.text,cue.text);assert.equal(f.caption.temporary,true);assert(!/Sarah|Lyle/.test(cue.speaker));assert.equal(programmeFrame({...state,station,phase,programTime:cue.start+.2},null,{speechReady:false}).caption,null);}}
 assert.equal(programmeFrame({...state,programTime:9}).caption,null);
});
test('three recognizable programmes have nonzero distinct deterministic audio without a master',()=>{
 const hashes=[];for(const station of ['service','company','music']){const a=renderScratchProgramme(context,station),b=renderScratchProgramme(context,station),samples=a.getChannelData(0);assert.equal(hash(a),hash(b));assert.equal(a.numberOfChannels,1);assert.equal(a.sampleRate,16000);assert.equal(a.duration,72);assert(samples.some(x=>Math.abs(x)>.02));assert(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<.8));hashes.push(hash(a));}assert.equal(new Set(hashes).size,3);
});
test('music keeps its original hesitation and develops a different late stuck answer',()=>{const a=renderScratchProgramme(context,'music',0),b=renderScratchProgramme(context,'music',3);assert.notEqual(hash(a),hash(b));const x=a.getChannelData(0),y=b.getChannelData(0);let difference=0;for(let i=38*16000;i<51*16000;i++)difference+=Math.abs(x[i]-y[i]);assert(difference>10);});
test('scratch manifest is explicit and every source is a real local WAV matching the captions',async()=>{
 const manifest=JSON.parse(await readFile('public/assets/source-drive/radio/scratch-manifest.json','utf8'));assert.equal(manifest.temporary,true);assert.equal(manifest.clips.length,9);
 for(const row of manifest.clips){const source=RADIO_SCRATCH_CLIPS[row.id];assert.equal(row.text,source.text);assert.equal(row.durationSeconds,source.durationSeconds);assert.equal(row.url,source.url);const file='public'+row.url,data=await readFile(file);assert.equal(data.subarray(0,4).toString(),'RIFF');assert((await stat(file)).size>10000);assert.match(row.source,/stock system voice/);}
});
test('production and study retain identical radio transport and programme owners',async()=>{
 assert.equal(SourceDriveAcoustics.toString(),StudySourceDriveAcoustics.toString(),'the shared radio graph, loading and transport stay identical');
 assert.equal(await readFile('src/game/source-drive/radio-programmes.js','utf8'),await readFile('artifacts/source-drive-study/radio-programmes.js','utf8'));
});
