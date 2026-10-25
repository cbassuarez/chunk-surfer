// Read-only mechanics study. Production modules are never written or patched.
// The two candidate modules exist only as in-memory data URLs. They are a
// feasibility comparison, not a shipping model or a perception test.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSourceHushFollow } from '../../src/game/source-hush-follow.js';
import { createSourceSpaceRuntime } from '../../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as P } from '../../src/game/chunk-surf-god.js';
import { SOURCE_PRE_TAPE } from '../../src/data/source-level.js';
import { CELL, PLAN_SCALE } from '../../src/data/floorplan/legend.js';
import { MOVE_MS } from '../../src/config.js';

const out = process.env.BATTLE_STUDY_PURSUIT_OUT || 'artifacts/battle-experience-study/source-threat';
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../../src/game/source-hush-follow.js', import.meta.url), 'utf8');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, `candidate splice must match exactly once: ${before.slice(0, 60)}`);
  return text.replace(before, after);
}
async function candidate({ matchPace = false } = {}) {
  let text = replaceOnce(source, 'let speed = 0, clock = 0, phase = random() * 6.283;',
    'let speed = 0, clock = 0, phase = random() * 6.283; let studyPace = 0;');
  text = replaceOnce(text, '    const d = distanceTo(player);\n    // Only', `    const d = distanceTo(player);
    const measured = lastPlayer && seconds > 0 ? Math.hypot(player.x-lastPlayer.x, player.z-lastPlayer.z)/seconds : 0;
    studyPace += (measured-studyPace)*(1-Math.exp(-seconds/.6));
    const studyGain = (clock >= 10 && clock < 15) || (clock >= 25 && clock < 30);
    if (studyGain && !busy && state.gap > 8) state.gap = Math.max(8, state.gap-.6*seconds);
    // Only`);
  if (matchPace) text = replaceOnce(text,
    'const wanted = clamp((F.pace.base + F.pace.behindGain * (behind - F.slack)) * drift, F.pace.min, F.pace.max);',
    'const wanted = clamp((Math.max(F.pace.base,studyPace) + F.pace.behindGain * (behind - F.slack)) * drift, F.pace.min, Math.max(F.pace.max,studyPace+1.25));');
  return (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)).createSourceHushFollow;
}
const variants = { current: createSourceHushFollow, 'gap-only': await candidate(), 'pace-and-gap': await candidate({ matchPace: true }) };
const speeds = { 'reception-reference': 2.1, 'existing-test-reference': 4.8,
  'nominal-cardinal': CELL*1000/MOVE_MS, 'nominal-diagonal': Math.SQRT2*CELL*1000/MOVE_MS };
const dt = 1/60, seconds = 45;
const scenarios = ['walk', 'wait-at-10', 'camera-turn-at-10', 'wrong-door-neighbor', 'retreat-toward-follower', 'pause-at-10'];
const traces = [], summaries = [];
const quantile = (values, q) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(q*(values.length-1)))];
for (const [variant, make] of Object.entries(variants)) for (const [pace, speed] of Object.entries(speeds)) for (const scenario of scenarios) {
  const runs = [];
  for (let seed = 1; seed <= 32; seed++) {
    const f = make(null, { seed, lineClear: () => true });
    let p = { x: 0, z: -20, floor: 15.2 };
    f.begin({ x: 0, z: 0, floor: 15.2, player: p });
    let min = Infinity, contact = null, at10 = null, at20 = null, at30 = null, acceptedDistance = 0;
    const trace = [];
    for (let i=0; i<seconds/dt; i++) {
      const t=(i+1)*dt, before={...p};
      const paused = scenario==='pause-at-10' && t>=10 && t<18;
      if (!paused) {
        if (scenario==='wait-at-10' && t>=10) {}
        else if (scenario==='wrong-door-neighbor' && t>=10 && t<10+10.4/speed) p.x += speed*dt;
        else if (scenario==='wrong-door-neighbor' && t>=10+10.4/speed && t<13+10.4/speed) {}
        else if (scenario==='wrong-door-neighbor' && t>=13+10.4/speed && t<13+20.8/speed) p.x -= speed*dt;
        else if (scenario==='retreat-toward-follower' && t>=10 && t<16) {
          const h=f.frame(p), dx=h.x-p.x, dz=h.z-p.z, d=Math.hypot(dx,dz);
          if (d>2.6) { const step=Math.min(d-2.6,speed*dt);p.x+=dx/d*step;p.z+=dz/d*step; }
        } else p.z -= speed*dt;
        acceptedDistance += Math.hypot(p.x-before.x,p.z-before.z);
        f.record(p); f.tick(dt,{player:p,proper:true,busy:false});
      }
      const h=f.frame(p);
      min=Math.min(min,h.distance);if(h.withinContact&&contact===null)contact=t;
      if(Math.abs(t-10)<dt/2)at10=h.distance;
      if(Math.abs(t-20)<dt/2)at20=h.distance;
      if(Math.abs(t-30)<dt/2)at30=h.distance;
      if(seed===1&&i%6===0)trace.push({t,player:{...p},follower:{x:h.x,z:h.z},distance:h.distance,gap:h.gap,intent:h.intent,speed:h.speed,paused});
    }
    const end=f.frame(p);
    runs.push({seed,min,contact,at10,at20,at30,end:end.distance,gap:end.gap,acceptedDistance});
    if(seed===1)traces.push({variant,pace,scenario,trace});
  }
  summaries.push({variant,pace,speed,scenario,seeds:runs.length,
    minDistance:[quantile(runs.map(r=>r.min),0),quantile(runs.map(r=>r.min),1)],
    distance10:quantile(runs.map(r=>r.at10),.5),distance20:quantile(runs.map(r=>r.at20),.5),distance30:quantile(runs.map(r=>r.at30),.5),
    medianEndDistance:quantile(runs.map(r=>r.end),.5),endRange:[quantile(runs.map(r=>r.end),0),quantile(runs.map(r=>r.end),1)],
    contacts:runs.filter(r=>r.contact!==null).length,firstContact:Math.min(...runs.filter(r=>r.contact!==null).map(r=>r.contact)),
    medianGap:quantile(runs.map(r=>r.gap),.5)});
}
// Physical route samples use fresh runtimes and actual accepted 0.25m steps.
// These are legal polylines, not a shortest-path or live traversal claim.
const routeDefinitions = {
  'final-east-bank-cardinal': [{x:37.5,z:-527},{x:37.5,z:-537.5},{x:0,z:-537.5},{x:0,z:-539.5}],
  'final-east-bank-oblique': [{x:37.5,z:-527},{x:20,z:-536.5},{x:0,z:-537.5},{x:0,z:-539.5}],
};
const routes=[];
for (const [id,points] of Object.entries(routeDefinitions)) {
  const built=buildChunkSurfGodPreset(P.FINAL,{seed:4417});
  const r=createSourceSpaceRuntime({initialState:built.state}),origin=r.state().landscapeOrigin;
  const runtime=p=>({x:origin.x+p.x/CELL,y:origin.y+p.z/CELL,facing:0});
  r.setPlayerPosition(runtime(points[0]));
  let metres=0,steps=0,failures=[];
  for(let j=1;j<points.length;j++){
    const a=points[j-1],b=points[j],d=Math.hypot(b.x-a.x,b.z-a.z);metres+=d;
    const n=Math.ceil(d/.25);
    for(let i=1;i<=n;i++){
      const at=q=>runtime({x:a.x+(b.x-a.x)*q,z:a.z+(b.z-a.z)*q});
      const from=at((i-1)/n),to=at(i/n),move=r.geometry.canStep(from.x,from.y,to.x,to.y);
      if(!move.ok){failures.push({from,to,move});break;}
      r.onStep(from,to);r.setPlayerPosition(to);r.tick(dt,{px:to.x,py:to.y,facing:0});steps++;
    }
  }
  routes.push({id,points,metres,acceptedSteps:steps,failures,
    nominalSecondsAtConstantCardinalSpeed:metres/speeds['nominal-cardinal'],
    approach:r.edgeDoorApproach(),threshold:r.edgeDoorFrame()?.threshold,origin});
}
assert.equal(routes.flatMap(r=>r.failures).length,0);
// Turning the camera has no input into the current pure follower.
for(const pace of Object.keys(speeds)){
  const a=summaries.find(r=>r.variant==='current'&&r.pace===pace&&r.scenario==='walk');
  const b=summaries.find(r=>r.variant==='current'&&r.pace===pace&&r.scenario==='camera-turn-at-10');
  assert.equal(a.medianEndDistance,b.medianEndDistance);
}
const payload={kind:'source-threat-mechanics-study',generatedAt:new Date().toISOString(),
  sourceHash:createHash('sha256').update(source).digest('hex'),dt,seconds,seeds:32,CELL,PLAN_SCALE,MOVE_MS,speeds,
  scope:'Pure flat-ground simulations plus fresh runtime collision checks. No native perception, frame rate, sound, animation, or player study has been validated.',
  candidate:'Study-only. Two 5s windows lower gap by .6m/s (6m total), floor8m. pace-and-gap also matches filtered player speed with max1.25m/s catch-up allowance; same acceleration, pauses, trail, contact and explicit commitment. No position assignment or production writes.',
  SOURCE_PRE_TAPE,routes,summaries,traces};
await writeFile(`${out}/pursuit-model.json`,JSON.stringify(payload,null,2));
await writeFile(`${out}/pursuit-summary.csv`,[
  'variant,pace,scenario,min_m,max_min_m,median_end_m,contacts_of_32,gap_m',
  ...summaries.map(r=>[r.variant,r.pace,r.scenario,...r.minDistance,r.medianEndDistance,r.contacts,r.medianGap].join(',')),
].join('\n')+'\n');
console.log(JSON.stringify({out,variants:Object.keys(variants),scenarios:scenarios.length,runs:summaries.length*32,routes,
  key:summaries.filter(r=>r.pace==='nominal-cardinal'&&['walk','wait-at-10','wrong-door-neighbor'].includes(r.scenario))},null,2));
