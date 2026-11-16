import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConversation} from '../src/game/conversation.js';
import {OPENING_PROLOGUE,OPENING_SPEECH_RATE} from '../src/data/opening-prologue.js';
import {VOICE_PROFILES,renderSamSamples} from '../src/audio/sam-voice.js';
import {createOpeningPrologueDirection,openingMemoryInstances,openingJourneyIntent} from '../src/game/opening-prologue-direction.js';
import {createPrologueDrive,PROLOGUE_WEATHER} from '../src/game/source-drive/prologue-drive.js';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame,serializeDriveWeather,restoreDriveWeather} from '../src/game/source-drive/weather.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
function meshBounds(path){
  const b=readFileSync(new URL('../public/'+path,import.meta.url)),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n));
  return new Map(g.meshes.map(m=>[m.name,{min:[0,1,2].map(k=>Math.min(...m.primitives.map(p=>g.accessors[p.attributes.POSITION].min[k]))),max:[0,1,2].map(k=>Math.max(...m.primitives.map(p=>g.accessors[p.attributes.POSITION].max[k])))}]));
}
const bounds=new Map([...meshBounds('assets/ellery-public-front.glb'),...meshBounds('assets/source-drive/drive.glb'),...meshBounds('assets/source-drive/cut/cut-roadside.glb'),...meshBounds('assets/source-drive/m62-land/m62-land.glb')]);
function worldBounds(p){const b=bounds.get(p.mesh);assert.ok(b,p.mesh);const v=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])v.push(point(p.matrix,[x,y,z]));return{min:[0,1,2].map(k=>Math.min(...v.map(q=>q[k]))),max:[0,1,2].map(k=>Math.max(...v.map(q=>q[k])))};}

test('actual school mesh bounds clear the swept motorway through long waits and bends',t=>{
  const memory=openingMemoryInstances().filter(p=>bounds.has(p.mesh)),schoolMin=Math.min(...memory.map(p=>worldBounds(p).min[0]));
  assert.ok(schoolMin>60,'include the 79m-deep scenic elevation, not only the public facade');
  const d=createPrologueDrive();d.start();const direction=createOpeningPrologueDirection();let roadMax=-Infinity;
  try{for(let sec=0;sec<=600;sec++){
    if(sec)for(let i=0;i<4;i++)d.update(.25);
    if(sec%10)continue;
    const f=direction.compose(d.frame(metrics),{semanticPhase:'ellery',stageId:'school',snap:true});
    for(const p of f.scene.props.filter(p=>p.sourceStructure==='opening-continuous-road'&&/asphalt|marking|verge|wall/.test(p.id)))roadMax=Math.max(roadMax,worldBounds(p).max[0]);
  }t.diagnostic(JSON.stringify({schoolMinX:schoolMin,roadMaxX:roadMax,lateralClearance:schoolMin-roadMax,simulatedSeconds:600}));assert.ok(schoolMin-roadMax>15,`whole-mesh lateral clearance ${schoolMin-roadMax}m`);}finally{d.dispose();}
});

test('the school is absent before its reveal, with distinct continuous account, record and entrance views',()=>{
  const d=createPrologueDrive();d.start();const dir=createOpeningPrologueDirection();
  try{for(const spec of[{semanticPhase:'road',stageId:'dark'},{semanticPhase:'recognition',stageId:'interval'}]){
    const f=dir.compose(d.frame(metrics),{...spec,snap:true});assert.equal(f.journey.memoryInstanceCount,0);
  }
  const poses=[];for(const stageId of['ellery','school','boy','notice','roll']){
    const f=dir.compose(d.frame(metrics),{semanticPhase:'ellery',stageId,snap:true});poses.push(f.journey.target.join(','));assert.equal(f.journey.memoryInstanceCount,openingMemoryInstances().length);assert.ok(f.journey.eye.every(Number.isFinite));
  }assert.equal(new Set(poses).size,5);
  const before=dir.view();for(let i=0;i<1000;i++)dir.compose(d.frame(metrics),{semanticPhase:'ellery',stageId:'roll',dt:.1});
  const settled=dir.view();for(let i=0;i<100;i++)dir.compose(d.frame(metrics),{semanticPhase:'ellery',stageId:'roll',dt:.1});assert.deepEqual(dir.view().eye,settled.eye,'a long wait settles instead of orbiting indefinitely');assert.notDeepEqual(before.eye,settled.eye);
  assert.equal(openingJourneyIntent({semanticPhase:'personal',stageId:'margin'}),'reminder');
  }finally{d.dispose();}
});

test('a complete fast wipe gives a short recovered interval, then physical water returns',t=>{
  const w=createDriveWeather(PROLOGUE_WEATHER),samples=[];
  // This pane cell lies on the driver's real swept sector, rather than a
  // made-up screen rectangle. Inspect several cycles after startup.
  const cell=14*48+32;
  for(let i=0;i<120*6;i++){stepDriveWeather(w,{dt:1/120,timeSec:i/120,wipers:true,speed:13});if(i>=240)samples.push(w.grid[cell]);}
  assert.ok(Math.min(...samples)<.025,'the actual blade clears the sector');
  assert.ok(Math.max(...samples)>.18,'the sector rewets before the next pass');
  assert.ok(samples.filter(x=>x<.06).length/samples.length<.45,'recovery occupies a minority of the cycle');
  assert.ok(w.grid[0]>.7,'unswept glass remains wet');
  t.diagnostic(JSON.stringify({wiperCycleSeconds:w.wiperCycleSeconds,driverCellMinimum:Math.min(...samples),driverCellMaximum:Math.max(...samples),recoveredFraction:samples.filter(x=>x<.06).length/samples.length,unsweptWetness:w.grid[0]}));
  assert.equal(driveWeatherFrame(w).paneHaze,PROLOGUE_WEATHER.paneHaze);
  const restored=restoreDriveWeather(serializeDriveWeather(w));assert.deepEqual(restored,w);
  const normal=createDriveWeather();assert.equal(normal.wiperCycleSeconds,2.62);assert.equal(normal.paneHaze,0);assert.equal(normal.wettingScale,1);
});

test('zero, one and several answers retain their actual decision semantics and commit once',()=>{
  for(const count of[0,1,3]){
    let chosen=0,done=0;const nodes={start:{lines:[],choices:Array.from({length:count},(_,i)=>({text:`Answer ${i+1}`,goto:'end'}))},end:{lines:[]}};
    const c=createConversation({nodes,onChoice:()=>chosen++,onDone:()=>done++});c.start();
    if(!count){assert.equal(done,1);continue;}
    c.update(30);assert.equal(c.view().pending.options.length,count);assert.equal(chosen,0);
    c.key({key:'Enter',repeat:true});c.key({key:'1',repeat:true});assert.equal(chosen,0);
    c.key({key:'Enter',repeat:false});c.key({key:'Enter',repeat:true});assert.equal(chosen,1);assert.equal(done,1);
  }
});

test('the five fresh opening replies wait in the ordinary single-option presenter; answer echoes do not reprompt',()=>{
  const fresh=[];
  for(const[id,n]of Object.entries(OPENING_PROLOGUE.nodes))for(let i=0;i<n.lines.length;i++){
    const l=n.lines[i];if(l.who!=='me')continue;
    if(l.openingEcho){assert.equal(l.say,false);continue;}
    fresh.push([id,i]);assert.equal(l.say,true);
  }
  assert.deepEqual(fresh,[['interval-eyes',3],['interval-wheel',3],['job',0],['job-rooms',2],['did',2]]);
  let uttered=0;const c=createConversation({nodes:{start:{lines:[OPENING_PROLOGUE.nodes.job.lines[0]]}},onLine:()=>uttered++});c.start();
  assert.equal(c.view().pending.kind,'say');assert.equal(c.view().pending.options.length,1);c.update(60);assert.equal(uttered,0);
  c.key({key:' ',repeat:true});assert.equal(uttered,0);c.key({key:'1'});assert.equal(uttered,1);c.key({key:'1',repeat:true});assert.equal(uttered,1);
  const echo=createConversation({nodes:{start:{lines:[OPENING_PROLOGUE.nodes.driving.lines[0]]}}});echo.start();assert.equal(echo.view().pending,null);
});

test('delivery acceleration is opening-local and captions use the production voice rate',async()=>{
  assert.equal(VOICE_PROFILES.other.rate,.88,'the shared bench voice is unchanged');
  for(const n of Object.values(OPENING_PROLOGUE.nodes))for(const l of[...n.lines,...(n.revisitLines||[])])if(l.who==='unknown')assert.equal(l.rate,OPENING_SPEECH_RATE);
  for(const[id,index]of[['there',0],['ellery',2],['school-told',0]]){
    const l=OPENING_PROLOGUE.nodes[id].lines[index],audio=await renderSamSamples(l.text,{speaker:'other'}),raw=audio.samples.length/audio.sampleRate;
    assert.ok(raw/(VOICE_PROFILES.other.rate*l.rate)<=raw/VOICE_PROFILES.other.rate*.81,'at least 19% less voiced time on the same samples');
  }
});
