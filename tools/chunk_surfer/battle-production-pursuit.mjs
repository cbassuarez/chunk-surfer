import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSourceHushFollow} from '../../src/game/source-hush-follow.js';
import {createSourceSpaceRuntime} from '../../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET as P} from '../../src/game/chunk-surf-god.js';

const before=execFileSync('git',['show','HEAD:src/game/source-hush-follow.js'],{encoding:'utf8'});
const baseline=(await import(`data:text/javascript;base64,${Buffer.from(before).toString('base64')}`)).createSourceHushFollow;
const out='artifacts/battle-experience-study/production';await mkdir(out,{recursive:true});
const rows=[];
const dt=1/60;
for(const [variant,make] of Object.entries({before:baseline,production:createSourceHushFollow}))
for(const pace of [2.1,4.8,.5/.045,Math.SQRT2*.5/.045])
for(const scenario of ['walk','onward','wrong-door-and-wait','pause'])
for(let seed=1;seed<=32;seed++){
  const f=make(null,{seed,lineClear:()=>true}),p={x:0,z:-20,floor:15.2};
  f.begin({x:0,z:0,floor:15.2,player:p});if(scenario!=='walk')f.beginOnward?.(80);
  let sum=0,n=0,min=Infinity,contacts=0,maxRootStep=0;
  for(let i=0;i<45/dt;i++){
    const t=(i+1)*dt,paused=scenario==='pause'&&t>=10&&t<18;
    if(!paused){
      if(scenario==='wrong-door-and-wait'&&t>=10&&t<10+10.4/pace)p.x+=pace*dt;
      else if(scenario==='wrong-door-and-wait'&&t>=10+10.4/pace){}
      else p.z-=pace*dt;
      f.record(p);const old=f.frame(p);f.tick(dt,{player:p,proper:true,exitDistance:80-(-p.z-20)});
      const next=f.frame(p);maxRootStep=Math.max(maxRootStep,Math.hypot(next.x-old.x,next.z-old.z));
    }
    const frame=f.frame(p);min=Math.min(min,frame.distance);if(frame.withinContact)contacts++;
    if(t>=30){sum+=frame.distance;n++;}
  }
  rows.push({variant,pace,scenario,seed,endDistance:f.frame(p).distance,settledMean:sum/n,
    gap:f.frame(p).gap,minDistance:min,contacts,maxRootStep});
}
for(const r of rows.filter(r=>r.variant==='production')){
  assert.equal(r.contacts,0);assert.ok(r.maxRootStep<.37);
  if(r.scenario==='walk')assert.ok(r.settledMean<32);
  if(r.scenario==='wrong-door-and-wait')assert.ok(r.minDistance>=8-1e-8);
}
// The actual upper-bank approach, with accepted quarter-metre body steps.
const built=buildChunkSurfGodPreset(P.FINAL,{seed:4417});
const entryTrail=Array.from({length:41},(_,i)=>({x:37.5,z:-507-i*.5,floor:15.2}));
const runtime=createSourceSpaceRuntime({initialState:{...built.state,sourceHushFollow:{
  active:true,x:37.5,z:-507,floor:15.2,gap:20,trail:entryTrail,
}}}),o=runtime.state().landscapeOrigin;
const points=[{x:37.5,z:-527},{x:37.5,z:-537.5},{x:0,z:-537.5},{x:0,z:-539.5}];
const toRuntime=p=>({x:o.x+p.x/.5,y:o.y+p.z/.5,facing:0});
let pos=toRuntime(points[0]),metres=0,steps=0,closest=Infinity;runtime.setPlayerPosition(pos);
const declared=runtime.beginEdgeDoorApproach();assert.equal(declared.handled,true);
assert.deepEqual({x:declared.position.x,y:declared.position.y},{x:pos.x,y:pos.y});
for(let j=1;j<points.length;j++){
  const a=points[j-1],b=points[j],length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(length/.25);metres+=length;
  for(let k=1;k<=n;k++){
    const next=toRuntime({x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n});
    assert.equal(runtime.geometry.canStep(pos.x,pos.y,next.x,next.y).ok,true,JSON.stringify({pos,next}));
    runtime.onStep(pos,next);runtime.setPlayerPosition(next);runtime.tick(length/n/4.8,{px:next.x,py:next.y,facing:0});
    const following=runtime.hushFollowFrame();closest=Math.min(closest,following.distanceMetres);
    assert.equal(runtime.hushMode().contactAvailable,false,'the accepted exit route forced a meeting');
    pos=next;steps++;
  }
}
const summary=[];
for(const variant of ['before','production'])for(const pace of [2.1,4.8,.5/.045,Math.SQRT2*.5/.045])for(const scenario of ['walk','onward','wrong-door-and-wait','pause']){
  const set=rows.filter(r=>r.variant===variant&&r.pace===pace&&r.scenario===scenario),values=set.map(r=>r.endDistance).sort((a,b)=>a-b);
  summary.push({variant,pace,scenario,seeds:set.length,medianEnd:values[16],range:[values[0],values.at(-1)],
    maxSettledMean:Math.max(...set.map(r=>r.settledMean)),contacts:set.reduce((n,r)=>n+r.contacts,0)});
}
const files=['src/game/source-hush-follow.js','src/game/source-space-runtime.js','src/main.js','src/audio/roomtone.js'];
const hashes=Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const report={kind:'production-source-approach-mechanics',generatedAt:new Date().toISOString(),
  qualification:'Pure flat-ground follower comparisons and actual-runtime accepted route. No native movement, audiovisual fear, uninterrupted arrival or human result claimed.',
  beforeHash:createHash('sha256').update(before).digest('hex'),hashes,dt,seconds:45,rows,summary,
  acceptedRoute:{points,metres,steps,finalPose:pos,threshold:runtime.edgeDoorFrame()?.threshold,
    choicePreservedPose:true,doorOpen:runtime.state().edgeDoorOpen,colliding:runtime.hushMode().colliding,
    closestFollower:closest,following:runtime.hushFollowFrame()}};
await writeFile(`${out}/source-approach-results.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({rows:rows.length,acceptedRoute:report.acceptedRoute,
  cardinal:summary.filter(r=>r.pace===.5/.045)},null,2));
