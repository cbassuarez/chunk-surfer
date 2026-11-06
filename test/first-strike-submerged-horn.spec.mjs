import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SUBMERGED_HORN as H,renderSubmergedHorn,submergedHornWav} from '../tools/chunk_surfer/build-submerged-horn.mjs';
import {createFirstStrikeWarningAudio} from '../src/audio/first-strike-warning.js';

const FILE='public/audio/first-strike/submerged-car-horn.wav',bytes=readFileSync(FILE),rate=bytes.readUInt32LE(24),count=(bytes.length-44)/2;
const x=Float64Array.from({length:count},(_,i)=>bytes.readInt16LE(44+i*2)/32768);
const level=(a,b,f)=>{const from=Math.round(a*rate),to=Math.round(b*rate),c=2*Math.cos(2*Math.PI*f/rate);let s=0,s2=0;for(let i=from;i<to;i++){const y=x[i]*(.5-.5*Math.cos(2*Math.PI*(i-from)/(to-from)))+c*s-s2;s2=s;s=y;}return Math.sqrt(Math.max(0,s*s+s2*s2-c*s*s2))/(to-from);};
const energy=(a,b,lo,hi)=>{let sum=0;for(let f=lo;f<hi;f+=5)sum+=level(a,b,f)**2;return sum;};
const peakIn=(a,b,lo,hi)=>{let best=lo,top=-1;for(let f=lo;f<=hi;f++){const v=level(a,b,f);if(v>top){top=v;best=f;}}return best;};
const rms=(a,b)=>{let s=0,n=0;for(let i=Math.round(a*rate);i<Math.round(b*rate);i++){s+=x[i]*x[i];n++;}return Math.sqrt(s/n);};

test('the shipped horn is exactly what the tool renders, within a small budget',()=>{
  assert.deepEqual(submergedHornWav(renderSubmergedHorn()),bytes,'rebuild with tools/chunk_surfer/build-submerged-horn.mjs');
  assert.equal(bytes.readUInt16LE(22),1,'mono');assert.equal(rate,H.rate);assert.ok(bytes.length<400000);
  const credits=JSON.parse(readFileSync('public/audio/first-strike/credits.json')).submergedCarHorn;
  assert.equal(credits.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.match(credits.origin,/nothing recorded/);
});

test('it is a horn under water: two notes carry it, and the top of the sound is gone',()=>{
  const low=energy(.3,3.6,20,300),horn=energy(.3,3.6,300,800),high=energy(.3,3.6,1500,10000);
  assert.ok(horn>low,'the notes carry it, not the rumble under them');
  assert.ok(high<(low+horn)*.002,'water has taken everything bright');
  for(const f of H.notes)assert.ok(level(.3,1.1,f)>level(.3,1.1,f*1.12)*3,`the ${f} Hz note is really there`);
});

test('its battery is dying: the pitch sags, it sputters, then the last air goes up',()=>{
  const[lowNote,highNote]=H.notes;
  assert.ok(peakIn(3,3.7,lowNote*.8,lowNote*1.05)<lowNote*.93,'the low note has sagged');
  assert.ok(peakIn(3,3.7,highNote*.8,highNote*1.05)<highNote*.93,'and so has the high one');
  assert.ok(rms(.3,1.2)>rms(3,3.8)*1.2,'it is failing by the end');
  const frames=[];for(let t=2;t<3.9;t+=.01)frames.push(rms(t,t+.01));
  assert.ok(Math.min(...frames)<Math.max(...frames)*.45,'real dropouts, not a smooth fade');
  assert.ok(rms(H.hornSeconds+.2,H.hornSeconds+1)>.01,'the bubbles and the water ring on after it');
  assert.ok(rms(H.seconds-.08,H.seconds)<.02,'and it ends without a click');
});

function audioContext(){
  const started=[],connections=[],param=()=>({value:0,cancelScheduledValues(){}});
  const node=name=>({name,gain:param(),frequency:param(),positionX:param(),positionY:param(),positionZ:param(),connect(other){connections.push([name,other.name]);return other;},disconnect(){}});
  const ctx={currentTime:0,state:'running',started,connections,createGain:()=>node('gain'),createPanner:()=>node('panner'),createBiquadFilter:()=>node('filter'),
    createBufferSource:()=>{const s=node('source');s.start=()=>started.push(s);s.stop=()=>{};return s;},destination:node('out'),
    decodeAudioData:async data=>({numberOfChannels:1,duration:data.byteLength===42000?2.6:5.8,tag:data.byteLength===42000?'clearance':'submerged'})};
  ctx.ctx=ctx;return ctx;
}
const horn=async({submerged=true}={})=>{
  const ctx=audioContext(),requested=[];
  const audio=createFirstStrikeWarningAudio({getAudio:()=>ctx,urlFor:file=>file,fetcher:async url=>{requested.push(url);const wav=url.endsWith('.wav');return{ok:!wav||submerged,arrayBuffer:async()=>new ArrayBuffer(wav?256000:42000)};}});
  assert.equal(await audio.ready(),true);await new Promise(r=>setTimeout(r));
  return{ctx,audio,requested};
};

test('only the 06:00 warning uses it, unplaced and from nowhere in the building',async()=>{
  const{ctx,audio,requested}=await horn();
  assert.deepEqual(requested,['clearance-horn.mp3','submerged-car-horn.wav']);assert.equal(audio.snapshot().submergedReady,true);
  assert.equal(audio.warn({id:'six',key:'first-horn',position:null,age:0},{}),true,'it needs no physical origin');
  assert.equal(ctx.started.at(-1).buffer.tag,'submerged');assert.ok(!ctx.connections.some(([from,to])=>from==='panner'||to==='panner'),'nothing places it');
  assert.equal(audio.warn({id:'six',key:'first-horn',position:null,age:0},{}),false,'it sounds once');
  assert.equal(audio.warn({id:'ten',key:'clearance',position:{x:3,y:2,z:1},age:0},{listener:{x:0,y:1.6,z:0,yaw:0}}),true);
  assert.equal(ctx.started.at(-1).buffer.tag,'clearance','the other warnings keep the air horn');
  assert.equal(audio.warn({id:'none',key:'clearance',position:null,age:0},{}),false,'and still need somewhere to come from');
  audio.update({listener:{x:1,y:1.6,z:1,yaw:.5}});
});

test('it honours the same protections, and a missing file costs only itself',async()=>{
  const{audio}=await horn();
  assert.equal(audio.warn({id:'held',key:'first-horn',age:0},{protected:true}),false,'a take in progress hears nothing');
  assert.equal(audio.warn({id:'old',key:'first-horn',age:.5},{}),false,'and a late edge does not replay');
  const missing=await horn({submerged:false});
  assert.match(missing.audio.snapshot().submergedError,/could not load/);
  assert.equal(missing.audio.warn({id:'six',key:'first-horn',age:0},{}),false);
  assert.equal(missing.audio.warn({id:'ten',key:'clearance',position:{x:3,y:2,z:1},age:0},{listener:{x:0,y:1.6,z:0,yaw:0}}),true,'the clearance warnings still work');
});

test('the game sends the 06:00 warning even with no structure nearby to place it on',()=>{
  const main=readFileSync('src/main.js','utf8'),at=main.indexOf('function deliverNightDeadlineWarnings('),body=main.slice(at,main.indexOf('\n}\n',at));
  assert.match(body,/if\(source\|\|latest\.key==='first-horn'\)firstStrikeAudio\.warning/);
});
