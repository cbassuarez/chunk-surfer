import test from 'node:test';
import assert from 'node:assert/strict';
import {openingBoneCrackBuffer,createOpeningCrashAftermathAudio,OPENING_CRASH_AFTERMATH} from '../src/audio/opening-crash-aftermath.js';
import {makeOpeningCrashAftermathScene} from '../src/game/opening-crash-aftermath-scene.js';
import {arrivalTitleOptionFrame} from '../src/render/arrival-title-options.js';

function audioContext(){
  const sources=[],params=[];
  const param=()=>{const p={value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}};params.push(p);return p;};
  const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
  const context={sampleRate:22050,currentTime:0,
    createBuffer(_channels,count,rate){const data=new Float32Array(count);return{getChannelData:()=>data,duration:count/rate};},
    createGain:()=>({...node(),gain:param()}),
    createBufferSource(){const s={...node(),starts:[],stops:0,start(...args){this.starts.push(args);},stop(){this.stops++;}};sources.push(s);return s;},
    decodeAudioData:async()=>({duration:15.7}),
  };
  return{context,sources,params};
}

test('bone Foley is bounded deterministic nonmusical PCM with an attack and a dry decay',()=>{
  const{context}=audioContext(),a=openingBoneCrackBuffer(context,2).getChannelData(0),b=openingBoneCrackBuffer(context,2).getChannelData(0);
  assert.deepEqual(a,b);assert.ok(a.some(v=>Math.abs(v)>.01));assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));
  const power=data=>data.reduce((s,v)=>s+v*v,0)/data.length;
  assert.ok(power(a.slice(0,1100))>power(a.slice(-1100))*30);
});

test('aftermath uses the recorded box, pauses without spending time and never queues missed crack bursts',async()=>{
  const f=audioContext(),requests=[];
  const audio=createOpeningCrashAftermathAudio({...f,destination:{},resolve:x=>x,fetcher:async url=>{requests.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}});
  await audio.pending;assert.deepEqual(requests,[OPENING_CRASH_AFTERMATH.musicBox]);
  audio.update(.2);assert.equal(f.sources.length,1,'first dry crack');
  audio.update(.5);assert.equal(f.sources.length,2,'one continuing recorded phrase');
  const box=f.sources.at(-1);assert.equal(box.starts[0][1],.5-OPENING_CRASH_AFTERMATH.musicBoxStart);
  audio.setPaused(true);assert.equal(audio.snapshot().voices,0);assert.equal(box.stops,1);
  f.context.currentTime=30;audio.setPaused(false);assert.equal(f.sources.length,3,'resume continues box at preserved local offset');
  box.onended();assert.equal(audio.snapshot().voices,1,'old callback cannot retire the resumed phrase');
  audio.update(8);assert.equal(f.sources.length,3,'late updates discard cracks, never catch them up');
  audio.update(9.4);assert.equal(audio.snapshot().voices,0);audio.dispose();audio.dispose();assert.equal(audio.snapshot().disposed,true);
});

test('missing music box leaves honest silence around the dry Foley without a retry loop',async()=>{
  const f=audioContext();let requests=0;
  const audio=createOpeningCrashAftermathAudio({...f,destination:{},fetcher:async()=>{requests++;return{ok:false};}});
  assert.equal(await audio.pending,false);assert.match(audio.snapshot().error,/unavailable/);
  audio.update(1.05);audio.update(5);assert.equal(requests,1);audio.dispose();
});

test('scene holds opaque black before title, obeys focus/pause and completes once',()=>{
  let held=false,finished=0,exits=0,disposed=0,paused=0;const covers=[],updates=[];
  const scene=makeOpeningCrashAftermathScene({duration:.5,isHeld:()=>held,paintCover:a=>covers.push(a),onDone:()=>finished++,onExit:()=>exits++,
    createAudio:()=>({update:t=>updates.push(t),setPaused:x=>paused+=x?1:0,dispose:()=>disposed++})});
  scene.enter();scene.render();assert.equal(scene.worldPresentation,'hidden');assert.equal(covers.at(-1),1);
  scene.update(.1);held=true;scene.blur();scene.render();scene.update(3);assert.equal(scene.view().elapsed,.1);
  held=false;scene.focus();for(let i=0;i<5;i++)scene.update(.1);assert.equal(finished,1);assert.equal(scene.view().done,true);
  scene.update(5);scene.exit();scene.exit();assert.equal(finished,1);assert.equal(exits,1);assert.equal(disposed,1);assert.ok(paused>0);
});

test('all review options preserve the whole title and use bounded actual VFD layouts',()=>{
  for(const direction of['disc','index','memory'])for(const[cols,rows]of[[20,8],[32,10],[60,30],[100,40]]){
    const frame=arrivalTitleOptionFrame({direction,cols,rows,time:6});
    const title=frame.lines.filter(line=>/CHUNK|SURFER/.test(line.text)).map(line=>line.text).join(' ');
    assert.equal(title,'CHUNK SURFER');assert.ok(frame.lines.every(line=>(line.x>=0||line.clip)&&line.scale>0&&line.alpha>=0&&line.alpha<=1));
    assert.ok(frame.lines.filter(line=>/CHUNK|SURFER/.test(line.text)).every(line=>line.x+line.text.length*line.scale<=cols+.01));
    assert.ok(frame.lines.every(line=>line.y>=0&&line.y+line.scale*.8<=rows+.01),'actual eight-dot glyph heights remain in the visible field');
    const titles=frame.lines.filter(line=>/CHUNK|SURFER/.test(line.text));
    if(direction==='index')assert.ok(titles[1].y>=titles[0].y+titles[0].scale*.8+.4,'the two enlarged title rows do not collide');
  }
});
