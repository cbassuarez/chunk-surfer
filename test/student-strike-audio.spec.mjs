import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentStrikeAudio} from '../src/audio/student-strike.js';
const cue={id:'N1',start:1,end:4,text:'The file still said MISSING.',actorId:'odette'};
function rig(){const nodes=[],starts=[];const ctx={state:'running',createBuffer:()=>({copyToChannel(){}})};
 const make=()=>{const n={gain:{value:0},frequency:{value:0},pan:{value:0},playbackRate:{value:0},connect(){},disconnect(){this.disconnected=true;},stop(){this.stopped=true;},start(...a){starts.push(a);}};nodes.push(n);return n;};
 for(const name of ['createBufferSource','createBiquadFilter','createGain','createStereoPanner'])ctx[name]=make;
 return{ctx,nodes,starts,destination:{}};
}
const speech=async()=>({samples:new Float32Array(200),sampleRate:100,provider:'test'});
test('preparation does not create audio nodes and a failed line leaves caption timing usable',async()=>{
 const r=rig();let text;const audio=createStudentStrikeAudio({getAudio:()=>r,renderSpeech:async t=>{text=t;return speech();}});
 await audio.prepare([cue]);assert.match(text,/missing/);assert.equal(r.nodes.length,0);assert.equal(audio.snapshot().prepared,1);
 const bad=createStudentStrikeAudio({getAudio:()=>r,renderSpeech:async()=>{throw Error('offline');}});await bad.prepare([cue]);assert.equal(bad.snapshot().ready,true);assert.equal(bad.snapshot().errors.length,1);
});
test('scene time selects one voice, pause disconnects it and resume seeks without replaying the line',async()=>{
 const r=rig(),audio=createStudentStrikeAudio({getAudio:()=>r,renderSpeech:speech});await audio.prepare([cue]);
 audio.update({time:.5});assert.equal(r.starts.length,0);
 audio.update({time:1.2});audio.update({time:1.3});assert.equal(r.starts.length,1);assert.equal(audio.snapshot().voices,1);
 audio.pause();assert.equal(audio.snapshot().nodes,0);assert.ok(r.nodes.every(n=>n.disconnected));
 audio.update({time:2});assert.equal(r.starts.length,2);assert.ok(r.starts[1][1]>.9);
 audio.update({time:4.1});assert.equal(audio.snapshot().nodes,0);audio.dispose();assert.equal(audio.snapshot().disposed,true);
});
test('finished speech does not restart during the caption window or queue after a skipped cue',async()=>{
 const r=rig(),audio=createStudentStrikeAudio({getAudio:()=>r,renderSpeech:speech});await audio.prepare([cue]);audio.update({time:1});
 r.nodes[0].onended();audio.update({time:2});assert.equal(r.starts.length,1);assert.equal(audio.snapshot().voices,0);
 audio.update({time:12});assert.equal(r.starts.length,1);
});
test('disposal invalidates pending preparation, and inaudible/suspended hosts never open a context',async()=>{
 let done;const audio=createStudentStrikeAudio({renderSpeech:()=>new Promise(r=>{done=r;})});const p=audio.prepare([cue]);audio.dispose();done(await speech());await p;audio.update({time:1.1});assert.equal(audio.snapshot().prepared,0);assert.equal(audio.snapshot().voices,0);
});
