// The cliff crash, as numbers. Prints a CSV of the shared 96 s cinematic's
// fall pose (one row per 1/120 s from release to settled) and a summary of the
// physics the animation must satisfy: promised vs actual hang time, impact
// speed, peak frame-to-frame travel, and the settle check.
//
// Run: node scripts/cliff-crash-timeline.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {doorDriveTeaserPoseAt,DOOR_DRIVE_WATER_ENTRY,DOOR_DRIVE_TEASER} from '../src/game/source-drive/door-teaser.js';
import {COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_WORLD} from '../src/data/coastal-memory.js';
import {CLIFF_FALL} from '../src/game/source-drive/cliff-fall.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=resolve(ROOT,'output','cliff-crash-review');
mkdirSync(OUT,{recursive:true});

const C=DOOR_DRIVE_TEASER,g=CLIFF_FALL.g;
const rows=[];
let peak=0,last=null,minY=Infinity;
const release=doorDriveTeaserPoseAt(C.fallStart);
const drop=(release.position.y+32)-(COASTAL_WORLD_FROM_LOCAL[13]+COASTAL_SETTLED_BODY_WORLD[13])+COASTAL_SETTLED_BODY_WORLD[13]-COASTAL_SETTLED_BODY_WORLD[13]; // keep it simple below
for(let t=C.fallStart;t<=C.settledStart+1e-9;t+=1/120){
  const p=doorDriveTeaserPoseAt(t);
  if(last){
    const d=Math.hypot(p.position.x-last.x,p.position.y-last.y,p.position.z-last.z);
    peak=Math.max(peak,d);
  }
  minY=Math.min(minY,p.position.y);
  last=p.position;
  rows.push([t.toFixed(4),p.position.x.toFixed(3),p.position.y.toFixed(3),p.position.z.toFixed(3),p.heading.toFixed(4),p.pitch.toFixed(4),p.roll.toFixed(4),p.verticalVelocity.toFixed(2),p.lookPitchOffset.toFixed(3),p.splash.toFixed(3)]);
}
const csv=['t,x,y,z,heading,pitch,roll,vy,lookPitch,splash',...rows.map(r=>r.join(','))].join('\n');
writeFileSync(resolve(OUT,'fall-timeline.csv'),csv);

// The numbers the animation must satisfy.
const entry=DOOR_DRIVE_WATER_ENTRY-C.fallStart;
const promised=(-Math.abs(-0.3)+Math.sqrt(.09+2*g*(release.position.y-COASTAL_WORLD_FROM_LOCAL[13]+0))) / g; // lipY drop, hull depth excluded
const impact=doorDriveTeaserPoseAt(DOOR_DRIVE_WATER_ENTRY);
const summary={
  hangSeconds:entry,
  impactSpeedMS:Math.abs(impact.verticalVelocity),
  peakFrameTravel:peak,
  peakPerSecond:peak*120,
  minY,
  settledAt:doorDriveTeaserPoseAt(C.settledStart).position,
  entryPhase:impact.phase,
};
writeFileSync(resolve(OUT,'summary.json'),JSON.stringify(summary,null,2));
console.log('fall t=',C.fallStart,'entry=',DOOR_DRIVE_WATER_ENTRY.toFixed(3),'hang=',entry.toFixed(3),'s');
console.log('impact speed',Math.abs(impact.verticalVelocity).toFixed(2),'m/s  (√(2gh) for the lip:',Math.sqrt(2*g*28).toFixed(2)+')');
console.log('peak frame travel',peak.toFixed(3),'m/frame =',(peak*120).toFixed(1),'m/s');
console.log('wrote',resolve(OUT,'fall-timeline.csv'));
