import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOT_WEATHER_HANDOFF,
  beginBootWeatherTitleTail,
  bootWeatherOpeningEnvelope,
  freshBootWeatherState,
  stepBootWeather,
  stepBootWeatherTitleTail,
} from '../src/game/boot-weather.js';
import { createPersonalizedWindowEffects } from '../src/platform/personalized-window-effects.js';
import { createWindowChoreographyDirector } from '../src/platform/window-choreography.js';
import { titleCompositionPlan, windowMediaContentId } from '../src/platform/window-composition.js';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');

function approx(a,b,epsilon=1e-10){assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);}

// Weather handoff: emission/opacity may change; particle kinematics may not.
for(const kind of ['rain','leaves','sheets']){
  const state=freshBootWeatherState(kind,{seed:4417,enabled:true});
  stepBootWeather(state,0.05,{presence:1});
  assert.ok(state.particles.length>0,`${kind}: seeded`);
  const before=structuredClone(state);
  const envelope=bootWeatherOpeningEnvelope(state,BOOT_WEATHER_HANDOFF.clearAt+1.5,{presence:1});
  stepBootWeather(state,0.05,{targetCount:envelope.targetCount,stormActive:true});
  const beforeKinematics=new Set(before.particles.map(({vx,vy,spinRate})=>`${vx}|${vy}|${spinRate}`));
  for(const particle of state.particles){
    assert.ok(beforeKinematics.has(`${particle.vx}|${particle.vy}|${particle.spinRate}`),`${kind}: transition does not rewrite kinematics`);
  }
  const pace=state.pace,density=state.density,lastAlpha=envelope.alpha;
  state.presentationAlpha=lastAlpha;
  beginBootWeatherTitleTail(state);
  assert.equal(state.presentationAlpha,lastAlpha,`${kind}: first title alpha is continuous`);
  const countAtTitle=state.particles.length;
  const velocitySnapshot=new Set(state.particles.map(({vx,vy,spinRate})=>`${vx}|${vy}|${spinRate}`));
  stepBootWeatherTitleTail(state,0.05,{stormActive:true});
  assert.ok(state.particles.length<=countAtTitle,`${kind}: title never emits`);
  for(const particle of state.particles){
    assert.ok(velocitySnapshot.has(`${particle.vx}|${particle.vy}|${particle.spinRate}`),`${kind}: title tail preserves kinematics`);
  }
  assert.equal(state.pace,pace,`${kind}: handoff preserves pace`);
  assert.equal(state.density,density,`${kind}: handoff preserves density`);
  for(let t=0;t<BOOT_WEATHER_HANDOFF.titleTailSeconds+0.2;t+=0.05)stepBootWeatherTitleTail(state,0.05);
  assert.equal(state.presentationAlpha,0,`${kind}: title tail ends visually`);
}

// Skip case: a dense opening can hand directly to title with no alpha pop.
{
  const state=freshBootWeatherState('rain',{seed:9,enabled:true});
  stepBootWeather(state,0.05,{presence:1});
  state.presentationAlpha=1;
  beginBootWeatherTitleTail(state);
  assert.equal(state.presentationAlpha,1);
  const count=state.particles.length;
  stepBootWeatherTitleTail(state,0.05);
  assert.ok(state.presentationAlpha<1&&state.presentationAlpha>0);
  assert.ok(state.particles.length<=count);
}

// Native media handoff: same session + same physical windows, no global hide.
{
  const listeners=new Map();
  const windows=new Map();
  const calls=[];
  class FakeWindow{
    constructor(label){this.label=label;this.hideCount=0;this.closed=false;windows.set(label,this);}
    static async getByLabel(label){return windows.get(label)||null;}
    once(event,cb){if(event==='tauri://created')queueMicrotask(()=>cb({}));return Promise.resolve(()=>{});}
    async hide(){this.hideCount+=1;calls.push(['hide',this.label]);return true;}
    async show(){calls.push(['show',this.label]);return true;}
    async close(){this.closed=true;calls.push(['close',this.label]);windows.delete(this.label);return true;}
  }
  const emitEvent=(name,payload)=>{for(const cb of listeners.get(name)||[])cb({payload});};
  const api={
    WebviewWindow:FakeWindow,
    getCurrentWindow:()=>({isFocused:async()=>true}),
    listen:async(name,cb)=>{const set=listeners.get(name)||new Set();set.add(cb);listeners.set(name,set);return()=>set.delete(cb);},
    emitTo:async(label,event,payload)=>{
      calls.push(['emitTo',label,event]);
      if(event==='window-media-probe')queueMicrotask(()=>emitEvent('window-media-ready',{protocol:payload.protocol,label}));
      if(event==='window-media-score')queueMicrotask(()=>emitEvent('window-media-accepted',{
        protocol:payload.protocol,label,targetLabel:payload.targetLabel,sessionToken:payload.sessionToken,
        revision:payload.revision,cueId:payload.cueId,paneId:payload.paneId,
        contentId:windowMediaContentId(payload.score.initial),
      }));
      return true;
    },
    invoke:async(command,args)=>{
      calls.push(['invoke',command]);
      if(command==='chunk_window_media_place')return{shown:true,origin:{x:0,y:0},center:{x:100,y:100},width:240,height:160,monitor:'test'};
      if(command==='chunk_window_media_position')return{origin:{x:0,y:0},center:{x:100,y:100},width:240,height:160,monitor:'test'};
      return true;
    },
  };
  let tokenN=0;
  const effects=createPersonalizedWindowEffects({runtimeApi:api,tokenFactory:()=>`session-${++tokenN}`,wait:async()=>{}});
  const token=effects.ensure({intensity:'standard'});
  const opening=titleCompositionPlan({endingId:'opening',epochMs:1000,reducedMotion:true});
  assert.equal(await effects.showComposition(opening,{token}),true);
  const physical=opening.surfaces.map((pane)=>windows.get(`window-media-${pane.index+1}`));
  calls.length=0;
  assert.equal(await effects.quiesceComposition(),true);
  const title=titleCompositionPlan({endingId:'title',epochMs:2000,reducedMotion:true});
  assert.equal(await effects.showComposition(title,{token,mode:'handoff',handoffDurationMs:0}),true);
  assert.equal(effects.sessionToken(),token,'handoff keeps effects session');
  assert.equal(calls.filter((entry)=>entry[0]==='invoke'&&entry[1]==='chunk_window_media_hide_all').length,0,'handoff never globally hides media');
  assert.equal(calls.filter((entry)=>entry[0]==='close').length,0,'handoff never closes windows');
  assert.ok(calls.filter((entry)=>entry[0]==='emitTo'&&entry[2]==='window-media-score-hold').length>=opening.surfaces.length,'old score is held');
  title.surfaces.forEach((pane,index)=>assert.equal(windows.get(`window-media-${pane.index+1}`),physical[index],'same native window identity'));
}

// Immediate game selection during the title's quiet handoff beat cancels the
// delayed title takeover. A stale async callback may never make windows appear
// after gameplay has already started.
{
  let releaseWait=null,showCalls=0;
  const waitFn=()=>new Promise((resolve)=>{releaseWait=resolve;});
  const effects={
    sessionToken:()=> 'effects-session',
    quiesceComposition:async()=>true,
    prepareMedia:async()=>true,
    showComposition:async()=>{showCalls+=1;return true;},
    hideComposition:async()=>true,
    hidePanes:async()=>true,
  };
  const director=createWindowChoreographyDirector({
    effects,documentApi:null,waitFn,
    getCompositionContext:()=>({introduced:true,lastEndingId:'',reduceDread:false,flashMode:'full'}),
    tokenFactory:()=> 'front-end-transaction',
  });
  await director.beginOpening();
  const titleTask=director.beginTitle({handoff:true});
  // Let beginTitle reach its authored quiet beat.
  for(let i=0;i<10&&!releaseWait;i+=1)await new Promise((resolve)=>setImmediate(resolve));
  assert.ok(releaseWait,'title entered quiet handoff beat');
  await director.finishTitle({windowPolicy:'none'});
  releaseWait();
  assert.equal(await titleTask,null,'stale title takeover cancels');
  assert.equal(showCalls,0,'cancelled title never presents a composition');
}

// Integration contracts worth pinning because these have regressed before.
{
  const opening=fs.readFileSync(path.join(ROOT,'src/game/opening-credits.js'),'utf8');
  const title=fs.readFileSync(path.join(ROOT,'src/game/title.js'),'utf8');
  const main=fs.readFileSync(path.join(ROOT,'src/main.js'),'utf8');
  const weather=fs.readFileSync(path.join(ROOT,'src/game/boot-weather.js'),'utf8');
  const surface=fs.readFileSync(path.join(ROOT,'src/window-media-surface.js'),'utf8');
  assert.match(opening,/renderBootWeather\(weather/,'opening renders boot weather');
  assert.match(title,/renderBootWeather\(weather/,'title renders the weather tail');
  assert.doesNotMatch(title,/presence\s*:\s*1\s*,\s*settling/,'title cannot repopulate boot weather');
  assert.match(main,/beginOpening\?\.\(\)/,'boot establishes a front-end window lease');
  assert.match(main,/beginTitle\?\.\(\{handoff:true/,'credits transfer window authorship');
  assert.doesNotMatch(weather,/keepDrag|calmDrag|\*\s*shove|SURVIVORS/,'handoff has no transition kinematics');
  assert.match(surface,/window-media-score-hold/,'media child supports score quiesce');
  assert.match(surface,/if\(scoreSuspended\)return;/,'held score cannot advance');
}

console.log('front-end continuity specs passed');
