import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {freshSourceContinuation,sourceContinuationThreatTelemetry} from '../../src/game/source-continuation.js';
import {CONTINUATION_DROP_LIPS,continuationSupportAt} from '../../src/data/source-continuation.js';

const path=resolve(process.argv[2]||'artifacts/source-continuation-depth/source-route-2026-10-24T00-13-10-935Z.json');
const recording=JSON.parse(await readFile(path,'utf8'));
const poses=recording.trace.filter(t=>t.type==='pose'&&!t.sequence);
const events=recording.trace.filter(t=>t.type==='event'&&!t.sequence);
const counts={};for(const t of events)counts[t.event.type]=(counts[t.event.type]||0)+1;
const stable=p=>p.phase==='catch'&&!p.recovery&&!p.reveal&&p.counterweight?.active&&continuationSupportAt(p.x,p.z,p);
const catches=poses.filter(stable);
const makeState=p=>({...freshSourceContinuation({runId:'recorded-counterfactual'}),...p,status:'active'});
const weightCase=catches.find(p=>p.counterweight.cycle>=1&&p.focus==='catch-return-2');
const cases=[];
if(weightCase){
  cases.push({name:'Recorded refuge after the first physical return cycle',elapsed:weightCase.elapsed,pose:{x:weightCase.x,z:weightCase.z,feet:weightCase.feet,level:weightCase.level},prediction:sourceContinuationThreatTelemetry(makeState(weightCase))});
  const lip=CONTINUATION_DROP_LIPS[weightCase.level];
  cases.push({name:'Same recorded machinery pose; stationary body moved to its exposed release lip',elapsed:weightCase.elapsed,pose:{x:lip.x,z:lip.z,feet:weightCase.feet,level:weightCase.level},prediction:sourceContinuationThreatTelemetry({...makeState(weightCase),x:lip.x,z:lip.z,grace:0})});
}
let stationarySeconds=0;
for(let i=1;i<poses.length;i++){
  const a=poses[i-1],b=poses[i],dt=b.elapsed-a.elapsed;
  if(a.phase===b.phase&&a.level===b.level&&!a.recovery&&!b.recovery&&!a.reveal&&!b.reveal&&dt>0&&dt<.4&&Math.hypot(a.x-b.x,a.z-b.z,a.feet-b.feet)<.015)stationarySeconds+=dt;
}
const recoveries=events.filter(t=>t.event.type==='capture').map(c=>{
  const recovered=events.find(t=>t.elapsed>c.elapsed&&t.event.type==='recovered'&&t.event.reason===c.event.reason);
  return{phase:c.phase,reason:c.event.reason,startedAt:c.elapsed,plannedSeconds:c.event.duration,recoveredAt:recovered?.elapsed??null,observedSimulationSeconds:recovered?recovered.elapsed-c.elapsed:null};
});
const summary={
  source:basename(path),durationSeconds:recording.durationSeconds,videoSource:recording.videoSource,audioSource:recording.audioSource,
  note:'Developer-operated recording. Wall time includes tool delays and deliberate waiting; it is not a human completion-time result. Trace times are simulation seconds, not video timestamps. Earthfall is retained adjacent content and is excluded from local counts.',
  traceEntries:recording.trace.length,inputEntries:recording.inputs.length,localPoseSamples:poses.length,
  localSimulationSeconds:poses.at(-1)?.elapsed,stationarySampledSeconds:stationarySeconds,
  events:counts,choices:events.filter(t=>t.choiceId).map(t=>({elapsed:t.elapsed,phase:t.phase,choiceId:t.choiceId,event:t.event.type})),
  recoveries,weightModes:[...new Set(poses.map(p=>p.counterweight?.mode).filter(Boolean))],maximumWeightCycle:Math.max(0,...poses.map(p=>p.counterweight?.cycle||0)),
  offlineReachability:cases,
  reachabilityLimit:'These are stationary authored-route counterfactuals, not predictions of a moving player or evidence of fear. The refuge case intentionally remains safe.',
};
await writeFile(resolve(dirname(path),'route-analysis.json'),JSON.stringify(summary,null,2)+'\n');
const csv=['elapsed,phase,x,z,feet,level,focus,weightMode,weightCycle,weightX,weightZ,weightY,distance,recovery,reveal,grace'];
for(const p of poses)csv.push([p.elapsed,p.phase,p.x,p.z,p.feet,p.level,p.focus||'',p.counterweight?.mode||'',p.counterweight?.cycle||0,p.counterweight?.x,p.counterweight?.z,p.counterweight?.y,p.threatDistanceMetres,p.recovery?.reason||'',p.reveal?'crane':'',p.grace].join(','));
await writeFile(resolve(dirname(path),'route.csv'),csv.join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
