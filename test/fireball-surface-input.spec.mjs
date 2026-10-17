import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { strikeFireballSurface } from '../src/game/fireball-surface-hit.js';
import { fireballSurfacePose } from '../src/game/fireball-surface-pose.js';

function eventBus(){
  const listeners=[];
  return {
    listen:async(target,name,handler)=>{listeners.push({target,name,handler});return()=>{};},
    // Installed Tauri treats a global listener as Any, including emitTo events.
    emitTo:(target,name,payload)=>{
      for(const listener of listeners){
        if(listener.name===name&&(listener.target==='Any'||listener.target===target))listener.handler({payload});
      }
    },
  };
}

const outbound=(surfaceIndex=0)=>({castId:'cast-0123abcd',surfaceIndex,state:'outbound',rays:[{id:`ray-${surfaceIndex+1}`,direction:{x:1,y:0}}]});

async function surface({label='fireball-cast-1',bus=eventBus()}={}){
  const source=(await readFile(new URL('../src/fireball-cast.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const events=new Map(),emitted=[];
  const painted=[];let nextFrame,now=0,rafRequests=0;
  const drawing=new Proxy({}, {get:(target,name)=>target[name]??((...args)=>{painted.push({name,args,fillStyle:target.fillStyle});return name==='measureText'?{width:20}:undefined;}),set:(target,name,value)=>{target[name]=value;return true;}});
  let contextOptions;
  const canvas={getContext:(_kind,options)=>{contextOptions=options;return drawing;},getBoundingClientRect:()=>({left:0,top:0,width:240,height:240})};
  const context={strikeFireballSurface,fireballSurfacePose,structuredClone,Image:class{},document:{getElementById:()=>canvas},performance:{now:()=>now,timeOrigin:1000},
    innerWidth:240,innerHeight:240,devicePixelRatio:1,
    requestAnimationFrame:(handler)=>{nextFrame=handler;rafRequests+=1;return rafRequests;},cancelAnimationFrame:()=>{},
    addEventListener:(name,fn)=>{const handlers=events.get(name)||[];handlers.push(fn);events.set(name,handlers);},
    getCurrentWindow:()=>({label,listen:(name,handler)=>bus.listen(label,name,handler),setFocus:()=>{throw Error('surface must not move OS focus directly');}}),
    listen:(name,handler)=>bus.listen('Any',name,handler),
    emit:async(name,payload)=>emitted.push({name,payload})};
  vm.runInNewContext(source,context);
  for(let i=0;i<5;i++)await Promise.resolve();
  bus.emitTo(label,'fireball-cast',outbound(Number(label.at(-1))-1));
  const initialPose=fireballSurfacePose(outbound(Number(label.at(-1))-1));
  return{emitted,painted,contextOptions,readFrame:()=>context.readFireballSurfaceFrame(),
    setNow:value=>{now=value;},rafRequests:()=>rafRequests,
    paint:(at=16)=>{painted.length=0;nextFrame(at);return painted;},
    fire:async(name,{x=initialPose.centerX,y=initialPose.centerY}={})=>{for(const handler of events.get(name)||[])handler({clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});await Promise.resolve();}};
}

test('native presentation and focus alone never catch a projectile',async()=>{
  const harness=await surface();
  await harness.fire('focus');await harness.fire('blur');await harness.fire('focus');
  assert.equal(harness.emitted.length,0);
});

test('the first delivered pointer press catches once, including activation and repeated press',async()=>{
  const harness=await surface();
  await harness.fire('focus');await harness.fire('pointerdown');await harness.fire('pointerdown');
  assert.equal(harness.emitted.filter(({name})=>name==='fireball-cast-hit').length,1);
  assert.equal(harness.emitted.filter(({name})=>name==='fireball-cast-miss').length,1,'a repeated press still returns keyboard focus without another charge');
  assert.equal(harness.emitted[0].name,'fireball-cast-hit');
  assert.equal(harness.emitted[0].payload.surfaceIndex,0);
});

test('two native surfaces retain their own ray identities when a sibling receives a targeted cast',async()=>{
  const bus=eventBus();
  const first=await surface({label:'fireball-cast-1',bus});
  const second=await surface({label:'fireball-cast-2',bus});
  await first.fire('pointerdown');await second.fire('pointerdown');
  assert.equal(first.emitted.length,1);assert.equal(second.emitted.length,1);
  assert.equal(first.emitted[0].payload.surfaceIndex,0,'window one cannot inherit the second ray\'s routing payload');
  assert.equal(second.emitted[0].payload.surfaceIndex,1);
});

test('feedback targeted to one native surface does not resolve its untouched sibling',async()=>{
  const bus=eventBus();
  const first=await surface({label:'fireball-cast-1',bus});
  const second=await surface({label:'fireball-cast-2',bus});
  bus.emitTo('fireball-cast-1','fireball-cast',{...outbound(0),state:'deflected'});
  await first.fire('pointerdown');await second.fire('pointerdown');
  assert.equal(first.emitted[0].name,'fireball-cast-miss');
  assert.equal(second.emitted.length,1);
  assert.equal(second.emitted[0].payload.surfaceIndex,1);
});

test('a padding press emits an opaque miss, keeps the target available, and never invokes OS focus itself',async()=>{
  const harness=await surface();
  await harness.fire('pointerdown',{x:4,y:4});
  assert.equal(harness.emitted.length,1);
  assert.equal(harness.emitted[0].name,'fireball-cast-miss');
  assert.equal(harness.emitted[0].payload.castId,'cast-0123abcd');
  assert.equal(harness.emitted[0].payload.surfaceIndex,0);
  await harness.fire('focus');assert.equal(harness.emitted.length,1);
  await harness.fire('pointerdown');assert.equal(harness.emitted[1].name,'fireball-cast-hit');
});

test('rendering clears transparent padding and draws only the helper pose tile; frame telemetry follows completed paint',async()=>{
  const bus=eventBus(),harness=await surface({bus});
  const cast={...outbound(),catchReady:true,motion:{seed:500,formationProgress:1,dodge:0,pressure:1}};
  harness.painted.length=0;harness.setNow(32);
  bus.emitTo('fireball-cast-1','fireball-cast',cast);
  const calls=harness.painted,pose=fireballSurfacePose(cast);
  assert.equal(harness.contextOptions.alpha,true);
  assert.equal(calls[0].name,'clearRect');
  assert.deepEqual(calls[0].args,[0,0,240,240]);
  assert.ok(calls.some(({name,args})=>name==='translate'&&args[0]===pose.x&&args[1]===pose.y));
  assert.ok(calls.some(({name,args,fillStyle})=>name==='fillRect'&&fillStyle==='#000'&&args[2]===pose.size&&args[3]===pose.size));
  const painted=harness.readFrame();
  const previousPaint=harness.readFrame();
  assert.equal(painted.at,1032);assert.deepEqual(painted.pose,pose);
  painted.cast.state='impact';assert.equal(harness.readFrame().cast.state,'outbound','telemetry cannot mutate the live cast');
  harness.setNow(48);bus.emitTo('fireball-cast-1','fireball-cast',{...cast,state:'deflected'});
  assert.equal(previousPaint.cast.state,'outbound','a newer delivery cannot rewrite a previously returned paint copy');
  assert.equal(harness.readFrame().cast.state,'deflected');
  harness.painted.length=0;harness.setNow(64);
  bus.emitTo('fireball-cast-1','window-choreography-pane',{palette:'white'});
  const paneCalls=harness.painted;
  assert.equal(harness.readFrame(),null);
  assert.ok(paneCalls.some(({name,args,fillStyle})=>name==='fillRect'&&fillStyle==='#f7f6ef'&&args[2]===240&&args[3]===240),'pane mode keeps its full background');
});

test('native delivery paints every interaction phase while background requestAnimationFrame is frozen',async()=>{
  const bus=eventBus(),harness=await surface({bus});
  const phases=[
    {...outbound(),catchReady:false,offer:1,motion:{seed:70,formationProgress:.2,dodge:.3,pressure:1}},
    {...outbound(),catchReady:true,offer:1,motion:{seed:70,formationProgress:1,dodge:0,pressure:1}},
    {...outbound(),catchReady:false,offer:2,motion:{seed:70,formationProgress:.5,dodge:1,pressure:1,rebounding:true}},
    {...outbound(),catchReady:false,offer:2,motion:{seed:70,formationProgress:.4,dodge:.8,pressure:1}},
    {...outbound(),state:'deflected',catchReady:false,offer:2,motion:{seed:70,formationProgress:.4,dodge:.8,pressure:1}},
  ];
  assert.equal(harness.rafRequests(),1);
  for(const [index,cast] of phases.entries()){
    const at=100+index*500;harness.setNow(at);
    bus.emitTo('fireball-cast-1','fireball-cast',cast);
    const frame=harness.readFrame();
    assert.equal(frame.at,1000+at,'delivery completes a new canvas paint without executing the rAF callback');
    assert.equal(frame.cast.surfaceIndex,0);assert.equal(frame.cast.state,cast.state);
    assert.equal(frame.cast.catchReady,cast.catchReady);assert.equal(frame.cast.offer,cast.offer);
    assert.deepEqual(frame.pose,fireballSurfacePose(cast));
    assert.equal(harness.rafRequests(),1,'event paints never create another animation loop');
  }
  harness.paint(3000);assert.equal(harness.rafRequests(),2,'the one cosmetic loop schedules exactly its next frame');
  bus.emitTo('fireball-cast-1','fireball-cast',null);assert.equal(harness.readFrame(),null);
  assert.equal(harness.rafRequests(),2);
});

test('an accepted press paints local feedback immediately without waiting for a background animation frame',async()=>{
  const harness=await surface();harness.setNow(500);
  await harness.fire('pointerdown');
  const painted=harness.readFrame();
  assert.equal(painted.at,1500);assert.equal(painted.cast.state,'deflected');
  assert.equal(harness.rafRequests(),1);
  assert.equal(harness.emitted.filter(({name})=>name==='fireball-cast-hit').length,1);
});

test('a late outbound motion delivery cannot reopen an already clicked local target',async()=>{
  const bus=eventBus(),harness=await surface({bus});
  await harness.fire('pointerdown');
  bus.emitTo('fireball-cast-1','fireball-cast',{...outbound(),motion:{seed:1,formationProgress:.8,dodge:.2}});
  await harness.fire('pointerdown');
  assert.equal(harness.emitted.filter(({name})=>name==='fireball-cast-hit').length,1);
  assert.equal(harness.emitted.filter(({name})=>name==='fireball-cast-miss').length,1);
});

test('a targeted choreography pane does not replace another native surface\'s projectile',async()=>{
  const bus=eventBus();
  const first=await surface({label:'fireball-cast-1',bus});
  const second=await surface({label:'fireball-cast-2',bus});
  bus.emitTo('fireball-cast-1','window-choreography-pane',{interactive:true,cueId:'cue-1',paneId:'pane-1'});
  await first.fire('pointerdown');await second.fire('pointerdown');
  assert.equal(first.emitted[0].name,'window-choreography-pane-action');
  assert.equal(first.emitted[0].payload.paneId,'pane-1');
  assert.equal(second.emitted[0].name,'fireball-cast-hit');
  assert.equal(second.emitted[0].payload.surfaceIndex,1);
});
