import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {buildSourceFalseReturnLayout} from '../src/game/source-false-return-layout.js';
import {freshSourceFalseReturn,normalizeSourceFalseReturn,stepSourceFalseReturn} from '../src/game/source-false-return.js';
import {freshThresholdGag,advanceThresholdGag,thresholdGagVisible,thresholdGagQuiet} from '../src/game/threshold-gag.js';
import {THRESHOLD_GAG as G,thresholdGagAngle,thresholdGagTiming,thresholdGagPose,thresholdGagPoint,thresholdGagPenetration} from '../src/data/threshold-gag.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const layout=buildSourceFalseReturnLayout({floorplan:FP,props:PROPS.renderInstances({inscriptions:true,batchDressing:false}),propSources:PROPS.allProps()});
const pose=(extra={})=>({...freshSourceFalseReturn({runId:'gag-test',spawn:layout.spawn}),x:G.armX+.20,z:58.75,feet:G.feet,yaw:-Math.PI/2,pitch:0,elapsed:20,thresholdGag:{...freshThresholdGag(),available:true},...extra});
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function cross(s,{look=true,fast=false,audioReady=true}={}){const events=[],before={...s};s.x=G.triggerX-(fast?.30:.05);s.yaw=look?-Math.PI/2:Math.PI/2;advanceThresholdGag(s,before,.20,events,{layout,audioReady});return events;}
function tick(s,seconds,fps=60){const events=[];for(let remain=seconds;remain>1e-8;remain-=1/fps){const dt=Math.min(1/fps,remain);s.elapsed+=dt;advanceThresholdGag(s,{...s},dt,events,{layout});}return events;}
function driver(initial){
 let state=initial;const events=[],dt=1/60;
 const input=control=>{
  const previous=state,applied={dt,renderReady:true,gagAudioReady:true,...control},result=stepSourceFalseReturn(state,applied,layout);state=result.state;events.push(...result.events);
  assert.ok(layout.supportAt(state.x,state.z,state),'every controller tick retains actual copied-floor support');near(state.feet,G.feet);
  if(!result.events.some(e=>e.type==='loop'))assert.ok(Math.hypot(state.x-previous.x,state.z-previous.z)<=3*applied.dt+1e-5,'only existing returns may relocate the body; ordinary movement never snaps');
  return state;
 };
 const walk=(x,z)=>{let steps=0;while(Math.hypot(x-state.x,z-state.z)>.01&&steps++<900){const dx=x-state.x,dz=z-state.z,d=Math.hypot(dx,dz);input({forward:Math.min(1,d/(3*dt)),look:{yaw:Math.atan2(dx,-dz)}});}assert.ok(Math.hypot(x-state.x,z-state.z)<=.01,`ordinary movement reaches ${x}, ${z}`);return state;};
 return{input,walk,events,get state(){return state;}};
}

test('the convincing first arrival stays untouched; only an existing real return loop makes the apparatus available',()=>{
 const fresh=freshSourceFalseReturn({runId:'first-return',spawn:layout.spawn}),d=driver(fresh);assert.equal(fresh.thresholdGag.available,false);
 d.walk(G.triggerX-.15,58.75);assert.equal(d.state.thresholdGag.available,false);assert.ok(!d.events.some(e=>e.type.startsWith('threshold-gag-')),'ordinary first arrival cannot play the joke');
 d.walk(75,58.75);for(let n=0;n<30&&!d.state.thresholdGag.available;n++)d.input({forward:1,look:{yaw:Math.PI/2}});
 assert.equal(d.events.filter(e=>e.type==='loop').length,1,'the existing entry return owns the unlock');near(d.state.x,layout.spawn.x);near(d.state.z,layout.spawn.z);
 assert.equal(d.state.thresholdGag.available,true);assert.equal(thresholdGagQuiet(d.state),false,'the loop has its own short quiet tail');assert.equal(d.state.thresholdGag.phase,'rest');assert.deepEqual(d.state.opened,[]);assert.deepEqual(d.state.sourceDoors,[]);
 d.input({dt:G.loopQuietSeconds+.02});assert.equal(thresholdGagQuiet(d.state),true);
});

test('eligible westbound return crosses between frames, emits one physical sequence and never rearms',()=>{
 const s=pose();assert.ok(thresholdGagVisible(s,{layout}));const events=cross(s,{fast:true});assert.equal(s.thresholdGag.phase,'running');events.push(...tick(s,2));
 assert.deepEqual(events.map(e=>e.type),['threshold-gag-release','threshold-gag-stop','threshold-gag-rattle','threshold-gag-speaker-click','threshold-gag-boo','threshold-gag-spent']);
 assert.equal(s.thresholdGag.phase,'spent');s.x=G.armX+.2;assert.deepEqual(cross(s),[]);assert.equal(thresholdGagPose(s).angle,0);
});

test('unavailable, inside, reverse, wrong owner/floor, blocked sight, offscreen and undecoded audio retain an unused encounter',()=>{
 const inside=pose({x:G.triggerX-.4});assert.deepEqual(tick(inside,2),[]);const reverse=pose({x:G.triggerX-.4}),out=[];reverse.x=G.armX+.2;advanceThresholdGag(reverse,{x:G.triggerX-.4,z:58.75},.1,out,{layout});assert.deepEqual(out,[]);
 for(const extra of[{kind:'source-continuation'},{feet:4.2},{thresholdGag:freshThresholdGag()},{fall:{elapsed:0}},{recovery:{elapsed:0}},{bodyTransit:{elapsed:0}},{cameraTransit:{elapsed:0}}]){const s=pose(extra);assert.deepEqual(cross(s),[]);assert.equal(s.thresholdGag.phase,'rest');}
 const away=pose();assert.deepEqual(cross(away,{look:false}),[]);away.yaw=-Math.PI/2;assert.deepEqual(tick(away,3),[]);away.x=G.armX+.2;assert.equal(cross(away).filter(e=>e.type==='threshold-gag-release').length,1,'a later visible approach remains available');
 assert.equal(thresholdGagVisible(pose(),{layout:{...layout,supportAt:()=>null}}),false,'the copied wall/headroom query owns the sightline');const undecoded=pose();assert.deepEqual(cross(undecoded,{audioReady:false}),[]);assert.equal(undecoded.thresholdGag.phase,'rest');
});

test('the prop has no threat, punishment, door-count or progression authority and yields to real transitions',()=>{
 const s=pose(),sentinel={hush:{mode:'follow',elapsed:12},closure:{mode:'closing',elapsed:8},injuries:2,opened:s.opened,sourceDoors:s.sourceDoors};Object.assign(s,structuredClone(sentinel));const before=JSON.stringify(sentinel);cross(s);tick(s,2);assert.equal(JSON.stringify(Object.fromEntries(Object.keys(sentinel).map(k=>[k,s[k]]))),before);
 for(const type of['hush-warning','closure-warning','complete','loop','capture']){const a=pose();cross(a);const events=[{type}];advanceThresholdGag(a,{...a},.1,events,{layout});assert.ok(events.some(e=>e.type==='threshold-gag-cancel'));assert.ok(!tick(a,2).some(e=>e.type==='threshold-gag-boo'));assert.equal(a.thresholdGag.phase,'spent');assert.equal(thresholdGagPose(a).angle,0);}
 for(const extra of[{opened:['a','b','c','d','e']},{sourceDoors:['practice-east-2']}]){const a=pose(extra);assert.equal(thresholdGagQuiet(a),false);assert.deepEqual(cross(a),[]);const running=pose();cross(running);Object.assign(running,extra);const events=[];advanceThresholdGag(running,{...running},.1,events,{layout});assert.ok(events.some(e=>e.type==='threshold-gag-cancel'));}
});

test('save/reload preserves the real return and mid-motion edges; pause freezes and a new run resets',()=>{
 const s=pose();cross(s);const a=normalizeSourceFalseReturn(JSON.parse(JSON.stringify(s)));assert.deepEqual(a.thresholdGag,s.thresholdGag);const before=a.thresholdGag.elapsed,result=stepSourceFalseReturn(a,{paused:true,dt:9},layout);assert.equal(result.state.thresholdGag.elapsed,before);
 const resumed=JSON.parse(JSON.stringify(a)),events=tick(resumed,2);assert.ok(!events.some(e=>e.type==='threshold-gag-release'));assert.equal(events.filter(e=>e.type==='threshold-gag-boo').length,1);
 const spent=normalizeSourceFalseReturn(resumed);assert.equal(thresholdGagPose(spent).angle,0);assert.equal(stepSourceFalseReturn(spent,{dt:.1},layout).events.some(e=>e.type.startsWith('threshold-gag-')),false);assert.deepEqual(normalizeSourceFalseReturn(spent,{runId:'new-run'}).thresholdGag,freshThresholdGag());
 const legacy={...s};delete legacy.thresholdGag;assert.deepEqual(normalizeSourceFalseReturn(legacy).thresholdGag,freshThresholdGag(),'an old save does not invent an earlier return');
});

test('stop, physical rebound and late word remain aligned at 20, 30, 60 and 144 FPS including reduced motion',()=>{
 for(const reduced of[false,true])for(const fps of[20,30,60,144]){const s=pose(),events=[],before={...s};s.x=G.triggerX-.05;advanceThresholdGag(s,before,1/fps,events,{layout,reduced});events.push(...tick(s,2,fps));const times=thresholdGagTiming(reduced),stop=events.find(e=>e.type==='threshold-gag-stop'),boo=events.find(e=>e.type==='threshold-gag-boo');assert.equal(stop.at,times.contact);assert.equal(thresholdGagAngle(stop.at,{fired:true,reduced}),0);assert.ok(boo.at-stop.at>=.40);for(let t=0;t<times.finish;t+=.003)assert.ok(thresholdGagAngle(t,{fired:true,reduced})>=0,'the arm never penetrates its stop');assert.ok(thresholdGagAngle(times.contact+.06,{fired:true,reduced})>0,'a small real rebound exists');}
});

test('the actual returned Ellery controller permits the ordinary approach, walk past and supported reverse inspection',()=>{
 const d=driver(freshSourceFalseReturn({runId:'real-ellery-inspection',spawn:layout.spawn}));for(let n=0;n<30&&!d.state.thresholdGag.available;n++)d.input({forward:1,look:{yaw:Math.PI/2}});assert.equal(d.state.thresholdGag.available,true);d.input({dt:G.loopQuietSeconds+.02});
 for(const[x,z]of[[71.2,58.75],[67.5,58.75],[67.4,57.7],[67.4,56.8]]){d.walk(x,z);assert.equal(d.state.status,'active');assert.ok(layout.supportAt(d.state.x,d.state.z,d.state));near(d.state.feet,G.feet);}
 const s=d.state;assert.equal(s.thresholdGag.phase,'spent');for(const kind of['release','stop','boo','spent'])assert.equal(d.events.filter(e=>e.type===`threshold-gag-${kind}`).length,1,`${kind} occurs once through production movement`);assert.equal(d.events.filter(e=>e.type==='loop').length,1);assert.ok(!d.events.some(e=>['complete','capture','drop','fold'].includes(e.type)));assert.deepEqual(s.opened,[]);assert.deepEqual(s.sourceDoors,[]);
 const speaker=thresholdGagPose(s).speaker,normal=[-Math.sin(G.mount.yaw),Math.cos(G.mount.yaw)];assert.ok((s.x-speaker.x)*normal[0]+(s.z-speaker.z)*normal[1]<0,'the reached position faces the speaker and plain reverse');
});

test('the ordinary room lane clears the whole swing while the real deployed sheet blocks a walking body',()=>{
 const s=pose();s.thresholdGag={...s.thresholdGag,phase:'running'};for(let t=0;t<1.2;t+=.01){s.thresholdGag.elapsed=t;for(let x=65;x<75;x+=.2){assert.ok(layout.canOccupy(x,58.75,s));assert.equal(thresholdGagPenetration(x,58.75,s,G.bodyRadius,G.bodyHeight),0,`${t}: ${x} ordinary lane`);}}
 const rear=thresholdGagPoint([-.68,0,-.6]),front=thresholdGagPoint([-.68,0,.6]),d=driver(pose({x:rear.x,z:rear.z,thresholdGag:{...freshThresholdGag(),available:true,phase:'spent',elapsed:thresholdGagTiming(false).finish}})),yaw=Math.atan2(front.x-rear.x,-(front.z-rear.z));for(let n=0;n<60;n++)d.input({forward:1,look:{yaw}});
 const normal=[-Math.sin(G.mount.yaw),Math.cos(G.mount.yaw)],at=d.state;assert.ok((at.x-G.mount.x)*normal[0]+(at.z-G.mount.z)*normal[1]<0,'normal collision prevents crossing from the bare reverse through the sheet');near(at.feet,G.feet);assert.ok(Math.hypot(at.x-rear.x,at.z-rear.z)<.5,'collision stops movement without a camera or position reset');const hidden=pose({thresholdGag:freshThresholdGag()}),board=thresholdGagPoint([-.68,0,.075]);assert.equal(thresholdGagPenetration(board.x,board.z,hidden,G.bodyRadius,G.bodyHeight),0,'first-arrival space has no invisible apparatus collider');
});
