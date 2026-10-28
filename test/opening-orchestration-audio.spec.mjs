import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeWorldTitleScene} from '../src/game/coldopen.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('the world title gives music a quiet tail without inventing a second physical door closure',()=>{
  const calls=[],pose={yaw:.37,pitch:-.1};let finished=0;
  const scene=makeWorldTitleScene({audio:{fadeSoundtrack:options=>calls.push(['fade',options.fade]),stopTyping:()=>{}},
    cue:id=>calls.push(['cue',id]),camera:{pose:()=>pose,turn:()=>{},restore:value=>calls.push(['restore',value])},onDone:()=>finished++});
  scene.enter();
  const view=scene.view(),total=view.lead+view.duration,fade=calls.find(row=>row[0]==='fade')?.[1];
  assert.ok(fade>0&&fade<=total-.6,'music releases before the title returns control');
  for(let elapsed=0;elapsed<total+1;elapsed+=.05)scene.update(.05);
  assert.equal(finished,1);assert.deepEqual(calls.filter(row=>row[0]==='cue'),[],
    'a card/iris is not the goods pair; only the actual closer may sound that closure');
  assert.equal(calls.filter(row=>row[0]==='restore').length,1);
  assert.equal(calls.find(row=>row[0]==='restore')[1],pose,'the player receives the original head pose');
});

test('the remembered-drive return requests a real closer and observes its later contact without a premature slam',()=>{
  const start=main.indexOf('function beginGetInDriveTeaser('),end=main.indexOf('\nfunction beginGetInArrivalTitle(',start);
  assert.ok(start>=0&&end>start);
  const host=main.slice(start,end),a=host.indexOf('onDoorsClose:'),b=host.indexOf('onReturnTick:',a);
  assert.ok(a>=0&&b>a);
  const callback=host.slice(a+'onDoorsClose:'.length,b).trim().replace(/,$/,'');
  const c=host.indexOf('onError:',b);
  assert.ok(c>b);
  const tickCallback=host.slice(b+'onReturnTick:'.length,c).trim().replace(/,$/,'');
  const phases=[],sounds=[],saved=[],receipt={doorCloseCount:0},portal={id:'dock-grey-goods'},state={accepted:false,closed:false};
  const causes=new Map();
  const context={GREY_DOOR_ID:portal.id,getInDriveTeaserReceipt:receipt,
    px:3,py:4,architectureDoorCauses:causes,
    FP:{runDoorCloserCycle:id=>{assert.equal(id,portal.id);phases.push('request');return state.accepted;},
      tickDoors:(dt,options)=>{assert.deepEqual(Array.from(options.onlyIds),[portal.id]);phases.push(`tick:${dt}`);return state.closed?[{type:'closed'}]:[];},
      saveDoorState:()=>({schema:2})},
    pumpDoorAudioEvents:dt=>{phases.push(`observe:${dt}`);if(dt>0&&state.closed)sounds.push('closed');},
    syncDoorDynamicProps:()=>{},saveCommit:value=>saved.push(value),
    STORY:{stopRain:()=>{},stopOpeningSceneBed:()=>{}},
  };
  const close=vm.runInNewContext(`(${callback})`,context);
  close();assert.equal(sounds.length,0);assert.equal(receipt.doorCloseCount,0,'a rejected physical action never becomes a slam');
  state.accepted=true;close();
  assert.equal(sounds.length,0,'accepting the closer is still not a closed leaf');
  assert.equal(causes.get(portal.id),false);assert.equal(receipt.doorCloseCount,1);
  const tick=vm.runInNewContext(`(${tickCallback})`,context);
  tick(.2);assert.equal(sounds.length,0);assert.equal(saved.length,0);
  state.closed=true;tick(.2);assert.deepEqual(sounds,['closed']);assert.equal(saved.length,1);
  assert.deepEqual(phases.slice(-3),['observe:0','tick:0.2','observe:0.2'],
    'the covered return observes actual motion before and after the selected goods-door tick');
});

let audioFixtureSerial=0;
function parameter(value=0){return{value,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}};}
async function audioFixture(run){
  const previousFetch=globalThis.fetch,previousWindow=globalThis.window,requests=new Map(),sources=[];
  globalThis.fetch=url=>{
    let resolve;const job=new Promise(done=>resolve=done);
    const request={url:String(url),resolve,job};
    if(!requests.has(String(url)))requests.set(String(url),[]);
    requests.get(String(url)).push(request);return job;
  };
  // Existing non-opening soundtrack cleanup uses window timers. The audio
  // fixture creates no real device or native/UI state.
  globalThis.window={setTimeout,clearTimeout};
  const node=()=>({connect(){},disconnect(){}}),context={state:'running',currentTime:10,sampleRate:48000,
    createGain:()=>({...node(),gain:parameter(1)}),
    createBiquadFilter:()=>({...node(),frequency:parameter(),Q:parameter()}),
    createBufferSource:()=>{const source={...node(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};sources.push(source);return source;},
    decodeAudioData:async data=>({url:data.url,duration:16,numberOfChannels:2,sampleRate:48000}),
  };
  const module=await import(`../src/audio/story-audio.js?opening-orchestration=${++audioFixtureSerial}`);
  module.storyAudioInit(context,node());
  const fixture={module,context,sources,requests,
    async load(key){const url=module.STORY_AUDIO[key],request=requests.get(url)?.at(-1);assert.ok(request,`pending ${key}`);
      request.resolve({ok:true,arrayBuffer:async()=>({url})});await module.preload(url);await Promise.resolve();},
    async reject(key){const url=module.STORY_AUDIO[key],request=requests.get(url)?.at(-1);assert.ok(request);
      request.resolve({ok:false,status:404});await module.preload(url);await Promise.resolve();},
  };
  try{return await run(fixture);}finally{
    module.stopAll();globalThis.fetch=previousFetch;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
}

test('a late opening-bed decode cannot restart the score after explicit stop or stopAll',async()=>{
  for(const stop of ['stopOpeningSceneBed','stopAll'])await audioFixture(async f=>{
    f.module.startOpeningSceneBed();f.module[stop]();await f.load('openingBed');
    assert.equal(f.sources.length,0,`${stop} cancelled the pending start`);
    assert.equal(f.module.audioState().openingBed,null);
  });
});

test('a genuine later start survives cancellation of the earlier pending request and starts exactly once',async()=>{
  await audioFixture(async f=>{
    f.module.startOpeningSceneBed({gain:.1});f.module.stopOpeningSceneBed();f.module.startOpeningSceneBed({gain:.2});
    await f.load('openingBed');assert.equal(f.sources.length,1);assert.equal(f.module.audioState().openingBed.gain,.2);
    const source=f.sources[0],origin=f.module.audioState().openingBed.downbeatAt;
    f.context.currentTime=14;f.module.startOpeningSceneBed();assert.equal(f.sources.length,1);
    assert.equal(f.sources[0],source);assert.equal(f.module.audioState().openingBed.downbeatAt,origin,'idempotent requests preserve musical phase');
  });
});

test('a title handoff while the opening bed is still loading cancels it without restarting the title',async()=>{
  await audioFixture(async f=>{
    f.module.startOpeningSceneBed();await f.load('title');
    const handoff=f.module.commitOpeningSceneBedToColdOpenTitle();assert.equal(handoff.scheduled,false);
    assert.equal(handoff.reason,'no-opening-bed');assert.equal(f.sources.length,1);
    const title=f.sources[0];await f.load('openingBed');
    assert.equal(f.sources.length,1);assert.equal(f.sources[0],title);assert.equal(f.module.audioState().openingBed,null);
    assert.equal(f.module.audioState().songTrack,'title');
  });
});

test('a ready opening bed retains its downbeat-aligned title handoff',async()=>{
  await audioFixture(async f=>{
    f.module.startOpeningSceneBed();await f.load('openingBed');await f.load('title');
    f.context.currentTime=10.5;
    const handoff=f.module.commitOpeningSceneBedToColdOpenTitle();assert.equal(handoff.scheduled,true);assert.equal(handoff.at,12);
    assert.equal(f.sources.length,2);assert.equal(f.sources[0].stops[0][0],12.012);
    assert.equal(f.sources[1].starts[0][0],12);assert.equal(f.module.audioState().openingBed,null);
  });
});

test('a failed opening-bed load does not schedule an unbounded automatic retry',async()=>{
  await audioFixture(async f=>{
    f.module.startOpeningSceneBed();await f.reject('openingBed');
    assert.equal(f.requests.get(f.module.STORY_AUDIO.openingBed).length,1);
    assert.equal(f.sources.length,0);assert.equal(f.module.audioState().openingBed,null);
  });
});
