import test from 'node:test';
import assert from 'node:assert/strict';
import {academicInframusicFrame as frame,createAcademicInframusic} from '../src/audio/academic-inframusic.js';
const here={eligible:true,listener:{group:'academic',floor:10,x:81.5,z:4.6,yaw:0}};
function harness(){
 const sources=[],parameters=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;parameters.push(v);},setValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const node=()=>({connect(){return this;},disconnect(){this.disconnected=true;}});
 const ctx={state:'running',currentTime:0,decodeAudioData:async()=>({duration:400}),createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),frequency:param(),Q:param()}),createStereoPanner:()=>({...node(),pan:param()}),createBufferSource(){const n={...node(),start(t,at){this.at=at;},stop(){this.stopped=true;}};sources.push(n);return n;}};
 let audio={ctx,destination:node()},fetches=0;
 const music=createAcademicInframusic({getAudio:()=>audio,fetchImpl:async()=>{fetches++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
 return{ctx,music,sources,parameters,setAudio:a=>audio=a,get fetches(){return fetches;}};
}
test('second floor and all unrelated spaces are silent, actual upward stair height opens the same fixed track',()=>{
 assert.equal(frame({...here,listener:{...here.listener,group:'upper',floor:4.8}}).gain,0);
 assert.equal(frame({...here,onStair:true,listener:{...here.listener,group:'upper',floor:4.8}}).gain,0);
 const low=frame({...here,onStair:true,listener:{...here.listener,group:'upper',floor:5.2}}),high=frame({...here,onStair:true,listener:{...here.listener,group:'upper',floor:8.8}});
 assert.ok(low.gain>0&&high.gain>low.gain);assert.ok(frame(here).gain>high.gain);
 assert.equal(frame({...here,eligible:false}).gain,0);assert.equal(frame({...here,listener:{...here.listener,group:'academicRoof'}}).gain,0);
});
test('rooms, speech and danger muffle and duck without spending progression or changing track position',()=>{
 const full=frame(here),room=frame({...here,roomMuffle:1}),danger=frame({...here,danger:true}),speech=frame({...here,dialogue:true});
 assert.ok(room.gain<full.gain&&room.cutoff<full.cutoff);assert.ok(danger.gain<speech.gain&&speech.gain<full.gain);assert.ok(danger.cutoff<=900);
});
test('one cached decode and one live loop survive repeated updates without duplicate sources',async()=>{
 const h=harness();await h.music.preload();for(let i=0;i<20;i++)h.music.update(here);
 assert.equal(h.fetches,1);assert.equal(h.sources.length,1);assert.equal(h.sources[0].loop,true);assert.equal(h.music.state().active,true);
});
test('pause, native focus and hidden state stop immediately and resume the saved musical offset without wall-time catchup',async()=>{
 for(const condition of[{paused:true},{focused:false},{hidden:true},{eligible:false}]){
  const h=harness();await h.music.preload();h.music.update(here);h.ctx.currentTime=7.25;h.music.update({...here,...condition});
  assert.equal(h.music.state().voices,0);assert.equal(h.sources[0].stopped,true);h.ctx.currentTime=100;
  h.music.update(here);assert.equal(h.sources[1].at,7.25);assert.equal(h.music.state().voices,1);
 }
});
test('off/low/house is bounded and context replacement releases the old graph',async()=>{
 const h=harness();await h.music.preload();h.music.update(here);const house=h.music.state().gain;h.music.setLevel('low');assert.ok(h.music.state().gain<house);
 h.music.setLevel('off');assert.equal(h.music.state().active,false);assert.equal(h.music.state().gain,0);h.music.setLevel('house');assert.equal(h.music.state().voices,1);
 assert.equal(h.music.setLevel('toString').level,'house','inherited object names are not amplifier levels');
 const old=h.sources.at(-1);h.setAudio({ctx:h.ctx,destination:{}});h.music.update(here);assert.equal(old.stopped,true);assert.equal(h.music.state().voices,1);
 h.music.pause('native-blur');const count=h.sources.length;h.music.setLevel('house');
 assert.equal(h.sources.length,count,'repeating the saved level cannot replay stale eligible input');assert.equal(h.music.state().active,false);
 h.music.update(here);assert.equal(h.music.state().voices,1,'only fresh input can resume the paused loop');
 const before=h.sources.length;h.music.update({...here,paused:true,level:'low'});
 assert.equal(h.music.state().level,'low');assert.equal(h.sources.length,before,'restored level and paused lifecycle are atomic');
 h.music.update({...here,eligible:false,level:'house'});assert.equal(h.music.state().level,'house');assert.equal(h.sources.length,before,'a saved level cannot start music in Source');
});
test('finishing decode while hidden or disposed cannot start a voice asynchronously',async()=>{
 const h=harness();h.music.update(here);h.music.update({...here,hidden:true});await h.music.preload();assert.equal(h.sources.length,0);
 h.music.dispose();h.music.update(here);assert.equal(h.sources.length,0);assert.equal(h.music.state().disposed,true);
 let deliver,decodes=0;const late=createAcademicInframusic({getAudio:()=>({ctx:{state:'running',currentTime:0,decodeAudioData(){decodes++;}},destination:{}}),fetchImpl:()=>new Promise(resolve=>deliver=resolve)});
 const pending=late.preload();await Promise.resolve();late.dispose();deliver({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});await pending;assert.equal(decodes,0,'disposed fetch must not decode the large track');
});
test('a recreated context can recover immediately from a failed fetch on an old clock',async()=>{
 const h=harness();h.ctx.currentTime=100;let ctx=h.ctx,attempts=0;
 const m=createAcademicInframusic({getAudio:()=>({ctx,destination:{}}),fetchImpl:async()=>({ok:++attempts>1,status:503,arrayBuffer:async()=>new ArrayBuffer(4)})});
 assert.equal(await m.preload(),null);ctx={...h.ctx,currentTime:0};assert.ok(await m.preload());assert.equal(attempts,2);
});
