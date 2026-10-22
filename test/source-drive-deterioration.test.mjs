import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {driveLoadAt,DRIVE_LOAD_FIELD} from '../src/game/source-drive/deterioration.js';
import {driveEvolutionFrame} from '../src/game/source-drive/evolution.js';
import {ribPose,heldWavePose} from '../src/game/source-drive/cut/landscape-motion.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {worldAt,roadAt} from '../src/game/source-drive/road.js';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame,serializeDriveWeather,restoreDriveWeather} from '../src/game/source-drive/weather.js';
function state(d,far=d,t=15){const s=createDrive(),p=worldAt(d,-1.35);return Object.assign(s,{x:p.x,z:p.z,furthest:far,heading:roadAt(d).heading,programTime:t});}
test('one pressure front reaches wave and vault at the actual travel delay, independent of mesh ID',()=>{
 for(let t=0;t<180;t+=.317){const a=driveLoadAt({timeSec:t,distance:640,furthest:900}),b=driveLoadAt({timeSec:t+(861-640)*DRIVE_LOAD_FIELD.secondsPerMetre,distance:861,furthest:900});
  for(const k of ['value','release','innerValue','innerRelease'])assert.ok(Math.abs(a[k]-b[k])<1e-12,k);assert.equal(a.phase,b.phase);
  const p=ribPose({timeSec:t,distance:861,furthest:900,id:'vault'}),q=ribPose({timeSec:t,distance:861,furthest:900,id:'unrelated-mesh-name'});assert.deepEqual(p.morphs,q.morphs);
 }
});
test('water, anatomy and aftermath overlap on the finite road; no one-frame biome switch',()=>{
 const middle=driveLoadAt({timeSec:10,distance:720,furthest:850}),late=driveLoadAt({timeSec:10,distance:1010,furthest:1120});assert.ok(middle.water>.9&&middle.anatomy>.4);assert.ok(late.water>.5&&late.anatomy>.5&&late.aftermath>.2);
 for(const d of [300,570,600,610,680,785,800,920,930,950,955,970,1100,1134,1175,1200]){const a=driveLoadAt({timeSec:10,distance:d-.001,furthest:d-.001}),b=driveLoadAt({timeSec:10,distance:d+.001,furthest:d+.001});for(const k of ['water','anatomy','aftermath','squall'])assert.ok(Math.abs(a[k]-b[k])<.0002,k);}
});
test('both macro forms remain revealed through stationary efforts and exact returning state',()=>{
 for(let t=0;t<180;t+=.31){const e=driveEvolutionFrame(state(640,900,t));assert.equal(e.wave,1);assert.equal(e.ribcage,1);assert.equal(ribPose({timeSec:t,furthest:900,evolution:e}).morphs.breath,1);assert.equal(heldWavePose({timeSec:t,furthest:900,evolution:e}).morphs.breath,1);}
});
test('rain, air and tissue receive the same saved load instead of independent weather oscillators',()=>{
 const s=state(790,900,15),e=driveEvolutionFrame(s),w=createDriveWeather();stepDriveWeather(w,{dt:.5,timeSec:15,...e.weather,wipers:true});const frame=driveWeatherFrame(restoreDriveWeather(serializeDriveWeather(w)));
 assert.deepEqual(frame.load,e.weather.load);assert.equal(frame.load.value,e.load.value);assert.equal(frame.load.squall,e.load.squall);
 assert.equal(ribPose({timeSec:15,furthest:900,distance:e.currentDistance,evolution:e}).motion.load.value,e.load.value);
 const before=serializeDriveWeather(w);stepDriveWeather(w,{dt:60,timeSec:75,paused:true,...driveEvolutionFrame(state(790,900,75)).weather});assert.equal(serializeDriveWeather(w),before);
});
test('pressure and delayed slip are finite, continuous, deterministic and have bounded derivative',()=>{
 let largest=0;for(let t=0;t<190;t+=.019){const a=driveLoadAt({timeSec:t,distance:850,furthest:950}),b=driveLoadAt({timeSec:t+.001,distance:850,furthest:950});assert.deepEqual(a,driveLoadAt(JSON.parse(JSON.stringify({timeSec:t,distance:850,furthest:950}))));
  for(const k of ['value','release','innerValue','squall','water','anatomy','aftermath']){assert.ok(a[k]>=0&&a[k]<=1);largest=Math.max(largest,Math.abs(a[k]-b[k]));}assert.ok(Number.isFinite(a.velocity)&&Math.abs(a.velocity)<2);}
 assert.ok(largest<.004);
});
test('study and production share the exact pressure model',async()=>{assert.equal(await readFile('src/game/source-drive/deterioration.js','utf8'),await readFile('artifacts/source-drive-study/deterioration.js','utf8'));});
