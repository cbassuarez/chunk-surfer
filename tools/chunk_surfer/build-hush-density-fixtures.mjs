import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as PRES from '../../src/game/presence.js';

// Isolated, deterministic controller evidence; never a level or player run.
const out=new URL('../../artifacts/hush-density-study/',import.meta.url);
mkdirSync(out,{recursive:true});
const dt=1/50,fixtures=[];
const hash=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const sources=Object.fromEntries(['../../src/game/presence.js','../../src/game/pressure-gait.js','../../src/game/hush-audition.js'].map(p=>[p.replace('../../',''),hash(p)]));
let now=100000,seed=4417;
const previousPerformance=globalThis.performance,previousRandom=Math.random;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
try{
 for(const blocked of [false,true]){
  seed=4417;now=100000;
  PRES.loadPresenceState({awareness:0,caughtCount:0});
  PRES.spawnAtCell(-.5,5.5,{sector:'density-study-floor',gaitSeed:4417});
  const frames=[],events=[];
  const offer=(x,y,reason)=>{PRES.offerSoundTarget({position:{x,y},confidence:1,priority:1,level:1,expiresAt:now+30000,reason});events.push({t:(now-100000)/1000,type:'declared-test-sound',x,y,reason});};
  const navigation={resolveMove(from,target,budget){
   if(blocked&&now>=103020&&now<106000)return from;
   const distance=Math.hypot(target.x-from.x,target.y-from.y),m=Math.min(distance,budget);
   return distance>1e-10?{x:from.x+(target.x-from.x)/distance*m,y:from.y+(target.y-from.y)/distance*m}:from;
  }};
  let previous={x:-.5,y:5.5};
  for(let i=0;i<=20/dt;i++){
   const t=i*dt;now=100000+t*1000;const p=PRES.presenceState();
   if(i===0){offer(-.5,-20,'DENSITY_STUDY_FIXED_SOUND');p.behaviorMode='listen';p.phaseUntil=now+2000;}
   if(i&&i%150===0&&(!blocked||i<300))offer(-.5,-20,'DENSITY_STUDY_FIXED_SOUND');
   if(blocked&&i===300)offer(20,p.y,'DENSITY_STUDY_SECOND_BEARING');
   PRES.updatePresence(i?dt:0,10,10,null,{navigation,suppressContact:true});
   const g=p.gait;
   frames.push({t,x:(p.x+.5)*.5,z:(p.y+.5)*.5-3,heading:g.heading,
    phase:g.phase,elapsed:g.elapsed,duration:g.duration,progress:g.progress??0,
    travelMetres:g.travelMetres??0,acceptedMetres:Math.hypot(p.x-previous.x,p.y-previous.y)*.5,
    mode:p.behaviorMode,blocked:!!g.blocked,redirect:!!g.redirect,
    belief:p.hasTarget?{x:p.targetX,y:p.targetY,confidence:p.targetConfidence,reason:p.targetReason}:null,
    syntheticObstruction:blocked&&t>=3.02&&t<6});
   previous={x:p.x,y:p.y};
  }
  fixtures.push({id:blocked?'obstructed':'encounter',seconds:20,frames,events,
   controller:'actual Presence + pressure-gait',qualification:'Fixed test sounds, staged initial listening and synthetic flat navigation. Observer camera is independent of the simulated player; contact is suppressed. No real-level or gameplay proof.'});
 }
}finally{PRES.despawn();Math.random=previousRandom;Object.defineProperty(globalThis,'performance',{configurable:true,value:previousPerformance});}
writeFileSync(new URL('controller-fixtures.json',out),JSON.stringify({kind:'hush-density-controller-fixtures',generatedAt:new Date().toISOString(),dt,sources,fixtures}));
console.log(fixtures.map(f=>({id:f.id,frames:f.frames.length,acceptedMetres:f.frames.reduce((a,r)=>a+r.acceptedMetres,0),phases:[...new Set(f.frames.map(r=>r.phase))]})));
