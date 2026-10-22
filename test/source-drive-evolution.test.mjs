import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrive,stepDrive,saveDrive,restoreDrive} from '../src/game/source-drive/drive-state.js';
import {driveEvolutionFrame,stepDriveEvolution} from '../src/game/source-drive/evolution.js';
import {roadAt,worldAt} from '../src/game/source-drive/road.js';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame,serializeDriveWeather,restoreDriveWeather} from '../src/game/source-drive/weather.js';

function placed(d,far=d,lateral=-1.35){const s=createDrive(),r=roadAt(d),p=worldAt(d,lateral);Object.assign(s,{paused:false,x:p.x,z:p.z,heading:r.heading,furthest:far,roadOffset:lateral,roadHeight:r.height});return s;}
test('the ordinary baseline has weather and the warning, held water, thorax and aftermath remain distinct',()=>{
 const frames=[0,360,650,850,1100].map(d=>driveEvolutionFrame(placed(d)));
 assert.deepEqual(frames.map(f=>f.stage),['ordinary','weather-warning','held-water','thorax','after-image']);
 assert.ok(frames[0].weather.rain>.5);assert.ok(frames[0].wave===0&&frames[0].ribcage===0);
 assert.ok(frames[2].wave>.8&&frames[2].ribcage<.5);
 assert.ok(frames[3].ribcage>.99&&frames[4].ribcage>.99);
 assert.ok(frames.every(f=>f.weather.extinction>0&&f.weather.cloud>.7));
});
test('returning down the same road keeps the revealed wave and ribs instead of healing them',()=>{
 const outward=driveEvolutionFrame(placed(850)),s=placed(360,850);s.speed=-3;
 stepDriveEvolution(s,1);const returning=driveEvolutionFrame(s);
 assert.equal(returning.wave,outward.wave);assert.equal(returning.ribcage,outward.ribcage);
 assert.equal(returning.stage,'thorax');assert.equal(returning.mode,'returning');
 assert.equal(returning.backtrack,1);assert.equal(s.journey.returnMetres,3);
 assert.ok(returning.weather.rain>.8);
});
test('a turned-around forward-driving van is also returning; gear alone does not define intent',()=>{
 const s=placed(700,890);s.heading+=Math.PI;s.speed=4;stepDriveEvolution(s,.5);
 assert.equal(s.journey.mode,'returning');assert.ok(Math.abs(s.journey.returnMetres-2)<1e-8);
});
test('an hour-long held stop advances weather and programme time without forcing narrative progress or departure',()=>{
 const s=placed(850);s.brakeHold=true;const initial=driveEvolutionFrame(s);
 for(let i=0;i<3600;i++)stepDrive(s,1,{});
 const f=driveEvolutionFrame(s);assert.equal(f.stage,initial.stage);assert.equal(f.wave,initial.wave);assert.equal(f.ribcage,initial.ribcage);
 assert.equal(s.programTime,3600);assert.equal(s.journey.stationarySeconds,3600);
 assert.equal(s.arrived,false);assert.equal(s.finished,undefined);assert.equal(s.speed,0);
 assert.equal(f.rules.waitForcesDeparture,false);
});
test('the actual bay is a legal intentional pull-in, while leaving asphalt has physical edge feedback',()=>{
 const bay=placed(860,860,-4.6);bay.speed=1;stepDriveEvolution(bay,2);assert.equal(bay.journey.mode,'moving');assert.equal(bay.journey.edgeSeconds,0);
 const edge=placed(300,300,3.8);edge.speed=1;stepDriveEvolution(edge,2);assert.equal(edge.journey.mode,'edge');assert.equal(edge.journey.edgeSeconds,2);
 assert.equal(edge.finished,undefined);assert.equal(edge.x,worldAt(300,3.8).x,'no teleport or hidden steering correction');
});
test('pause and exact checkpoint restoration retain chosen waits, reverse history and the weather clock',()=>{
 const s=placed(680,890);s.speed=-2;stepDriveEvolution(s,3);s.speed=0;stepDriveEvolution(s,12);s.programTime=75;
 const before=structuredClone(s.journey);s.paused=true;stepDrive(s,20,{forward:true});assert.deepEqual(s.journey,before);assert.equal(s.programTime,75);
 const restored=restoreDrive(saveDrive(s));assert.deepEqual(restored.journey,before);assert.equal(restored.furthest,890);assert.equal(restored.z,s.z);
 assert.deepEqual(driveEvolutionFrame(restored),driveEvolutionFrame(s));
});
test('legacy checkpoints gain neutral observation history without losing their established reveal',()=>{
 const s=placed(650,850),old=JSON.parse(saveDrive(s));delete old.journey;const restored=restoreDrive(JSON.stringify(old));
 assert.equal(restored.journey.returnMetres,0);assert.equal(restored.furthest,850);assert.equal(driveEvolutionFrame(restored).ribcage,1);
});
test('wind, storm and shelter travel through actual weather checkpoints while pause freezes them',()=>{
 const s=placed(850),f=driveEvolutionFrame(s),w=createDriveWeather();
 stepDriveWeather(w,{dt:1,timeSec:12,...f.weather,wipers:true});const restored=restoreDriveWeather(serializeDriveWeather(w));
 assert.deepEqual(driveWeatherFrame(restored).wind,f.weather.wind);assert.equal(restored.cloud,f.weather.cloud);
 const before=serializeDriveWeather(restored);stepDriveWeather(restored,{dt:1,timeSec:13,paused:true,rain:0,wind:[0,0]});assert.equal(serializeDriveWeather(restored),before);
});
test('bridge shelter depends on actual position, even after the rest of the journey has changed',()=>{
 const under=driveEvolutionFrame(placed(540,1000)),outside=driveEvolutionFrame(placed(590,1000));
 assert.equal(under.weather.shelter,1);assert.equal(outside.weather.shelter,0);assert.equal(under.wave,outside.wave);
 const a=createDriveWeather({initialWetness:0}),b=createDriveWeather({initialWetness:0});
 for(let i=0;i<600;i++){stepDriveWeather(a,{dt:1/60,...under.weather,wipers:false});stepDriveWeather(b,{dt:1/60,...outside.weather,wipers:false});}
 assert.ok(a.grid[0]<b.grid[0]*.3,'the upper deck reduces fresh glass deposition; existing film is retained');
});
