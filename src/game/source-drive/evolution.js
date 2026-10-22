// One remembered journey. Maximum travelled distance reveals the landscape;
// current position decides proximity. Neither reversing nor waiting repairs it.
// This state has no steering, damage, camera, dismount or encounter-deadline power.
import {roadSurfaceAt} from './road.js';
import {driveLoadAt} from './deterioration.js';
import {roadTreatmentAt} from './route-treatment.js';

const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*t*(10+t*(-15+6*t));};
export function ensureDriveEvolution(s){
 const old=s.journey||{};
 s.journey={schema:1,stationarySeconds:Math.max(0,finite(old.stationarySeconds)),returnMetres:Math.max(0,finite(old.returnMetres)),
  edgeSeconds:Math.max(0,finite(old.edgeSeconds)),maxBacktrackMetres:Math.max(0,finite(old.maxBacktrackMetres)),
  mode:['moving','held','returning','edge','arrival'].includes(old.mode)?old.mode:'moving'};
 return s.journey;
}
export function stepDriveEvolution(s,dt){
 if(s.paused||s.finished)return s.journey;
 const j=ensureDriveEvolution(s),seconds=Math.max(0,finite(dt)),road=roadSurfaceAt(s.x,s.z),delta=s.heading-road.heading;
 const along=finite(s.speed)*Math.cos(delta)-finite(s.lateralSpeed)*Math.sin(delta),speed=Math.hypot(finite(s.speed),finite(s.lateralSpeed));
 const onEdge=road.kind!=='asphalt',backtrack=Math.max(0,s.furthest-road.distance);
 j.stationarySeconds=speed<.16?j.stationarySeconds+seconds:0;
 j.returnMetres+=Math.max(0,-along)*seconds;
 j.edgeSeconds=onEdge?j.edgeSeconds+seconds:0;
 j.maxBacktrackMetres=Math.max(j.maxBacktrackMetres,backtrack);
 j.mode=s.arrived?'arrival':speed<.16?'held':onEdge?'edge':along<-.3&&backtrack>3?'returning':'moving';
 return j;
}
export function driveEvolutionFrame(s){
 const far=Math.max(0,finite(s.furthest)),road=roadSurfaceAt(s.x,s.z),j=s.journey||{},time=Math.max(0,finite(s.programTime));
 const reveal=smooth(220,880,far),wave=smooth(300,680,far),ribcage=smooth(570,785,far),backtrack=smooth(8,160,far-road.distance),hold=smooth(6,28,finite(j.stationarySeconds));
 // Smooth gusts, not white-noise controls. Weather follows the simulation clock,
 // so the held van still receives rain, and pause/reload retain the same sky.
 const load=driveLoadAt({timeSec:time,furthest:far,distance:road.distance}),gust=load.squall;
 const storm=load.storm,shelter=(1-smooth(548,557,road.distance))*smooth(524,532,road.distance);
 const wind=[1.15+storm*2.25+gust*2.3,-.35+load.velocity*.8];
 // Past the ribs the broad storm remains, but the violent gusts become a low
 // loaded residue. Neither stopping nor returning resets its revealed degree.
 const residue=load.aftermath*.18,treatment=roadTreatmentAt(road.distance);
 const squallEnvelope=smooth(949,1015,road.distance)*(1-smooth(1105,1174,road.distance));
 // Wind tears a brief hole in the veil rather than granting a weather-clear
 // checkpoint. The road's enormous folded continuations become recognisable
 // for a moment, then disappear again. Waiting, reversing and reload all keep
 // this same saved-clock field; the player is never timed into departure.
 const veilPhase=((time+road.distance*.017)%19+19)%19;
 const tear=smooth(10,11,veilPhase)*(1-smooth(12.5,14,veilPhase)),veil=1-.78*tear;
 const snow=clamp(squallEnvelope*(.76+.24*gust)),whiteout=clamp(squallEnvelope*(.78+.22*load.value)*veil);
 const fog=clamp(treatment.pinch*(.22+.42*gust)+squallEnvelope*(.52+.35*gust)*veil);
 wind[0]+=squallEnvelope*(3.8+2.6*gust);wind[1]-=squallEnvelope*2.2;
 const rain=clamp((.56+.25*storm+.19*gust-residue)*(1-.83*snow),.08,1);
 const weather={rain,fog,snow,whiteout,extinction:.005+.004*storm+.003*gust,wind,cloud:.78+.19*storm,gust,shelter,
  load:{value:load.value,release:load.release,squall:load.squall,water:load.water,anatomy:load.anatomy,aftermath:load.aftermath}};
 return{schema:1,stage:far<280?'ordinary':far<570?'weather-warning':far<760?'held-water':far<970?'thorax':'after-image',
  reveal,wave,ribcage,backtrack,hold,mode:j.mode||'moving',predicament:treatment.section,roadTreatment:treatment,currentDistance:road.distance,furthest:far,
  stationarySeconds:finite(j.stationarySeconds),returnMetres:finite(j.returnMetres),edgeSeconds:finite(j.edgeSeconds),load,weather,
  rules:{distanceReveals:true,reverseHeals:false,waitForcesDeparture:false,offRoadTeleport:false}};
}
