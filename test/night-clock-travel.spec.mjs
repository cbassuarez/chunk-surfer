import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';
import {freshSourceFalseReturn,stepSourceFalseReturn} from '../src/game/source-false-return.js';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {freshSourceEarthfallElleryAside,normalizeSourceEarthfallElleryAside,stepSourceEarthfallElleryAside} from '../src/game/source-earthfall-ellery-aside.js';
import {SOURCE_PUB} from '../src/data/source-pub.js';
import {sourcePubEntry,createSourcePubScene} from '../src/game/source-pub.js';
import {createNightClockPace,freshNightClock,advanceNightClock} from '../src/game/night-clock.js';

const renderer={initialize:async()=>true,ready:()=>true,render:()=>true,renderAside:()=>true,dispose(){}};
test('Source II portal travel reports only accepted pre-fold walking, not displacement, fall or rest',()=>{
 const p=JOURNEY_PORTALS[0],fresh=freshSourceContinuation();let state=normalizeSourceContinuation({...fresh,status:'active',...p.a.approach,lastSafe:{...p.a.approach,phase:'wrong-return',level:0},recoveryAnchor:{...p.a.approach,level:0,kind:'landing',supportId:'declared-visited-pad',earnedAt:0},hush:{...fresh.hush,active:false}});
 let metres=0,jump=0;
 for(let n=0;n<800&&!state.lastFold;n++){
  const before=state,result=stepSourceContinuation(state,{dt:1/120,forward:1});state=result.state;
  assert.ok(result.acceptedTravelMetres>=0&&result.acceptedTravelMetres<.1);metres+=result.acceptedTravelMetres;
  if(state.lastFold)jump=Math.hypot(state.x-before.x,state.z-before.z,state.feet-before.feet);
 }
 assert.ok(state.lastFold);assert.ok(jump>5);assert.ok(metres>0&&metres<jump*.25,'the4.03m accepted approach excludes the26.9m fold displacement');
 const falling=stepSourceContinuation(state,{dt:1/60,forward:1});assert.equal(falling.acceptedTravelMetres,0,'ballistic carriage is not walking');
});

function falseLayout(){const spawn={x:0,z:0,feet:4.8,yaw:Math.PI/2,pitch:0};return{spawn,bounds:{minX:-60,maxX:4,minZ:-2,maxZ:2},doors:[],loops:[{id:'test-loop',bounds:{minX:.1,maxX:.2,minZ:-1,maxZ:1},arrival:{...spawn,x:-50},feet:4.8}],supportAt:()=>({floor:4.8,ceil:8}),canOccupy:()=>true};}
test('false Ellery loop excludes its reset jump; scene callbacks reject blocked held motion',async()=>{
 const layout=falseLayout(),fresh=freshSourceFalseReturn({runId:'distance',spawn:layout.spawn});
 const r=stepSourceFalseReturn(fresh,{dt:.1,forward:1},layout);assert.ok(r.events.some(e=>e.type==='loop'));assert.ok(r.state.x<-40);assert.ok(r.acceptedTravelMetres>0&&r.acceptedTravelMetres<1);
 const blocked={...layout,loops:[],canOccupy:(x)=>x<=0};const accepted=[];
 const scene=createSourceFalseReturnScene({checkpoint:fresh,layout:blocked,renderer,onAcceptedTravel:m=>accepted.push(m)});await scene.initialize();scene.key({key:'w'});scene.update(.2);assert.equal(accepted.length,0);scene.exit();
});

test('Earthfall receipts reuse supported next-versus-passive travel and ignore real sagging carry even without footstep audio',async()=>{
 const accepted=[],make=aside=>createSourceEarthfallScene({checkpoint:{...freshSourceEarthfall({runId:'night-feet'}),elleryAside:aside},renderer,onAcceptedTravel:m=>accepted.push(m)});
 const scene=make({...freshSourceEarthfallElleryAside({runId:'night-feet'}),yaw:0});await scene.initialize();
 scene.key({key:'w'});for(let i=0;i<20;i++)scene.update(1/60);scene.keyup({key:'w'});assert.ok(accepted.reduce((a,b)=>a+b,0)>.5);scene.exit();
 let aside=normalizeSourceEarthfallElleryAside({...freshSourceEarthfallElleryAside({runId:'night-feet'}),version:3,id:'source-earthfall:ellery-aside-v3',gag:undefined,chase:undefined});
 for(let i=0;i<216;i++)aside=stepSourceEarthfallElleryAside(aside,{dt:1/60}).state;
 const late=make(aside);await late.initialize();const count=accepted.length,before=late.serialize().elleryAside;
 for(let i=0;i<60;i++)late.update(1/60);
 const after=late.serialize().elleryAside;assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.01);assert.equal(accepted.length,count);late.exit();
});

test('Source pub receipt follows actual accepted motion and stops when its body is blocked',async()=>{
 const checkpoint=sourcePubEntry({flags:{[SOURCE_PUB.unlockFlag]:true},runId:'pub-clock',returnPose:{x:1,y:2,yaw:0,pitch:0,facing:0}}),accepted=[];
 const scene=createSourcePubScene({checkpoint,renderer,onAcceptedTravel:m=>accepted.push(m)});await scene.initialize();scene.key({key:'w'});
 for(let i=0;i<600;i++)scene.update(1/60);assert.ok(accepted.reduce((a,b)=>a+b,0)>.5);
 const blocked=accepted.reduce((a,b)=>a+b,0);for(let i=0;i<120;i++)scene.update(1/60);
 assert.equal(accepted.reduce((a,b)=>a+b,0),blocked,'a still-held forward key at the real room boundary adds no travel');scene.keyup({key:'w'});
 const before=accepted.reduce((a,b)=>a+b,0);scene.pause();scene.update(10);assert.equal(accepted.reduce((a,b)=>a+b,0),before);scene.exit();
});

test('variable pace integrates smoothly at different frame cadences and hard overrides return to1×',()=>{
 const run=dt=>{const pace=createNightClockPace();let clock=freshNightClock();for(let t=0;t<3-1e-8;t+=dt){const p=pace.update({runId:'rate',foregroundSeconds:dt,active:true,currentRate:clock.rate,acceptedTravelMetres:.01});clock={...advanceNightClock(clock,dt,{rate:p.averageRate}),rate:p.rate};}return clock;};
 const a=run(1/30),b=run(1/120);assert.ok(Math.abs(a.elapsedSeconds-b.elapsedSeconds)<1e-8);assert.ok(a.rate>2.99);
 const pace=createNightClockPace(),slow=pace.update({runId:'rate',foregroundSeconds:1,active:true,currentRate:3,acceptedTravelMetres:1,slow:true});assert.equal(slow.rate,1);assert.equal(slow.averageRate,1);
});
