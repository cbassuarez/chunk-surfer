import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFireballCastPlan } from '../src/game/window-channel.js';
import { createPersonalizedWindowEffects,FIREBALL_SURFACE_LABELS } from '../src/platform/personalized-window-effects.js';

const flush=async()=>{for(let i=0;i<8;i+=1)await Promise.resolve();};

// test('arrival prewarms four fixed clickable black cast surfaces and enemy beats construct none',async()=>{
//  const webviews=new Map(),created=[],calls=[],emitted=[];
//  class FakeWebviewWindow{
//    static async getByLabel(label){return webviews.get(label)||null;}
//    constructor(label,options){this.label=label;this.options=options;created.push([label,options]);webviews.set(label,this);}
//    once(_event,cb){cb();}async show(){}async hide(){}async close(){webviews.delete(this.label);}
//  }
//  const api={WebviewWindow:FakeWebviewWindow,invoke:async(command,payload)=>{calls.push([command,payload]);return true;},emitTo:async(label,event,payload)=>emitted.push({label,event,payload})};
//  const effects=createPersonalizedWindowEffects({runtimeApi:api,tokenFactory:()=> 'fireball-session-test',documentApi:null});
//  const token=effects.begin({intensity:'hostile'});await effects.prepareFireballs();
//  assert.deepEqual(created.map(([label])=>label),FIREBALL_SURFACE_LABELS);
//  for(const [,options] of created){assert.equal(options.resizable,false);assert.equal(options.decorations,false);assert.equal(options.focusable,true);assert.equal(options.skipTaskbar,true);assert.equal(options.visible,false);}
//  const cast=compileFireballCastPlan({battleId:'chapel',movementId:'source',movementIndex:4,intentId:'chapel:source',intentKind:'broadcast'});
//  const before=created.length;assert.equal(effects.beginFireballCast(cast,{token}),true);await flush();
//  assert.equal(created.length,before,'enemy beat never constructs a surface');
//  effects.syncFireballCast(cast,cast.rays.map((ray,index)=>({index,rayId:ray.id,state:'outbound',progress:.5})),{token});await flush();
//  const steps=calls.filter(([command])=>command==='chunk_fireball_cast_step');
//  assert.equal(steps.length,1);assert.equal(steps[0][1].casts.length,4);
//  assert.equal(calls.some(([command])=>/choreography_execute|set_focus/i.test(command)),false);
//  assert.equal(emitted.filter(({event})=>event==='fireball-cast').length,4);
//  for(const {payload} of emitted){
//    assert.deepEqual(Object.keys(payload).sort(),['castId','damage','rayCount','rays','reducedMotion','state','surfaceIndex','travelSeconds'].sort());
//    assert.equal(payload.rayCount,1);assert.equal(payload.rays.length,1);
//    assert.equal(JSON.stringify(payload).includes('chapel:source'),false,'external payload carries no authored caption or intent id');
//  }
//  await effects.end(token);
// });

test('unavailable or fullscreen surfaces fall back immediately without modal UI',async()=>{
  const effects=createPersonalizedWindowEffects({runtimeApi:null,tokenFactory:()=> 'fireball-session-fallback',documentApi:null});
  const token=effects.begin({intensity:'low',fullscreen:true});
  const cast=compileFireballCastPlan({battleId:'natatorium',movementId:'room',movementIndex:0,intentId:'natatorium:meter',intentKind:'broadcast'});
  assert.equal(effects.beginFireballCast(cast,{token}),true);assert.equal(effects.statusLine(),'');
  assert.equal(await effects.emergencyRestore({notify:false}),true);
});

test('a fast first cast joins native surfaces on the first frame after asynchronous prewarm',async()=>{
  const webviews=new Map(),placed=[];let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  class Surface{static async getByLabel(label){return webviews.get(label)||null;}constructor(label){this.label=label;webviews.set(label,this);}once(_event,cb){void gate.then(cb);}async hide(){}async close(){}}
  const api={WebviewWindow:Surface,invoke:async(command,payload)=>{
    if(command==='chunk_fireball_cast_step')placed.push(...payload.casts);return true;
  },emitTo:async()=>{}};
  const effects=createPersonalizedWindowEffects({runtimeApi:api,tokenFactory:()=> 'fireball-session-race',documentApi:null});
  const token=effects.begin({intensity:'hostile'});
  const cast=compileFireballCastPlan({battleId:'hall',movementId:'seated',movementIndex:0,intentId:'hall:regard',intentKind:'broadcast'});
  assert.equal(effects.beginFireballCast(cast,{token}),true);assert.equal(placed.length,0);
  release();await effects.prepareFireballs();await flush();
  effects.syncFireballCast(cast,cast.rays.map((ray,index)=>({index,rayId:ray.id,state:'outbound',progress:.1})),{token});await flush();
  assert.equal(placed.length,cast.rayCount,'the active cast continues outside the frame as soon as prewarm settles');
  await effects.end(token);
});

test('the developer preview dwells after presentation instead of closing in the same task',async()=>{
  const webviews=new Map(),order=[];
  class Surface{static async getByLabel(label){return webviews.get(label)||null;}constructor(label){this.label=label;webviews.set(label,this);}once(_event,cb){cb();}async hide(){order.push(`hide:${this.label}`);}async close(){order.push(`close:${this.label}`);}}
  const effects=createPersonalizedWindowEffects({runtimeApi:{WebviewWindow:Surface,invoke:async()=>true,emitTo:async()=>order.push('emit')},documentApi:null,tokenFactory:()=> 'fireball-session-preview',wait:async(ms)=>{order.push(`wait:${ms}:start`);await flush();order.push(`wait:${ms}:end`);}});
  const cast=compileFireballCastPlan({battleId:'natatorium',movementId:'room',movementIndex:0,intentId:'natatorium:meter',intentKind:'broadcast'});
  await effects.previewChannel(cast,{intensity:'hostile'});
  assert.ok(order.indexOf('emit')<order.indexOf('wait:240:end'));
  assert.ok(order.indexOf('wait:240:end')<order.findLastIndex((entry)=>entry.startsWith('hide:')));
});
